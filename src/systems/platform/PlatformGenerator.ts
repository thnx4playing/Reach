import { Dimensions } from 'react-native';
import { prefabWidthPx, prefabHeightPx, alignPrefabYToSurfaceTop, getTileSize } from '../../content/maps';
import type { MapName } from '../../content/maps';
import type { PlatformDef } from './PlatformSystem';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export class PlatformGenerator {
  private mapName: MapName;
  private scale: number;
  private floorTopY: number;
  private platformCounter = 0;

  constructor(mapName: MapName, floorTopY: number, scale = 2) {
    this.mapName = mapName;
    this.scale = scale;
    this.floorTopY = floorTopY;
  }

  // UNIFIED: Create platform with collision data computed immediately
  private createPlatform(prefab: string, x: number, y: number, type: 'platform' | 'decoration' = 'platform'): PlatformDef {
    const id = `${type}_${this.platformCounter++}`;
    const width = prefabWidthPx(this.mapName, prefab, this.scale);
    const height = prefabHeightPx(this.mapName, prefab, this.scale);
    
    // Determine if this is a solid platform
    const isSolid = this.isSolidPrefab(prefab);
    
    let collision: PlatformDef['collision'] = undefined;
    if (isSolid) {
      // For solid platforms, the collision surface is at the TOP of the sprite
      collision = {
        solid: true,
        topY: y, // The walkable surface is at the sprite's top edge
        left: x,
        right: x + width,
        width,
        height: 16 * this.scale, // Collision height (one tile)
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

  private isSolidPrefab(prefab: string): boolean {
    // Simple and clear: these are the solid platform types
    return prefab === 'floor-final' || 
           prefab === 'platform-grass-1-final' || 
           prefab === 'platform-grass-3-final' ||
           prefab === 'platform-wood-1-final' ||
           prefab === 'platform-wood-2-left-final' ||
           prefab === 'platform-wood-2-right-final' ||
           prefab === 'platform-wood-3-final';
  }

  // Generate platforms for a vertical band
  generateBand(bandTopY: number, bandBottomY: number, existingPlatforms: PlatformDef[]): PlatformDef[] {
    const platforms: PlatformDef[] = [];
    const decorations: PlatformDef[] = [];
    
    // Platform types with weights
    const platformTypes = [
      ['platform-grass-1-final', 3],
      ['platform-grass-3-final', 2],
      ['platform-wood-1-final', 2],
      ['platform-wood-3-final', 1],
    ] as const;

    // Generate 6-10 platforms per band
    const platformCount = 6 + Math.floor(Math.random() * 5);
    
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

      // Position platform
      const width = prefabWidthPx(this.mapName, selectedType, this.scale);
      const height = prefabHeightPx(this.mapName, selectedType, this.scale);
      
      // Try to place platform
      let placed = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        const x = 40 + Math.random() * (SCREEN_W - 80 - width);
        const y = bandTopY + Math.random() * (bandBottomY - bandTopY - height);
        
        // Check collision with existing platforms
        const newPlatform = this.createPlatform(selectedType, x, y, 'platform');
        
        let overlaps = false;
        for (const existing of [...existingPlatforms, ...platforms]) {
          if (this.platformsOverlap(newPlatform, existing)) {
            overlaps = true;
            break;
          }
        }
        
        if (!overlaps) {
          platforms.push(newPlatform);
          
          // Add decorations to this platform
          decorations.push(...this.generateDecorationsFor(newPlatform));
          placed = true;
          break;
        }
      }
    }
    
    return [...platforms, ...decorations];
  }

  private platformsOverlap(a: PlatformDef, b: PlatformDef): boolean {
    const aWidth = prefabWidthPx(this.mapName, a.prefab, a.scale);
    const aHeight = prefabHeightPx(this.mapName, a.prefab, a.scale);
    const bWidth = prefabWidthPx(this.mapName, b.prefab, b.scale);
    const bHeight = prefabHeightPx(this.mapName, b.prefab, b.scale);
    
    const margin = 60; // Minimum distance between platforms
    
    return !(a.x + aWidth + margin < b.x || 
             b.x + bWidth + margin < a.x || 
             a.y + aHeight + margin < b.y || 
             b.y + bHeight + margin < a.y);
  }

  private generateDecorationsFor(platform: PlatformDef): PlatformDef[] {
    if (!platform.collision?.solid) return [];
    
    const decorations: PlatformDef[] = [];
    const isGrass3 = platform.prefab === 'platform-grass-3-final';
    const isGrass1 = platform.prefab === 'platform-grass-1-final';
    
    if (!isGrass3 && !isGrass1) return [];
    
    // Calculate surface position
    const surfaceY = platform.collision.topY;
    const surfaceLeft = platform.collision.left;
    const surfaceRight = platform.collision.right;
    
    // Add tree (grass-3 only)
    if (isGrass3 && Math.random() < 0.3) {
      const treeTypes = ['tree-large-final', 'tree-medium-final', 'tree-small-final'];
      const treeType = treeTypes[Math.floor(Math.random() * treeTypes.length)];
      const treeWidth = prefabWidthPx(this.mapName, treeType, this.scale);
      
      if (treeWidth <= platform.collision.width) {
        const treeX = surfaceLeft + Math.random() * (platform.collision.width - treeWidth);
        const treeY = alignPrefabYToSurfaceTop(this.mapName, treeType, surfaceY, this.scale);
        decorations.push(this.createPlatform(treeType, treeX, treeY, 'decoration'));
      }
    }
    
    // Add mushrooms
    const mushroomCount = isGrass3 ? 2 : 1;
    const mushroomTypes = [
      'mushroom-red-small-final', 'mushroom-red-medium-final', 'mushroom-red-large-final',
      'mushroom-green-small-final', 'mushroom-green-medium-final', 'mushroom-green-large-final'
    ];
    
    for (let i = 0; i < mushroomCount && Math.random() < 0.6; i++) {
      const mushroomType = mushroomTypes[Math.floor(Math.random() * mushroomTypes.length)];
      const mushroomWidth = prefabWidthPx(this.mapName, mushroomType, this.scale);
      
      if (mushroomWidth <= platform.collision.width) {
        const mushroomX = surfaceLeft + Math.random() * (platform.collision.width - mushroomWidth);
        const mushroomY = alignPrefabYToSurfaceTop(this.mapName, mushroomType, surfaceY, this.scale);
        decorations.push(this.createPlatform(mushroomType, mushroomX, mushroomY, 'decoration'));
      }
    }
    
    // Add grass tufts
    const grassCount = isGrass3 ? 3 : 1;
    const grassTypes = ['grass-1-final', 'grass-2-final', 'grass-3-final', 'grass-4-final', 'grass-5-final', 'grass-6-final'];
    
    for (let i = 0; i < grassCount && Math.random() < 0.8; i++) {
      const grassType = grassTypes[Math.floor(Math.random() * grassTypes.length)];
      const grassWidth = prefabWidthPx(this.mapName, grassType, this.scale);
      
      if (grassWidth <= platform.collision.width) {
        const grassX = surfaceLeft + Math.random() * (platform.collision.width - grassWidth);
        const grassY = alignPrefabYToSurfaceTop(this.mapName, grassType, surfaceY, this.scale);
        decorations.push(this.createPlatform(grassType, grassX, grassY, 'decoration'));
      }
    }
    
    return decorations;
  }

  // Generate initial floor
  generateFloor(): PlatformDef[] {
    const platforms: PlatformDef[] = [];
    const tileWidth = getTileSize(this.mapName) * this.scale;
    const tilesNeeded = Math.ceil(SCREEN_W / tileWidth) + 1;
    
    for (let i = 0; i < tilesNeeded; i++) {
      platforms.push(this.createPlatform(
        'floor-final',
        i * tileWidth,
        this.floorTopY,
        'platform'
      ));
    }
    
    return platforms;
  }
}
