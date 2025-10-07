// src/config/gameplay.ts
// Test at ~150 px above the start (later you can bump if you want)
export const DOORWAY_SPAWN_Y = 150; // px up from start (world up is negative)

// Size to draw the door sprite (scaled render size)
export const DOORWAY_WIDTH  = 64;   // px
export const DOORWAY_HEIGHT = 96;   // px

// ── Door trigger tuning (how "inside" the player must be) ────────────────────
// Horizontal: only the middle % of the door counts as "enterable"
export const DOOR_TRIGGER_INNER_X_RATIO   = 0.55; // 55% of door width (centered)
// Vertical: only the lower portion of the door counts (feet walking in)
export const DOOR_TRIGGER_BOTTOM_Y_RATIO  = 0.45; // bottom 55% of door height
// Tiny forgiveness so it doesn't feel pixel-perfect
export const DOOR_TRIGGER_PAD             = 2;    // px

// How many consecutive frames the player must be grounded before door activates
export const DOOR_TRIGGER_REQUIRE_GROUNDED_FRAMES = 3;

// Door positioning offset - fine-tuned to sit flush on platform surface
// This value positions the door so its bottom sits on the platform top
export const DOORWAY_POSITION_OFFSET = 17; // px (positive = lower door, negative = raise door)

// ── Door-Ice configuration (boss room to frozen map) ────────────────────────
export const DOOR_ICE_WIDTH  = 64;   // px (same as regular door)
export const DOOR_ICE_HEIGHT = 96;   // px (same as regular door)
export const DOOR_ICE_POSITION_OFFSET = -35; // px (negative to place door ON TOP of platform)

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
