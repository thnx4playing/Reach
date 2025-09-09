import { Dimensions } from 'react-native';
import type { MapName } from './maps';
import { prefabWidthPx, getTileSize, MAPS, prefabHeightPx, alignPrefabYToSurfaceTop } from './maps';

// Re-export MapName for use in other files
export type { MapName };
import { makeStaticFloor } from './floor';

const { width, height } = Dimensions.get('window');

export type Platform = { prefab: string; x: number; y: number; scale?: number };
export type LevelData = {
  mapName: MapName;
  platforms: Platform[];
  decorations: Platform[];
  characterSpawn: { x: number; y: number };
  floorTopY: number;
};



function buildLevel(mapName: MapName, w: number, h: number): LevelData {
  const FLOOR_SCALE = 2;
  const staticFloor = makeStaticFloor(mapName, w, h, FLOOR_SCALE);
  const decorations = getMapDecorations(mapName, w, h);
  
  // For grassy map, only generate floor (no other prefabs)
  if (mapName === 'grassy') {
    const floorTopY = Math.round(h - prefabHeightPx(mapName, 'floor-final', 2));
    
    return {
      mapName,
      platforms: [
        ...staticFloor               // Floor pieces only
      ],
      decorations: [
        ...decorations               // Map decorations only
      ],
      characterSpawn: { x: w * 0.5, y: h - 100 },
      floorTopY,
    };
  }

  // Calculate floorTopY for non-grassy maps
  const floorTopY = Math.round(h - prefabHeightPx(mapName, 'floor', 2));
  
  return {
    mapName,
    platforms: [
      ...staticFloor,               // Floor pieces
      ...decorations               // Map decorations
    ],
    decorations: [],
    characterSpawn: { x: w * 0.5, y: h - 100 },
    floorTopY,
  };
}

// Map-specific decorations
function generateRandomPlatform(
  mapName: MapName,
  prefabName: string,
  width: number,
  height: number,
  floorTopY: number,
  existingPlatforms: Platform[],
  maxAttempts: number = 100
): Platform | null {
  const scale = 2;
  const prefabWidth = prefabWidthPx(mapName, prefabName, scale);
  const prefabHeight = prefabHeightPx(mapName, prefabName, scale);
  
  // Define safe zones - reduced margins for better distribution
  const margin = 40; // Reduced margin to use more of the screen
  const minX = margin;
  const maxX = width - margin - prefabWidth;
  
  // Different height ranges for different platform types
  let minY, maxY;
  if (prefabName === 'platform-grass-1-final') {
    // Single blocks: some low (jumpable), some high
    const isLowPlatform = Math.random() < 0.6; // 60% chance for low platform
    if (isLowPlatform) {
      minY = floorTopY - 200; // Low platforms (jumpable from ground)
      maxY = floorTopY - 100;
    } else {
      minY = 150; // High platforms
      maxY = floorTopY - 200;
    }
  } else {
    // Multi-block platforms: mostly in middle range
    minY = 200;
    maxY = floorTopY - 150;
  }
  
  // Minimum distance between platforms for better spacing
  const minDistance = 100; // Increased for better spacing
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const x = Math.random() * (maxX - minX) + minX;
    const y = Math.random() * (maxY - minY) + minY;
    
    // Check for overlaps and minimum distance with existing platforms
    let hasOverlap = false;
    for (const existing of existingPlatforms) {
      const existingWidth = prefabWidthPx(mapName, existing.prefab, existing.scale ?? scale);
      const existingHeight = prefabHeightPx(mapName, existing.prefab, existing.scale ?? scale);
      
      // Calculate center points for distance check
      const newCenterX = x + prefabWidth / 2;
      const newCenterY = y + prefabHeight / 2;
      const existingCenterX = existing.x + existingWidth / 2;
      const existingCenterY = existing.y + existingHeight / 2;
      
      // Check distance between centers
      const distance = Math.sqrt(
        Math.pow(newCenterX - existingCenterX, 2) + 
        Math.pow(newCenterY - existingCenterY, 2)
      );
      
      // Also check for direct rectangle overlap as backup
      const directOverlap = x < existing.x + existingWidth &&
                           x + prefabWidth > existing.x &&
                           y < existing.y + existingHeight &&
                           y + prefabHeight > existing.y;
      
      if (distance < minDistance || directOverlap) {
        hasOverlap = true;
        break;
      }
    }
    
    if (!hasOverlap) {
      return {
        prefab: prefabName,
        x: Math.round(x),
        y: Math.round(y),
        scale
      };
    }
  }
  
  // If we couldn't find a non-overlapping position after maxAttempts, return null
  return null;
}

function getMapDecorations(mapName: MapName, width: number, height: number): Platform[] {
  switch (mapName) {
    case 'dark':
      return [
        { prefab: 'lit-torch', x: 100, y: height - 100, scale: 2 },
        { prefab: 'lit-torch', x: width - 100, y: height - 100, scale: 2 },
      ];
    case 'desert':
      return [
        { prefab: 'vase', x: 200, y: height - 100, scale: 2 },
        { prefab: 'broke-vase', x: 300, y: height - 100, scale: 2 },
      ];
    case 'dungeon':
      return [
        { prefab: 'lit-torch', x: 50, y: height - 100, scale: 2 },
        { prefab: 'lit-torch', x: width - 50, y: height - 100, scale: 2 },
      ];
    case 'frozen':
      return [
        { prefab: 'vase', x: 200, y: height - 100, scale: 2 },
        { prefab: 'vase-tall', x: 300, y: height - 100, scale: 2 },
      ];
    case 'grassy':
      return []; // Tree is handled in buildLevel
    default:
      return [];
  }
}

export const LEVELS: Record<MapName, LevelData> = {
  dark: buildLevel('dark', width, height),
  desert: buildLevel('desert', width, height),
  dungeon: buildLevel('dungeon', width, height),
  frozen: buildLevel('frozen', width, height),
  grassy: buildLevel('grassy', width, height),
};
