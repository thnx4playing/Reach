// src/systems/platform/PlatformManager.ts
// v4 – Spawn tuning per requests:
// 1) Grass vs Wood weighting ~75% grass (grass-1/grass-3), ~25% wood (wood-1/wood-3/wood-2-left/wood-2-right)
// 2) Paired wood-2 left/right: reduced frequency & no longer required; they can also spawn individually, locked to edges
// 3) Placement distribution: center-biased sampling so middle gets used (not just edges)
// 4) Lava/DeathFloor unchanged (getDeathFloor/getLavaY + updateDeathFloor behavior preserved)
// 5) Floor preserved via ensureFloor
//
// Rendering still uses your existing <PrefabNode> with Group+clip (no srcRect).

import { Dimensions } from 'react-native';
import type { MapName } from '../../content/maps';
import { prefabWidthPx, prefabHeightPx, prefabTopSolidSegmentsPx, getTileSize, alignPrefabYToSurfaceTop } from '../../content/maps';
import type { PlatformDef } from './types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ---------------- Physics (tune as needed) ----------------
const PHYSICS = {
  gravity: 1500,      // px/s^2
  jumpVel: 780,       // px/s
  maxRunSpeed: 220,   // px/s
  margin: 0.08,       // safety margin
};

// ---------------- Prefab names ----------------
const PREF_LEFT  = 'platform-wood-2-left-final'  as const;
const PREF_RIGHT = 'platform-wood-2-right-final' as const;
const PREF_FLOOR = 'floor-final' as const;

// Singles pool is now GRASS-weighted; wood-2-left/right included as singles too (edge-locked)
const GRASS_PREFABS = [
  'platform-grass-1-final',
  'platform-grass-3-final',
] as const;

const WOOD_PREFABS = [
  'platform-wood-1-final',
  'platform-wood-3-final',
  'platform-wood-2-left-final',
  'platform-wood-2-right-final',
] as const;

type Difficulty = 'E' | 'M' | 'H';
type RNG = () => number;

// Tunables
const AHEAD_SCREENS = 2.5;
const MAX_ATTEMPTS = 6;
const VERT_PAIR_GAP = 100;     // px vertical gap for edge pairs
const PAIR_CHANCE   = 0.08;    // reduced frequency
const GRASS_WEIGHT  = 0.75;    // ~75% grass, 25% wood

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

// Xorshift32 for deterministic seeds
function makeSeededRNG(seed: number): RNG {
  let x = (seed >>> 0) || 1;
  return function rng() {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17; x >>>= 0;
    x ^= x << 5;  x >>>= 0;
    return (x >>> 0) / 0xFFFFFFFF;
  };
}

function shuffle<T>(arr: T[], rng: RNG) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function refillBag(rng: RNG): Difficulty[] {
  const bag: Difficulty[] = ['E','E','M','M','H'];
  shuffle(bag, rng);
  return bag;
}

function maxVerticalReach(v0: number, g: number) {
  return (v0 * v0) / (2 * g);
}

// Jump envelope oracle: can we reach dyUp (vertical) with dx (horizontal)?
function reachable(dx: number, dyUp: number, phys = PHYSICS) {
  const m = phys.margin;
  const g = phys.gravity;
  const v0 = phys.jumpVel;
  const vx = Math.max(1, phys.maxRunSpeed) * (1 - m);

  const disc = v0*v0 - 2*g*dyUp;
  if (disc <= 0) return false;
  const t = (v0 + Math.sqrt(disc)) / g; // permissive root (descending branch)
  const dxMax = vx * t;
  return Math.abs(dx) <= dxMax * (1 - m);
}

function pickDyForDifficulty(diff: Difficulty, rng: RNG) {
  const H = maxVerticalReach(PHYSICS.jumpVel, PHYSICS.gravity);
  const ranges: Record<Difficulty, [number, number]> = {
    E: [0.28, 0.45],
    M: [0.45, 0.62],
    H: [0.62, 0.80],
  };
  const [lo, hi] = ranges[diff];
  return (lo + (hi - lo) * rng()) * H;
}

