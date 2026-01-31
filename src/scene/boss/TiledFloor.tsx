// src/scene/boss/TiledFloor.tsx
import React, { useMemo } from "react";
import { Group, Image, useImage, Rect } from "@shopify/react-native-skia";
import BossLavaLayer from "../../render/BossLavaLayer";
import { SCREEN } from "../../config/physics"; // SINGLE SOURCE OF TRUTH

type Props = {
  left: number;         // room left (world px)
  right: number;        // room right (world px)
  topY: number;         // floor top Y (world px)
  cameraY: number;      // camera Y so we can translate without re-laying out
  tileHeight?: number;  // default 32
  prefer128?: boolean;  // default true => use 128x width tiles
  timeMs?: number;      // animation time for embers
};

/**
 * Perf notes:
 * - We draw N small images (integer-aligned) instead of 1 stretched image.
 * - N is tiny: room ~720px wide => 6 tiles at 128px or 12 at 64px.
 * - We preload BOTH tile sizes via require(); pick one at runtime.
 */
export default function TiledFloor({
  left,
  right,
  topY,
  cameraY,
  tileHeight = 32,
  prefer128 = true,
  timeMs = 0,
}: Props) {
  // Static requires (Metro needs static strings)
  const img = useImage(require("../../../assets/maps/dark/brick_floor_128x32.png"));

  // Use the brick-floor.png image
  const width = right - left;
  const tileW = img ? (img.width() || 64) : 64;

  const xs = useMemo(() => {
    const tiles = Math.ceil(width / tileW);
    const arr: number[] = [];
    for (let i = 0; i < tiles; i++) arr.push(Math.round(left + i * tileW));
    return arr;
  }, [left, width, tileW]);

  // Floating embers - USE UNIFIED SCREEN HEIGHT
  const embers = useMemo(() => {
    const rng = (seed0 = 42) => {
      let seed = seed0 >>> 0;
      return () => {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        return (seed >>> 0) / 0x100000000;
      };
    };
    const rand = rng(42);
    const count = Math.max(22, Math.floor(width * 0.05));
    const arr = [];
    // USE UNIFIED SCREEN HEIGHT FROM PHYSICS
    const screenHeight = SCREEN.HEIGHT;
    for (let i = 0; i < count; i++) {
      arr.push({
        x: left + rand() * width,
        y: rand() * screenHeight,
        s: 2 + rand() * 4,
        ph: rand() * Math.PI * 2,
      });
    }
    return arr;
  }, [left, width]);

  if (!img) return null;

  // IMPORTANT: integer positions (x/y) avoid seams on older Skia.
  const y = Math.round(topY);
  const t = (timeMs % 100000) / 1000;

  return (
    <Group transform={[{ translateY: -cameraY }]}>
      {/* Animated lava layer under the floor */}
      <BossLavaLayer
        width={width}
        height={tileHeight}
        y={y + tileHeight}
        timeMs={timeMs}
      />
      
      {/* Floor tiles */}
      {xs.map((x, i) => (
        <Image
          key={i}
          image={img}
          x={x}
          y={y}
          width={tileW}
          height={tileHeight}
          fit="fill"
        />
      ))}
      
      {/* Floating embers - USE UNIFIED SCREEN HEIGHT */}
      {embers.map((e, i) => {
        const screenHeight = SCREEN.HEIGHT;
        const emberY = (e.y - (t * (6 + e.s)) + e.ph * 10) % screenHeight;
        const emberX = e.x + Math.sin(t * 0.8 + e.ph) * 8;
        const alpha = 0.18 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + e.ph));
        return (
          <Rect 
            key={`ember-${i}`} 
            x={emberX} 
            y={emberY < 0 ? emberY + screenHeight : emberY}
            width={e.s} 
            height={e.s} 
            color="#ffcc66" 
            opacity={alpha} 
          />
        );
      })}
    </Group>
  );
}
