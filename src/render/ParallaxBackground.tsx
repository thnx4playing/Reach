import React from 'react';
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
  clipMaxY?: number; // NEW: only draw above this Y
}

export default function ParallaxBackground({
  variant,
  cameraY,
  timeSec,
  viewport,
  clipMaxY,
}: ParallaxBackgroundProps) {

  
  const { width, height } = viewport;
  
  // Create clip rect if clipMaxY is specified
  const clipRect = typeof clipMaxY === "number" ? rect(0, 0, width, Math.max(0, clipMaxY)) : undefined;

  return (
    <Group {...(clipRect ? { clip: clipRect } : {})}>
      {(variant.layers ? variant.layers : []).map((layer, layerIndex) => {
        const image = useImage(layer.src);
        if (!image) return null;

        // Scale to viewport width
        if (!image || typeof (image as any).width !== 'function' || typeof (image as any).height !== 'function') return null;
        const iw = image.width();
        const ih = image.height();
        const scale = width / iw;
        const scaledHeight = ih * scale;

        // Parallax (positive cameraY goes down)
        const yOffset = -cameraY * layer.vFactor;
        const xDriftBase = (layer.hDrift ?? 0) * -timeSec; // drift left when positive

        // SKY (idx 0) + CLOUDS (idx 1): tile in X and Y infinitely
        if (layerIndex <= 1) {
          const tilesY = Math.ceil(height / scaledHeight) + 2;
          const baseY = ((yOffset % scaledHeight) + scaledHeight) % scaledHeight - scaledHeight;
          // Wrap the base drift so we never accumulate huge coordinates
          const baseX = ((xDriftBase % width) + width) % width - width;
          // Draw 4 columns to stay safe when we jitter tiles horizontally
          const tilesX = 4;

          const nodes: JSX.Element[] = [];
          for (let ix = 0; ix < tilesX; ix++) {
            const x = baseX + ix * width;
            for (let iy = 0; iy < tilesY; iy++) {
              // Add subtle per-tile variation for CLOUDS only (layerIndex === 1)
              const seed = (layerIndex + 1) * 73856093 ^ ix * 19349663 ^ iy * 83492791;
              const varyClouds = layerIndex === 1;

              // Horizontal jitter (±15% panel width), vertical jitter (±20% panel height)
              const jx = varyClouds ? randRange(seed + 1, -0.15 * width, 0.15 * width) : 0;
              const jy = varyClouds ? randRange(seed + 2, -0.20 * scaledHeight, 0.20 * scaledHeight) : 0;

              // Slight per-tile drift speed multiplier (0.6x..1.4x)
              const driftMul = varyClouds ? randRange(seed + 3, 0.6, 1.4) : 1.0;

              // Tiny vertical wobble with a dephased start
              const wobble =
                varyClouds
                  ? Math.sin(timeSec * 0.6 + randRange(seed + 4, 0, Math.PI * 2)) * 2
                  : 0;

              // Slight opacity variation (0.85..1.0)
              const alpha = varyClouds ? randRange(seed + 5, 0.85, 1.0) : 1.0;

              const y = baseY + iy * scaledHeight + jy + wobble;
              // Keep the *relative* extra drift wrapped to screen width to avoid huge coords
              const extra = xDriftBase * (driftMul - 1);                // delta from base speed
              const extraWrapped = ((extra % width) + width) % width;   // 0..width
              const xTile = x + jx + extraWrapped;

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
            }
          }
          return <Group key={layerIndex}>{nodes}</Group>;
        }

        // MOUNTAINS (idx >= 2): draw ONCE, anchored to bottom of the viewport, no vertical tiling
        const y = height - scaledHeight + yOffset;
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