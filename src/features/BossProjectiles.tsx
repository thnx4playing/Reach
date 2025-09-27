// src/features/BossProjectiles.tsx
// src/features/BossProjectiles.tsx
import React, { useEffect, useRef } from 'react';
import { Group, Circle } from '@shopify/react-native-skia';
import { BOSS_DAMAGE_PER_HIT } from '../config/gameplay';

export type BossProjectile = {
  id: number;
  x: number; y: number;         // world position (y increases downward in your game)
  vx: number; vy: number;       // world velocity (pixels/sec)
  lifeMs: number;               // lifetime cap
  bornAt: number;               // ms timestamp
  r?: number;                   // visual radius (px)
};

type Props = {
  projectiles: BossProjectile[];
  setProjectiles: React.Dispatch<React.SetStateAction<BossProjectile[]>>;
  xToScreen: (xWorld: number) => number;
  worldYToScreenY: (yWorld: number) => number;
  screenW: number;
  screenH: number;
  playerBBoxWorld: { left:number; right:number; top:number; bottom:number };
  onPlayerHit: (dmg: number) => void;
};

/** circle vs AABB */
function circleHitsAABB(cx:number, cy:number, r:number, b:{left:number;right:number;top:number;bottom:number}) {
  const clx = Math.max(b.left, Math.min(cx, b.right));
  const cly = Math.max(b.top,  Math.min(cy, b.bottom));
  const dx = cx - clx, dy = cy - cly;
  return dx*dx + dy*dy <= r*r;
}

export default function BossProjectiles({
  projectiles, setProjectiles, xToScreen, worldYToScreenY, screenW, screenH, playerBBoxWorld, onPlayerHit
}: Props) {

  // Integrate; handle lifetime + collision; simple linear motion (no gravity)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      setProjectiles(prev => {
        const out: BossProjectile[] = [];
        for (const p of prev) {
          const nx = p.x + p.vx * dt;
          const ny = p.y + p.vy * dt;
          const lifeLeft = p.lifeMs - (now - p.bornAt);
          const r = p.r ?? 8;

          // player collision (world space)
          if (circleHitsAABB(nx, ny, r, playerBBoxWorld)) {
            // schedule damage outside render cycle
            setTimeout(() => onPlayerHit(BOSS_DAMAGE_PER_HIT), 0);
            continue; // consume projectile
          }

          // cull when expired or far off-screen
          const sx = xToScreen(nx);
          const sy = worldYToScreenY(ny);
          const off = (sx < -160 || sx > screenW + 160 || sy < -160 || sy > screenH + 160);

          if (lifeLeft > 0 && !off) {
            out.push({ ...p, x: nx, y: ny });
          }
        }
        return out;
      });

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setProjectiles, xToScreen, worldYToScreenY, screenW, screenH, playerBBoxWorld, onPlayerHit]);

      // Draw: Skia "lava ball" (glow + core + tiny trailing puff), like main-map FireballLayer
      return (
        <Group>
          {projectiles.map(p => {
            const r = p.r ?? 8;
            const sx = xToScreen(p.x);
            const sy = worldYToScreenY(p.y);

        // Tail sample ~40ms back along the current velocity
        const tailDt = 0.04;
        const tailX = xToScreen(p.x - p.vx * tailDt);
        const tailY = worldYToScreenY(p.y - p.vy * tailDt);

        return (
          <Group key={p.id}>
            {/* outer glow */}
            <Circle cx={sx} cy={sy} r={r * 1.9} color="#ff5a00" opacity={0.28} />
            {/* mid glow */}
            <Circle cx={sx} cy={sy} r={r * 1.35} color="#ff9a00" opacity={0.55} />
            {/* core */}
            <Circle cx={sx} cy={sy} r={r} color="#fff47a" opacity={0.95} />
            {/* tiny tail puff */}
            <Circle cx={tailX} cy={tailY} r={Math.max(2, r * 0.6)} color="#ffd54a" opacity={0.6} />
          </Group>
        );
      })}
    </Group>
  );
}