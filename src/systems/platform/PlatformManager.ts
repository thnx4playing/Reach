import { Dimensions } from 'react-native';
import { prefabWidthPx, prefabHeightPx, alignPrefabYToSurfaceTop, getTileSize, prefabTopSolidSegmentsPx } from '../../content/maps';
import type { MapName } from '../../content/maps';
import type { PlatformDef } from './types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Map-specific platform configurations
const MAP_PLATFORM_CONFIGS: Record<MapName, {
  platformTypes: Array<[string, number]>;
  decorationConfig?: {
    trees?: { types: string[]; probability: number };
    mushrooms?: { types: string[]; probability: number; maxPerTile: number };
    grass?: { types: string[]; probability: number; maxPerTile: number };
  };
}> = {
  grassy: {
    platformTypes: [
      ['platform-grass-1-final', 3],           // 30% (3/10)
      ['platform-grass-3-final', 2],           // 20% (2/10) 
      ['platform-wood-1-final', 2],            // 20% (2/10)
      ['platform-wood-3-final', 1],            // 10% (1/10)
      ['platform-wood-2-left-final', 1],       // 10% (1/10)
      ['platform-wood-2-right-final', 1],      // 10% (1/10)
    ],
    decorationConfig: {
      trees: {
        types: ['tree-large-final', 'tree-medium-final', 'tree-small-final'],
        probability: 0.4, // 40% chance for trees on grass-3 platforms
      },
      mushrooms: {
        types: [
          'mushroom-red-large-final', 'mushroom-red-medium-final', 'mushroom-red-small-final',
          'mushroom-green-large-final', 'mushroom-green-medium-final', 'mushroom-green-small-final'
        ],
        probability: 0.6, // 60% chance per available tile
        maxPerTile: 1, // Only one item per tile
      },
      grass: {
        types: ['grass-1-final', 'grass-2-final', 'grass-3-final', 'grass-4-final', 'grass-5-final', 'grass-6-final'],
        probability: 0.8, // 80% chance per available tile
        maxPerTile: 1, // Only one item per tile
      }
    }
  },
  dark: {
    platformTypes: [
      // Add dark-specific platforms here when needed
      ['platform-stone-1', 3],
      ['platform-stone-3', 2],
    ]
  },
  desert: {
    platformTypes: [
      // Add desert-specific platforms here when needed
      ['platform-sand-1', 3],
      ['platform-sand-3', 2],
    ]
  },
  dungeon: {
    platformTypes: [
      // Add dungeon-specific platforms here when needed
      ['platform-brick-1', 3],
      ['platform-brick-3', 2],
    ]
  },
  frozen: {
    platformTypes: [
      // Add frozen-specific platforms here when needed
      ['platform-ice-1', 3],
      ['platform-ice-3', 2],
    ]
  }
};

export class PlatformManager {
  private platforms: Map<string, PlatformDef> = new Map();
  private mapName: MapName;
  private floorWorldY: number;
  private scale: number;
  private generatedMinWorldY = 0;
  private platformCounter = 0;
  private config: typeof MAP_PLATFORM_CONFIGS[MapName];
  
  constructor(mapName: MapName, floorScreenY: number, scale = 2) {
    this.mapName = mapName;
    this.scale = scale;
    this.floorWorldY = floorScreenY;
    this.generatedMinWorldY = this.floorWorldY;
    this.config = MAP_PLATFORM_CONFIGS[mapName];
    
    if (!this.config) {
      console.warn(`[PlatformManager] No configuration found for map: ${mapName}`);
      this.config = MAP_PLATFORM_CONFIGS.grassy; // Fallback
    }
    
    // Generate initial content
    this.generateFloor();
    this.generateInitialPlatforms();
  }

  private isSolidPrefab(prefab: string): boolean {
    // This should be map-specific in the future
    return prefab === 'floor-final' || 
           prefab.startsWith('platform-');
  }

