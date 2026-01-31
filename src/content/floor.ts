// src/content/floor.ts
// This file now uses the SINGLE SOURCE OF TRUTH from physics.ts
// The makeStaticFloor function is kept for floor tile generation

import { SCREEN, FLOOR_TOP_Y, FLOOR } from '../config/physics';
import type { MapName } from './maps';
import { getTileSize, MAPS } from './maps';

/**
 * Returns the Y pixel coordinate of the TOP of the floor strip.
 * Now uses the unified floor position from physics.ts
 */
export const getFloorTopY = (_screenH?: number, _floorPrefabHeightPx?: number) => {
  // Ignore parameters - always use the single source of truth
  return FLOOR_TOP_Y;
};

/**
 * Creates static floor pieces for a given map
 */
export function makeStaticFloor(
  mapName: MapName, 
  screenWidth: number, 
  _screenHeight: number, // Ignored - use unified value
  scale: number, 
  prefabName?: string
) {
  // Use the correct floor prefab name for each map
  if (!prefabName) {
    if (mapName === 'grassy') {
      prefabName = 'floor-final';
    } else if (mapName === 'frozen') {
      prefabName = 'floor-final';
    } else {
      prefabName = 'floor';
    }
  }

  const tileSize = getTileSize(mapName) * scale;
  
  // Read prefab rows and compute true floor height
  const meta = (MAPS as any)[mapName]?.prefabs?.meta;
  const pf = (MAPS as any)[mapName]?.prefabs?.prefabs?.[prefabName];
  const baseTile = meta?.tileSize ?? 16;
  const rows = (pf?.cells?.length ?? pf?.rects?.length ?? 2);

  const floorHeight = rows * baseTile * scale;
  
  // USE THE UNIFIED FLOOR POSITION
  const floorTopY = FLOOR_TOP_Y;
  
  // Calculate how many floor tiles we need to cover the screen width
  const tilesNeeded = Math.ceil(screenWidth / tileSize);
  
  const floorPieces = [];
  for (let i = 0; i < tilesNeeded; i++) {
    const piece = {
      x: i * tileSize,
      y: floorTopY,
      prefab: prefabName,
      scale: scale,
    };
    floorPieces.push(piece);
  }
  
  return floorPieces;
}

// Export using unified value
export const floorTopY = FLOOR_TOP_Y;
export default floorTopY;
