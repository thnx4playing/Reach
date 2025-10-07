// src/engine/floor.ts
import { getProfile, MapName } from "../config/mapProfiles";
import { MAPS } from "../content/maps";

// SCALE/SCREEN_H should come from your constants
const SCALE = 2;
const SCREEN_H = 800; // Adjust to your actual screen height

// UNIFIED FLOOR CALCULATION - Single source of truth
const SKIA_FLOOR_HEIGHT = 32;
const SKIA_VISUAL_OFFSET = 52;

export function floorTopYFor(mapName: MapName): number {
  const profile = getProfile(mapName);
  
  // ALL maps now use the same calculation for consistency
  // This ensures smooth transitions between all map types
  return Math.round(SCREEN_H - SKIA_FLOOR_HEIGHT - 5 + SKIA_VISUAL_OFFSET);
}
