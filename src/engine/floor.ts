// src/engine/floor.ts
import { getProfile, MapName } from "../config/mapProfiles";
import { MAPS } from "../content/maps";

// SCALE/SCREEN_H should come from your constants
const SCALE = 2;
const SCREEN_H = 800; // Adjust to your actual screen height

export function floorTopYFor(mapName: MapName): number {
  const profile = getProfile(mapName);
  
  if (profile.id === "boss") {
    // Boss room uses prefab floors
    const mapData = (MAPS as any)[mapName];
    const tileSize = mapData?.prefabs?.meta?.tileSize ?? 16;
    const pf = mapData?.prefabs?.prefabs?.[profile.floorPrefab];
    const rows = (pf?.cells?.length ?? pf?.rects?.length ?? 2);
    const floorHeight = rows * tileSize * SCALE;
    return Math.round(SCREEN_H - floorHeight - 5);
  } else {
    // Core maps (grassy, frozen, etc.) use Skia-generated floors
    // The GroundBand/FrozenBand renders with a -30px adjustment from floorTopY
    // So we need to calculate floorTopY higher so the visual floor aligns correctly
    const SKIA_FLOOR_HEIGHT = 32; // Base Skia floor height
    const SKIA_VISUAL_OFFSET = 52; // GroundBand adjusts upward by 30px, plus adjustment for grass lip and fine-tuning
    // Calculate floorTopY higher so the visual floor (which renders 30px up) aligns correctly
    return Math.round(SCREEN_H - SKIA_FLOOR_HEIGHT - 5 + SKIA_VISUAL_OFFSET);
  }
}
