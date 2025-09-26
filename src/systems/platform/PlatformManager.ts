// src/systems/platform/PlatformManager.ts
// v5 - Ground band integration + no prefab floor + centered starter
// Preserves all previous fixes: lava system, culling stats, decorations, progress tracking

import { Dimensions } from 'react-native';
import { prefabWidthPx, prefabHeightPx, prefabTopSolidSegmentsPx, getTileSize, alignPrefabYToSurfaceTop } from '../../content/maps';
import type { MapName } from '../../content/maps';
import type { PlatformDef } from './types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Physics
const PHYSICS = { gravity: 1500, jumpVel: 780, maxRunSpeed: 220, margin: 0.08 };

// Prefabs
const PREF_LEFT  = 'platform-wood-2-left-final'  as const;
const PREF_RIGHT = 'platform-wood-2-right-final' as const;

// Pools
const GRASS_PREFABS = ['platform-grass-1-final', 'platform-grass-3-final'] as const;
const WOOD_PREFABS  = ['platform-wood-1-final', 'platform-wood-3-final', 'platform-wood-2-left-final', 'platform-wood-2-right-final'] as const;

// Weights / tuning
const AHEAD_SCREENS = 2.5;
const MAX_ATTEMPTS  = 6;
const GRASS_WEIGHT  = 0.75;
const PAIR_CHANCE   = 0.08;
const VERT_PAIR_GAP = 100;

// Decoration configuration (restored from old system)
const DECORATION_CONFIG = {
  trees: {
    types: ['tree-large-final', 'tree-medium-final', 'tree-small-final'],
    probability: 0.4, // 40% chance for trees on grass-3 platforms
  },
  mushrooms: {
    types: ['mushroom-red-small-final', 'mushroom-green-small-final'],
    probability: 0.6, // 60% chance per available tile
    maxPerTile: 1,
  },
  grass: {
    types: ['grass-1-final', 'grass-2-final', 'grass-3-final', 'grass-4-final', 'grass-5-final', 'grass-6-final'],
    probability: 0.8, // 80% chance per available tile
    maxPerTile: 1,
  }
};

// RNG
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

