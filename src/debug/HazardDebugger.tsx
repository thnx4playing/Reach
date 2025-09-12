import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface HazardDebuggerProps {
  playerWorldY: number;
  hazardWorldY: number | null;
  hazardScreenY: number | null;
  highestPoint: number;
  cameraY: number;
  hasCrossedFirstBand: boolean;
}

export const HazardDebugger: React.FC<HazardDebuggerProps> = ({
  playerWorldY,
  hazardWorldY,
  hazardScreenY,
  highestPoint,
  cameraY,
  hasCrossedFirstBand
}) => {
  if (!__DEV__) return null;

  const distanceToHazard = hazardWorldY ? Math.round(playerWorldY - hazardWorldY) : null;
  
  return (
    <View style={styles.debugOverlay}>
      <Text style={styles.debugTitle}>Hazard System Debug</Text>
      <Text style={styles.debugText}>First Band: {hasCrossedFirstBand ? 'YES' : 'NO'}</Text>
      <Text style={styles.debugText}>Player World Y: {Math.round(playerWorldY)}</Text>
      <Text style={styles.debugText}>Highest Point: {Math.round(highestPoint)}</Text>
      <Text style={styles.debugText}>Camera Y: {Math.round(cameraY)}</Text>
      
      {hazardWorldY ? (
        <>
          <Text style={styles.debugText}>Hazard World Y: {Math.round(hazardWorldY)}</Text>
          <Text style={styles.debugText}>Hazard Screen Y: {hazardScreenY ? Math.round(hazardScreenY) : 'null'}</Text>
          <Text style={styles.debugText}>Distance to Hazard: {distanceToHazard}px</Text>
          <Text style={[styles.debugText, { color: distanceToHazard && distanceToHazard < 100 ? 'red' : 'white' }]}>
            Status: {distanceToHazard && distanceToHazard < 0 ? 'DANGER!' : 'Safe'}
          </Text>
        </>
      ) : (
        <Text style={styles.debugText}>No Hazard Active</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  debugOverlay: {
    position: 'absolute',
    top: 250,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 8,
    borderRadius: 4,
    maxWidth: 250,
    zIndex: 1002,
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
});
