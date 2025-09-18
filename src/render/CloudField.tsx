// src/render/CloudField.tsx
import React, { useMemo } from "react";
import { View } from "react-native";
import { Canvas, Path, Skia, Group, Rect } from "@shopify/react-native-skia";

// ---- Types ----
export type CloudLayer = {
  /** approximate clouds per 1000x1000 world px */
  density: number;
  /** [min, max] ellipse radius in px (screen space after parallax) */
  radius: [number, number];
  /** horizontal oscillation amplitude in px */
  ampX: [number, number];
  /** horizontal oscillation speed (radians per second) */
  speedX: [number, number];
  /** parallax factor [0..1], 0 = pinned to screen, 1 = moves with world */
  parallax: number;
  /** opacity 0..1 */
  opacity: number;
  /** fill color */
  color: string;
};

export type CloudConfig = {
  /** height of a world chunk (px). clouds are generated per-chunk for determinism & perf */
  chunkHeight: number;
  /** how many extra chunks above/below view to generate */
  padChunks: number;
  /** global seed for deterministic patterns */
  seed: number;
  /** layers from far (first) to near (last) */
  layers: CloudLayer[];
};

type Props = {
  width: number;          // screen width
  height: number;         // screen height
  cameraTopY: number;     // world -> screen conversion uses this
  timeMs: number;         // animation time
  config?: Partial<CloudConfig>;
};

/** Small, fast hash for deterministic RNG */
function hash32(n: number) {
  // Robert Jenkins' 32 bit integer hash
  n = (n + 0x7ed55d16) + (n << 12);
  n = (n ^ 0xc761c23c) ^ (n >>> 19);
  n = (n + 0x165667b1) + (n << 5);
  n = (n + 0xd3a2646c) ^ (n << 9);
  n = (n + 0xfd7046c5) + (n << 3);
  n = (n ^ 0xb55a4f09) ^ (n >>> 16);
  return (n >>> 0);
}

function makeRng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 0xffffffff;
  };
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// Build a blobby cloud path from 3–5 ovals; cheap but looks good.
function makeCloudPath(cx: number, cy: number, r: number, rng: () => number) {
  const path = Skia.Path.Make();
  const lobes = 3 + Math.floor(rng() * 3); // 3..5
  for (let i = 0; i < lobes; i++) {
    const angle = (i / lobes) * Math.PI * 2;
    const rr = r * (0.75 + rng() * 0.5);
    const ox = Math.cos(angle) * r * (0.2 + rng() * 0.4);
    const oy = Math.sin(angle) * r * (0.1 + rng() * 0.2);
    // draw as rounded rectangles approximated by addOval
    path.addOval({ x: cx + ox - rr, y: cy + oy - rr * 0.8, width: rr * 2, height: rr * 1.6 });
  }
  return path;
}

/**
 * CloudField – procedural parallax clouds (Skia). Deterministic, chunked, lightweight.
 * - Generates clouds per world "chunk" so we don't keep large arrays in memory.
 * - Each layer has its own parallax and horizontal oscillation.
 * - Uses only simple Path fills (no gradients, no blurs) for perf.
 */
export default function CloudField({ width, height, cameraTopY, timeMs, config }: Props) {
  // Simplified configuration for better performance and visibility
  const defaultLayers = [
    { density: 0.5, radius: [30, 50], ampX: [10, 20], speedX: [0.1, 0.2], parallax: 0.3, opacity: 0.8, color: "#ffffff" },
    { density: 0.3, radius: [40, 70], ampX: [15, 30], speedX: [0.05, 0.15], parallax: 0.5, opacity: 0.9, color: "#ffffff" },
  ];

  const cfg: CloudConfig = {
    chunkHeight: 600,
    padChunks: 2,
    seed: 123456,
    layers: defaultLayers,
    ...config,
    layers: config?.layers ?? defaultLayers,
  };

  const viewTop = cameraTopY;
  const viewBottom = cameraTopY + height;

  // The range of chunks that could contribute clouds to the current screen
  const firstChunk = Math.floor(viewTop / cfg.chunkHeight) - cfg.padChunks;
  const lastChunk  = Math.floor(viewBottom / cfg.chunkHeight) + cfg.padChunks;

  const tSec = timeMs / 1000;

  // We draw everything in a single Canvas for minimal overhead.
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width, height }} pointerEvents="none">
      <Canvas style={{ width, height }}>
        {/* Sky background - light blue gradient */}
        <Rect x={0} y={0} width={width} height={height} color="#87CEEB" />
        
        {cfg.layers.map((layer, layerIdx) => {
          const elements: JSX.Element[] = [];
          for (let chunk = firstChunk; chunk <= lastChunk; chunk++) {
            const chunkTop = chunk * cfg.chunkHeight;
            const chunkBottom = chunkTop + cfg.chunkHeight;
            const seed = hash32(cfg.seed ^ (layerIdx + 1) * 997 ^ chunk * 7919);
            const rng = makeRng(seed);

            // Simplified cloud count calculation
            const nClouds = Math.max(1, Math.round(layer.density * 5)); // Much simpler calculation

            for (let i = 0; i < nClouds; i++) {
              const wy = chunkTop + rng() * cfg.chunkHeight;         // world Y
              // Simplified parallax - just offset from camera with parallax factor
              const sy = (wy - cameraTopY) * layer.parallax + height * 0.5;
              if (sy < -100 || sy > height + 100) continue;          // clip early (padding)

              const r = lerp(layer.radius[0], layer.radius[1], rng());
              const baseX = rng() * width;
              const amp = lerp(layer.ampX[0], layer.ampX[1], rng());
              const speed = lerp(layer.speedX[0], layer.speedX[1], rng());
              const phase = rng() * Math.PI * 2;
              // Horizontal oscillation
              const sx = (baseX + Math.sin(tSec * speed + phase) * amp) % width;

              const path = makeCloudPath(sx, sy, r, rng);
              elements.push(
                <Path key={`${layerIdx}_${chunk}_${i}`} path={path} color={layer.color} opacity={layer.opacity} style="fill" />
              );
            }
          }
          return <Group key={`layer_${layerIdx}`}>{elements}</Group>;
        })}
      </Canvas>
    </View>
  );
}
