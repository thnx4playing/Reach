// src/systems/platform/PlatformManager.ts
// v6 - Improved memory management + uses centralized physics config
// 
// KEY CHANGES FROM v5:
// - Uses physics.ts for constants instead of local PHYSICS object
// - Better memory cleanup with enforced max platform count
// - Fixed totalPlatforms counter sync issues
// - Improved spatial index cleanup

import { 
  prefabWidthPx, 
  prefabHeightPx, 
  prefabTopSolidSegmentsPx, 
  getTileSize, 
  alignPrefabYToSurfaceTop 
} from '../../content/maps';
import type { MapName } from '../../content/maps';
import type { PlatformDef } from './types';
import { SCREEN, TOWER_PHYSICS, SHARED, calculateMaxJumpHeight } from '../../config/physics';
import { log } from '../../utils/logger';

const SCREEN_W = SCREEN.WIDTH;
const SCREEN_H = SCREEN.HEIGHT;

// ============================================================================
// PHYSICS (now derived from centralized config)
// ============================================================================
const PHYSICS = {
  gravity: TOWER_PHYSICS.GRAVITY,
  jumpVel: TOWER_PHYSICS.JUMP_VELOCITY,
  maxRunSpeed: TOWER_PHYSICS.RUN_SPEED,
  margin: 0.08,
};

// ============================================================================
// PREFABS
// ============================================================================
const PREF_LEFT  = 'platform-wood-2-left-final'  as const;
const PREF_RIGHT = 'platform-wood-2-right-final' as const;
const FROZEN_PREF_LEFT  = 'platform-frozen-2-left-final'  as const;
const FROZEN_PREF_RIGHT = 'platform-frozen-2-right-final' as const;

const GRASS_PREFABS = ['platform-grass-1-final', 'platform-grass-3-final'] as const;
const WOOD_PREFABS  = ['platform-wood-1-final', 'platform-wood-3-final', 'platform-wood-2-left-final', 'platform-wood-2-right-final'] as const;
const FROZEN_PREFABS = ['platform-frozen-1-final', 'platform-frozen-3-final'] as const;
const FROZEN_WOOD_PREFABS = ['platform-frozen-wood-1-final', 'platform-frozen-2-left-final', 'platform-frozen-2-right-final'] as const;

// ============================================================================
// TUNING (now uses physics config values)
// ============================================================================
const AHEAD_SCREENS = TOWER_PHYSICS.GENERATION_AHEAD_SCREENS;
const MAX_ATTEMPTS  = 6;
const GRASS_WEIGHT  = 0.75;
const PAIR_CHANCE   = 0.08;
const VERT_PAIR_GAP = 100;

// Memory management
const MAX_PLATFORMS = 400;           // Hard cap on total platforms
const MAX_DECORATIONS = 200;         // Hard cap on decorations
const CLEANUP_INTERVAL_FRAMES = 180; // Cleanup every 3 seconds at 60fps
const SPATIAL_CLEANUP_THRESHOLD = 300;

// Decoration configuration
const DECORATION_CONFIG = {
  trees: {
    types: ['tree-large-final', 'tree-medium-final', 'tree-small-final'],
    probability: 0.4,
  },
  mushrooms: {
    types: ['mushroom-red-small-final', 'mushroom-green-small-final'],
    probability: 0.6,
    maxPerTile: 1,
  },
  grass: {
    types: ['grass-1-final', 'grass-2-final', 'grass-3-final', 'grass-4-final', 'grass-5-final', 'grass-6-final'],
    probability: 0.8,
    maxPerTile: 1,
  },
  frozen_trees: {
    types: ['tree-large-frozen-final', 'tree-medium-frozen-final', 'tree-small-frozen-final'],
    probability: 0.4,
  },
  ice: {
    types: ['ice-large-final', 'ice-medium-final', 'ice-small-final'],
    probability: 0.8,
    maxPerTile: 1,
  }
};

// ============================================================================
// RNG
// ============================================================================
type RNG = () => number;

function makeSeededRNG(seed: number): RNG {
  let x = (seed >>> 0) || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 0xFFFFFFFF;
  };
}

type Difficulty = 'E' | 'M' | 'H';

