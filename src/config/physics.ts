// src/config/physics.ts
// SINGLE SOURCE OF TRUTH for all physics and screen constants
// All other files MUST import from here - never use Dimensions.get() elsewhere

import { Dimensions } from 'react-native';

// ============================================================================
// SCREEN DIMENSIONS - SINGLE SOURCE OF TRUTH
// ============================================================================
// Get dimensions ONCE at app startup and freeze them
// This prevents drift from minimize/restore cycles
const windowDimensions = Dimensions.get('window');

export const SCREEN = {
  WIDTH: windowDimensions.width,
  HEIGHT: windowDimensions.height,
  // Expose a function to get fresh dimensions if truly needed (rare)
  getFresh: () => Dimensions.get('window'),
} as const;

// ============================================================================
// FLOOR CONFIGURATION - SINGLE SOURCE OF TRUTH
// ============================================================================
export const FLOOR = {
  // The visual height of the floor prefab in pixels (at scale 1)
  PREFAB_HEIGHT_PX: 48,
  // Scale applied to floor
  SCALE: 2,
  // Visual offset to align collision with sprite
  VISUAL_OFFSET: 0,
  // Collision box height
  COLLISION_HEIGHT: 32,
} as const;

// ============================================================================
// UNIFIED FLOOR CALCULATION - USE THIS EVERYWHERE
// ============================================================================
/**
 * Calculate the floor top Y position.
 * This is THE canonical function for floor position.
 * All maps use the same calculation for consistency.
 */
export function getFloorTopY(): number {
  // Floor top is at: screen bottom - floor height
  // Using collision height for where player stands
  const floorHeight = FLOOR.COLLISION_HEIGHT * FLOOR.SCALE;
  return Math.round(SCREEN.HEIGHT - floorHeight);
}

/**
 * Get floor top Y for a specific screen height (for boss room with fixed camera)
 */
export function getFloorTopYForHeight(screenHeight: number): number {
  const floorHeight = FLOOR.COLLISION_HEIGHT * FLOOR.SCALE;
  return Math.round(screenHeight - floorHeight);
}

// Export the frozen value for use in places that need a constant
export const FLOOR_TOP_Y = getFloorTopY();

// ============================================================================
// SHARED CONSTANTS (used by both modes)
// ============================================================================
export const SHARED = {
  // Screen dimensions - FROM THE SINGLE SOURCE
  SCREEN_W: SCREEN.WIDTH,
  SCREEN_H: SCREEN.HEIGHT,
  
  // Character dimensions
  SCALE: 2,
  CHAR_W: 48 * 2,  // 96px at scale 2
  CHAR_H: 48 * 2,  // 96px at scale 2
  COL_W: Math.round(0.58 * 48 * 2),   // Collision width
  COL_H: Math.round(0.88 * 48 * 2) - 15, // Collision height
  
  // Input
  PAD_SIZE: 140,
  
  // Timing
  MAX_DELTA_TIME: 0.05, // Cap at 50ms to prevent physics explosions on lag
  TARGET_FRAME_TIME: 0.0166, // 60 FPS target
  
  // Floor - expose the unified value
  FLOOR_TOP_Y: getFloorTopY(),
} as const;

// ============================================================================
// TOWER MODE PHYSICS (procedural climbing)
// ============================================================================
export const TOWER_PHYSICS = {
  // Core movement
  GRAVITY: 1500,
  JUMP_VELOCITY: 780,
  RUN_SPEED: 220,
  ACCEL: 1200,
  DECEL: 800,
  
  // Air control (reduced control while airborne)
  AIR_CONTROL_MULTIPLIER: 0.5,
  AIR_FRICTION: 0.95,
  GROUND_FRICTION: 0.75,
  
  // Jump buffering
  JUMP_BUFFER_MS: 100,
  COYOTE_TIME_MS: 80,
  
  // Platform collision
  PLATFORM_LANDING_TOLERANCE_ABOVE: 15,
  PLATFORM_LANDING_TOLERANCE_BELOW: 25,
  PLATFORM_HORIZONTAL_MARGIN: 8,
  
  // Camera
  CAMERA_DEADZONE_FROM_TOP: 0.40,
  CAMERA_UPDATE_THRESHOLD: 1,
  
  // Hazards
  FALL_DAMAGE_THRESHOLD_SCREENS: 0.2,
  LAVA_CHASE_DISTANCE_SCREENS: 0.5,
  
  // Platform generation
  GENERATION_AHEAD_SCREENS: 2.5,
  CULLING_FADE_START_SCREENS: 0.2,
  CULLING_HARD_KILL_SCREENS: 0.9,
} as const;

