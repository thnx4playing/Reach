import { Dimensions } from 'react-native';
import type { MapName } from './maps';
import { prefabHeightPx, getTileSize, alignPrefabYToSurfaceTop } from './maps';
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
  startInBossRoom?: boolean; // Special flag for boss room levels
};

function buildLevel(mapName: MapName, w: number, h: number): LevelData {
  // Core maps (grassy, frozen, etc.) use Skia-generated floors, not prefab floors
  // Only boss room uses prefab floors
  const staticFloor: Platform[] = []; // Empty for core maps - Skia handles floor rendering
  
  // For core maps, use a fixed floor height that matches Skia rendering
  // This should match the calculation in src/engine/floor.ts
  const SKIA_FLOOR_HEIGHT = 32;
  const SKIA_VISUAL_OFFSET = 52; // GroundBand adjusts upward by 30px, plus adjustment for grass lip and fine-tuning
  const floorTopY = Math.round(h - SKIA_FLOOR_HEIGHT - 5 + SKIA_VISUAL_OFFSET);
  
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
      // Ground-level decorations (trees + ice). PlatformManager will add more on platforms.
      return [
        // Trees
        { prefab: 'tree-large-frozen-final',  x:  80, y: alignPrefabYToSurfaceTop('frozen', 'tree-large-frozen-final',  floorTopY, 2),  scale: 2 },
        { prefab: 'tree-medium-frozen-final', x: 280, y: alignPrefabYToSurfaceTop('frozen', 'tree-medium-frozen-final', floorTopY, 2),  scale: 2 },
        { prefab: 'tree-small-frozen-final',  x: 420, y: alignPrefabYToSurfaceTop('frozen', 'tree-small-frozen-final',  floorTopY, 2),  scale: 2 },

        // Ice
        { prefab: 'ice-small-final',  x:  50, y: alignPrefabYToSurfaceTop('frozen', 'ice-small-final',  floorTopY, 2), scale: 2 },
        { prefab: 'ice-medium-final', x: 150, y: alignPrefabYToSurfaceTop('frozen', 'ice-medium-final', floorTopY, 2), scale: 2 },
        { prefab: 'ice-large-final',  x: 250, y: alignPrefabYToSurfaceTop('frozen', 'ice-large-final',  floorTopY, 2), scale: 2 },
        { prefab: 'ice-small-final',  x: 360, y: alignPrefabYToSurfaceTop('frozen', 'ice-small-final',  floorTopY, 2), scale: 2 },
      ];
    
    default:
      return [];
  }
}

// Special boss room level that starts directly in boss room mode
function buildBossRoomLevel(): LevelData {
  const FLOOR_SCALE = 2;
  const staticFloor = makeStaticFloor('bossroom', width, height, FLOOR_SCALE, 'floor-final');
  const floorTopY = Math.round(height - prefabHeightPx('bossroom', 'floor-final', 2));
  
  return {
    mapName: 'bossroom', // Use bossroom map type
    platforms: staticFloor,
    decorations: [], // Boss room has its own decorations
    characterSpawn: { x: width * 0.5, y: height - 100 },
    floorTopY,
    startInBossRoom: true, // This flag tells GameScreen to start in boss room mode
  };
}

export const LEVELS: Record<MapName, LevelData> = {
  dark: buildLevel('dark', width, height),
  desert: buildLevel('desert', width, height),
  dungeon: buildLevel('dungeon', width, height),
  frozen: buildLevel('frozen', width, height),
  grassy: buildLevel('grassy', width, height),
  bossroom: buildBossRoomLevel(), // Special boss room level
};