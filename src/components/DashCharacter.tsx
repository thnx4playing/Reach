import React, { useMemo, useEffect, useState } from 'react';
import { useImage } from '@shopify/react-native-skia';
import SpriteAtlasSprite from '../render/SpriteAtlasSprite';
import { useAnimator } from '../hooks/useAnimator';
import type { AtlasData, AtlasFrame } from '../types';

// Mount count guard removed to clean up code

import idleJson   from '../../assets/character/dash/Idle_atlas.json';
import walkJson   from '../../assets/character/dash/Walk_atlas.json';
import runJson    from '../../assets/character/dash/Run_atlas.json';
import jumpJson   from '../../assets/character/dash/Jump_atlas.json';
import hurtJson   from '../../assets/character/dash/Hurt-Damaged_atlas.json';
import deathJson  from '../../assets/character/dash/Death_atlas.json';

// Boss room animations
import swordIdleJson   from '../../assets/character/dash/Sword_Idle_atlas.json';
import katanaRunJson   from '../../assets/character/dash/Katana_Run_atlas.json';
import swordAttackJson from '../../assets/character/dash/Sword_Attack_atlas.json';

const idlePng  = require('../../assets/character/dash/Idle_atlas.png') as number;
const walkPng  = require('../../assets/character/dash/Walk_atlas.png') as number;
const runPng   = require('../../assets/character/dash/Run_atlas.png') as number;
const jumpPng  = require('../../assets/character/dash/Jump_atlas.png') as number;
const hurtPng  = require('../../assets/character/dash/Hurt-Damaged_atlas.png') as number;
const deathPng = require('../../assets/character/dash/Death_atlas.png') as number;

// Boss room animation assets
const swordIdlePng   = require('../../assets/character/dash/Sword_Idle_atlas.png') as number;
const katanaRunPng   = require('../../assets/character/dash/Katana_Run_atlas.png') as number;
const swordAttackPng = require('../../assets/character/dash/Sword_Attack_atlas.png') as number;

type AnimationState = 'idle'|'walk'|'run'|'jump'|'hurt'|'death'|'attack';

type InputState = {
  vx?: number;
  vy?: number;
  dirX?: -1|0|1;
  crouch?: boolean;
  onGround?: boolean;
};

type Props = {
  floorTopY: number;   // floor baseline (pixels)
  posX: number;        // left draw position
  lift: number;        // height above floor (0 on ground)
  scale?: number;      // overall character scale multiplier
  input?: InputState;
  id?: string;         // unique identifier for debugging
  footOffset?: number; // NEW - tunable foot offset
  isHurt?: boolean;    // NEW - override to hurt animation
  isDead?: boolean;    // NEW - override to death animation
  isBossRoom?: boolean; // NEW - use boss room animations
  isAttacking?: boolean; // NEW - override to attack animation
};

function sortFramesNumeric(keys: string[]) {
  const num = (s: string) => {
    const m = s.match(/(\d+)(?!.*\d)/);
    return m ? parseInt(m[1], 10) : 0;
  };
  return [...keys].sort((a, b) => {
    const na = num(a), nb = num(b);
    return na === nb ? a.localeCompare(b) : na - nb;
  });
}

function useAnim(json: AtlasData, png: number, fps: number) {
  const image = useImage(png);
  const framesMap = json.frames;
  const frames = useMemo(() => sortFramesNumeric(Object.keys(framesMap)), [framesMap]);
  return useMemo(() => ({ atlas: { image, frames: framesMap }, frames, fps, json }) as const, [image, framesMap, frames, fps]);
}

// Hysteresis thresholds to prevent jitter - more responsive
const WALK_IN = 3;   // enter walk above this speed (more responsive)
const WALK_OUT = 1;  // leave walk below this speed (lower than WALK_IN)
const RUN_IN = 80;   // enter run above this speed (more responsive)
const RUN_OUT = 60;  // leave run below this speed (lower than RUN_IN)

