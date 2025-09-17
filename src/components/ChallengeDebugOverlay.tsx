import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ChallengeDebugOverlayProps {
  challengeLevel: string;
  bandsAtLevel: number;
  totalBands: number;
  playerHeight: number; // Current player Y position for reference
}

export const ChallengeDebugOverlay: React.FC<ChallengeDebugOverlayProps> = ({
  challengeLevel,
  bandsAtLevel,
  totalBands,
  playerHeight
}) => {
  if (!__DEV__) return null;

  return (
    <View style={styles.debugOverlay}>
      <Text style={styles.debugTitle}>Challenge System</Text>
      <Text style={styles.debugText}>Level: {challengeLevel}</Text>
      <Text style={styles.debugText}>Progress: {bandsAtLevel} screens</Text>
      <Text style={styles.debugText}>Total bands: {totalBands}</Text>
      <Text style={styles.debugText}>Height: {Math.round(playerHeight)}px</Text>
      
      <View style={styles.progressBar}>
        <View 
          style={[
            styles.progressFill,
            { width: `${Math.min(100, (bandsAtLevel / 10) * 100)}%` }
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  debugOverlay: {
    position: 'absolute',
    top: 120,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 8,
    borderRadius: 4,
    minWidth: 150,
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
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
});