function refillBag(rng: RNG): Difficulty[] {
  const b: Difficulty[] = ['E','E','M','M','H'];
  for(let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

type Difficulty = 'E'|'M'|'H';

function maxVerticalReach() { 
  return (PHYSICS.jumpVel * PHYSICS.jumpVel) / (2 * PHYSICS.gravity); 
}

function reachable(dx: number, dyUp: number) {
  const m = PHYSICS.margin, g = PHYSICS.gravity, v0 = PHYSICS.jumpVel, vx = Math.max(1, PHYSICS.maxRunSpeed) * (1 - m);
  const disc = v0 * v0 - 2 * g * dyUp; 
  if (disc <= 0) return false; 
  const t = (v0 + Math.sqrt(disc)) / g; 
  const dxMax = vx * t;
  return Math.abs(dx) <= dxMax * (1 - m);
}

// PERFORMANCE: Spatial indexing class for platform culling with cleanup
class SpatialIndex {
  private grid = new Map<string, PlatformDef[]>();
  private cellSize = 200;
  private totalPlatforms = 0; // Track total for cleanup
  private highestPlayerY = 0; // Track player position for cleanup
  
  private getGridKey(x: number, y: number): string {
    const gridX = Math.floor(x / this.cellSize);
    const gridY = Math.floor(y / this.cellSize);
    return `${gridX},${gridY}`;
  }
  
  addPlatform(platform: PlatformDef) {
    const key = this.getGridKey(platform.x, platform.y);
    const cell = this.grid.get(key) || [];
    
    const existingIndex = cell.findIndex(p => p.id === platform.id);
    if (existingIndex === -1) {
      cell.push(platform);
      this.grid.set(key, cell);
      this.totalPlatforms++;
      
      // MUCH more aggressive cleanup - trigger at 500 instead of 2000
      if (this.totalPlatforms > 500) {
        this.cleanupOldCells();
      }
    }
  }
  
  // FIX: Add proper cleanup method
  private cleanupOldCells() {
    const keysToRemove: string[] = [];
    let removedCount = 0;
    const currentPlayerY = this.highestPlayerY || 0;
    
    for (const [key, platforms] of this.grid.entries()) {
      const [gridX, gridY] = key.split(',').map(Number);
      const cellWorldY = gridY * this.cellSize;
      
      // More aggressive: remove cells more than 2 screen heights below player
      const shouldRemove = cellWorldY > currentPlayerY + (SCREEN_H * 2) ||
        platforms.every(p => p.fadeOut && (p.fadeOut.opacity ?? 1) < 0.1);
      
      if (shouldRemove) {
        keysToRemove.push(key);
        removedCount += platforms.length;
      }
    }
    
    keysToRemove.forEach(key => this.grid.delete(key));
    this.totalPlatforms -= removedCount;
    
    // Force garbage collection hint (optional)
    if (removedCount > 100 && typeof global?.gc === 'function') {
      global.gc();
    }
  }
  
  // Helper to determine what Y coordinate is still relevant
  private getMaxRelevantY(): number {
    let maxY = 0;
    for (const platforms of this.grid.values()) {
      for (const platform of platforms) {
        if (!platform.fadeOut || (platform.fadeOut.opacity ?? 1) > 0.1) {
          maxY = Math.max(maxY, platform.y);
        }
      }
    }
    return maxY;
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
  
  // FIX: Override clear to reset counter
  clear() {
    this.grid.clear();
    this.totalPlatforms = 0;
  }
  
  updatePlayerY(playerY: number) {
    this.highestPlayerY = Math.max(this.highestPlayerY, playerY);
  }
  
  // Add method to get stats for debugging
  getStats() {
    return {
      totalCells: this.grid.size,
      totalPlatforms: this.totalPlatforms,
      avgPlatformsPerCell: this.totalPlatforms / Math.max(1, this.grid.size)
    };
  }
}

function pickDy(diff: Difficulty, rng: RNG) {
  const H = maxVerticalReach();
  const r = {E: [.28, .45], M: [.45, .62], H: [.62, .80]}[diff];
  return (r[0] + (r[1] - r[0]) * rng()) * H;
}

function sampleTargetX(rng: RNG) {
  const r = rng();
  let f: number;
  if (r < .60) {
    f = .30 + (.70 - .30) * rng();
  } else if (r < .80) {
    f = .05 + (.30 - .05) * rng();
  } else {
    f = .70 + (.95 - .70) * rng();
  }
  return f * SCREEN_W;
}

function weightedPrefab(rng: RNG) {
  if (rng() < GRASS_WEIGHT) {
    return GRASS_PREFABS[Math.floor(rng() * GRASS_PREFABS.length)];
  }
  return WOOD_PREFABS[Math.floor(rng() * WOOD_PREFABS.length)];
}

function bounds(map: MapName, p: PlatformDef, scale: number) {
  const w = prefabWidthPx(map, p.prefab, scale);
  const h = prefabHeightPx(map, p.prefab, scale);
  return {x: p.x, y: p.y, w, h};
}

export class EnhancedPlatformManager {
  private map: MapName;
  private scale: number;
  private rng: RNG;
  private bag: Difficulty[] = [];
  private instanceId: string;
  private nextId = 1;
  private platforms: PlatformDef[] = [];
  private topMostY: number;
  private deathFloor: PlatformDef | null = null; // keep object (used by lava renderer)
  private highestPlayerY = 0;
  
  // Debug/challenge bookkeeping - PRESERVED
  private bandsGeneratedAtCurrentLevel = 0;
  private playerHighestY: number | undefined; // Track player's highest point
  
  // Culling statistics - PRESERVED
  private totalPlatformsCulled = 0;
  private totalDecorationsCulled = 0;
  private platformsFadedThisFrame = 0;
  private platformsPrunedThisFrame = 0;
  
  // PERFORMANCE: Track only fading platforms instead of scanning all
  private fading = new Set<string>();
  
  // PERFORMANCE: Only dedup when needed
  private sawDup = false;
  
  // STARTUP PROTECTION: Track camera movement to prevent ghost platforms
  private initialCameraY: number | null = null;
  private startupProtectVisible = true; // active only pre–camera-move
  
  // STARTUP PROTECTION: Extra bands for protection
  private static readonly STARTUP_PROTECT_EXTRA_BELOW = SCREEN_H * 0.9; // protect a band below the screen
  private static readonly STARTUP_PROTECT_EXTRA_ABOVE = 0;              // we don't need extra above
  
  // PERFORMANCE: Cache expensive calculations
  private reachabilityCache = new Map<string, boolean>();
  private maxCacheSize = 1000;
  
  // STARTUP PROTECTION: Helper to decide if a platform should be protected during startup
  private isStartupProtected(p: PlatformDef, camY: number): boolean {
    if (!this.startupProtectVisible) return false;

    const viewportTop    = camY - SCREEN_H * 0.5;
    const viewportBottom = camY + SCREEN_H * 0.5;

    const pTop    = p.y;
    const pHeight = p.collision?.height || 32;
    const pBottom = pTop + pHeight;

    // Protect anything on screen, plus a cushion below the screen
    const protectTop    = viewportTop    - EnhancedPlatformManager.STARTUP_PROTECT_EXTRA_ABOVE;
    const protectBottom = viewportBottom + EnhancedPlatformManager.STARTUP_PROTECT_EXTRA_BELOW;

    return pBottom > protectTop && pTop < protectBottom;
  }
  
  // REMOVED: Decoration pooling system (was causing React key conflicts)
  
  // PERFORMANCE: Spatial indexing for platform culling
  private spatialIndex = new SpatialIndex();
  
  // PERFORMANCE: Frame counter for periodic cache cleanup
  private frameCounter = 0;
  
  // FIX: Add more aggressive automatic cleanup
  private lastCleanupHeight = 0;

  constructor(mapName: MapName, floorTopY: number, scale = 2) {
    this.map = mapName; 
    this.scale = scale;
    
    // Create unique instance ID to prevent conflicts across resets
    this.instanceId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const d = new Date(); 
    const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    this.rng = makeSeededRNG(seed); 
    this.bag = refillBag(this.rng);
    this.topMostY = floorTopY;

    // No prefab floor. Start with one centered platform slightly above floor.
    this.seedStarter(floorTopY);
  }

  // Generate truly unique IDs that won't conflict across resets
  private generateUniqueId(): string {
    return `${this.instanceId}_${this.nextId++}`;
  }

  // Single source of truth for making a platform from a prefab
  private makePlatformFromPrefab(prefab: string, x: number, y: number): PlatformDef {
    const id = this.generateUniqueId();
    const col = this.col(prefab, x, y);     // your existing collision builder

    // Use the collision object as-is (it already has all required properties)
    const collision = col;

    const p: PlatformDef = {
      id,
      type: 'platform',
      prefab,
      x,
      y,
      scale: this.scale,
      collision,
    };

    // keep all indices in sync exactly like generateAhead(...)
    this.platforms.push(p);
    this.spatialIndex.addPlatform(p);
    if (this.generateDecorationsFor) this.generateDecorationsFor(p);

    // book-keeping used by your generator
    this.topMostY = Math.min(this.topMostY, p.y);

    return p;
  }

  private seedStarter(floorTopY: number) {
    const H  = maxVerticalReach();
    const dy = 0.34 * H;

    const prefab   = 'platform-grass-3-final'; // same as before
    const w        = prefabWidthPx(this.map, prefab, this.scale);
    const xCenter  = SCREEN_W * 0.5;
    const yTop     = Math.round(floorTopY - dy);
    const xLeft    = Math.round(xCenter - w / 2);

    this.makePlatformFromPrefab(prefab, xLeft, yTop);
  }

  private col(prefab: string, x: number, yTop: number): PlatformDef['collision'] {
    const segs = prefabTopSolidSegmentsPx(this.map, prefab, this.scale);
    if (!segs.length) {
      const w = prefabWidthPx(this.map, prefab, this.scale);
      const h = prefabHeightPx(this.map, prefab, this.scale);
      return {solid: true, topY: yTop, left: x, right: x + w, width: w, height: h};
    }
    const w = prefabWidthPx(this.map, prefab, this.scale);
    const h = prefabHeightPx(this.map, prefab, this.scale);
    const topY = yTop + Math.min(...segs.map(s => s.y)); 
    return {solid: true, topY, left: x, right: x + w, width: w, height: h};
  }

  // REMOVED: Pooling methods (were causing React key conflicts)
  
  private generateDecorationsFor(platform: PlatformDef): void {
    if (!platform.collision?.solid) return;
    
    const isGrass3 = platform.prefab === 'platform-grass-3-final';
    const isGrass1 = platform.prefab === 'platform-grass-1-final';
    
    if (!isGrass3 && !isGrass1) return;
    
    // Get platform collision segments to determine available tiles
    const segments = prefabTopSolidSegmentsPx(this.map, platform.prefab, this.scale);
    const segment = segments[0];
    if (!segment) return;
    
    const surfaceWorldY = platform.collision.topY;
    const tileSize = getTileSize(this.map) * this.scale;
    const numTiles = Math.floor(segment.w / tileSize);
    
    // Track which tiles are occupied to prevent overlaps
    const occupiedTiles = new Set<number>();
    
    // Add trees (only on grass-3 platforms)
    if (isGrass3 && DECORATION_CONFIG.trees) {
      const treeConfig = DECORATION_CONFIG.trees;
      if (this.rng() < treeConfig.probability) {
        const availableTiles = Array.from({length: numTiles}, (_, i) => i)
          .filter(tileIndex => !occupiedTiles.has(tileIndex));
        
        if (availableTiles.length > 0) {
          const tileIndex = availableTiles[Math.floor(this.rng() * availableTiles.length)];
          const treeType = treeConfig.types[Math.floor(this.rng() * treeConfig.types.length)];
          
          const treeWidth = prefabWidthPx(this.map, treeType, this.scale);
          if (treeWidth <= tileSize) {
            const treeWorldX = platform.x + segment.x + (tileIndex * tileSize);
            const treeWorldY = alignPrefabYToSurfaceTop(this.map, treeType, surfaceWorldY, this.scale);
            
            const tree: PlatformDef = {
              id: this.generateUniqueId(), // Fixed: Unique decoration IDs
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
    }
    
    // Add mushrooms
    if (DECORATION_CONFIG.mushrooms) {
      const mushroomConfig = DECORATION_CONFIG.mushrooms;
      if (this.rng() < mushroomConfig.probability) {
        const availableTiles = Array.from({length: numTiles}, (_, i) => i)
          .filter(tileIndex => !occupiedTiles.has(tileIndex));
        
        if (availableTiles.length > 0) {
          const tileIndex = availableTiles[Math.floor(this.rng() * availableTiles.length)];
          const mushroomType = mushroomConfig.types[Math.floor(this.rng() * mushroomConfig.types.length)];
          
          const mushroomWorldX = platform.x + segment.x + (tileIndex * tileSize);
          const mushroomWorldY = alignPrefabYToSurfaceTop(this.map, mushroomType, surfaceWorldY, this.scale);
          
          const mushroom: PlatformDef = {
            id: this.generateUniqueId(), // Fixed: Unique decoration IDs
            type: 'decoration',
            prefab: mushroomType,
            x: Math.round(mushroomWorldX),
            y: Math.round(mushroomWorldY),
            scale: this.scale,
          };
          this.platforms.push(mushroom);
          this.spatialIndex.addPlatform(mushroom);
          occupiedTiles.add(tileIndex);
        }
      }
    }
    
    // Add grass tufts
    if (DECORATION_CONFIG.grass) {
      const grassConfig = DECORATION_CONFIG.grass;
      const maxGrass = isGrass3 ? 3 : isGrass1 ? 1 : 0;
      
      for (let i = 0; i < maxGrass; i++) {
        if (this.rng() < grassConfig.probability) {
          const availableTiles = Array.from({length: numTiles}, (_, i) => i)
            .filter(tileIndex => !occupiedTiles.has(tileIndex));
          
          if (availableTiles.length > 0) {
            const tileIndex = availableTiles[Math.floor(this.rng() * availableTiles.length)];
            const grassType = grassConfig.types[Math.floor(this.rng() * grassConfig.types.length)];
            
            const grassWorldX = platform.x + segment.x + (tileIndex * tileSize);
            const grassWorldY = alignPrefabYToSurfaceTop(this.map, grassType, surfaceWorldY, this.scale);
            
            const grass: PlatformDef = {
              id: this.generateUniqueId(), // Fixed: Unique decoration IDs
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

  private highest(): {xCenter: number; yTop: number} | null { 
    if (!this.platforms.length) return null; 
    const top = this.platforms.reduce((a, b) => a.y < b.y ? a : b); 
    const w = prefabWidthPx(this.map, top.prefab, this.scale); 
    return {xCenter: top.x + w / 2, yTop: top.y}; 
  }

  private placeAbsolute(prefab: string, xLeft: number, yTop: number) {
    const w = prefabWidthPx(this.map, prefab, this.scale);
    const h = prefabHeightPx(this.map, prefab, this.scale);
    const p: PlatformDef = {
      id: this.generateUniqueId(),
      type: 'platform',
      prefab,
      x: Math.round(xLeft),
      y: Math.round(yTop),
      scale: this.scale,
      collision: this.col(prefab, Math.round(xLeft), Math.round(yTop))
    };
    this.platforms.push(p); 
    this.topMostY = Math.min(this.topMostY, p.y);
    
    // PERFORMANCE: Add to spatial index
    this.spatialIndex.addPlatform(p);
    
    // Generate decorations for this platform
    this.generateDecorationsFor(p);
    
    return {xCenter: p.x + w / 2, yTop: p.y};
  }

  private placeRelative(prefab: string, fromX: number, fromY: number, dx: number, dy: number) {
    if (prefab === PREF_LEFT) {
      const w = prefabWidthPx(this.map, prefab, this.scale);
      return this.placeAbsolute(prefab, 0, fromY - dy);
    }
    if (prefab === PREF_RIGHT) {
      const w = prefabWidthPx(this.map, prefab, this.scale);
      return this.placeAbsolute(prefab, SCREEN_W - w, fromY - dy);
    }
    const xCenter = (fromX + dx + SCREEN_W) % SCREEN_W; 
    const yTop = fromY - dy; 
    const w = prefabWidthPx(this.map, prefab, this.scale); 
    return this.placeAbsolute(prefab, Math.round(xCenter - w / 2), yTop);
  }

  private tryEdgePair(fromX: number, fromY: number, dyBase: number): boolean {
    const leftW = prefabWidthPx(this.map, PREF_LEFT, this.scale);
    const rightW = prefabWidthPx(this.map, PREF_RIGHT, this.scale);
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
        this.placeAbsolute(PREF_LEFT, 0, fromY - dy1); 
        this.placeAbsolute(PREF_RIGHT, SCREEN_W - rightW, (fromY - dy1) - VERT_PAIR_GAP); 
      } else { 
        this.placeAbsolute(PREF_RIGHT, SCREEN_W - rightW, fromY - dy1); 
        this.placeAbsolute(PREF_LEFT, 0, (fromY - dy1) - VERT_PAIR_GAP); 
      }
      return true;
    }
    return false;
  }

  // PERFORMANCE: Cache reachability calculations with balanced precision and efficiency
  private cachedReachable(dx: number, dyUp: number): boolean {
    // Less aggressive rounding for better precision (round to nearest 5 instead of 10)
    const keyDx = Math.round(dx / 5) * 5; // Round to nearest 5 for better precision
    const keyDy = Math.round(dyUp / 5) * 5; // Round to nearest 5 for better precision
    const key = `${keyDx},${keyDy}`;
    
    if (this.reachabilityCache.has(key)) {
      return this.reachabilityCache.get(key)!;
    }
    
    const result = reachable(dx, dyUp);
    
    // Balanced cache management - clear 50% when full instead of entire cache
    if (this.reachabilityCache.size >= this.maxCacheSize) {
      const entries = Array.from(this.reachabilityCache.entries());
      const keepCount = Math.floor(this.maxCacheSize * 0.5);
      this.reachabilityCache.clear();
      
      // Keep the most recent entries for better cache hit rates
      entries.slice(-keepCount).forEach(([k, v]) => {
        this.reachabilityCache.set(k, v);
      });
    }
    
    this.reachabilityCache.set(key, result);
    return result;
  }
  
  // PERFORMANCE: Batch platform generation to reduce per-frame cost
  private generateBatch(targetY: number, batchSize = 5): boolean {
    let generated = 0;
    let from = this.highest();
    if (!from) return false;
    
    while (this.topMostY > targetY && generated < batchSize) {
      const diff = (this.bag.length ? this.bag : this.bag = refillBag(this.rng)).pop() as Difficulty;
      const dy = pickDy(diff, this.rng);
      
      if (this.rng() < PAIR_CHANCE) {
        if (this.tryEdgePair(from.xCenter, from.yTop, dy)) { 
          const rightW = prefabWidthPx(this.map, PREF_RIGHT, this.scale); 
          from = {xCenter: SCREEN_W - rightW / 2, yTop: Math.min(...this.platforms.slice(-2).map(p => p.y))}; 
          generated++;
          continue; 
        }
      }
      
      const prefab = weightedPrefab(this.rng);
      const targetX = (prefab === PREF_LEFT) ? (prefabWidthPx(this.map, PREF_LEFT, this.scale) / 2)
                    : (prefab === PREF_RIGHT) ? (SCREEN_W - prefabWidthPx(this.map, PREF_RIGHT, this.scale) / 2)
                    : sampleTargetX(this.rng);
      const dx = targetX - from.xCenter;
      
      if (this.cachedReachable(dx, dy)) { 
        from = this.placeRelative(prefab, from.xCenter, from.yTop, dx, dy); 
        generated++;
      } else { 
        from = this.placeRelative('platform-grass-1-final', from.xCenter, from.yTop, 0, 0.35 * maxVerticalReach()); 
        generated++;
      }
    }
    
    return generated > 0;
  }
  
  private generateAhead(cameraTopY: number): boolean {
    // PERFORMANCE: Use batch generation instead of generating all at once
    return this.generateBatch(cameraTopY - AHEAD_SCREENS * SCREEN_H);
  }
  
  private generateAheadOld(cameraTopY: number): boolean {
    let changed = false; 
    const targetY = cameraTopY - AHEAD_SCREENS * SCREEN_H; 
    let from = this.highest(); 
    if (!from) return false;
    
    let attempts = 0;
    while (this.topMostY > targetY) {
      const diff = (this.bag.length ? this.bag : this.bag = refillBag(this.rng)).pop() as Difficulty;
      const dy = pickDy(diff, this.rng);
      
      if (this.rng() < PAIR_CHANCE) {
        if (this.tryEdgePair(from.xCenter, from.yTop, dy)) { 
          const rightW = prefabWidthPx(this.map, PREF_RIGHT, this.scale); 
          from = {xCenter: SCREEN_W - rightW / 2, yTop: Math.min(...this.platforms.slice(-2).map(p => p.y))}; 
          attempts = 0; 
          changed = true; 
          continue; 
        }
      }
      
      const prefab = weightedPrefab(this.rng);
      const targetX = (prefab === PREF_LEFT) ? (prefabWidthPx(this.map, PREF_LEFT, this.scale) / 2)
                    : (prefab === PREF_RIGHT) ? (SCREEN_W - prefabWidthPx(this.map, PREF_RIGHT, this.scale) / 2)
                    : sampleTargetX(this.rng);
      const dx = targetX - from.xCenter;
      
      if (this.cachedReachable(dx, dy)) { 
        from = this.placeRelative(prefab, from.xCenter, from.yTop, dx, dy); 
        attempts = 0; 
        changed = true; 
      } else { 
        attempts += 1; 
        if (attempts >= MAX_ATTEMPTS) { 
          from = this.placeRelative('platform-grass-1-final', from.xCenter, from.yTop, 0, 0.35 * maxVerticalReach()); 
          attempts = 0; 
          changed = true; 
        } 
      }
    }
    return changed;
  }

  // Public API - PRESERVED WITH FIXES
  getAllPlatforms() { 
    // PERFORMANCE: Only dedup in dev builds or when we detect a duplicate once
    if (!__DEV__ && !this.sawDup) return this.platforms;
    
    const uniquePlatforms = new Map<string, PlatformDef>();
    for (const platform of this.platforms) {
      if (uniquePlatforms.has(platform.id)) {
        this.sawDup = true; // Mark that we've seen a duplicate
      }
      uniquePlatforms.set(platform.id, platform);
    }
    return Array.from(uniquePlatforms.values());
  }
  getSolidPlatforms() { return this.platforms.filter(p => p.collision?.solid); }
  
  getPlatformsNearPlayer(x: number, y: number, r: number, solidsOnly = true) {
    // PERFORMANCE: Use spatial index for faster lookups
    const nearbyPlatforms = this.spatialIndex.getPlatformsNear(x, y, r);
    const out: PlatformDef[] = [];
    const R = Math.max(8, r | 0);
    
    for (const p of nearbyPlatforms) {
      if (solidsOnly && !p.collision?.solid) continue; 
      
      // when deciding if a platform is a "ghost" during collision:
      // During startup, never treat platforms as ghosts
      if (this.startupProtectVisible) {
        // During startup, all platforms are solid
        const b = bounds(this.map, p, this.scale); 
        if (x >= b.x - R && x <= b.x + b.w + R && y >= b.y - R && y <= b.y + b.h + R) out.push(p);
        continue;
      }
      
      // After startup, use normal ghost logic
      const isGhost = p.fadeOut ? (p.fadeOut.opacity ?? 1) < 0.05 : false;
      if (isGhost) continue; // skip from collision
      
      const b = bounds(this.map, p, this.scale); 
      if (x >= b.x - R && x <= b.x + b.w + R && y >= b.y - R && y <= b.y + b.h + R) out.push(p);
    } 
    return out;
  }
  
  isDeathFloor(_p: PlatformDef) { return false; }

  // Platform array optimization to prevent memory growth
  private optimizePlatformArray() {
    // Periodically defragment the platforms array
    if (this.platforms.length > 1000) {
      const activePlatforms = this.platforms.filter(p => 
        !p.fadeOut || (p.fadeOut.opacity ?? 1) > 0.1
      );
      
      if (activePlatforms.length < this.platforms.length * 0.7) {
        // More than 30% are faded - rebuild array
        this.platforms = activePlatforms;
        
        // Rebuild spatial index
        this.spatialIndex.clear();
        for (const platform of this.platforms) {
          this.spatialIndex.addPlatform(platform);
        }
      }
    }
  }

  updateForCamera(newCameraY: number, opts: { force?: boolean; playerY?: number } = {}) {
    const { force = false, playerY = 0 } = opts;
    
    // remember first camera and drop protection once camera actually moves
    if (this.initialCameraY === null) this.initialCameraY = newCameraY;
    // Only disable startup protection when camera moves significantly (not just player movement)
    // Use a very conservative threshold to ensure platforms stay solid during initial gameplay
    if (this.startupProtectVisible && Math.abs(newCameraY - this.initialCameraY) > 200) {
      this.startupProtectVisible = false; // camera has started—normal rules resume
    }
    
    // if not forced, keep your existing throttle/movement gating
    if (!force) {
      // Safe frame counter management using modulo operations
      this.frameCounter = (this.frameCounter + 1) % 100000; // Safe modulo to prevent overflow
      
      // Update spatial index with player position for cleanup
      this.spatialIndex.updatePlayerY(playerY);
      
      // Conservative cache clearing - less frequent to maintain cache effectiveness
      const baseClearInterval = 1000; // Base interval of 1000 frames
      const altitudeFactor = Math.max(1, Math.min(3, Math.floor(Math.abs(playerY) / (SCREEN_H * 20)))); // Cap at 3x
      const clearInterval = Math.max(500, baseClearInterval / altitudeFactor); // Minimum 500 frames
      
      if (this.frameCounter % clearInterval === 0) {
        this.reachabilityCache.clear();
      }
      
      // Add periodic optimization
      if (this.frameCounter % 300 === 0) { // Every 5 seconds
        this.optimizePlatformArray();
      }
    }

    const top = newCameraY - SCREEN_H * 0.5; 
    const gen = this.generateAhead(top); 
    
    // FIX: Trigger more frequent cleanup based on height progression
    const currentHeight = Math.abs(playerY);
    if (currentHeight - this.lastCleanupHeight > SCREEN_H * 2) { // Every 2 screen heights
      this.performAggressiveCleanup(playerY);
      this.clampHistoryAround(playerY, newCameraY); // PERFORMANCE: Aggressive height-based clamping
      this.lastCleanupHeight = currentHeight;
    }
    
    const culled = this.cullBelow(newCameraY); 
    return gen || culled; 
  }

  // Death floor (lava) tracking - FIXED TO PRESERVE OBJECT SHAPE FOR GAMESCREEN
  updateDeathFloor(playerWorldY: number) {
    // Always update the highest point reached (smallest Y value = highest position)
    if (this.highestPlayerY === 0 || playerWorldY < this.highestPlayerY) {
      this.highestPlayerY = playerWorldY;
    }
    
    // Calculate where the lava should be (below the player's highest point)
    const targetLavaY = this.highestPlayerY + SCREEN_H * 0.5;
    
    if (!this.deathFloor) {
      // Create initial death floor
      this.deathFloor = { 
        id: this.generateUniqueId(), // Fixed: Unique death floor ID 
        type: 'platform', 
        prefab: 'floor-final', 
        x: -SCREEN_W / 2, 
        y: targetLavaY, 
        scale: this.scale, 
        collision: { solid: true, topY: targetLavaY + 40, left: -SCREEN_W / 2, right: SCREEN_W * 1.5, width: SCREEN_W * 2, height: 100 } 
      };
    } else {
      // Always move the lava to follow the player's highest point
      this.deathFloor.y = targetLavaY;
      if (this.deathFloor.collision) {
        this.deathFloor.collision.topY = targetLavaY + 40;
      }
    }
  }
  
  getDeathFloor() { return this.deathFloor; }
  getLavaY() { return this.deathFloor?.y ?? 0; }

  updateHighestPointOnLanding(yTop: number) { 
    // FIXED: Only increment when player reaches a genuinely new high point
    if (!this.playerHighestY || yTop < this.playerHighestY) {
      this.playerHighestY = yTop;
      // Only increment bands when making significant progress (half screen)
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
      if (!p || !p.fadeOut) { done.push(id); continue; }

      const t = (now - p.fadeOut.startTime) / p.fadeOut.duration;
      const op = Math.max(0, 1 - t);
      if (op <= 0) {
        // remove from platforms
        const idx = this.platforms.indexOf(p);
        if (idx >= 0) {
          // Update culling stats
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

    // Rebuild index only if we removed something
    if (done.length) {
      this.spatialIndex.clear();
      for (const platform of this.platforms) this.spatialIndex.addPlatform(platform);
    }
    return changed;
  }

  private cullBelow(cameraY: number) {
    const viewportBottom = cameraY + SCREEN_H * 0.5;

    // your normal thresholds (post-startup these behave as before)
    const fadeStartY = viewportBottom + SCREEN_H * 0.2;
    const hardKillY  = viewportBottom + SCREEN_H * 0.9;

    const keep: PlatformDef[] = [];
    let changed = false;
    this.platformsFadedThisFrame = 0;
    this.platformsPrunedThisFrame = 0;

    for (const p of this.platforms) {
      // --- Startup: hard protect visible + near-bottom platforms
      if (this.isStartupProtected(p, cameraY)) {
        if (p.fadeOut) { 
          p.fadeOut = undefined; 
          this.fading.delete(p.id); 
          changed = true;
        }
        keep.push(p);
        continue;
      }

      // --- Normal behavior (after first camera move)
      if (p.y >= hardKillY) {
        this.fading.delete(p.id);
        // drop it
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
      this.spatialIndex.clear();
      for (const q of this.platforms) this.spatialIndex.addPlatform(q);
      changed = true;
    }
    
    return changed;
  }

  // Debug - PRESERVED
  debugPlatformsNearY(_y: number, _r = 200) {} 
  
  getCurrentChallenge() { 
    const total = Math.max(1, Math.floor((this.topMostY - (this.deathFloor?.y ?? (this.topMostY + SCREEN_H))) / SCREEN_H)); 
    return { 
      level: 'Mixed (E/M/H)', 
      bandsAtLevel: this.bandsGeneratedAtCurrentLevel, // Progress screens climbed
      totalBands: total 
    }; 
  }

  // FIX: More aggressive cleanup method
  private performAggressiveCleanup(playerY: number) {
    const beforeCount = this.platforms.length;
    const cleanupThreshold = playerY + SCREEN_H * 3; // Everything 3 screens below player
    
    // Remove platforms that are definitely out of reach
    this.platforms = this.platforms.filter(platform => {
      // PERFORMANCE: Favor dropping decorations quickly
      if (platform.type === 'decoration') {
        return platform.y < cleanupThreshold || 
               (platform.fadeOut && (platform.fadeOut.opacity ?? 1) > 0.5) ||
               this.isDeathFloor(platform);
      }
      
      // Keep platforms that are:
      // 1. Above the cleanup threshold, OR
      // 2. Still fading out and visible, OR  
      // 3. Death floor (always keep)
      return platform.y < cleanupThreshold || 
             (platform.fadeOut && (platform.fadeOut.opacity ?? 1) > 0.5) ||
             this.isDeathFloor(platform);
    });
    
    const afterCount = this.platforms.length;
    const removed = beforeCount - afterCount;
    
    if (removed > 0) {
      // Rebuild spatial index after cleanup
      this.spatialIndex.clear();
      for (const platform of this.platforms) {
        this.spatialIndex.addPlatform(platform);
      }
    }
  }
  
  // FIX: Add method to monitor platform count
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
      prunedThisFrame: this.platformsPrunedThisFrame
    };
  }

  // PERFORMANCE: O(cells) instead of O(N) platform queries
  getPlatformsInRect(topY: number, bottomY: number): PlatformDef[] {
    // cover full width; we only care about Y window here
    const cell = this.spatialIndex;
    const cellSize = (cell as any).cellSize ?? 200;

    const out: PlatformDef[] = [];
    const seen = new Set<string>();

    // Walk only vertical strip of grid rows intersecting viewport
    const firstRow = Math.floor((topY - cellSize) / cellSize);
    const lastRow  = Math.floor((bottomY + cellSize) / cellSize);

    for (let gy = firstRow; gy <= lastRow; gy++) {
      // Check a few columns across screen width; two or three is enough
      for (let gx of [-1, 0, 1]) {
        const key = `${gx},${gy}`;
        const bucket = (cell as any).grid?.get(key) as PlatformDef[] | undefined;
        if (!bucket) continue;
        for (const p of bucket) {
          if (seen.has(p.id)) continue;
          const pBottom = p.y + (p.collision?.height || 32);
          // final clip to viewport band
          if (pBottom > topY && p.y < bottomY) {
            seen.add(p.id);
            out.push(p);
          }
        }
      }
    }
    return out;
  }

  // PERFORMANCE: Aggressive height-based platform history clamping
  private clampHistoryAround(playerY: number, cameraY: number) {
    const viewportTop    = cameraY - SCREEN_H * 0.5;
    const viewportBottom = cameraY + SCREEN_H * 0.5;

    let clampTop    = viewportTop  - SCREEN_H * 1.5;
    let clampBottom = viewportBottom + SCREEN_H * 3.0;

    if (this.startupProtectVisible) {
      // wider band so the bottom pad survives until first movement
      clampTop    = viewportTop  - SCREEN_H * 2.5;
      clampBottom = viewportBottom + SCREEN_H * 4.0;
    }

    const before = this.platforms.length;
    this.platforms = this.platforms.filter(p =>
      (p.y >= clampTop && p.y <= clampBottom) || this.isDeathFloor(p)
    );

    if (this.platforms.length !== before) {
      this.spatialIndex.clear();
      for (const p of this.platforms) this.spatialIndex.addPlatform(p);
    }
  }
}