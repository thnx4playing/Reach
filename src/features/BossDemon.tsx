// src/features/BossDemon.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { useImage } from '@shopify/react-native-skia';
import SpriteAtlasSprite from '../render/SpriteAtlasSprite';
import {
  BOSS_FIRE_COOLDOWN_MIN,
  BOSS_FIRE_COOLDOWN_MAX,
  BOSS_PROJECTILE_SPEED,
} from '../config/gameplay';

type Props = {
  xWorld: number;
  yWorld: number;
  worldYToScreenY: (yWorld: number) => number;
  xToScreen: (xWorld: number) => number;
  screenW: number;
  screenH: number;
  playerX: number;
  playerY: number;
  onShoot?: (p: { x: number; y: number; vx: number; vy: number; lifeMs: number }) => void;
};

const FW = 79;   // demon frame width in the PNG strips
const FH = 69;   // demon frame height
const SCALE = 1.5;

function useTicker(fps: number, max: number) {
  const frameRef = useRef(0);
  const [, bump] = React.useReducer((x) => x + 1, 0);
  useEffect(() => {
    let raf = 0;
    const period = 1000 / fps;
    let last = performance.now();
    const loop = (t: number) => {
      if (t - last >= period) {
        frameRef.current = (frameRef.current + 1) % Math.max(1, max);
        last = t;
        bump();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fps, max]);
  return frameRef.current;
}

export default function BossDemon(props: Props) {
  // Load strips
  const idleImg   = useImage(require('../../assets/character/demon/IDLE.png'));
  const flyingImg = useImage(require('../../assets/character/demon/FLYING.png'));
  const attackImg = useImage(require('../../assets/character/demon/ATTACK.png'));

  // Simple state machine driven by time
  const t = useRef(0);
  const state = useRef<'fly' | 'attack'>('fly');
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      t.current += dt;
      state.current = Math.sin(t.current * 0.8) > 0.85 ? 'attack' : 'fly';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- Shooting cadence (MUST be before any early return to keep hook order stable)
  const nextShotAt = useRef(Date.now() + rand(BOSS_FIRE_COOLDOWN_MIN, BOSS_FIRE_COOLDOWN_MAX));
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      if (!props.onShoot) return;
      if (now >= nextShotAt.current) {
        // Use current hover center for aim
        const cx = props.xWorld + Math.sin(t.current * 0.85) * 160;
        const cy = props.yWorld + Math.sin(t.current * 1.7) * 28;
        const dx = props.playerX - cx;
        const dy = props.playerY - cy;
        const len = Math.max(1, Math.hypot(dx, dy));
        const vx = (dx / len) * BOSS_PROJECTILE_SPEED;
        const vy = (dy / len) * BOSS_PROJECTILE_SPEED;
        props.onShoot({ x: cx, y: cy, vx, vy, lifeMs: 6000 });
        nextShotAt.current = now + rand(BOSS_FIRE_COOLDOWN_MIN, BOSS_FIRE_COOLDOWN_MAX);
      }
    }, 200);
    return () => clearInterval(id);
  }, [props.playerX, props.playerY, props.onShoot]);
  // ----

  // Choose strip exactly like Dash's sprite path expects
  const img = state.current === 'attack' ? (attackImg ?? flyingImg ?? idleImg) : (flyingImg ?? idleImg);
  const frameCount = useMemo(() => (img ? Math.max(1, Math.floor(img.width() / FW)) : 1), [img]);
  const frame = useTicker(10, frameCount);

  if (!img) return null;

  // Hover path
  const xCenter = props.xWorld + Math.sin(t.current * 0.85) * 160;
  const yCenter = props.yWorld + Math.sin(t.current * 1.7) * 28;

  const leftScreen = props.xToScreen(xCenter) - (FW * SCALE) / 2;
  const baseY      = props.worldYToScreenY(yCenter);
  const flipX      = props.playerX < xCenter;

  return (
    <SpriteAtlasSprite
      image={img}
      frame={{
        x: frame * FW,
        y: 0,
        w: FW,
        h: FH,
        // ⬇️ pivotY must be normalized (0..1). 1 = feet on baseline.
        pivotX: 0.5,   // (normalized) not used by renderer today but safe
        pivotY: 1
      }}
      x={leftScreen}
      baselineY={baseY}
      scale={SCALE}
      flipX={flipX}
    />
  );
}

function rand(a: number, b: number) {
  return Math.floor(a + Math.random() * (b - a));
}