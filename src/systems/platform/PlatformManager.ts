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
    
    // Remove wood-2 platforms from regular spawning
    this.updateConfigForPairedPlatforms();
    
    // Generate initial content
    this.generateFloor();
    this.generateInitialPlatforms();
  }

  // Update the existing configuration to remove wood-2 platforms from regular spawning
  private updateConfigForPairedPlatforms(): void {
    // Filter out wood-2 platforms from regular platform types
    this.config.platformTypes = this.config.platformTypes.filter(([type]) => 
      type !== 'platform-wood-2-left-final' && type !== 'platform-wood-2-right-final'
    );
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
    // CRITICAL FIX: Band height must be based on actual jump capability
    // Max jump height: 203px
    // Safe band height: ~300px (1.5x max jump for some challenge)
    // Old system used SCREEN_H * 0.8 = ~675px (impossible!)
    
    const MAX_JUMP_HEIGHT = 203;
    const SAFE_BAND_HEIGHT = MAX_JUMP_HEIGHT * 1.5; // 300px - allows for platform variety
    
    console.log(`[PlatformManager] Using physics-correct band height: ${SAFE_BAND_HEIGHT}px (was ${SCREEN_H * 0.8}px)`);
    
    // Generate 4-5 smaller, reachable bands instead of 3 massive ones
    for (let i = 0; i < 4; i++) {
      const bandHeight = SAFE_BAND_HEIGHT;
      
      // Create small gaps between bands for seam coverage
      const BAND_GAP = 50; // Small overlap between bands
      const bandBottomWorldY = this.generatedMinWorldY - (i * BAND_GAP);
      const bandTopWorldY = bandBottomWorldY - bandHeight;
      
      console.log(`[PlatformManager] Generating band ${i}: ${bandTopWorldY} to ${bandBottomWorldY} (height: ${bandHeight}px)`);
      
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
    // Wood-2 platforms should NEVER use this method - they have special positioning
    if (platformType === 'platform-wood-2-left-final' || platformType === 'platform-wood-2-right-final') {
      console.warn('[PlatformManager] Wood-2 platforms should not use getValidXPosition');
      return 0;
    }
    
    // Regular platforms - random position with margin
    const margin = 30;
    const minX = margin;
    const maxX = Math.max(minX, SCREEN_W - margin - width);
    return minX + Math.random() * (maxX - minX);
  }

  private generateBand(bandTopWorldY: number, bandBottomWorldY: number): void {
    // Ultra-conservative physics constants
    const MAX_JUMP_HEIGHT = 203;
    const MAX_JUMP_DISTANCE = 229;
    
    // VERY SAFE spacing - ensure every jump is easily possible
    const EASY_VERTICAL_GAP = 80;     // 40% of max jump height
    const MEDIUM_VERTICAL_GAP = 120;  // 60% of max jump height  
    const HARD_VERTICAL_GAP = 150;    // 75% of max jump height (safe margin)
    
    const EASY_HORIZONTAL_GAP = 60;   // 25% of max distance
    const MEDIUM_HORIZONTAL_GAP = 100; // 45% of max distance
    const HARD_HORIZONTAL_GAP = 160;  // 70% of max distance
    const SCREEN_WRAP_GAP = 250;      // Forces screen wrap
    
    // Detect if this is the first band (near floor)
    const isFirstBand = bandBottomWorldY >= this.floorWorldY - 200;
    
    console.log(`[PlatformManager] Generating ${isFirstBand ? 'FIRST' : 'UPPER'} band: ${bandTopWorldY} to ${bandBottomWorldY}`);
    
    // First band gets extra-easy jumps
    const DIFFICULTY_DISTRIBUTION = {
      easy: isFirstBand ? 0.8 : 0.5,      // 80% easy in first band
      medium: isFirstBand ? 0.2 : 0.4,    
      hard: isFirstBand ? 0.0 : 0.1,      // No hard jumps in first band
      screenWrap: isFirstBand ? 0.0 : 0.0 // No screen wrap for now until spacing is perfect
    };

    // Platform count - fewer platforms with better spacing
    const basePlatformCount = 5;
    const variablePlatformCount = 2;
    const totalPlatforms = basePlatformCount + Math.floor(Math.random() * variablePlatformCount);
    
    // Generate difficulty sequence
    const difficultySequence = this.generateDifficultySequence(totalPlatforms, DIFFICULTY_DISTRIBUTION);
    
    // Track placed platforms
    const placedPlatforms: Array<{
      x: number, y: number, width: number, height: number, difficulty: string
    }> = [];
    
    // Skip paired platforms for now - focus on getting basic spacing right
    
    // Place first platform at guaranteed reachable height
    if (isFirstBand) {
      this.placeFirstReachablePlatformUltraConservative(
        bandTopWorldY, 
        bandBottomWorldY, 
        placedPlatforms
      );
      difficultySequence.shift();
    }
    
    // Place remaining platforms with ultra-conservative spacing
    for (let i = 0; i < difficultySequence.length; i++) {
      const difficulty = difficultySequence[i];
      let platformType = this.pickPlatformTypeForDifficulty(difficulty);
      
      // Skip wood-2 platforms
      if (platformType === 'platform-wood-2-left-final' || platformType === 'platform-wood-2-right-final') {
        platformType = this.pickPlatformTypeForDifficulty('medium');
      }
      
      if (!platformType) continue;
      
      this.placePlatformUltraConservative(
        platformType, 
        difficulty, 
        bandTopWorldY, 
        bandBottomWorldY, 
        placedPlatforms,
        placedPlatforms.length === 0
      );
    }
    
    // Ensure seam coverage
    this.ensureSeamCoverageUltraConservative(bandTopWorldY, bandBottomWorldY, placedPlatforms);
  }

  private placeFirstReachablePlatformUltraConservative(
    bandTopWorldY: number,
    bandBottomWorldY: number,
    placedPlatforms: Array<{x: number, y: number, width: number, height: number, difficulty: string}>
  ): void {
    const platformType = 'platform-grass-3-final';
    const width = prefabWidthPx(this.mapName, platformType, this.scale);
    const height = prefabHeightPx(this.mapName, platformType, this.scale);
    
    // ULTRA-CONSERVATIVE: Place first platform only 80px above floor (well within 203px jump)
    const ULTRA_SAFE_HEIGHT = 80;
    const worldY = this.floorWorldY - ULTRA_SAFE_HEIGHT;
    
    // Ensure within band boundaries
    const clampedY = Math.max(bandTopWorldY + 20, Math.min(bandBottomWorldY - height - 20, worldY));
    
    // Center horizontally
    const worldX = (SCREEN_W - width) / 2;
    
    console.log(`[PlatformManager] ULTRA-CONSERVATIVE first platform: ${ULTRA_SAFE_HEIGHT}px above floor (max jump: 203px)`);
    
    const platform = this.createPlatform(platformType, worldX, clampedY, 'platform');
    this.platforms.set(platform.id, platform);
    this.generateDecorationsFor(platform);
    
    placedPlatforms.push({
      x: worldX,
      y: clampedY,
      width,
      height,
      difficulty: 'easy'
    });
  }

  private placePlatformUltraConservative(
    platformType: string,
    difficulty: string,
    bandTopWorldY: number,
    bandBottomWorldY: number,
    placedPlatforms: Array<{x: number, y: number, width: number, height: number, difficulty: string}>,
    isFirst: boolean
  ): boolean {
    const width = prefabWidthPx(this.mapName, platformType, this.scale);
    const height = prefabHeightPx(this.mapName, platformType, this.scale);
    
    const referencePlatform = placedPlatforms[placedPlatforms.length - 1];
    
    for (let attempt = 0; attempt < 100; attempt++) {
      let worldX: number;
      let worldY: number;
      
      if (isFirst || !referencePlatform) {
        worldX = this.getValidXPosition(platformType, width);
        worldY = this.getRandomYInBand(bandTopWorldY, bandBottomWorldY, height);
      } else {
        const positioned = this.positionUltraConservative(
          referencePlatform,
          width,
          height,
          difficulty,
          bandTopWorldY,
          bandBottomWorldY
        );
        
        if (!positioned) continue;
        worldX = positioned.x;
        worldY = positioned.y;
      }
      
      if (this.isPositionClearForPlacement(worldX, worldY, width, height, placedPlatforms)) {
        const platform = this.createPlatform(platformType, worldX, worldY, 'platform');
        this.platforms.set(platform.id, platform);
        this.generateDecorationsFor(platform);
        
        placedPlatforms.push({
          x: worldX,
          y: worldY,
          width,
          height,
          difficulty
        });
        
        // Log actual gap created
        if (referencePlatform) {
          const verticalGap = referencePlatform.y - worldY;
          const horizontalGap = worldX - (referencePlatform.x + referencePlatform.width);
          console.log(`[PlatformManager] ${difficulty} gap: V=${verticalGap}px, H=${horizontalGap}px (max: V=203px, H=229px)`);
        }
        
        return true;
      }
    }
    
    return false;
  }

  private positionUltraConservative(
    referencePlatform: {x: number, y: number, width: number, height: number},
    newWidth: number,
    newHeight: number,
    difficulty: string,
    bandTopWorldY: number,
    bandBottomWorldY: number
  ): {x: number, y: number} | null {
    
    // ULTRA-CONSERVATIVE gaps - way smaller than max jump capability
    const EASY_VERTICAL_GAP = 60;     // 30% of max jump (203px)
    const MEDIUM_VERTICAL_GAP = 90;   // 45% of max jump  
    const HARD_VERTICAL_GAP = 120;    // 60% of max jump
    
    const EASY_HORIZONTAL_GAP = 50;   // 22% of max distance (229px)
    const MEDIUM_HORIZONTAL_GAP = 80; // 35% of max distance
    const HARD_HORIZONTAL_GAP = 120;  // 52% of max distance
    
    const refRightX = referencePlatform.x + referencePlatform.width;
    const refY = referencePlatform.y;
    
    let horizontalGap: number;
    let verticalGap: number; // Positive = going up
    
    switch (difficulty) {
      case 'easy':
        horizontalGap = 30 + Math.random() * (EASY_HORIZONTAL_GAP - 30);
        verticalGap = Math.random() * EASY_VERTICAL_GAP - EASY_VERTICAL_GAP/2; // ±30px
        break;
        
      case 'medium':
        horizontalGap = EASY_HORIZONTAL_GAP + Math.random() * (MEDIUM_HORIZONTAL_GAP - EASY_HORIZONTAL_GAP);
        verticalGap = Math.random() * MEDIUM_VERTICAL_GAP - MEDIUM_VERTICAL_GAP/2; // ±45px
        break;
        
      case 'hard':
        horizontalGap = MEDIUM_HORIZONTAL_GAP + Math.random() * (HARD_HORIZONTAL_GAP - MEDIUM_HORIZONTAL_GAP);
        verticalGap = Math.random() * HARD_VERTICAL_GAP - HARD_VERTICAL_GAP/2; // ±60px
        break;
        
      default:
        horizontalGap = EASY_HORIZONTAL_GAP;
        verticalGap = 0;
    }
    
    // Calculate target position
    let targetX = refRightX + horizontalGap;
    let targetY = refY - verticalGap; // Subtract because Y increases downward
    
    // Handle screen wrapping (disabled for now)
    if (targetX + newWidth > SCREEN_W + 50) {
      targetX = targetX - SCREEN_W - 100;
      if (targetX + newWidth > referencePlatform.x - 40) {
        targetX = referencePlatform.x - newWidth - 60;
      }
    }
    
    // Clamp to band boundaries
    targetY = Math.max(bandTopWorldY + 25, Math.min(bandBottomWorldY - newHeight - 25, targetY));
    
    // Ensure minimum spacing
    if (Math.abs(targetX - referencePlatform.x) < 25 && Math.abs(targetY - referencePlatform.y) < 25) {
      return null;
    }
    
    return { x: targetX, y: targetY };
  }

  private ensureSeamCoverageUltraConservative(
    bandTopWorldY: number,
    bandBottomWorldY: number,
    placedPlatforms: Array<{x: number, y: number, width: number, height: number}>
  ): void {
    const seamZoneTop = bandTopWorldY;
    const seamZoneBottom = bandTopWorldY + 100; // Larger seam zone
    
    const hasSeamCoverage = placedPlatforms.some(p => 
      p.y >= seamZoneTop && p.y <= seamZoneBottom
    );
    
    if (!hasSeamCoverage) {
      const fallbackType = 'platform-grass-3-final';
      const width = prefabWidthPx(this.mapName, fallbackType, this.scale);
      const height = prefabHeightPx(this.mapName, fallbackType, this.scale);
      
      for (let attempt = 0; attempt < 20; attempt++) {
        const worldX = this.getValidXPosition(fallbackType, width);
        const worldY = seamZoneTop + Math.random() * (seamZoneBottom - seamZoneTop - height);
        
        if (this.isPositionClearForPlacement(worldX, worldY, width, height, placedPlatforms)) {
          const platform = this.createPlatform(fallbackType, worldX, worldY, 'platform');
          this.platforms.set(platform.id, platform);
          console.log(`[PlatformManager] Seam coverage at ${this.floorWorldY - worldY}px above floor`);
          break;
        }
      }
    }
  }

  private placePlatformWithPhysicsCorrectSpacing(
    platformType: string,
    difficulty: string,
    bandTopWorldY: number,
    bandBottomWorldY: number,
    placedPlatforms: Array<{x: number, y: number, width: number, height: number, difficulty: string}>,
    isFirst: boolean
  ): boolean {
    const width = prefabWidthPx(this.mapName, platformType, this.scale);
    const height = prefabHeightPx(this.mapName, platformType, this.scale);
    
    // Get reference platform
    const referencePlatform = placedPlatforms[placedPlatforms.length - 1];
    
    for (let attempt = 0; attempt < 100; attempt++) {
      let worldX: number;
      let worldY: number;
      
      if (isFirst || !referencePlatform) {
        // First platform - place anywhere reasonable
        worldX = this.getValidXPosition(platformType, width);
        worldY = this.getRandomYInBand(bandTopWorldY, bandBottomWorldY, height);
      } else {
        // Position relative to reference with PHYSICS-CORRECT spacing
        const positioned = this.positionWithPhysicsCorrectSpacing(
          referencePlatform,
          width,
          height,
          difficulty,
          bandTopWorldY,
          bandBottomWorldY
        );
        
        if (!positioned) continue;
        worldX = positioned.x;
        worldY = positioned.y;
      }
      
      // Check collision
      if (this.isPositionClearForPlacement(worldX, worldY, width, height, placedPlatforms)) {
        const platform = this.createPlatform(platformType, worldX, worldY, 'platform');
        this.platforms.set(platform.id, platform);
        this.generateDecorationsFor(platform);
        
        placedPlatforms.push({
          x: worldX,
          y: worldY,
          width,
          height,
          difficulty
        });
        
        // Log the actual gap created
        if (referencePlatform) {
          const verticalGap = referencePlatform.y - worldY; // Negative if going up
          const horizontalGap = worldX - (referencePlatform.x + referencePlatform.width);
          console.log(`[PlatformManager] ${difficulty} jump: V=${verticalGap}px, H=${horizontalGap}px`);
        }
        
        return true;
      }
    }
    
    return false;
  }

  private positionWithPhysicsCorrectSpacing(
    referencePlatform: {x: number, y: number, width: number, height: number},
    newWidth: number,
    newHeight: number,
    difficulty: string,
    bandTopWorldY: number,
    bandBottomWorldY: number
  ): {x: number, y: number} | null {
    
    // PHYSICS-CORRECT SPACING VALUES
    const EASY_VERTICAL_GAP = 120;    // 60% of max jump height
    const MEDIUM_VERTICAL_GAP = 160;  // 80% of max jump height  
    const HARD_VERTICAL_GAP = 190;    // 95% of max jump height
    
    const EASY_HORIZONTAL_GAP = 80;   // 35% of max distance
    const MEDIUM_HORIZONTAL_GAP = 140; // 60% of max distance
    const HARD_HORIZONTAL_GAP = 200;  // 87% of max distance
    const SCREEN_WRAP_GAP = 280;      // Forces screen wrap
    
    const refRightX = referencePlatform.x + referencePlatform.width;
    const refY = referencePlatform.y;
    
    let horizontalGap: number;
    let verticalGap: number; // Positive = going up, negative = going down
    
    switch (difficulty) {
      case 'easy':
        horizontalGap = 40 + Math.random() * (EASY_HORIZONTAL_GAP - 40);
        verticalGap = Math.random() * EASY_VERTICAL_GAP - EASY_VERTICAL_GAP/2; // ±60px
        break;
        
      case 'medium':
        horizontalGap = EASY_HORIZONTAL_GAP + Math.random() * (MEDIUM_HORIZONTAL_GAP - EASY_HORIZONTAL_GAP);
        verticalGap = Math.random() * MEDIUM_VERTICAL_GAP - MEDIUM_VERTICAL_GAP/2; // ±80px
        break;
        
      case 'hard':
        horizontalGap = MEDIUM_HORIZONTAL_GAP + Math.random() * (HARD_HORIZONTAL_GAP - MEDIUM_HORIZONTAL_GAP);
        verticalGap = Math.random() * HARD_VERTICAL_GAP - HARD_VERTICAL_GAP/2; // ±95px
        break;
        
      case 'screenWrap':
        horizontalGap = SCREEN_WRAP_GAP + Math.random() * 80;
        verticalGap = Math.random() * MEDIUM_VERTICAL_GAP - MEDIUM_VERTICAL_GAP/2; // ±80px
        break;
        
      default:
        horizontalGap = EASY_HORIZONTAL_GAP;
        verticalGap = 0;
    }
    
    // Calculate target position
    let targetX = refRightX + horizontalGap;
    let targetY = refY - verticalGap; // Subtract because Y increases downward
    
    // Handle screen wrapping
    if (targetX + newWidth > SCREEN_W + 50) {
      targetX = targetX - SCREEN_W - 100;
      
      // Avoid overlap after wrapping
      if (targetX + newWidth > referencePlatform.x - 40) {
        targetX = referencePlatform.x - newWidth - 60;
      }
    }
    
    // Clamp to band boundaries
    targetY = Math.max(bandTopWorldY + 25, Math.min(bandBottomWorldY - newHeight - 25, targetY));
    
    // Ensure reasonable spacing
    if (Math.abs(targetX - referencePlatform.x) < 30 && Math.abs(targetY - referencePlatform.y) < 30) {
      return null;
    }
    
    return { x: targetX, y: targetY };
  }

  private placePairedPlatformsPhysicsCorrect(
    bandTopWorldY: number,
    bandBottomWorldY: number,
    placedPlatforms: Array<{x: number, y: number, width: number, height: number, difficulty: string}>
  ): boolean {
    const leftWidth = prefabWidthPx(this.mapName, 'platform-wood-2-left-final', this.scale);
    const rightWidth = prefabWidthPx(this.mapName, 'platform-wood-2-right-final', this.scale);
    const height = prefabHeightPx(this.mapName, 'platform-wood-2-left-final', this.scale);
    
    const margin = 30;
    const minY = bandTopWorldY + margin;
    const maxY = bandBottomWorldY - height - margin;
    
    if (maxY <= minY) return false;
    
    for (let attempt = 0; attempt < 30; attempt++) {
      // Left platform flush to left edge
      const leftX = 0;
      const leftY = minY + Math.random() * (maxY - minY);
      
      // Right platform flush to right edge, exactly 50px higher
      const rightX = SCREEN_W - rightWidth;
      const rightY = leftY - 50; // 50px higher (well within jump range)
      
      // Ensure right platform stays in bounds
      if (rightY < minY) continue;
      
      if (this.isPositionClearForPlacement(leftX, leftY, leftWidth, height, placedPlatforms) &&
          this.isPositionClearForPlacement(rightX, rightY, rightWidth, height, placedPlatforms)) {
        
        const leftPlatform = this.createPlatform('platform-wood-2-left-final', leftX, leftY, 'platform');
        const rightPlatform = this.createPlatform('platform-wood-2-right-final', rightX, rightY, 'platform');
        
        this.platforms.set(leftPlatform.id, leftPlatform);
        this.platforms.set(rightPlatform.id, rightPlatform);
        
        this.generateDecorationsFor(leftPlatform);
        this.generateDecorationsFor(rightPlatform);
        
        placedPlatforms.push({
          x: leftX, y: leftY, width: leftWidth, height, difficulty: 'paired-left'
        });
        placedPlatforms.push({
          x: rightX, y: rightY, width: rightWidth, height, difficulty: 'paired-right'
        });
        
        console.log(`[PlatformManager] Paired platforms: 50px vertical gap (safe for ${203}px max jump)`);
        
        return true;
      }
    }
    
    return false;
  }

  private ensureSeamCoveragePhysicsCorrect(
    bandTopWorldY: number,
    bandBottomWorldY: number,
    placedPlatforms: Array<{x: number, y: number, width: number, height: number}>
  ): void {
    const seamZoneTop = bandTopWorldY;
    const seamZoneBottom = bandTopWorldY + 80; // Larger seam zone for better coverage
    
    const hasSeamCoverage = placedPlatforms.some(p => 
      p.y >= seamZoneTop && p.y <= seamZoneBottom
    );
    
    if (!hasSeamCoverage) {
      const fallbackType = 'platform-grass-3-final'; // Use wide platform for seam
      const width = prefabWidthPx(this.mapName, fallbackType, this.scale);
      const height = prefabHeightPx(this.mapName, fallbackType, this.scale);
      
      for (let attempt = 0; attempt < 20; attempt++) {
        const worldX = this.getValidXPosition(fallbackType, width);
        const worldY = seamZoneTop + Math.random() * (seamZoneBottom - seamZoneTop - height);
        
        if (this.isPositionClearForPlacement(worldX, worldY, width, height, placedPlatforms)) {
          const platform = this.createPlatform(fallbackType, worldX, worldY, 'platform');
          this.platforms.set(platform.id, platform);
          console.log(`[PlatformManager] Seam coverage platform placed at ${this.floorWorldY - worldY}px above floor`);
          break;
        }
      }
    }
  }

  private generateDifficultySequence(count: number, distribution: any): string[] {
    const sequence: string[] = [];
    
    // Calculate counts for each difficulty
    const easyCount = Math.round(count * distribution.easy);
    const mediumCount = Math.round(count * distribution.medium);
    const hardCount = Math.round(count * distribution.hard);
    const screenWrapCount = Math.round(count * distribution.screenWrap);
    
    // Fill sequence
    for (let i = 0; i < easyCount; i++) sequence.push('easy');
    for (let i = 0; i < mediumCount; i++) sequence.push('medium');
    for (let i = 0; i < hardCount; i++) sequence.push('hard');
    for (let i = 0; i < screenWrapCount; i++) sequence.push('screenWrap');
    
    // Shuffle for variety, but ensure first platform is easy/medium
    const shuffled = this.shuffleArray(sequence);
    
    // Ensure first jump is not too hard
    if (shuffled[0] === 'hard' || shuffled[0] === 'screenWrap') {
      const easyIndex = shuffled.findIndex(d => d === 'easy' || d === 'medium');
      if (easyIndex > 0) {
        [shuffled[0], shuffled[easyIndex]] = [shuffled[easyIndex], shuffled[0]];
      }
    }
    
    return shuffled;
  }

  private pickPlatformTypeForDifficulty(difficulty: string): string {
    // Exclude wood-2 platforms from regular selection
    const regularPlatforms = this.config.platformTypes.filter(([type]) => 
      type !== 'platform-wood-2-left-final' && type !== 'platform-wood-2-right-final'
    );
    
    switch (difficulty) {
      case 'easy':
        // Prefer wider platforms for easy jumps
        return this.weightedPick([
          ['platform-grass-3-final', 4],
          ['platform-wood-3-final', 3],
          ['platform-grass-1-final', 2],
          ['platform-wood-1-final', 1],
        ]);
      
      case 'medium':
        // Mix of platform sizes (excluding wood-2 platforms)
        return this.weightedPick(regularPlatforms);
      
      case 'hard':
      case 'screenWrap':
        // Prefer smaller platforms for challenge
        return this.weightedPick([
          ['platform-wood-1-final', 4],
          ['platform-grass-1-final', 3],
          ['platform-grass-3-final', 2],
          ['platform-wood-3-final', 1],
        ]);
      
      default:
        return this.weightedPick(regularPlatforms)[0];
    }
  }

  private placePlatformWithDifficulty(
    platformType: string,
    difficulty: string,
    bandTopWorldY: number,
    bandBottomWorldY: number,
    placedPlatforms: Array<{x: number, y: number, width: number, height: number, difficulty: string}>,
    isFirst: boolean
  ): boolean {
    const width = prefabWidthPx(this.mapName, platformType, this.scale);
    const height = prefabHeightPx(this.mapName, platformType, this.scale);
    
    // Get reference platform (last placed platform for positioning)
    const referencePlatform = placedPlatforms[placedPlatforms.length - 1];
    
    for (let attempt = 0; attempt < 100; attempt++) {
      let worldX: number;
      let worldY: number;
      
      if (isFirst || !referencePlatform) {
        // First platform or no reference - place anywhere reasonable
        worldX = this.getValidXPosition(platformType, width);
        worldY = this.getRandomYInBand(bandTopWorldY, bandBottomWorldY, height);
      } else {
        // Position relative to reference platform based on difficulty
        const positioned = this.positionRelativeToPlatform(
          referencePlatform,
          width,
          height,
          difficulty,
          bandTopWorldY,
          bandBottomWorldY
        );
        
        if (!positioned) continue;
        worldX = positioned.x;
        worldY = positioned.y;
      }
      
      // Check collision with existing platforms
      if (this.isPositionClearForPlacement(worldX, worldY, width, height, placedPlatforms)) {
        // Create and place platform
        const platform = this.createPlatform(platformType, worldX, worldY, 'platform');
        this.platforms.set(platform.id, platform);
        this.generateDecorationsFor(platform);
        
        // Add to tracking
        placedPlatforms.push({
          x: worldX,
          y: worldY,
          width,
          height,
          difficulty
        });
        
        return true;
      }
    }
    
    return false;
  }

  private positionRelativeToPlatform(
    referencePlatform: {x: number, y: number, width: number, height: number},
    newWidth: number,
    newHeight: number,
    difficulty: string,
    bandTopWorldY: number,
    bandBottomWorldY: number
  ): {x: number, y: number} | null {
    
    const MAX_JUMP_HEIGHT = 200;
    const MAX_JUMP_DISTANCE = 220;
    const EASY_JUMP_DISTANCE = 120;
    const HARD_JUMP_DISTANCE = 180;
    const SCREEN_WRAP_THRESHOLD = 280;
    
    // Calculate reference platform's right edge and center Y
    const refRightX = referencePlatform.x + referencePlatform.width;
    const refCenterY = referencePlatform.y;
    
    let targetDistance: number;
    let heightVariation: number;
    
    switch (difficulty) {
      case 'easy':
        targetDistance = 60 + Math.random() * (EASY_JUMP_DISTANCE - 60);
        heightVariation = Math.random() * 60 - 30; // ±30px height variation (reduced)
        break;
        
      case 'medium':
        targetDistance = EASY_JUMP_DISTANCE + Math.random() * (HARD_JUMP_DISTANCE - EASY_JUMP_DISTANCE);
        heightVariation = Math.random() * 100 - 50; // ±50px height variation
        break;
        
      case 'hard':
        targetDistance = HARD_JUMP_DISTANCE + Math.random() * (MAX_JUMP_DISTANCE - HARD_JUMP_DISTANCE);
        heightVariation = Math.random() * 140 - 70; // ±70px height variation
        break;
        
      case 'screenWrap':
        // Force screen wrap by making gap too wide
        targetDistance = SCREEN_WRAP_THRESHOLD + Math.random() * 80;
        heightVariation = Math.random() * 120 - 60; // ±60px height variation
        break;
        
      default:
        targetDistance = EASY_JUMP_DISTANCE;
        heightVariation = 0;
    }
    
    // Calculate target position
    let targetX = refRightX + targetDistance;
    let targetY = refCenterY + heightVariation;
    
    // Handle screen wrapping for impossible jumps
    if (targetX + newWidth > SCREEN_W + 50) {
      // Wrap to left side of screen
      targetX = targetX - SCREEN_W - 100; // Add extra offset for clean wrap
      
      // Ensure we don't overlap with reference platform after wrapping
      if (targetX + newWidth > referencePlatform.x - 40) {
        targetX = referencePlatform.x - newWidth - 60;
      }
    }
    
    // Clamp Y to band boundaries with proper margins
    const margin = 25;
    targetY = Math.max(bandTopWorldY + margin, Math.min(bandBottomWorldY - newHeight - margin, targetY));
    
    // Ensure minimum distance from reference platform
    if (Math.abs(targetX - referencePlatform.x) < 40 && Math.abs(targetY - referencePlatform.y) < 40) {
      return null; // Too close, try again
    }
    
    return { x: targetX, y: targetY };
  }

  private placePairedPlatforms(
    bandTopWorldY: number,
    bandBottomWorldY: number,
    placedPlatforms: Array<{x: number, y: number, width: number, height: number, difficulty: string}>
  ): boolean {
        const leftWidth = prefabWidthPx(this.mapName, 'platform-wood-2-left-final', this.scale);
        const rightWidth = prefabWidthPx(this.mapName, 'platform-wood-2-right-final', this.scale);
        const height = prefabHeightPx(this.mapName, 'platform-wood-2-left-final', this.scale);
        
    // Calculate valid Y range for both platforms
    const margin = 30;
    const minY = bandTopWorldY + margin;
    const maxY = bandBottomWorldY - height - margin;
    
    if (maxY <= minY) return false; // Band too small
    
    for (let attempt = 0; attempt < 30; attempt++) {
      // Left platform - FLUSH to left edge (x = 0)
          const leftX = 0;
      const leftY = minY + Math.random() * (maxY - minY);
      
      // Right platform - FLUSH to right edge
      const rightX = SCREEN_W - rightWidth;
      
      // Right platform positioned 50px above left platform (as requested)
      const rightY = leftY - 50;
      
      // Ensure right platform is still within band boundaries
      if (rightY < minY) {
        continue; // Try again with different positioning
      }
      
      // Check if positions are clear
      if (this.isPositionClearForPlacement(leftX, leftY, leftWidth, height, placedPlatforms) &&
          this.isPositionClearForPlacement(rightX, rightY, rightWidth, height, placedPlatforms)) {
            
            // Create both platforms
            const leftPlatform = this.createPlatform('platform-wood-2-left-final', leftX, leftY, 'platform');
            const rightPlatform = this.createPlatform('platform-wood-2-right-final', rightX, rightY, 'platform');
            
            this.platforms.set(leftPlatform.id, leftPlatform);
            this.platforms.set(rightPlatform.id, rightPlatform);
            
            this.generateDecorationsFor(leftPlatform);
            this.generateDecorationsFor(rightPlatform);
            
        // Add to tracking
        placedPlatforms.push({
          x: leftX, y: leftY, width: leftWidth, height, difficulty: 'paired-left'
        });
        placedPlatforms.push({
          x: rightX, y: rightY, width: rightWidth, height, difficulty: 'paired-right'
        });
        
        return true;
      }
    }
    
    return false;
  }

  private getRandomYInBand(bandTopWorldY: number, bandBottomWorldY: number, platformHeight: number): number {
    const margin = 20;
    const minY = bandTopWorldY + margin;
    const maxY = bandBottomWorldY - platformHeight - margin;
    
    return minY + Math.random() * Math.max(1, maxY - minY);
  }

  private isPositionClearForPlacement(
    worldX: number, 
    worldY: number, 
    width: number, 
    height: number, 
    placedPlatforms: Array<{x: number, y: number, width: number, height: number}>
  ): boolean {
    const margin = 30; // Reduced margin for denser placement
    
    // Check against existing platforms
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
    
    // Check against placed platforms in this batch
    for (const platform of placedPlatforms) {
      if (!(worldX + width + margin < platform.x || 
            platform.x + platform.width + margin < worldX || 
            worldY + height + margin < platform.y || 
            platform.y + platform.height + margin < worldY)) {
        return false;
      }
    }
    
    return true;
  }

  private ensureSeamCoverage(
    bandTopWorldY: number,
    bandBottomWorldY: number,
    placedPlatforms: Array<{x: number, y: number, width: number, height: number}>
  ): void {
    const seamZoneTop = bandTopWorldY;
    const seamZoneBottom = bandTopWorldY + 50; // 50px seam zone
    
    // Check if we have coverage in the seam zone
    const hasSeamCoverage = placedPlatforms.some(p => 
      p.y >= seamZoneTop && p.y <= seamZoneBottom
    );
    
    if (!hasSeamCoverage) {
      // Place a small platform in the seam zone
      const fallbackType = 'platform-wood-1-final';
      const width = prefabWidthPx(this.mapName, fallbackType, this.scale);
        const height = prefabHeightPx(this.mapName, fallbackType, this.scale);

        for (let attempt = 0; attempt < 20; attempt++) {
          const worldX = this.getValidXPosition(fallbackType, width);
        const worldY = seamZoneTop + Math.random() * (seamZoneBottom - seamZoneTop - height);
        
        if (this.isPositionClearForPlacement(worldX, worldY, width, height, placedPlatforms)) {
            const platform = this.createPlatform(fallbackType, worldX, worldY, 'platform');
            this.platforms.set(platform.id, platform);
            break;
          }
        }
      }
  }

  // Helper utility methods
  private weightedPick(choices: Array<[string, number]>): string {
    const totalWeight = choices.reduce((sum, [, weight]) => sum + weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const [choice, weight] of choices) {
      random -= weight;
      if (random <= 0) return choice;
    }
    
    return choices[0][0];
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
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
        // FIXED: Use physics-correct band height here too
        const MAX_JUMP_HEIGHT = 203;
        const SAFE_BAND_HEIGHT = MAX_JUMP_HEIGHT * 1.5; // 300px
        const BAND_GAP = 50;
        
        const bandBottomWorldY = this.generatedMinWorldY + BAND_GAP;
        const bandTopWorldY = bandBottomWorldY - SAFE_BAND_HEIGHT;
        
        console.log(`[PlatformManager] Dynamic band generation: ${bandTopWorldY} to ${bandBottomWorldY} (height: ${SAFE_BAND_HEIGHT}px)`);
        
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