import React, { useMemo } from 'react';
import { Group, Image as SkImage, useImage, rect } from '@shopify/react-native-skia';
import type { ParallaxConfig } from '../content/parallaxConfig';

// --- Small deterministic PRNG so each tile can have stable variations ---
function rand01(seed: number) {
  // xorshift-ish; returns [0,1)
  let x = seed | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
const randRange = (seed: number, min: number, max: number) =>
  min + (max - min) * rand01(seed);

interface ParallaxBackgroundProps {
  variant: ParallaxConfig;
  cameraY: number;
  timeSec: number;
  viewport: { width: number; height: number };
  floorTopY?: number; // NEW: Floor position in world coordinates
  clipMaxY?: number;
}

export default function ParallaxBackground({
  variant,
  cameraY,
  timeSec,
  viewport,
  floorTopY,
  clipMaxY,
}: ParallaxBackgroundProps) {

  // Safety check for variant
  if (!variant || !variant.layers || !Array.isArray(variant.layers)) {
    return null;
  }
  
  const { width, height } = viewport;
  
  // Calculate floor position in screen coordinates
  const floorScreenY = floorTopY ? (floorTopY - cameraY) : (height * 0.8);
  
  // Create clip rect that respects both clipMaxY and floor position
  let finalClipMaxY = clipMaxY;
  if (floorTopY) {
    finalClipMaxY = finalClipMaxY 
      ? Math.min(finalClipMaxY, floorScreenY)
      : floorScreenY;
  }
  
  const clipRect = typeof finalClipMaxY === "number" 
    ? rect(0, 0, width, Math.max(0, finalClipMaxY)) 
    : undefined;

  return (
    <Group {...(clipRect ? { clip: clipRect } : {})}>
      {(variant?.layers || []).map((layer, layerIndex) => {
        if (!layer || !layer.src) return null;
        
        const image = useImage(layer.src);
        if (!image) return null;

        // Scale to viewport width
        if (!image || typeof (image as any).width !== 'function' || typeof (image as any).height !== 'function') return null;
        const iw = image.width();
        const ih = image.height();
        const scale = width / iw;
        const scaledHeight = ih * scale;

        // Parallax (positive cameraY goes down)
        const yOffset = -cameraY * (layer.vFactor ?? 0);
        const xDriftBase = (layer.hDrift ?? 0) * -timeSec; // drift left when positive

        // SKY (idx 0) + CLOUDS (idx 1): tile in X and Y infinitely
        if (layerIndex <= 1) {
          const tilesY = Math.ceil(height / scaledHeight) + 2;
          const baseY = ((yOffset % scaledHeight) + scaledHeight) % scaledHeight - scaledHeight;
          // Wrap the base drift so we never accumulate huge coordinates
          const baseX = ((xDriftBase % width) + width) % width - width;
          // PERFORMANCE FIX: Reduce tile count for better performance
          const tilesX = 2; // Reduced from 4 to 2 for better performance

          const nodes: JSX.Element[] = [];
          for (let ix = 0; ix < tilesX; ix++) {
            const x = baseX + ix * width;
            for (let iy = 0; iy < tilesY; iy++) {
              // Add subtle per-tile variation for CLOUDS only (layerIndex === 1)
              const seed = (layerIndex + 1) * 73856093 ^ ix * 19349663 ^ iy * 83492791;
              const varyClouds = layerIndex === 1;

              // PERFORMANCE FIX: Simplified calculations for clouds
              if (varyClouds) {
                // Simplified cloud variation - less expensive calculations
                const jx = (seed % 100 - 50) * 0.01 * width * 0.15; // Simple pseudo-random jitter
                const jy = ((seed >> 8) % 100 - 50) * 0.01 * scaledHeight * 0.20;
                const wobble = Math.sin(timeSec * 0.6 + (seed % 628) * 0.01) * 2; // Simplified wobble
                const alpha = 0.85 + ((seed >> 16) % 16) * 0.01; // Simplified alpha 0.85-1.0

                const y = baseY + iy * scaledHeight + jy + wobble;
                const xTile = x + jx;

                nodes.push(
                  <Group key={`${layerIndex}-xy-${ix}-${iy}`} opacity={alpha}>
                    <SkImage
                      image={image}
                      x={xTile}
                      y={y}
                      width={width}
                      height={scaledHeight}
                      fit="fill"
                    />
                  </Group>
                );
              } else {
                // Sky layer - no variation, simple positioning
                const y = baseY + iy * scaledHeight;
                const xTile = x;

                nodes.push(
                  <Group key={`${layerIndex}-xy-${ix}-${iy}`}>
                    <SkImage
                      image={image}
                      x={xTile}
                      y={y}
                      width={width}
                      height={scaledHeight}
                      fit="fill"
                    />
                  </Group>
                );
              }
            }
          }
          return <Group key={layerIndex}>{nodes}</Group>;
        }

        // MOUNTAINS (idx >= 2): draw ONCE, anchored to bottom but respect floor
        let y = height - scaledHeight + yOffset;
        
        // Don't let mountains render below the floor
        if (floorTopY) {
          const maxY = floorScreenY - scaledHeight;
          y = Math.min(y, maxY);
        }
        
        return (
          <SkImage
            key={layerIndex}
            image={image}
            x={0}
            y={y}
            width={width}
            height={scaledHeight}
            fit="fill"
          />
        );
      })}
    </Group>
  );
}