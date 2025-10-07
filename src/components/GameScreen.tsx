import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Text, Pressable } from 'react-native';
import { Canvas, Rect, Group } from '@shopify/react-native-skia';

import { makeStaticFloor } from '../content/floor';
import { DashCharacter } from './DashCharacter';
import RNGHControls from '../input/RNGHControls';
import BossRoomControls from '../input/BossRoomControls';
import SafeTouchBoundary from '../infra/SafeTouchBoundary';
import { PrefabNode } from '../render/PrefabNode';
import { PlatformRenderer } from './PlatformRenderer';
import HazardBand from '../render/HazardBand';
import GroundBand from '../render/GroundBand';
import FrozenBand from '../render/FrozenBand';
import FireballLayer from '../render/FireballLayer';
import HellBackground from '../render/HellBackground';
import TiledFloor from '../scene/boss/TiledFloor';
import type { LevelData } from '../content/levels';
import { LEVELS } from '../content/levels';
import { MAPS, getPrefab, getTileSize, MapName } from '../content/maps';
import { getProfile, MapName as ProfileMapName } from '../config/mapProfiles';
import { floorTopYFor } from '../engine/floor';
import { enterMap } from '../engine/enterMap';
import { ImagePreloaderProvider } from '../render/ImagePreloaderContext';
import { EnhancedPlatformManager } from '../systems/platform/PlatformManager';
import { checkPlatformCollision } from '../physics/PlatformCollision';
import type { PlatformDef } from '../systems/platform/types';
import idleJson from '../../assets/character/dash/Idle_atlas.json';
import { dbg } from '../utils/dbg';

// Health system imports
import { useHealth } from '../systems/health/HealthContext';
import ScoreTimeHUD from '../ui/ScoreTimeHUD';
import SkiaHealthBar from '../ui/SkiaHealthBar';
import BossVerticalHealthBar from '../ui/BossVerticalHealthBar';
import { DeathModal } from '../ui/DeathModal';
import { useDamageAnimations } from '../systems/health/useDamageAnimations';


// Audio system imports
import { useSound } from '../audio/useSound';
import { soundManager } from '../audio/SoundManager';

// Boss system imports
import DoorSprite, { pointInDoorTightFeet } from '../features/DoorSprite';
import DoorIceSprite, { pointInDoorIceTightFeet } from '../features/DoorIceSprite';
import BossRoom from '../features/BossRoom';
import BossDemon from '../features/BossDemon';
import BossProjectiles, { BossProjectile } from '../features/BossProjectiles';
import HeartPickup from '../features/HeartPickup';
import PlayerProjectiles, { PlayerProjectile } from '../features/PlayerProjectiles';
import BossHUD from '../features/BossHUD';
import {
  DOORWAY_SPAWN_Y, DOORWAY_WIDTH, DOORWAY_HEIGHT, DOORWAY_POSITION_OFFSET,
  DOOR_ICE_WIDTH, DOOR_ICE_HEIGHT, DOOR_ICE_POSITION_OFFSET,
  DOOR_TRIGGER_INNER_X_RATIO, DOOR_TRIGGER_BOTTOM_Y_RATIO, DOOR_TRIGGER_PAD,
  DOOR_TRIGGER_REQUIRE_GROUNDED_FRAMES,
  PLAYER_PROJECTILE_SPEED, PLAYER_PROJECTILE_LIFE_MS, PLAYER_PROJECTILE_LAUNCH_DELAY_MS, PLAYER_PROJECTILE_HEAD_RATIO, BOSS_HURT_FLASH_MS
} from '../config/gameplay';
import { prefabWidthPx, alignPrefabYToSurfaceTop } from '../content/maps';

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
const DEFAULT_FOOT_OFFSET = 0;

// Door-ice helper function
const DOOR_ICE_SCALE = 1.5; // must match DoorIceSprite

// Door-ice helper uses boss profile constants
function calcDoorIceWorldXY(anchor: { x: number; y: number; w: number }) {
  const boss = getProfile('bossroom'); // constants live in boss profile
  const scale = boss.door?.scale ?? 1.5;
  const nudgeX = boss.door?.nudgeX ?? -15;
  const offsetY = boss.door?.offsetYAboveTop ?? 32;

  // center horizontally, plus a small styling nudge
  const x = Math.round(anchor.x + (anchor.w - DOOR_ICE_WIDTH) * 0.5) + nudgeX;

  // place above platform top by the scaled sprite height + fixed offset
  // Increase offset by another 25px to move door up (total 50px from original)
  const adjustedOffsetY = offsetY + 50;
  const y = Math.round(anchor.y - DOOR_ICE_HEIGHT * scale - adjustedOffsetY);

  return { x, y };
}

interface GameScreenProps {
  levelData: LevelData;
  onBack: () => void;
  onLevelChange: (levelData: LevelData) => void;
}

// Inner game component that uses health hooks
const InnerGameScreen: React.FC<GameScreenProps> = ({ levelData, onBack, onLevelChange }) => {
  // Get map profile for consistent behavior
  const profile = getProfile(levelData.mapName as ProfileMapName);
  
  // Health system integration
  const { isDead, bars, takeDamage, hits, sys, reset: resetHealth, heal } = useHealth();
  
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
      onLevelChange={onLevelChange}
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
      resetHealth={resetHealth}
    />
  );
};

