import { Dimensions } from 'react-native';
import type { MapName } from './maps';
import { getTileSize, MAPS } from './maps';

/**
 * Returns the Y pixel coordinate of the TOP of the floor strip.
 * You should place feet at (floorTopY + FOOT_OFFSET - lift).
 *
 * @param screenH device screen height in px
 * @param floorPrefabHeightPx height of your floor image in px (not tiles)
 */
export const getFloorTopY = (screenH: number, floorPrefabHeightPx: number) => {
  return Math.round(screenH - floorPrefabHeightPx);
};

/**
 * Creates static floor pieces for a given map
 */
export function makeStaticFloor(
  mapName: MapName, 
  screenWidth: number, 
  screenHeight: number, 
  scale: number, 
  prefabName?: string
) {
  // Use the correct floor prefab name for each map
  if (!prefabName) {
    if (mapName === 'grassy') {
      prefabName = 'floor-final';
    } else {
      prefabName = 'floor';
    }
  }

  
  const tileSize = getTileSize(mapName) * scale;
  
  // NEW: read prefab rows and compute true floor height
  const meta = (MAPS as any)[mapName]?.prefabs?.meta;
  const pf = (MAPS as any)[mapName]?.prefabs?.prefabs?.[prefabName];
  const baseTile = meta?.tileSize ?? 16;
  const rows = (pf?.cells?.length ?? pf?.rects?.length ?? 2);

  const floorHeight = rows * baseTile * scale; // ← instead of 48 * scale
  const floorTopY = Math.round(screenHeight - floorHeight);
  
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
    
    // Debug: log first few pieces

  }
  

  
  return floorPieces;
}

// Default export using current device size and a reasonable fallback height.
// Change FLOOR_PREFAB_HEIGHT_PX to your actual floor image height.
const FLOOR_PREFAB_HEIGHT_PX = 48; // <-- set to your asset height
const screenH = Dimensions.get('window').height;
export const floorTopY = getFloorTopY(screenH, FLOOR_PREFAB_HEIGHT_PX);
export default floorTopY;
