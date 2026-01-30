// src/config/mapProfiles.ts
// Updated to use centralized physics config
// This file now only handles map-specific overrides, not physics

import { DOOR_CONFIG, BOSS_PHYSICS } from './physics';

export type MapName = "grassy" | "frozen" | "desert" | "dungeon" | "bossroom";

export type MapProfileId = "unified";

export interface MapProfile {
  id: MapProfileId;
  floorPrefab: "floor-final" | "floor";
  spawnZ: number;
  clampFrames: number;
  door?: {
    scale: number;
    nudgeX: number;
    offsetYAboveTop: number;
  };
}

// All maps use the unified profile
export const MAP_PROFILE_BY_MAP: Record<MapName, MapProfileId> = {
  grassy: "unified",
  frozen: "unified",
  desert: "unified",
  dungeon: "unified",
  bossroom: "unified",
};

// Single unified profile - door config comes from centralized physics.ts
export const MAP_PROFILES: Record<MapProfileId, MapProfile> = {
  unified: {
    id: "unified",
    floorPrefab: "floor-final",
    spawnZ: 0,
    clampFrames: BOSS_PHYSICS.GROUND_CLAMP_FRAMES,
    door: {
      scale: DOOR_CONFIG.BOSS_DOOR.SCALE,
      nudgeX: DOOR_CONFIG.BOSS_DOOR.NUDGE_X,
      offsetYAboveTop: DOOR_CONFIG.BOSS_DOOR.OFFSET_Y_ABOVE_TOP,
    },
  },
};

export function getProfile(mapName: MapName): MapProfile {
  return MAP_PROFILES["unified"];
}

// Map-specific visual settings (not physics)
export interface MapVisuals {
  backgroundColor: string;
  hasLava: boolean;
  hasIce: boolean;
  groundBandType: 'grass' | 'ice' | 'none';
}

export const MAP_VISUALS: Record<MapName, MapVisuals> = {
  grassy: {
    backgroundColor: '#87CEEB',
    hasLava: true,
    hasIce: false,
    groundBandType: 'grass',
  },
  frozen: {
    backgroundColor: '#87CEEB',
    hasLava: true,  // Still has hazard, just ice-themed
    hasIce: true,
    groundBandType: 'ice',
  },
  desert: {
    backgroundColor: '#F4D35E',
    hasLava: false,
    hasIce: false,
    groundBandType: 'none',
  },
  dungeon: {
    backgroundColor: '#2C2C2C',
    hasLava: false,
    hasIce: false,
    groundBandType: 'none',
  },
  bossroom: {
    backgroundColor: '#1a0a0a',
    hasLava: true,
    hasIce: false,
    groundBandType: 'none',
  },
};

export function getMapVisuals(mapName: MapName): MapVisuals {
  return MAP_VISUALS[mapName];
}
