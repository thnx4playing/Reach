// src/config/mapProfiles.ts
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

export const MAP_PROFILE_BY_MAP: Record<MapName, MapProfileId> = {
  grassy: "unified",
  frozen: "unified",
  desert: "unified",
  dungeon: "unified",
  bossroom: "unified",
};

export const MAP_PROFILES: Record<MapProfileId, MapProfile> = {
  unified: { 
    id: "unified",  
    floorPrefab: "floor-final", 
    spawnZ: 0, 
    clampFrames: 2,
    door: { scale: 1.5, nudgeX: -15, offsetYAboveTop: 32 }
  },
};

export function getProfile(mapName: MapName): MapProfile {
  return MAP_PROFILES["unified"];
}
