import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Text, Pressable } from 'react-native';
import { Canvas, Rect, Group } from '@shopify/react-native-skia';

import { makeStaticFloor } from '../content/floor';
import { DashCharacter } from './DashCharacter';
import RNGHControls from '../input/RNGHControls';
import SafeTouchBoundary from '../infra/SafeTouchBoundary';
import { PrefabNode } from '../render/PrefabNode';
import ParallaxBackground from '../render/ParallaxBackground';
import { PARALLAX } from '../content/parallaxConfig';
import type { LevelData } from '../content/levels';
import { MAPS, getPrefab, getTileSize, prefabWidthPx, prefabTopSolidSegmentsPx, prefabPlatformSlabsPx } from '../content/maps';
import { useVerticalProcGen } from '../systems/useVerticalProcGen';
import { MapImageProvider } from '../render/MapImageContext';
import idleJson from '../../assets/character/dash/Idle_atlas.json';
import { dbg } from '../utils/dbg';

// Health system imports
import { useHealth } from '../systems/health/HealthContext';
import HealthBar from './HealthBar';
import HealthBarDebugger from './HealthBarDebugger';
import { DeathModal } from '../ui/DeathModal';
import { useDamageAnimations } from '../systems/health/useDamageAnimations';

// Audio system imports
import { useSound } from '../audio/useSound';

// debug flag
const VCOLLECT = __DEV__;
import { getPlayerBox } from '../physics/playerBox';
import {
  initJumpState, noteJumpPressed, tickJumpTimers,
  shouldExecuteJump, consumeJump, tickIgnoreCeil
} from '../physics/jump';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ───────────────────────────────────────────────────────────────────────────────
// Coordinate system unification
// - screen Y grows downward from the top of the canvas
// - world Z grows upward from the floor (z=0 at floor)
// - floorTopY is the screen-Y of the floor top line
// ───────────────────────────────────────────────────────────────────────────────
function yToZ(floorTopY: number, yScreen: number) {
  return floorTopY - yScreen;
}
function zToY(floorTopY: number, zWorld: number) {
  return floorTopY - zWorld;
}

// FIXED: Better balanced physics values
const SCALE      = 2;
const RUN_SPEED  = 195;
const GRAVITY    = 1200;  // REDUCED from 1800 for better jump feel
const JUMP_VEL   = 580;   // REDUCED from 822 for more responsive jumps
const JUMP_VELOCITY = JUMP_VEL;
const ACCEL = 800;
const DECEL = 600;
const PAD_SIZE = 140;
const FOOT_OFFSET = 1;

interface GameScreenProps {
  levelData: LevelData;
  onBack: () => void;
}

