// src/features/BossProjectiles.tsx
import React, { useEffect, useRef } from 'react';
import { Group, Circle, Image as SkImageComp } from '@shopify/react-native-skia';
import { useImage } from '@shopify/react-native-skia';
import { BOSS_DAMAGE_PER_HIT } from '../config/gameplay';

export type BossProjectile = {
  id: number;
  x: number; y: number;
  vx: number; vy: number;
  lifeMs: number;
  bornAt: number;
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

const TEX = require('../../assets/character/demon/projectile.png') as number;

export default function BossProjectiles({
  projectiles, setProjectiles, xToScreen, worldYToScreenY, screenW, screenH, playerBBoxWorld, onPlayerHit
}: Props) {
  const tex = useImage(TEX);
  const enabledRef = useRef(true);

  // Integrate motion & handle lifetime / collisions
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      if (enabledRef.current) {
        setProjectiles(prev => {
          const out: BossProjectile[] = [];
          for (const p of prev) {
            // integrate
            const nx = p.x + p.vx * dt;
            const ny = p.y + p.vy * dt;
            const life = p.lifeMs - (now - p.bornAt);

            // player collision (world space)
            if (rectContains(playerBBoxWorld, nx, ny)) {
              onPlayerHit(BOSS_DAMAGE_PER_HIT);
              continue; // consume projectile
            }

            // cull if expired or far outside room bounds
            const sx = xToScreen(nx);
            const sy = worldYToScreenY(ny);
            const offscreen = sx < -64 || sx > screenW + 64 || sy < -64 || sy > screenH + 64;

            if (life > 0 && !offscreen) {
              out.push({ ...p, x: nx, y: ny });
            }
          }
          return out;
        });
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [setProjectiles, xToScreen, worldYToScreenY, screenW, screenH, playerBBoxWorld, onPlayerHit]);

  return (
    <Group>
      {projectiles.map(p => {
        const sx = xToScreen(p.x);
        const sy = worldYToScreenY(p.y);
        if (tex) {
          return <SkImageComp key={p.id} image={tex} x={sx - 12} y={sy - 8} width={24} height={16} />;
        }
        return <Circle key={p.id} cx={sx} cy={sy} r={6} color="#d44" />;
      })}
    </Group>
  );
}

function rectContains(b:{left:number;right:number;top:number;bottom:number}, x:number, y:number) {
  return x>=b.left && x<=b.right && y>=b.top && y<=b.bottom;
}