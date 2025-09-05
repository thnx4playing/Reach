import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Text, Pressable } from 'react-native';
import { Canvas, Rect } from '@shopify/react-native-skia';

import { makeStaticFloor } from '../content/floor';
import { DashCharacter } from './DashCharacter';
import RNGHControls from '../input/RNGHControls';
import SafeTouchBoundary from '../infra/SafeTouchBoundary';
import { PrefabNode } from '../render/PrefabNode';
import ParallaxBackground from '../render/ParallaxBackground';
import { PARALLAX } from '../content/parallaxConfig';
import type { LevelData } from '../content/levels';
import { MAPS, getPrefab, getTileSize, prefabWidthPx, prefabTopSolidSegmentsPx, prefabPlatformSlabsPx } from '../content/maps';
import { MapImageProvider } from '../render/MapImageContext';
// import TestTile from '../render/TestTile';
import idleJson from '../../assets/character/dash/Idle_atlas.json';
// Quiet logger
import { dbg } from '../utils/dbg';

// Health system imports
import { useHealth } from '../systems/health/HealthContext';
import HPBar from '../ui/HPBar';
import { DeathModal } from '../ui/DeathModal';
import { useDamageAnimations } from '../systems/health/useDamageAnimations';

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
  // convert a screen-Y (downward) to world-Z (upward)
  return floorTopY - yScreen;
}
function zToY(floorTopY: number, zWorld: number) {
  // convert a world-Z (upward) to screen-Y (downward)
  return floorTopY - zWorld;
}

// Feel
const SCALE      = 2;
const RUN_SPEED  = 195; // Single movement speed
const GRAVITY    = 1800;
  const JUMP_VEL   = 822;  // Increased by 30% (was 632, originally 565)
  const JUMP_VELOCITY = JUMP_VEL;  // Alias for consistency
const ACCEL = 800;  // Acceleration rate
const DECEL = 600;  // Deceleration rate
const PAD_SIZE = 140;  // Consistent control sizing
const FOOT_OFFSET = 1; // tweak 0..2 to taste

interface GameScreenProps {
  levelData: LevelData;
  onBack: () => void;
}

