import { Dimensions } from 'react-native';
import type { MapName } from './maps';

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
  map: MapName;
  platforms: Platform[];
  playerSpawn: {
    x: number;
    y: number;
  };
}

// Basic level layouts for each map theme
export const LEVELS: Record<MapName, LevelData> = {
  dark: {
    map: 'dark',
    platforms: [
      // Floor at bottom
      { prefab: 'floor', x: 0, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 80, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 160, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 240, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 320, y: height - 80, scale: 2 },
      
      // Left platform flush against left side
      { prefab: 'left-platform', x: 0, y: height - 200, scale: 2 },
      
      // Right platform flush against right side
      { prefab: 'right-platform', x: width - 200, y: height - 200, scale: 2 },
      
      // Some basic platforms in the middle
      { prefab: 'floor', x: width / 2 - 100, y: height - 300, scale: 2 },
      { prefab: 'floor', x: width / 2 + 50, y: height - 400, scale: 2 },
    ],
    playerSpawn: {
      x: width / 2,
      y: height - 120, // On top of floor
    },
  },
  
  desert: {
    map: 'desert',
    platforms: [
      // Floor at bottom
      { prefab: 'floor', x: 0, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 80, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 160, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 240, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 320, y: height - 80, scale: 2 },
      
      // Left platform flush against left side
      { prefab: 'left-platform', x: 0, y: height - 200, scale: 2 },
      
      // Right platform flush against right side
      { prefab: 'right-platform', x: width - 200, y: height - 200, scale: 2 },
      
      // Some basic platforms in the middle
      { prefab: 'floor', x: width / 2 - 100, y: height - 300, scale: 2 },
      { prefab: 'floor', x: width / 2 + 50, y: height - 400, scale: 2 },
    ],
    playerSpawn: {
      x: width / 2,
      y: height - 120, // On top of floor
    },
  },
  
  dungeon: {
    map: 'dungeon',
    platforms: [
      // Floor at bottom
      { prefab: 'floor', x: 0, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 80, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 160, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 240, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 320, y: height - 80, scale: 2 },
      
      // Left platform flush against left side
      { prefab: 'left-platform', x: 0, y: height - 200, scale: 2 },
      
      // Right platform flush against right side
      { prefab: 'right-platform', x: width - 200, y: height - 200, scale: 2 },
      
      // Some basic platforms in the middle
      { prefab: 'floor', x: width / 2 - 100, y: height - 300, scale: 2 },
      { prefab: 'floor', x: width / 2 + 50, y: height - 400, scale: 2 },
    ],
    playerSpawn: {
      x: width / 2,
      y: height - 120, // On top of floor
    },
  },
  
  frozen: {
    map: 'frozen',
    platforms: [
      // Floor at bottom
      { prefab: 'floor', x: 0, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 80, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 160, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 240, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 320, y: height - 80, scale: 2 },
      
      // Left platform flush against left side
      { prefab: 'left-platform', x: 0, y: height - 200, scale: 2 },
      
      // Right platform flush against right side
      { prefab: 'right-platform', x: width - 200, y: height - 200, scale: 2 },
      
      // Some basic platforms in the middle
      { prefab: 'floor', x: width / 2 - 100, y: height - 300, scale: 2 },
      { prefab: 'floor', x: width / 2 + 50, y: height - 400, scale: 2 },
    ],
    playerSpawn: {
      x: width / 2,
      y: height - 120, // On top of floor
    },
  },
  
  grassy: {
    map: 'grassy',
    platforms: [
      // Floor at bottom
      { prefab: 'floor', x: 0, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 80, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 160, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 240, y: height - 80, scale: 2 },
      { prefab: 'floor', x: 320, y: height - 80, scale: 2 },
      
      // Left platform flush against left side
      { prefab: 'left-platform', x: 0, y: height - 200, scale: 2 },
      
      // Right platform flush against right side
      { prefab: 'right-platform', x: width - 200, y: height - 200, scale: 2 },
      
      // Some basic platforms in the middle
      { prefab: 'floor', x: width / 2 - 100, y: height - 300, scale: 2 },
      { prefab: 'floor', x: width / 2 + 50, y: height - 400, scale: 2 },
    ],
    playerSpawn: {
      x: width / 2,
      y: height - 120, // On top of floor
    },
  },
};
