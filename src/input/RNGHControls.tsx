import React, { useMemo, useRef, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

type PadOut = { dirX: -1 | 0 | 1; magX: number };
type Props = {
  size?: number;   // diameter of each control target
  margin?: number; // inset from edges
  onPad: (o: PadOut) => void;
  onJump: () => void;
};

// utils
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const inside = (x: number, y: number, cx: number, cy: number, r: number) => {
  'worklet';
  const dx = x - cx, dy = y - cy;
  return dx*dx + dy*dy <= r*r;
};

export default React.memo(function RNGHControls({
  size = 150,
  margin = 20,
  onPad,
  onJump,
}: Props) {
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ w: width, h: height });
  };

  const r = size * 0.5;
  const knobSize = Math.max(18, Math.round(size * 0.38));

  // visual state (pad knob)
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const magXRef = useRef(0);
  
  // shared values for zone detection (persist across worklet calls)
  const jumpZoneValid = useSharedValue(false);
  const padZoneValid = useSharedValue(false);

  const centers = useMemo(() => {
    const y = Math.max(r + margin, layout.h - margin - r);
    return {
      pad:  { x: margin + r,          y },
      jump: { x: layout.w - margin - r, y },
    };
  }, [layout, margin, r]);

  const emitPadFrom = (x: number, y: number) => {
    const { pad } = centers;
    let nx = clamp((x - pad.x) / r, -1, 1);
    let ny = clamp((y - pad.y) / r, -1, 1);
    const len = Math.hypot(nx, ny);
    if (len > 1) { nx /= len; ny /= len; }

    setKnob({ x: nx, y: ny });

    // light smoothing -> responsive but not jittery
    const alpha = 0.25;
    
    // Separate smoothing for magnitude and direction to prevent asymmetry
    const currentMag = Math.abs(magXRef.current);
    const currentDir = Math.sign(magXRef.current);
    const newMag = Math.abs(nx);
    const newDir = Math.sign(nx);
    
    // Smooth the magnitude
    const smoothedMag = currentMag * (1 - alpha) + newMag * alpha;
    
    // Use the new direction (prevents mixing positive/negative values)
    const finalMag = newDir !== 0 ? smoothedMag : 0;
    
    // Update the reference with the final value
    magXRef.current = newDir * finalMag;
    let sm = magXRef.current;

    const abs = Math.abs(sm);
    const dead = 0.06;
    const runT = 0.5;

    if (abs < dead) sm = 0;
    else if (abs < runT) sm = Math.sign(sm) * Math.min(0.6, abs * 0.6);
    else sm = Math.sign(sm) * Math.min(1.0, abs);

    const dirX: -1 | 0 | 1 = Math.abs(sm) < 0.08 ? 0 : (sm < 0 ? -1 : 1);
    onPad({ dirX, magX: Math.abs(sm) });
  };

  const resetPad = () => {
    setKnob({ x: 0, y: 0 });
    magXRef.current = 0;
    onPad({ dirX: 0, magX: 0 });
  };

  // ---- Tap (Jump) with zone-based activation ----
  const tap = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(1)
      .maxDuration(300)
      .maxDistance(30)
      .minPointers(1)
      .shouldCancelWhenOutside(false)
             .onTouchesDown((e) => {
         'worklet';
         const t = (e.changedTouches?.[0] ?? e.allTouches?.[0]) as any;
         const x = t?.x ?? 0, y = t?.y ?? 0;
         // Strict jump zone - must be clearly in jump area
         const jumpOk = inside(x, y, centers.jump.x, centers.jump.y, r * 1.2);
         // Also check that it's NOT in the pad area to prevent conflicts
         const padOk = inside(x, y, centers.pad.x, centers.pad.y, r * 1.2);
         // Only activate if clearly in jump zone and not in pad zone
         const ok = jumpOk && !padOk;
         jumpZoneValid.value = ok;
       })

             .onStart((e) => {
         'worklet';
         // Only jump if zone is valid AND it's a single finger tap
         if (jumpZoneValid.value && e.numberOfPointers === 1) {
           runOnJS(onJump)();
         }
       })
      .onTouchesCancelled(() => {
        'worklet';
        // Gesture cancelled - no action needed
      })
      .onEnd(() => {
        'worklet';
        // Gesture ended - no action needed
      })
             .onFinalize(() => {
         'worklet';
         // Reset zone validity when gesture finalizes
         jumpZoneValid.value = false;
       });
  }, [centers.jump.x, centers.jump.y, r, onJump, jumpZoneValid]);

  // ---- Pan (Pad) with zone-based activation ----
  const pan = useMemo(() => {
    return Gesture.Pan()
      .maxPointers(1)
      .minDistance(8)
      .minPointers(1)
      .shouldCancelWhenOutside(false)
             .onTouchesDown((e) => {
         'worklet';
         const t = (e.changedTouches?.[0] ?? e.allTouches?.[0]) as any;
         const x = t?.x ?? 0, y = t?.y ?? 0;
         // Strict pad zone - must be clearly in pad area
         const padOk = inside(x, y, centers.pad.x, centers.pad.y, r);
         // Also check that it's NOT in the jump area to prevent conflicts
         const jumpOk = inside(x, y, centers.jump.x, centers.jump.y, r * 1.2);
         
         // Check if this is a center press (within 15px of center)
         const dx = x - centers.pad.x;
         const dy = y - centers.pad.y;
         const distance = Math.sqrt(dx * dx + dy * dy);
         const isCenterPress = distance < 15;
         
         // Only activate if clearly in pad zone, not in jump zone, and NOT a center press
         const ok = padOk && !jumpOk && !isCenterPress;
         padZoneValid.value = ok;
       })

             .onStart((e) => {
         'worklet';
         if (padZoneValid.value) {
           const t = (e.changedTouches?.[0] ?? e.allTouches?.[0]) as any;
           const x = t?.x ?? 0, y = t?.y ?? 0;
           runOnJS(emitPadFrom)(x, y);
         }
       })
             .onChange((e) => {
         'worklet';
         // Check if the current position is far enough from center to emit movement
         const dx = e.x - centers.pad.x;
         const dy = e.y - centers.pad.y;
         const distance = Math.sqrt(dx * dx + dy * dy);
         // Only emit if moved at least 15px from center (prevents center press activation)
         if (distance >= 15) {
           // Also check if we're still in the pad zone (allows continued movement after jump)
           const padOk = inside(e.x, e.y, centers.pad.x, centers.pad.y, r);
           const jumpOk = inside(e.x, e.y, centers.jump.x, centers.jump.y, r * 1.2);
           if (padOk && !jumpOk) {
             runOnJS(emitPadFrom)(e.x, e.y);
           }
         }
       })
      .onEnd(() => {
        'worklet';
        // Gesture ended - no action needed
      })
      .onTouchesCancelled(() => {
        'worklet';
        // Gesture cancelled - no action needed
      })
             .onFinalize(() => {
         'worklet';
         // Reset zone validity when gesture finalizes
         padZoneValid.value = false;
         runOnJS(resetPad)();
       });
  }, [centers.pad.x, centers.pad.y, r, onPad, padZoneValid]);

  // Use separate gesture detectors to prevent touch registry conflicts
  // No combined gesture needed - we'll render two separate GestureDetectors

  // positions
  const knobLeft = centers.pad.x + knob.x * r - knobSize / 2;
  const knobTop  = centers.pad.y + knob.y * r - knobSize / 2;

  // only small inner dots; no outer rings
  const dot = (cx: number, cy: number) => ({
    left: cx - r, top: cy - r, width: size, height: size, borderRadius: r,
    justifyContent: 'center' as const, alignItems: 'center' as const,
  });

  // Use a single gesture detector with proper zone isolation
  const combined = useMemo(() => Gesture.Simultaneous(pan, tap), [pan, tap]);

  return (
    <GestureDetector gesture={combined}>
      <View onLayout={onLayout} style={StyleSheet.absoluteFill} pointerEvents="auto" collapsable={false}>
        {/* inner dot visuals only */}
        <View style={[styles.dot, dot(centers.pad.x, centers.pad.y)]}>
          <View style={styles.innerDot} />
        </View>
        <View style={[styles.dot, dot(centers.jump.x, centers.jump.y)]}>
          <View style={styles.innerDot} />
        </View>
        {/* moving knob */}
        <View style={[styles.knob, { width: knobSize, height: knobSize, left: knobLeft, top: knobTop, borderRadius: knobSize / 2 }]} />
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  gestureArea: {
    position: 'absolute',
    backgroundColor: 'transparent',
  },
  innerDot: {
    width: '38%',
    height: '38%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  knob: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
});
