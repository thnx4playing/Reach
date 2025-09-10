
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
import { MAPS, getPrefab, getTileSize, prefabWidthPx } from '../content/maps';
import { ImagePreloaderProvider } from '../render/ImagePreloaderContext';
import { PlatformManager } from '../systems/platform/PlatformManager';
import { checkPlatformCollision } from '../physics/PlatformCollision';
import type { PlatformDef } from '../systems/platform/types';
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
const JUMP_VEL   = 780;   // INCREASED: 20% higher jump for testing (was 650)
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

  // NEW UNIFIED PLATFORM SYSTEM
  const platformManager = useRef<PlatformManager | null>(null);
  const [allPlatforms, setAllPlatforms] = useState<PlatformDef[]>([]);

  // Initialize platform manager
  useEffect(() => {
    if (!platformManager.current) {
      platformManager.current = new PlatformManager(levelData.mapName as any, floorTopY, 2);
      setAllPlatforms(platformManager.current.getAllPlatforms());
      console.log('[GameScreen] Platform manager initialized with', platformManager.current.getAllPlatforms().length, 'platforms');
    }
  }, [levelData.mapName, floorTopY]);

  // Add this after platformManager initialization to validate the setup:
  useEffect(() => {
    if (platformManager.current) {
      console.log('=== COORDINATE SYSTEM VALIDATION ===');
      console.log('Floor world Y:', platformManager.current.getFloorWorldY());
      console.log('Player spawn Z:', zRef.current);
      console.log('Player spawn world Y:', floorTopY - zRef.current);
      
      // Debug platforms around floor level
      platformManager.current.debugPlatformsNearY(floorTopY, 300);
    }
  }, [platformManager.current]);
  


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
  
  // Add this state to prevent collision spam:
  const collisionCooldownRef = useRef<number>(0);

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



  // SIMPLIFIED: No more complex platform slabs - just use platforms directly

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
        raf = requestAnimationFrame(loop);
        return;
      }

      didWrapRef.current = false;

      // At the start of your physics loop, decrement cooldown:
      if (collisionCooldownRef.current > 0) {
        collisionCooldownRef.current--;
      }

      // Add this at the start of your physics loop to see what's happening:
      if (frameCount % 30 === 0) { // Every 30 frames
        console.log('PHYSICS DEBUG:', {
          vz: vzRef.current.toFixed(2),
          z: zRef.current.toFixed(2),
          onGround: onGroundRef.current,
          dirX: dirXRef.current,
          dt: dt.toFixed(4)
        });
      }

      // PERFORMANCE: Removed extensive validation - trust the refs
      
      // PERFORMANCE: Cache getPlayerBox result and only recalculate when needed
      let box = currentPlayerBox;
      if (!box || frameCount % 2 === 0) { // Only recalculate every 2nd frame
        const boxStart = performance.now();
        box = getPlayerBox({
          xRefIsLeftEdge: true,
          x: xRef.current,
          z: zRef.current,
          floorTopY,
          charW: CHAR_W,
          colW: COL_W,
          colH: COL_H,
        });
        const boxTime = performance.now() - boxStart;
        setCurrentPlayerBox(box);
      }
      
      // PERFORMANCE: Balanced state update frequency for smooth animation
      if (frameCount % 2 === 0) { // Every 2 frames for smooth animation
        setFrameCount(prev => prev + 1);
        setX(xRef.current);
        setZ(zRef.current);
        setElapsedSec(t / 1000);
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

      // ==== TEMPORARY: DISABLE PLATFORM COLLISION FOR TESTING ====
      // Comment out or remove ALL platform collision code temporarily
      // Just keep the basic floor collision:

      // TEMPORARY: Just basic floor collision
      if (zRef.current < 0) {
        zRef.current = 0;
        if (vzRef.current < 0) vzRef.current = 0;
        onGroundRef.current = true;
      }

      // ==== CEILING COLLISION (rising only) ====
      // NOTE: No ceiling collision with platforms - they're one-way
      // Only check ceiling collision with solid blocks if you have them
      
      // ==== SIMPLIFIED GROUND STATE MANAGEMENT ====
      // Only update ground state based on physics, not arbitrary checks
      if (zRef.current <= 0.1 && Math.abs(vzRef.current) < 10) {
        onGroundRef.current = true;
      } else if (vzRef.current > 50) { // Only when jumping/moving up significantly
        onGroundRef.current = false;
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
        const JUMP_VELOCITY = 1200; // Increased from 780 for testing
        vzRef.current = JUMP_VELOCITY;
        onGroundRef.current = false;
        consumeJump(jumpStateRef.current);
        playJumpSound();
        
        console.log('Jump executed! VZ:', vzRef.current, 'Z:', zRef.current);
      }

      tickIgnoreCeil(jumpStateRef.current);

      // ==== BASIC CAMERA LOGIC (for testing) ====
      // Only update camera occasionally to avoid interference
      if (frameCount % 10 === 0) { // Only every 10 frames
        const DEADZONE_FROM_TOP = Math.round(SCREEN_H * 0.3);
        const playerScreenY = floorTopY - zRef.current - cameraY;
        
        if (playerScreenY < DEADZONE_FROM_TOP && zRef.current > 100) { // Only when player is high enough
          const newCameraY = cameraY + (playerScreenY - DEADZONE_FROM_TOP);
          setCameraY(Math.round(newCameraY));
          console.log('Camera moved to:', newCameraY, 'Player Z:', zRef.current);
        }
      }

      // Add this debug logging in your main physics loop (temporarily)
      if (frameCount % 60 === 0) { // Log every 60 frames
        console.log('=== PHYSICS DEBUG ===');
        console.log('Player Z:', zRef.current.toFixed(2));
        console.log('Player world Y:', (floorTopY - zRef.current).toFixed(2));
        console.log('Camera Y:', cameraY);
        console.log('On ground:', onGroundRef.current);
        console.log('VZ:', vzRef.current.toFixed(2));
        console.log('Total platforms:', platformManager.current?.getAllPlatforms().length || 0);
        console.log('Solid platforms:', platformManager.current?.getSolidPlatforms().length || 0);
        
        // Debug platform positions
        const solidPlatforms = platformManager.current?.getSolidPlatforms() || [];
        const nearPlayer = solidPlatforms.filter(p => {
          const playerWorldY = floorTopY - zRef.current;
          return Math.abs(p.y - playerWorldY) < 100;
        });
        console.log('Platforms near player:', nearPlayer.map(p => ({
          id: p.id,
          y: p.y,
          topY: p.collision?.topY
        })));
        
        // Add this debug logging to validate coordinate system:
        console.log('COORDINATE VALIDATION:', {
          floorTopY: floorTopY,
          playerZ: zRef.current.toFixed(2),
          playerWorldY: (floorTopY - zRef.current).toFixed(2),
          screenHeight: SCREEN_H,
          cameraY: cameraY,
          expectedPlayerScreenY: (floorTopY - zRef.current - cameraY).toFixed(2)
        });
      }

      // PERFORMANCE DEBUG: Track total loop time and log periodically
      const loopTime = performance.now() - loopStart;
      totalLoopTime += loopTime;
      maxLoopTime = Math.max(maxLoopTime, loopTime);
      minLoopTime = Math.min(minLoopTime, loopTime);
      
      // Reset performance counters every 10 seconds
      if (t - lastDebugTime > 10000) {
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
            {allPlatforms.map((platform) => (
              <PrefabNode
                key={platform.id}
                map={levelData.mapName}
                name={platform.prefab}
                x={platform.x}
                y={platform.y}
                scale={platform.scale}
              />
            ))}
            
          </Group>
          
          
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