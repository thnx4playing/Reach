import { Dimensions } from 'react-native';
import { prefabWidthPx, prefabHeightPx, alignPrefabYToSurfaceTop, getTileSize } from '../../content/maps';
import type { MapName } from '../../content/maps';
import type { PlatformDef } from './types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export class PlatformManager {
  private platforms: Map<string, PlatformDef> = new Map();
  private mapName: MapName;
  private floorTopY: number;
  private scale: number;
  private generatedMaxY = 0; // Highest Y we've generated to
  private cameraY = 0;
  private platformCounter = 0;
  
  constructor(mapName: MapName, floorTopY: number, scale = 2) {
    this.mapName = mapName;
    this.floorTopY = floorTopY;
    this.scale = scale;
    this.generatedMaxY = floorTopY;
    
    // Generate initial floor
    this.generateFloor();
    
    // Generate initial platforms above floor
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

  private createPlatform(prefab: string, x: number, y: number, type: 'platform' | 'decoration' = 'platform'): PlatformDef {
    const id = `${type}_${this.platformCounter++}`;
    const width = prefabWidthPx(this.mapName, prefab, this.scale);
    const height = prefabHeightPx(this.mapName, prefab, this.scale);
    
    let collision: PlatformDef['collision'] = undefined;
    if (this.isSolidPrefab(prefab)) {
      collision = {
        solid: true,
        topY: y, // The walkable surface is at the sprite's top edge
        left: x,
        right: x + width,
        width,
        height: 16 * this.scale,
      };
    }

    return {
      id,
      type,
      prefab,
      x: Math.round(x),
      y: Math.round(y),
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
        this.floorTopY,
        'platform'
      );
      this.platforms.set(platform.id, platform);
    }
  }

  private generateInitialPlatforms(): void {
    // Generate a few bands above the floor initially
    for (let i = 0; i < 3; i++) {
      const bandHeight = SCREEN_H;
      const bandBottomY = this.generatedMaxY - 50;
      const bandTopY = bandBottomY - bandHeight;
      
      this.generateBand(bandTopY, bandBottomY);
      this.generatedMaxY = bandTopY;
    }
  }

  private generateBand(bandTopY: number, bandBottomY: number): void {
    const platformTypes = [
      ['platform-grass-1-final', 3],
      ['platform-grass-3-final', 2],
      ['platform-wood-1-final', 2],
      ['platform-wood-3-final', 1],
    ] as const;

    const platformCount = 4 + Math.floor(Math.random() * 4); // 4-7 platforms per band
    
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
        const x = 40 + Math.random() * (SCREEN_W - 80 - width);
        const y = bandTopY + 50 + Math.random() * (bandBottomY - bandTopY - height - 100);
        
        // Check if this position is clear
        if (this.isPositionClear(x, y, width, height)) {
          const platform = this.createPlatform(selectedType, x, y, 'platform');
          this.platforms.set(platform.id, platform);
          
          // Add decorations
          this.generateDecorationsFor(platform);
          break;
        }
      }
    }
  }

  private isPositionClear(x: number, y: number, width: number, height: number): boolean {
    const margin = 80;
    
    for (const platform of this.platforms.values()) {
      const pWidth = prefabWidthPx(this.mapName, platform.prefab, platform.scale);
      const pHeight = prefabHeightPx(this.mapName, platform.prefab, platform.scale);
      
      if (!(x + width + margin < platform.x || 
            platform.x + pWidth + margin < x || 
            y + height + margin < platform.y || 
            platform.y + pHeight + margin < y)) {
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
    
    const surfaceY = platform.collision.topY;
    const surfaceLeft = platform.collision.left;
    const surfaceWidth = platform.collision.width;
    
    // Add tree (grass-3 only)
    if (isGrass3 && Math.random() < 0.4) {
      const treeTypes = ['tree-small-final', 'tree-medium-final', 'tree-large-final'];
      const treeType = treeTypes[Math.floor(Math.random() * treeTypes.length)];
      const treeWidth = prefabWidthPx(this.mapName, treeType, this.scale);
      
      if (treeWidth <= surfaceWidth) {
        const treeX = surfaceLeft + Math.random() * (surfaceWidth - treeWidth);
        const treeY = alignPrefabYToSurfaceTop(this.mapName, treeType, surfaceY, this.scale);
        const tree = this.createPlatform(treeType, treeX, treeY, 'decoration');
        this.platforms.set(tree.id, tree);
      }
    }
    
    // Add small decorations
    const decorationTypes = [
      'mushroom-red-small-final', 'mushroom-green-small-final',
      'grass-1-final', 'grass-2-final', 'grass-3-final'
    ];
    
    const decorationCount = isGrass3 ? 2 : 1;
    for (let i = 0; i < decorationCount && Math.random() < 0.7; i++) {
      const decorationType = decorationTypes[Math.floor(Math.random() * decorationTypes.length)];
      const decorationWidth = prefabWidthPx(this.mapName, decorationType, this.scale);
      
      if (decorationWidth <= surfaceWidth) {
        const decorationX = surfaceLeft + Math.random() * (surfaceWidth - decorationWidth);
        const decorationY = alignPrefabYToSurfaceTop(this.mapName, decorationType, surfaceY, this.scale);
        const decoration = this.createPlatform(decorationType, decorationX, decorationY, 'decoration');
        this.platforms.set(decoration.id, decoration);
      }
    }
  }

  // PERFORMANCE: Only generate when camera moves significantly
  updateForCamera(newCameraY: number): boolean {
    const cameraChanged = Math.abs(newCameraY - this.cameraY) > 64; // Increased threshold
    if (!cameraChanged) return false;
    
    this.cameraY = newCameraY;
    
    // Generate ahead of camera
    const cameraTop = newCameraY;
    const generateAheadY = cameraTop - SCREEN_H * 2; // 2 screens ahead
    
    if (this.generatedMaxY <= generateAheadY) {
      // Generate new band
      const bandHeight = SCREEN_H;
      const bandBottomY = this.generatedMaxY - 50;
      const bandTopY = bandBottomY - bandHeight;
      
      this.generateBand(bandTopY, bandBottomY);
      this.generatedMaxY = bandTopY;
    }
    
    // Cull platforms far below camera
    const cullBelowY = newCameraY + SCREEN_H * 4;
    const toRemove: string[] = [];
    this.platforms.forEach((platform, id) => {
      if (platform.y > cullBelowY) {
        toRemove.push(id);
      }
    });
    toRemove.forEach(id => this.platforms.delete(id));
    
    return true; // Platforms changed
  }

  getSolidPlatforms(): PlatformDef[] {
    return Array.from(this.platforms.values()).filter(p => p.collision?.solid);
  }

  getAllPlatforms(): PlatformDef[] {
    return Array.from(this.platforms.values());
  }

  getPlatformsNearPlayer(playerX: number, playerY: number, radius = 200): PlatformDef[] {
    return this.getSolidPlatforms().filter(platform => {
      const dx = Math.abs(platform.x + platform.collision!.width/2 - playerX);
      const dy = Math.abs(platform.y - playerY);
      return dx < radius && dy < radius;
    });
  }
}