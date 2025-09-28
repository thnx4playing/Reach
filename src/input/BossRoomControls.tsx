import React, { useRef, useState, useMemo } from 'react';
import { View, StyleSheet, LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

type PadOut = { dirX: -1 | 0 | 1; magX: number };
type Props = {
  size?: number;           // diameter of each control
  margin?: number;         // inset from edges
  onPad: (o: PadOut) => void;
  onJump: () => void;
  onAttack: () => void;    // NEW - attack button callback
  disabled?: boolean;      // disable controls during death animation
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export default React.memo(function BossRoomControls({
  size = 150,
  margin = 20,
  onPad,
  onJump,
  onAttack,
  disabled = false,
}: Props) {
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setLayout({ w: width, h: height });
  };

  const r = size * 0.5;
  const knobSize = Math.max(18, Math.round(size * 0.28));

  // centers of the three controls
  const centers = useMemo(() => {
    const y = Math.max(r + margin, layout.h - margin - r);
    const result = {
      pad:    { x: margin + r,                    y: y },
      jump:   { x: layout.w - margin - r,          y: y },
      attack: { x: layout.w - margin - r,          y: y - size * 0.8 }, // Higher up from jump button
    };
    return result;
  }, [layout, margin, r, size]);

  // ---- PAD STATE ----
  const [knob, setKnob] = useState({ x: 0, y: 0 }); // -1..1 from center
  const magXRef = useRef(0);

  // snappy near center for quick reversals, smoother at edges
  const smooth = (cur: number, target: number) => {
    const a = Math.abs(target) < 0.25 ? 0.50 : 0.25;
    return cur * (1 - a) + target * a;
  };

  const emitPadFromLocal = (x: number, y: number) => {
    // Skip input if controls are disabled
    if (disabled) return;
    
    // x,y are local to the PAD view (0..size)
    let nx = clamp((x - r) / r, -1, 1); // left/right
    let ny = clamp((y - r) / r, -1, 1); // only for knob visual
    const len = Math.hypot(nx, ny);
    if (len > 1) { nx /= len; ny /= len; }
    setKnob({ x: nx, y: ny });

    // tiny deadzone but linear ramp => immediate response at center
    const dead = 0.01;
    const ax = Math.abs(nx);
    let eff = 0;
    if (ax > dead) eff = Math.sign(nx) * ((ax - dead) / (1 - dead));

    magXRef.current = smooth(magXRef.current, eff);
    const out = magXRef.current;
    const dirX: -1 | 0 | 1 = Math.abs(out) < 0.05 ? 0 : (out < 0 ? -1 : 1);
    onPad({ dirX, magX: out });
  };

  const resetPad = () => {
    // Skip input if controls are disabled
    if (disabled) return;
    
    setKnob({ x: 0, y: 0 });
    magXRef.current = 0;
    onPad({ dirX: 0, magX: 0 });
  };

  // ---- GESTURES (non-overlapping touch areas) ----

  // PAD: single-finger pan, immediate start, read local e.x/e.y
  const padPan = Gesture.Pan()
    .maxPointers(1)               // one finger -> crisp reversals
    .minDistance(0)               // instant response at center
    .shouldCancelWhenOutside(false)
    .hitSlop(12)
    .onStart(e => { 'worklet'; runOnJS(emitPadFromLocal)(e.x, e.y); })
    .onChange(e => { 'worklet'; runOnJS(emitPadFromLocal)(e.x, e.y); })
    .onEnd(() => { 'worklet'; runOnJS(resetPad)(); })
    .onFinalize(() => { 'worklet'; runOnJS(resetPad)(); });

  const jumpTap = Gesture.Tap()
    .onStart(() => {
      'worklet';
      if (!disabled) runOnJS(onJump)();
    });

  const attackTap = Gesture.Tap()
    .onStart(() => {
      'worklet';
      if (!disabled) runOnJS(onAttack)();
    });


  const block = (x: number, y: number) => ({
    left: x - r,
    top: y - r,
  });

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="box-none">
      {/* PAD host (left) */}
      <View style={[styles.host, block(centers.pad.x, centers.pad.y)]} pointerEvents="auto">
        <GestureDetector gesture={padPan}>
          <View style={[styles.touchArea, { width: size, height: size, borderRadius: r }]}>
            {/* small inner dot only */}
            <View style={[
              styles.innerDot, 
              { 
                width: Math.round(size*0.38), 
                height: Math.round(size*0.38), 
                borderRadius: Math.round(size*0.19),
                opacity: disabled ? 0.3 : 1
              }
            ]} />
            {/* moving knob */}
            <View style={[
              styles.knob, 
              { 
                width: knobSize, 
                height: knobSize, 
                left: (centers.pad.x + knob.x * r) - (centers.pad.x - r) - knobSize / 2, 
                top: (centers.pad.y + knob.y * r) - (centers.pad.y - r) - knobSize / 2, 
                borderRadius: knobSize / 2,
                opacity: disabled ? 0.3 : 1
              }
            ]} />
          </View>
        </GestureDetector>
      </View>

      {/* JUMP host (right) */}
      <View style={[styles.host, block(centers.jump.x, centers.jump.y)]} pointerEvents="auto">
        <GestureDetector gesture={jumpTap}>
          <View style={[styles.touchArea, { width: size, height: size, borderRadius: r }]}>
            {/* small inner dot only */}
            <View style={[
              styles.innerDot, 
              { 
                width: Math.round(size*0.38), 
                height: Math.round(size*0.38), 
                borderRadius: Math.round(size*0.19),
                opacity: disabled ? 0.3 : 1
              }
            ]} />
          </View>
        </GestureDetector>
      </View>

      {/* ATTACK host (above jump) */}
      <View style={[styles.host, block(centers.attack.x, centers.attack.y)]} pointerEvents="auto">
        <GestureDetector gesture={attackTap}>
          <View style={[styles.touchArea, { width: size, height: size, borderRadius: r }]}>
            {/* Attack button with different styling */}
            <View style={[
              styles.attackButton, 
              { 
                width: Math.round(size*0.38), 
                height: Math.round(size*0.38), 
                borderRadius: Math.round(size*0.19),
                opacity: disabled ? 0.3 : 1
              }
            ]} />
          </View>
        </GestureDetector>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  host: { position: 'absolute' },
  touchArea: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  knob: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  innerDot: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
  attackButton: {
    backgroundColor: 'rgba(255,100,100,0.6)', // Red tint for attack
    borderWidth: 2,
    borderColor: 'rgba(255,0,0,0.4)',
  },
});
