// src/features/BossProjectiles.tsx
import React, { useEffect, useMemo, useRef, useReducer } from 'react';
import { Group, Circle } from '@shopify/react-native-skia';
import { BOSS_DAMAGE_PER_HIT } from '../config/gameplay';

export type BossProjectile = {
  id: number;
  x: number; y: number;         // world position at spawn
  vx: number; vy: number;       // world velocity (px/s)
  lifeMs: number;
  bornAt: number;               // ms
  r?: number;
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

// AABB vs circle
function circleAABB(cx:number, cy:number, r:number, b:{left:number;right:number;top:number;bottom:number}) {
  const clx = Math.max(b.left, Math.min(cx, b.right));
  const cly = Math.max(b.top,  Math.min(cy, b.bottom));
  const dx = cx - clx, dy = cy - cly;
  return dx*dx + dy*dy <= r*r;
}

export default function BossProjectiles(props: Props) {
  const liveRef = useRef<Map<number, BossProjectile>>(new Map());
  const seenRef = useRef<Set<number>>(new Set());
  const [, localTick] = useReducer((x) => x + 1, 0); // local re-render only

  // Keep freshest player box for RAF loop
  const playerBoxRef = useRef(props.playerBBoxWorld);
  useEffect(() => { playerBoxRef.current = props.playerBBoxWorld; }, [props.playerBBoxWorld]);

  // Ingest newly spawned shots from parent once (by id)
  useEffect(() => {
    for (const p of props.projectiles) {
      if (seenRef.current.has(p.id)) continue;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) continue;
      seenRef.current.add(p.id);
      // clone so we can mutate locally without parent re-renders
      liveRef.current.set(p.id, { ...p });
    }
  }, [props.projectiles]);

  // Integrate locally; prune rarely; re-render locally each RAF
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      const toCull: number[] = [];
      liveRef.current.forEach((p, id) => {
        // Drop invalid shots early
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.vx) || !Number.isFinite(p.vy)) {
          toCull.push(id);
          return;
        }

        // integrate
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const r = p.r ?? 8;
        const lifeLeft = p.lifeMs - (now - p.bornAt);
        const off =
          props.xToScreen(p.x) < -160 || props.xToScreen(p.x) > props.screenW + 160 ||
          props.worldYToScreenY(p.y) < -160 || props.worldYToScreenY(p.y) > props.screenH + 160;

        // collide with player
        const box = playerBoxRef.current;
        if (circleAABB(p.x, p.y, r, box)) {
          // damage outside rendering
          setTimeout(() => props.onPlayerHit(BOSS_DAMAGE_PER_HIT), 0);
          toCull.push(id);
          return;
        }

        if (lifeLeft <= 0 || off) {
          toCull.push(id);
          return;
        }
      });

      if (toCull.length) {
        // remove locally
        for (const id of toCull) { liveRef.current.delete(id); seenRef.current.delete(id); }
        // prune parent state (rare) to keep memory bounded
        props.setProjectiles(prev => prev.filter(p => !toCull.includes(p.id)));
      }

      localTick(); // re-render this component only
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []); // Empty dependency array - RAF loop should run once and continue

  // Draw with Skia (glow + core + small tail) - no memoization needed since we use localTick
  const circles = Array.from(liveRef.current.values()).map((p) => {
    const r = p.r ?? 8;
    const sx = props.xToScreen(p.x);
    const sy = props.worldYToScreenY(p.y);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null;

    const tailDt = 0.04;
    const tailX = props.xToScreen(p.x - p.vx * tailDt);
    const tailY = props.worldYToScreenY(p.y - p.vy * tailDt);

    return (
      <Group key={p.id}>
        <Circle cx={sx} cy={sy} r={r * 1.9} color="#ff5a00" opacity={0.28} />
        <Circle cx={sx} cy={sy} r={r * 1.35} color="#ff9a00" opacity={0.55} />
        <Circle cx={sx} cy={sy} r={r} color="#fff47a" opacity={0.95} />
        <Circle cx={tailX} cy={tailY} r={Math.max(2, r * 0.6)} color="#ffd54a" opacity={0.6} />
      </Group>
    );
  });

  return <Group>{circles}</Group>;
}