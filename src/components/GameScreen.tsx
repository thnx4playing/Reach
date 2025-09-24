import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Text, Pressable } from 'react-native';
import { Canvas, Rect, Group } from '@shopify/react-native-skia';

import { makeStaticFloor } from '../content/floor';
import { DashCharacter } from './DashCharacter';
import RNGHControls from '../input/RNGHControls';
import SafeTouchBoundary from '../infra/SafeTouchBoundary';
import { PrefabNode } from '../render/PrefabNode';
import { PlatformRenderer } from './PlatformRenderer';
import HazardBand from '../render/HazardBand';
import GroundBand from '../render/GroundBand';
import FireballLayer from '../render/FireballLayer';
import type { LevelData } from '../content/levels';
import { MAPS, getPrefab, getTileSize, prefabWidthPx } from '../content/maps';
import { ImagePreloaderProvider } from '../render/ImagePreloaderContext';
import { EnhancedPlatformManager } from '../systems/platform/PlatformManager';
import { checkPlatformCollision } from '../physics/PlatformCollision';
import type { PlatformDef } from '../systems/platform/types';
import idleJson from '../../assets/character/dash/Idle_atlas.json';
import { dbg } from '../utils/dbg';
import { useThrottledAnimation } from '../hooks/useThrottledAnimation';

// Health system imports
import { useHealth } from '../systems/health/HealthContext';
import ScoreTimeHUD from '../ui/ScoreTimeHUD';
import SkiaHealthBar from '../ui/SkiaHealthBar';
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
const FOOT_OFFSET = 0;

interface GameScreenProps {
  levelData: LevelData;
  onBack: () => void;
}

// Inner game component that uses health hooks
const InnerGameScreen: React.FC<GameScreenProps> = ({ levelData, onBack }) => {
  // Health system integration
  const { isDead, bars, takeDamage, hits, sys, reset: resetHealth } = useHealth();
  
  // Audio system integration
  const { playJumpSound, playDamageSound, playDeathSound, playFireDeathSound } = useSound();
  const maxHits = sys.state.maxHits;
  const { isHurt } = useDamageAnimations();

  // Create a key that changes when we want to force a complete reset
  const [resetKey, setResetKey] = useState(0);
  
  // Handlers for death modal
  const handleRestart = useCallback(() => {
    // Reset health first
    resetHealth();
    
    // Force a complete component reset by changing the key
    // This will unmount and remount the entire component tree
    setResetKey(prev => prev + 1);
    
  }, [resetHealth]);

  const handleMainMenu = useCallback(() => {
    onBack();
  }, [onBack]);

  return (
    <GameComponent 
      key={resetKey} // This key forces a complete reset when changed
      levelData={levelData}
      onRestart={handleRestart}
      onMainMenu={handleMainMenu}
      isDead={isDead}
      bars={bars}
      takeDamage={takeDamage}
      hits={hits}
      maxHits={maxHits}
      isHurt={isHurt}
      playJumpSound={playJumpSound}
      playDamageSound={playDamageSound}
      playDeathSound={playDeathSound}
      playFireDeathSound={playFireDeathSound}
    />
  );
};

