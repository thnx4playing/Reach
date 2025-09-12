import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Canvas, Image, useImage, Group, rect } from '@shopify/react-native-skia';

// Debug component to find exact coordinates
export const HealthBarDebugger: React.FC = () => {
  const [currentSegment, setCurrentSegment] = useState(0);
  const [yOffset, setYOffset] = useState(0);
  const [segmentHeight, setSegmentHeight] = useState(20);
  
  const healthBarImage = useImage(require('../../assets/ui/hp_bar.png'));
  
  if (!healthBarImage) {
    return <Text>Loading health bar image...</Text>;
  }

  const imageWidth = healthBarImage.width();
  const imageHeight = healthBarImage.height();
  
  console.log(`Health bar image dimensions: ${imageWidth}x${imageHeight}`);
  console.log(`Auto-calculated segment height: ${imageHeight / 6}`);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Health Bar Debugger</Text>
      <Text>Image Size: {imageWidth}x{imageHeight}</Text>
      <Text>Current Segment: {currentSegment}</Text>
      <Text>Y Offset: {yOffset}</Text>
      <Text>Segment Height: {segmentHeight}</Text>
      
      {/* Show the current segment */}
      <Canvas style={{ width: 200, height: 40, backgroundColor: '#000' }}>
        <Group clip={rect(0, 0, 200, 40)}>
          <Image
            image={healthBarImage}
            x={0}
            y={-yOffset}
            width={200}
            height={(imageHeight / imageWidth) * 200}
          />
        </Group>
      </Canvas>
      
      {/* Controls */}
      <View style={styles.controls}>
        <Text>Segment (0-5):</Text>
        <View style={styles.buttonRow}>
          {[0, 1, 2, 3, 4, 5].map((seg) => (
            <TouchableOpacity
              key={seg}
              style={[styles.button, currentSegment === seg && styles.activeButton]}
              onPress={() => {
                setCurrentSegment(seg);
                setYOffset(seg * segmentHeight);
              }}
            >
              <Text style={styles.buttonText}>{seg}</Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <Text>Fine-tune Y Offset:</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setYOffset(yOffset - 1)}
          >
            <Text style={styles.buttonText}>-1</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setYOffset(yOffset + 1)}
          >
            <Text style={styles.buttonText}>+1</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setYOffset(yOffset - 5)}
          >
            <Text style={styles.buttonText}>-5</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setYOffset(yOffset + 5)}
          >
            <Text style={styles.buttonText}>+5</Text>
          </TouchableOpacity>
        </View>
        
        <Text>Adjust Segment Height:</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setSegmentHeight(segmentHeight - 1)}
          >
            <Text style={styles.buttonText}>H-1</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => setSegmentHeight(segmentHeight + 1)}
          >
            <Text style={styles.buttonText}>H+1</Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity
          style={[styles.button, styles.resetButton]}
          onPress={() => {
            setYOffset(0);
            setSegmentHeight(Math.floor(imageHeight / 6));
            setCurrentSegment(0);
          }}
        >
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </View>
      
      {/* Show the calculated values for copy-paste */}
      <View style={styles.output}>
        <Text style={styles.outputTitle}>Copy these values when it looks right:</Text>
        <Text>Segment Heights: {segmentHeight}</Text>
        <Text>Y Offsets for each segment:</Text>
        {[0, 1, 2, 3, 4, 5].map((seg) => (
          <Text key={seg}>  Segment {seg}: {seg * segmentHeight}</Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 400, // Fixed height so it doesn't cover game controls
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)', // Semi-transparent white
    zIndex: 10000, // Ensure it's above everything
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  controls: {
    marginTop: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 8,
    margin: 2,
    borderRadius: 4,
    minWidth: 40,
    alignItems: 'center',
  },
  activeButton: {
    backgroundColor: '#FF3B30',
  },
  resetButton: {
    backgroundColor: '#34C759',
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  output: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  outputTitle: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
});

export default HealthBarDebugger;
