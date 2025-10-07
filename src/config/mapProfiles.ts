// src/config/mapProfiles.ts
export type MapName = "grassy" | "frozen" | "desert" | "dungeon" | "bossroom";

export type MapProfileId = "core" | "boss";
export interface MapProfile {
  id: MapProfileId;
  floorPrefab: "floor-final" | "floor"; // prefab to measure floor height (boss room only)
  spawnZ: number;                       // 0 = stand on floor
  clampFrames: number;                  // frames to hard-clamp to floor on entry
  door?: {                              // optional boss-room door constants
    scale: number;
    nudgeX: number;         // px
    offsetYAboveTop: number;// px
  };
}

export const MAP_PROFILE_BY_MAP: Record<MapName, MapProfileId> = {
  grassy: "core",
  frozen: "core",
  desert: "core",
  dungeon: "core",
  bossroom: "boss",
};

export const MAP_PROFILES: Record<MapProfileId, MapProfile> = {
  core:  { id: "core",  floorPrefab: "floor-final", spawnZ: 0, clampFrames: 2 },
  boss:  { id: "boss",  floorPrefab: "floor-final", spawnZ: 0, clampFrames: 2,
           door: { scale: 1.5, nudgeX: -15, offsetYAboveTop: 32 } },
};

export function getProfile(mapName: MapName): MapProfile {
  return MAP_PROFILES[ MAP_PROFILE_BY_MAP[mapName] ?? "core" ];
}