// Center-biased target X sampler: ~60% center (30–70%), 20% left (5–30%), 20% right (70–95%)
function sampleTargetX(rng: RNG): number {
  const r = rng();
  let frac: number;
  if (r < 0.60) {
    frac = 0.30 + (0.70 - 0.30) * rng();
  } else if (r < 0.80) {
    frac = 0.05 + (0.30 - 0.05) * rng();
  } else {
    frac = 0.70 + (0.95 - 0.70) * rng();
  }
  return frac * SCREEN_W;
}

function weightedPickPrefab(rng: RNG): string {
  if (rng() < GRASS_WEIGHT) {
    const i = Math.floor(rng() * GRASS_PREFABS.length);
    return GRASS_PREFABS[i];
  } else {
    const i = Math.floor(rng() * WOOD_PREFABS.length);
    return WOOD_PREFABS[i];
  }
}

// Bounds helpers for PlatformDef
function platformBounds(mapName: MapName, p: PlatformDef, scale: number) {
  const w = prefabWidthPx(mapName, p.prefab, scale);
  const h = prefabHeightPx(mapName, p.prefab, scale);
  return { x: p.x, y: p.y, w, h };
}

export class EnhancedPlatformManager {
  private mapName: MapName;
  private scale: number;
  private rng: RNG;
  private bag: Difficulty[] = [];
  private nextId = 1;

  private platforms: PlatformDef[] = [];
  private topMostY: number;       // smallest y placed so far
  private deathFloorY: number;    // for culling/fade

  // Debug/challenge bookkeeping
  private bandsGeneratedAtCurrentLevel = 0;
  private highestPlayerY: number | undefined; // Track player's highest point
  
  // Culling statistics
  private totalPlatformsCulled = 0;
  private totalDecorationsCulled = 0;
  private platformsFadedThisFrame = 0;
  private platformsPrunedThisFrame = 0;

  constructor(mapName: MapName, floorTopY: number, scale = 2) {
    this.mapName = mapName;
    this.scale = scale;
    // Deterministic daily seed by default (yyyyMMdd)
    const today = new Date();
    const seed = today.getFullYear()*10000 + (today.getMonth()+1)*100 + today.getDate();
    this.rng = makeSeededRNG(seed);

    // Seed bag
    this.bag = refillBag(this.rng);

    // Initial top-most
    this.topMostY = floorTopY;
    // FIX: Use 0.5*SCREEN_H to match updateDeathFloor logic
    this.deathFloorY = floorTopY + SCREEN_H * 0.5;

    // Restore floor
    this.ensureFloor(floorTopY);

    // Seed a couple starter ledges above the floor
    this.ensureInitialPlatforms(floorTopY);
  }

  private ensureFloor(floorTopY: number) {
    const h = 32;
    const floor: PlatformDef = {
      id: String(this.nextId++),
      type: 'platform',
      prefab: (PREF_FLOOR as unknown as string) || 'platform-wood-3-final',
      x: 0,
      y: Math.round(floorTopY),
      scale: this.scale,
      collision: { solid: true, topY: Math.round(floorTopY), left: 0, right: SCREEN_W, width: SCREEN_W, height: h }
    };
    this.platforms.push(floor);
    this.topMostY = Math.min(this.topMostY, floor.y);
  }

  private ensureInitialPlatforms(floorTopY: number) {
    const startNames = ['platform-wood-3-final','platform-grass-1-final'] as const;
    let last = { xCenter: SCREEN_W * 0.5, yTop: floorTopY };
    for (let i=0;i<2;i++) {
      const name = startNames[i % startNames.length];
      const H = maxVerticalReach(PHYSICS.jumpVel, PHYSICS.gravity);
      const dyUp = (0.30 + 0.06*i) * H;
      const dx = (i===0? -0.18 : 0.22) * SCREEN_W;
      last = this.placeRelative(name, last.xCenter, last.yTop, dx, dyUp);
    }
  }

