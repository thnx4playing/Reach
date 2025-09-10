import { Dimensions } from 'react-native';
import type { MapName } from './maps';
import { prefabHeightPx, getTileSize } from './maps';
import { makeStaticFloor } from './floor';

// Re-export MapName for use in other files
export type { MapName };

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
  
  // Calculate floorTopY for all maps
  const floorPrefabName = mapName === 'grassy' ? 'floor-final' : 'floor';
  const floorTopY = Math.round(h - prefabHeightPx(mapName, floorPrefabName, 2));
  
  // Get map-specific decorations (ground-level only)
  const decorations = getMapDecorations(mapName, w, h, floorTopY);
  
  return {
    mapName,
    platforms: staticFloor,  // Only floor pieces - PlatformManager handles the rest
    decorations,             // Ground-level decorations only
    characterSpawn: { x: w * 0.5, y: h - 100 },
    floorTopY,
  };
}

// Ground-level decorations only - platforms are now handled by PlatformManager
function getMapDecorations(mapName: MapName, width: number, height: number, floorTopY: number): Platform[] {
  switch (mapName) {
    case 'grassy':
      // Add some ground-level grass decorations
      return [
        { prefab: 'grass-1-final', x: 50, y: floorTopY - 16, scale: 2 },
        { prefab: 'grass-2-final', x: 150, y: floorTopY - 16, scale: 2 },
        { prefab: 'grass-3-final', x: 250, y: floorTopY - 16, scale: 2 },
        { prefab: 'mushroom-red-small-final', x: 20, y: floorTopY - 16, scale: 2 },
        { prefab: 'mushroom-green-small-final', x: 320, y: floorTopY - 16, scale: 2 },
      ];
    
    case 'dark':
      return [
        { prefab: 'lit-torch', x: 100, y: floorTopY - 32, scale: 2 },
        { prefab: 'lit-torch', x: width - 100, y: floorTopY - 32, scale: 2 },
      ];
    
    case 'desert':
      return [
        { prefab: 'vase', x: 200, y: floorTopY - 32, scale: 2 },
        { prefab: 'broke-vase', x: 300, y: floorTopY - 32, scale: 2 },
      ];
    
    case 'dungeon':
      return [
        { prefab: 'lit-torch', x: 50, y: floorTopY - 32, scale: 2 },
        { prefab: 'lit-torch', x: width - 50, y: floorTopY - 32, scale: 2 },
      ];
    
    case 'frozen':
      return [
        { prefab: 'vase', x: 200, y: floorTopY - 32, scale: 2 },
        { prefab: 'vase-tall', x: 300, y: floorTopY - 48, scale: 2 },
      ];
    
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