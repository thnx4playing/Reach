// src/features/BossProjectiles.tsx
import React, { useRef } from 'react';
import { Group, Circle, Image as SkImageComp } from '@shopify/react-native-skia';
import { useImage } from '@shopify/react-native-skia';
import { BOSS_DAMAGE_PER_HIT } from '../config/gameplay';

export type BossProjectile = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  bornAt: number;
};

type Props = {
  projectiles: BossProjectile[];
  setProjectiles: (updater: (prev: BossProjectile[]) => BossProjectile[]) => void;
  xToScreen: (x:number)=>number;
  worldYToScreenY: (y:number)=>number;
  screenW: number;
  screenH: number;
  playerBBoxWorld: { left:number; right:number; top:number; bottom:number };
  onPlayerHit: (damage:number)=>void;
};

export default function BossProjectiles({
  projectiles, setProjectiles, xToScreen, worldYToScreenY, screenW, screenH,
  playerBBoxWorld, onPlayerHit
}: Props) {
  const tex = useImage(require('../../assets/character/demon/projectile.png'));
  const lastRef = useRef<number>(Date.now());

  // integrate simple motion
  const now = Date.now();
  const dt = Math.min(0.033, (now - lastRef.current) / 1000);
  lastRef.current = now;

  const next: BossProjectile[] = [];
  for (const p of projectiles) {
    const nx = p.x + p.vx * dt;
    const ny = p.y + p.vy * dt;
    const nl = p.lifeMs - (now - p.bornAt);
    if (nl > 0) {
      // collision
      if (rectContains(playerBBoxWorld, nx, ny)) {
        onPlayerHit(BOSS_DAMAGE_PER_HIT);
        continue;
      }
      // cull in screen space
      const sx = xToScreen(nx);
      const sy = worldYToScreenY(ny);
      if (sx < -120 || sx > screenW+120 || sy < -140 || sy > screenH+160) {
        // keep moving for a bit anyway
      }
      next.push({ ...p, x: nx, y: ny });
    }
  }
  if (next.length !== projectiles.length) {
    setTimeout(() => setProjectiles(() => next), 0);
  }

  return (
    <Group>
      {projectiles.map(p => {
        const sx = xToScreen(p.x);
        const sy = worldYToScreenY(p.y);
        if (tex) {
          // draw textured
          return <SkImageComp key={p.id} image={tex} x={sx-12} y={sy-8} width={24} height={16} />;
        }
        return <Circle key={p.id} cx={sx} cy={sy} r={6} color="#d44" />;
      })}
    </Group>
  );
}

function rectContains(b:{left:number;right:number;top:number;bottom:number}, x:number, y:number) {
  return x>=b.left && x<=b.right && y>=b.top && y<=b.bottom;
}
