import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MAPS } from '../content/maps';

// Add this component temporarily to debug your tileset structure
export const TilesetDebugger: React.FC = () => {
  if (!__DEV__) return null;

  const grassyDef = MAPS.grassy;
  const floorPrefab = grassyDef.prefabs?.prefabs?.['floor-final'];
  
  console.log('=== GRASSY TILESET DEBUG ===');
  console.log('Image source:', typeof grassyDef.image);
  console.log('Meta:', grassyDef.prefabs?.meta);
  console.log('Floor prefab structure:', JSON.stringify(floorPrefab, null, 2));
  
  // Log first few prefabs to understand structure
  const prefabNames = Object.keys(grassyDef.prefabs?.prefabs || {}).slice(0, 5);
  prefabNames.forEach(name => {
    const prefab = grassyDef.prefabs?.prefabs?.[name];
    console.log(`Prefab "${name}":`, JSON.stringify(prefab, null, 2));
  });

  return (
    <View style={styles.debugContainer}>
      <Text style={styles.debugTitle}>Tileset Debug</Text>
      <Text style={styles.debugText}>Check console for detailed structure</Text>
      <Text style={styles.debugText}>Image type: {typeof grassyDef.image}</Text>
      <Text style={styles.debugText}>Tile size: {grassyDef.prefabs?.meta?.tileSize}</Text>
      <Text style={styles.debugText}>Prefab count: {Object.keys(grassyDef.prefabs?.prefabs || {}).length}</Text>
      
      {floorPrefab && (
        <View>
          <Text style={styles.debugText}>Floor-final rects:</Text>
          {floorPrefab.rects?.map((row, rowIdx) => (
            <Text key={rowIdx} style={styles.debugText}>
              Row {rowIdx}: {row.map(r => r ? `(${r.x},${r.y},${r.w}x${r.h})` : 'null').join(' ')}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  debugContainer: {
    position: 'absolute',
    top: 200,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 8,
    borderRadius: 4,
    maxWidth: 300,
    zIndex: 1001,
  },
  debugTitle: {
    color: 'yellow',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  debugText: {
    color: 'white',
    fontSize: 9,
    fontFamily: 'monospace',
    marginBottom: 1,
  },
});
