import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';

type Props = { onJump: () => void; size?: number };

export default React.memo(function JumpButton({ onJump, size = 150 }: Props) {
  const inner = Math.round(size * 0.38);

  const handlePress = () => {
    try {
      if (__DEV__) console.log('[JumpButton] onPress');
      if (onJump && typeof onJump === 'function') {
        onJump();
      } else {
        if (__DEV__) console.error('[JumpButton] onJump is not a function:', typeof onJump);
      }
    } catch (error) {
      if (__DEV__) console.error('[JumpButton] Error:', error);
    }
  };

  return (
    <Pressable
      onPressIn={handlePress}
      style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}
      hitSlop={12}
    >
      <View
        style={[
          styles.inner,
          { width: inner, height: inner, borderRadius: inner / 2 }
        ]}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    // no ring / border
    borderWidth: 0,
  },
  inner: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
});