// ============================================================================
// BOSS ROOM PHYSICS (combat arena)
// ============================================================================
export const BOSS_PHYSICS = {
  // Core movement - same as tower for consistency
  GRAVITY: 1500,
  JUMP_VELOCITY: 780,
  RUN_SPEED: 220,
  ACCEL: 1200,
  DECEL: 800,
  
  // Air control - same as tower
  AIR_CONTROL_MULTIPLIER: 0.5,
  AIR_FRICTION: 0.95,
  GROUND_FRICTION: 0.75,
  
  // Jump buffering
  JUMP_BUFFER_MS: 100,
  COYOTE_TIME_MS: 80,
  
  // Platform collision - SAME values
  PLATFORM_LANDING_TOLERANCE_ABOVE: 15,
  PLATFORM_LANDING_TOLERANCE_BELOW: 25,
  PLATFORM_HORIZONTAL_MARGIN: 8,
  
  // Camera - FIXED in boss room
  CAMERA_FIXED: true,
  CAMERA_Y: 0,
  
  // Combat
  ATTACK_DURATION_MS: 500,
  SWORD_REACH_MULTIPLIER: 1.2,
  SWORD_THICKNESS_MULTIPLIER: 0.6,
  
  // Boss
  BOSS_MAX_HP: 6,
  BOSS_HURT_FLASH_MS: 220,
  BOSS_DEATH_FPS: 10,
  
  // Player projectiles
  PLAYER_PROJECTILE_SPEED: 420,
  PLAYER_PROJECTILE_LIFE_MS: 1400,
  PLAYER_PROJECTILE_LAUNCH_DELAY_MS: 200,
  PLAYER_PROJECTILE_HEAD_RATIO: 0.18,
  
  // Boss projectiles
  BOSS_FIRE_COOLDOWN_MIN_MS: 5000,
  BOSS_FIRE_COOLDOWN_MAX_MS: 10000,
  BOSS_PROJECTILE_SPEED: 320,
  BOSS_DAMAGE_PER_HIT: 1,
  
  // Hazard suppression (on teleport)
  HAZARD_SUPPRESS_MS: 1000,
  
  // Ground clamp frames after teleport
  GROUND_CLAMP_FRAMES: 2,
} as const;

// ============================================================================
// DOOR CONFIGURATION
// ============================================================================
export const DOOR_CONFIG = {
  // Tower door (grassy → boss)
  TOWER_DOOR: {
    SPAWN_Y: 150,
    WIDTH: 64,
    HEIGHT: 96,
    POSITION_OFFSET: 17,
    TRIGGER_INNER_X_RATIO: 0.55,
    TRIGGER_BOTTOM_Y_RATIO: 0.45,
    TRIGGER_PAD: 2,
    REQUIRE_GROUNDED_FRAMES: 3,
  },
  
  // Boss door (boss → frozen)
  BOSS_DOOR: {
    WIDTH: 64,
    HEIGHT: 96,
    POSITION_OFFSET: -35,
    SCALE: 1.5,
    NUDGE_X: -15,
    OFFSET_Y_ABOVE_TOP: 32,
  },
} as const;

// ============================================================================
// HELPER: Get physics config for current mode
// ============================================================================
export type GameMode = 'tower' | 'bossroom';

export function getPhysicsForMode(mode: GameMode) {
  return mode === 'bossroom' ? BOSS_PHYSICS : TOWER_PHYSICS;
}

// ============================================================================
// HELPER: Calculate derived values
// ============================================================================
export function calculateMaxJumpHeight(physics: typeof TOWER_PHYSICS | typeof BOSS_PHYSICS) {
  return (physics.JUMP_VELOCITY * physics.JUMP_VELOCITY) / (2 * physics.GRAVITY);
}

export function calculateJumpDuration(physics: typeof TOWER_PHYSICS | typeof BOSS_PHYSICS) {
  return (2 * physics.JUMP_VELOCITY) / physics.GRAVITY;
}

export function calculateMaxJumpDistance(physics: typeof TOWER_PHYSICS | typeof BOSS_PHYSICS) {
  const airTime = calculateJumpDuration(physics);
  return physics.RUN_SPEED * airTime;
}

// ============================================================================
// VALIDATION (dev only)
// ============================================================================
if (__DEV__) {
  console.log(`[Physics] Screen: ${SCREEN.WIDTH}x${SCREEN.HEIGHT}`);
  console.log(`[Physics] Floor top Y: ${FLOOR_TOP_Y}`);
  
  const towerJump = calculateMaxJumpHeight(TOWER_PHYSICS);
  const bossJump = calculateMaxJumpHeight(BOSS_PHYSICS);
  
  if (Math.abs(towerJump - bossJump) > 1) {
    console.warn(
      `[Physics] Tower and Boss jump heights differ: ` +
      `Tower=${towerJump.toFixed(1)}px, Boss=${bossJump.toFixed(1)}px`
    );
  }
}