// Inner game component that uses health hooks
const InnerGameScreen: React.FC<GameScreenProps> = ({ levelData, onBack }) => {
  // Quick smoke test for prefab catalog
  useEffect(() => {
    const cat = (MAPS as any).grassy?.prefabs?.prefabs;
    console.log('[grassy] prefabs:', cat && Object.keys(cat).length);
    console.log('[grassy] has floor-final:', !!cat?.['floor-final']);
  }, []);

  // Handlers for death modal
  const handleRestart = useCallback(() => {
    resetHealth();
    
    // Reset player position to spawn point
    xRef.current = SCREEN_W * 0.5;
    zRef.current = 0;
    vxRef.current = 0;
    vzRef.current = 0;
    dirXRef.current = 0;
    speedRef.current = 'idle';
    onGroundRef.current = true;
    
    // Reset fall damage state
    peakZRef.current = 0;
    fallingRef.current = false;
    vzPrevRef.current = 0;
    onGroundPrevRef.current = true;
    
    // Reset jump state
    if (jumpStateRef.current) {
      jumpStateRef.current = initJumpState();
    }
    
    // Update state variables to trigger re-render
    setX(SCREEN_W * 0.5);
    setZ(0);
    setDirX(0);
    setSpeedLevel('idle');
    setCameraY(0);
    setCameraX(0);
    setFrameCount(0);
    setElapsedSec(0);
    
    // Reset crash counter
    crashCountRef.current = 0;
    
    console.log('[GameScreen] Level restarted - player reset to spawn point');
  }, []);

  const handleMainMenu = useCallback(() => {
    onBack();
  }, [onBack]);

  const [cameraX, setCameraX] = useState(0);
  const [cameraY, setCameraY] = useState(0);
  const [currentPlayerBox, setCurrentPlayerBox] = useState<{left: number; right: number; top: number; bottom: number; cx: number; feetY: number; w: number; h: number} | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Simple crash counter for debugging
  const crashCountRef = useRef(0);
  const lastLogTime = useRef(0);
  const frameTimeRef = useRef(0);
  const lastKnownState = useRef<any>(null);
  const collisionLoopCount = useRef(0);
  const frameSkipCount = useRef(0);
  const appStateRef = useRef('active');

  // State variables
  const [x, setX] = useState(SCREEN_W * 0.5);
  const [z, setZ] = useState(0);
  const [dirX, setDirX] = useState(0);
  const [speedLevel, setSpeedLevel] = useState<'idle'|'run'>('idle');
  
  // Refs for physics
  const xRef = useRef(SCREEN_W * 0.5);
  const zRef = useRef(0);
  const vxRef = useRef(0);
  const vzRef = useRef(0);
  const dirXRef = useRef(0);
  const speedRef = useRef<'idle'|'run'>('idle');
  const onGroundRef = useRef(true);
  const didWrapRef = useRef(false);
  const feetYRef = useRef(levelData?.floorTopY ?? 0);
  
  // Fall damage state machine (z-based)
  const peakZRef = useRef<number>(0);
  const fallingRef = useRef<boolean>(false);
  const vzPrevRef = useRef<number>(0);
  const onGroundPrevRef = useRef<boolean>(true);

  const SCREEN_H = Dimensions.get('window').height;
  const FALL_THRESHOLD = SCREEN_H / 5;

  // Health system integration
  const { isDead, bars, takeDamage, hits, sys, reset: resetHealth } = useHealth();
  
  // Audio system integration
  const { playJumpSound, playDamageSound } = useSound();
  const maxHits = sys.state.maxHits;
  const { isHurt } = useDamageAnimations();
  
  // Update feetY ref with current player position
  const feetY = currentPlayerBox?.feetY ?? (levelData?.floorTopY ?? 0);
  feetYRef.current = feetY;

  // Optional: disable input when dead
  const inputEnabled = !isDead;

  // FIXED: Proper floor calculation
  const floorTopY = useMemo(() => {
    const meta = (MAPS as any)[levelData.mapName]?.prefabs?.meta;
    const tile = meta?.tileSize ?? 16;

    const floorPrefabName = levelData.mapName === 'grassy' ? 'floor-final' : 'floor';
    const pf = (MAPS as any)[levelData.mapName]?.prefabs?.prefabs?.[floorPrefabName];
    const rows = (pf?.cells?.length ?? pf?.rects?.length ?? 2);

    const floorHeight = rows * tile * SCALE;
    const result = Math.round(SCREEN_H - floorHeight);
    
    return result;
  }, [levelData.mapName]);

  // FIXED: Calculate player's world Y position consistently
  const playerWorldY = floorTopY - zRef.current;

  // FIXED: Use procedural generation with consistent coordinate system
  const { platforms, decorations } = useVerticalProcGen(
    {
      mapName: levelData.mapName as any,
      floorTopY,
      initialPlatforms: levelData.platforms,
      initialDecorations: levelData.decorations,
      scale: 2,
      maxScreens: 10,
      initialBands: 1,
    },
    playerWorldY
  );

  const mapDef = MAPS[levelData.mapName];

  // Character dims
  const firstIdleKey = Object.keys((idleJson as any).frames)[0];
  const firstIdleFrame = (idleJson as any).frames[firstIdleKey];
  
  // Collider size
  const TILE = getTileSize(levelData.mapName) * SCALE;
  const COL_W = Math.round(0.58 * 48 * SCALE);
  const COL_H = Math.round(0.88 * 48 * SCALE) - 15;
  const CHAR_W = 48 * SCALE;
  const CHAR_H = 48 * SCALE;

  // Head span used ONLY for ceiling tests
  const HEAD_W = Math.max(6, Math.floor(COL_W * 0.35));
  const CEIL_PAD = 0.5;
  const CROSS_PAD = Math.max(1, Math.round(0.10 * TILE));

  // Jump controller with buffer + coyote
  const jumpStateRef = useRef(initJumpState());

  // Diagnostic refs for vz tracking
  const lastVzReason = useRef<string>('');
  const vzWasRef = useRef<number>(0);

  // Pad callback
  const onPad = (o: { dirX: -1|0|1; magX: number }) => {
    setDirX(o.dirX);
    dirXRef.current = o.dirX;

    const level = Math.abs(o.magX) < 0.02 ? 'idle' : 'run';
    setSpeedLevel(level);
    speedRef.current = level;
  };

  // Jump buffering
  const requestJump = () => { 
    try {
      if (!jumpStateRef.current) {
        jumpStateRef.current = initJumpState();
      }
      
      noteJumpPressed(jumpStateRef.current);
    } catch (error) {
      jumpStateRef.current = initJumpState();
    }
  };

  // Slab type used by physics in world-Y units (screen coordinates)
  type WorldSlab = {
    left: number;
    right: number;
    yTop: number;
    yBottom: number;
  };

  // Only real platforms collide
  const isSolidPrefab = (name: string) => /platform/i.test(name);

  // FIXED: Build platform slabs with proper coordinate system
  const platformSlabs: WorldSlab[] = useMemo(() => {
    const out: WorldSlab[] = [];
    for (const p of (platforms ?? [])) {
      if (!isSolidPrefab(p.prefab)) continue;
      const scale = p.scale ?? SCALE;
      const slabs = prefabPlatformSlabsPx(levelData.mapName, p.prefab, scale);
      for (const s of slabs) {
        // FIXED: Ensure coordinates are in world space (not camera-relative)
        const left  = p.x + s.x;
        const right = left + s.w;
        const yTop  = p.y + s.yTop;
        const yBottom = yTop + s.h;
        out.push({ left, right, yTop, yBottom });
      }
    }
    
    // Debug log every few frames
    if (__DEV__ && frameCount > 0 && frameCount % 120 === 0) {
      console.log(`[PlatformSlabs] Generated ${out.length} slabs, cameraY: ${Math.round(cameraY)}, playerZ: ${Math.round(zRef.current)}`);
      if (out.length > 0) {
        console.log(`[PlatformSlabs] First slab:`, {
          left: Math.round(out[0].left),
          right: Math.round(out[0].right),
          yTop: Math.round(out[0].yTop),
          yBottom: Math.round(out[0].yBottom)
        });
      }
    }
    
    return out;
  }, [levelData.mapName, platforms, SCALE, frameCount, cameraY]);

  // Memory leak detection for platformSlabs
  const platformSlabsRef = useRef<any[]>([]);
  useEffect(() => {
    platformSlabsRef.current = platformSlabs;
  }, [platformSlabs, frameCount]);

  // One-time spawn on floor
  useEffect(() => {
    zRef.current = 0;
    setZ(0);
  }, []);

  // FIXED: ONE RAF LOOP with better physics timing
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    
    frameTimeRef.current = performance.now();

    const loop = (t: number) => {
      try {
        if (__DEV__) {
          (globalThis as any).__dashFrameID = ((globalThis as any).__dashFrameID ?? 0) + 1;
          (globalThis as any).__dashDraws = 0;
        }
        
        didWrapRef.current = false;

        // FIXED: Better frame timing with 60 FPS cap
        const dt = Math.min(0.0166, (t - last) / 1000); // Cap at 16.6ms (60 FPS)
        last = t;

        // FRAME RATE LIMITER: Process at consistent 60 FPS
        if (dt < 0.0083) { // ~120 FPS cap
          raf = requestAnimationFrame(loop);
          return;
        }

        // Skip processing if dt is too large
        if (dt > 0.05) {
          frameSkipCount.current++;
          console.warn(`LARGE DT - SKIPPING FRAME #${frameSkipCount.current}:`, { dt: Math.round(dt * 1000) });
          raf = requestAnimationFrame(loop);
          return;
        }

        // Frame limit check
        if (frameCount > 10000) {
          console.warn('FRAME LIMIT REACHED - STOPPING GAME LOOP');
          return;
        }

        // Track last known state for crash analysis
        lastKnownState.current = {
          frameCount,
          x: xRef.current,
          z: zRef.current,
          vx: vxRef.current,
          vz: vzRef.current,
          onGround: onGroundRef.current,
          timestamp: Date.now()
        };

        // Validate critical refs
        if (!xRef.current && xRef.current !== 0) {
          crashCountRef.current++;
          console.error(`CRASH #${crashCountRef.current}: xRef is null/undefined`);
          return;
        }
        if (!zRef.current && zRef.current !== 0) {
          crashCountRef.current++;
          console.error(`CRASH #${crashCountRef.current}: zRef is null/undefined`);
          return;
        }
        if (vxRef.current === null || vxRef.current === undefined) {
          crashCountRef.current++;
          console.error(`CRASH #${crashCountRef.current}: vxRef is null/undefined`);
          return;
        }
        if (vzRef.current === null || vzRef.current === undefined) {
          crashCountRef.current++;
          console.error(`CRASH #${crashCountRef.current}: vzRef is null/undefined`);
          return;
        }

        // Additional validation for other critical refs
        if (!onGroundRef.current && onGroundRef.current !== false) {
          crashCountRef.current++;
          console.error(`CRASH #${crashCountRef.current}: onGroundRef is invalid`);
          return;
        }
        if (!jumpStateRef.current) {
          crashCountRef.current++;
          console.error(`CRASH #${crashCountRef.current}: jumpStateRef is null`);
          return;
        }

        // WORLD-space player box
        let box;
        try {
          box = getPlayerBox({
            xRefIsLeftEdge: true,
            x: xRef.current,
            z: zRef.current,
            floorTopY,
            charW: CHAR_W,
            colW: COL_W,
            colH: COL_H,
          });
          if (!box || typeof box.left !== 'number' || typeof box.right !== 'number') {
            console.error('CRASH: getPlayerBox returned invalid box', { box });
            return;
          }
        } catch (error) {
          console.error('CRASH in getPlayerBox:', error);
          return;
        }
        
        // Increment frame counter
        setFrameCount(prev => prev + 1);

        // Horizontal movement with momentum preservation
        const target = speedRef.current === 'idle' ? 0 : RUN_SPEED;

        // Apply friction only on ground
        if (onGroundRef.current) {
          vxRef.current *= 0.85;
          
          // Drive horizontal speed from input
          if (dirXRef.current !== 0) {
            const desired = dirXRef.current * target;
            const dv = desired - vxRef.current;
            const step = Math.sign(dv) * Math.min(Math.abs(dv), ACCEL * dt);
            vxRef.current += step;
          } else {
            const dv = -vxRef.current;
            const step = Math.sign(dv) * Math.min(Math.abs(dv), DECEL * dt);
            vxRef.current += step;
          }
        } else {
          // In air: stop momentum when no direction is pressed
          if (dirXRef.current === 0) {
            vxRef.current *= 0.1;
            if (Math.abs(vxRef.current) < 5) {
              vxRef.current = 0;
            }
          } else {
            // Allow some air control when direction is pressed
            const desired = dirXRef.current * target;
            const dv = desired - vxRef.current;
            const step = Math.sign(dv) * Math.min(Math.abs(dv), ACCEL * 0.3 * dt);
            vxRef.current += step;
          }
        }

        const prevX = xRef.current;
        xRef.current = xRef.current + vxRef.current * dt;

        // Screen wrap (left/right) keeping momentum & state
        {
          const spriteW = CHAR_W;
          const spriteCenter = xRef.current + spriteW * 0.5;
          
          if (spriteCenter < 0) {
            xRef.current += SCREEN_W;
            didWrapRef.current = true;
            if (__DEV__) dbg('WRAP: L→R', { x: Math.round(xRef.current), center: Math.round(spriteCenter) });
          }
          else if (spriteCenter > SCREEN_W) {
            xRef.current -= SCREEN_W;
            didWrapRef.current = true;
            if (__DEV__) dbg('WRAP: R→L', { x: Math.round(xRef.current), center: Math.round(spriteCenter) });
          }
        }

        // Rebuild player box at the new X
        box = getPlayerBox({
          xRefIsLeftEdge: true,
          x: xRef.current,
          z: zRef.current,
          floorTopY,
          charW: CHAR_W,
          colW: COL_W,
          colH: COL_H,
        });

        // Store player box for render
        setCurrentPlayerBox(box);

        const prevZ = zRef.current;

        // Diagnostic: track vz before vertical resolution
        vzWasRef.current = vzRef.current;
        lastVzReason.current = '';

        // integrate vertical
        vzRef.current -= GRAVITY * dt;
        zRef.current  += vzRef.current * dt;

        // WORLD Y from last frame to this frame
        const prevFeetY = floorTopY - prevZ;
        const prevTopY  = prevFeetY - COL_H;
        const currFeetY = floorTopY - zRef.current;
        const currTopY  = currFeetY - COL_H;

        // Head-only horizontal span for ceilings
        const headLeft  = box.cx - HEAD_W * 0.5;
        const headRight = box.cx + HEAD_W * 0.5;

        let vzReason: null | string = null;
        let vzWas = vzRef.current;

        // ==== LANDING (falling only) ====
        
        // Reset fall session when not falling
        if (vzRef.current >= 0 && fallingRef.current) {
          fallingRef.current = false;
          peakZRef.current = 0;
        }
        
        if (vzRef.current < 0) {
          
          // Fall session tracking
          if (!fallingRef.current) {
            fallingRef.current = true;
            peakZRef.current = Math.max(0, zRef.current);
          } else {
            peakZRef.current = Math.max(peakZRef.current, Math.max(0, zRef.current));
          }
          
          let bestTop: number | null = null;
          try {
            if (!platformSlabs || !Array.isArray(platformSlabs)) {
              console.error('CRASH: platformSlabs is invalid', { platformSlabs });
              return;
            }
            for (const s of platformSlabs) {
              if (!s || typeof s.left !== 'number' || typeof s.right !== 'number' || typeof s.yTop !== 'number') {
                console.error('CRASH: Invalid platform slab', { s });
                continue;
              }
              // horizontal overlap with full feet span
              if (box.right <= s.left || box.left >= s.right) continue;
              
              // FIXED: More precise landing detection
              // Check if player's feet crossed the platform top from above
              if (prevFeetY <= s.yTop + 1 && currFeetY >= s.yTop - CROSS_PAD) {
                if (bestTop === null || s.yTop < bestTop) bestTop = s.yTop;
              }
            }
          } catch (error) {
            console.error('CRASH in landing collision:', error);
          }
          if (bestTop !== null) {
            zRef.current  = Math.max(0, floorTopY - bestTop);
            vzRef.current = 0;
            onGroundRef.current = true;
            lastVzReason.current = 'land-top';

            // Z-based landing damage
            if (fallingRef.current) {
              const dropPx = Math.max(0, peakZRef.current - zRef.current);
              const threshold = Dimensions.get('window').height / 5;
              if (dropPx >= threshold) {
                takeDamage(1);
                playDamageSound();
              }
              fallingRef.current = false;
              peakZRef.current = 0;
            }
          } else {
            // No landing this frame → remain airborne
            onGroundRef.current = false;
          }
        }

        // ==== CEILING (rising only) ====
        if (vzRef.current > 0 && !lastVzReason.current) {
          const ignoreCeilNow = jumpStateRef.current.ignoreCeilFrames > 0;
          if (!ignoreCeilNow) {
            let bestBottom: number | null = null;
            let culprit: any = null;
            try {
              if (!platformSlabs || !Array.isArray(platformSlabs)) {
                console.error('CRASH: platformSlabs is invalid in ceiling check', { platformSlabs });
                return;
              }
              for (const s of platformSlabs) {
                if (!s || typeof s.left !== 'number' || typeof s.right !== 'number' || typeof s.yBottom !== 'number') {
                  console.error('CRASH: Invalid platform slab in ceiling check', { s });
                  continue;
                }
                // head-only horizontal span
                if (headRight <= s.left || headLeft >= s.right) continue;
                
                // FIXED: More precise ceiling collision
                const risingIntoPlatform = prevTopY >= s.yBottom - 1 && currTopY <= s.yBottom + CEIL_PAD;
                const feetAtOrAbovePlatform = currFeetY <= s.yTop + 10;
                
                if (risingIntoPlatform && feetAtOrAbovePlatform) {
                  if (bestBottom === null || s.yBottom > bestBottom) {
                    bestBottom = s.yBottom; culprit = s;
                  }
                }
              }
            } catch (error) {
              console.error('CRASH in ceiling collision:', error);
            }
            if (bestBottom !== null) {
              zRef.current  = Math.max(0, floorTopY - (bestBottom - CEIL_PAD));
              vzRef.current = 0;
              lastVzReason.current = 'bonk-bottom';
            }
          }
        }

        // ==== FLOOR CLAMP ====
        if (!lastVzReason.current && zRef.current < 0) {
          zRef.current = 0;
          if (vzRef.current < 0) vzRef.current = 0;
          
          if (vzRef.current <= 0) {
            onGroundRef.current = true;
            
            // Z-based landing damage
            if (fallingRef.current) {
              const dropPx = Math.max(0, peakZRef.current - zRef.current);
              const threshold = Dimensions.get('window').height / 5;
              if (dropPx >= threshold) {
                takeDamage(1);
                playDamageSound();
              }
              fallingRef.current = false;
              peakZRef.current = 0;
            }
          }
          lastVzReason.current = 'floor-clamp';
        }

        // Horizontal blocking
        let boxNow;
        try {
          collisionLoopCount.current = 0;
          
          boxNow = getPlayerBox({
            xRefIsLeftEdge: true,
            x: xRef.current,
            z: zRef.current,
            floorTopY,
            charW: CHAR_W,
            colW: COL_W,
            colH: COL_H,
          });
          if (!boxNow || typeof boxNow.left !== 'number' || typeof boxNow.right !== 'number') {
            console.error('CRASH: getPlayerBox returned invalid boxNow', { boxNow });
            return;
          }
        } catch (error) {
          console.error('CRASH in getPlayerBox (boxNow):', error);
          return;
        }

        // FIXED: Improved side collision (skip on wrap frame)
        if (!didWrapRef.current) {
          const SIDE_PUSH = 2;
          try {
            if (!platformSlabs || !Array.isArray(platformSlabs)) {
              console.error('CRASH: platformSlabs is invalid in side collision', { platformSlabs });
              return;
            }
            for (const s of platformSlabs) {
              if (!s || typeof s.left !== 'number' || typeof s.right !== 'number' || typeof s.yTop !== 'number' || typeof s.yBottom !== 'number') {
                console.error('CRASH: Invalid platform slab in side collision', { s });
                continue;
              }
              // More restrictive vertical overlap check
              const vertOverlap = (boxNow.bottom > s.yTop + 2) && (boxNow.top < s.yBottom - 2);
              if (!vertOverlap) continue;
              
              // moving right, hit left side
              if (vxRef.current > 0 && boxNow.right > s.left && boxNow.left < s.left) {
                xRef.current -= SIDE_PUSH;
                vxRef.current = 0;
                break;
              }
              // moving left, hit right side
              if (vxRef.current < 0 && boxNow.left < s.right && boxNow.right > s.right) {
                xRef.current += SIDE_PUSH;
                vxRef.current = 0;
                break;
              }
            }
          } catch (error) {
            console.error('CRASH in side collision:', error);
          }
        }

        // Update onGround based on vertical velocity
        if (vzRef.current <= 0) {
          // Only update onGround when falling or stationary
        } else {
          // When rising, ensure we're marked as in air
          onGroundRef.current = false;
        }

        // Update jump timers with post-collision grounded state
        try {
          if (!jumpStateRef.current) {
            console.error('CRASH: jumpStateRef is null');
            return;
          }
          tickJumpTimers(jumpStateRef.current, dt * 1000, onGroundRef.current);

          // Execute jump if buffered press and coyote allow it
          if (shouldExecuteJump(jumpStateRef.current)) {
            const prevVz = vzRef.current;
            vzRef.current = JUMP_VELOCITY;
            onGroundRef.current = false;
            consumeJump(jumpStateRef.current);
            
            // Play jump sound
            playJumpSound();
          }
        } catch (error) {
          console.error('CRASH in jump system:', error);
        }

        // Tick the liftoff ceiling-ignore counter
        tickIgnoreCeil(jumpStateRef.current);

        // Push to state for render with error handling
        try {
          setX(xRef.current);
          setZ(zRef.current);
          
          // Update parallax timing and camera
          setElapsedSec(t / 1000);
          
          // FIXED: Camera rise logic with better deadzone handling
          const DEADZONE_FROM_TOP = Math.round(SCREEN_H * 0.40);
          
          // Convert world Z (upwards from floor) to screen Y (downwards)
          const playerScreenY = zToY(floorTopY, zRef.current) - cameraY;
          
          // If player is getting too close to the top, move the world down
          if (playerScreenY < DEADZONE_FROM_TOP) {
            const target = playerScreenY - DEADZONE_FROM_TOP;
            if (target < cameraY) setCameraY(target);
          }
        } catch (error) {
          crashCountRef.current++;
          console.error(`CRASH #${crashCountRef.current} in state updates:`, error);
        }

        // Track previous values for next frame
        vzPrevRef.current = vzRef.current;
        onGroundPrevRef.current = onGroundRef.current;

        raf = requestAnimationFrame(loop);
      } catch (error) {
        crashCountRef.current++;
        console.error(`CRASH #${crashCountRef.current} in game loop:`, error);
        return;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [CHAR_W]);

  // Error boundary for render
  try {
    return (
      <SafeTouchBoundary>
        <View style={styles.root}>
        <MapImageProvider source={mapDef.image} tag={`MIP:${levelData.mapName}`}>
          <Canvas 
            style={styles.canvas}
            pointerEvents="none"
          >
            {/* Parallax Background */}
              <ParallaxBackground
              variant={PARALLAX[levelData.mapName]}
                cameraY={cameraY}
                timeSec={elapsedSec}
              viewport={{ width: SCREEN_W, height: SCREEN_H }}
              />
            
            {/* FIXED: Render world under a vertical camera transform */}
            <Group transform={[{ translateY: -cameraY }]}>
              {platforms?.filter(Boolean).map((platform, index) => {
                // Defensive check for required properties
                if (!platform || typeof platform.x !== 'number' || typeof platform.y !== 'number' || !platform.prefab) {
                  console.warn(`Invalid platform at index ${index}:`, platform);
                  return null;
                }
                
                return (
                <PrefabNode
                  key={`platform-${index}`}
                  map={levelData.mapName}
                  name={platform.prefab}
                  x={platform.x}
                  y={platform.y}
                  scale={platform.scale || 2}
                />
                );
              })}
              
              {/* Render decorations (non-colliding) */}
              {decorations?.filter(Boolean).map((decoration, index) => {
                // Defensive check for required properties
                if (!decoration || typeof decoration.x !== 'number' || typeof decoration.y !== 'number' || !decoration.prefab) {
                  console.warn(`Invalid decoration at index ${index}:`, decoration);
                  return null;
                }
                
                return (
                <PrefabNode
                  key={`decoration-${index}`}
                  map={levelData.mapName}
                  name={decoration.prefab}
                  x={decoration.x}
                  y={decoration.y}
                  scale={decoration.scale || 2}
                />
                );
              })}
            </Group>
            
            {/* FIXED: Debug collision visualization - uncomment for debugging */}
            {/*__DEV__ && platformSlabs.map((slab, index) => (
              <Group key={`collision-debug-${index}`} transform={[{ translateY: -cameraY }]}>
                <Rect
                  x={slab.left}
                  y={slab.yTop}
                  width={slab.right - slab.left}
                  height={slab.yBottom - slab.yTop}
                  color="magenta"
                  style="stroke"
                  strokeWidth={2}
                />
              </Group>
            ))*/}
            
            {/* Character renders in screen space (not affected by camera transform) */}
            <DashCharacter
              floorTopY={floorTopY}
              posX={xRef.current}
              lift={z}
              scale={SCALE}
              footOffset={FOOT_OFFSET}
              isHurt={isHurt}
              isDead={isDead}
              input={{
                vx: vxRef.current,
                dirX,
                crouch: false,
                onGround: onGroundRef.current,
              }}
            />
          </Canvas>
        </MapImageProvider>
        
        {/* Health Bar - rendered outside Canvas as Skia component */}
        <HealthBar 
          health={((maxHits - hits) / maxHits) * 100} 
          width={160} 
          height={28} 
          x={SCREEN_W - 160 + 20} 
          y={50} 
        />
        
        {/* Death modal */}
        <DeathModal 
          onRestart={handleRestart}
          onMainMenu={handleMainMenu}
        />
        
        {/* Controls overlay: must be last and visible */}
        <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]} pointerEvents="auto">
          <RNGHControls
            size={PAD_SIZE}
            margin={20}
            onPad={onPad}
            onJump={requestJump}
            disabled={isDead}
          />
        </View>
        
        {/* Debug overlay for troubleshooting - uncomment when needed */}
        {/*__DEV__ && (
          <View style={styles.debugOverlay}>
            <View style={styles.debugInfo}>
              <Text style={styles.debugText}>🔍 COLLISION DEBUG</Text>
              <Text style={styles.debugText}>Character: x={Math.round(x)} z={Math.round(z)}</Text>
              <Text style={styles.debugText}>Velocity: vx={Math.round(vxRef.current)} vz={Math.round(vzRef.current)}</Text>
              <Text style={styles.debugText}>On Ground: {onGroundRef.current ? 'YES' : 'NO'}</Text>
              <Text style={styles.debugText}>Collision Slabs: {platformSlabs.length}</Text>
              <Text style={styles.debugText}>Camera Y: {Math.round(cameraY)}</Text>
              <Text style={styles.debugText}>Platform Count: {platforms.length}</Text>
            </View>
        </View>
        )*/}
      </View>
      </SafeTouchBoundary>
    );
  } catch (error) {
    crashCountRef.current++;
    console.error(`CRASH #${crashCountRef.current} in render:`, error);
    
    // Return a simple error view
    return (
      <View style={styles.root}>
        <Text style={{ color: 'white', textAlign: 'center', marginTop: 100 }}>
          Render Error - Check Console
        </Text>
    </View>
  );
  }
};

// Main GameScreen component
export const GameScreen: React.FC<GameScreenProps> = ({ levelData, onBack }) => {
  return (
    <InnerGameScreen 
      levelData={levelData} 
      onBack={onBack}
    />
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  canvas: { flex: 1 },
  debugOverlay: {
    position: 'absolute',
    top: 50,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: 'magenta',
  },
  debugInfo: {
    flexDirection: 'column',
  },
  debugText: {
    color: 'white',
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 2,
  },
});