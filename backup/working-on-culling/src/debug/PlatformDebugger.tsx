import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Canvas, Rect } from '@shopify/react-native-skia';

// Add this component to GameScreen to debug platform positioning
export const PlatformDebugger: React.FC<{ platforms: any[]; cameraY: number }> = ({ platforms, cameraY }) => {
  if (!__DEV__) return null;

  return (
    <View style={styles.debugOverlay}>
      <Text style={styles.debugTitle}>Platform Debug Info</Text>
      <Text style={styles.debugText}>Total Platforms: {platforms.length}</Text>
      <Text style={styles.debugText}>Camera Y: {Math.round(cameraY)}</Text>
      
      {/* Show first 5 platforms */}
      {platforms.slice(0, 5).map((platform, index) => (
        <View key={index} style={styles.platformInfo}>
          <Text style={styles.debugText}>
            {index}: {platform.prefab} at ({Math.round(platform.x)}, {Math.round(platform.y)})
          </Text>
        </View>
      ))}
    </View>
  );
};

// Add this to your GameScreen Canvas to show platform collision boxes
export const PlatformCollisionDebug: React.FC<{ platforms: any[]; scale: number; mapName: string }> = ({ 
  platforms, scale, mapName 
}) => {
  if (!__DEV__) return null;

  const { prefabWidthPx, prefabHeightPx } = require('../content/maps');

  return (
    <>
      {platforms.slice(0, 10).map((platform, index) => {
        const width = prefabWidthPx(mapName, platform.prefab, platform.scale || scale);
        const height = prefabHeightPx(mapName, platform.prefab, platform.scale || scale);
        
        return (
          <Rect
            key={`debug-platform-${index}`}
            x={platform.x}
            y={platform.y}
            width={width}
            height={height}
            color="rgba(255, 0, 0, 0.3)"
            style="fill"
          />
        );
      })}
    </>
  );
};

const styles = StyleSheet.create({
  debugOverlay: {
    position: 'absolute',
    top: 120,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 8,
    borderRadius: 4,
    maxHeight: 200,
    minWidth: 200,
    zIndex: 1000,
  },
  debugTitle: {
    color: 'yellow',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  debugText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  platformInfo: {
    marginBottom: 2,
  },
});
