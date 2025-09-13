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
      ['platform-grass-1-final', 1],           // 10% (1/10)
      ['platform-grass-3-final', 5],           // 50% (5/10) 
      ['platform-wood-1-final', 1],            // 10% (1/10)
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
          'mushroom-red-small-final',
          'mushroom-green-small-final'
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
  
  // Culling system state
  private hasCrossedFirstBand = false;
  private lastCullCheck = 0;
  private CULL_CHECK_INTERVAL = 1000; // Check every 1 second for performance
  private CULL_DISTANCE = 600; // 600px below character for lava/death floor positioning
  private PLATFORM_CULL_DISTANCE = 200; // 200px below character for platform removal
  private FADE_OUT_DURATION = 1000; // 1 second fade-out duration
  
  // Death floor system
  private deathFloor: PlatformDef | null = null;
  private highestPlayerY: number = 0; // Track highest point player has reached
  
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
      // Small 24px overlap to guarantee coverage
      const SEAM_OVERLAP = 24;
      const bandBottomWorldY = this.generatedMinWorldY + SEAM_OVERLAP;
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
    // Increased platform density: was 5-9, now 9-13
    const basePlatformCount = 9;
    const variablePlatformCount = 4;
    const platformCount = basePlatformCount + Math.floor(Math.random() * variablePlatformCount);
    
    // Track if we've placed a paired platform set in this band
    let pairedPlatformPlaced = false;
    
    // Much smaller guard bands - let platforms spawn to the band edges
    const EDGE_MARGIN = 8; // was 50
    const minY = bandTopWorldY + EDGE_MARGIN;
    const maxY = bandBottomWorldY - 32 - EDGE_MARGIN; // 32 is typical platform height
    
    for (let i = 0; i < platformCount; i++) {
      let platformType = this.pickPlatformType();
      
      // Handle paired platform requirements
      if ((platformType === 'platform-wood-2-left-final' || platformType === 'platform-wood-2-right-final') && !pairedPlatformPlaced) {
        // Place both platforms as a pair
        const leftWidth = prefabWidthPx(this.mapName, 'platform-wood-2-left-final', this.scale);
        const rightWidth = prefabWidthPx(this.mapName, 'platform-wood-2-right-final', this.scale);
        const height = prefabHeightPx(this.mapName, 'platform-wood-2-left-final', this.scale);
        
        // Try to place the pair
        for (let attempt = 0; attempt < 50; attempt++) {
          // Place left platform at left edge
          const leftX = 0;
          const leftY = minY + Math.random() * Math.max(1, (maxY - minY));
          
          // Place right platform 150px above and at right edge
          const rightX = Math.max(0, SCREEN_W - rightWidth);
          const rightY = Math.min(maxY, leftY - 150); // keep the vertical offset intent but clamp into band
          
          // Check if both positions are clear
          if (this.isPositionClear(leftX, leftY, leftWidth, height) && 
              this.isPositionClear(rightX, rightY, rightWidth, height)) {
            
            // Create both platforms
            const leftPlatform = this.createPlatform('platform-wood-2-left-final', leftX, leftY, 'platform');
            const rightPlatform = this.createPlatform('platform-wood-2-right-final', rightX, rightY, 'platform');
            
            this.platforms.set(leftPlatform.id, leftPlatform);
            this.platforms.set(rightPlatform.id, rightPlatform);
            
            this.generateDecorationsFor(leftPlatform);
            this.generateDecorationsFor(rightPlatform);
            
            pairedPlatformPlaced = true;
            break;
          }
        }
        
        // Skip the normal platform placement for this iteration
        continue;
      }
      
      // Skip individual wood-2 platforms if we've already placed a pair
      if ((platformType === 'platform-wood-2-left-final' || platformType === 'platform-wood-2-right-final') && pairedPlatformPlaced) {
        // Pick a different platform type
        platformType = this.pickPlatformType();
        // If we get another wood-2 platform, skip this iteration
        if (platformType === 'platform-wood-2-left-final' || platformType === 'platform-wood-2-right-final') {
          continue;
        }
      }
      
      // Try to place platform with improved positioning to avoid gaps
      const width = prefabWidthPx(this.mapName, platformType, this.scale);
      const height = prefabHeightPx(this.mapName, platformType, this.scale);
      
      for (let attempt = 0; attempt < 50; attempt++) {
        const worldX = this.getValidXPosition(platformType, width);
        
        // Use weighted random to favor lower positions (closer to bottom of band)
        // This helps ensure platforms are available in the bottom 20% of the band
        const weight = Math.random();
        const worldY = minY + weight * weight * (maxY - minY);
        
        if (this.isPositionClear(worldX, worldY, width, height)) {
          const platform = this.createPlatform(platformType, worldX, worldY, 'platform');
          this.platforms.set(platform.id, platform);
          
          this.generateDecorationsFor(platform);
          break;
        }
      }
    }
    
    // Ensure at least one platform near the top seam to bridge bands
    (() => {
      const seamBandTop = bandTopWorldY;
      const seamBandBottom = bandTopWorldY + 32; // 32px near the top

      const hasSeamBridge = Array.from(this.platforms.values()).some(p =>
        p.type === 'platform' &&
        p.y >= seamBandTop &&
        p.y <= seamBandBottom
      );

      if (!hasSeamBridge) {
        // pick a small/medium prefab from config
        const fallbackType = this.config.platformTypes[0]?.[0] ?? 'platform-wood-1-final';
        const width  = prefabWidthPx(this.mapName, fallbackType, this.scale);
        const height = prefabHeightPx(this.mapName, fallbackType, this.scale);

        // try a few positions near the seam
        for (let attempt = 0; attempt < 20; attempt++) {
          const worldX = this.getValidXPosition(fallbackType, width);
          const worldY = seamBandTop + 8 + Math.random() * Math.max(1, (seamBandBottom - seamBandTop - height - 8));
          if (this.isPositionClear(worldX, worldY, width, height)) {
            const platform = this.createPlatform(fallbackType, worldX, worldY, 'platform');
            this.platforms.set(platform.id, platform);
            break;
          }
        }
      }
    })();
  }

  private isPositionClear(worldX: number, worldY: number, width: number, height: number): boolean {
    const margin = 40; // a bit denser packing
    
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
            
            
            const tree = this.createPlatform(treeType, treeWorldX, treeWorldY, 'decoration');
            this.platforms.set(tree.id, tree);
            occupiedTiles.add(tileIndex);
          }
        }
      }
    }
    
    // Add mushrooms - ONE PER PLATFORM (not per tile)
    if (decorationConfig.mushrooms) {
      const mushroomConfig = decorationConfig.mushrooms;
      // Only spawn one mushroom per platform, regardless of platform size
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
    
    // Check if player has crossed the first band (for culling activation)
    if (!this.hasCrossedFirstBand && playerWorldY < this.floorWorldY - SCREEN_H * 0.8) {
      this.hasCrossedFirstBand = true;
    }
    
    if (this.generatedMinWorldY > generateAheadWorldY) {
      while (this.generatedMinWorldY > generateAheadWorldY) {
        const bandHeight = SCREEN_H * 0.8;
        // Small 24px overlap to guarantee coverage
        const SEAM_OVERLAP = 24;
        const bandBottomWorldY = this.generatedMinWorldY + SEAM_OVERLAP;
        const bandTopWorldY = bandBottomWorldY - bandHeight;
        
        this.generateBand(bandTopWorldY, bandBottomWorldY);
        this.generatedMinWorldY = bandTopWorldY;
        generated = true;
      }
    }
    
    // PERFORMANCE OPTIMIZED: Only cull if player has crossed first band
    if (this.hasCrossedFirstBand) {
      const now = Date.now();
      if (now - this.lastCullCheck > this.CULL_CHECK_INTERVAL) {
        this.lastCullCheck = now;
        
        // Cull platforms 200px below player (aggressive for performance)
        const cullBelowWorldY = playerWorldY + this.PLATFORM_CULL_DISTANCE;
        const toRemove: string[] = [];
        const culledParentPlatforms: PlatformDef[] = [];
        
        // First pass: identify parent platforms to start fading out
        this.platforms.forEach((platform, id) => {
          if (platform.type === 'platform' && platform.y > cullBelowWorldY && !platform.fadeOut) {
            this.startFadeOut(platform);
            culledParentPlatforms.push(platform);
            generated = true; // Mark that we need to update the game
          }
        });
        
        // Second pass: start fading out decorations that belong to culled parent platforms
        // We'll fade decorations that are positioned near culled parent platforms
        this.platforms.forEach((platform, id) => {
          if (platform.type === 'decoration' && !platform.fadeOut) {
            // Check if this decoration is near any culled parent platform
            const isNearCulledParent = culledParentPlatforms.some(parentPlatform => {
              const decorationCenterX = platform.x + (prefabWidthPx(this.mapName, platform.prefab, this.scale) / 2);
              const parentCenterX = parentPlatform.x + (parentPlatform.collision?.width || prefabWidthPx(this.mapName, parentPlatform.prefab, this.scale)) / 2;
              const horizontalDistance = Math.abs(decorationCenterX - parentCenterX);
              const verticalDistance = Math.abs(platform.y - parentPlatform.y);
              
              // If decoration is within reasonable distance of a culled parent platform, fade it too
              return horizontalDistance < 200 && verticalDistance < 100;
            });
            
            if (isNearCulledParent) {
              this.startFadeOut(platform);
              generated = true; // Mark that we need to update the game
            }
          }
        });
        
        // Platforms are now faded out instead of instantly removed
        // The actual removal happens in updateFadeOutAnimations()
      }
    } else {
      // Original culling for before first band (less aggressive)
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
    const nearbyPlatforms = this.getSolidPlatforms().filter(platform => {
      const platformCenterX = platform.x + (platform.collision?.width || 0) / 2;
      const platformCenterY = platform.y;
      
      const dx = Math.abs(platformCenterX - playerWorldX);
      const dy = Math.abs(platformCenterY - playerWorldY);
      
      return dx < radius && dy < radius;
    });
    
    // Always include death floor if it exists, regardless of distance
    if (this.deathFloor && !nearbyPlatforms.includes(this.deathFloor)) {
      nearbyPlatforms.push(this.deathFloor);
    }
    
    return nearbyPlatforms;
  }

  getFloorWorldY(): number {
    return this.floorWorldY;
  }

  debugPlatformsNearY(worldY: number, range = 200): void {
    const nearby = Array.from(this.platforms.values()).filter(p => 
      Math.abs(p.y - worldY) < range
    );
    
  }

  /**
   * Check if player has fallen below the culling point (should die)
   * Only active after crossing the first band
   */
  hasPlayerFallenBelowCullingPoint(playerWorldY: number): boolean {
    if (!this.hasCrossedFirstBand) {
      return false; // No death penalty before crossing first band
    }
    
    // Player dies if they fall 500px below their highest point
    // We use the floor as a reference since that's where they start
    const cullThreshold = this.floorWorldY + this.CULL_DISTANCE;
    const shouldDie = playerWorldY > cullThreshold;
    
    if (shouldDie) {
    }
    
    return shouldDie;
  }

  /**
   * Get the culling threshold for UI/debug purposes
   */
  getCullingThreshold(): number | null {
    if (!this.hasCrossedFirstBand) {
      return null;
    }
    return this.floorWorldY + this.CULL_DISTANCE;
  }

  /**
   * Create or update the death floor that follows the player
   * Death floor only moves up, never down
   */
  updateDeathFloor(playerWorldY: number): void {
    if (!this.hasCrossedFirstBand) {
      // Remove death floor if it exists and player hasn't crossed first band
      if (this.deathFloor) {
        this.platforms.delete(this.deathFloor.id);
        this.deathFloor = null;
      }
      this.highestPlayerY = 0; // Reset highest point
      return;
    }

    // Update highest point tracking (more responsive)
    if (playerWorldY < this.highestPlayerY || this.highestPlayerY === 0) {
      this.highestPlayerY = playerWorldY;
    }

    if (!this.deathFloor) {
      // Create death floor for the first time - spawn at appropriate distance
      const spawnY = this.highestPlayerY + this.CULL_DISTANCE;
      this.deathFloor = this.createDeathFloor(spawnY);
      this.platforms.set(this.deathFloor.id, this.deathFloor);
    } else {
      // Death floor follows at fixed distance below highest point
      const targetY = this.highestPlayerY + this.CULL_DISTANCE;
      
      // Always update death floor position (it can move up or down now)
      if (Math.abs(targetY - this.deathFloor.y) > 10) { // Only update if significant change
        this.deathFloor.y = targetY;
        if (this.deathFloor.collision) {
          this.deathFloor.collision.topY = targetY + 40; // Collision 40px below visual lava surface
        }
      }
    }
  }

  /**
   * Update the highest point when player lands on a platform
   * This should be called when player successfully lands on a platform
   */
  updateHighestPointOnLanding(platformTopY: number): void {
    if (!this.hasCrossedFirstBand) {
      return; // Don't track before first band
    }

    // Update highest point based on platform landing (only goes up)
    if (platformTopY < this.highestPlayerY || this.highestPlayerY === 0) {
      const oldHighest = this.highestPlayerY;
      this.highestPlayerY = platformTopY;
      // Removed debug logging for cleaner console
    }
  }

  /**
   * Create a death floor platform
   */
  private createDeathFloor(worldY: number): PlatformDef {
    const id = `death_floor_${this.platformCounter++}`;
    const width = SCREEN_W * 2; // Extra wide to prevent edge cases
    
    return {
      id,
      type: 'platform',
      prefab: 'floor-final', // Use existing floor prefab to avoid warnings
      x: -SCREEN_W / 2, // Center the extra-wide platform
      y: worldY,
      scale: this.scale,
      collision: {
        solid: true,
        topY: worldY + 40, // Collision box 40px below visual lava surface
        left: -SCREEN_W / 2,
        right: width - SCREEN_W / 2,
        width,
        height: 100, // Thicker collision for reliable detection
      },
    };
  }

  /**
   * Check if a platform is the death floor
   */
  isDeathFloor(platform: PlatformDef): boolean {
    return platform.id === this.deathFloor?.id;
  }

  /**
   * Get the death floor if it exists
   */
  getDeathFloor(): PlatformDef | null {
    return this.deathFloor;
  }

  /**
   * Update fade-out animations and remove fully faded platforms
   */
  updateFadeOutAnimations(): boolean {
    const now = Date.now();
    const toRemove: string[] = [];
    let hasChanges = false;

    this.platforms.forEach((platform, id) => {
      if (platform.fadeOut) {
        const elapsed = now - platform.fadeOut.startTime;
        const progress = Math.min(elapsed / platform.fadeOut.duration, 1.0);
        
        // Calculate opacity using smooth easing (ease-out)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        platform.fadeOut.opacity = Math.max(0, 1 - easeOut);
        
        // Remove platform when fade is complete
        if (progress >= 1.0) {
          toRemove.push(id);
          hasChanges = true;
        }
      }
    });

    // Remove fully faded platforms
    toRemove.forEach(id => this.platforms.delete(id));
    
    return hasChanges;
  }

  /**
   * Start fade-out animation for a platform
   */
  private startFadeOut(platform: PlatformDef): void {
    if (!platform.fadeOut) {
      platform.fadeOut = {
        startTime: Date.now(),
        duration: this.FADE_OUT_DURATION,
        opacity: 1.0
      };
    }
  }

  /**
   * Get the highest point the player has reached
   */
  getHighestPlayerY(): number {
    return this.highestPlayerY;
  }

  /**
   * Get debug info about the death floor for UI display
   */
  getDeathFloorDebugInfo(): { 
    exists: boolean; 
    worldY: number; 
    distanceFromPlayer: number;
    highestPoint: number;
  } | null {
    if (!this.deathFloor || !this.hasCrossedFirstBand) {
      return null;
    }
    
    return {
      exists: true,
      worldY: this.deathFloor.y,
      distanceFromPlayer: 0, // Will be calculated by caller
      highestPoint: this.highestPlayerY
    };
  }
}