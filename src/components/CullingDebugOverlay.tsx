import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CullingDebugOverlayProps {
  totalPlatforms: number;
  totalDecorations: number;
  totalCulled: number;
  platformsCulled: number;
  decorationsCulled: number;
  fadedThisFrame: number;
  prunedThisFrame: number;
}

export const CullingDebugOverlay: React.FC<CullingDebugOverlayProps> = ({
  totalPlatforms,
  totalDecorations,
  totalCulled,
  platformsCulled,
  decorationsCulled,
  fadedThisFrame,
  prunedThisFrame
}) => {
  if (!__DEV__) return null;

  return (
    <View style={styles.debugOverlay}>
      <Text style={styles.debugTitle}>Culling Stats</Text>
      <Text style={styles.debugText}>Active: {totalPlatforms}P + {totalDecorations}D</Text>
      <Text style={styles.debugText}>Total Culled: {totalCulled}</Text>
      <Text style={styles.debugText}>├─ Platforms: {platformsCulled}</Text>
      <Text style={styles.debugText}>└─ Decorations: {decorationsCulled}</Text>
      
      {(fadedThisFrame > 0 || prunedThisFrame > 0) && (
        <>
          <Text style={styles.debugSeparator}>──────</Text>
          {fadedThisFrame > 0 && (
            <Text style={styles.debugActivity}>🔥 Fading: {fadedThisFrame}</Text>
          )}
          {prunedThisFrame > 0 && (
            <Text style={styles.debugActivity}>✂️ Pruned: {prunedThisFrame}</Text>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  debugOverlay: {
    position: 'absolute',
    top: 200, // Below challenge overlay
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 8,
    borderRadius: 4,
    minWidth: 150,
    zIndex: 1001,
    borderColor: '#ff6b35',
    borderWidth: 1,
  },
  debugTitle: {
    color: '#ff6b35',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  debugText: {
    color: 'white',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 1,
  },
  debugSeparator: {
    color: '#666',
    fontSize: 8,
    fontFamily: 'monospace',
    marginVertical: 2,
  },
  debugActivity: {
    color: '#4CAF50',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 1,
  },
});
