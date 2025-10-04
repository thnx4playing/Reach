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

function Lantern({ x, y, t }: { x: number; y: number; t: number }) {
  // gentle flicker 0.8..1.0, phase per-lantern using x,y
  const phase = (Math.sin((x * 0.13 + y * 0.19) * 0.1) + 1) * 0.5;
  const flicker = 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(t * 2 + phase * Math.PI * 2));
  const flameH = 12 + 3 * Math.sin(t * 3.2 + phase); // 12..15
  const bodyW = 20, bodyH = 26;

  // Chain segments (lightweight)
  const chainCount = 6;
  const chainSegs = new Array(chainCount).fill(0).map((_, i) => ({
    cx: x - 1 + Math.sin((t + i) * 0.6 + phase) * 0.6, // tiny sway
    cy: y + i * 8,
  }));

  return (
    <Group>
      {/* Chain */}
      {chainSegs.map((s, i) => (
        <Rect key={i} x={s.cx} y={s.cy} width={2} height={6} color="#2a2727" opacity={0.85} />
      ))}

      {/* Mount bracket */}
      <Rect x={x - 8} y={y + chainCount * 8} width={16} height={3} color="#1f1c1c" opacity={0.9} />

      {/* Lantern body */}
      <Rect
        x={x - bodyW / 2}
        y={y + chainCount * 8 + 3}
        width={bodyW}
        height={bodyH}
        color="#1a1515"
        opacity={0.95}
      />
      {/* Window (glass) */}
      <Rect
        x={x - (bodyW - 8) / 2}
        y={y + chainCount * 8 + 6}
        width={bodyW - 8}
        height={bodyH - 12}
        color="#3b2a20"
        opacity={0.6}
      />
      {/* Flame core (animated height + alpha) */}
      <Rect
        x={x - 4}
        y={y + chainCount * 8 + 10 + (15 - flameH)}
        width={8}
        height={flameH}
        color="#ffca66"
        opacity={0.75 * flicker}
      />
      {/* Flame inner highlight */}
      <Rect
        x={x - 2}
        y={y + chainCount * 8 + 12 + (15 - flameH)}
        width={4}
        height={Math.max(6, flameH - 6)}
        color="#ffd58a"
        opacity={0.55 * flicker}
      />
      {/* Warm glow */}
      <Circle cx={x} cy={y + chainCount * 8 + 15} r={36} color="#ff9b3b" opacity={0.06 * flicker} />
      <Circle cx={x} cy={y + chainCount * 8 + 15} r={20} color="#ffcc66" opacity={0.08 * flicker} />
    </Group>
  );
}

/**
 * Skia-only dungeon background for the boss room:
 * - Dark layered backdrop + stalactites
 * - Wall lanterns with subtle flicker
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

  // Backdrop layers (fake gradient via stacked rects)
  const layers = useMemo(
    () => [
      { y: 0, h: height, color: '#12040a', opacity: 1.0 },
      { y: 0, h: height * 0.75, color: '#1b050b', opacity: 0.7 },
      { y: height * 0.35, h: height * 0.65, color: '#24060b', opacity: 0.6 },
      { y: height * 0.55, h: height * 0.45, color: '#30070a', opacity: 0.5 },
    ],
    [height]
  );

  // Ceiling stalactites (single silhouette path)
  const stalactites = useMemo(() => {
    const path = Skia.Path.Make();
    const baseY = 0;
    path.moveTo(0, baseY);
    let x = 0;
    const rand = makeRand(7331);
    const minW = 28, maxW = 88;
    while (x < width + 1) {
      const w = minW + (maxW - minW) * rand();
      const h = 24 + 56 * rand();
      const tipX = x + w * 0.5 + 10 * Math.sin((x + t * 20) * 0.01);
      path.lineTo(x, baseY);
      path.lineTo(tipX, baseY + h);
      path.lineTo(x + w, baseY);
      x += w;
    }
    path.lineTo(width, baseY);
    path.lineTo(width, -40);
    path.lineTo(0, -40);
    path.close();
    return path;
  }, [width, t]);

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

  // Lantern positions (3 evenly spaced, near upper third)
  const lanterns = useMemo(() => {
    const y = Math.max(40, height * 0.18);
    return [
      { x: width * 0.2, y },
      { x: width * 0.5, y: y - 8 },
      { x: width * 0.8, y },
    ];
  }, [width, height]);

  return (
    <Group>
      {/* Layered backdrop */}
      {layers.map((L, i) => (
        <Rect key={i} x={0} y={L.y} width={width} height={L.h} color={L.color} opacity={L.opacity} />
      ))}

      {/* Ceiling silhouette */}
      <Path path={stalactites} color="#070307" style="fill" opacity={0.92} />
      <Path path={stalactites} color="#20050a" style="stroke" strokeWidth={2} opacity={0.3} />

      {/* Floating embers */}
      {embers.map((e, i) => {
        const y = (e.y - (t * (6 + e.s)) + e.ph * 10) % height;
        const x = e.x + Math.sin(t * 0.8 + e.ph) * 8;
        const alpha = 0.18 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + e.ph));
        return (
          <Rect key={i} x={x} y={y < 0 ? y + height : y} width={e.s} height={e.s} color="#ffcc66" opacity={alpha} />
        );
      })}

      {/* Lanterns */}
      {lanterns.map((p, i) => (
        <Lantern key={i} x={p.x} y={p.y} t={t} />
      ))}

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