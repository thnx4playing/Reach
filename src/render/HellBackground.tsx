// src/render/HellBackground.tsx
import React, { useMemo } from 'react';
import { Group, Rect, Path, Circle, Skia, Image, useImage } from '@shopify/react-native-skia';

type Props = {
  width: number;
  height: number;
  /** Screen Y for top of the floor (world → screen). If null, we estimate. */
  floorY?: number | null;
  /** Animation time in ms (you're already passing hazardAnimationTime). */
  timeMs?: number;
  /** Positive px to lift the visual floor upward (fix "floating feet"). */
  floorLiftPx?: number;
};

/** Small helper: deterministic RNG (no allocs in render). */
const makeRand = (seed0 = 1337) => {
  let seed = seed0 >>> 0;
  return () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) % 1000) / 1000;
  };
};

// Lantern component removed - no longer needed

/**
 * Skia-only dungeon background for the boss room:
 * - Single lighter background color
 * - Animated floating embers
 * - Detailed floor band (stone lip + stones + cracks + faint lava glow)
 */
export default function HellBackground({
  width,
  height,
  floorY,
  timeMs = 0,
  floorLiftPx = 22,
}: Props) {
  const t = (timeMs % 100000) / 1000; // seconds

  // Load brick floor image
  const brickFloorImage = useImage(require('../../assets/maps/dark/brick-floor.png'));

  // Single lighter background color
  const backgroundColor = '#3a2f3a'; // Even lighter purple-gray tone

  // Stalactites removed - no longer needed

  // Compute the visual floor position (lifted up a bit to match feet)
  const baseFloorY = floorY ?? height * 0.85;
  const visFloorY = Math.max(0, baseFloorY - floorLiftPx);
  const floorBandH = Math.max(0, height - visFloorY);

  // Floor detail for lava glow positioning
  const topBandH = Math.min(56, floorBandH);

  // Floating embers (background mood)
  const embers = useMemo(() => {
    const rng = makeRand(42);
    const count = Math.max(22, Math.floor(width * 0.05));
    const data: { x: number; y: number; s: number; ph: number }[] = [];
    for (let i = 0; i < count; i++) {
      data.push({
        x: rng() * width,
        y: rng() * height,
        s: 1 + rng() * 2.5,
        ph: rng() * Math.PI * 2,
      });
    }
    return data;
  }, [width, height]);

  // Lanterns removed - no longer needed

  return (
    <Group>
      {/* Single background color */}
      <Rect x={0} y={0} width={width} height={height} color={backgroundColor} opacity={1.0} />

      {/* Ceiling spikes removed */}

      {/* Floating embers */}
      {embers.map((e, i) => {
        const y = (e.y - (t * (6 + e.s)) + e.ph * 10) % height;
        const x = e.x + Math.sin(t * 0.8 + e.ph) * 8;
        const alpha = 0.18 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + e.ph));
        return (
          <Rect key={i} x={x} y={y < 0 ? y + height : y} width={e.s} height={e.s} color="#ffcc66" opacity={alpha} />
        );
      })}

      {/* Lanterns removed */}

      {/* Tiled Brick Floor Image */}
      {brickFloorImage && (
        <>
          {/* Tile the brick floor image across the width */}
          {Array.from({ length: Math.ceil(width / (brickFloorImage.width() || 64)) }, (_, i) => (
            <Image
              key={`brick-floor-${i}`}
              image={brickFloorImage}
              x={i * (brickFloorImage.width() || 64)}
              y={visFloorY}
              width={brickFloorImage.width() || 64}
              height={floorBandH}
              fit="fill"
            />
          ))}
          
          {/* Top bevel/lip */}
          <Rect x={0} y={visFloorY - 2} width={width} height={4} color="#3b1111" opacity={0.9} />
          
          {/* Rim shadow */}
          <Rect x={0} y={visFloorY + 2} width={width} height={4} color="#0a0404" opacity={0.35} />

          {/* Subtle lava glow creeping up from below */}
          <Rect x={0} y={visFloorY + topBandH - 4} width={width} height={Math.max(0, floorBandH - topBandH + 4)} color="#ff3000" opacity={0.08} />
          <Rect x={0} y={visFloorY + topBandH + 6} width={width} height={Math.max(0, floorBandH - topBandH - 6)} color="#ffa000" opacity={0.05} />
        </>
      )}
    </Group>
  );
}