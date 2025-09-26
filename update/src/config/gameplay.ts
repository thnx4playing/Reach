// src/config/gameplay.ts
// Central knobs for special features (doorway + boss room)
export const DOORWAY_SPAWN_Y = 1000; // world height in px ABOVE the start (use 15000 for prod)
export const DOORWAY_WIDTH = 96;     // px (world units), keep "8‑bit" chunky
export const DOORWAY_HEIGHT = 128;   // px

export const BOSSROOM_PLATFORM_COUNT = 7; // 6 or 7 fixed platforms
export const BOSS_FIRE_COOLDOWN_MIN = 5_000; // ms
export const BOSS_FIRE_COOLDOWN_MAX = 10_000; // ms
export const BOSS_PROJECTILE_SPEED = 320; // px/s (tuned to be fair)
export const BOSS_DAMAGE_PER_HIT = 10;    // HP per hit