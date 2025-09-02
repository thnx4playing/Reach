import React, { useRef, useState } from 'react';
import { View, StyleSheet, PanResponder } from 'react-native';

type Output = { dirX: -1 | 0 | 1; magX: number };
type Props = {
  size?: number;
  knobRatio?: number;
  deadzone?: number;
  runThreshold?: number;
  onChange?: (o: Output) => void;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export default React.memo(function CirclePad({
  size = 150,
  knobRatio = 0.38,
  deadzone = 0.10,
  runThreshold = 0.45,
  onChange,
}: Props) {
  const radius = size * 0.5;
  const knobSize = Math.max(18, Math.round(size * knobRatio));
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const magXRef = useRef(0);
  const knobPosRef = useRef({ x: 0, y: 0 });

  const smoothMagX = (raw: number) => {
    const alpha = 0.3; // Increased for more responsive movement
    magXRef.current = magXRef.current * (1 - alpha) + raw * alpha;
    return magXRef.current;
  };

  const smoothKnobPosition = (targetX: number, targetY: number) => {
    const alpha = 0.4; // Smoother visual movement
    knobPosRef.current.x = knobPosRef.current.x * (1 - alpha) + targetX * alpha;
    knobPosRef.current.y = knobPosRef.current.y * (1 - alpha) + targetY * alpha;
    setKnob({ x: knobPosRef.current.x, y: knobPosRef.current.y });
  };

  const setFromXY = (x: number, y: number) => {
    const dx = x - radius;
    const dy = y - radius;
    let nx = clamp(dx / radius, -1, 1);
    let ny = clamp(dy / radius, -1, 1);
    const len = Math.hypot(nx, ny);
    if (len > 1) { nx /= len; ny /= len; }

    // Use smoothed position for visual knob
    smoothKnobPosition(nx, ny);

    // Apply smoothing to the raw input for movement
    let sm = smoothMagX(nx);
    const abs = Math.abs(sm);
    
    // More generous deadzone to prevent jitter
    const dead = Math.max(0.05, deadzone);
    const run  = Math.max(dead + 0.15, runThreshold);

    // Apply deadzone and speed bands
    if (abs < dead) {
      sm = 0;
    } else if (abs < run) {
      // Walk speed - more gradual
      sm = Math.sign(sm) * Math.min(0.5, (abs - dead) / (run - dead) * 0.5);
    } else {
      // Run speed - full speed
      sm = Math.sign(sm) * Math.min(1.0, 0.5 + (abs - run) / (1.0 - run) * 0.5);
    }

    const dirX: -1 | 0 | 1 = Math.abs(sm) < 0.05 ? 0 : (sm < 0 ? -1 : 1);
    onChange?.({ dirX, magX: Math.abs(sm) });
  };

  const reset = () => {
    knobPosRef.current = { x: 0, y: 0 };
    setKnob({ x: 0, y: 0 });
    onChange?.({ dirX: 0, magX: 0 });
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (e) => {
      // Only capture touches that start within the circle pad bounds
      const { locationX, locationY } = e.nativeEvent;
      const dx = locationX - radius;
      const dy = locationY - radius;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= radius;
    },
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      try {
        const { locationX, locationY } = e.nativeEvent;
        setFromXY(locationX, locationY);
        if (__DEV__) console.log('[CirclePad] start', locationX, locationY);
      } catch (error) {
        if (__DEV__) console.error('[CirclePad] Error:', error);
      }
    },
    onPanResponderMove: (e) => {
      try {
        const { locationX, locationY } = e.nativeEvent;
        setFromXY(locationX, locationY);
      } catch (error) {
        if (__DEV__) console.error('[CirclePad] Error:', error);
      }
    },
    onPanResponderRelease: () => {
      try {
        reset();
        if (__DEV__) console.log('[CirclePad] release');
      } catch (error) {
        if (__DEV__) console.error('[CirclePad] Error:', error);
      }
    },
    onPanResponderTerminate: () => {
      try {
        reset();
        if (__DEV__) console.log('[CirclePad] terminate');
      } catch (error) {
        if (__DEV__) console.error('[CirclePad] Error:', error);
      }
    },
    onPanResponderTerminationRequest: () => true,
  });

  const knobLeft = radius + knob.x * radius - knobSize / 2;
  const knobTop  = radius + knob.y * radius - knobSize / 2;

  return (
    <View
      {...panResponder.panHandlers}
      style={[styles.wrap, { width: size, height: size, borderRadius: radius }]}
    >
      {/* Only show the small knob; no outer ring */}
      <View
        style={[
          styles.knob,
          { width: knobSize, height: knobSize, borderRadius: knobSize / 2, left: knobLeft, top: knobTop }
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 20,
    bottom: 20,
    backgroundColor: 'transparent',
    borderWidth: 0, // no ring
  },
  knob: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
});