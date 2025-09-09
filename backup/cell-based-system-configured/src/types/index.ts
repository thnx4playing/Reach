export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX?: number;
  pivotY?: number;
}

export interface AtlasData {
  frames: Record<string, AtlasFrame>;
}

export interface SpriteAtlas {
  image: any; // React Native require() result
  frames: Record<string, AtlasFrame>;
}

export interface Animation {
  json: AtlasData;
  image: any;
  frames: string[];
  fps: number;
}

export type AnimationState = 'idle' | 'walk' | 'run' | 'jump' | 'crouch-idle' | 'crouch-walk' | 'hurt' | 'death';

export interface TileAtlas {
  image: any;
  frames: Record<string, AtlasFrame>;
}

// Re-export map types for convenience
export type { MapName, Prefab, PrefabCatalog } from '../content/maps';
