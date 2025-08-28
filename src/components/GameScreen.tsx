import React, { useState } from 'react';
import { StyleSheet, View, Pressable, Text, Dimensions } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { DashCharacter } from './DashCharacter';
import { PrefabNode } from '../render/PrefabNode';
import type { MapName, AnimationState } from '../types';
import type { LevelData } from '../content/levels';

const { width, height } = Dimensions.get('window');

interface GameScreenProps {
  levelData: LevelData;
  onBack: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({ levelData, onBack }) => {
  const [animationState, setAnimationState] = useState<AnimationState>('idle');

  const cycleAnimation = () => {
    const states: AnimationState[] = ['idle', 'walk', 'run', 'jump', 'crouch-idle', 'crouch-walk', 'hurt', 'death'];
    const currentIndex = states.indexOf(animationState);
    const nextIndex = (currentIndex + 1) % states.length;
    setAnimationState(states[nextIndex]);
  };

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        {/* Render all platforms */}
        {levelData.platforms.map((platform, index) => (
          <PrefabNode
            key={`platform-${index}`}
            map={levelData.mapName}
            name={platform.prefab}
            x={platform.x}
            y={platform.y}
            scale={platform.scale || 2}
          />
        ))}
        
        {/* Render character at spawn position */}
        <DashCharacter
          x={levelData.characterSpawn.x}
          y={levelData.characterSpawn.y}
          scale={2}
          animationState={animationState}
        />
      </Canvas>
      
      {/* Controls */}
      <View style={styles.controls}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        
        <Pressable style={styles.animationButton} onPress={cycleAnimation}>
          <Text style={styles.animationButtonText}>
            Animation: {animationState}
          </Text>
        </Pressable>
      </View>
      
      {/* Map info */}
      <View style={styles.mapInfo}>
        <Text style={styles.mapInfoText}>
          Map: {levelData.map.charAt(0).toUpperCase() + levelData.map.slice(1)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#87CEEB',
  },
  canvas: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
    borderRadius: 8,
    minWidth: 100,
  },
  backButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 14,
  },
  animationButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
    borderRadius: 8,
    minWidth: 150,
  },
  animationButtonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 12,
  },
  mapInfo: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  mapInfoText: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    padding: 8,
    borderRadius: 6,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
