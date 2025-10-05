// src/render/HellBackground.tsx
import React, { useMemo } from 'react';
import { Group, Rect, Path, Circle, Skia } from '@shopify/react-native-skia';

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

  // Single lighter background color
  const backgroundColor = '#2a1f2a'; // Lighter purple-gray tone

  // Stalactites removed - no longer needed

  // Compute the visual floor position (lifted up a bit to match feet)
  const baseFloorY = floorY ?? height * 0.85;
  const visFloorY = Math.max(0, baseFloorY - floorLiftPx);
  const floorBandH = Math.max(0, height - visFloorY);

  // Stones + cracks just in the top ~56px of floor
  const floorDetail = useMemo(() => {
    const rng = makeRand(4242);
    const stones: { x: number; y: number; w: number; h: number; a: number }[] = [];
    const cracks: { x1: number; y1: number; x2: number; y2: number; a: number }[] = [];
    const topBandH = Math.min(56, floorBandH);

    // Stones
    const count = Math.max(24, Math.floor(width / 28));
    for (let i = 0; i < count; i++) {
      const w = 10 + rng() * 22; // 10..32
      const h = 6 + rng() * 12;  // 6..18
      const x = rng() * width;
      const y = visFloorY + 6 + rng() * Math.max(1, topBandH - 10);
      stones.push({ x, y, w, h, a: 0.65 + rng() * 0.25 });
    }

    // Cracks (small random segments)
    const crackCount = Math.floor(count * 0.45);
    for (let i = 0; i < crackCount; i++) {
      const len = 6 + rng() * 20; // 6..26
      const x1 = rng() * width;
      const y1 = visFloorY + 8 + rng() * Math.max(1, topBandH - 14);
      const x2 = x1 + (rng() - 0.5) * len;
      const y2 = y1 + (rng() - 0.2) * (len * 0.4);
      cracks.push({ x1, y1, x2, y2, a: 0.18 + rng() * 0.12 });
    }

    return { stones, cracks, topBandH };
  }, [width, visFloorY, floorBandH]);

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

      {/* Floor band (base) */}
      <Rect x={0} y={visFloorY} width={width} height={floorBandH} color="#1b0707" opacity={1} />
      {/* Top bevel/lip */}
      <Rect x={0} y={visFloorY - 2} width={width} height={4} color="#3b1111" opacity={0.9} />
      {/* Rim shadow */}
      <Rect x={0} y={visFloorY + 2} width={width} height={4} color="#0a0404" opacity={0.35} />

      {/* Stones */}
      {floorDetail.stones.map((s, i) => (
        <Rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} color="#2b0d0d" opacity={s.a} />
      ))}

      {/* Cracks */}
      {floorDetail.cracks.map((c, i) => {
        const path = Skia.Path.Make();
        path.moveTo(c.x1, c.y1);
        path.lineTo(c.x2, c.y2);
        return <Path key={i} path={path} color="#120406" style="stroke" strokeWidth={1} opacity={c.a} />;
      })}

      {/* Subtle lava glow creeping up from below */}
      <Rect x={0} y={visFloorY + floorDetail.topBandH - 4} width={width} height={Math.max(0, floorBandH - floorDetail.topBandH + 4)} color="#ff3000" opacity={0.08} />
      <Rect x={0} y={visFloorY + floorDetail.topBandH + 6} width={width} height={Math.max(0, floorBandH - floorDetail.topBandH - 6)} color="#ffa000" opacity={0.05} />
    </Group>
  );
}