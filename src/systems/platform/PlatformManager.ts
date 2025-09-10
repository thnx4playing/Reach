import { Dimensions } from 'react-native';
import { prefabWidthPx, prefabHeightPx, alignPrefabYToSurfaceTop, getTileSize } from '../../content/maps';
import type { MapName } from '../../content/maps';
import type { PlatformDef } from './types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export class PlatformManager {
  private platforms: Map<string, PlatformDef> = new Map();
  private mapName: MapName;
  private floorWorldY: number; // WORLD Y coordinate of floor
  private scale: number;
  private generatedMinWorldY = 0; // Highest WORLD Y we've generated to (going up means decreasing Y)
  private platformCounter = 0;
  
  constructor(mapName: MapName, floorScreenY: number, scale = 2) {
    this.mapName = mapName;
    this.scale = scale;
    // Convert floor screen Y to world Y (floor is at a specific world position)
    this.floorWorldY = floorScreenY; // Treat the initial floor screen Y as world Y=floorScreenY
    this.generatedMinWorldY = this.floorWorldY;
    
    
    // Generate initial content
    this.generateFloor();
    this.generateInitialPlatforms();
  }

  private isSolidPrefab(prefab: string): boolean {
    return prefab === 'floor-final' || 
           prefab === 'platform-grass-1-final' || 
           prefab === 'platform-grass-3-final' ||
           prefab === 'platform-wood-1-final' ||
           prefab === 'platform-wood-2-left-final' ||
           prefab === 'platform-wood-2-right-final' ||
           prefab === 'platform-wood-3-final';
  }

  private createPlatform(prefab: string, worldX: number, worldY: number, type: 'platform' | 'decoration' = 'platform'): PlatformDef {
    const id = `${type}_${this.platformCounter++}`;
    const width = prefabWidthPx(this.mapName, prefab, this.scale);
    const height = prefabHeightPx(this.mapName, prefab, this.scale);
    
    let collision: PlatformDef['collision'] = undefined;
    if (this.isSolidPrefab(prefab)) {
      collision = {
        solid: true,
        topY: worldY, // WORLD Y coordinate of the walkable surface
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
      y: Math.round(worldY), // WORLD Y coordinate
      scale: this.scale,
      collision,
    };
  }

  private generateFloor(): void {
    const tileWidth = getTileSize(this.mapName) * this.scale;
    const tilesNeeded = Math.ceil(SCREEN_W / tileWidth) + 1;
    
    for (let i = 0; i < tilesNeeded; i++) {
      const platform = this.createPlatform(
        'floor-final',
        i * tileWidth,
        this.floorWorldY, // Use world Y coordinate
        'platform'
      );
      this.platforms.set(platform.id, platform);
    }
    
  }

  private generateInitialPlatforms(): void {
    // Generate platforms ABOVE the floor (decreasing world Y)
    for (let i = 0; i < 3; i++) {
      const bandHeight = SCREEN_H * 0.8;
      const bandBottomWorldY = this.generatedMinWorldY - 50 - (i * 50); // Some spacing between bands
      const bandTopWorldY = bandBottomWorldY - bandHeight;
      
      this.generateBand(bandTopWorldY, bandBottomWorldY);
      this.generatedMinWorldY = bandTopWorldY;
    }
    
  }

  private generateBand(bandTopWorldY: number, bandBottomWorldY: number): void {
    const platformTypes = [
      ['platform-grass-1-final', 3],
      ['platform-grass-3-final', 2],
      ['platform-wood-1-final', 2],
      ['platform-wood-3-final', 1],
    ] as const;

    const platformCount = 4 + Math.floor(Math.random() * 4);
    
    for (let i = 0; i < platformCount; i++) {
      // Pick platform type
      const totalWeight = platformTypes.reduce((sum, [, weight]) => sum + weight, 0);
      let random = Math.random() * totalWeight;
      let selectedType = platformTypes[0][0];
      
      for (const [type, weight] of platformTypes) {
        random -= weight;
        if (random <= 0) {
          selectedType = type;
          break;
        }
      }

      // Try to place platform
      const width = prefabWidthPx(this.mapName, selectedType, this.scale);
      const height = prefabHeightPx(this.mapName, selectedType, this.scale);
      
      for (let attempt = 0; attempt < 50; attempt++) {
        const worldX = 40 + Math.random() * (SCREEN_W - 80 - width);
        const worldY = bandTopWorldY + 50 + Math.random() * (bandBottomWorldY - bandTopWorldY - height - 100);
        
        if (this.isPositionClear(worldX, worldY, width, height)) {
          const platform = this.createPlatform(selectedType, worldX, worldY, 'platform');
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
    if (!platform.collision?.solid) return;
    
    const isGrass3 = platform.prefab === 'platform-grass-3-final';
    const isGrass1 = platform.prefab === 'platform-grass-1-final';
    
    if (!isGrass3 && !isGrass1) return;
    
    const surfaceWorldY = platform.collision.topY;
    const surfaceLeft = platform.collision.left;
    const surfaceWidth = platform.collision.width;
    
    // Add decorations
    const decorationTypes = [
      'mushroom-red-small-final', 'mushroom-green-small-final',
      'grass-1-final', 'grass-2-final', 'grass-3-final'
    ];
    
    if (isGrass3 && Math.random() < 0.4) {
      const treeType = 'tree-small-final';
      const treeWidth = prefabWidthPx(this.mapName, treeType, this.scale);
      
      if (treeWidth <= surfaceWidth) {
        const treeX = surfaceLeft + Math.random() * (surfaceWidth - treeWidth);
        const treeY = alignPrefabYToSurfaceTop(this.mapName, treeType, surfaceWorldY, this.scale);
        const tree = this.createPlatform(treeType, treeX, treeY, 'decoration');
        this.platforms.set(tree.id, tree);
      }
    }
    
    const decorationCount = isGrass3 ? 2 : 1;
    for (let i = 0; i < decorationCount && Math.random() < 0.7; i++) {
      const decorationType = decorationTypes[Math.floor(Math.random() * decorationTypes.length)];
      const decorationWidth = prefabWidthPx(this.mapName, decorationType, this.scale);
      
      if (decorationWidth <= surfaceWidth) {
        const decorationX = surfaceLeft + Math.random() * (surfaceWidth - decorationWidth);
        const decorationY = alignPrefabYToSurfaceTop(this.mapName, decorationType, surfaceWorldY, this.scale);
        const decoration = this.createPlatform(decorationType, decorationX, decorationY, 'decoration');
        this.platforms.set(decoration.id, decoration);
      }
    }
  }

  // CRITICAL FIX: Update for camera should use WORLD coordinates
  updateForCamera(cameraY: number, playerWorldY: number): boolean {
    
    // Generate ahead of where the player is going
    const generateAheadWorldY = playerWorldY - SCREEN_H * 2;
    
    let generated = false;
    
    // Generate if we need more content above
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
    const initialCount = this.platforms.size;
    
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

  // FIXED: Use world coordinates for proximity check
  getPlatformsNearPlayer(playerWorldX: number, playerWorldY: number, radius = 200): PlatformDef[] {
    return this.getSolidPlatforms().filter(platform => {
      const platformCenterX = platform.x + (platform.collision?.width || 0) / 2;
      const platformCenterY = platform.y;
      
      const dx = Math.abs(platformCenterX - playerWorldX);
      const dy = Math.abs(platformCenterY - playerWorldY);
      
      return dx < radius && dy < radius;
    });
  }

  // Helper to get floor world Y
  getFloorWorldY(): number {
    return this.floorWorldY;
  }

  // Add a debug method to inspect platforms
  debugPlatformsNearY(worldY: number, range = 200): void {
    const nearby = Array.from(this.platforms.values()).filter(p => 
      Math.abs(p.y - worldY) < range
    );
    
  }
}