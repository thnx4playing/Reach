// src/features/BossDemon.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Group } from '@shopify/react-native-skia';
import { useImage } from '@shopify/react-native-skia';
import { SubImageShader } from '../ui/SubImageShader';
import {
  BOSS_FIRE_COOLDOWN_MIN, BOSS_FIRE_COOLDOWN_MAX,
  BOSS_PROJECTILE_SPEED, BOSS_DAMAGE_PER_HIT,
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
  onShoot: (proj: { x: number; y: number; vx: number; vy: number; lifeMs: number }) => void;
};

const FW = 79; // derived from sheet widths
const FH = 69;

function useStrip(src: any) {
  const img = useImage(src);
  return img;
}

function useFrameTicker(fps: number, frameCount: number) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    let raf: any;
    let last = Date.now();
    function tick() {
      const now = Date.now();
      if (now - last > 1000 / fps) {
        setFrame(f => (f + 1) % frameCount);
        last = now;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, frameCount]);
  return frame;
}

export default function BossDemon(props: Props) {
  const idle = useStrip(require('../../assets/character/demon/IDLE.png'));
  const flying = useStrip(require('../../assets/character/demon/FLYING.png'));
  const attack = useStrip(require('../../assets/character/demon/ATTACK.png'));
  const hurt = useStrip(require('../../assets/character/demon/HURT.png'));
  const death = useStrip(require('../../assets/character/demon/DEATH.png'));
  const projectileImg = useStrip(require('../../assets/character/demon/projectile.png'));

  const [mode, setMode] = useState<'idle'|'fly'|'attack'>('fly');
  const frame = useFrameTicker(10, mode === 'attack' ? 8 : 4);
  const img = mode === 'attack' ? attack : mode === 'fly' ? flying : idle;

  // shooting cadence
  const nextShotAtRef = useRef<number>(Date.now() + rand(BOSS_FIRE_COOLDOWN_MIN, BOSS_FIRE_COOLDOWN_MAX));
  useEffect(() => {
    const int = setInterval(() => {
      const now = Date.now();
      if (now >= nextShotAtRef.current) {
        // aim at player
        const dx = props.playerX - props.xWorld;
        const dy = props.playerY - props.yWorld;
        const mag = Math.max(1, Math.hypot(dx, dy));
        const vx = (dx / mag) * BOSS_PROJECTILE_SPEED;
        const vy = (dy / mag) * BOSS_PROJECTILE_SPEED;
        props.onShoot({ x: props.xWorld, y: props.yWorld, vx, vy, lifeMs: 4000 });
        nextShotAtRef.current = now + rand(BOSS_FIRE_COOLDOWN_MIN, BOSS_FIRE_COOLDOWN_MAX);
      }
    }, 150);
    return () => clearInterval(int);
  }, [props.playerX, props.playerY]);

  if (!img) return null;
  const x = props.xToScreen(props.xWorld) - FW/2;
  const y = props.worldYToScreenY(props.yWorld) - FH;
  if (x < -200 || x > props.screenW+200) return null;
  if (y < -200 || y > props.screenH+200) return null;

  return (
    <Group>
      <SubImageShader image={img} frame={{ x: frame*FW, y: 0, w: FW, h: FH }} x={x} y={y} scale={1.5} />
    </Group>
  );
}

function rand(a: number, b: number) {
  return Math.floor(a + Math.random() * (b - a));
}