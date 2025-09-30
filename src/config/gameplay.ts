// src/config/gameplay.ts
// Test at ~150 px above the start (later you can bump if you want)
export const DOORWAY_SPAWN_Y = 150; // px up from start (world up is negative)

// Size to draw the door sprite (scaled render size)
export const DOORWAY_WIDTH  = 64;   // px
export const DOORWAY_HEIGHT = 96;   // px

// Door positioning offset - fine-tuned to sit flush on platform surface
// This value positions the door so its bottom sits on the platform top
export const DOORWAY_POSITION_OFFSET = 17; // px (positive = lower door, negative = raise door)

// Optional future knobs (kept for completeness)
export const BOSSROOM_PLATFORM_COUNT = 7;
export const BOSS_FIRE_COOLDOWN_MIN = 5000;
export const BOSS_FIRE_COOLDOWN_MAX = 10000;
export const BOSS_PROJECTILE_SPEED  = 320;
export const BOSS_DAMAGE_PER_HIT    = 1;

// Player projectile tuning (boss room only)
export const PLAYER_PROJECTILE_SPEED   = 420;
export const PLAYER_PROJECTILE_LIFE_MS = 1400;

// Player projectile launch delay (boss room only)
export const PLAYER_PROJECTILE_LAUNCH_DELAY_MS = 200;

// Where on the player's body to spawn the shot (measured from top → down)
export const PLAYER_PROJECTILE_CHEST_RATIO = 0.35; // 35% down from head ≈ chest (old, not used)

// Spawn point on the player's body (top → down)
export const PLAYER_PROJECTILE_HEAD_RATIO = 0.18; // ~forehead/eyes

// Boss visual reactions / death playback
export const BOSS_HURT_FLASH_MS = 220;  // flash HURT.png for this long
export const BOSS_DEATH_FPS = 10;       // DEATH.png playback fps