  private createPlatform(prefab: string, worldX: number, worldY: number, type: 'platform' | 'decoration' = 'platform'): PlatformDef {
    const id = `${type}_${this.platformCounter++}`;
    const width = prefabWidthPx(this.mapName, prefab, this.scale);
    const height = prefabHeightPx(this.mapName, prefab, this.scale);
    
    let collision: PlatformDef['collision'] = undefined;
    if (this.isSolidPrefab(prefab)) {
      collision = {
        solid: true,
        topY: worldY,
        left: worldX,
        right: worldX + width,
        width,
        height: 16 * this.scale,
      };
    }

    return {
      id,
      type,
      prefab,
      x: Math.round(worldX),
      y: Math.round(worldY),
      scale: this.scale,
      collision,
    };
  }

  private generateFloor(): void {
    const floorPrefab = this.mapName === 'grassy' ? 'floor-final' : 'floor';
    const tileWidth = getTileSize(this.mapName) * this.scale;
    const tilesNeeded = Math.ceil(SCREEN_W / tileWidth) + 1;
    
    for (let i = 0; i < tilesNeeded; i++) {
      const platform = this.createPlatform(
        floorPrefab,
        i * tileWidth,
        this.floorWorldY,
        'platform'
      );
      this.platforms.set(platform.id, platform);
    }
  }

  private generateInitialPlatforms(): void {
    // Generate platforms ABOVE the floor
    for (let i = 0; i < 3; i++) {
      const bandHeight = SCREEN_H * 0.8;
      const bandBottomWorldY = this.generatedMinWorldY - 50 - (i * 50);
      const bandTopWorldY = bandBottomWorldY - bandHeight;
      
      this.generateBand(bandTopWorldY, bandBottomWorldY);
      this.generatedMinWorldY = bandTopWorldY;
    }
  }

  private pickPlatformType(): string {
    const platformTypes = this.config.platformTypes;
    const totalWeight = platformTypes.reduce((sum, [, weight]) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const [type, weight] of platformTypes) {
      random -= weight;
      if (random <= 0) {
        return type;
      }
    }
    
    return platformTypes[0][0]; // Fallback
  }

  private getValidXPosition(platformType: string, width: number): number {
    // Handle special positioning requirements
    if (platformType === 'platform-wood-2-left-final') {
      return 0; // Flush to left side
    }
    
    if (platformType === 'platform-wood-2-right-final') {
      return Math.max(0, SCREEN_W - width); // Flush to right side
    }
    
    // Regular platforms - random position with margin
    const margin = 40;
    const minX = margin;
    const maxX = Math.max(minX, SCREEN_W - margin - width);
    return minX + Math.random() * (maxX - minX);
  }

  private generateBand(bandTopWorldY: number, bandBottomWorldY: number): void {
    // Increased platform count by 30%: was 4-7, now 5-9
    const basePlatformCount = 5;
    const variablePlatformCount = 4;
    const platformCount = basePlatformCount + Math.floor(Math.random() * variablePlatformCount);
    
    for (let i = 0; i < platformCount; i++) {
      const platformType = this.pickPlatformType();
      
      // Try to place platform
      const width = prefabWidthPx(this.mapName, platformType, this.scale);
      const height = prefabHeightPx(this.mapName, platformType, this.scale);
      
      for (let attempt = 0; attempt < 50; attempt++) {
        const worldX = this.getValidXPosition(platformType, width);
        const worldY = bandTopWorldY + 50 + Math.random() * (bandBottomWorldY - bandTopWorldY - height - 100);
        
        if (this.isPositionClear(worldX, worldY, width, height)) {
          const platform = this.createPlatform(platformType, worldX, worldY, 'platform');
          this.platforms.set(platform.id, platform);
          
          this.generateDecorationsFor(platform);
          break;
        }
      }
    }
  }

