// src/render/FireballLayer.tsx
import React, { useRef } from "react";
import { View } from "react-native";
import { Canvas, Group, Circle } from "@shopify/react-native-skia";
import { soundManager } from "../audio/SoundManager";

/**
 * World Y increases downward; gravity is +.
 */

type Fireball = {
  id: number;
  spawnMs: number;
  lifeMs: number;
  x0World: number;
  y0World: number;
  vx: number;
  vy: number;
  r: number;
  hit?: boolean;

  // smoothing cache (screen space)
  sx?: number;
  sy?: number;
};

export type AABBWorld = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Props = {
  clockMs?: number;      // pass hazardAnimationTime
  timeMs?: number;       // fallback only

  lavaYWorld: number;

  worldYToScreenY: (worldY: number) => number;
  worldXToScreenX?: (worldX: number) => number;

  screenW: number;
  screenH: number;

  playerAABBWorld: AABBWorld;
  onPlayerHit?: (damage: number) => void;

  // Tunables
  maxConcurrent?: number;      // cap active fireballs (we spawn 1–2 per wave)
  spawnMinMs?: number;         // min ms between waves
  spawnMaxMs?: number;         // max ms between waves
  gravity?: number;            // px/s^2
  peakTargetScreenY?: number;  // aim apex toward this screen Y (from top)
  damagePerHit?: number;
  initialDelayMs?: number;     // delay before first fireball spawn

  // New: motion & smoothing
  speedScale?: number;         // <1 slows (0.66 ≈ 1/3 slower)
  smoothAlpha?: number;        // 0..1, higher = snappier, 0.25 is gentle
};