// Inner game component that uses health hooks
const InnerGameScreen: React.FC<GameScreenProps> = ({ levelData, onBack }) => {
  // Handlers for death modal
  const handleRestart = useCallback(() => {
    // Reset health and restart level
    // TODO: Implement level restart logic
  }, []);

  const handleMainMenu = useCallback(() => {
    onBack();
  }, [onBack]);

  const [cameraY, setCameraY] = useState(0);
  const [cameraX, setCameraX] = useState(0);
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
  // --- Fall damage state machine (z-based) ---
  const peakZRef = useRef<number>(0);
  const fallingRef = useRef<boolean>(false);
  const vzPrevRef = useRef<number>(0);
  const onGroundPrevRef = useRef<boolean>(true);

  const SCREEN_H = Dimensions.get('window').height;
  // Tune this feel later. Use /5 for easy confirmation, /3 for your original design.
  const FALL_THRESHOLD = SCREEN_H / 5;

  // Health system integration
  const { isDead, bars, takeDamage, hits, sys } = useHealth();
  const maxHits = sys.state.maxHits;
  const { isHurt } = useDamageAnimations();
  
  
  // Update feetY ref with current player position
  const feetY = currentPlayerBox?.feetY ?? (levelData?.floorTopY ?? 0);
  feetYRef.current = feetY;
  

  // Optional: disable input when dead
  const inputEnabled = !isDead;

  // Highest surface under a given X (one-way collision)


  // Floor pieces are already included in levelData.platforms from buildLevel()
  // Use proper floor calculation from floor.ts
  


const floorTopY = useMemo(() => {
  // tile size + prefab rows from the active map
  const meta = (MAPS as any)[levelData.mapName]?.prefabs?.meta;
  const tile = meta?.tileSize ?? 16;

  const pf = (MAPS as any)[levelData.mapName]?.prefabs?.prefabs?.floor;
  const rows = (pf?.cells?.length ?? pf?.rects?.length ?? 2);

  const floorHeight = rows * tile * SCALE; // rows * tile * SCALE
  const result = Math.round(SCREEN_H - floorHeight);
  
  
  return result;
}, [levelData.mapName]);

  const mapDef = MAPS[levelData.mapName];

  // Character dims (keep as before; just ensure both W & H exist)
  const firstIdleKey = Object.keys((idleJson as any).frames)[0];
  const firstIdleFrame = (idleJson as any).frames[firstIdleKey];
  
  // Collider size (stable, not tied to animation frame)
  const TILE = getTileSize(levelData.mapName) * SCALE;
  const COL_W = Math.round(0.58 * 48 * SCALE); // tweak if you want tighter/looser
  const COL_H = Math.round(0.88 * 48 * SCALE) - 15; // Lowered by 15px
  const CHAR_W = 48 * SCALE;
  const CHAR_H = 48 * SCALE;

  // NEW: head span used ONLY for ceiling tests (so shoulders don't catch ledges)
  const HEAD_W = Math.max(6, Math.floor(COL_W * 0.35));
  const CEIL_PAD = 0.5;                // how close to allow before bonk
  const CROSS_PAD = Math.max(1, Math.round(0.10 * TILE)); // landing tolerance



  // Jump controller with buffer + coyote
  const jumpStateRef = useRef(initJumpState());

  // Diagnostic refs for vz tracking
  const lastVzReason = useRef<string>('');
  const vzWasRef = useRef<number>(0);

  // Pad callback (from CirclePad): update refs + state mirror
  const onPad = (o: { dirX: -1|0|1; magX: number }) => {
    setDirX(o.dirX);
    dirXRef.current = o.dirX;

    // Simplified: just run or idle based on any movement
    const level = Math.abs(o.magX) < 0.02 ? 'idle' : 'run';
    setSpeedLevel(level);
    speedRef.current = level;
  };

  // Jump buffering - call this from the button
  const requestJump = () => { 
    try {
      // Safety check for jumpStateRef
      if (!jumpStateRef.current) {
        jumpStateRef.current = initJumpState();
      }
      
      noteJumpPressed(jumpStateRef.current);
    } catch (error) {
      // Reinitialize jump state if there's an error
      jumpStateRef.current = initJumpState();
    }
  };

  // Slab type used by physics in world-Y units (screen coordinates)
  type WorldSlab = {
    left: number;   // screen-X in pixels
    right: number;  // screen-X in pixels
    yTop: number;   // screen-Y of top face
    yBottom: number;// screen-Y of bottom face
  };

  // Only real platforms collide (decor stays background-only)
  const isSolidPrefab = (name: string) => /platform/i.test(name);

  // Build platform slabs in world space (no camera)
  const platformSlabs: WorldSlab[] = useMemo(() => {
    const out: WorldSlab[] = [];
    for (const p of (levelData.platforms ?? [])) {
      if (!isSolidPrefab(p.prefab)) continue;         // process only solid platforms
      const scale = p.scale ?? SCALE;
      const slabs = prefabPlatformSlabsPx(levelData.mapName, p.prefab, scale);
      for (const s of slabs) {
        const left  = p.x + s.x;                 // WORLD px (map space)
        const right = left + s.w;
        const yTop  = p.y + s.yTop;
        const yBottom = yTop + s.h;
        out.push({ left, right, yTop, yBottom });
      }
    }
    
    
    return out;
  }, [levelData.mapName, levelData.platforms, SCALE]);

  // Memory leak detection for platformSlabs
  const platformSlabsRef = useRef<any[]>([]);
  useEffect(() => {
    platformSlabsRef.current = platformSlabs;
  }, [platformSlabs, frameCount]);

  // DISABLED: App state monitoring - was potentially causing crashes
  // useEffect(() => {
  //   const handleAppStateChange = (nextAppState: string) => {
  //     console.log('APP STATE CHANGE:', { from: appStateRef.current, to: nextAppState });
  //     appStateRef.current = nextAppState;
  //     
  //     if (nextAppState === 'background' || nextAppState === 'inactive') {
  //       console.log('APP BACKGROUNDED - PAUSING GAME');
  //     } else if (nextAppState === 'active') {
  //       console.log('APP FOREGROUNDED - RESUMING GAME');
  //     }
  //   };

  //   // Import AppState from React Native
  //   const { AppState } = require('react-native');
  //   const subscription = AppState.addEventListener('change', handleAppStateChange);

  //   return () => subscription?.remove();
  // }, []);






  // One-time spawn on floor
  useEffect(() => {
    zRef.current = 0;
    setZ(0);
  }, []);

  // ONE RAF LOOP — runs once; uses refs so it never duplicates.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    
    // Initialize frame time reference to prevent insane values
    frameTimeRef.current = performance.now();

    const loop = (t: number) => {
      try {
        // At the very start of your loop(t):
        if (__DEV__) {
          // increment a global frame id and reset per-frame draw counter
          (globalThis as any).__dashFrameID = ((globalThis as any).__dashFrameID ?? 0) + 1;
          (globalThis as any).__dashDraws = 0;
        }
        
        // Reset wrap flag for this frame
        didWrapRef.current = false;

      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;

      // FRAME RATE LIMITER: Don't process more than 60 FPS
      if (dt < 0.016) {
        raf = requestAnimationFrame(loop);
        return;
      }

      // CRASH PREVENTION: Skip processing if dt is too large (indicates performance issues)
      if (dt > 0.1) {
        frameSkipCount.current++;
        console.warn(`LARGE DT - SKIPPING FRAME #${frameSkipCount.current}:`, { dt: Math.round(dt * 1000) });
        raf = requestAnimationFrame(loop);
        return;
      }

      // CRASH PREVENTION: Limit frame processing to prevent overload
      if (frameCount > 10000) {
        console.warn('FRAME LIMIT REACHED - STOPPING GAME LOOP');
        return;
      }

      // DISABLED: Performance monitoring - was causing crashes
      // const rawFrameTime = t - frameTimeRef.current;
      // const frameTime = Math.min(rawFrameTime, 100);
      // frameTimeRef.current = t;

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

      // Validate critical refs with more detailed logging
      if (!xRef.current && xRef.current !== 0) {
        crashCountRef.current++;
        console.error(`CRASH #${crashCountRef.current}: xRef is null/undefined`, { 
          xRef: xRef.current, 
          frame: frameCount,
          timestamp: Date.now()
        });
        return;
      }
      if (!zRef.current && zRef.current !== 0) {
        crashCountRef.current++;
        console.error(`CRASH #${crashCountRef.current}: zRef is null/undefined`, { 
          zRef: zRef.current, 
          frame: frameCount,
          timestamp: Date.now()
        });
        return;
      }
      if (vxRef.current === null || vxRef.current === undefined) {
        crashCountRef.current++;
        console.error(`CRASH #${crashCountRef.current}: vxRef is null/undefined`, { 
          vxRef: vxRef.current, 
          frame: frameCount,
          timestamp: Date.now()
        });
        return;
      }
      if (vzRef.current === null || vzRef.current === undefined) {
        crashCountRef.current++;
        console.error(`CRASH #${crashCountRef.current}: vzRef is null/undefined`, { 
          vzRef: vzRef.current, 
          frame: frameCount,
          timestamp: Date.now()
        });
        return;
      }

      // Additional validation for other critical refs
      if (!onGroundRef.current && onGroundRef.current !== false) {
        crashCountRef.current++;
        console.error(`CRASH #${crashCountRef.current}: onGroundRef is invalid`, { 
          onGround: onGroundRef.current, 
          frame: frameCount,
          timestamp: Date.now()
        });
        return;
      }
      if (!jumpStateRef.current) {
        crashCountRef.current++;
        console.error(`CRASH #${crashCountRef.current}: jumpStateRef is null`, { 
          jumpState: jumpStateRef.current, 
          frame: frameCount,
          timestamp: Date.now()
        });
        return;
      }

      // WORLD-space player box
      let box;
      try {
        box = getPlayerBox({
          xRefIsLeftEdge: true,          // ← important for your project
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
      
      // Store player box for render section (will be set after wrapping)
      
      // Increment frame counter
      setFrameCount(prev => prev + 1);

      // Horizontal movement with momentum preservation
      const target = speedRef.current === 'idle' ? 0 : RUN_SPEED;
      

      // Apply friction only on ground
      if (onGroundRef.current) {
        vxRef.current *= 0.85;     // ground friction
        
        // Drive horizontal speed from input bands (only on ground)
        if (dirXRef.current !== 0) {
          const desired = dirXRef.current * target;
          const dv = desired - vxRef.current;
          const step = Math.sign(dv) * Math.min(Math.abs(dv), ACCEL);
          vxRef.current += step;
        } else {
          const dv = -vxRef.current;
          const step = Math.sign(dv) * Math.min(Math.abs(dv), DECEL);
          vxRef.current += step;
        }
      } else {
  // In air: stop momentum when no direction is pressed
  if (dirXRef.current === 0) {
    vxRef.current *= 0.1;  // Stop momentum immediately
    if (Math.abs(vxRef.current) < 5) {
      vxRef.current = 0;   // Snap to zero if very small
    }
  } else {
    // Allow some air control when direction is pressed
    const desired = dirXRef.current * target;
    const dv = desired - vxRef.current;
    const step = Math.sign(dv) * Math.min(Math.abs(dv), ACCEL * 0.3); // Reduced air control
    vxRef.current += step;
  }
}

      const prevX = xRef.current;
      xRef.current = xRef.current + vxRef.current * dt;

      // --- Screen wrap (left/right) keeping momentum & state ---
      {
        const spriteW = CHAR_W;               // xRef is LEFT EDGE of the sprite
        const spriteCenter = xRef.current + spriteW * 0.5;  // Center of the sprite
        
        // If the sprite center crossed the left edge, wrap to the right
        if (spriteCenter < 0) {
          xRef.current += SCREEN_W;
          didWrapRef.current = true;
          if (__DEV__) dbg('WRAP: L→R', { x: Math.round(xRef.current), center: Math.round(spriteCenter) });
        }
        // If the sprite center crossed the right edge, wrap to the left
        else if (spriteCenter > SCREEN_W) {
          xRef.current -= SCREEN_W;
          didWrapRef.current = true;
          if (__DEV__) dbg('WRAP: R→L', { x: Math.round(xRef.current), center: Math.round(spriteCenter) });
        }
      }

      // Rebuild player box at the new X (used by side/vertical collision below)
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

      // Head-only horizontal span for ceilings (avoid shoulder catches)
      const headLeft  = box.cx - HEAD_W * 0.5;
      const headRight = box.cx + HEAD_W * 0.5;

      let vzReason: null | string = null;  // who zeroed vz this frame?
      let vzWas = vzRef.current;

      // ==== LANDING (falling only) ====
      
      // Reset fall session when not falling
      if (vzRef.current >= 0 && fallingRef.current) {
        fallingRef.current = false;
        peakZRef.current = 0;
      }
      
      if (vzRef.current < 0) { // Only when actually falling (not stationary or rising)
        
        // --- FALL SESSION (z-based) ---
        // Start fall session when character starts falling, regardless of ground state
        if (!fallingRef.current) {
          fallingRef.current = true;
          peakZRef.current = Math.max(0, zRef.current); // start from current height above floor, but never negative
        } else {
          // Track highest height reached during this airtime
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
            // swept cross: feet moved from above to below the slab top
            if (prevFeetY <= s.yTop + 1e-4 && currFeetY >= s.yTop - CROSS_PAD) {
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

          // --- Z-BASED LANDING DAMAGE ---
          if (fallingRef.current) {
            const dropPx = Math.max(0, peakZRef.current - zRef.current); // zAtLand is ~0
            const threshold = Dimensions.get('window').height / 5; // tune: /5 to test, /3 later
            if (dropPx >= threshold) {
              takeDamage(1);
            }
            fallingRef.current = false;
            peakZRef.current = 0;
          }
        } else {
          // No landing this frame → remain airborne and keep tracking apex
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
              // Only block ceiling collision if character is rising into platform from the side
              // This means: character's head is crossing the platform bottom AND
              // the character's feet are at the same level or above the platform top
              const risingIntoPlatform = prevTopY >= s.yBottom - 1e-4 && currTopY <= s.yBottom + CEIL_PAD;
              const feetAtOrAbovePlatform = currFeetY <= s.yTop + 10; // Small tolerance
              
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
            if (VCOLLECT) {
              console.warn('CEILING BONK', {
                cx: Math.round(box.cx),
                head: [Math.round(headLeft), Math.round(headRight)],
                prevTopY: Math.round(prevTopY),
                currTopY: Math.round(currTopY),
                slab: {
                  left: Math.round(culprit.left),
                  right: Math.round(culprit.right),
                  yTop: Math.round(culprit.yTop),
                  yBottom: Math.round(culprit.yBottom),
                }
              });
            }
          }
        }
      }

      // ==== FLOOR CLAMP (only if actually below floor) ====
      if (!lastVzReason.current && zRef.current < 0) {
        zRef.current = 0;
        if (vzRef.current < 0) vzRef.current = 0; // don't kill upward motion
        // Only set onGround=true if we're not actively jumping (vz > 0 means rising)
        if (vzRef.current <= 0) {
          onGroundRef.current = true;
          
          // --- Z-BASED LANDING DAMAGE ---
          if (fallingRef.current) {
            const dropPx = Math.max(0, peakZRef.current - zRef.current); // zAtLand ~ 0
            const threshold = Dimensions.get('window').height / 5;
            if (dropPx >= threshold) {
              takeDamage(1);
            }
            fallingRef.current = false;
            peakZRef.current = 0;
          }
        }
        lastVzReason.current = 'floor-clamp';
      }


      // 3) Horizontal blocking (only when vertically overlapping)
      // after xRef update
      let boxNow;
      try {
        // Reset collision loop counter
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

      // Improved side collision with smaller pushes (skip on wrap frame)
      if (!didWrapRef.current) {
        const SIDE_PUSH = 2; // Fixed small push distance
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
            xRef.current -= SIDE_PUSH; // Small fixed push
            vxRef.current = 0;
            break;
          }
          // moving left, hit right side
          if (vxRef.current < 0 && boxNow.left < s.right && boxNow.right > s.right) {
            xRef.current += SIDE_PUSH; // Small fixed push
            vxRef.current = 0;
            break;
          }
        }
      } catch (error) {
        console.error('CRASH in side collision:', error);
      }
        } // Close the didWrapRef guard


      // Update onGround based on vertical velocity (only when falling or landed)
      if (vzRef.current <= 0) {
        // Only update onGround when falling or stationary
        // (onGround is already set correctly in the vertical collision block above)
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
          vzRef.current = JUMP_VELOCITY;        // e.g., 632
          onGroundRef.current = false;
          consumeJump(jumpStateRef.current);
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
        // Keep background stable - no vertical camera movement to prevent jumping
        setCameraY(0);
      } catch (error) {
        crashCountRef.current++;
        console.error(`CRASH #${crashCountRef.current} in state updates:`, error, {
          x: xRef.current,
          z: zRef.current,
          frame: frameCount,
          timestamp: Date.now()
        });
      }

      // Track previous values for next frame
      vzPrevRef.current = vzRef.current;
      onGroundPrevRef.current = onGroundRef.current;

      raf = requestAnimationFrame(loop);
      } catch (error) {
        crashCountRef.current++;
        console.error(`CRASH #${crashCountRef.current} in game loop:`, error, {
          frameCount,
          x: xRef.current,
          z: zRef.current,
          timestamp: Date.now()
        });
        // Don't continue the loop after a crash
        return;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [CHAR_W]); // only depends on sprite width

  // Error boundary for render
  try {
    // DISABLED: Render logging - was potentially causing crashes
    // if (__DEV__ && frameCount % 60 === 0) {
    //   console.log('RENDER ATTEMPT:', {
    //     frameCount,
    //     x, z, cameraX, cameraY,
    //     platformCount: levelData.platforms?.length || 0,
    //     decorationCount: levelData.decorations?.length || 0
    //   });
    // }

  return (
    <SafeTouchBoundary>
      <View style={styles.root}>
      <MapImageProvider source={mapDef.image} tag={`MIP:${levelData.mapName}`}>
        <Canvas 
          style={styles.canvas}
          // CRITICAL: Disable all touch handling on Canvas to prevent conflicts
          pointerEvents="none"
        >
          {/* Parallax Background */}
            <ParallaxBackground
            variant={PARALLAX[levelData.mapName]}
              cameraY={cameraY}
              timeSec={elapsedSec}
            viewport={{ width: SCREEN_W, height: SCREEN_H }}
            />
          
          {/* Test tile canary - shows instantly if image loading works */}
          {/* <TestTile /> */}
          
          {/* Render all platforms (includes floor pieces) */}
          {levelData.platforms?.filter(Boolean).map((platform, index) => {
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
          {levelData.decorations?.filter(Boolean).map((decoration, index) => {
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
          
          {/* DISABLED: Collision debug rendering - was potentially causing crashes */}
          {/* {__DEV__ && platformSlabs.map((slab, index) => (
            <Rect
              key={`collision-${index}`}
              x={slab.left}
              y={slab.yTop}
              width={slab.right - slab.left}
              height={slab.yBottom - slab.yTop}
              color="magenta"
              style="stroke"
              strokeWidth={2}
            />
          ))} */}
          
          {/* DISABLED: Character collision debug rendering - was potentially causing crashes */}
          {/* {__DEV__ && currentPlayerBox && (() => {
            // SCREEN-space values used by the sprite image
            const screenLeft   = Math.round(xRef.current - cameraX);
            const screenBottom = Math.round((floorTopY - zRef.current) - cameraY);
            const screenTop    = screenBottom - CHAR_H;

            // draw CYAN collider using the SAME screen anchor
            const rectX = screenLeft + Math.round((CHAR_W - COL_W) * 0.5);
            const rectY = screenBottom - COL_H;

            // Quick sanity logs (delete later)
            if (__DEV__ && frameCount % 30 === 0) {
              const screenCxFromWorld = (xRef.current + CHAR_W * 0.5) - cameraX; // since xRef is left-edge
              const screenCxFromRect  = rectX + COL_W * 0.5;
              // These must match within ~1px
              if (Math.abs(screenCxFromWorld - screenCxFromRect) > 1) {
                console.warn('CENTER MISMATCH', { screenCxFromWorld, screenCxFromRect, rectX, screenLeft });
              }
            }

            return (
              <Rect
                x={rectX}
                y={rectY}
                width={COL_W}
                height={COL_H}
                color="cyan"
                style="stroke"
                strokeWidth={1}
              />
            );
          })()} */}
          
          {/* 🔴 IMPORTANT: ensure there is ONLY ONE DashCharacter in the tree */}
          <DashCharacter
            floorTopY={floorTopY}
            posX={xRef.current}  // Character renders at left edge (sprite positioning)
            lift={z}
            scale={SCALE}
            footOffset={FOOT_OFFSET}
            isHurt={isHurt}  // Pass hurt state for damage animation
            isDead={isDead}  // Pass death state for death animation
            input={{
              vx: vxRef.current,  // Use actual velocity for momentum preservation
              dirX,
              crouch: false,  // Always false - no crouch functionality
              onGround: onGroundRef.current,
            }}
          />
        </Canvas>
      </MapImageProvider>
      
      {/* HP Bar - rendered outside Canvas as Skia component */}
      <HPBar />
      
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
        />
        {/* Debug overlay removed to prevent crashes */}
      </View>
      
      {/* DISABLED: Debug overlay - was potentially causing crashes */}
      {/* {__DEV__ && (
        <View style={styles.debugOverlay}>
          <View style={styles.debugInfo}>
            <Text style={styles.debugText}>🔍 COLLISION DEBUG</Text>
            <Text style={styles.debugText}>Character: x={Math.round(x)} z={Math.round(z)}</Text>
            <Text style={styles.debugText}>Velocity: vx={Math.round(vxRef.current)} vz={Math.round(vzRef.current)}</Text>
            <Text style={styles.debugText}>On Ground: {onGroundRef.current ? 'YES' : 'NO'}</Text>
            <Text style={styles.debugText}>Collision Slabs: {platformSlabs.length}</Text>
            <Text style={styles.debugText}>Floor Top Y: {floorTopY}</Text>
            <Text style={styles.debugText}>Character Size: {CHAR_W}x{CHAR_H}</Text>
          </View>
      </View>
      )} */}
    </View>
    </SafeTouchBoundary>
  );
    } catch (error) {
    crashCountRef.current++;
    console.error(`CRASH #${crashCountRef.current} in render:`, error, {
      levelData: levelData?.mapName,
      cameraX,
      cameraY,
      x,
      z,
      frame: frameCount,
      timestamp: Date.now()
    });
    
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