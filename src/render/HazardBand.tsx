// src/render/HazardBand.tsx
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Canvas, Rect, LinearGradient, vec, Paint, Path, Skia } from "@shopify/react-native-skia";

type Props = {
  width: number;
  height: number;   // band height in px
  y: number;        // screen Y (top of band)
  opacity?: number; // 0..1
  timeMs?: number;  // animation time in milliseconds
};

/**
 * Animated lava hazard band with wavy top edge.
 * The wave itself uses lava gradient colors.
 */
export default function HazardBand({ width, height, y, opacity = 1, timeMs = 0 }: Props) {
  // Create animated wavy path for the lava surface
  const wavyPath = useMemo(() => {
    const path = Skia.Path.Make();
    const waveHeight = 25; // Slightly bigger waves for more dramatic effect
    const waveFreq = 0.015; // Slightly slower frequency for more fluid look
    const time = (timeMs || 0) * 0.002; // Slow, hypnotic animation
    
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
  }, [width, height, timeMs]);

  // Enhanced lava gradient colors
  const lavaColors = [
    '#FFFF00', // Bright yellow (hottest - top)
    '#FF8C00', // Dark orange
    '#FF4500', // Orange red
    '#DC143C', // Crimson
    '#8B0000', // Dark red
    '#4B0000', // Very dark red (bottom)
  ];

  const lavaPositions = [0, 0.15, 0.35, 0.6, 0.8, 1.0];

  // Animate gradient position for flowing effect
  const animatedPositions = useMemo(() => {
    const time = (timeMs || 0) * 0.0008; // Slow gradient animation
    const offset = Math.sin(time) * 0.08; // Subtle movement
    return lavaPositions.map(pos => Math.max(0, Math.min(1, pos + offset)));
  }, [timeMs]);

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
        {/* Single wavy lava surface with gradient */}
        <Path path={wavyPath}>
          <Paint>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(0, height)}
              colors={lavaColors}
              positions={animatedPositions}
            />
          </Paint>
        </Path>
      </Canvas>
    </View>
  );
}