  private isPositionClear(worldX: number, worldY: number, width: number, height: number): boolean {
    const margin = 80;
    
    for (const platform of this.platforms.values()) {
      const pWidth = prefabWidthPx(this.mapName, platform.prefab, platform.scale);
      const pHeight = prefabHeightPx(this.mapName, platform.prefab, platform.scale);
      
      if (!(worldX + width + margin < platform.x || 
            platform.x + pWidth + margin < worldX || 
            worldY + height + margin < platform.y || 
            platform.y + pHeight + margin < worldY)) {
        return false;
      }
    }
    return true;
  }

  private generateDecorationsFor(platform: PlatformDef): void {
    if (!platform.collision?.solid || !this.config.decorationConfig) return;
    
    const decorationConfig = this.config.decorationConfig;
    const isGrass3 = platform.prefab === 'platform-grass-3-final';
    const isGrass1 = platform.prefab === 'platform-grass-1-final';
    
    if (!isGrass3 && !isGrass1) return;
    
    // Get platform collision segments to determine available tiles
    const segments = prefabTopSolidSegmentsPx(this.mapName, platform.prefab, platform.scale);
    const segment = segments[0];
    if (!segment) return;
    
    // CRITICAL FIX: Use WORLD coordinates for decoration positioning
    // surfaceWorldY is the Y coordinate of the walkable surface in WORLD space
    const surfaceWorldY = platform.collision.topY;
    const tileSize = getTileSize(this.mapName) * this.scale;
    const numTiles = Math.floor(segment.w / tileSize);
    
    // Track which tiles are occupied to prevent overlaps
    const occupiedTiles = new Set<number>();
    
    // Add trees (only on grass-3 platforms)
    if (isGrass3 && decorationConfig.trees) {
      const treeConfig = decorationConfig.trees;
      if (Math.random() < treeConfig.probability) {
        // Try to place one tree on an available tile
        const availableTiles = Array.from({length: numTiles}, (_, i) => i)
          .filter(tileIndex => !occupiedTiles.has(tileIndex));
        
        if (availableTiles.length > 0) {
          const tileIndex = availableTiles[Math.floor(Math.random() * availableTiles.length)];
          const treeType = treeConfig.types[Math.floor(Math.random() * treeConfig.types.length)];
          
          // Check if tree fits in this tile
          const treeWidth = prefabWidthPx(this.mapName, treeType, this.scale);
          if (treeWidth <= tileSize) {
            // WORLD coordinates: platform world X + segment offset + tile position
            const treeWorldX = platform.x + segment.x + (tileIndex * tileSize);
            // WORLD coordinates: alignPrefabYToSurfaceTop returns the correct WORLD Y
            const treeWorldY = alignPrefabYToSurfaceTop(this.mapName, treeType, surfaceWorldY, this.scale);
            
            console.log(`[PlatformManager] Tree placed at WORLD coords: (${treeWorldX}, ${treeWorldY}), surfaceWorldY: ${surfaceWorldY}`);
            
            const tree = this.createPlatform(treeType, treeWorldX, treeWorldY, 'decoration');
            this.platforms.set(tree.id, tree);
            occupiedTiles.add(tileIndex);
          }
        }
      }
    }
    
    // Add mushrooms with tile-based restrictions
    if (decorationConfig.mushrooms) {
      const mushroomConfig = decorationConfig.mushrooms;
      const maxMushrooms = isGrass3 ? 2 : isGrass1 ? 1 : 0;
      
      for (let i = 0; i < maxMushrooms; i++) {
        if (Math.random() < mushroomConfig.probability) {
          const availableTiles = Array.from({length: numTiles}, (_, i) => i)
            .filter(tileIndex => !occupiedTiles.has(tileIndex));
          
          if (availableTiles.length > 0) {
            const tileIndex = availableTiles[Math.floor(Math.random() * availableTiles.length)];
            const mushroomType = mushroomConfig.types[Math.floor(Math.random() * mushroomConfig.types.length)];
            
            // WORLD coordinates: platform world X + segment offset + tile position
            const mushroomWorldX = platform.x + segment.x + (tileIndex * tileSize);
            // WORLD coordinates: alignPrefabYToSurfaceTop returns the correct WORLD Y
            const mushroomWorldY = alignPrefabYToSurfaceTop(this.mapName, mushroomType, surfaceWorldY, this.scale);
            
            const mushroom = this.createPlatform(mushroomType, mushroomWorldX, mushroomWorldY, 'decoration');
            this.platforms.set(mushroom.id, mushroom);
            occupiedTiles.add(tileIndex);
          }
        }
      }
    }
    
    // Add grass tufts with tile-based restrictions
    if (decorationConfig.grass) {
      const grassConfig = decorationConfig.grass;
      const maxGrass = isGrass3 ? 3 : isGrass1 ? 1 : 0;
      
      for (let i = 0; i < maxGrass; i++) {
        if (Math.random() < grassConfig.probability) {
          const availableTiles = Array.from({length: numTiles}, (_, i) => i)
            .filter(tileIndex => !occupiedTiles.has(tileIndex));
          
          if (availableTiles.length > 0) {
            const tileIndex = availableTiles[Math.floor(Math.random() * availableTiles.length)];
            const grassType = grassConfig.types[Math.floor(Math.random() * grassConfig.types.length)];
            
            // WORLD coordinates: platform world X + segment offset + tile position
            const grassWorldX = platform.x + segment.x + (tileIndex * tileSize);
            // WORLD coordinates: alignPrefabYToSurfaceTop returns the correct WORLD Y
            const grassWorldY = alignPrefabYToSurfaceTop(this.mapName, grassType, surfaceWorldY, this.scale);
            
            const grass = this.createPlatform(grassType, grassWorldX, grassWorldY, 'decoration');
            this.platforms.set(grass.id, grass);
            occupiedTiles.add(tileIndex);
          }
        }
      }
    }
  }

