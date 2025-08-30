import { Dimensions } from 'react-native';
import type { MapName } from './maps';
import { prefabWidthPx, getTileSize, MAPS } from './maps';
import { makeStaticFloor } from './floor';

const { width, height } = Dimensions.get('window');

export type Platform = { prefab: string; x: number; y: number; scale?: number };
export type LevelData = {
  mapName: MapName;
  platforms: Platform[];
  characterSpawn: { x: number; y: number };
};

const prefabHeightPx = (mapName: MapName, prefab: string, scale = 2) => {
  const tile = getTileSize(mapName);
  // @ts-ignore runtime lookup
  const pf = (MAPS as any)[mapName]?.prefabs?.prefabs?.[prefab];
  const rows = (pf?.cells?.length ?? pf?.rects?.length ?? 1);
  return rows * tile * scale;
};

function buildLevel(mapName: MapName, w: number, h: number): LevelData {
  const FLOOR_SCALE = 2;
  const staticFloor = makeStaticFloor(mapName, w, h, FLOOR_SCALE);
  const decorations = getMapDecorations(mapName, w, h);
  
  const platforms = [
    ...staticFloor,               // Floor pieces
    ...decorations               // Map decorations
  ];



  return {
    mapName,
    platforms,
    characterSpawn: { x: w * 0.5, y: h - 100 },
  };
}

// Map-specific decorations
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
      return [
        // Floor decorations - sit on top of the top floor tile (no collision)
        { prefab: 'tree-large', x: width - 100, y: (height - prefabHeightPx(mapName, 'floor', 2)) - prefabHeightPx(mapName, 'tree-large', 2) + 1, scale: 2 },
        // Platform above the tree
        { prefab: 'platform-basic', x: width - 100, y: (height - prefabHeightPx(mapName, 'floor', 2)) - prefabHeightPx(mapName, 'tree-large', 2) - 50, scale: 2 }
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
