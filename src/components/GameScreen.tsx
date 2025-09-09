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
import { ImagePreloaderProvider } from '../render/ImagePreloaderContext';
import idleJson from '../../assets/character/dash/Idle_atlas.json';
import { dbg } from '../utils/dbg';

// Health system imports
import { useHealth } from '../systems/health/HealthContext';
import HealthBar from './HealthBar';
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

// PERFORMANCE OPTIMIZED: Restored original balanced physics values
const SCALE      = 2;
const RUN_SPEED  = 220;   // INCREASED back to original feel
const GRAVITY    = 1500;  // RESTORED: Better balance between responsive and floaty
const JUMP_VEL   = 650;   // RESTORED: Good jump height that feels responsive
const JUMP_VELOCITY = JUMP_VEL;
const ACCEL = 1200;  // INCREASED: Faster acceleration
const DECEL = 800;   // INCREASED: Faster deceleration  
const PAD_SIZE = 140;
const FOOT_OFFSET = 1;

interface GameScreenProps {
  levelData: LevelData;
  onBack: () => void;
}

// Inner game component that uses health hooks
const InnerGameScreen: React.FC<GameScreenProps> = ({ levelData, onBack }) => {
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

  // Floor calculation
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

  // Calculate player's world Y position
  const playerWorldY = floorTopY - zRef.current;

  // Use procedural generation with consistent coordinate system
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
  const onPad = useCallback((o: { dirX: -1|0|1; magX: number }) => {
    setDirX(o.dirX);
    dirXRef.current = o.dirX;

    const level = Math.abs(o.magX) < 0.02 ? 'idle' : 'run';
    setSpeedLevel(level);
    speedRef.current = level;
  }, []);

  // Jump buffering
  const requestJump = useCallback(() => { 
    if (!jumpStateRef.current) {
      jumpStateRef.current = initJumpState();
    }
    noteJumpPressed(jumpStateRef.current);
  }, []);

  // Slab type used by physics in world-Y units (screen coordinates)
  type WorldSlab = {
    left: number;
    right: number;
    yTop: number;
    yBottom: number;
  };

  // Only real platforms collide
  const isSolidPrefab = (name: string) => /platform/i.test(name);

  // PERFORMANCE: Memoize platform slabs and update less frequently
  const platformSlabs: WorldSlab[] = useMemo(() => {
    const start = performance.now();
    const out: WorldSlab[] = [];
    let platformCount = 0;
    let slabCount = 0;
    
    for (const p of (platforms ?? [])) {
      if (!isSolidPrefab(p.prefab)) continue;
      platformCount++;
      const scale = p.scale ?? SCALE;
      const slabs = prefabPlatformSlabsPx(levelData.mapName, p.prefab, scale);
      for (const s of slabs) {
        slabCount++;
        const left  = p.x + s.x;
        const right = left + s.w;
        const yTop  = p.y + s.yTop;
        const yBottom = yTop + s.h;
        out.push({ left, right, yTop, yBottom });
      }
    }
    
    const time = performance.now() - start;
    if (__DEV__ && time > 8) {
      console.log(`[PERF] PlatformSlabs generation: ${time.toFixed(2)}ms for ${platformCount} platforms, ${slabCount} slabs`);
    }
    
    return out;
  }, [levelData.mapName, platforms, SCALE]);
   // Build a simple vertical bucket index for slabs to reduce per-frame collision checks
   const slabBuckets = useMemo(() => {
     const CELL_H = 64; // pixels per vertical bucket
     const buckets = new Map<number, WorldSlab[]>();
     
     for (const s of platformSlabs) {
       const topBucket = Math.floor(s.yTop / CELL_H);
       const bottomBucket = Math.floor((s.yTop + (s.yBottom - s.yTop)) / CELL_H);
       for (let b = topBucket; b <= bottomBucket; b++) {
         const arr = buckets.get(b) || [];
         arr.push(s);
         buckets.set(b, arr);
       }
     }
     return { buckets, CELL_H };
   }, [platformSlabs]);
 // Removed frameCount dependency for performance

  // One-time spawn on floor
  useEffect(() => {
    zRef.current = 0;
    setZ(0);
  }, []);

  // PERFORMANCE DEBUGGING: Extensive debugging for character movement issues
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frameCount = 0;
    let lastDebugTime = 0;
    let totalLoopTime = 0;
    let maxLoopTime = 0;
    let minLoopTime = Infinity;

    const loop = (t: number) => {
      const loopStart = performance.now();
      frameCount++;
      
      // PERFORMANCE: Simplified timing - just use basic delta time
      const dt = Math.min(0.0166, (t - last) / 1000); // Cap at 60 FPS
      last = t;

      // Skip only if delta time is too large (lag spike)
      if (dt > 0.05) {
        if (false && __DEV__) {
          console.log(`[PERF] Skipping frame - dt: ${dt.toFixed(4)}`);
        }
        raf = requestAnimationFrame(loop);
        return;
      }

      didWrapRef.current = false;

      // PERFORMANCE: Removed extensive validation - trust the refs
      
      // PERFORMANCE DEBUG: Track getPlayerBox timing
      const boxStart = performance.now();
      const box = getPlayerBox({
        xRefIsLeftEdge: true,
        x: xRef.current,
        z: zRef.current,
        floorTopY,
        charW: CHAR_W,
        colW: COL_W,
        colH: COL_H,
      });
      const boxTime = performance.now() - boxStart;
      
      // Increment frame counter (throttled)
      if (frameCount % 4 === 0) {
        setFrameCount(prev => prev + 1);
      }

      // PERFORMANCE: Simplified horizontal movement
      const target = speedRef.current === 'idle' ? 0 : RUN_SPEED;

      if (onGroundRef.current) {
        // Ground movement with improved responsiveness
        if (dirXRef.current !== 0) {
          const desired = dirXRef.current * target;
          vxRef.current = desired * 0.8 + vxRef.current * 0.2; // Fast lerp
        } else {
          vxRef.current *= 0.75; // Quick deceleration
        }
      } else {
        // Air control
        if (dirXRef.current === 0) {
          vxRef.current *= 0.95; // Slight air resistance
        } else {
          const desired = dirXRef.current * target * 0.5; // Reduced air control
          vxRef.current = desired * 0.3 + vxRef.current * 0.7;
        }
      }

      // Update horizontal position
      xRef.current += vxRef.current * dt;

      // Screen wrap
      const spriteW = CHAR_W;
      const spriteCenter = xRef.current + spriteW * 0.5;
      
      if (spriteCenter < 0) {
        xRef.current += SCREEN_W;
        didWrapRef.current = true;
      } else if (spriteCenter > SCREEN_W) {
        xRef.current -= SCREEN_W;
        didWrapRef.current = true;
      }

      // PERFORMANCE DEBUG: Track second getPlayerBox timing
      const newBoxStart = performance.now();
      const newBox = getPlayerBox({
        xRefIsLeftEdge: true,
        x: xRef.current,
        z: zRef.current,
        floorTopY,
        charW: CHAR_W,
        colW: COL_W,
        colH: COL_H,
      });
      const newBoxTime = performance.now() - newBoxStart;

      setCurrentPlayerBox(newBox);

      const prevZ = zRef.current;
      lastVzReason.current = '';

      // Calculate Y positions for collision detection BEFORE updating physics
      const prevFeetY = floorTopY - prevZ;

      // PERFORMANCE: Simplified vertical physics
      vzRef.current -= GRAVITY * dt;
      zRef.current += vzRef.current * dt;

      // Calculate current Y position after physics update
      const currFeetY = floorTopY - zRef.current;
      const prevTopY = prevFeetY - COL_H;
      const currTopY = currFeetY - COL_H;

      // Head span for ceiling collision
      const headLeft = newBox.cx - HEAD_W * 0.5;
      const headRight = newBox.cx + HEAD_W * 0.5;

      // ==== ONE-WAY PLATFORM COLLISION: LANDING ONLY (falling only) ====
      
      // Initialize collision tracking variables
      let collisionTime = 0;
      let collisionChecks = 0;
      
      // Reset fall session when not falling
      if (vzRef.current >= 0 && fallingRef.current) {
        fallingRef.current = false;
        peakZRef.current = 0;
      }
      
      // FIXED: Only check platform collision when falling (vzRef.current < 0)
      if (vzRef.current < 0) {
        
        // Fall session tracking
        if (!fallingRef.current) {
          fallingRef.current = true;
          peakZRef.current = Math.max(0, zRef.current);
        } else {
          peakZRef.current = Math.max(peakZRef.current, Math.max(0, zRef.current));
        }
        
        let bestTop: number | null = null;
        
        // PERFORMANCE DEBUG: Track collision detection timing
        const collisionStart = performance.now();
        
         // Use bucketed collision detection for better performance
         const yMin = Math.min(prevFeetY, currFeetY) - 48;
         const yMax = Math.max(prevFeetY, currFeetY) + 4;
         const bMin = Math.floor(yMin / slabBuckets.CELL_H);
         const bMax = Math.floor(yMax / slabBuckets.CELL_H);
         const candidates: WorldSlab[] = [];
         for (let b = bMin; b <= bMax; b++) {
           const arr = slabBuckets.buckets.get(b);
           if (arr) candidates.push(...arr);
         }
         for (const s of candidates) {
          collisionChecks++;
          // Check horizontal overlap
          if (newBox.right <= s.left || newBox.left >= s.right) continue;
          
          // FIXED: One-way platform collision - only land on top when falling
          // Player's feet must cross the platform top from above
          const crossedFromAbove = prevFeetY <= s.yTop && currFeetY >= s.yTop - CROSS_PAD;
          
          if (crossedFromAbove) {
            if (bestTop === null || s.yTop < bestTop) {
              bestTop = s.yTop;
            }
          }
        }
        
        collisionTime = performance.now() - collisionStart;
        
        if (bestTop !== null) {
          zRef.current = Math.max(0, floorTopY - bestTop);
          vzRef.current = 0;
          onGroundRef.current = true;
          lastVzReason.current = 'land-top';

          // Fall damage
          if (fallingRef.current) {
            const dropPx = Math.max(0, peakZRef.current - zRef.current);
            if (dropPx >= FALL_THRESHOLD) {
              takeDamage(1);
              playDamageSound();
            }
            fallingRef.current = false;
            peakZRef.current = 0;
          }
        } else {
          onGroundRef.current = false;
        }
      }

      // ==== CEILING COLLISION (rising only) ====
      // NOTE: No ceiling collision with platforms - they're one-way
      // Only check ceiling collision with solid blocks if you have them
      
      // ==== FLOOR CLAMP ====
      if (!lastVzReason.current && zRef.current < 0) {
        zRef.current = 0;
        if (vzRef.current < 0) vzRef.current = 0;
        
        if (vzRef.current <= 0) {
          onGroundRef.current = true;
          
          // Fall damage for floor
          if (fallingRef.current) {
            const dropPx = Math.max(0, peakZRef.current - zRef.current);
            if (dropPx >= FALL_THRESHOLD) {
              takeDamage(1);
              playDamageSound();
            }
            fallingRef.current = false;
            peakZRef.current = 0;
          }
        }
        lastVzReason.current = 'floor-clamp';
      }

      // REMOVED: Side collision for one-way platforms
      // Platforms are one-way, so no side blocking

      // Update onGround state
      if (vzRef.current > 0) {
        onGroundRef.current = false;
      }

      // Jump system
      tickJumpTimers(jumpStateRef.current, dt * 1000, onGroundRef.current);

      if (shouldExecuteJump(jumpStateRef.current)) {
        vzRef.current = JUMP_VELOCITY;
        onGroundRef.current = false;
        consumeJump(jumpStateRef.current);
        playJumpSound();
      }

      tickIgnoreCeil(jumpStateRef.current);

      // PERFORMANCE: Throttled state updates
      if (frameCount % 2 === 0) {
        setX(xRef.current);
        setZ(zRef.current);
        setElapsedSec(t / 1000);
        
        // Camera logic
        const DEADZONE_FROM_TOP = Math.round(SCREEN_H * 0.40);
        const playerScreenY = zToY(floorTopY, zRef.current) - cameraY;
        
        if (playerScreenY < DEADZONE_FROM_TOP) {
          const target = playerScreenY - DEADZONE_FROM_TOP;
          if (target < cameraY) setCameraY(Math.round(target));
        }
      }

      // PERFORMANCE DEBUG: Track total loop time and log periodically
      const loopTime = performance.now() - loopStart;
      totalLoopTime += loopTime;
      maxLoopTime = Math.max(maxLoopTime, loopTime);
      minLoopTime = Math.min(minLoopTime, loopTime);
      
      // Log performance stats every 2 seconds
      if (t - lastDebugTime > 2000) {
        const avgLoopTime = totalLoopTime / frameCount;
        const fps = frameCount / ((t - lastDebugTime) / 1000);
        
        console.log(`[PERF] Frame Stats (${frameCount} frames):`, {
          avgLoopTime: avgLoopTime.toFixed(2) + 'ms',
          maxLoopTime: maxLoopTime.toFixed(2) + 'ms',
          minLoopTime: minLoopTime.toFixed(2) + 'ms',
          fps: fps.toFixed(1),
          boxTime: boxTime.toFixed(2) + 'ms',
          newBoxTime: newBoxTime.toFixed(2) + 'ms',
          collisionTime: collisionTime.toFixed(2) + 'ms',
          collisionChecks: collisionChecks,
          platformSlabs: platformSlabs.length,
          platforms: platforms?.length || 0,
          decorations: decorations?.length || 0
        });
        
        // Reset counters
        frameCount = 0;
        totalLoopTime = 0;
        maxLoopTime = 0;
        minLoopTime = Infinity;
        lastDebugTime = t;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // Minimal dependencies

  return (
    <SafeTouchBoundary>
      <View style={styles.root}>
      <Canvas 
        style={styles.canvas}
        pointerEvents="none"
      >
          {/* Parallax Background */}
          <ParallaxBackground
            variant={PARALLAX[levelData.mapName as keyof typeof PARALLAX] as any}
            cameraY={cameraY}
            timeSec={elapsedSec}
            viewport={{ width: SCREEN_W, height: SCREEN_H }}
          />
          
          {/* Render world under camera transform */}
          <Group transform={[{ translateY: -cameraY }]}>
            {platforms?.filter(Boolean).map((platform, index) => {
              if (!platform?.prefab || typeof platform.x !== 'number' || typeof platform.y !== 'number') {
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
            
            {decorations?.filter(Boolean).map((decoration, index) => {
              if (!decoration?.prefab || typeof decoration.x !== 'number' || typeof decoration.y !== 'number') {
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
          
          {/* Debug collision visualization - uncomment to debug */}
          {/*__DEV__ && false && platformSlabs.slice(0, 20).map((slab, index) => (
            <Group key={`collision-debug-${index}`} transform={[{ translateY: -cameraY }]}>
              <Rect
                x={slab.left}
                y={slab.yTop}
                width={slab.right - slab.left}
                height={slab.yBottom - slab.yTop}
                color="rgba(255,0,255,0.3)"
                style="fill"
              />
            </Group>
          ))*/}
          
          {/* Character renders in screen space */}
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
              dirX: dirX as -1 | 0 | 1,
              crouch: false,
              onGround: onGroundRef.current,
            }}
          />
         </Canvas>
      
      {/* Health Bar */}
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
      
      {/* Controls overlay */}
      <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]} pointerEvents="auto">
        <RNGHControls
          size={PAD_SIZE}
          margin={20}
          onPad={onPad}
          onJump={requestJump}
          disabled={isDead}
        />
      </View>
    </View>
    </SafeTouchBoundary>
  );
};

// Main GameScreen component
export const GameScreen: React.FC<GameScreenProps> = ({ levelData, onBack }) => {
  return (
    <ImagePreloaderProvider maps={[levelData.mapName]}>
      <InnerGameScreen 
        levelData={levelData} 
        onBack={onBack}
      />
    </ImagePreloaderProvider>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  canvas: { flex: 1 },
});