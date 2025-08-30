import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';

type Props = {
  onJump: () => void;
  size?: number; // overall diameter
};

export const JumpButton: React.FC<Props> = ({ onJump, size = 140 }) => {
  return (
    <Pressable
      onPressIn={onJump}
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <View style={styles.inner} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 22,
    right: 22,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inner: {
    width: '60%',
    height: '60%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.25)',
  },
});