  updateForCamera(cameraY: number, playerWorldY: number): boolean {
    const generateAheadWorldY = playerWorldY - SCREEN_H * 2;
    let generated = false;
    
    if (this.generatedMinWorldY > generateAheadWorldY) {
      while (this.generatedMinWorldY > generateAheadWorldY) {
        const bandHeight = SCREEN_H * 0.8;
        const bandBottomWorldY = this.generatedMinWorldY - 50;
        const bandTopWorldY = bandBottomWorldY - bandHeight;
        
        this.generateBand(bandTopWorldY, bandBottomWorldY);
        this.generatedMinWorldY = bandTopWorldY;
        generated = true;
      }
    }
    
    // Cull platforms far below player
    const cullBelowWorldY = playerWorldY + SCREEN_H * 4;
    const toRemove: string[] = [];
    this.platforms.forEach((platform, id) => {
      if (platform.y > cullBelowWorldY) {
        toRemove.push(id);
      }
    });
    
    if (toRemove.length > 0) {
      toRemove.forEach(id => this.platforms.delete(id));
      generated = true;
    }
    
    return generated;
  }

  getSolidPlatforms(): PlatformDef[] {
    return Array.from(this.platforms.values()).filter(p => p.collision?.solid);
  }

  getAllPlatforms(): PlatformDef[] {
    return Array.from(this.platforms.values());
  }

  getPlatformsNearPlayer(playerWorldX: number, playerWorldY: number, radius = 200): PlatformDef[] {
    return this.getSolidPlatforms().filter(platform => {
      const platformCenterX = platform.x + (platform.collision?.width || 0) / 2;
      const platformCenterY = platform.y;
      
      const dx = Math.abs(platformCenterX - playerWorldX);
      const dy = Math.abs(platformCenterY - playerWorldY);
      
      return dx < radius && dy < radius;
    });
  }

  getFloorWorldY(): number {
    return this.floorWorldY;
  }

  debugPlatformsNearY(worldY: number, range = 200): void {
    const nearby = Array.from(this.platforms.values()).filter(p => 
      Math.abs(p.y - worldY) < range
    );
    
    console.log(`[PlatformManager] ${nearby.length} platforms near Y=${worldY} (±${range}px)`);
  }
}