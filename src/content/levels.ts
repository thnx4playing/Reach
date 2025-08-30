import { Dimensions } from 'react-native';
import type { MapName } from './maps';
import { prefabWidthPx, getTileSize } from './maps';
import { makeStaticFloor } from './floor';

// Re-export MapName for convenience
export type { MapName } from './maps';

const { width, height } = Dimensions.get('window');

export interface Platform {
  prefab: string;
  x: number;
  y: number;
  scale?: number;
}

export interface LevelData {
  mapName: MapName;
  platforms: Platform[];
  characterSpawn: {
    x: number;
    y: number;
  };
}


// Build level function using static floor
export function buildLevel(mapName: MapName, width: number, height: number) {
  const FLOOR_SCALE = 2;

  const staticFloor = makeStaticFloor(mapName, width, height, FLOOR_SCALE);

  const platforms = [
    ...staticFloor,               // ⬅️ fixed, always the same for this map
    
    // Map-specific decorations
    ...getMapDecorations(mapName, width, height)
  ];

  return { 
    mapName,
    platforms,
    characterSpawn: {
      x: width / 2,
      y: height - 100, // On top of floor (adjusted for new floor position)
    }
  };
}

// Map-specific decorations
function getMapDecorations(mapName: MapName, width: number, height: number) {
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
      return [
        { prefab: 'vase-tall', x: 80, y: height - 100, scale: 2 },
        { prefab: 'vase', x: 250, y: height - 100, scale: 2 },
        // Floor decorations - sit on top of the top floor tile (no collision)
        { prefab: 'tree-large', x: width - 100, y: height - 191, scale: 2 }, // Lowered by additional 2px (was 193, now 191)
        // Platform above the tree
        { prefab: 'platform-basic', x: width - 100, y: height - 309, scale: 2 }, // 50px above the tree (was 209, now 309)
      ];
    default:
      return [];
  }
}

// Enhanced level layouts for each map theme using static floor system
export const LEVELS: Record<MapName, LevelData> = {
  dark: buildLevel('dark', width, height),
  desert: buildLevel('desert', width, height),
  dungeon: buildLevel('dungeon', width, height),
  frozen: buildLevel('frozen', width, height),
  grassy: buildLevel('grassy', width, height),
};