// Separate component that will be completely reset when key changes
const GameComponent: React.FC<{
  levelData: LevelData;
  onRestart: () => void;
  onMainMenu: () => void;
  isDead: boolean;
  bars: number;
  takeDamage: (n?: number) => boolean;
  hits: number;
  maxHits: number;
  isHurt: boolean;
  playJumpSound: () => Promise<void>;
  playDamageSound: () => Promise<void>;
  playDeathSound: () => Promise<void>;
  playFireDeathSound: () => Promise<void>;
}> = ({ 
  levelData, 
  onRestart, 
  onMainMenu, 
  isDead, 
  bars, 
  takeDamage, 
  hits, 
  maxHits, 
  isHurt,
  playJumpSound,
  playDamageSound,
  playDeathSound,
  playFireDeathSound
}) => {
  
  const [cameraX, setCameraX] = useState(0);
  const [cameraY, setCameraY] = useState(0);
  const [currentPlayerBox, setCurrentPlayerBox] = useState<{left: number; right: number; top: number; bottom: number; cx: number; feetY: number; w: number; h: number} | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const frameCountRef = useRef(0);
  const [elapsedSec, setElapsedSec] = useState(0); // you can keep this for your existing debug
  const [timeMs, setTimeMs] = useState(0);
  const timeMsRef = useRef(0);
  const [score, setScore] = useState(0);
  const [maxHeightPx, setMaxHeightPx] = useState(0);
  const maxHeightRef = useRef(0);
  const SCORE_DIVISOR = 5; // ← tune freely (px per point)
  const [rightCardW, setRightCardW] = useState(0);  // width of a single right card
  const [rightHudH, setRightHudH] = useState(0);    // total height of (Score + Time)
  const [hazardAnimationTime, setHazardAnimationTime] = useState(0);


  // State variables
  const [x, setX] = useState(SCREEN_W * 0.5);
  const [z, setZ] = useState(0);
  const [dirX, setDirX] = useState(0);
  const [speedLevel, setSpeedLevel] = useState<'idle'|'run'>('idle');
  
  // PERFORMANCE: Cache player box calculation
  const playerBoxRef = useRef<any>(null);
  const [needsBoxUpdate, setNeedsBoxUpdate] = useState(true);
  
  // Refs for physics - Initialize to starting values
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
  
  // Track previous death state to detect when player dies
  const prevIsDeadRef = useRef(isDead);
  const deathTypeRef = useRef<'fire' | 'normal' | null>(null);
  
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

  // NEW UNIFIED PLATFORM SYSTEM - Reset on component mount
  const platformManager = useRef<EnhancedPlatformManager | null>(null);
  const [allPlatforms, setAllPlatforms] = useState<PlatformDef[]>([]);
  

  // World->Screen convert: give us the screen Y from a world Y
  const worldYToScreenY = (worldY: number) =>
    SCREEN_H - (floorTopY - worldY) - cameraY;

  // FIX: Use refs to avoid dependency issues
  const lastUpdateTimeRef = useRef(0);
  const allPlatformsRef = useRef<PlatformDef[]>([]);
  
  // Update refs when state changes
  useEffect(() => {
    allPlatformsRef.current = allPlatforms;
  }, [allPlatforms]);
  
  // Stable update function using refs
  const updatePlatforms = useCallback((newPlatforms: PlatformDef[]) => {
    const now = Date.now();
    
    // Throttle platform updates to max 30 FPS
    if (now - lastUpdateTimeRef.current < 33) return;
    
    // Only update if the array actually changed (not just reordered)
    const current = allPlatformsRef.current;
    if (newPlatforms.length !== current.length || 
        newPlatforms[0]?.id !== current[0]?.id ||
        newPlatforms[newPlatforms.length - 1]?.id !== current[current.length - 1]?.id) {
      setAllPlatforms(newPlatforms);
      lastUpdateTimeRef.current = now;
    }
  }, []); // Stable reference with no dependencies

  // Initialize platform manager - This will be fresh on each reset
  useEffect(() => {
    platformManager.current = new EnhancedPlatformManager(levelData.mapName as any, floorTopY, 2);
    
    // Force clear any existing platforms to prevent key conflicts
    setAllPlatforms([]);
    
    // Then set the new platforms
    setTimeout(() => {
      if (platformManager.current) {
        updatePlatforms(platformManager.current.getAllPlatforms());
      }
    }, 0);
    
  }, [levelData.mapName, floorTopY]); // FIXED: Remove updatePlatforms dependency to prevent infinite loop


  // FIX: More efficient visibility culling with memoization
  const visiblePlatforms = useMemo(() => {
    if (!allPlatforms.length) return [];
    
    // Cache the calculation to avoid repeated work
    const viewportTop = cameraY - SCREEN_H * 0.5;
    const viewportBottom = cameraY + SCREEN_H * 1.5;
    
    // Use a more efficient filter
    const visible = [];
    for (let i = 0; i < allPlatforms.length; i++) {
      const platform = allPlatforms[i];
      const platformBottom = platform.y + (platform.collision?.height || 32);
      
      if (platformBottom > viewportTop && platform.y < viewportBottom) {
        visible.push(platform);
      }
    }
    
    return visible;
  }, [allPlatforms, Math.floor(cameraY / 10)]); // Round cameraY to reduce recalculations

  // Add this after platformManager initialization to validate the setup:
  useEffect(() => {
    if (platformManager.current) {
      
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

  // Jump controller with buffer + coyote - Initialize fresh
  const jumpStateRef = useRef(initJumpState());

  // Diagnostic refs for vz tracking
  const lastVzReason = useRef<string>('');
  const vzWasRef = useRef<number>(0);
  
  // Add this state to prevent collision spam:
  const collisionCooldownRef = useRef<number>(0);
  
  // PERFORMANCE: Throttle platform collision checks
  const collisionCheckRef = useRef(0);

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

  // Reset timer/score on fresh mount (restart changes key, so this runs again)
  useEffect(() => {
    timeMsRef.current = 0;
    maxHeightRef.current = 0;
    setTimeMs(0);
    setMaxHeightPx(0);
    setScore(0);
  }, []);

  // One-time spawn on floor - This runs fresh on each component mount
  useEffect(() => {
    zRef.current = 0;
    setZ(0);
    xRef.current = SCREEN_W * 0.5;
    setX(SCREEN_W * 0.5);
    setCameraY(0);
    setCameraX(0);
  }, []); // Empty dependency - runs once per component mount

  // Detect when player dies and play appropriate death sound
  useEffect(() => {
    if (isDead && !prevIsDeadRef.current) {
      // Player just died
      if (deathTypeRef.current === 'fire') {
        playFireDeathSound();
      } else {
        playDeathSound();
      }
      // Reset death type
      deathTypeRef.current = null;
    }
    prevIsDeadRef.current = isDead;
  }, [isDead, playFireDeathSound, playDeathSound]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frameCount = 0;

    const loop = (t: number) => {
      frameCount++;
      frameCountRef.current = frameCount;
      
      
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


      // PERFORMANCE: Removed extensive validation - trust the refs
      
      // PERFORMANCE: Optimized player box calculation with throttling
      let box = currentPlayerBox;
      if (!box || needsBoxUpdate || frameCount % 3 === 0) { // Only recalculate every 3rd frame or when needed
        box = getPlayerBox({
          xRefIsLeftEdge: true,
          x: xRef.current,
          z: zRef.current,
          floorTopY,
          charW: CHAR_W,
          colW: COL_W,
          colH: COL_H,
        });
        setCurrentPlayerBox(box);
        setNeedsBoxUpdate(false);
      }
      
      // PERFORMANCE: Safe frame counter management using modulo operations
      frameCountRef.current = (frameCountRef.current + 1) % 100000; // Safe modulo to prevent overflow
      
      if (frameCount % 2 === 0) { // Every 2 frames for smooth animation
        setFrameCount(prev => (prev + 1) % 100000); // Safe modulo instead of hard reset
        
        // Update hazard animation time
        if (frameCount % 3 === 0) { // Update every 3 frames for smooth animation
          setHazardAnimationTime(t);
        }
        
        // ==== TIMER & SCORE ====
        // Count up only while alive
        if (!isDead) {
          timeMsRef.current += dt * 1000;
        }
        // Track the maximum world height reached (z grows upward)
        if (zRef.current > maxHeightRef.current) {
          maxHeightRef.current = zRef.current;
        }
        // Throttle HUD state updates to keep re-renders cheap
        if (frameCount % 3 === 0) {
          const maxPx = Math.max(0, Math.round(maxHeightRef.current));
          setMaxHeightPx(maxPx);
          setScore(Math.ceil(maxPx / SCORE_DIVISOR));
          setTimeMs(Math.round(timeMsRef.current));
        }

        // Only update state if values have changed significantly to reduce re-renders
        const newX = Math.round(xRef.current);
        const newZ = Math.round(zRef.current);
        const newElapsed = Math.round((t / 1000) * 100) / 100; // Round to 2 decimal places
        
        if (Math.abs(newX - x) > 0.5 || Math.abs(newZ - z) > 0.5 || Math.abs(newElapsed - elapsedSec) > 0.01) {
          setX(newX);
          setZ(newZ);
          setElapsedSec(newElapsed);
        }
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

      // Screen wrap - trigger box update when wrapping
      const spriteW = CHAR_W;
      const spriteCenter = xRef.current + spriteW * 0.5;
      
      if (spriteCenter < 0) {
        xRef.current += SCREEN_W;
        didWrapRef.current = true;
        setNeedsBoxUpdate(true); // Force box recalculation after wrap
      } else if (spriteCenter > SCREEN_W) {
        xRef.current -= SCREEN_W;
        didWrapRef.current = true;
        setNeedsBoxUpdate(true); // Force box recalculation after wrap
      }

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

      // ==== DIRECT HAZARD BAND DEATH CHECK ====
      // Check if player has fallen into the hazard band area (more reliable than platform collision)
      const deathFloor = platformManager.current?.getDeathFloor();
      if (deathFloor && !isDead) {
        const hazardTopWorld = deathFloor.y;
        const playerWorldY = floorTopY - zRef.current;
        
        // Player dies if they fall 40px into the hazard band area
        if (playerWorldY >= hazardTopWorld + 40) {
          deathTypeRef.current = 'fire';
          takeDamage(999);
          return; // Stop physics processing
        }
      }

      // ==== DEATH FLOOR UPDATE ====
      // Update the death floor position to follow the player
      if (platformManager.current) {
        const playerWorldY = floorTopY - zRef.current;
        platformManager.current.updateDeathFloor(playerWorldY);
      }

      // Head span for ceiling collision
      const headLeft = newBox.cx - HEAD_W * 0.5;
      const headRight = newBox.cx + HEAD_W * 0.5;

      // ==== ROBUST PLATFORM COLLISION (Replace existing collision code) ====
      // This goes AFTER vertical physics but BEFORE floor collision

      // PERFORMANCE: Only check collisions every 2nd frame for better performance
      collisionCheckRef.current++;
      if (collisionCheckRef.current % 2 === 0 && vzRef.current < -20) { // Lower threshold - even slow falling should check
        
        // Get player position
        const playerWorldX = xRef.current + CHAR_W / 2;
        const playerWorldY = floorTopY - zRef.current; // Current feet position
        
        // Get platforms that could be relevant (wider search)
        const nearbyPlatforms = platformManager.current?.getPlatformsNearPlayer(
          playerWorldX,
          playerWorldY,
          200 // Increased search radius
        ) || [];
        
        
        // Check each platform
        for (const platform of nearbyPlatforms) {
          if (!platform.collision?.solid) continue;
          
          const collision = platform.collision;
          
          // Skip floor platforms (let floor collision handle these)
          if (collision.topY >= floorTopY - 10) continue;
          
          // SPECIAL HANDLING FOR DEATH FLOOR - Much tighter collision
          if (platformManager.current?.isDeathFloor(platform)) {
            // Check horizontal overlap (normal)
            const playerLeft = playerWorldX - COL_W / 2;
            const playerRight = playerWorldX + COL_W / 2;
            const hasHorizontalOverlap = playerLeft < collision.right && 
                                        playerRight > collision.left;
            
            if (hasHorizontalOverlap) {
              // DEATH FLOOR: Only kill when player actually touches it (much tighter range)
              const distanceToSurface = playerWorldY - collision.topY;
              
              // Only kill when player is AT or BELOW the death floor surface
              if (distanceToSurface >= -5 && distanceToSurface <= 10) {
                deathTypeRef.current = 'fire';
                takeDamage(999);
                return;
              }
            }
            continue; // Skip normal platform logic for death floor
          }
          
          // NORMAL PLATFORMS - Keep existing generous collision
          const playerLeft = playerWorldX - COL_W / 2;
          const playerRight = playerWorldX + COL_W / 2;
          const overlapMargin = 8;
          
          const hasHorizontalOverlap = playerLeft < collision.right - overlapMargin && 
                                      playerRight > collision.left + overlapMargin;
          
          if (hasHorizontalOverlap) {
            const platformTop = collision.topY;
            const distanceToSurface = playerWorldY - platformTop;
            
            // Normal platforms keep generous collision (-15 to +25)
            if (distanceToSurface >= -15 && distanceToSurface <= 25) {
              // Land on the platform (existing logic)
              const newPlayerZ = Math.max(0, floorTopY - platformTop);
              zRef.current = newPlayerZ;
              vzRef.current = 0;
              onGroundRef.current = true;
              
              if (platformManager.current) {
                platformManager.current.updateHighestPointOnLanding(platformTop);
              }
              
              // Handle fall damage
              if (fallingRef.current) {
                const dropPx = Math.max(0, peakZRef.current - zRef.current);
                if (dropPx >= FALL_THRESHOLD) {
                  takeDamage(1);
                  playDamageSound();
                }
                fallingRef.current = false;
                peakZRef.current = 0;
              }
              
              break;
            }
          }
        }
      }

      // Improved fall tracking (more reliable)
      if (vzRef.current < -10) { // Start tracking falls earlier
        if (!fallingRef.current) {
          fallingRef.current = true;
          peakZRef.current = Math.max(0, zRef.current);
        } else {
          peakZRef.current = Math.max(peakZRef.current, Math.max(0, zRef.current));
        }
      } else if (vzRef.current > 10) { // Reset when moving up
        if (fallingRef.current) {
          fallingRef.current = false;
        }
      }

      // Additional ground state verification
      // Make sure we're not accidentally setting onGround to false
      if (onGroundRef.current && vzRef.current > 50) {
        // Only set to false when jumping with significant upward velocity
        onGroundRef.current = false;
      }

      // ==== SIMPLIFIED FLOOR COLLISION ====
      if (zRef.current < 0) {
        zRef.current = 0;
        if (vzRef.current < 0) vzRef.current = 0;
        onGroundRef.current = true;
        
        // Update highest point when landing on original floor
        if (platformManager.current) {
          platformManager.current.updateHighestPointOnLanding(floorTopY);
        }
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
        vzRef.current = JUMP_VELOCITY;
        onGroundRef.current = false;
        consumeJump(jumpStateRef.current);
        playJumpSound();
        setNeedsBoxUpdate(true); // Force box recalculation after jump
      }


      tickIgnoreCeil(jumpStateRef.current);

      // ==== OPTIMIZED CAMERA LOGIC ====
      // Smoother camera movement with throttled platform generation

      if (frameCount % 2 === 0) { // Every 2 frames for smoother movement (was 5)
        const DEADZONE_FROM_TOP = Math.round(SCREEN_H * 0.40); // CHANGED: 40% from top (was 0.25)
        const playerScreenY = floorTopY - zRef.current - cameraY;
        
        // UPWARD TRACKING: When player rises into dead-zone, camera moves up
        if (playerScreenY < DEADZONE_FROM_TOP) {
          const targetCameraY = cameraY + (playerScreenY - DEADZONE_FROM_TOP);
          const newCameraY = Math.round(targetCameraY);
          
          if (Math.abs(newCameraY - cameraY) > 1) { // Only update if significant change
            setCameraY(newCameraY);
            
            // PERFORMANCE: Less frequent camera updates for platform generation
            if (platformManager.current && frameCount % 60 === 0) { // FIX: Only every 60 frames = 1 second
              const playerWorldY = floorTopY - zRef.current;
              const platformsChanged = platformManager.current.updateForCamera(newCameraY, playerWorldY);
              
              if (platformsChanged) {
                updatePlatforms(platformManager.current.getAllPlatforms());
              }
            }
            
            // Update fade-out animations every frame for smooth animation
            if (platformManager.current) {
              const fadeChanged = platformManager.current.updateFadeOutAnimations();
              if (fadeChanged) {
                updatePlatforms(platformManager.current.getAllPlatforms());
              }
            }
          }
        }
        // DOWNWARD TRACKING: Limited to 100px below dead-zone
        else if (playerScreenY > DEADZONE_FROM_TOP + 100) {
          // Only allow camera to move down if player is more than 100px below dead-zone
          const maxDownwardCameraY = cameraY + 100;
          const targetCameraY = cameraY + (playerScreenY - DEADZONE_FROM_TOP - 100);
          const newCameraY = Math.min(maxDownwardCameraY, Math.round(targetCameraY));
          
          if (Math.abs(newCameraY - cameraY) > 1) {
            setCameraY(newCameraY);
            
            if (platformManager.current && frameCount % 60 === 0) { // FIX: Only every 60 frames = 1 second
              const playerWorldY = floorTopY - zRef.current;
              const platformsChanged = platformManager.current.updateForCamera(newCameraY, playerWorldY);
              
              if (platformsChanged) {
                updatePlatforms(platformManager.current.getAllPlatforms());
              }
            }
            
            // Update fade-out animations every frame for smooth animation
            if (platformManager.current) {
              const fadeChanged = platformManager.current.updateFadeOutAnimations();
              if (fadeChanged) {
                updatePlatforms(platformManager.current.getAllPlatforms());
              }
            }
          }
        }
        // MIDDLE ZONE: Player is between dead-zone and 100px below - camera doesn't move
      }

      // Update fade-out animations every frame for smooth animation (runs regardless of camera movement)
      if (platformManager.current) {
        const fadeChanged = platformManager.current.updateFadeOutAnimations();
        if (fadeChanged) {
          setAllPlatforms(platformManager.current.getAllPlatforms());
        }
      }


      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // FIXED: Empty dependency to prevent infinite loop
  
  // REMOVED: Performance monitoring debug logging (was causing console spam)

  return (
    <SafeTouchBoundary>
      <View style={styles.root}>
      <Canvas 
        style={styles.canvas}
        pointerEvents="box-none"
      >
          <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} color="#87CEEB" />
          
{useMemo(() => {
            const cloudData = [
              { baseX: SCREEN_W * 0.2, y: SCREEN_H * 0.15, size: 35, speed: 0.8 },
              { baseX: SCREEN_W * 0.5, y: SCREEN_H * 0.25, size: 40, speed: 1.2 },
              { baseX: SCREEN_W * 0.8, y: SCREEN_H * 0.2, size: 30, speed: 0.6 },
              { baseX: SCREEN_W * 0.35, y: SCREEN_H * 0.4, size: 25, speed: 1.0 },
            ];
            
            const animTime = Math.floor(elapsedSec * 15) / 15;
            
            return cloudData.map((cloud, i) => {
              const drift = Math.sin(animTime * 0.1 * cloud.speed + i) * 8;
              const x = cloud.baseX + drift;
              
              return (
                <Group key={i}>
                  <Rect 
                    x={x - cloud.size * 0.5} 
                    y={cloud.y} 
                    width={cloud.size} 
                    height={cloud.size * 0.6} 
                    color="white" 
                    opacity={0.8}
                  />
                  <Rect 
                    x={x - cloud.size * 0.3} 
                    y={cloud.y - cloud.size * 0.2} 
                    width={cloud.size * 0.6} 
                    height={cloud.size * 0.6} 
                    color="white" 
                    opacity={0.9}
                  />
                </Group>
              );
            });
          }, [Math.floor(elapsedSec * 4)])}
          
          <Group transform={[{ translateY: -cameraY }]}>
            {/* PERFORMANCE: Use memoized platform renderer */}
            <PlatformRenderer 
              platforms={visiblePlatforms}
              mapName={levelData.mapName}
              opacity={1.0}
            />
            
            
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
          </Group>
         </Canvas>
      
      
      {/* Right stack: SCORE + TIME */}
      <ScoreTimeHUD
        score={score}
        heightPx={maxHeightPx}
        timeMs={timeMs}
        anchor="right"
        top={50}
        onBoxSize={(w) => setRightCardW(w)}
        onMeasured={(h) => setRightHudH(h)}
      />

      {/* Float the Skia HP bar directly beneath TIME (no box) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 12,
          top: 50 + rightHudH + 8,   // 8px gap below the TIME card
          zIndex: 9998,
        }}
      >
        <SkiaHealthBar
          width={Math.max(120, rightCardW)}
          height={20}
          health={((maxHits - hits) / maxHits) * 100}
        />
      </View>
      
      
      {/* Ground Band - Dirt with grass top */}
      {(() => {
        // Use the same world->screen conversion as HazardBand for consistency
        const groundScreenY = worldYToScreenY(floorTopY);
        // Adjust upward to align grass lip exactly under character's feet
        const adjustedGroundY = groundScreenY - 30; // Move up 30px to align better
        const groundH = Math.max(0, SCREEN_H - adjustedGroundY);
        
        return (
          <GroundBand
            width={SCREEN_W}
            height={groundH}
            y={adjustedGroundY}
            opacity={1}
            timeMs={hazardAnimationTime}
          />
        );
      })()}
      
        {/* Hazard Band - Improved lava rendering */}
        {(() => {
          const df = platformManager.current?.getDeathFloor?.();
          const hazardTopWorld = df?.y ?? null;
          
          
          if (hazardTopWorld == null) return null;
          
          // Convert world Y to screen Y
          const hazardTopScreen = worldYToScreenY(hazardTopWorld);
          
          
          // Only show when hazard is in or near viewport
          if (hazardTopScreen > SCREEN_H + 200) {
            return null;
          }
          
          // Calculate height - make it tall enough to cover everything below
          const hazardHeight = Math.max(SCREEN_H, SCREEN_H - hazardTopScreen + 200);
          
          // Clamp Y position to prevent rendering above viewport
          const clampedY = Math.max(-100, hazardTopScreen - 50); // 50px overlap for wavy edge
          
          
          return (
            <HazardBand
              width={SCREEN_W}
              height={hazardHeight}
              y={clampedY}
              opacity={1}
              timeMs={hazardAnimationTime}
            />
          );
        })()}
      
      {/* Fireballs above lava */}
      {(() => {
        const df = platformManager.current?.getDeathFloor?.();
        const lavaYWorld = df?.y ?? null;
        if (lavaYWorld == null) return null;
        
        // Calculate player AABB in world coordinates for collision detection
        const playerAABBWorld = currentPlayerBox ? {
          left: currentPlayerBox.left,
          right: currentPlayerBox.right,
          top: currentPlayerBox.top,    // smaller worldY value
          bottom: currentPlayerBox.bottom, // larger worldY value
        } : {
          left: 0, right: 0, top: 0, bottom: 0
        };
        
        return (
          <FireballLayer
            clockMs={hazardAnimationTime}
            lavaYWorld={lavaYWorld}
            worldYToScreenY={worldYToScreenY}
            screenW={SCREEN_W}
            screenH={SCREEN_H}
            playerAABBWorld={playerAABBWorld}
            onPlayerHit={takeDamage}
            maxConcurrent={2}           // allow up to 2 at once
            spawnMinMs={10000}          // 10–20 seconds between waves
            spawnMaxMs={20000}
            peakTargetScreenY={96}      // keep apex near top
            damagePerHit={1}
            speedScale={0.66}          // ≈ 1/3 slower; try 0.6–0.75 range
            smoothAlpha={0.25}         // 0.2–0.35 for gentle smoothing
          />
        );
      })()}

      {/* Death modal */}
      <DeathModal 
        onRestart={onRestart}
        onMainMenu={onMainMenu}
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