// Separate component that will be completely reset when key changes
const GameComponent: React.FC<{
  levelData: LevelData;
  onRestart: () => void;
  onMainMenu: () => void;
  onLevelChange: (levelData: LevelData) => void;
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
  resetHealth: () => void;
}> = ({ 
  levelData, 
  onRestart, 
  onMainMenu, 
  onLevelChange,
  isDead, 
  bars, 
  takeDamage, 
  hits, 
  maxHits, 
  isHurt, 
  playJumpSound, 
  playDamageSound, 
  playDeathSound, 
  playFireDeathSound, 
  resetHealth 
}) => {
  
  // Keep resetHealth in a ref for RAF loop access
  const resetHealthRef = useRef<() => void>(() => {});
  useEffect(() => { resetHealthRef.current = resetHealth; }, [resetHealth]);
  
  
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

  // Boss system state
  const [mode, setMode] = useState<'tower'|'bossroom'>('tower');
  
  // Ensure the RAF loop sees mode changes
  const modeRef = useRef<'tower'|'bossroom'>('tower');
  useEffect(() => { modeRef.current = mode; }, [mode]);

// ---- Boss state (bossroom only) ----
const MAX_BOSS_HP = 6;
const [bossHP, setBossHP] = useState(MAX_BOSS_HP);

// show HURT for a short window after any hit
const [bossHurtUntilMs, setBossHurtUntilMs] = useState(0);
const isBossHurt = bossHurtUntilMs > Date.now();
const isBossDead = bossHP <= 0;

const [bossDespawned, setBossDespawned] = useState(false);
const [heartPickup, setHeartPickup] = useState<{ x:number; y:number; spawnAt:number } | null>(null);
const heartPickupRef = useRef<typeof heartPickup>(null);
useEffect(() => { heartPickupRef.current = heartPickup; }, [heartPickup]);
type Box = { left:number; right:number; top:number; bottom:number };
type PosePayload = { visual:Box; solid:Box; hurt:Box; centerX:number; centerY:number };
const bossPoseRef = useRef<PosePayload>({
  visual: {left:0,right:0,top:0,bottom:0},
  solid:  {left:0,right:0,top:0,bottom:0},
  hurt:   {left:0,right:0,top:0,bottom:0},
  centerX: 0,
  centerY: 0,
});

  // ---- Sword attack window ----
  const isAttackingRef = useRef(false);
  const attackEndAtRef = useRef(0);
  const attackHitRegisteredRef = useRef(false);
  const ATTACK_DURATION_MS = 500; // 6 frames at 12 FPS = 500ms

  // Optional: if you already track facing, wire it here; default face-right.
  const facingLeftRef = useRef(false);
  
  // ===== Door anchored to existing 3-block grass platform =====
  const DOOR_TARGET_Y_WORLD = -DOORWAY_SPAWN_Y; // world up is negative
  const [doorAnchor, setDoorAnchor] = useState<null | { id: string; x: number; y: number; w: number }>(null);
  
  // Calculate door position from anchor (same as used for rendering)
  const doorWorldX = doorAnchor ? Math.round(doorAnchor.x + (doorAnchor.w - DOORWAY_WIDTH) * 0.5) : 0;
  const doorWorldY = doorAnchor ? Math.round(doorAnchor.y - DOORWAY_HEIGHT + DOORWAY_POSITION_OFFSET) : 0;
  
  
  // Use ref to access current doorAnchor in game loop
  const doorAnchorRef = useRef(doorAnchor);
  doorAnchorRef.current = doorAnchor;
  
  // ===== Door-Ice anchored to top platform in boss room =====
  const [doorIceAnchor, setDoorIceAnchor] = useState<null | { id: string; x: number; y: number; w: number }>(null);
  const doorIceAnchorRef = useRef(doorIceAnchor);
  doorIceAnchorRef.current = doorIceAnchor;
  
  // Calculate door-ice position from anchor using helper function
  const doorIceWorld = doorIceAnchor ? calcDoorIceWorldXY(doorIceAnchor) : { x: 0, y: 0 };
  const doorIceWorldX = doorIceWorld.x;
  const doorIceWorldY = doorIceWorld.y;
  
  // === Boss-room helpers & guards ===
  const hazardSuppressUntilMsRef = useRef(0); // blocks lava/fall deaths briefly
  const hasTeleportedRef = useRef(false);     // prevents multi-trigger on door overlap
  const hasTeleportedDoorIceRef = useRef(false); // prevents multi-trigger on door-ice overlap
  const groundedFramesRef = useRef(0);        // tracks consecutive grounded frames for door trigger
  const postTeleportClampRef = useRef(false); // flag to hard-clamp to boss floor next frame

  // toggle for rendering/moving player bullets and enemy projectiles
  const bossProjectilesEnabledRef = useRef(false);

  // Prefab id your normal map uses for a 3-block platform
  const BOSS_PREFAB = levelData.mapName === 'frozen' ? 'platform-frozen-3-final' : 'platform-grass-3-final';

  // Build 6–7 fixed platforms using the SAME prefab as tower.
  // We keep them centered and staggered above the floor.
  type BossPlat = { id: string; x: number; y: number; w: number; h: number; prefab: string };
  const [bossPlatforms, setBossPlatforms] = useState<BossPlat[]>([]);
  
  // Keep a ref to boss platforms for collision
  const bossPlatformsRef = useRef<BossPlat[]>([]);
  useEffect(() => { 
    bossPlatformsRef.current = bossPlatforms; 
  }, [bossPlatforms]);

  function createBossPlatforms(floorTopY: number, mapW: number): BossPlat[] {
    // Use dark tileset prefabs
    const darkMap = 'dark' as MapName;
    
    // Platform widths for dark tileset
    const platform3W = prefabWidthPx(darkMap, 'platform-dark-3-final', 2); // 96px (3 tiles)
    const platform1W = prefabWidthPx(darkMap, 'platform-dark-1-final', 2); // 32px (1 tile)
    const platform2W = prefabWidthPx(darkMap, 'platform-dark-2-left-final', 2); // 64px (2 tiles)
    const H = 24;

    const screenCenter = SCREEN_W * 0.5;
    const margin = 40;
    
    const platforms: BossPlat[] = [
      // Three platform-dark-3-final (3-block platforms) - spread out
      {
        id: 'boss-plf-0',
        x: screenCenter - 165, // moved right by 15px (was -180, now -165)
        y: floorTopY - 180, // moved down by 15px (was -195, now -180)
        w: platform3W,
        h: H,
        prefab: 'platform-dark-3-final',
      },
      {
        id: 'boss-plf-1',
        x: screenCenter + 60, // moved left by 20px (was +80, now +60)
        y: floorTopY - 295, // moved down by 20px (was -315, now -295)
        w: platform3W,
        h: H,
        prefab: 'platform-dark-3-final',
      },
      {
        id: 'boss-plf-2',
        x: screenCenter - 50,
        y: floorTopY - 495, // moved up by 25px (was 470, now 495)
        w: platform3W,
        h: H,
        prefab: 'platform-dark-3-final',
      },
      
      // platform-dark-2-left-final (flush left)
      {
        id: 'boss-plf-3',
        x: 0,
        y: floorTopY - 355, // adjusted for floor position change
        w: platform2W,
        h: H,
        prefab: 'platform-dark-2-left-final',
      },
      
      // platform-dark-2-right-final (flush right, raised by 70px)
      {
        id: 'boss-plf-4',
        x: SCREEN_W - platform2W,
        y: floorTopY - 445, // raised by additional 30px (was 415, now 445)
        w: platform2W,
        h: H,
        prefab: 'platform-dark-2-right-final',
      },
    ];
    
    return platforms;
  }

  // Single place to decide if hazards are allowed to kill us
  function hazardsActive(): boolean {
    const now = Date.now();
    const isSuppressed = now < hazardSuppressUntilMsRef.current;
    const isBossroom = modeRef.current === 'bossroom';
    return !isBossroom && !isSuppressed;
  }

  // Helper: rectangles intersection
  function rectsOverlap(a:{l:number;r:number;t:number;b:number}, b:{l:number;r:number;t:number;b:number}) {
    return a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  }

  // Enable boss projectiles only after the room is set up
  useEffect(() => {
    if (mode === 'bossroom') {
      // tiny delay to ensure platforms/camera are ready
      const t = setTimeout(() => { bossProjectilesEnabledRef.current = true; }, 300);
      return () => clearTimeout(t);
    } else {
      bossProjectilesEnabledRef.current = false;
    }
  }, [mode]);

  // Stop boss shots when dead
  useEffect(() => {
    if (isBossDead) setBossShots([]);   // clear any in-flight shots on death
  }, [isBossDead]);

  const [bossShots, setBossShots] = useState<BossProjectile[]>([]);
  const projIdRef = useRef(1);

  const [playerShots, setPlayerShots] = useState<PlayerProjectile[]>([]);
  const playerProjIdRef = useRef(10000);

  const spawnBossProjectile = useCallback((p:{x:number;y:number;vx:number;vy:number;lifeMs:number}) => {
    const id = projIdRef.current++;
    setBossShots(prev => [...prev, { id, bornAt: Date.now(), ...p }]);
  }, []);

  // Prefab id for the 3-block platform (adjust if your id differs)
  const THREE_BLOCK_PREFAB = levelData.mapName === 'frozen' ? 'platform-frozen-3-final' : 'platform-grass-3-final';

  function findNearestThreeBlockAbove(mgr: any, targetY: number) {
    if (!mgr) return null;
    
    // Get all platforms and filter for 3-block grass platforms above target
    const allPlatforms = mgr.getAllPlatforms();
    const threeBlockPlatforms = allPlatforms.filter(p => (p.prefab ?? p.name) === THREE_BLOCK_PREFAB);
    
    // Filter for platforms ABOVE the target (remember: up is negative, so y <= targetY means above)
    const aboveTarget = threeBlockPlatforms.filter(p => p.y <= targetY);
    
    if (aboveTarget.length === 0) {
      return null;
    }
    
    // Sort by Y descending (closest above = largest Y value)
    const sorted = aboveTarget.sort((a, b) => b.y - a.y);
    const closest = sorted[0];
    
    const w = closest.collision?.width ?? closest.w ?? closest.width ?? 144;
    
    return { id: closest.id, x: closest.x, y: closest.y, w };
  }

  // Find the top platform in boss room for door-ice spawning
  function findTopBossPlatform() {
    const currentPlatforms = bossPlatformsRef.current || bossPlatforms;
    if (!currentPlatforms || currentPlatforms.length === 0) return null;
    
    // Find the platform with the highest Y position (remember: up is negative)
    return currentPlatforms.reduce((top, current) => {
      return current.y < top.y ? current : top; // smaller Y = higher up
    });
  }

  // Spawn door-ice on the top platform in boss room
  function spawnDoorIceOnTopPlatform() {
    // Use the ref instead of state since it should have the current value
    const currentPlatforms = bossPlatformsRef.current || bossPlatforms;
    
    if (currentPlatforms.length === 0) {
      return;
    }
    
    const topPlatform = currentPlatforms.reduce((top, current) => {
      return current.y < top.y ? current : top; // smaller Y = higher up
    });
    
    if (topPlatform) {
      const anchor = {
        id: topPlatform.id,
        x: topPlatform.x,
        y: topPlatform.y,
        w: topPlatform.w
      };
      setDoorIceAnchor(anchor);
    }
  }


  // State variables
  const [x, setX] = useState(SCREEN_W * 0.5);
  const [z, setZ] = useState(0);
  const [dirX, setDirX] = useState(0);
  const [speedLevel, setSpeedLevel] = useState<'idle'|'run'>('idle');
  const [isAttacking, setIsAttacking] = useState(false);
  
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
  const clampToGroundFramesRef = useRef(0);
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

  // Floor calculation (unified)
  const floorTopY = useMemo(() => floorTopYFor(levelData.mapName as ProfileMapName), [levelData.mapName]);

  // Character dims - MOVED HERE to avoid hoisting issues
  const mapDef = MAPS[levelData.mapName];
  const TILE = getTileSize(levelData.mapName) * SCALE;
  const COL_W = Math.round(0.58 * 48 * SCALE);
  const COL_H = Math.round(0.88 * 48 * SCALE) - 15;
  const CHAR_W = 48 * SCALE;
  const CHAR_H = 48 * SCALE;

  // Calculate player's world Y position
  const playerWorldY = floorTopY - zRef.current;

  // Boss system: player world coordinates and bounding box
  const playerWorldX = xRef.current + CHAR_W / 2;
  const playerBBoxWorld = {
    left: xRef.current + CHAR_W / 2 - COL_W / 2,
    right: xRef.current + CHAR_W / 2 + COL_W / 2,
    top: playerWorldY - COL_H,
    bottom: playerWorldY,
  };
  

  // Door position is now frozen in doorPos state

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
    const mgr = new EnhancedPlatformManager(levelData.mapName as any, floorTopY, 2);
    platformManager.current = mgr;
    
    // Clear any existing platforms to prevent duplicate keys
    setAllPlatforms([]);
    updatePlatforms([]);

    const bootCamY = 0; // Initial camera Y
    const bootPlayerY = 0; // Initial player Y

    // One-time seed: bypass throttle and movement gating
    mgr.updateForCamera(bootCamY, { force: true, playerY: bootPlayerY });

    // Now publish to state once so the first frame has content
    updatePlatforms(mgr.getAllPlatforms());
    
    // Check if this level should start in boss room mode
    console.log('[GameScreen] Level data:', { 
      mapName: levelData.mapName, 
      startInBossRoom: levelData.startInBossRoom,
      floorTopY 
    });
    
    if (levelData.startInBossRoom) {
      console.log('[GameScreen] Starting in boss room mode');
      enterMap("bossroom", {
        setMode, setCameraY,
        setPlatforms: setBossPlatforms,
        buildPlatforms: createBossPlatforms,
        setDoorAnchor, setDoorIceAnchor,
        xRef, zRef, vxRef, vzRef, onGroundRef,
        clampFramesRef: clampToGroundFramesRef,
        mapWidthFor: (m) => prefabWidthPx(m, THREE_BLOCK_PREFAB),
        modeForMap: (m) => (m === "bossroom" ? "bossroom" : "tower"),
        platformManager: platformManager.current
      });
    } else {
      console.log('[GameScreen] Starting in tower mode');
      setMode('tower'); // Ensure we start in tower mode for regular levels
    }
    
  }, [levelData.mapName, floorTopY, levelData.startInBossRoom]); // Added startInBossRoom dependency


  // PERFORMANCE: O(cells) instead of O(N) platform queries
  const visiblePlatforms = useMemo(() => {
    const top = cameraY - SCREEN_H * 0.5;
    const bottom = cameraY + SCREEN_H * 1.5;
    return platformManager.current
      ? platformManager.current.getPlatformsInRect(top, bottom)
      : [];
    // Note: do NOT depend on allPlatforms here—tie to camera only
  }, [Math.floor(cameraY / 8)]);


  // Convert boss platform rects to PlatformDef for the renderer
  const bossDisplayPlatforms = useMemo<PlatformDef[]>(() => {
    return bossPlatforms.map(p => ({
      id: p.id,
      type: 'platform',
      prefab: THREE_BLOCK_PREFAB, // 'platform-grass-3-final'
      x: p.x,
      y: p.y,
      scale: 1,
      // collision is not required for drawing; kept in your bossCollision array
    }));
  }, [bossPlatforms]);

  // Find and anchor the door to a 3-block platform (only on grassy map)
  useEffect(() => {
    if (levelData.mapName !== 'grassy') {
      setDoorAnchor(null); // Clear door anchor on non-grassy maps
      return;
    }

    if (doorAnchor) {
      return; // already found
    }

    const mgr = platformManager.current;
    if (!mgr) {
      return;
    }

    const a = findNearestThreeBlockAbove(mgr, DOOR_TARGET_Y_WORLD);
    if (a) {
      setDoorAnchor(a);
    }
  }, [visiblePlatforms, DOOR_TARGET_Y_WORLD, levelData.mapName]);


  // Add this after platformManager initialization to validate the setup:
  useEffect(() => {
    if (platformManager.current) {
      
      // Debug platforms around floor level
      platformManager.current.debugPlatformsNearY(floorTopY, 300);
    }
  }, [platformManager.current]);
  


  // Character dims moved to earlier in the file to avoid hoisting issues

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
    
    // Update facing direction for sword attacks
    // Only update if actually moving (not idle)
    if (o.dirX !== 0) {
      facingLeftRef.current = o.dirX === -1;
    }

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

  // Attack callback
  const requestAttack = useCallback(() => {
    if (modeRef.current !== 'bossroom') return;
    if (isAttackingRef.current) return;

    // Keep your melee attack window intact
    isAttackingRef.current = true;
    attackHitRegisteredRef.current = false;
    attackEndAtRef.current = performance.now() + ATTACK_DURATION_MS;
    setIsAttacking(true);

    // schedule projectile ~200ms later; compute SCREEN coords at fire time
    setTimeout(() => {
      if (modeRef.current !== 'bossroom') return;

      // SCREEN coordinates at fire time
      const halfW = COL_W / 2;
      const centerX_screen = xRef.current + halfW;

      // feet on screen; your engine defines zRef as height above the floor line
      const feetY_screen   = floorTopY - zRef.current;

      // sprite top on screen; use full sprite height (not the collider)
      const topY_screen    = feetY_screen - CHAR_H;

      // head line at a ratio from top → down
      const headY_screen   = topY_screen + (PLAYER_PROJECTILE_HEAD_RATIO * CHAR_H);

      // face-forward nudge
      const dir = facingLeftRef.current ? -1 : 1;
      const spawnX = centerX_screen + dir * (halfW * 0.18);
      const spawnY = headY_screen;

      // Play player fireball sound
      soundManager.playPlayerFireballSound();

      // store as SCREEN coords
      setPlayerShots(s => s.concat([{
        id: playerProjIdRef.current++,
        x: spawnX, y: spawnY,            // screen-space projectile
        vx: dir * PLAYER_PROJECTILE_SPEED, vy: 0,
        lifeMs: PLAYER_PROJECTILE_LIFE_MS,
        bornAt: Date.now(),
        r: 7,
      }]));
    }, PLAYER_PROJECTILE_LAUNCH_DELAY_MS);
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
      
      // Track consecutive grounded frames (simple hysteresis for the door trigger)
      if (onGroundRef.current) {
        groundedFramesRef.current = Math.min(groundedFramesRef.current + 1, 60);
      } else {
        groundedFramesRef.current = 0;
      }

      // Ground clamp for map entry (unified system)
      if (clampToGroundFramesRef.current > 0) {
        zRef.current = 0;
        vzRef.current = 0;
        onGroundRef.current = true;
        groundedFramesRef.current = Math.max(groundedFramesRef.current, 1);
        clampToGroundFramesRef.current -= 1;
      }
      
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

      // Ground clamp for post-warp positioning
      if (clampToGroundFramesRef.current > 0) {
        zRef.current = 0;           // stand on floor
        vzRef.current = 0;          // no residual vertical velocity
        onGroundRef.current = true; // firmly grounded
        groundedFramesRef.current = Math.max(groundedFramesRef.current, 1);
        clampToGroundFramesRef.current -= 1;
      }

      // Calculate current Y position after physics update
      const currFeetY = floorTopY - zRef.current;
      const prevTopY = prevFeetY - COL_H;
      const currTopY = currFeetY - COL_H;

      // ==== DIRECT HAZARD BAND DEATH CHECK ====
      // Check if player has fallen into the hazard band area (more reliable than platform collision)
      const deathFloor = platformManager.current?.getDeathFloor?.();
      if (deathFloor && !isDead && hazardsActive()) {
        const hazardTopWorld = deathFloor.y;
        const playerWorldY = floorTopY - zRef.current;
        if (playerWorldY >= hazardTopWorld + 40) {
          deathTypeRef.current = 'fire';
          takeDamage(999);
          return;
        }
      }

      // ==== DEATH FLOOR UPDATE (tower only) ====
      // Update the death floor position to follow the player
      if (platformManager.current && modeRef.current === 'tower') {
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
        // IMPORTANT: In bossroom we MUST ignore tower platforms to prevent "invisible" landings.
        const isBoss = modeRef.current === 'bossroom';
        const nearbyPlatforms = isBoss
          ? []
          : (platformManager.current?.getPlatformsNearPlayer(
              playerWorldX,
              playerWorldY,
              200 // Increased search radius
            ) || []);
        
    // Add boss room collision slabs
    const bossCollision = mode === 'bossroom'
      ? [
          // Boss room floor - UNIFIED HEIGHT
          {
            id: 'boss-floor',
            x: -SCREEN_W,
            y: floorTopY, // CHANGED: Use unified floorTopY
            w: SCREEN_W * 3,
            h: 32,
            type: 'platform' as const,
            collision: {
              left: -SCREEN_W,
              right: SCREEN_W * 2,
              topY: floorTopY, // CHANGED: Use unified floorTopY
              solid: true,
              width: SCREEN_W * 3,
              height: 32
            },
            prefab: 'floor',
            scale: 1
          },
          // Boss platforms
          ...bossPlatforms.map(p => ({ 
            id: p.id, 
            x: p.x, 
            y: p.y, 
            w: p.w, 
            h: p.h, 
            type: 'platform' as const,
            collision: { 
              left: p.x, 
              right: p.x + p.w, 
              topY: p.y, 
              solid: true,
              width: p.w,
              height: p.h
            },
            prefab: p.prefab,
            scale: 1
          }))
        ]
      : [];

        const platformsForCollision = isBoss
          ? bossCollision      // boss room: only fixed slabs we define below
          : nearbyPlatforms;   // tower: only procedurally generated platforms
        
        
        // Check each platform
        for (const platform of platformsForCollision) {
          if (!platform.collision?.solid) continue;
          
          const collision = platform.collision;
          
          // No prefab floor anymore — don't skip near-floor pads.
          // (This was making the starter platform non-collidable.)
          // if (collision.topY >= floorTopY - 10) continue;
          
          // SPECIAL HANDLING FOR DEATH FLOOR - Much tighter collision
          if (platformManager.current?.isDeathFloor(platform) && hazardsActive()) {
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

    // ===== Door teleport (tight feet-in-door check) - only on grassy map =====
    if (mode === 'tower' && levelData.mapName === 'grassy' && doorAnchorRef.current) {
      // Calculate door position from current anchor (same as used for rendering)
      const currentDoorWorldX = Math.round(doorAnchorRef.current.x + (doorAnchorRef.current.w - DOORWAY_WIDTH) * 0.5);
      const currentDoorWorldY = Math.round(doorAnchorRef.current.y - DOORWAY_HEIGHT + DOORWAY_POSITION_OFFSET);
      // Player center X and feet Y in world space
      const playerCenterX = xRef.current + CHAR_W * 0.5;
      const playerFeetY   = floorTopY - zRef.current;

      const inside = pointInDoorTightFeet(
        playerCenterX,
        playerFeetY,
        currentDoorWorldX,
        currentDoorWorldY,
        DOOR_TRIGGER_INNER_X_RATIO,
        DOOR_TRIGGER_BOTTOM_Y_RATIO,
        DOOR_TRIGGER_PAD
      );

      // Require the player to be truly standing at the door for a few frames
      const groundedOK = groundedFramesRef.current >= DOOR_TRIGGER_REQUIRE_GROUNDED_FRAMES;
      if (inside && groundedOK && !hasTeleportedRef.current) {
        hasTeleportedRef.current = true;

        // 1) briefly suppress hazards so this frame can't kill us
        hazardSuppressUntilMsRef.current = Date.now() + 1000;

        // 2) enter boss room using unified system
        enterMap("bossroom", {
          setMode, setCameraY,
          setPlatforms: setBossPlatforms,
          buildPlatforms: createBossPlatforms,
          setDoorAnchor, setDoorIceAnchor,
          xRef, zRef, vxRef, vzRef, onGroundRef,
          clampFramesRef: clampToGroundFramesRef,
          mapWidthFor: (m) => prefabWidthPx(m, THREE_BLOCK_PREFAB),
          modeForMap: (m) => (m === "bossroom" ? "bossroom" : "tower"),
          platformManager: platformManager.current
        });

        // 3) stop any tower projectiles; enable boss projectiles later
        setBossShots([]);
        projIdRef.current = 1;
        setPlayerShots([]);
        bossProjectilesEnabledRef.current = false;
      }
    } else {
      // Reset guard when not in tower or door no longer present
      hasTeleportedRef.current = false;
    }

    // ===== Door-Ice teleport (boss room to frozen map) =====
    if (modeRef.current === 'bossroom' && doorIceAnchorRef.current) {
      const { x: diX, y: diY } = calcDoorIceWorldXY(doorIceAnchorRef.current);

      // Player center X and FEET Y in WORLD space
      const playerCenterX = xRef.current + CHAR_W * 0.5;
      const playerFeetY   = floorTopY - zRef.current;

      // Tight feet-in-door check, matching DoorIceSprite scale/geometry
      const inside = pointInDoorIceTightFeet(
        playerCenterX,
        playerFeetY,
        diX,
        diY,
        DOOR_TRIGGER_INNER_X_RATIO,
        DOOR_TRIGGER_BOTTOM_Y_RATIO,
        DOOR_TRIGGER_PAD
      );

      // Require a few grounded frames so you can't "catch" the door mid-jump
      const groundedOK = groundedFramesRef.current >= DOOR_TRIGGER_REQUIRE_GROUNDED_FRAMES;

      // Debug door-ice teleport (removed verbose logging to reduce spam)

      if (inside && groundedOK && !hasTeleportedDoorIceRef.current) {
        hasTeleportedDoorIceRef.current = true;

        // 1) briefly suppress hazards so this frame can't kill us
        hazardSuppressUntilMsRef.current = Date.now() + 1000;

        // 2) Clear all state before switching maps (same as direct start)
        setAllPlatforms([]);
        updatePlatforms([]);
        setBossShots([]);
        setPlayerShots([]);
        bossProjectilesEnabledRef.current = false;
        projIdRef.current = 1;

        // 3) switch to frozen map using unified system
        const frozenLevel = LEVELS.frozen;
        onLevelChange(frozenLevel);
        
        enterMap("frozen", {
          setMode, setCameraY,
          setPlatforms: setAllPlatforms,
          buildPlatforms: () => [], // frozen uses procedural generation
          setDoorAnchor, setDoorIceAnchor,
          xRef, zRef, vxRef, vzRef, onGroundRef,
          clampFramesRef: clampToGroundFramesRef,
          mapWidthFor: (m) => prefabWidthPx(m, THREE_BLOCK_PREFAB),
          modeForMap: (m) => (m === "bossroom" ? "bossroom" : "tower"),
          platformManager: platformManager.current
        });
        
        console.log('[DEBUG] Door-ice teleport triggered!');
        
      }
    } else {
      // Reset the guard if we leave bossroom or door disappears
      hasTeleportedDoorIceRef.current = false;
    }
    
    // TEMPORARY: Reset teleport guards every 5 seconds for testing
    if (frameCount % 300 === 0) { // 5 seconds at 60fps
      hasTeleportedRef.current = false;
      hasTeleportedDoorIceRef.current = false;
    }

    // ───────────────────────────────────────────────────────────────
    // HEART COLLISION (boss-room only)
    const hp = heartPickupRef.current;
    if (modeRef.current === 'bossroom' && hp) {
      // Wait until the spawn fade finishes (if present)
      const ready = !('activatesAt' in hp) || Date.now() >= (hp as any).activatesAt;
      if (ready) {
        // Heart "virtual" center for pickup detection (at floor level)
        const heartCX = hp.x + 16;  // Keep horizontal center
        const heartCY = floorTopY;  // Position pickup zone at floor level

        // Player feet point + horizontal center in WORLD space
        // `box` is our cached player AABB in WORLD coords (built earlier via getPlayerBox)
        const px = (box.left + box.right) * 0.5; // player center X
        const py = box.bottom;                   // player feet Y

        // Feet-based circular pickup — forgiving and feels great
        const dx = px - heartCX;
        const dy = py - heartCY;
        const r = 20; // pickup radius; adjust 18–22 as you like
        const inside = (dx * dx + dy * dy) <= (r * r);


        if (inside) {
          resetHealthRef.current();   // full heal (or call a heal() of your choice)
          setHeartPickup(null);
          heartPickupRef.current = null;
          soundManager.playHealthPowerupSound();

          // Spawn door-ice on the top platform right after pickup
          spawnDoorIceOnTopPlatform();
        }
      }
    }

    // === BOSS-ROOM ONE-WAY PLATFORM COLLISION ===
    // Treat the 6–7 fixed slabs like normal one-way tops.
    if (modeRef.current === 'bossroom') {
      const playerX = xRef.current + CHAR_W / 2;
      const playerY = floorTopY - zRef.current;
      const half = COL_W / 2;

      for (const p of bossPlatformsRef.current) {
        const left = p.x, right = p.x + p.w, top = p.y;
        const horizontallyOver = (playerX - half) < right && (playerX + half) > left;
        if (!horizontallyOver) continue;

        const distanceToSurface = playerY - top; // + means below top surface
        // same friendly landing window as tower platforms
        if (vzRef.current <= 0 && distanceToSurface <= 25 && distanceToSurface >= -15) {
          // snap feet onto slab
          zRef.current = floorTopY - top;
          vzRef.current = 0;
          onGroundRef.current = true;
          break;
        }
      }
    }

    // === BOSS COLLISION (prevents phasing) - OPTIMIZED ===
    if (modeRef.current === 'bossroom' && frameCount % 2 === 0) { // Only check every 2nd frame
      const bPose = bossPoseRef.current;
      const b = bPose?.solid ?? { left:-1e9, right:-1e9, top:-1e9, bottom:-1e9 };
      // Quick bounds check first
      if (b.left !== 0 || b.right !== 0 || b.top !== 0 || b.bottom !== 0) {
        const HALF_W = COL_W / 2;
        const HALF_H = COL_H / 2;
        const playerCenterX = xRef.current + HALF_W;
        const playerFeetY = floorTopY - zRef.current;
        const playerTopY = playerFeetY - HALF_H * 2;

        const pBox = { l: playerCenterX - HALF_W, r: playerCenterX + HALF_W, t: playerTopY, b: playerFeetY };
        const bossBox = { l: b.left, r: b.right, t: b.top, b: b.bottom };

        if (rectsOverlap(pBox, bossBox)) {
          const overlapLeft = Math.abs(pBox.r - bossBox.l);
          const overlapRight = Math.abs(bossBox.r - pBox.l);
          const overlapTop = Math.abs(pBox.b - bossBox.t);
          const overlapBottom = Math.abs(bossBox.b - pBox.t);
          const minHoriz = Math.min(overlapLeft, overlapRight);
          const minVert = Math.min(overlapTop, overlapBottom);

          if (minHoriz <= minVert) {
            // resolve horizontally
            if (overlapLeft < overlapRight) {
              xRef.current -= overlapLeft;
            } else {
              xRef.current += overlapRight;
            }
          } else {
            // resolve vertically
            if (overlapTop < overlapBottom) {
              zRef.current = floorTopY - bossBox.t;
              vzRef.current = Math.min(0, vzRef.current);
              onGroundRef.current = true;
            } else {
              zRef.current = floorTopY - bossBox.b - COL_H;
              vzRef.current = Math.max(0, vzRef.current);
            }
          }
        }
      }
    }

    // === SWORD ATTACK WINDOW & HIT DETECTION - OPTIMIZED ===
    if (modeRef.current === 'bossroom' && isAttackingRef.current) {
      if (performance.now() >= attackEndAtRef.current) {
        isAttackingRef.current = false;
        setIsAttacking(false); // Reset the React state as well
      } else if (!attackHitRegisteredRef.current) {
        const bHurt = bossPoseRef.current?.hurt ?? { left:0,right:0,top:0,bottom:0 };
        // Quick bounds check first
        if (bHurt.left !== 0 || bHurt.right !== 0 || bHurt.top !== 0 || bHurt.bottom !== 0) {
          const HALF_W = COL_W / 2;
          const HALF_H = COL_H / 2;
          const centerX = xRef.current + HALF_W;
          const feetY = floorTopY - zRef.current;
          const midY = feetY - HALF_H;

          const reach = HALF_W * 1.2;
          const thick = HALF_H * 0.6;

          const facingLeft = !!facingLeftRef.current;
          const sL = facingLeft ? centerX - reach - HALF_W * 0.3 : centerX + HALF_W * 0.3;
          const sR = facingLeft ? centerX - HALF_W * 0.3 : centerX + reach + HALF_W * 0.3;
          const sT = midY - thick * 0.5;
          const sB = midY + thick * 0.5;

          const swordBox = { l: sL, r: sR, t: sT, b: sB };
          const bossBox = { l: bHurt.left, r: bHurt.right, t: bHurt.top, b: bHurt.bottom };

          if (rectsOverlap(swordBox, bossBox)) {
            attackHitRegisteredRef.current = true;
            if (!isBossDead) {
              setBossHP(hp => {
                const next = Math.max(0, hp - 1);
                setBossHurtUntilMs(Date.now() + BOSS_HURT_FLASH_MS);
                return next;
              });
            }
          }
        }
      }
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
      // In bossroom the camera is fixed so the entire room fits on screen.
      if (modeRef.current === 'bossroom') {
        if (cameraY !== 0) setCameraY(0); // keep room fixed
      } else {
        if (frameCount % 2 === 0) { // Every 2 frames for smoother movement (was 5)
          const DEADZONE_FROM_TOP = Math.round(SCREEN_H * 0.40);
          const playerScreenY = floorTopY - zRef.current - cameraY;

          // UPWARD TRACKING
          if (playerScreenY < DEADZONE_FROM_TOP) {
            const targetCameraY = cameraY + (playerScreenY - DEADZONE_FROM_TOP);
            const newCameraY = Math.round(targetCameraY);

            if (Math.abs(newCameraY - cameraY) > 1) {
              setCameraY(newCameraY);

              // Platform generation throttled to 1/s and only in tower
              if (platformManager.current && frameCount % 60 === 0 && modeRef.current === 'tower') {
                const playerWorldY = floorTopY - zRef.current;
                const changed = platformManager.current.updateForCamera(newCameraY, { playerY: playerWorldY });
                if (changed) updatePlatforms(platformManager.current.getAllPlatforms());
              }
            }
          }
          // DOWNWARD TRACKING (limited)
          else if (playerScreenY > DEADZONE_FROM_TOP + 100) {
            const maxDown = cameraY + 100;
            const targetCameraY = cameraY + (playerScreenY - DEADZONE_FROM_TOP - 100);
            const newCameraY = Math.min(maxDown, Math.round(targetCameraY));

            if (Math.abs(newCameraY - cameraY) > 1) {
              setCameraY(newCameraY);

              if (platformManager.current && frameCount % 60 === 0 && modeRef.current === 'tower') {
                const playerWorldY = floorTopY - zRef.current;
                const changed = platformManager.current.updateForCamera(newCameraY, { playerY: playerWorldY });
                if (changed) updatePlatforms(platformManager.current.getAllPlatforms());
              }
            }
          }
        }
      }

      // Update fade-out animations every frame for smooth animation (runs regardless of camera movement)
      if (platformManager.current && modeRef.current === 'tower') {
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
          {/* BACKGROUND */}
          {useMemo(() => {
            if (mode === 'tower') {
              return (
                <Group>
                  <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} color="#87CEEB" />
                  {(() => {
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
                          <Rect x={x - cloud.size * 0.5} y={cloud.y} width={cloud.size} height={cloud.size * 0.6} color="white" opacity={0.8} />
                          <Rect x={x - cloud.size * 0.3} y={cloud.y - cloud.size * 0.2} width={cloud.size * 0.6} height={cloud.size * 0.6} color="white" opacity={0.9} />
                        </Group>
                      );
                    });
                  })()}
                </Group>
              );
            } else {
              return (
                <TiledFloor
                  left={0}
                  right={SCREEN_W}
                  topY={floorTopY - 7}
                  cameraY={0}
                  tileHeight={32}
                  prefer128={true}
                  timeMs={hazardAnimationTime}
                />
              );
            }
          }, [mode, SCREEN_W, SCREEN_H, elapsedSec, hazardAnimationTime, floorTopY, worldYToScreenY])}
          
          <Group transform={[{ translateY: -cameraY }]}>
            {/* PERFORMANCE: Use memoized platform renderer - only in tower mode */}
            {mode === 'tower' && (
              <PlatformRenderer 
                platforms={visiblePlatforms}
                mapName={levelData.mapName}
                opacity={1.0}
              />
            )}
            
            {/* Doorway rendering - only in tower mode and only on grassy map */}
            {mode === 'tower' && levelData.mapName === 'grassy' && doorAnchor && (
              <DoorSprite
                doorWorldX={doorWorldX}
                doorWorldY={doorWorldY}
                xToScreen={(x) => x}
                worldYToScreenY={worldYToScreenY}
                screenW={SCREEN_W}
                screenH={SCREEN_H}
              />
            )}
            
            {/* Door-Ice rendering - only in boss room mode after heart pickup */}
            {mode === 'bossroom' && doorIceAnchor && (
              <DoorIceSprite
                doorWorldX={doorIceWorldX}
                doorWorldY={doorIceWorldY}
                xToScreen={(x) => x}
                worldYToScreenY={worldYToScreenY}
                screenW={SCREEN_W}
                screenH={SCREEN_H}
              />
            )}
            
      {/* Boss room platforms - render using dark tileset */}
      {mode === 'bossroom' && bossPlatforms.map(p => (
        <PrefabNode key={p.id} map="dark" name={p.prefab} x={p.x} y={p.y} scale={2} />
      ))}

            {/* Boss room decorations - lights and vases */}
            {mode === 'bossroom' && (() => {
              const decorations: Array<{ prefab: string; x: number; y: number; zIndex?: number }> = [];
              
              
              // Add vases on floor and platforms (reduced spawn rate by 50%)
              bossPlatforms.forEach((platform, idx) => {
                if (idx % 4 === 0) { // Changed from % 2 to % 4 (50% reduction)
                  // Place vase on every fourth platform (static positioning)
                  const vaseType = 'vase-1-final'; // Fixed type instead of random
                  const vaseY = platform.y - 32; // Static Y position (platform top - 32px)
                  decorations.push({
                    prefab: vaseType,
                    x: platform.x + platform.w / 2 - 16, // Center vase on platform
                    y: vaseY,
                    zIndex: 10
                  });
                }
              });
              
              
              return decorations.map((deco, idx) => (
                <PrefabNode 
                  key={`deco-${idx}`}
                  map="dark"
                  name={deco.prefab}
                  x={deco.x}
                  y={deco.y}
                />
              ));
            })()}

            {/* Boss demon and projectiles */}
            {mode === 'bossroom' && !bossDespawned && (() => {
              // Ensure numeric player world coordinates for boss
              const safePlayerWorldX = Number(xRef.current) + Number(CHAR_W) / 2;
              const safePlayerWorldY = Number(floorTopY) - Number(zRef.current);
              
              
              return (
                <BossDemon
                  xWorld={prefabWidthPx(levelData.mapName, THREE_BLOCK_PREFAB)*0.5}
                  yWorld={floorTopY - 420}
                  worldYToScreenY={worldYToScreenY}
                  xToScreen={(x) => x}
                  screenW={SCREEN_W}
                  screenH={SCREEN_H}
                  playerX={safePlayerWorldX}
                  playerY={safePlayerWorldY}
                  onPose={(pose) => { bossPoseRef.current = pose; }}
                  onShoot={({x, y, vx, vy, lifeMs}) => {
                    setBossShots(s => {
                      const newShot = {
                        id: projIdRef.current++,
                        x, y, vx, vy, lifeMs,
                        bornAt: Date.now(),
                        r: 4 + Math.random() * 3,   // smaller, more precise collision
                      };
                      return s.concat([newShot]);
                    });
                  }}
                  isHurt={isBossHurt}
                  isDead={isBossDead}
                  onDeathDone={() => {
                    console.log('[DEBUG] Boss death animation finished, spawning heart pickup...');
                    setBossDespawned(true);
                    // Clear boss collision boxes
                    bossPoseRef.current = {
                      visual: {left:0,right:0,top:0,bottom:0},
                      solid:  {left:0,right:0,top:0,bottom:0},
                      hurt:   {left:0,right:0,top:0,bottom:0},
                      centerX: 0,
                      centerY: 0,
                    };

                    // Spawn a heart pickup in the center of the boss room, 25px above the floor
                    setTimeout(() => {
                      try {
                        const HEART_SIZE = 32;
                        const spawnX = Math.round(SCREEN_W * 0.5 - HEART_SIZE * 0.5); // Center of screen
                        // Keep heart at original position
                        const spawnY = Math.round(floorTopY - 177); // Move up another 25px (total 50px from original)
                        const now = Date.now(); // Use real time for consistent gating
                        const fadeMs = 850;  // fade-in/spawn effect duration
                        // Set spawnAt to current time so fade-in starts immediately
                        const hp = { x: spawnX, y: spawnY, spawnAt: now, activatesAt: now + fadeMs };
                        setHeartPickup(hp);
                        heartPickupRef.current = hp;
                      } catch (e) {
                        if (__DEV__) console.warn('Heart spawn failed', e);
                      }
                    }, 2000); // 2s delay before heart appears
                  }}
                />
              );
            })()}

            {/* Player Projectiles - Purple Fireballs */}
            {mode === 'bossroom' && (() => {
              const hurt = bossPoseRef.current?.hurt;
              if (!hurt) return null;

              // Map hurt box to SCREEN space (x is already on-screen in your engine)
              const hurtScreen = {
                left:   hurt.left,
                right:  hurt.right,
                top:    worldYToScreenY(hurt.top),
                bottom: worldYToScreenY(hurt.bottom),
              };

              return (
                <PlayerProjectiles
                  projectiles={playerShots}
                  setProjectiles={setPlayerShots}
                  screenW={SCREEN_W}
                  screenH={SCREEN_H}
                  targetBoxScreen={hurtScreen}                 // ★ same space as projectile
                  onBossHit={(dmg) => {
                    if (isBossDead) return;
                    setBossHP(hp => {
                      const next = Math.max(0, hp - dmg);
                      setBossHurtUntilMs(Date.now() + BOSS_HURT_FLASH_MS);
                      
                      // Play boss death sound when HP reaches 0 (before death animation starts)
                      console.log('[DEBUG] Boss hit - current HP:', hp, 'damage:', dmg, 'next HP:', next);
                      if (next === 0 && hp > 0) {
                        console.log('[DEBUG] Boss HP reached 0, playing death sound and starting death animation');
                        soundManager.playBossDeathSound();
                      }
                      
                      return next;
                    });
                  }}
                />
              );
            })()}

            {mode === 'bossroom' && (() => {
              // Ensure numeric player world coordinates for projectiles
              const safePlayerWorldX = Number(xRef.current) + Number(CHAR_W) / 2;
              const safePlayerWorldY = Number(floorTopY) - Number(zRef.current);
              const safePlayerBBoxWorld = {
                left: safePlayerWorldX - Number(COL_W) / 2,
                right: safePlayerWorldX + Number(COL_W) / 2,
                top: safePlayerWorldY - Number(COL_H),
                bottom: safePlayerWorldY,
              };
              
              
              return (
                <BossProjectiles
                  projectiles={bossShots}
                  setProjectiles={setBossShots}
                  xToScreen={(x) => x}
                  worldYToScreenY={worldYToScreenY}
                  screenW={SCREEN_W}
                  screenH={SCREEN_H}
                  playerBBoxWorld={safePlayerBBoxWorld}
                  onPlayerHit={(dmg) => takeDamage(dmg)}
                />
              );
            })()}
            
            <DashCharacter
              floorTopY={floorTopY}
              posX={xRef.current}
              lift={z}
              scale={SCALE}
              footOffset={DEFAULT_FOOT_OFFSET}
              isHurt={isHurt}
              isDead={isDead}
              isBossRoom={mode === 'bossroom'}
              isAttacking={isAttacking}
              input={{
                vx: vxRef.current,
                dirX: dirX as -1 | 0 | 1,
                crouch: false,
                onGround: onGroundRef.current,
              }}
            />
          </Group>

        {/* Boss HUD - only in boss room - IMAGE-BASED VERSION */}
        {mode === 'bossroom' && (
          <BossHUD
            screenW={SCREEN_W}
            screenH={SCREEN_H}
            yOffset={0}         // EVA position from top - moved up 10px
            hearts={bossHP}
            maxHearts={6}   // was 5
            barGapY={-42}       // Health bar gap (negative = overlap/closer) - moved up 20px more
          />
        )}

        {/* Heart moved to overlay canvas above world layers */}
         </Canvas>

      {/* Heart Pickup overlay (above ground/lava) */}
      {mode === 'bossroom' && heartPickup && (
        <Canvas
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: SCREEN_W,
            height: SCREEN_H,
            zIndex: 9990,        // under your HUD (which uses ~9998), above ground/lava
          }}
          pointerEvents="none"
        >
          <HeartPickup
            xWorld={heartPickup.x}
            yWorld={heartPickup.y}
            xToScreen={(x) => x}
            worldYToScreenY={worldYToScreenY}
            screenW={SCREEN_W}
            screenH={SCREEN_H}
            spawnAtMs={heartPickup.spawnAt}
          />
        </Canvas>
      )}

      
      {/* Right stack: SCORE + TIME - Hidden in boss room */}
      {mode !== 'bossroom' && (
        <ScoreTimeHUD
          score={score}
          heightPx={maxHeightPx}
          timeMs={timeMs}
          anchor="right"
          top={50}
          onBoxSize={(w) => setRightCardW(w)}
          onMeasured={(h) => setRightHudH(h)}
        />
      )}

      {/* Health Bar - Vertical in boss room, horizontal in tower mode */}
      {mode === 'bossroom' ? (
        // Vertical health bar in top right corner for boss room
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 12,
            top: 37, // moved down by 25px (was 12, now 37)
            zIndex: 9998,
          }}
        >
          <BossVerticalHealthBar
            width={30}
            height={100}
            health={((maxHits - hits) / maxHits) * 100}
          />
        </View>
      ) : (
        // Horizontal health bar below TIME card for tower mode
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
      )}
      
      
      {/* Ground Band - Dirt with grass top - tower mode only */}
      {mode === 'tower' && (() => {
        // Use the same world->screen conversion as HazardBand for consistency
        const groundScreenY = worldYToScreenY(floorTopY);
        // Adjust upward to align grass lip exactly under character's feet
        const adjustedGroundY = groundScreenY - 30; // Move up 30px to align better
        const groundH = Math.max(0, SCREEN_H - adjustedGroundY);
        
        // Use FrozenBand for frozen map, GroundBand for other maps
        if (levelData.mapName === 'frozen') {
          return (
            <FrozenBand
              width={SCREEN_W}
              height={groundH}
              y={adjustedGroundY}
              opacity={1}
              timeMs={hazardAnimationTime}
            />
          );
        } else {
          return (
            <GroundBand
              width={SCREEN_W}
              height={groundH}
              y={adjustedGroundY}
              opacity={1}
              timeMs={hazardAnimationTime}
            />
          );
        }
      })()}
      
        {/* Hazard Band - Improved lava rendering */}
        {mode !== 'bossroom' && (() => {
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
      
      {/* Fireballs above lava - only in tower mode */}
      {mode === 'tower' && (() => {
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
            initialDelayMs={5000}       // 5 second delay before first fireball
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
        {mode === 'bossroom' ? (
          <BossRoomControls
            size={PAD_SIZE}
            margin={20}
            onPad={onPad}
            onJump={requestJump}
            onAttack={requestAttack}
            disabled={isDead}
          />
        ) : (
          <RNGHControls
            size={PAD_SIZE}
            margin={20}
            onPad={onPad}
            onJump={requestJump}
            disabled={isDead}
          />
        )}
      </View>

    </View>
    </SafeTouchBoundary>
  );
};

// Main GameScreen component
export const GameScreen: React.FC<GameScreenProps> = ({ levelData, onBack, onLevelChange }) => {
  return (
    <ImagePreloaderProvider maps={[levelData.mapName]}>
      <InnerGameScreen 
        levelData={levelData} 
        onBack={onBack}
        onLevelChange={onLevelChange}
      />
    </ImagePreloaderProvider>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  canvas: { flex: 1 },
});