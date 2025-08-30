import React, { useMemo, useRef, useState } from 'react';
import { View, PanResponder, StyleSheet, GestureResponderEvent } from 'react-native';

type Output = {
  dirX: -1 | 0 | 1;           // left / none / right
  speed: 'idle' | 'walk' | 'run';
  crouch: boolean;            // down pressed
};

type Props = {
  size?: number;              // overall square size
  walkThreshold?: number;     // 0..1 where walk starts
  runThreshold?: number;      // 0..1 where run starts
  onChange?: (o: Output) => void;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const DPadPlus: React.FC<Props> = ({
  size = 128,
  walkThreshold = 0.35,
  runThreshold = 0.7,
  onChange,
}) => {
  const [state, setState] = useState<Output>({ dirX: 0, speed: 'idle', crouch: false });
  const active = useRef(false);
  const center = useMemo(() => ({ x: size / 2, y: size / 2 }), [size]);

  const compute = (e: GestureResponderEvent): Output => {
    const { locationX, locationY } = e.nativeEvent;
    const dx = locationX - center.x;
    const dy = locationY - center.y;
    // Normalize to [-1..1] based on the half-size
    const nx = clamp(dx / (size / 2), -1, 1);
    const ny = clamp(dy / (size / 2), -1, 1);

    // Choose dominant axis (plus-shaped behavior)
    if (Math.abs(nx) >= Math.abs(ny)) {
      // Horizontal: left/right walk or run
      const mag = Math.abs(nx);
      const dirX: -1 | 0 | 1 = nx > 0 ? 1 : nx < 0 ? -1 : 0;
      const speed =
        dirX === 0 || mag < walkThreshold ? 'idle'
        : mag < runThreshold ? 'walk'
        : 'run';
      return { dirX, speed, crouch: false };
    } else {
      // Vertical: down = crouch, up = reserved (idle)
      if (ny > 0.25) return { dirX: 0, speed: 'idle', crouch: true };
      return { dirX: 0, speed: 'idle', crouch: false }; // up does nothing
    }
  };

  const set = (o: Output) => {
    setState(o);
    onChange?.(o);
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => { active.current = true; set(compute(e)); },
    onPanResponderMove: (e) => { if (active.current) set(compute(e)); },
    onPanResponderRelease: () => { active.current = false; set({ dirX: 0, speed: 'idle', crouch: false }); },
    onPanResponderTerminate: () => { active.current = false; set({ dirX: 0, speed: 'idle', crouch: false }); },
  }), [size, walkThreshold, runThreshold]);

  return (
    <View style={[styles.root, { width: size, height: size }]} {...responder.panHandlers}>
      {/* Simple "+" visuals */}
      <View style={[styles.arm, { width: '60%', height: 10, left: '20%', top: '50%' }]} />
      <View style={[styles.arm, { width: 10, height: '60%', left: '50%', top: '20%' }]} />
      <View style={styles.knob} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 20,
    bottom: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arm: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2, borderColor: 'rgba(0,0,0,0.25)',
    borderRadius: 6,
  },
  knob: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: 2, borderColor: 'rgba(0,0,0,0.25)',
  },
});
