// src/features/PlayerProjectiles.tsx
import React, { useEffect, useRef, useReducer } from 'react';
import { Group, Circle } from '@shopify/react-native-skia';
import { soundManager } from '../audio/SoundManager';

export type PlayerProjectile = {
  id: number;
  x: number; y: number;        // SCREEN coords
  vx: number; vy: number;      // px/s in SCREEN space
  lifeMs: number;
  bornAt: number;
  r?: number;
  // Previous position (for swept collision)
  _px?: number; _py?: number;
};

type Box = { left:number; right:number; top:number; bottom:number }; // SCREEN space

type Props = {
  projectiles: PlayerProjectile[];
  setProjectiles: React.Dispatch<React.SetStateAction<PlayerProjectile[]>>;
  screenW: number;
  screenH: number;
  targetBoxScreen: Box;                 // ★ boss hurt box in SCREEN coords
  onBossHit: (damage: number) => void;
};

// circle vs AABB (same space)
function circleAABB(cx:number, cy:number, r:number, b:Box) {
  const clx = Math.max(b.left, Math.min(cx, b.right));
  const cly = Math.max(b.top,  Math.min(cy, b.bottom));
  const dx = cx - clx, dy = cy - cly;
  return dx*dx + dy*dy <= r*r;
}

// Liang–Barsky segment vs AABB, with Minkowski expand by r
function segmentHitsAABB(x0:number,y0:number,x1:number,y1:number,b:Box,r:number){
  const left=b.left - r, right=b.right + r, top=b.top - r, bottom=b.bottom + r;
  const dx=x1-x0, dy=y1-y0;
  let t0=0, t1=1;
  const p=[-dx, dx, -dy, dy], q=[x0-left, right-x0, y0-top, bottom-y0];
  for (let i=0;i<4;i++){
    if (p[i]===0){ if (q[i]<0) return false; }
    else{
      const t=q[i]/p[i];
      if (p[i]<0){ if (t>t1) return false; if (t>t0) t0=t; }
      else       { if (t<t0) return false; if (t<t1) t1=t; }
    }
  }
  return true;
}

export default function PlayerProjectiles(props: Props) {
  const liveRef = useRef<Map<number, PlayerProjectile>>(new Map());
  const seenRef = useRef<Set<number>>(new Set());
  const [, localTick] = useReducer((x) => x + 1, 0);

  // keep freshest boss box for RAF
  const targetBoxRef = useRef<Box>(props.targetBoxScreen);
  useEffect(() => { targetBoxRef.current = props.targetBoxScreen; }, [props.targetBoxScreen]);

  // ingest new shots
  useEffect(() => {
    for (const p of props.projectiles) {
      if (seenRef.current.has(p.id)) continue;
      seenRef.current.add(p.id);
      liveRef.current.set(p.id, { ...p, _px: p.x, _py: p.y });
    }
  }, [props.projectiles]);

  // local RAF
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      const toCull: number[] = [];
      const box = targetBoxRef.current;

      liveRef.current.forEach((p, id) => {
        const r = p.r ?? 8;

        // keep previous screen position
        const x0 = p.x, y0 = p.y;

        // integrate in SCREEN space
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Hit test (instant + swept)
        const hit =
          circleAABB(p.x, p.y, r, box) ||
          segmentHitsAABB(x0, y0, p.x, p.y, box, r);

        if (hit) {
          setTimeout(() => props.onBossHit(1), 0);
          soundManager.playBossDamageSound(); // Play boss damage sound when hit
          toCull.push(id);
          return;
        }

        // end-of-life / offscreen
        const off =
          p.x < -160 || p.x > props.screenW + 160 ||
          p.y < -160 || p.y > props.screenH + 160;

        if (off || (now >= p.bornAt + p.lifeMs)) {
          toCull.push(id);
          return;
        }

        // store prev for next frame
        p._px = x0; p._py = y0;
      });

      if (toCull.length) {
        for (const id of toCull) { liveRef.current.delete(id); seenRef.current.delete(id); }
        props.setProjectiles(prev => prev.filter(p => !toCull.includes(p.id)));
      }

      localTick();
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // draw simple purple comet (x/y already SCREEN coords)
  const nodes = Array.from(liveRef.current.values()).map((p) => {
    const r = p.r ?? 8;
    const tailDt = 0.04;
    const tailX = p.x - p.vx * tailDt;
    const tailY = p.y - p.vy * tailDt;

    return (
      <Group key={p.id}>
        <Circle cx={p.x} cy={p.y} r={r * 1.9} color="#c77dff" opacity={0.26} />
        <Circle cx={p.x} cy={p.y} r={r * 1.35} color="#9d4edd" opacity={0.55} />
        <Circle cx={p.x} cy={p.y} r={r} color="#ffffff" opacity={0.96} />
        <Circle cx={tailX} cy={tailY} r={Math.max(2, r * 0.6)} color="#a78bfa" opacity={0.6} />
      </Group>
    );
  });

  return <Group>{nodes}</Group>;
}