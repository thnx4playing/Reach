// src/render/HazardBand.tsx
import React, { useMemo } from "react";
import { StyleSheet, View, Text } from "react-native";
import { Canvas, Paint, Path, Skia } from "@shopify/react-native-skia";

type Props = {
  width: number;
  height: number;   // band height in px
  y: number;        // screen Y (top of band)
  opacity?: number; // 0..1
  timeMs?: number;  // animation time in milliseconds
};

/**
 * Animated lava hazard band using layered solid colors to simulate gradient.
 * Fallback when Skia LinearGradient doesn't work.
 */
export default function HazardBand({ width, height, y, opacity = 1, timeMs = 0 }: Props) {
  // Create animated wavy path for the lava surface
  const createWavyPath = (waveOffset = 0) => {
    const path = Skia.Path.Make();
    const waveHeight = 25;
    const waveFreq = 0.015;
    const time = (timeMs || 0) * 0.002 + waveOffset;
    
    // Start from top-left
    path.moveTo(0, waveHeight);
    
    // Create flowing wavy top edge with multiple wave layers
    for (let x = 0; x <= width; x += 3) {
      const wave1 = Math.sin(x * waveFreq + time) * waveHeight * 0.6;
      const wave2 = Math.sin(x * waveFreq * 2.7 + time * 1.3) * waveHeight * 0.3;
      const wave3 = Math.sin(x * waveFreq * 4.1 + time * 0.8) * waveHeight * 0.1;
      const yOffset = wave1 + wave2 + wave3 + waveHeight;
      path.lineTo(x, yOffset);
    }
    
    // Complete the rectangle - fill everything below the waves
    path.lineTo(width, height);
    path.lineTo(0, height);
    path.close();
    
    return path;
  };

  // Create multiple wave paths for layering effect
  const paths = useMemo(() => ({
    base: createWavyPath(0),
    layer1: createWavyPath(0.2),
    layer2: createWavyPath(0.4),
    layer3: createWavyPath(0.6),
  }), [width, height, timeMs]);

  // Lava color layers (brightest to darkest)
  const lavaLayers = [
    { color: '#FFFF44', opacity: 1.0, path: paths.base },    // Bright yellow base
    { color: '#FFAA00', opacity: 0.8, path: paths.layer1 },  // Orange overlay
    { color: '#FF4400', opacity: 0.6, path: paths.layer2 },  // Red-orange
    { color: '#AA1100', opacity: 0.4, path: paths.layer3 },  // Dark red highlights
  ];


  return (
    <View style={{ 
      position: "absolute", 
      left: 0, 
      top: y, 
      width, 
      height, 
      zIndex: 10,
      opacity 
    }}>
      <Canvas style={{ width, height }}>
        {/* Layer solid colors to simulate gradient effect */}
        {lavaLayers.map((layer, index) => (
          <Path 
            key={index}
            path={layer.path} 
            color={layer.color}
            opacity={layer.opacity}
            style="fill"
          />
        ))}
        
      </Canvas>
      
    </View>
  );
}