// src/config/gameplay.ts
// This file now re-exports from the centralized physics config
// Kept for backward compatibility with existing imports

import { DOOR_CONFIG, BOSS_PHYSICS } from './physics';

// ============================================================================
// DOOR CONFIGURATION (re-exported for backward compatibility)
// ============================================================================

// Tower door (grassy → boss)
export const DOORWAY_SPAWN_Y = DOOR_CONFIG.TOWER_DOOR.SPAWN_Y;
export const DOORWAY_WIDTH = DOOR_CONFIG.TOWER_DOOR.WIDTH;
export const DOORWAY_HEIGHT = DOOR_CONFIG.TOWER_DOOR.HEIGHT;
export const DOORWAY_POSITION_OFFSET = DOOR_CONFIG.TOWER_DOOR.POSITION_OFFSET;
export const DOOR_TRIGGER_INNER_X_RATIO = DOOR_CONFIG.TOWER_DOOR.TRIGGER_INNER_X_RATIO;
export const DOOR_TRIGGER_BOTTOM_Y_RATIO = DOOR_CONFIG.TOWER_DOOR.TRIGGER_BOTTOM_Y_RATIO;
export const DOOR_TRIGGER_PAD = DOOR_CONFIG.TOWER_DOOR.TRIGGER_PAD;
export const DOOR_TRIGGER_REQUIRE_GROUNDED_FRAMES = DOOR_CONFIG.TOWER_DOOR.REQUIRE_GROUNDED_FRAMES;

// Boss door (boss → frozen)
export const DOOR_ICE_WIDTH = DOOR_CONFIG.BOSS_DOOR.WIDTH;
export const DOOR_ICE_HEIGHT = DOOR_CONFIG.BOSS_DOOR.HEIGHT;
export const DOOR_ICE_POSITION_OFFSET = DOOR_CONFIG.BOSS_DOOR.POSITION_OFFSET;

// ============================================================================
// BOSS ROOM CONFIGURATION (re-exported for backward compatibility)
// ============================================================================

export const BOSSROOM_PLATFORM_COUNT = 7;
export const BOSS_FIRE_COOLDOWN_MIN = BOSS_PHYSICS.BOSS_FIRE_COOLDOWN_MIN_MS;
export const BOSS_FIRE_COOLDOWN_MAX = BOSS_PHYSICS.BOSS_FIRE_COOLDOWN_MAX_MS;
export const BOSS_PROJECTILE_SPEED = BOSS_PHYSICS.BOSS_PROJECTILE_SPEED;
export const BOSS_DAMAGE_PER_HIT = BOSS_PHYSICS.BOSS_DAMAGE_PER_HIT;

// ============================================================================
// PLAYER PROJECTILE CONFIGURATION (re-exported for backward compatibility)
// ============================================================================

export const PLAYER_PROJECTILE_SPEED = BOSS_PHYSICS.PLAYER_PROJECTILE_SPEED;
export const PLAYER_PROJECTILE_LIFE_MS = BOSS_PHYSICS.PLAYER_PROJECTILE_LIFE_MS;
export const PLAYER_PROJECTILE_LAUNCH_DELAY_MS = BOSS_PHYSICS.PLAYER_PROJECTILE_LAUNCH_DELAY_MS;
export const PLAYER_PROJECTILE_CHEST_RATIO = 0.35; // Legacy, not used
export const PLAYER_PROJECTILE_HEAD_RATIO = BOSS_PHYSICS.PLAYER_PROJECTILE_HEAD_RATIO;

// ============================================================================
// BOSS VISUAL CONFIGURATION (re-exported for backward compatibility)
// ============================================================================

export const BOSS_HURT_FLASH_MS = BOSS_PHYSICS.BOSS_HURT_FLASH_MS;
export const BOSS_DEATH_FPS = BOSS_PHYSICS.BOSS_DEATH_FPS;