  private takeDifficulty(): Difficulty {
    if (!this.bag.length) this.bag = refillBag(this.rng);
    return this.bag.pop()!;
  }

  private buildCollision(prefab: string, x: number, yTop: number, w: number, h: number): PlatformDef['collision'] {
    const segs = prefabTopSolidSegmentsPx(this.mapName, prefab, this.scale);
    if (!segs.length) {
      return { solid: true, topY: yTop, left: x, right: x + w, width: w, height: h };
    }
    const topY = yTop + Math.min(...segs.map(s => s.y));
    return { solid: true, topY, left: x, right: x + w, width: w, height: h };
  }

  private generateDecorationsFor(platform: PlatformDef): void {
    if (!platform.collision?.solid) return;
    
    const isGrass3 = platform.prefab === 'platform-grass-3-final';
    const isGrass1 = platform.prefab === 'platform-grass-1-final';
    
    if (!isGrass3 && !isGrass1) return;
    
    // Get platform collision segments to determine available tiles
    const segments = prefabTopSolidSegmentsPx(this.mapName, platform.prefab, this.scale);
    const segment = segments[0];
    if (!segment) return;
    
    const surfaceWorldY = platform.collision.topY;
    const tileSize = getTileSize(this.mapName) * this.scale;
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
          
          const treeWidth = prefabWidthPx(this.mapName, treeType, this.scale);
          if (treeWidth <= tileSize) {
            const treeWorldX = platform.x + segment.x + (tileIndex * tileSize);
            const treeWorldY = alignPrefabYToSurfaceTop(this.mapName, treeType, surfaceWorldY, this.scale);
            
            const tree: PlatformDef = {
              id: String(this.nextId++),
              type: 'decoration',
              prefab: treeType,
              x: Math.round(treeWorldX),
              y: Math.round(treeWorldY),
              scale: this.scale,
            };
            this.platforms.push(tree);
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
          const mushroomWorldY = alignPrefabYToSurfaceTop(this.mapName, mushroomType, surfaceWorldY, this.scale);
          
          const mushroom: PlatformDef = {
            id: String(this.nextId++),
            type: 'decoration',
            prefab: mushroomType,
            x: Math.round(mushroomWorldX),
            y: Math.round(mushroomWorldY),
            scale: this.scale,
          };
          this.platforms.push(mushroom);
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
            const grassWorldY = alignPrefabYToSurfaceTop(this.mapName, grassType, surfaceWorldY, this.scale);
            
            const grass: PlatformDef = {
              id: String(this.nextId++),
              type: 'decoration',
              prefab: grassType,
              x: Math.round(grassWorldX),
              y: Math.round(grassWorldY),
              scale: this.scale,
            };
            this.platforms.push(grass);
            occupiedTiles.add(tileIndex);
          }
        }
      }
    }
  }

  private placeAbsolute(prefab: string, xLeft: number, yTop: number) {
    const w = prefabWidthPx(this.mapName, prefab, this.scale);
    const h = prefabHeightPx(this.mapName, prefab, this.scale);
    const platform: PlatformDef = {
      id: String(this.nextId++),
      type: 'platform',
      prefab,
      x: Math.round(xLeft),
      y: Math.round(yTop),
      scale: this.scale,
      collision: this.buildCollision(prefab, Math.round(xLeft), Math.round(yTop), w, h),
    };
    this.platforms.push(platform);
    this.topMostY = Math.min(this.topMostY, platform.y);
    
    // Generate decorations for this platform
    this.generateDecorationsFor(platform);
    
    const xCenter = platform.x + w/2;
    return { xCenter, yTop: platform.y };
  }

  private placeRelative(prefab: string, fromXCenter: number, fromYTop: number, dx: number, dyUp: number) {
    // For edge-locked prefabs, convert to absolute placement at edges
    if (prefab === PREF_LEFT) {
      const w = prefabWidthPx(this.mapName, prefab, this.scale);
      const xLeft = 0;
      const yTop = fromYTop - dyUp;
      return this.placeAbsolute(prefab, xLeft, yTop);
    }
    if (prefab === PREF_RIGHT) {
      const w = prefabWidthPx(this.mapName, prefab, this.scale);
      const xLeft = SCREEN_W - w;
      const yTop = fromYTop - dyUp;
      return this.placeAbsolute(prefab, xLeft, yTop);
    }

    // Normal centered placement
    const xCenter = (fromXCenter + dx + SCREEN_W) % SCREEN_W;
    const yTop = fromYTop - dyUp;

    const w = prefabWidthPx(this.mapName, prefab, this.scale);
    const h = prefabHeightPx(this.mapName, prefab, this.scale);
    const xLeft = Math.round(xCenter - w/2);

    const platform: PlatformDef = {
      id: String(this.nextId++),
      type: 'platform',
      prefab,
      x: xLeft,
      y: Math.round(yTop),
      scale: this.scale,
      collision: this.buildCollision(prefab, xLeft, Math.round(yTop), w, h),
    };
    this.platforms.push(platform);
    this.topMostY = Math.min(this.topMostY, platform.y);
    
    // Generate decorations for this platform
    this.generateDecorationsFor(platform);
    
    return { xCenter, yTop: platform.y };
  }

  private tryPlaceEdgePair(fromXCenter: number, fromYTop: number, dyUpBase: number): boolean {
    // Reduced frequency by PAIR_CHANCE; this function now optional, pairs are special spice
    const leftW  = prefabWidthPx(this.mapName, PREF_LEFT,  this.scale);
    const rightW = prefabWidthPx(this.mapName, PREF_RIGHT, this.scale);
    const leftCenter  = leftW/2;
    const rightCenter = SCREEN_W - rightW/2;

    const options: Array<'leftLower'|'rightLower'> = fromXCenter < SCREEN_W*0.5 ? ['leftLower','rightLower'] : ['rightLower','leftLower'];

    const H = maxVerticalReach(PHYSICS.jumpVel, PHYSICS.gravity);
    const dyUp1 = Math.min(dyUpBase, 0.45 * H);

    for (const perm of options) {
      if (perm === 'leftLower') {
        const dx1 = leftCenter - fromXCenter;
        if (!reachable(dx1, dyUp1)) continue;
        this.placeAbsolute(PREF_LEFT, 0, fromYTop - dyUp1);
        this.placeAbsolute(PREF_RIGHT, SCREEN_W - rightW, (fromYTop - dyUp1) - VERT_PAIR_GAP);
        return true;
      } else {
        const dx1 = rightCenter - fromXCenter;
        if (!reachable(dx1, dyUp1)) continue;
        this.placeAbsolute(PREF_RIGHT, SCREEN_W - rightW, fromYTop - dyUp1);
        this.placeAbsolute(PREF_LEFT, 0, (fromYTop - dyUp1) - VERT_PAIR_GAP);
        return true;
      }
    }
    return false;
  }

  private generateAhead(cameraTopY: number): boolean {
    let changed = false;
    const targetY = cameraTopY - AHEAD_SCREENS * SCREEN_H;
    let from = this.findHighestRecent();
    if (!from) return false;

    let attempts = 0;
    while (this.topMostY > targetY) {
      const diff = this.takeDifficulty();
      const dyUp = pickDyForDifficulty(diff, this.rng);

      // Sometimes place a special edge pair (rare now)
      if (this.rng() < PAIR_CHANCE) {
        if (this.tryPlaceEdgePair(from.xCenter, from.yTop, dyUp)) {
          // Continue from upper of the pair (right upper center)
          const rightW = prefabWidthPx(this.mapName, PREF_RIGHT, this.scale);
          const upperXCenter = (SCREEN_W - rightW/2);
          const upperYTop = Math.min(...this.platforms.slice(-2).map(p => p.y));
          from = { xCenter: upperXCenter, yTop: upperYTop };
          attempts = 0;
          changed = true;
          continue;
        }
      }

      // Weighted prefab pick (grass-heavy)
      const prefab = weightedPickPrefab(this.rng);

      // Target X: if edge-locked prefab, force edge center; else use center-biased sampler
      let targetX: number;
      if (prefab === PREF_LEFT) {
        const w = prefabWidthPx(this.mapName, PREF_LEFT, this.scale);
        targetX = w/2;
      } else if (prefab === PREF_RIGHT) {
        const w = prefabWidthPx(this.mapName, PREF_RIGHT, this.scale);
        targetX = SCREEN_W - w/2;
      } else {
        targetX = sampleTargetX(this.rng);
      }

      const dx = targetX - from.xCenter;

      if (reachable(dx, dyUp)) {
        from = this.placeRelative(prefab, from.xCenter, from.yTop, dx, dyUp);
        attempts = 0;
        changed = true;
      } else {
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          // Rescue: easy straight-up ledge
          const rescuePrefab = 'platform-grass-1-final';
          const dy = 0.35 * maxVerticalReach(PHYSICS.jumpVel, PHYSICS.gravity);
          from = this.placeRelative(rescuePrefab, from.xCenter, from.yTop, 0, dy);
          attempts = 0;
          changed = true;
        }
      }
    }
    return changed;
  }

  private findHighestRecent(): { xCenter: number; yTop: number } | null {
    if (!this.platforms.length) return null;
    // Highest (smallest y)
    const top = this.platforms.reduce((a,b) => (a.y < b.y ? a : b));
    const w = prefabWidthPx(this.mapName, top.prefab, this.scale);
    const xCenter = top.x + w/2;
    return { xCenter, yTop: top.y };
  }

  private startFadeOut(p: PlatformDef) {
    const now = Date.now();
    p.fadeOut = { startTime: now, duration: 600, opacity: 1.0 };
  }

  // ---------------- Public API used by GameScreen ----------------

  getAllPlatforms(): PlatformDef[] { return this.platforms.slice(); }
  getSolidPlatforms(): PlatformDef[] { return this.platforms.filter(p => p.collision?.solid); }
  
  /** death floor coordinate for hazard/lava band rendering */
  getDeathFloor(): { y: number } { return { y: this.deathFloorY }; }
  /** alias if your LavaLayer expects a 'getLavaY' */
  getLavaY(): number { return this.deathFloorY; }

  getPlatformsNearPlayer(x: number, y: number, radius: number, solidsOnly = true): PlatformDef[] {
    const r = Math.max(8, radius|0);
    const out: PlatformDef[] = [];
    for (const p of this.platforms) {
      if (solidsOnly && !p.collision?.solid) continue;
      const { x: px, y: py, w, h } = platformBounds(this.mapName, p, this.scale);
      if (x >= px - r && x <= px + w + r && y >= py - r && y <= py + h + r) out.push(p);
    }
    return out;
  }

  isDeathFloor(_p: PlatformDef): boolean { return false; }

  updateForCamera(newCameraY: number, _playerWorldY: number): boolean {
    const cameraTopY = newCameraY - SCREEN_H * 0.5;
    const changed = this.generateAhead(cameraTopY);
    const culled = this.cullBelow(this.deathFloorY + SCREEN_H * 0.5);
    return changed || culled;
  }

  updateDeathFloor(playerWorldY: number): void {
    // FIX: Keep lava about 1/2 screen below player but only move UP (follow player's highest point)
    // In this coordinate system: lower playerWorldY = player climbed higher
    const newDeathFloorY = playerWorldY + SCREEN_H * 0.5;
    const oldDeathFloorY = this.deathFloorY;
    
    // Only move death floor UP (to lower Y values) - never let it fall back down
    this.deathFloorY = Math.min(this.deathFloorY, newDeathFloorY);
  }

  updateHighestPointOnLanding(yTop: number): void {
    // FIX: Only increment when player reaches a genuinely new high point
    // Track the highest point the player has ever reached
    if (!this.highestPlayerY || yTop < this.highestPlayerY) {
      this.highestPlayerY = yTop;
      // Only increment bands when making significant progress (half screen)
      const progressScreens = Math.floor((this.topMostY - yTop) / (SCREEN_H * 0.5));
      if (progressScreens > this.bandsGeneratedAtCurrentLevel) {
        this.bandsGeneratedAtCurrentLevel = progressScreens;
      }
    }
  }

  updateFadeOutAnimations(): boolean {
    const now = Date.now();
    let changed = false;
    for (const p of this.platforms) {
      if (!p.fadeOut) continue;
      const t = (now - p.fadeOut.startTime) / p.fadeOut.duration;
      const newOpacity = Math.max(0, 1 - t);
      if (newOpacity !== p.fadeOut.opacity) {
        p.fadeOut.opacity = newOpacity;
        changed = true;
      }
    }
    // Remove fully faded and track what was removed
    const beforePlatforms = this.platforms.filter(p => p.type === 'platform').length;
    const beforeDecorations = this.platforms.filter(p => p.type === 'decoration').length;
    
    this.platforms = this.platforms.filter(p => !p.fadeOut || (p.fadeOut.opacity ?? 1) > 0);
    
    const afterPlatforms = this.platforms.filter(p => p.type === 'platform').length;
    const afterDecorations = this.platforms.filter(p => p.type === 'decoration').length;
    
    const platformsRemoved = beforePlatforms - afterPlatforms;
    const decorationsRemoved = beforeDecorations - afterDecorations;
    
    this.totalPlatformsCulled += platformsRemoved;
    this.totalDecorationsCulled += decorationsRemoved;
    
    return changed || (platformsRemoved + decorationsRemoved > 0);
  }

  private cullBelow(killBelowY: number): boolean {
    let changed = false;
    this.platformsFadedThisFrame = 0;
    this.platformsPrunedThisFrame = 0;
    
    // Start fade for items below killBelowY
    for (const p of this.platforms) {
      if (p.y > killBelowY && !p.fadeOut) {
        this.startFadeOut(p);
        changed = true;
        this.platformsFadedThisFrame++;
      }
    }
    
    // Hard prune items far below (safety, even if fade not ticked)
    const HARD_PRUNE = killBelowY + SCREEN_H * 2.5;
    const before = this.platforms.length;
    const beforePlatforms = this.platforms.filter(p => p.type === 'platform').length;
    const beforeDecorations = this.platforms.filter(p => p.type === 'decoration').length;
    
    this.platforms = this.platforms.filter(p => p.y <= HARD_PRUNE);
    
    const afterPlatforms = this.platforms.filter(p => p.type === 'platform').length;
    const afterDecorations = this.platforms.filter(p => p.type === 'decoration').length;
    
    const platformsPruned = beforePlatforms - afterPlatforms;
    const decorationsPruned = beforeDecorations - afterDecorations;
    
    this.platformsPrunedThisFrame = platformsPruned + decorationsPruned;
    this.totalPlatformsCulled += platformsPruned;
    this.totalDecorationsCulled += decorationsPruned;
    
    return changed || (this.platforms.length !== before);
  }

  // Debug helpers used in your GameScreen
  debugPlatformsNearY(_worldY: number, _range = 200): void { /* no-op */ }

  getCurrentChallenge(): { level: string; bandsAtLevel: number; totalBands: number } {
    const total = Math.max(1, Math.floor((this.topMostY - this.deathFloorY) / SCREEN_H));
    return { 
      level: 'Mixed (E/M/H)', 
      bandsAtLevel: this.bandsGeneratedAtCurrentLevel, // Progress screens climbed
      totalBands: total 
    };
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
}