import 'react-native-gesture-handler';
import 'react-native-reanimated';

import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HomeScreen } from './src/components/HomeScreen';
import { GameScreen } from './src/components/GameScreen';
import { LEVELS } from './src/content/levels';
import type { MapName, LevelData } from './src/content/levels';

type AppScreen = 'home' | 'game';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('home');
  const [selectedMap, setSelectedMap] = useState<MapName>('dark');
  const [currentLevel, setCurrentLevel] = useState<LevelData | null>(null);

  const handleMapSelect = (map: MapName) => {
    setSelectedMap(map);
  };

  const handlePlay = () => {
    if (selectedMap) {
      setCurrentLevel(LEVELS[selectedMap as keyof typeof LEVELS]);
      setCurrentScreen('game');
    }
  };

  const handleBack = () => {
    setCurrentScreen('home');
    setCurrentLevel(null);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {currentScreen === 'home' && (
          <SafeAreaView style={{ flex: 1 }}>
            <HomeScreen
              onMapSelect={handleMapSelect}
              onPlay={handlePlay}
            />
            <StatusBar style="auto" />
          </SafeAreaView>
        )}
        
        {currentScreen === 'game' && currentLevel && (
          <GameScreen
            levelData={currentLevel}
            onBack={handleBack}
          />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
