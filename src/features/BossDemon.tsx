import React, { useEffect, useMemo, useRef, useReducer } from 'react';
import { useImage, Group } from '@shopify/react-native-skia';
import SpriteAtlasSprite from '../render/SpriteAtlasSprite';
import {
  BOSS_PROJECTILE_SPEED,
  BOSS_DEATH_FPS,
} from '../config/gameplay';
import { soundManager } from '../audio/SoundManager';

type Box = { left:number; right:number; top:number; bottom:number };
type PosePayload = {
  visual: Box;   // full sprite bounds
  solid: Box;    // smaller: used for blocking the player
  hurt:  Box;    // even smaller: used for taking sword damage
  centerX: number;
  centerY: number;
};

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
  onPose?: (pose: PosePayload) => void;

  // NEW:
  isHurt?: boolean;
  isDead?: boolean;
  onDeathDone?: () => void;
};

// Demon strip geometry (matches your DEATH.png: 553x69 -> 7 frames)
const DEMON_FW = 79;   // frame width in px
const DEMON_FH = 69;   // frame height in px
const FW = DEMON_FW;
const FH = DEMON_FH;
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
  // Keep freshest player coords for the RAF loop (avoid stale props in empty-deps effect)
  const playerXRef = useRef(props.playerX);
  const playerYRef = useRef(props.playerY);
  useEffect(() => { playerXRef.current = props.playerX; }, [props.playerX]);
  useEffect(() => { playerYRef.current = props.playerY; }, [props.playerY]);

  // Sprite strips (same pipeline as Dash)
  const idleImg   = useImage(require('../../assets/character/demon/IDLE.png'));
  const flyingImg = useImage(require('../../assets/character/demon/FLYING.png'));
  const attackImg = useImage(require('../../assets/character/demon/ATTACK.png'));

  // NEW:
  const hurtImg   = useImage(require('../../assets/character/demon/HURT.png'));
  const deathImg  = useImage(require('../../assets/character/demon/DEATH.png'));

  // Death playback state
  const dyingRef = React.useRef(false);         // latched when HP hits 0
  const deathFrameRef = React.useRef(0);
  const deathNotifiedRef = React.useRef(false);
  const [, forceRerender] = React.useReducer((x: number) => x + 1, 0);

  // Helper for frame count (keeps you safe if widths change)
  const framesOf = (img: ReturnType<typeof useImage> | null, frameW: number) => {
    if (!img) return 1;
    const w = typeof img.width === 'function' ? img.width() : img.width;
    return w ? Math.max(1, Math.floor(w / frameW)) : 1;
  };

  // Latch the DYING mode once (prevents the state machine from switching back)
  React.useEffect(() => {
    if (props.isDead) {
      dyingRef.current = true;
    } else {
      dyingRef.current = false;
      deathFrameRef.current = 0;
      deathNotifiedRef.current = false;
    }
  }, [props.isDead]);

  // Stop steering and any AI while dying/dead
  const aiEnabled = !dyingRef.current;

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
      state.current = aiEnabled ? (Math.sin(t.current * 0.8) > 0.82 ? 'attack' : 'fly') : 'fly';
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

      // approach + wobble + screen clamping
      if (aiEnabled) {
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
      }

      // Report boss AABB for collision detection
      if (props.onPose) {
        // If dying, clear all collision boxes immediately
        if (dyingRef.current) {
          const emptyBox: Box = { left: 0, right: 0, top: 0, bottom: 0 };
          props.onPose({ 
            visual: emptyBox, 
            solid: emptyBox, 
            hurt: emptyBox, 
            centerX: 0, 
            centerY: 0 
          });
        } else {
          // World-space sprite metrics
          const cxWorld = props.xWorld + cxBias.current; // sprite center X
          const cyFeet  = props.yWorld + cyBias.current; // baseline (feet)
          const W = FW * SCALE;
          const H = FH * SCALE;

          // Convert to a center-origin box (y-down world): centerY halfway between top & bottom
          const cY = cyFeet - H * 0.5;
          const visual: Box = {
            left:   cxWorld - W * 0.5,
            right:  cxWorld + W * 0.5,
            top:    cY      - H * 0.5,
            bottom: cY      + H * 0.5,
          };

          // Shrink factors (tighter so the box doesn't extend past the body)
          // Solid box: used for blocking the player
          const SOLID_FX = 0.42; // was 0.48 — narrower so it doesn't stick out horizontally
          const SOLID_FY = 0.52; // was 0.58 — shorter so it doesn't extend above/below the sprite
          // Hurt box: keep slightly smaller than solid to feel fair when striking
          const HURT_FX  = 0.46; // was 0.50
          const HURT_FY  = 0.50; // was 0.55

          const solidW = W * SOLID_FX, solidH = H * SOLID_FY;
          const hurtW  = W * HURT_FX,  hurtH  = H * HURT_FY;

          const solid: Box = {
            left:   cxWorld - solidW * 0.5,
            right:  cxWorld + solidW * 0.5,
            top:    cY      - solidH * 0.5,
            bottom: cY      + solidH * 0.5,
          };

          const hurt: Box = {
            left:   cxWorld - hurtW * 0.5,
            right:  cxWorld + hurtW * 0.5,
            top:    cY      - hurtH * 0.5,
            bottom: cY      + hurtH * 0.5,
          };

          props.onPose({ visual, solid, hurt, centerX: cxWorld, centerY: cY });
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // Empty dependency array - RAF loop should run once and continue

      // -------- RAF-based shooting (no intervals, no stale closures) ----------
      const nextShotAt = useRef(performance.now() + randInt(1200, 2600)); // quicker first shot
      useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;


      if (aiEnabled && !dyingRef.current && props.onShoot && now >= nextShotAt.current) {
        const cxWorld = props.xWorld + cxBias.current;
        const cyWorld = props.yWorld + cyBias.current;

        // Read the latest player coords (fresh every frame)
        const targetX = Number.isFinite(playerXRef.current) ? playerXRef.current : cxWorld;
        const targetY = Number.isFinite(playerYRef.current) ? playerYRef.current : cyWorld;

        const dx = targetX - cxWorld;
        const dy = targetY - cyWorld;
        const len = Math.hypot(dx, dy) || 1;
        const vx = (dx / len) * BOSS_PROJECTILE_SPEED;
        const vy = (dy / len) * BOSS_PROJECTILE_SPEED;

        props.onShoot({ x: cxWorld, y: cyWorld, vx, vy, lifeMs: 6000 });
        soundManager.playFireballSound(); // Play fireball sound when boss shoots
        nextShotAt.current = now + randInt(3000, 6000); // every 3–6s
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // Empty dependency array - RAF loop should run once and continue

  // Advance through the full DEATH strip, then despawn
  React.useEffect(() => {
    if (!dyingRef.current) return;
    
    // Wait for image to be decoded — width must be known
    const deathWidth = deathImg && (typeof deathImg.width === 'function' ? deathImg.width() : deathImg.width);
    if (!deathImg || !deathWidth) return;  // wait for decode

    const total = framesOf(deathImg, DEMON_FW);

    // single-frame safety
    if (total <= 1) {
      if (!deathNotifiedRef.current) {
        deathNotifiedRef.current = true;
        props.onDeathDone?.();
      }
      return;
    }

    const fps = BOSS_DEATH_FPS;
    const stepMs = 1000 / fps;
    let raf = 0, last = performance.now(), acc = 0;

    // Linger settings: replay last 2 frames ping-pong for ~1.2s
    const lingerMs = 1200;
    const lingerStartRef = { v: 0 }; // capture when we reach last frame

    const loop = (now: number) => {
      acc += (now - last); last = now;

      // Advance until last frame
      while (acc >= stepMs && deathFrameRef.current < total - 1) {
        deathFrameRef.current++;
        acc -= stepMs;
        forceRerender(); // show next frame
      }

      if (deathFrameRef.current >= total - 1) {
        // We've reached the final frame; start linger if not started
        if (lingerStartRef.v === 0) {
          lingerStartRef.v = now;
        }

        const since = now - lingerStartRef.v;
        const fA = total - 2, fB = total - 1;
        if (since < lingerMs) {
          // ping-pong last two frames at ~8 fps during linger
          const pingPongFps = 8;
          const pingStep = Math.floor((since / (1000 / pingPongFps)) % 2);
          deathFrameRef.current = pingStep ? fA : fB;
          forceRerender();
        } else {
          if (!deathNotifiedRef.current) {
            deathNotifiedRef.current = true;
            props.onDeathDone?.();   // tell parent to remove the boss
          }
          return; // stop
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dyingRef.current, deathImg && (typeof deathImg.width === 'function' ? deathImg.width() : deathImg.width)]);        // start once width is known

  // Choose sheet/frame with hard priority (DEATH wins, cannot be overridden)
  let sheet = flyingImg ?? idleImg;
  let frame = 0;
  let sheetType = 'fly/idle';

  // IMPORTANT: give DEATH absolute priority once latched
  if (dyingRef.current && deathImg) {
    sheet = deathImg;
    const total = framesOf(deathImg, DEMON_FW);
    frame = Math.min(deathFrameRef.current, total - 1);
    sheetType = 'DEATH';
  } else if (props.isHurt && hurtImg) {
    sheet = hurtImg;
    const total = framesOf(hurtImg, DEMON_FW);
    frame = Math.floor((performance.now() / 1000) * 12) % total;
    sheetType = 'HURT';
  } else if (state.current === 'attack' && attackImg) {
    sheet = attackImg;
    const total = framesOf(attackImg, DEMON_FW);
    frame = Math.floor((performance.now() / 1000) * 12) % total;
    sheetType = 'ATTACK';
  } else {
    sheet = flyingImg ?? idleImg;
    const total = framesOf(sheet, DEMON_FW);
    frame = Math.floor((performance.now() / 1000) * 8) % total;
    sheetType = 'FLY/IDLE';
  }
  
  if (!sheet) return null;

  const leftScreen = props.xToScreen(props.xWorld + cxBias.current) - (FW * SCALE) / 2;
  const baseY      = props.worldYToScreenY(props.yWorld + cyBias.current);
  const flipX      = props.playerX > (props.xWorld + cxBias.current);


  return (
    <Group>
      {/* Boss Sprite */}
      <SpriteAtlasSprite
        image={sheet}
        frame={{ x: frame * FW, y: 0, w: FW, h: FH, pivotX: 0.5, pivotY: 1 }} // normalized pivots
        x={leftScreen}
        baselineY={baseY}
        scale={SCALE}
        flipX={flipX}
      />
    </Group>
  );
}