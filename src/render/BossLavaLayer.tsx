// src/render/BossLavaLayer.tsx
import React from "react";
import { Group, Path, Skia } from "@shopify/react-native-skia";

type Props = {
  width: number;
  height: number;   // band height in px
  y: number;        // screen Y (top of band)
  timeMs?: number;  // animation time in milliseconds
};

/**
 * Animated lava layer optimized for boss room.
 * Uses the same wavy animation as HazardBand but optimized for static positioning.
 */
export default function BossLavaLayer({ width, height, y, timeMs = 0 }: Props) {
  // Create animated wavy path for the lava surface
  const createWavyPath = (waveOffset = 0) => {
    const path = Skia.Path.Make();
    const waveHeight = 18; // Smaller waves for subtler effect
    const waveFreq = 0.012; // Slightly slower waves
    const time = (timeMs || 0) * 0.0015 + waveOffset; // Slower animation
    
    // Start from top-left
    path.moveTo(0, y + waveHeight);
    
    // Create flowing wavy top edge
    for (let x = 0; x <= width; x += 4) { // Larger steps for better performance
      const wave1 = Math.sin(x * waveFreq + time) * waveHeight * 0.6;
      const wave2 = Math.sin(x * waveFreq * 2.7 + time * 1.3) * waveHeight * 0.3;
      const wave3 = Math.sin(x * waveFreq * 4.1 + time * 0.8) * waveHeight * 0.1;
      const yOffset = y + wave1 + wave2 + wave3 + waveHeight;
      path.lineTo(x, yOffset);
    }
    
    // Complete the rectangle
    path.lineTo(width, y + height);
    path.lineTo(0, y + height);
    path.close();
    
    return path;
  };

  // Create wave paths with memoization handled by parent re-renders
  const basePath = createWavyPath(0);
  const layer1Path = createWavyPath(0.2);
  const layer2Path = createWavyPath(0.4);

  // Lava color layers (brightest to darkest)
  const lavaLayers = [
    { color: '#FFFF44', opacity: 0.9, path: basePath },    // Bright yellow base
    { color: '#FFAA00', opacity: 0.7, path: layer1Path },  // Orange overlay
    { color: '#FF4400', opacity: 0.5, path: layer2Path },  // Red-orange highlights
  ];

  return (
    <Group>
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
    </Group>
  );
}
