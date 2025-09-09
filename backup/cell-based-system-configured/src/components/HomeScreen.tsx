import React, { useState } from 'react';
import { StyleSheet, View, Text, Pressable, Dimensions, Image } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { PrefabNode } from '../render/PrefabNode';
import type { MapName } from '../content/maps';

const { width, height } = Dimensions.get('window');

interface HomeScreenProps {
  onMapSelect: (map: MapName) => void;
  onPlay: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onMapSelect, onPlay }) => {
  const [selectedMap, setSelectedMap] = useState<MapName | null>(null);

  const maps: { name: MapName; displayName: string; color: string }[] = [
    { name: 'dark', displayName: 'Dark', color: '#2C2C2C' },
    { name: 'desert', displayName: 'Desert', color: '#D2B48C' },
    { name: 'dungeon', displayName: 'Dungeon', color: '#8B4513' },
    { name: 'frozen', displayName: 'Frozen', color: '#B0E0E6' },
    { name: 'grassy', displayName: 'Grassy', color: '#90EE90' },
  ];

  const handleMapSelect = (map: MapName) => {
    setSelectedMap(map);
    onMapSelect(map);
  };

  const handlePlay = () => {
    if (selectedMap) {
      onPlay();
    }
  };

  return (
    <View style={styles.container}>
      {/* Background image */}
      <Image 
        source={require('../../assets/background.png')} 
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      
      <View style={styles.content}>
        <Text style={styles.title}>Reach!</Text>
        <Text style={styles.subtitle}>Select a Map</Text>
        
        <View style={styles.mapGrid}>
          {maps.map((map) => (
            <Pressable
              key={map.name}
              style={[
                styles.mapButton,
                { backgroundColor: map.color },
                selectedMap === map.name && styles.selectedMapButton
              ]}
              onPress={() => handleMapSelect(map.name)}
            >
              <Text style={[
                styles.mapButtonText,
                selectedMap === map.name && styles.selectedMapButtonText
              ]}>
                {map.displayName}
              </Text>
            </Pressable>
          ))}
        </View>
        
        <Pressable
          style={[
            styles.playButton,
            !selectedMap && styles.disabledButton
          ]}
          onPress={handlePlay}
          disabled={!selectedMap}
        >
          <Text style={[
            styles.playButtonText,
            !selectedMap && styles.disabledButtonText
          ]}>
            {selectedMap ? 'Play' : 'Select a Map'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2C2C2C',
    marginBottom: 10,
    textShadowColor: 'rgba(255, 255, 255, 0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 24,
    color: '#2C2C2C',
    marginBottom: 40,
    fontWeight: '600',
  },
  mapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 30,
    gap: 8,
  },
  mapButton: {
    width: 80,
    height: 50,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 3,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  selectedMapButton: {
    borderColor: '#FFD700',
    transform: [{ scale: 1.05 }],
  },
  mapButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  selectedMapButtonText: {
    color: '#FFD700',
    textShadowColor: 'rgba(0, 0, 0, 1)',
  },
  playButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  disabledButton: {
    backgroundColor: '#CCCCCC',
  },
  playButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  disabledButtonText: {
    color: '#666666',
  },
});