export default function FireballLayer({
  clockMs,
  timeMs,
  lavaYWorld,
  worldYToScreenY,
  worldXToScreenX,
  screenW,
  screenH,
  playerAABBWorld,
  onPlayerHit,

  maxConcurrent = 2,
  spawnMinMs = 10000,
  spawnMaxMs = 20000,
  gravity = 1350,
  peakTargetScreenY = 96,
  damagePerHit = 1,
  initialDelayMs = 5000,  // 5 second delay by default

  speedScale = 0.66,     // ~⅓ slower motion by default
  smoothAlpha = 0.25,    // light EMA for visual smoothness
}: Props) {
  const poolRef = useRef<Fireball[]>([]);
  const nextSpawnAtMsRef = useRef<number | null>(null);
  const idRef = useRef(1);

  const nowMs = clockMs ?? timeMs ?? 0;
  
  // Initialize first spawn only when the animation clock is valid (> 0)
  if (nextSpawnAtMsRef.current === null) {
    if (nowMs > 0) {
      nextSpawnAtMsRef.current = nowMs + initialDelayMs; // 5s after first real clock
    }
  }
  const xToScreen = worldXToScreenX ?? ((x: number) => x);

  // Utilities
  const pickVyForPeak = (y0World: number) => {
    let lo = 400, hi = 1800;
    const target = peakTargetScreenY;
    const peakScreenFromVy = (vy: number) => {
      const yPeak = y0World - (vy * vy) / (2 * gravity);
      return worldYToScreenY(yPeak);
    };
    if (peakScreenFromVy(hi) > target) return hi;
    for (let i = 0; i < 12; i++) {
      const mid = 0.5 * (lo + hi);
      const s = peakScreenFromVy(mid);
      if (s <= target) hi = mid; else lo = mid;
    }
    const base = hi;
    return base * (0.9 + Math.random() * 0.2); // ±10%
  };

  const circleIntersectsAABB = (cx: number, cy: number, r: number, b: AABBWorld) => {
    const closestX = cx < b.left ? b.left : (cx > b.right ? b.right : cx);
    const closestY = cy < b.top  ? b.top  : (cy > b.bottom ? b.bottom : cy);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) <= (r * r);
  };

  // Prune expired/sunken/hit
  poolRef.current = poolRef.current.filter((fb) => {
    if (fb.hit) return false;
    const dt = Math.max(0, (nowMs - fb.spawnMs) / 1000);
    const dtScaled = dt * speedScale;
    if (dt * 1000 > fb.lifeMs) return false;
    const yWorld = fb.y0World - fb.vy * dtScaled + 0.5 * gravity * dtScaled * dtScaled;
    if (yWorld > lavaYWorld + 60) return false;
    return true;
  });

  const activeCount = poolRef.current.length;

  // Spawn a wave (random 1 or 2), respecting maxConcurrent
  if (
    nextSpawnAtMsRef.current !== null &&
    nowMs >= nextSpawnAtMsRef.current &&
    poolRef.current.length < maxConcurrent
  ) {
    const desired = Math.random() < 0.45 ? 2 : 1;
    const capacity = Math.max(0, maxConcurrent - poolRef.current.length);
    const toSpawn = Math.min(desired, capacity);
    const y0World = lavaYWorld - 8;

    for (let i = 0; i < toSpawn; i++) {
      const x0World = -40 + Math.random() * (screenW + 80);
      const vy = pickVyForPeak(y0World);
      const vx = (Math.random() * 240 - 120);
      const r  = 6 + Math.random() * 7;
      // Scale lifetime up by 1/speedScale so slowed motion still completes arc
      const baseLife = 4200 + Math.floor(Math.random() * 1400);
      const lifeMs = Math.floor(baseLife / Math.max(0.0001, speedScale));

      poolRef.current.push({
        id: idRef.current++,
        spawnMs: nowMs,
        lifeMs,
        x0World,
        y0World,
        vx,
        vy,
        r,
      });

      // Play fireball sound effect
      soundManager.playFireballSound();
    }

    nextSpawnAtMsRef.current =
      nowMs + (spawnMinMs + Math.random() * (spawnMaxMs - spawnMinMs));
  }

  const items = poolRef.current;

  // Render & collide
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: screenW,
        height: screenH,
        zIndex: 15,
      }}
    >
      <Canvas style={{ width: screenW, height: screenH }}>
        {items.map((fb) => {
          const dt = Math.max(0, (nowMs - fb.spawnMs) / 1000);
          const dtScaled = dt * speedScale;

          // world-space motion (time-scaled)
          const xWorld = fb.x0World + fb.vx * dtScaled;
          const yWorld = fb.y0World - fb.vy * dtScaled + 0.5 * gravity * dtScaled * dtScaled;

          // collision (world space)
          if (!fb.hit && onPlayerHit && circleIntersectsAABB(xWorld, yWorld, fb.r, playerAABBWorld)) {
            fb.hit = true;
            fb.lifeMs = 0;
            // Defer damage call to avoid React setState during render
            setTimeout(() => onPlayerHit(damagePerHit), 0);
            return null;
          }

          // cull (screen space)
          const xScreenRaw = xToScreen(xWorld);
          const yScreenRaw = worldYToScreenY(yWorld);
          if (xScreenRaw < -160 || xScreenRaw > screenW + 160) return null;
          if (yScreenRaw < -160 || yScreenRaw > screenH + 180) return null;

          // tiny tail: sample 40ms earlier (in scaled time)
          const tailDtScaled = Math.max(0, dtScaled - 0.04);
          const tailXWorld = fb.x0World + fb.vx * tailDtScaled;
          const tailYWorld = fb.y0World - fb.vy * tailDtScaled + 0.5 * gravity * tailDtScaled * tailDtScaled;

          // --- EMA smoothing in screen space (no re-render) ---
          if (fb.sx == null) {
            fb.sx = xScreenRaw;
            fb.sy = yScreenRaw;
          } else {
            const a = smoothAlpha;
            fb.sx = fb.sx + a * (xScreenRaw - fb.sx);
            fb.sy = fb.sy + a * (yScreenRaw - fb.sy);
          }

          const tailX = xToScreen(tailXWorld);
          const tailY = worldYToScreenY(tailYWorld);

          return (
            <Group key={fb.id}>
              {/* outer glow */}
              <Circle cx={fb.sx} cy={fb.sy} r={fb.r * 1.9} color="#ff5a00" opacity={0.28} />
              {/* mid glow */}
              <Circle cx={fb.sx} cy={fb.sy} r={fb.r * 1.35} color="#ff9a00" opacity={0.55} />
              {/* core */}
              <Circle cx={fb.sx} cy={fb.sy} r={fb.r} color="#fff47a" opacity={0.95} />
              {/* tail */}
              <Circle cx={tailX} cy={tailY} r={Math.max(2, fb.r * 0.6)} color="#ffd54a" opacity={0.6} />
            </Group>
          );
        })}
      </Canvas>
    </View>
  );
}
