import React, { useEffect, useMemo, useRef } from 'react';
import { useImage } from '@shopify/react-native-skia';
import SpriteAtlasSprite from '../render/SpriteAtlasSprite';
import {
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

const FW = 79;
const FH = 69;
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

function randInt(a: number, b: number) { return Math.floor(a + Math.random() * (b - a + 1)); }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

export default function BossDemon(props: Props) {
  // Sprite strips (same pipeline as Dash)
  const idleImg   = useImage(require('../../assets/character/demon/IDLE.png'));
  const flyingImg = useImage(require('../../assets/character/demon/FLYING.png'));
  const attackImg = useImage(require('../../assets/character/demon/ATTACK.png'));

  // Animation set
  const state = useRef<'fly'|'attack'>('fly');
  const t = useRef(0);
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      t.current += dt;
      // brief attack windows to spice up the strip choice
      state.current = Math.sin(t.current * 0.8) > 0.82 ? 'attack' : 'fly';
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // -------- Waypoint wander (screen-space goals) ----------
  const cxBias = useRef(0);   // world px bias we add to xWorld
  const cyBias = useRef(0);   // world px bias we add to yWorld
  const targetX = useRef(props.screenW * 0.50);
  const targetY = useRef(props.screenH * 0.35);
  const nextWpAt = useRef(0);

  useEffect(() => {
    // pick a new waypoint every 2.5–4.5s
    const pick = () => {
      // choices across the whole room including low near the floor
      const choices: Array<[number, number]> = [
        [0.22, 0.28], [0.50, 0.28], [0.78, 0.28],
        [0.25, 0.50], [0.50, 0.55], [0.75, 0.52],
        [0.33, 0.75], [0.50, 0.78], [0.67, 0.74], // lower passes
      ];
      const [fx, fy] = choices[randInt(0, choices.length - 1)];
      targetX.current = fx * props.screenW;
      targetY.current = fy * props.screenH;
      nextWpAt.current = Date.now() + randInt(2500, 4500);
    };
    pick();
    const id = setInterval(() => {
      if (Date.now() >= nextWpAt.current) pick();
    }, 250);
    return () => clearInterval(id);
  }, [props.screenW, props.screenH]);

  // steer biases toward target each frame
  useEffect(() => {
    let raf = 0, last = performance.now();
    const margin = 16;
    const demonW = FW * SCALE;
    const demonH = FH * SCALE;

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      // current centers (screen)
      const currX = props.xToScreen(props.xWorld + cxBias.current);
      const currY = props.worldYToScreenY(props.yWorld + cyBias.current);

      // soft follow toward waypoint with a little wiggle
      const wiggleX = Math.sin(t.current * 1.6) * 16;
      const wiggleY = Math.sin(t.current * 2.1) * 10;
      const aimX = targetX.current + wiggleX;
      const aimY = targetY.current + wiggleY;

      // assume 1:1 world<->screen scale (your game uses world=px)
      const k = 3.0; // approach speed
      cxBias.current += (aimX - currX) * (k * dt);
      cyBias.current += (aimY - currY) * (k * dt);

      // hard keep-on-screen correction
      const cxScreen = props.xToScreen(props.xWorld + cxBias.current);
      const cyScreen = props.worldYToScreenY(props.yWorld + cyBias.current);
      const minX = margin + demonW / 2;
      const maxX = props.screenW - margin - demonW / 2;
      const minY = margin + demonH / 2;
      const maxY = props.screenH - margin - demonH / 2;

      if (cxScreen < minX)  cxBias.current += (minX - cxScreen) * 0.6;
      if (cxScreen > maxX)  cxBias.current -= (cxScreen - maxX) * 0.6;
      if (cyScreen < minY)  cyBias.current += (minY - cyScreen) * 0.6;
      if (cyScreen > maxY)  cyBias.current -= (cyScreen - maxY) * 0.6;

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [props.xWorld, props.yWorld, props.xToScreen, props.worldYToScreenY, props.screenW, props.screenH]);

      // -------- RAF-based shooting (no intervals, no stale closures) ----------
      const nextShotAt = useRef(performance.now() + randInt(1200, 2600)); // quicker first shot
      useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;


      if (props.onShoot && now >= nextShotAt.current) {
        // Use current hover center (world) for aim
        const cxWorld = props.xWorld + cxBias.current;
        const cyWorld = props.yWorld + cyBias.current;
        
        // Get FRESH player position from props (no stale closures)
        const dx = props.playerX - cxWorld;
        const dy = props.playerY - cyWorld;
        const len = Math.max(1, Math.hypot(dx, dy));
        const vx = (dx / len) * BOSS_PROJECTILE_SPEED;
        const vy = (dy / len) * BOSS_PROJECTILE_SPEED;
        
        props.onShoot({ x: cxWorld, y: cyWorld, vx, vy, lifeMs: 6000 });
        nextShotAt.current = now + randInt(3000, 6000); // every 3–6s
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [props.onShoot, props.playerX, props.playerY, props.xWorld, props.yWorld]);

  // --- choose strip + animate (same renderer as Dash) ---
  const img = state.current === 'attack' ? (attackImg ?? flyingImg ?? idleImg) : (flyingImg ?? idleImg);
  const frameCount = useMemo(() => (img ? Math.max(1, Math.floor(img.width() / FW)) : 1), [img]);
  const frame = useTicker(10, frameCount);
  if (!img) return null;

  const leftScreen = props.xToScreen(props.xWorld + cxBias.current) - (FW * SCALE) / 2;
  const baseY      = props.worldYToScreenY(props.yWorld + cyBias.current);
  const flipX      = props.playerX < (props.xWorld + cxBias.current);

  return (
    <SpriteAtlasSprite
      image={img}
      frame={{ x: frame * FW, y: 0, w: FW, h: FH, pivotX: 0.5, pivotY: 1 }} // normalized pivots
      x={leftScreen}
      baselineY={baseY}
      scale={SCALE}
      flipX={flipX}
    />
  );
}