import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, PanResponder, StyleSheet, GestureResponderEvent } from 'react-native';

type Output = {
  dirX: -1 | 0 | 1;                 // left / none / right
  magX: number;                     // 0..1 raw horizontal magnitude for smoothing
};

type Props = {
  size?: number;            // overall diameter (px)
  knobRatio?: number;       // inner knob size relative to outer (0..1)
  deadzone?: number;        // ignore small nudges
  runThreshold?: number;    // 0..1 start running (no walk threshold needed)
  onChange?: (o: Output) => void;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export const CirclePad: React.FC<Props> = ({
  size = 72,
  knobRatio = 0.42,
  deadzone = 0.25,      // Reduced to improve responsiveness
  runThreshold = 0.75,  // Much higher threshold - need to move pad significantly
  onChange,
}) => {
  const radius = size / 2;
  const knobSize = Math.max(18, size * knobRatio);
  const [knob, setKnob] = useState({ x: 0, y: 0 }); // normalized -1..1
  const active = useRef(false);
  const center = useMemo(() => ({ x: radius, y: radius }), [radius]);
  
  // Smoothing state
  const [smoothedMagX, setSmoothedMagX] = useState(0);
  const magXRef = useRef(0);

  const normalize = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent;
    const dx = locationX - center.x;
    const dy = locationY - center.y;
    let nx = clamp(dx / radius, -1, 1);
    let ny = clamp(dy / radius, -1, 1);
    const len = Math.hypot(nx, ny);
    if (len > 1) { nx /= len; ny /= len; }
    return { nx, ny };
  };

  // Smooth the magnitude using exponential moving average
  const smoothMagX = (rawMag: number) => {
    const alpha = 0.15; // Lower = more smoothing, higher = more responsive
    magXRef.current = magXRef.current * (1 - alpha) + rawMag * alpha;
    setSmoothedMagX(magXRef.current);
    return magXRef.current;
  };

  const compute = (nx: number, ny: number): Output => {
    const ax = Math.abs(nx);
    const r = Math.hypot(nx, ny);  // total distance from center
    const dz = deadzone;           // deadzone threshold
    
    // Apply deadzone to BOTH axes - if inside deadzone, return neutral
    if (r < dz) return { dirX: 0, magX: 0 };

    const dirX: -1 | 0 | 1 = nx < 0 ? -1 : 1;
    const rawMagX = ax;
    
    // Use smoothed magnitude for speed determination
    const smoothedMag = smoothMagX(rawMagX);
    
    return { dirX, magX: smoothedMag };
  };

  const setState = (nx: number, ny: number) => {
    setKnob({ x: nx, y: ny });
    onChange?.(compute(nx, ny));
  };

  const reset = () => {
    setKnob({ x: 0, y: 0 });
    magXRef.current = 0;
    setSmoothedMagX(0);
    onChange?.({ dirX: 0, magX: 0 });
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { active.current = true; const { nx, ny } = normalize(e); setState(nx, ny); },
    onPanResponderMove: (e) => { if (!active.current) return; const { nx, ny } = normalize(e); setState(nx, ny); },
    onPanResponderRelease: () => { active.current = false; reset(); },
    onPanResponderTerminate: () => { active.current = false; reset(); },
  }), [radius]);

  const knobLeft = center.x + knob.x * radius - knobSize / 2;
  const knobTop  = center.y + knob.y * radius - knobSize / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size, borderRadius: radius }]} {...responder.panHandlers}>
      <View style={[styles.knob, { width: knobSize, height: knobSize, borderRadius: knobSize / 2, left: knobLeft, top: knobTop }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    bottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  knob: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
});