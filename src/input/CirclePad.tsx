import React, { useRef, useMemo, useState } from 'react';
import { View, PanResponder, StyleSheet } from 'react-native';

type Props = {
  size?: number;          // diameter
  knobRatio?: number;     // knob size as percent of size
  deadzone?: number;      // center deadzone (0..1)
  onChange?: (data: { dirX: -1|0|1; magX: number }) => void;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export const CirclePad: React.FC<Props> = ({
  size = 140,
  knobRatio = 0.38,
  deadzone = 0.02, // Much smaller deadzone for instant response
  onChange,
}) => {
  const radius = size * 0.5;
  const knobSize = size * clamp(knobRatio, 0.25, 0.6);
  const maxTravel = radius - knobSize * 0.5;

  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const last = useRef({ x: 0, y: 0 });
  const levelRef = useRef<'idle'|'walk'|'run'>('idle');

  // Hysteresis thresholds around center to stop bounce
  const WALK_IN = Math.max(0.05, deadzone + 0.01); // Very low threshold for instant walk
  const WALK_OUT = Math.max(0.03, deadzone - 0.01); // Very low threshold to stay walking
  const RUN_IN  = 0.35; // Lower threshold for running
  const RUN_OUT = 0.25; // Lower threshold to stay running

  const alpha = 0.15; // More aggressive smoothing to reduce jitter

  const normalize = (e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    const nx = (locationX - radius) / maxTravel;
    const ny = (locationY - radius) / maxTravel;
    const r = Math.hypot(nx, ny);
    if (r <= 1) return { nx, ny };
    const s = 1 / (r || 1);
    return { nx: nx * s, ny: ny * s };
  };

  const emit = (nx: number, ny: number) => {
    const mag = Math.hypot(nx, ny);
    const angle = Math.atan2(ny, nx);
    const cx = Math.cos(angle) * Math.min(1, mag); // normalized X [-1..1]

    // smoothing on X with deadzone
    const sx = alpha * cx + (1 - alpha) * last.current.x;
    
    // Apply deadzone to reduce micro-movements
    const deadzoneThreshold = 0.005; // Very small threshold for instant response
    const smoothedX = Math.abs(sx) < deadzoneThreshold ? 0 : sx;
    
    last.current = { x: smoothedX, y: 0 };

    const absX = Math.abs(smoothedX);

    // hysteresis for stable bands
    let level = levelRef.current;
    if (level === 'idle') {
      level = absX >= RUN_IN ? 'run' : (absX >= WALK_IN ? 'walk' : 'idle');
    } else if (level === 'walk') {
      level = absX >= RUN_IN ? 'run' : (absX <= WALK_OUT ? 'idle' : 'walk');
    } else {
      level = absX <= RUN_OUT ? 'walk' : 'run';
    }
    levelRef.current = level;

    const dirX: -1|0|1 = absX < WALK_OUT ? 0 : (smoothedX < 0 ? -1 : 1);
    const magX = absX; // 0..1

    onChange?.({ dirX, magX });
  };

  const reset = () => {
    setKnob({ x: 0, y: 0 });
    last.current = { x: 0, y: 0 };
    levelRef.current = 'idle';
    onChange?.({ dirX: 0, magX: 0 });
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { nx, ny } = normalize(e);
      setKnob({ x: nx, y: ny });
      emit(nx, ny);
    },
    onPanResponderMove: (e) => {
      const { nx, ny } = normalize(e);
      setKnob({ x: nx, y: ny });
      emit(nx, ny);
    },
    onPanResponderRelease: reset,
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: reset,
  }), [deadzone]);

  const knobLeft = radius + knob.x * maxTravel - knobSize / 2;
  const knobTop  = radius + knob.y * maxTravel - knobSize / 2;

  return (
    <View {...(responder as any).panHandlers} style={[styles.wrap, { width: size, height: size, borderRadius: radius }]}>
      {/* Inner circle - same size as jump button inner (60% of size) */}
      <View style={[styles.inner, { width: size * 0.6, height: size * 0.6, borderRadius: (size * 0.6) / 2 }]} />
    </View>
  );
};

export default CirclePad;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    bottom: 20,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
});