function pickState(input?: InputState, prevState?: AnimationState, isHurt?: boolean, isDead?: boolean, isAttackingProp?: boolean): AnimationState {
  // Death animation takes highest priority
  if (isDead) return 'death';
  
  // Hurt animation takes priority over everything else (except death)
  if (isHurt) return 'hurt';
  
  // Attack animation takes priority over movement (except death/hurt)
  if (isAttackingProp) return 'attack';
  
  const vx = Math.abs(input?.vx ?? 0);
  const dirX = Math.abs(input?.dirX ?? 0);
  const onGround = !!input?.onGround;
  
  if (!onGround) return 'jump';
  
  // Make "run" depend on actual horizontal intent (dirX) and speed
  const speed = vx * dirX; // Only run if actually moving horizontally
  
  // Handle walk/run transitions with hysteresis
  if (prevState === 'run') {
    return speed >= RUN_OUT ? (speed >= RUN_IN ? 'run' : 'walk') : (speed >= WALK_IN ? 'walk' : 'idle');
  }
  
  if (prevState === 'walk') {
    return speed >= RUN_IN ? 'run' : (speed >= WALK_OUT ? 'walk' : 'idle');
  }
  
  if (prevState === 'idle') {
    return speed >= RUN_IN ? 'run' : (speed >= WALK_IN ? 'walk' : 'idle');
  }
  
  // Default for other states
  if (speed < WALK_IN) return 'idle';
  if (speed < RUN_IN) return 'walk';
  return 'run';
}

export const DashCharacter: React.FC<Props> = ({ floorTopY, posX, lift, scale = 2, input, id = "Dash@World", footOffset = 2, isHurt = false, isDead = false, isBossRoom = false, isAttacking = false }) => {
  // Regular animations
  const idle  = useAnim(idleJson,  idlePng,  10);
  const walk  = useAnim(walkJson,  walkPng,  12);
  const run   = useAnim(runJson,   runPng,   16);
  const jump  = useAnim(jumpJson,  jumpPng,  10);
  const hurt  = useAnim(hurtJson,  hurtPng,  12);
  const death = useAnim(deathJson, deathPng, 10);

  // Boss room animations
  const swordIdle   = useAnim(swordIdleJson,   swordIdlePng,   10);
  const katanaRun   = useAnim(katanaRunJson,   katanaRunPng,   16);
  const swordAttack = useAnim(swordAttackJson, swordAttackPng, 12);

  // Mount count guard removed to clean up code

  // Track previous state for hysteresis
  const [prevState, setPrevState] = useState<AnimationState>('idle');
  const state = pickState(input, prevState, isHurt, isDead, isAttacking);
  
  
  // Update previous state when current state changes
  useEffect(() => {
    setPrevState(state);
  }, [state]);

  // Select animation based on state and boss room mode
  const current = state === 'death' ? death :
                  state === 'hurt' ? hurt :
                  state === 'attack' ? swordAttack :
                  state === 'jump' ? jump :
                  state === 'walk' ? (isBossRoom ? swordIdle : walk) : // Boss room uses sword idle for walk
                  state === 'run' ? (isBossRoom ? katanaRun : run) :   // Boss room uses katana run
                  (isBossRoom ? swordIdle : idle); // Boss room uses sword idle for idle

  // Keep last non-zero facing so Idle doesn't snap
  const [facingLeft, setFacingLeft] = useState(false);
  useEffect(() => {
    if (input?.dirX && input.dirX !== 0) setFacingLeft(input.dirX < 0);
  }, [input?.dirX]);

  // Use animator with loop rules per state
  const isJumping = state === 'jump';
  const isHurting = state === 'hurt';
  const isDying = state === 'death';
  const isAttackingState = state === 'attack';
  const frameName = useAnimator(current.frames, current.fps, {
    loop: !isJumping && !isHurting && !isDying && !isAttackingState,  // idle/run loop, jump/hurt/death/attack do not
    holdOnEnd: isJumping || isHurting || isDying || isAttackingState // hold last frame for jump/hurt/death/attack
  });
  const fr = current.json.frames[frameName] || { x: 0, y: 0, w: 48, h: 48 };

  // Normalize jump height to idle height (you already had this):
  const idleFirst = idle.json.frames[idle.frames[0]];
  const refH = idleFirst?.h ?? fr.h;   // reference height
  const drawScale = scale * ((refH || fr.h) / fr.h); // shrink 288->48 for jump, etc.

  // --- RENDER EXACTLY ONE FRAME ---
  // IMPORTANT: This is the ONLY place we render the character sprite
  const FOOT_OFFSET = footOffset;  // tunable from props
  return (
    <SpriteAtlasSprite
      tag={`${id}:${state}`}
      image={current.atlas.image!}
      frame={{ x: fr.x, y: fr.y, w: fr.w, h: fr.h, pivotX: fr.pivotX, pivotY: fr.pivotY }}
      x={posX}
      baselineY={floorTopY + FOOT_OFFSET - lift}
      scale={drawScale}
      flipX={facingLeft}
    />
  );
};