function refillBag(rng: RNG): Difficulty[] {
  const b: Difficulty[] = ['E', 'E', 'M', 'M', 'H'];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

// ============================================================================
// PHYSICS HELPERS (use centralized config)
// ============================================================================
function maxVerticalReach() {
  return calculateMaxJumpHeight(TOWER_PHYSICS);
}

function reachable(dx: number, dyUp: number) {
  const m = PHYSICS.margin;
  const g = PHYSICS.gravity;
  const v0 = PHYSICS.jumpVel;
  const vx = Math.max(1, PHYSICS.maxRunSpeed) * (1 - m);
  
  const disc = v0 * v0 - 2 * g * dyUp;
  if (disc <= 0) return false;
  
  const t = (v0 + Math.sqrt(disc)) / g;
  const dxMax = vx * t;
  return Math.abs(dx) <= dxMax * (1 - m);
}

// ============================================================================
// SPATIAL INDEX (improved with better cleanup)
// ============================================================================
class SpatialIndex {
  private grid = new Map<string, PlatformDef[]>();
  private cellSize = 200;
  private platformCount = 0;
  private highestPlayerY = 0;
  
  private getGridKey(x: number, y: number): string {
    const gridX = Math.floor(x / this.cellSize);
    const gridY = Math.floor(y / this.cellSize);
    return `${gridX},${gridY}`;
  }
  
  addPlatform(platform: PlatformDef) {
    const key = this.getGridKey(platform.x, platform.y);
    const cell = this.grid.get(key) || [];
    
    // Check for duplicates
    const existingIndex = cell.findIndex(p => p.id === platform.id);
    if (existingIndex === -1) {
      cell.push(platform);
      this.grid.set(key, cell);
      this.platformCount++;
      
      // Trigger cleanup when threshold exceeded
      if (this.platformCount > SPATIAL_CLEANUP_THRESHOLD) {
        this.cleanupOldCells();
      }
    }
  }
  
  removePlatform(platformId: string) {
    for (const [key, platforms] of this.grid.entries()) {
      const idx = platforms.findIndex(p => p.id === platformId);
      if (idx !== -1) {
        platforms.splice(idx, 1);
        this.platformCount--;
        if (platforms.length === 0) {
          this.grid.delete(key);
        }
        return true;
      }
    }
    return false;
  }
  
  private cleanupOldCells() {
    const keysToRemove: string[] = [];
    let removedCount = 0;
    const currentPlayerY = this.highestPlayerY || 0;
    
    for (const [key, platforms] of this.grid.entries()) {
      const [, gridY] = key.split(',').map(Number);
      const cellWorldY = gridY * this.cellSize;
      
      // Remove cells more than 2.5 screen heights below player
      const shouldRemove = cellWorldY > currentPlayerY + (SCREEN_H * 2.5) ||
        platforms.every(p => p.fadeOut && (p.fadeOut.opacity ?? 1) < 0.1);
      
      if (shouldRemove) {
        keysToRemove.push(key);
        removedCount += platforms.length;
      }
    }
    
    keysToRemove.forEach(key => this.grid.delete(key));
    this.platformCount -= removedCount;
    
    if (removedCount > 0) {
      log.memory(`Spatial cleanup: removed ${removedCount} platforms from ${keysToRemove.length} cells`);
    }
  }
  
  getPlatformsNear(x: number, y: number, radius: number): PlatformDef[] {
    const platforms: PlatformDef[] = [];
    const cellsToCheck = Math.ceil(radius / this.cellSize);
    
    for (let dx = -cellsToCheck; dx <= cellsToCheck; dx++) {
      for (let dy = -cellsToCheck; dy <= cellsToCheck; dy++) {
        const checkX = x + dx * this.cellSize;
        const checkY = y + dy * this.cellSize;
        const key = this.getGridKey(checkX, checkY);
        const cell = this.grid.get(key);
        if (cell) {
          platforms.push(...cell);
        }
      }
    }
    
    return platforms;
  }
  
  updatePlayerY(playerY: number) {
    this.highestPlayerY = Math.min(this.highestPlayerY || playerY, playerY);
  }
  
  clear() {
    this.grid.clear();
    this.platformCount = 0;
  }
  
  reset() {
    this.clear();
    this.highestPlayerY = 0;
  }
  
  getStats() {
    return {
      totalCells: this.grid.size,
      totalPlatforms: this.platformCount,
      avgPlatformsPerCell: this.platformCount / Math.max(1, this.grid.size),
    };
  }
  
  // Rebuild from platform array (for sync after cleanup)
  rebuild(platforms: PlatformDef[]) {
    this.clear();
    for (const p of platforms) {
      this.addPlatform(p);
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function pickDy(diff: Difficulty, rng: RNG) {
  const H = maxVerticalReach();
  const r = { E: [0.28, 0.45], M: [0.45, 0.62], H: [0.62, 0.80] }[diff];
  return (r[0] + (r[1] - r[0]) * rng()) * H;
}

function sampleTargetX(rng: RNG) {
  const r = rng();
  let f: number;
  if (r < 0.60) {
    f = 0.30 + (0.70 - 0.30) * rng();
  } else if (r < 0.80) {
    f = 0.05 + (0.30 - 0.05) * rng();
  } else {
    f = 0.70 + (0.95 - 0.70) * rng();
  }
  return f * SCREEN_W;
}

function weightedPrefab(rng: RNG, mapName: MapName) {
  if (mapName === 'frozen') {
    if (rng() < GRASS_WEIGHT) {
      return FROZEN_PREFABS[Math.floor(rng() * FROZEN_PREFABS.length)];
    }
    return FROZEN_WOOD_PREFABS[Math.floor(rng() * FROZEN_WOOD_PREFABS.length)];
  } else {
    if (rng() < GRASS_WEIGHT) {
      return GRASS_PREFABS[Math.floor(rng() * GRASS_PREFABS.length)];
    }
    return WOOD_PREFABS[Math.floor(rng() * WOOD_PREFABS.length)];
  }
}

function getLeftPrefab(mapName: MapName) {
  return mapName === 'frozen' ? FROZEN_PREF_LEFT : PREF_LEFT;
}

function getRightPrefab(mapName: MapName) {
  return mapName === 'frozen' ? FROZEN_PREF_RIGHT : PREF_RIGHT;
}

function bounds(map: MapName, p: PlatformDef, scale: number) {
  const w = prefabWidthPx(map, p.prefab, scale);
  const h = prefabHeightPx(map, p.prefab, scale);
  return { x: p.x, y: p.y, w, h };
}

// ============================================================================
// MAIN CLASS
// ============================================================================
export class EnhancedPlatformManager {
  private map: MapName;
  private scale: number;
  private rng: RNG;
  private bag: Difficulty[] = [];
  private instanceId: string;
  private nextId = 1;
  private platforms: PlatformDef[] = [];
  private topMostY: number;
  private deathFloor: PlatformDef | null = null;
  private highestPlayerY = 0;
  
  // Tracking
  private bandsGeneratedAtCurrentLevel = 0;
  private playerHighestY: number | undefined;
  private totalPlatformsCulled = 0;
  private totalDecorationsCulled = 0;
  private platformsFadedThisFrame = 0;
  private platformsPrunedThisFrame = 0;
  
  // Performance
  private fading = new Set<string>();
  private sawDup = false;
  private initialCameraY: number | null = null;
  private startupProtectVisible = true;
  private reachabilityCache = new Map<string, boolean>();
  private maxCacheSize = 1000;
  private spatialIndex = new SpatialIndex();
  private frameCounter = 0;
  private lastCleanupHeight = 0;
  
  // Startup protection
  private static readonly STARTUP_PROTECT_EXTRA_BELOW = SCREEN_H * 0.9;
  private static readonly STARTUP_PROTECT_EXTRA_ABOVE = 0;

  constructor(mapName: MapName, floorTopY: number, scale = 2) {
    this.map = mapName;
    this.scale = scale;
    
    this.instanceId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const d = new Date();
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    this.rng = makeSeededRNG(seed);
    this.bag = refillBag(this.rng);
    this.topMostY = floorTopY;

    this.seedStarter(floorTopY);
    
    log.platforms(`PlatformManager initialized for ${mapName}, seed: ${seed}`);
  }

  // ============================================================================
  // ID GENERATION
  // ============================================================================
  private generateUniqueId(): string {
    return `${this.instanceId}_${this.nextId++}`;
  }

  // ============================================================================
  // PLATFORM CREATION
  // ============================================================================
  private makePlatformFromPrefab(prefab: string, x: number, y: number): PlatformDef {
    const id = this.generateUniqueId();
    const col = this.col(prefab, x, y);

    const p: PlatformDef = {
      id,
      type: 'platform',
      prefab,
      x,
      y,
      scale: this.scale,
      collision: col,
    };

    this.platforms.push(p);
    this.spatialIndex.addPlatform(p);
    this.generateDecorationsFor(p);
    this.topMostY = Math.min(this.topMostY, p.y);

    return p;
  }

  private seedStarter(floorTopY: number) {
    const H = maxVerticalReach();
    const dy = 0.34 * H;

    const prefab = this.map === 'frozen' ? 'platform-frozen-3-final' : 'platform-grass-3-final';
    const w = prefabWidthPx(this.map, prefab, this.scale);
    const xCenter = SCREEN_W * 0.5;
    const yTop = Math.round(floorTopY - dy);
    const xLeft = Math.round(xCenter - w / 2);

    this.makePlatformFromPrefab(prefab, xLeft, yTop);
  }

  private col(prefab: string, x: number, yTop: number): PlatformDef['collision'] {
    const segs = prefabTopSolidSegmentsPx(this.map, prefab, this.scale);
    const w = prefabWidthPx(this.map, prefab, this.scale);
    const h = prefabHeightPx(this.map, prefab, this.scale);
    
    if (!segs.length) {
      return { solid: true, topY: yTop, left: x, right: x + w, width: w, height: h };
    }
    
    const topY = yTop + Math.min(...segs.map(s => s.y));
    return { solid: true, topY, left: x, right: x + w, width: w, height: h };
  }

  // ============================================================================
  // DECORATION GENERATION
  // ============================================================================
  private generateDecorationsFor(platform: PlatformDef): void {
    if (!platform.collision?.solid) return;
    
    const isGrass3 = platform.prefab === 'platform-grass-3-final';
    const isGrass1 = platform.prefab === 'platform-grass-1-final';
    const isFrozen3 = platform.prefab === 'platform-frozen-3-final';
    const isFrozen1 = platform.prefab === 'platform-frozen-1-final';
    
    if (this.map === 'grassy' && !isGrass3 && !isGrass1) return;
    if (this.map === 'frozen' && !isFrozen3 && !isFrozen1) return;
    
    // Check decoration count limit
    const currentDecorations = this.platforms.filter(p => p.type === 'decoration').length;
    if (currentDecorations >= MAX_DECORATIONS) return;
    
    const segments = prefabTopSolidSegmentsPx(this.map, platform.prefab, this.scale);
    const segment = segments[0];
    if (!segment) return;
    
    const surfaceWorldY = platform.collision.topY;
    const tileSize = getTileSize(this.map) * this.scale;
    const numTiles = Math.floor(segment.w / tileSize);
    const occupiedTiles = new Set<number>();
    
    // Trees (on 3-tile platforms)
    const isThreeTile = isGrass3 || isFrozen3;
    const treeConfig = this.map === 'frozen' ? DECORATION_CONFIG.frozen_trees : DECORATION_CONFIG.trees;
    
    if (isThreeTile && treeConfig && this.rng() < treeConfig.probability) {
      const availableTiles = Array.from({ length: numTiles }, (_, i) => i)
        .filter(tileIndex => !occupiedTiles.has(tileIndex));
      
      if (availableTiles.length > 0) {
        const tileIndex = availableTiles[Math.floor(this.rng() * availableTiles.length)];
        const treeType = treeConfig.types[Math.floor(this.rng() * treeConfig.types.length)];
        
        const treeWidth = prefabWidthPx(this.map, treeType, this.scale);
        if (treeWidth <= tileSize) {
          const treeWorldX = platform.x + segment.x + (tileIndex * tileSize);
          const treeWorldY = alignPrefabYToSurfaceTop(this.map, treeType, surfaceWorldY, this.scale);
          
          const tree: PlatformDef = {
            id: this.generateUniqueId(),
            type: 'decoration',
            prefab: treeType,
            x: Math.round(treeWorldX),
            y: Math.round(treeWorldY),
            scale: this.scale,
          };
          this.platforms.push(tree);
          this.spatialIndex.addPlatform(tree);
          occupiedTiles.add(tileIndex);
        }
      }
    }
    
    // Mushrooms/Ice
    const decorationConfig = this.map === 'frozen' ? DECORATION_CONFIG.ice : DECORATION_CONFIG.mushrooms;
    if (decorationConfig && this.rng() < decorationConfig.probability) {
      const availableTiles = Array.from({ length: numTiles }, (_, i) => i)
        .filter(tileIndex => !occupiedTiles.has(tileIndex));
      
      if (availableTiles.length > 0) {
        const tileIndex = availableTiles[Math.floor(this.rng() * availableTiles.length)];
        const decorationType = decorationConfig.types[Math.floor(this.rng() * decorationConfig.types.length)];
        
        const decorationWorldX = platform.x + segment.x + (tileIndex * tileSize);
        const decorationWorldY = alignPrefabYToSurfaceTop(this.map, decorationType, surfaceWorldY, this.scale);
        
        const decoration: PlatformDef = {
          id: this.generateUniqueId(),
          type: 'decoration',
          prefab: decorationType,
          x: Math.round(decorationWorldX),
          y: Math.round(decorationWorldY),
          scale: this.scale,
        };
        this.platforms.push(decoration);
        this.spatialIndex.addPlatform(decoration);
        occupiedTiles.add(tileIndex);
      }
    }
    
    // Grass tufts (grassy map only)
    if (this.map === 'grassy' && DECORATION_CONFIG.grass) {
      const grassConfig = DECORATION_CONFIG.grass;
      const maxGrass = isGrass3 ? 3 : isGrass1 ? 1 : 0;
      
      for (let i = 0; i < maxGrass; i++) {
        if (this.rng() < grassConfig.probability) {
          const availableTiles = Array.from({ length: numTiles }, (_, i) => i)
            .filter(tileIndex => !occupiedTiles.has(tileIndex));
          
          if (availableTiles.length > 0) {
            const tileIndex = availableTiles[Math.floor(this.rng() * availableTiles.length)];
            const grassType = grassConfig.types[Math.floor(this.rng() * grassConfig.types.length)];
            
            const grassWorldX = platform.x + segment.x + (tileIndex * tileSize);
            const grassWorldY = alignPrefabYToSurfaceTop(this.map, grassType, surfaceWorldY, this.scale);
            
            const grass: PlatformDef = {
              id: this.generateUniqueId(),
              type: 'decoration',
              prefab: grassType,
              x: Math.round(grassWorldX),
              y: Math.round(grassWorldY),
              scale: this.scale,
            };
            this.platforms.push(grass);
            this.spatialIndex.addPlatform(grass);
            occupiedTiles.add(tileIndex);
          }
        }
      }
    }
  }

  // ============================================================================
  // GENERATION
  // ============================================================================
  private highest(): { xCenter: number; yTop: number } | null {
    if (!this.platforms.length) return null;
    const top = this.platforms.reduce((a, b) => a.y < b.y ? a : b);
    const w = prefabWidthPx(this.map, top.prefab, this.scale);
    return { xCenter: top.x + w / 2, yTop: top.y };
  }

  private placeAbsolute(prefab: string, xLeft: number, yTop: number) {
    const w = prefabWidthPx(this.map, prefab, this.scale);
    const p: PlatformDef = {
      id: this.generateUniqueId(),
      type: 'platform',
      prefab,
      x: Math.round(xLeft),
      y: Math.round(yTop),
      scale: this.scale,
      collision: this.col(prefab, Math.round(xLeft), Math.round(yTop)),
    };
    
    this.platforms.push(p);
    this.topMostY = Math.min(this.topMostY, p.y);
    this.spatialIndex.addPlatform(p);
    this.generateDecorationsFor(p);
    
    return { xCenter: p.x + w / 2, yTop: p.y };
  }

  private placeRelative(prefab: string, fromX: number, fromY: number, dx: number, dy: number) {
    if (prefab === getLeftPrefab(this.map)) {
      return this.placeAbsolute(prefab, 0, fromY - dy);
    }
    if (prefab === getRightPrefab(this.map)) {
      const w = prefabWidthPx(this.map, prefab, this.scale);
      return this.placeAbsolute(prefab, SCREEN_W - w, fromY - dy);
    }
    const xCenter = (fromX + dx + SCREEN_W) % SCREEN_W;
    const yTop = fromY - dy;
    const w = prefabWidthPx(this.map, prefab, this.scale);
    return this.placeAbsolute(prefab, Math.round(xCenter - w / 2), yTop);
  }

  private tryEdgePair(fromX: number, fromY: number, dyBase: number): boolean {
    const leftW = prefabWidthPx(this.map, getLeftPrefab(this.map), this.scale);
    const rightW = prefabWidthPx(this.map, getRightPrefab(this.map), this.scale);
    const leftC = leftW / 2;
    const rightC = SCREEN_W - rightW / 2;
    const H = maxVerticalReach();
    const dy1 = Math.min(dyBase, 0.45 * H);
    const order = fromX < SCREEN_W * 0.5 ? ['left', 'right'] : ['right', 'left'];
    
    for (const which of order) {
      const target = which === 'left' ? leftC : rightC;
      const dx = target - fromX;
      if (!reachable(dx, dy1)) continue;
      
      if (which === 'left') {
        this.placeAbsolute(getLeftPrefab(this.map), 0, fromY - dy1);
        this.placeAbsolute(getRightPrefab(this.map), SCREEN_W - rightW, (fromY - dy1) - VERT_PAIR_GAP);
      } else {
        this.placeAbsolute(getRightPrefab(this.map), SCREEN_W - rightW, fromY - dy1);
        this.placeAbsolute(getLeftPrefab(this.map), 0, (fromY - dy1) - VERT_PAIR_GAP);
      }
      return true;
    }
    return false;
  }

  private cachedReachable(dx: number, dyUp: number): boolean {
    const keyDx = Math.round(dx / 5) * 5;
    const keyDy = Math.round(dyUp / 5) * 5;
    const key = `${keyDx},${keyDy}`;
    
    if (this.reachabilityCache.has(key)) {
      return this.reachabilityCache.get(key)!;
    }
    
    const result = reachable(dx, dyUp);
    
    if (this.reachabilityCache.size >= this.maxCacheSize) {
      const entries = Array.from(this.reachabilityCache.entries());
      const keepCount = Math.floor(this.maxCacheSize * 0.5);
      this.reachabilityCache.clear();
      entries.slice(-keepCount).forEach(([k, v]) => {
        this.reachabilityCache.set(k, v);
      });
    }
    
    this.reachabilityCache.set(key, result);
    return result;
  }

  private generateBatch(targetY: number, batchSize = 5): boolean {
    let generated = 0;
    let from = this.highest();
    if (!from) return false;
    
    while (this.topMostY > targetY && generated < batchSize) {
      const diff = (this.bag.length ? this.bag : (this.bag = refillBag(this.rng))).pop() as Difficulty;
      const dy = pickDy(diff, this.rng);
      
      if (this.rng() < PAIR_CHANCE) {
        if (this.tryEdgePair(from.xCenter, from.yTop, dy)) {
          const rightW = prefabWidthPx(this.map, getRightPrefab(this.map), this.scale);
          from = { xCenter: SCREEN_W - rightW / 2, yTop: Math.min(...this.platforms.slice(-2).map(p => p.y)) };
          generated++;
          continue;
        }
      }
      
      const prefab = weightedPrefab(this.rng, this.map);
      const targetX = (prefab === getLeftPrefab(this.map)) ? (prefabWidthPx(this.map, getLeftPrefab(this.map), this.scale) / 2)
        : (prefab === getRightPrefab(this.map)) ? (SCREEN_W - prefabWidthPx(this.map, getRightPrefab(this.map), this.scale) / 2)
        : sampleTargetX(this.rng);
      const dx = targetX - from.xCenter;
      
      if (this.cachedReachable(dx, dy)) {
        from = this.placeRelative(prefab, from.xCenter, from.yTop, dx, dy);
        generated++;
      } else {
        const fallbackPrefab = this.map === 'frozen' ? 'platform-frozen-1-final' : 'platform-grass-1-final';
        from = this.placeRelative(fallbackPrefab, from.xCenter, from.yTop, 0, 0.35 * maxVerticalReach());
        generated++;
      }
    }
    
    return generated > 0;
  }

  private generateAhead(cameraTopY: number): boolean {
    return this.generateBatch(cameraTopY - AHEAD_SCREENS * SCREEN_H);
  }

  // ============================================================================
  // MEMORY MANAGEMENT (improved)
  // ============================================================================
  private enforceMaxPlatforms() {
    const platforms = this.platforms.filter(p => p.type === 'platform');
    const decorations = this.platforms.filter(p => p.type === 'decoration');
    
    let changed = false;
    
    // Enforce platform limit
    if (platforms.length > MAX_PLATFORMS) {
      // Sort by Y (keep highest = smallest Y values)
      platforms.sort((a, b) => a.y - b.y);
      const toRemove = platforms.slice(MAX_PLATFORMS);
      
      for (const p of toRemove) {
        const idx = this.platforms.indexOf(p);
        if (idx !== -1) {
          this.platforms.splice(idx, 1);
          this.totalPlatformsCulled++;
        }
      }
      
      log.memory(`Enforced platform limit: removed ${toRemove.length} platforms`);
      changed = true;
    }
    
    // Enforce decoration limit
    if (decorations.length > MAX_DECORATIONS) {
      decorations.sort((a, b) => a.y - b.y);
      const toRemove = decorations.slice(MAX_DECORATIONS);
      
      for (const d of toRemove) {
        const idx = this.platforms.indexOf(d);
        if (idx !== -1) {
          this.platforms.splice(idx, 1);
          this.totalDecorationsCulled++;
        }
      }
      
      log.memory(`Enforced decoration limit: removed ${toRemove.length} decorations`);
      changed = true;
    }
    
    if (changed) {
      this.spatialIndex.rebuild(this.platforms);
    }
  }

  private performAggressiveCleanup(playerY: number) {
    const beforeCount = this.platforms.length;
    const cleanupThreshold = playerY + SCREEN_H * 3;
    
    this.platforms = this.platforms.filter(platform => {
      // Always keep death floor
      if (this.isDeathFloor(platform)) return true;
      
      // Decorations clean up faster
      if (platform.type === 'decoration') {
        return platform.y < cleanupThreshold ||
          (platform.fadeOut && (platform.fadeOut.opacity ?? 1) > 0.5);
      }
      
      return platform.y < cleanupThreshold ||
        (platform.fadeOut && (platform.fadeOut.opacity ?? 1) > 0.5);
    });
    
    const afterCount = this.platforms.length;
    const removed = beforeCount - afterCount;
    
    if (removed > 0) {
      this.spatialIndex.rebuild(this.platforms);
      log.memory(`Aggressive cleanup: removed ${removed} items`);
    }
  }

  private clampHistoryAround(playerY: number, cameraY: number) {
    const viewportTop = cameraY - SCREEN_H * 0.5;
    const viewportBottom = cameraY + SCREEN_H * 0.5;

    let clampTop = viewportTop - SCREEN_H * 1.5;
    let clampBottom = viewportBottom + SCREEN_H * 3.0;

    if (this.startupProtectVisible) {
      clampTop = viewportTop - SCREEN_H * 2.5;
      clampBottom = viewportBottom + SCREEN_H * 4.0;
    }

    const before = this.platforms.length;
    this.platforms = this.platforms.filter(p =>
      (p.y >= clampTop && p.y <= clampBottom) || this.isDeathFloor(p)
    );

    if (this.platforms.length !== before) {
      this.spatialIndex.rebuild(this.platforms);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  getAllPlatforms() {
    if (!__DEV__ && !this.sawDup) return this.platforms;
    
    const uniquePlatforms = new Map<string, PlatformDef>();
    for (const platform of this.platforms) {
      if (uniquePlatforms.has(platform.id)) {
        this.sawDup = true;
      }
      uniquePlatforms.set(platform.id, platform);
    }
    return Array.from(uniquePlatforms.values());
  }

  getSolidPlatforms() {
    return this.platforms.filter(p => p.collision?.solid);
  }

  getPlatformsNear(x: number, y: number, radius: number): PlatformDef[] {
    return this.spatialIndex.getPlatformsNear(x, y, radius);
  }

  getPlatformsNearPlayer(x: number, y: number, r: number, solidsOnly = true) {
    const nearbyPlatforms = this.spatialIndex.getPlatformsNear(x, y, r);
    const out: PlatformDef[] = [];
    const R = Math.max(8, r | 0);
    
    for (const p of nearbyPlatforms) {
      if (solidsOnly && !p.collision?.solid) continue;
      
      if (this.startupProtectVisible) {
        const b = bounds(this.map, p, this.scale);
        if (x >= b.x - R && x <= b.x + b.w + R && y >= b.y - R && y <= b.y + b.h + R) out.push(p);
        continue;
      }
      
      const isGhost = p.fadeOut ? (p.fadeOut.opacity ?? 1) < 0.05 : false;
      if (isGhost) continue;
      
      const b = bounds(this.map, p, this.scale);
      if (x >= b.x - R && x <= b.x + b.w + R && y >= b.y - R && y <= b.y + b.h + R) out.push(p);
    }
    return out;
  }

  getPlatformsInRect(topY: number, bottomY: number): PlatformDef[] {
    const out: PlatformDef[] = [];
    const seen = new Set<string>();
    
    for (const p of this.platforms) {
      if (seen.has(p.id)) continue;
      const pBottom = p.y + (p.collision?.height || 32);
      if (pBottom > topY && p.y < bottomY) {
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  }

  isDeathFloor(p: PlatformDef) {
    return this.deathFloor && p.id === this.deathFloor.id;
  }

  resetPlatforms() {
    this.spatialIndex.reset();
    this.platforms = [];
  }

  updateForCamera(newCameraY: number, opts: { force?: boolean; playerY?: number } = {}) {
    const { force = false, playerY = 0 } = opts;
    
    if (this.initialCameraY === null) this.initialCameraY = newCameraY;
    if (this.startupProtectVisible && Math.abs(newCameraY - this.initialCameraY) > 200) {
      this.startupProtectVisible = false;
    }
    
    if (!force) {
      this.frameCounter = (this.frameCounter + 1) % 100000;
      this.spatialIndex.updatePlayerY(playerY);
      
      // Periodic cache clearing
      if (this.frameCounter % 1000 === 0) {
        this.reachabilityCache.clear();
      }
      
      // Periodic cleanup
      if (this.frameCounter % CLEANUP_INTERVAL_FRAMES === 0) {
        this.enforceMaxPlatforms();
      }
    }

    const top = newCameraY - SCREEN_H * 0.5;
    const gen = this.generateAhead(top);
    
    // Height-based cleanup
    const currentHeight = Math.abs(playerY);
    if (currentHeight - this.lastCleanupHeight > SCREEN_H * 2) {
      this.performAggressiveCleanup(playerY);
      this.clampHistoryAround(playerY, newCameraY);
      this.lastCleanupHeight = currentHeight;
    }
    
    const culled = this.cullBelow(newCameraY);
    return gen || culled;
  }

  updateDeathFloor(playerWorldY: number) {
    if (this.highestPlayerY === 0 || playerWorldY < this.highestPlayerY) {
      this.highestPlayerY = playerWorldY;
    }
    
    const targetLavaY = this.highestPlayerY + SCREEN_H * TOWER_PHYSICS.LAVA_CHASE_DISTANCE_SCREENS;
    
    if (!this.deathFloor) {
      this.deathFloor = {
        id: this.generateUniqueId(),
        type: 'platform',
        prefab: 'floor-final',
        x: -SCREEN_W / 2,
        y: targetLavaY,
        scale: this.scale,
        collision: {
          solid: true,
          topY: targetLavaY + 40,
          left: -SCREEN_W / 2,
          right: SCREEN_W * 1.5,
          width: SCREEN_W * 2,
          height: 100,
        },
      };
    } else {
      this.deathFloor.y = targetLavaY;
      if (this.deathFloor.collision) {
        this.deathFloor.collision.topY = targetLavaY + 40;
      }
    }
  }

  getDeathFloor() {
    return this.deathFloor;
  }

  getLavaY() {
    return this.deathFloor?.y ?? 0;
  }

  updateHighestPointOnLanding(yTop: number) {
    if (!this.playerHighestY || yTop < this.playerHighestY) {
      this.playerHighestY = yTop;
      const progressScreens = Math.floor((this.topMostY - yTop) / (SCREEN_H * 0.5));
      if (progressScreens > this.bandsGeneratedAtCurrentLevel) {
        this.bandsGeneratedAtCurrentLevel = progressScreens;
      }
    }
  }

  updateFadeOutAnimations() {
    if (this.fading.size === 0) return false;

    const now = Date.now();
    let changed = false;
    const done: string[] = [];

    for (const id of this.fading) {
      const p = this.platforms.find(x => x.id === id);
      if (!p || !p.fadeOut) {
        done.push(id);
        continue;
      }

      const t = (now - p.fadeOut.startTime) / p.fadeOut.duration;
      const op = Math.max(0, 1 - t);
      
      if (op <= 0) {
        const idx = this.platforms.indexOf(p);
        if (idx >= 0) {
          if (p.type === 'platform') {
            this.totalPlatformsCulled++;
          } else {
            this.totalDecorationsCulled++;
          }
          this.platforms.splice(idx, 1);
        }
        done.push(id);
        changed = true;
      } else if (op !== p.fadeOut.opacity) {
        p.fadeOut.opacity = op;
        changed = true;
      }
    }

    for (const id of done) this.fading.delete(id);

    if (done.length) {
      this.spatialIndex.rebuild(this.platforms);
    }
    
    return changed;
  }

  private isStartupProtected(p: PlatformDef, camY: number): boolean {
    if (!this.startupProtectVisible) return false;

    const viewportTop = camY - SCREEN_H * 0.5;
    const viewportBottom = camY + SCREEN_H * 0.5;

    const pTop = p.y;
    const pHeight = p.collision?.height || 32;
    const pBottom = pTop + pHeight;

    const protectTop = viewportTop - EnhancedPlatformManager.STARTUP_PROTECT_EXTRA_ABOVE;
    const protectBottom = viewportBottom + EnhancedPlatformManager.STARTUP_PROTECT_EXTRA_BELOW;

    return pBottom > protectTop && pTop < protectBottom;
  }

  private cullBelow(cameraY: number) {
    const viewportBottom = cameraY + SCREEN_H * 0.5;
    const fadeStartY = viewportBottom + SCREEN_H * TOWER_PHYSICS.CULLING_FADE_START_SCREENS;
    const hardKillY = viewportBottom + SCREEN_H * TOWER_PHYSICS.CULLING_HARD_KILL_SCREENS;

    const keep: PlatformDef[] = [];
    let changed = false;
    this.platformsFadedThisFrame = 0;
    this.platformsPrunedThisFrame = 0;

    for (const p of this.platforms) {
      if (this.isStartupProtected(p, cameraY)) {
        if (p.fadeOut) {
          p.fadeOut = undefined;
          this.fading.delete(p.id);
          changed = true;
        }
        keep.push(p);
        continue;
      }

      if (p.y >= hardKillY) {
        this.fading.delete(p.id);
        this.platformsPrunedThisFrame++;
        if (p.type === 'platform') {
          this.totalPlatformsCulled++;
        } else {
          this.totalDecorationsCulled++;
        }
        changed = true;
        continue;
      }

      if (p.y >= fadeStartY) {
        if (!p.fadeOut) {
          p.fadeOut = { startTime: Date.now(), duration: 600, opacity: 1 };
          this.fading.add(p.id);
          this.platformsFadedThisFrame++;
          changed = true;
        }
      }

      keep.push(p);
    }

    if (keep.length !== this.platforms.length) {
      this.platforms = keep;
      this.spatialIndex.rebuild(this.platforms);
      changed = true;
    }

    return changed;
  }

  // ============================================================================
  // DEBUG
  // ============================================================================
  debugPlatformsNearY(_y: number, _r = 200) {}

  getCurrentChallenge() {
    const total = Math.max(1, Math.floor((this.topMostY - (this.deathFloor?.y ?? (this.topMostY + SCREEN_H))) / SCREEN_H));
    return {
      level: 'Mixed (E/M/H)',
      bandsAtLevel: this.bandsGeneratedAtCurrentLevel,
      totalBands: total,
    };
  }

  getPlatformStats() {
    const total = this.platforms.length;
    const platforms = this.platforms.filter(p => p.type === 'platform').length;
    const decorations = this.platforms.filter(p => p.type === 'decoration').length;
    const fading = this.platforms.filter(p => p.fadeOut).length;
    
    return { total, platforms, decorations, fading };
  }

  getCullingStats() {
    const currentPlatforms = this.platforms.filter(p => p.type === 'platform').length;
    const currentDecorations = this.platforms.filter(p => p.type === 'decoration').length;
    
    return {
      totalPlatforms: currentPlatforms,
      totalDecorations: currentDecorations,
      totalCulled: this.totalPlatformsCulled + this.totalDecorationsCulled,
      platformsCulled: this.totalPlatformsCulled,
      decorationsCulled: this.totalDecorationsCulled,
      fadedThisFrame: this.platformsFadedThisFrame,
      prunedThisFrame: this.platformsPrunedThisFrame,
    };
  }
}
