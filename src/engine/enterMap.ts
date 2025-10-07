// src/engine/enterMap.ts
import { getProfile, MapName } from "../config/mapProfiles";
import { floorTopYFor } from "./floor";

export type EnterOpts = {
  // required pieces passed in from GameScreen context
  setMode: (m: "tower" | "bossroom") => void;
  setCameraY: (y: number) => void;
  setPlatforms: (p: any[]) => void;
  buildPlatforms: (floorTopY: number, mapWidth: number) => any[]; // your createXxxPlatforms
  setDoorAnchor: (a: any) => void;
  setDoorIceAnchor: (a: any) => void;

  // Refs (mutable) from GameScreen
  xRef: React.MutableRefObject<number>;
  zRef: React.MutableRefObject<number>;
  vxRef: React.MutableRefObject<number>;
  vzRef: React.MutableRefObject<number>;
  onGroundRef: React.MutableRefObject<boolean>;
  clampFramesRef: React.MutableRefObject<number>;

  // Other helpers
  mapWidthFor: (mapName: MapName) => number;
  modeForMap: (mapName: MapName) => "tower" | "bossroom";
  platformManager: any; // your PlatformManager instance/ref
};

export function enterMap(mapName: MapName, opts: EnterOpts) {
  const {
    setMode, setCameraY, setPlatforms, buildPlatforms,
    setDoorAnchor, setDoorIceAnchor,
    xRef, zRef, vxRef, vzRef, onGroundRef, clampFramesRef,
    mapWidthFor, modeForMap, platformManager,
  } = opts;

  const profile   = getProfile(mapName);
  const floorTopY = floorTopYFor(mapName);
  const mapW      = mapWidthFor(mapName);

  // Mode + camera
  setMode(modeForMap(mapName));
  setCameraY(0);

  // Build platforms deterministically for this map
  const slabs = buildPlatforms(floorTopY, mapW);
  setPlatforms(slabs);

  // Center player on map, stand on floor (spawnZ=0)
  xRef.current  = Math.round((mapW - 96) * 0.5); // CHAR_W = 96
  zRef.current  = profile.spawnZ; // ALWAYS 0
  vxRef.current = 0;
  vzRef.current = 0;
  onGroundRef.current = true;
  
  // For core maps, ensure player spawns at the correct visual position relative to floor
  // The floorTopY difference between maps needs to be accounted for
  if (profile.id === "core") {
    // Core maps: spawn at floor level (z=0 means feet at floorTopY)
    // No additional adjustment needed - z=0 is correct for standing on floor
  }

  // Clamp to ground for a few frames in case memoized values settle next tick
  clampFramesRef.current = profile.clampFrames;

  // Reset anchors so they're recalculated in this map only
  setDoorAnchor(null);
  setDoorIceAnchor(null);

  // Pre-warm platform manager (consistent camera baseline)
  try {
    const bootCamY = 0;
    const bootPlayerY = floorTopY;
    platformManager?.updateForCamera?.(bootCamY, { force: true, playerY: bootPlayerY });
  } catch (e) {}
}
