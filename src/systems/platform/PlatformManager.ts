import { Dimensions } from 'react-native';
import { prefabWidthPx, prefabHeightPx, alignPrefabYToSurfaceTop, getTileSize, prefabTopSolidSegmentsPx } from '../../content/maps';
import type { MapName } from '../../content/maps';
import type { PlatformDef } from './types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Jump physics constants (from your game)
const JUMP_VELOCITY = 780;
const GRAVITY = 1500;
const RUN_SPEED = 220;

// Calculate actual jump capabilities
const JUMP_TIME = (2 * JUMP_VELOCITY) / GRAVITY; // ~1.04 seconds
const MAX_JUMP_HEIGHT = (JUMP_VELOCITY * JUMP_VELOCITY) / (2 * GRAVITY); // ~202 pixels
const MAX_HORIZONTAL_DISTANCE = RUN_SPEED * JUMP_TIME; // ~229 pixels

// Challenge level definitions based on jump requirements
interface ChallengeLevel {
  name: string;
  minGapX: number;
  maxGapX: number;
  minGapY: number;
  maxGapY: number;
  crossScreenChance: number; // Probability of cross-screen jumps
  pairPlatformChance: number; // Probability of left/right platform pairs
  platformDensity: number; // Platforms per screen height
}

const CHALLENGE_LEVELS: ChallengeLevel[] = [
  {
    name: 'Easy',
    minGapX: 40,
    maxGapX: 120,
    minGapY: 30,
    maxGapY: 80,
    crossScreenChance: 0.12,
    pairPlatformChance: 0.18,
    platformDensity: 4
  },
  {
    name: 'Medium',
    minGapX: 80,
    maxGapX: 160,
    minGapY: 50,
    maxGapY: 120,
    crossScreenChance: 0.22,
    pairPlatformChance: 0.28,
    platformDensity: 3
  },
  {
    name: 'Hard',
    minGapX: 120,
    maxGapX: 200,
    minGapY: 80,
    maxGapY: 160,
    crossScreenChance: 0.30,
    pairPlatformChance: 0.35,
    platformDensity: 2.5
  }
];

interface PlatformChain {
  platforms: Array<{
    prefab: string;
    x: number;
    y: number;
    isLanding: boolean; // Required landing spot
  }>;
  difficulty: string;
}

export class EnhancedPlatformManager {
  private platforms: Map<string, PlatformDef> = new Map();
  private mapName: MapName;
  private floorWorldY: number;
  private scale: number;
  private generatedMinWorldY = 0;
  private platformCounter = 0;
  
  // Challenge progression
  private currentChallengeIndex = 0;
  private bandsGeneratedAtCurrentLevel = 0;
  private readonly BANDS_PER_DIFFICULTY = 3; // 3 bands per difficulty level
  
  // Culling system (keeping your existing system)
  private hasCrossedFirstBand = false;
  private lastCullCheck = 0;
  private CULL_CHECK_INTERVAL = 1000;
  private CULL_DISTANCE = 600;
  private PLATFORM_CULL_DISTANCE = 200;
  private FADE_OUT_DURATION = 1000;
  
  // Death floor system (keeping your existing system)
  private deathFloor: PlatformDef | null = null;
  private highestPlayerY: number = 0;

  // Track last band's rects for reachability
  private lastBandRects: Array<{x:number;y:number;width:number;height:number}> = [];

  // ======= Jump envelope (conservative, tweak after a quick playtest) =======
  private MAX_ASCENT_SAFE = 120;   // max "up" delta you can land (px at scale=1)
  private MAX_DESCENT_CATCH = 48;  // how far down you can drop onto the next (px at scale=1)
  private MAX_RUN_REACH = 220;     // horizontal reach during a jump (px at scale=1)

  // Intrinsic PNG heights at scale=1 (grassy individual sprites)
  private DECOR_IMAGE_HEIGHT_PX: Record<string, number> = {
    'grass-1-final': 6,
    'grass-2-final': 6,
    'grass-3-final': 5,
    'mushroom-red-small-final': 7,
    'mushroom-green-small-final': 7,
    'tree-small-final': 21,
    'tree-medium-final': 42,
    'tree-large-final': 51,
  };

  // Intrinsic PNG widths at scale=1 (grassy individual sprites)
  private DECOR_IMAGE_WIDTH_PX: Record<string, number> = {
    'tree-small-final': 20,
    'tree-medium-final': 28,
    'tree-large-final': 36,
    'mushroom-red-small-final': 8,
    'mushroom-green-small-final': 8,
    'grass-1-final': 12,
    'grass-2-final': 14,
    'grass-3-final': 10,
  };

  // Decoration baselines: how many pixels ABOVE the image bottom the "feet" are.
  // Positive = lift the art UP by this much so it sits correctly on the platform.
  // Values here are for scale=1; we multiply by this.scale at runtime.
  private DECOR_BASELINE_PX: Record<string, number> = {
    'tree-large-final': 0,
    'tree-medium-final': 0,
    'tree-small-final': 0,
    'mushroom-red-small-final': 0,
    'mushroom-green-small-final': 0,
    'grass-1-final': 0,
    'grass-2-final': 0,
    'grass-3-final': 0,
  };

  // Optional: scale with difficulty a little (hard = slightly bigger gaps)
  private envelopeFor(diff: number) {
    const up   = this.MAX_ASCENT_SAFE  * (0.95 + 0.20 * diff) * this.scale;  // 120 → ~144, scaled
    const down = this.MAX_DESCENT_CATCH * (0.90 + 0.15 * diff) * this.scale; // 48  → ~55, scaled
    const run  = this.MAX_RUN_REACH    * (0.95 + 0.20 * diff) * this.scale;  // 220 → ~264, scaled
    return { up, down, run };
  }

  // Rectangle center helpers
  private cx(x: number, w: number) { return x + w * 0.5; }

  // Decoration baseline helper
  private getDecorBaselinePx(decorType: string): number {
    return this.DECOR_BASELINE_PX[decorType] ?? 0;
  }

  // Use the true image height (fallback to prefabHeightPx if unknown)
  private decorImageHeightPx(decorType: string): number {
    const base = this.DECOR_IMAGE_HEIGHT_PX[decorType];
    if (base != null) return Math.round(base * this.scale);
    return prefabHeightPx(this.mapName, decorType, this.scale);
  }

  // Use the true image width (fallback to prefabWidthPx if unknown)
  private decorImageWidthPx(decorType: string): number {
    const w = this.DECOR_IMAGE_WIDTH_PX[decorType];
    if (w != null) return Math.round(w * this.scale);
    // fallback to prefab width if missing
    return prefabWidthPx(this.mapName, decorType, this.scale);
  }

  // Debug flag for decoration placement
  private debugDecor = false; // Set to true to enable decoration debug logging

  // Decoration spawn knobs
  private TREE_SPAWN_CHANCE = 0.14;      // was ~0.25; set lower
  private TREE_CLUSTER_CHANCE = 0.06;    // rare second tree on same platform

  // Paired platform spacing
  private PAIR_VERTICAL_DELTA = 125; // px at scale=1

  // Limit auto-helpers so we don't spam
  private MAX_CHAIN_STEPS_PER_BAND = 3; // Increased to handle larger gaps
  
  // Chain step variety
  private CHAIN_STEP_TYPES = ['platform-wood-1-final', 'platform-grass-1-final', 'platform-wood-3-final'];
  private pickChainStepType() {
    return this.CHAIN_STEP_TYPES[Math.floor(Math.random() * this.CHAIN_STEP_TYPES.length)];
  }

  // Optional difficulty scaling (fewer trees at higher difficulty)
  private treeChanceAt(diff: number) {
    // slightly reduce as difficulty climbs
    return this.TREE_SPAWN_CHANCE * (1.0 - 0.25 * diff);
  }

  // Debug flag for platform placement
  private debugPlatforms = false;

  // Get difficulty at a given Y position
  private difficultyAtY(y: number): number {
    // Simple linear difficulty scaling based on how far down the player has gone
    const progress = Math.max(0, (this.floorWorldY - y) / (SCREEN_H * 10)); // 10 screens of progression
    return Math.min(1, progress);
  }

  // Keep platforms inside the band and above the floor.
  // hGuard makes the math safe if prefab height can't be resolved.
  private clampYForPlatform(y: number, h: number | undefined, bandTopY: number, bandBottomY: number): number {
    const topPad = 6, bottomPad = 6;
    const H = Math.max(1, Math.round(h ?? 16)); // guard for undefined/0
    const maxByBand  = bandBottomY - H - bottomPad;
    const maxByFloor = this.floorWorldY - H - 1; // 1px air above floor
    const maxY = Math.min(maxByBand, maxByFloor);
    const minY = bandTopY + topPad;
    return Math.max(minY, Math.min(Math.round(y), Math.round(maxY)));
  }

  // Greedy upward chain: ensure there's a path from a source up into this band.
  // Adds at most MAX_CHAIN_STEPS_PER_BAND tiny 'wood-1' steps.
  private buildAscendingChain(
    source: {x:number;y:number;width:number;height:number},
    placed: Array<{x:number;y:number;width:number;height:number;difficulty:string}>,
    env: { up:number; down:number; run:number },
    bandTopY: number,
    bandBottomY: number
  ) {
    let steps = 0;
    // Use variety for chain steps
    const stepType = this.pickChainStepType();
    const w = prefabWidthPx(this.mapName, stepType, this.scale);
    const h = prefabHeightPx(this.mapName, stepType, this.scale);

    // Try to find any existing target first (any reachable platform in the band that's above the source)
    const canReachExisting = () => {
      const reachableTargets = placed.filter(t => t.y < source.y && // only look for platforms above the source
        this.isReachableFrom(source.x, source.y, source.width, source.height,
                             t.x, t.y, t.width, t.height, env));
      // console.log(`[CHAIN] Source at (${source.x}, ${source.y}), found ${reachableTargets.length} reachable targets above`);
      return reachableTargets.length > 0;
    };

    while (!canReachExisting() && steps < this.MAX_CHAIN_STEPS_PER_BAND) {
      // console.log(`[CHAIN] Step ${steps + 1}: Building chain from (${source.x}, ${source.y})`);
      
      // Aim ~70–80% of the vertical envelope upward from current source
      const candidateY = Math.round(source.y - env.up * (0.75 + Math.random() * 0.1));
      const targetY = this.clampYForPlatform(candidateY, h, bandTopY, bandBottomY);

      // Choose left/right offset within horizontal envelope
      let x = this.cx(source.x, source.width)
            + (Math.random() < 0.5 ? -1 : 1) * Math.round(env.run * (0.45 + Math.random()*0.15))
            - w * 0.5;

      // Clamp onscreen (use WORLD_W if you have it; SCREEN_W otherwise)
      x = Math.max(0, Math.min(x, SCREEN_W - w));

      // Use proper spacing check like normal placements
      const minHGap = 20, minVGap = 15;
      const stepEnv = this.envelopeFor(this.difficultyAtY(targetY));
      
      if (this.isPositionClearForPlacement(
            x, targetY, w, h,
            placed,              // placed in this band
            minHGap, minVGap,    // spacing gaps
            stepEnv,
            []                   // no previous band for chain steps
          )) {
        const step = this.createPlatform(stepType, x, targetY, 'platform');
        if (step) {
          this.platforms.set(step.id, step);
          placed.push({ x, y: targetY, width: w, height: h, difficulty: 'chain-step' });
        } else {
          break; // Skip if platform was rejected
        }
      } else {
        // Try nudging horizontally once
        x = Math.max(0, Math.min(x + (Math.random()<0.5?-20:20), SCREEN_W - w));
        if (this.isPositionClearForPlacement(x, targetY, w, h, placed, minHGap, minVGap, stepEnv, [])) {
          const step = this.createPlatform(stepType, x, targetY, 'platform');
          if (step) {
            this.platforms.set(step.id, step);
            placed.push({ x, y: targetY, width: w, height: h, difficulty: 'chain-step' });
          } else {
            break; // Skip if platform was rejected
          }
        } else {
          // Skip this step if we can't find a clear spot
          break;
        }
      }

      // Advance the "source" upward
      source = { x, y: targetY, width: w, height: h };
      steps++;
    }
    
    // if (steps >= this.MAX_CHAIN_STEPS_PER_BAND) {
    //   console.log(`[CHAIN] Reached max steps (${this.MAX_CHAIN_STEPS_PER_BAND}), stopping chain building`);
    // } else {
    //   console.log(`[CHAIN] Found reachable target after ${steps} steps`);
    // }
  }

  // Ensure every platform has a reachable next step
  private ensureForwardReachability(
    placed: Array<{x:number;y:number;width:number;height:number;difficulty:string}>,
    env: { up:number; down:number; run:number },
    bandTopY: number,
    bandBottomY: number,
    prevRects: Array<{x:number;y:number;width:number;height:number}>
  ) {
    // console.log(`[REACHABILITY] Checking reachability: ${placed.length} platforms, ${prevRects.length} prev platforms`);
    // console.log(`[REACHABILITY] Envelope: up=${env.up}, down=${env.down}, run=${env.run}`);
    // console.log(`[REACHABILITY] Platforms in band:`, placed.map(p => `(${p.x}, ${p.y})`).join(', '));
    
    // 1) Connect from the most relevant previous platform (the highest one),
    //    because that's the one the player is most likely to stand on.
    if (prevRects.length) {
      const highestPrev = prevRects.reduce((a,b)=> (a.y < b.y ? a : b)); // smaller y = higher
      // console.log(`[REACHABILITY] Building chain from highest prev platform at (${highestPrev.x}, ${highestPrev.y})`);
      this.buildAscendingChain(highestPrev, placed, env, bandTopY, bandBottomY);
    }

    // 2) Also make sure there is a path upward starting from the lowest platform in this band.
    if (placed.length) {
      const lowestInBand = placed.reduce((a,b)=> (a.y > b.y ? a : b));
      // console.log(`[REACHABILITY] Building chain from lowest band platform at (${lowestInBand.x}, ${lowestInBand.y})`);
      this.buildAscendingChain(lowestInBand, placed, env, bandTopY, bandBottomY);
    }
    
    // console.log(`[REACHABILITY] Final platform count: ${placed.length}`);
  }

  // Is B reachable from A given the envelope?
  private isReachableFrom(
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number,
    env: { up: number; down: number; run: number; }
  ): boolean {
    // vertical: B must be no more than 'up' above A's top, and not farther than 'down' below
    const dy = (by) - (ay); // negative = above
    if (dy < -env.up) return false;         // too high
    if (dy >  env.down) return false;       // too far below to drop-catch

    // horizontal: center-to-center reach
    const dx = Math.abs(this.cx(bx, bw) - this.cx(ax, aw));
    if (dx > env.run) return false;

    return true;
  }
  
  constructor(mapName: MapName, floorScreenY: number, scale = 2) {
    this.mapName = mapName;
    this.scale = scale;
    this.floorWorldY = floorScreenY;
    // Start the first band close to the floor so the first view isn't empty
    this.generatedMinWorldY = this.floorWorldY - (SCREEN_H * 0.9);
    
    // Generate initial content
    this.generateFloor();
    // Seed a small, guaranteed-reachable set right above the floor,
    // then continue with normal challenge generation.
    this.generateStarterBandNearFloor();
    this.generateInitialChallenges();
  }

  private getChallengeLevel(): ChallengeLevel {
    const index = Math.min(this.currentChallengeIndex, CHALLENGE_LEVELS.length - 1);
    return CHALLENGE_LEVELS[index];
  }

  private progressDifficulty(): void {
    this.bandsGeneratedAtCurrentLevel++;
    if (this.bandsGeneratedAtCurrentLevel >= this.BANDS_PER_DIFFICULTY) {
      this.currentChallengeIndex = Math.min(this.currentChallengeIndex + 1, CHALLENGE_LEVELS.length - 1);
      this.bandsGeneratedAtCurrentLevel = 0;
      console.log(`[PlatformManager] Advanced to ${this.getChallengeLevel().name} difficulty`);
    }
  }

  private isSolidPrefab(prefab: string): boolean {
    return prefab === 'floor-final' || prefab.startsWith('platform-');
  }

  private createPlatform(prefab: string, worldX: number, worldY: number, type: 'platform' | 'decoration' = 'platform'): PlatformDef | null {
    const id = `${type}_${this.platformCounter++}`;
    const width = prefabWidthPx(this.mapName, prefab, this.scale);
    const height = prefabHeightPx(this.mapName, prefab, this.scale);
    
    // Hard floor sanity: compare platform bottom to floor, and snap instead of rejecting
    if (type === 'platform') {
      const bottom = worldY + height;
      if (bottom > this.floorWorldY - 1) {
        // snap to sit exactly above the floor with a 1px air gap
        worldY = this.floorWorldY - height - 1;
      }
    }
    
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

    const finalY = Math.round(worldY);
    
    // Quick debug to confirm (remove after)
    if (this.debugPlatforms) {
      const h = prefabHeightPx(this.mapName, prefab, this.scale);
      const bottom = finalY + h;
      console.log('[PLACE]', { type: prefab, y: finalY, h, bottom, floor: this.floorWorldY });
    }

    return {
      id,
      type,
      prefab,
      x: Math.round(worldX),
      y: finalY,
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
      if (platform) {
      this.platforms.set(platform.id, platform);
    }
    }
  }

  /**
   * Guarantees at least two reachable platforms within the first view above the floor.
   * Prevents "only floor" starts caused by unlucky first-band placement.
   */
  private generateStarterBandNearFloor(): void {
    // Band bounds: a little above the floor, ~60% of a screen tall
    const bandBottom = this.floorWorldY - 60;
    const bandTop    = bandBottom - Math.round(SCREEN_H * 0.6);

    // First platform: wide/easy, near middle
    const p1Type = Math.random() < 0.5 ? 'platform-grass-3-final' : 'platform-wood-3-final';
    const p1W = prefabWidthPx(this.mapName, p1Type, this.scale);
    const p1H = prefabHeightPx(this.mapName, p1Type, this.scale);
    const p1X = Math.round((SCREEN_W - p1W) * (0.35 + Math.random() * 0.3));
    const p1Y = this.clampYForPlatform(bandBottom - 140, p1H, bandTop, bandBottom);
    const p1 = this.createPlatform(p1Type, p1X, p1Y, 'platform');
    if (p1) {
      this.platforms.set(p1.id, p1);
      this.generateDecorationsFor(p1);
    }

    // Second platform: a bit higher and horizontally offset
    const p2Type = Math.random() < 0.5 ? 'platform-wood-1-final' : 'platform-grass-1-final';
    const p2W = prefabWidthPx(this.mapName, p2Type, this.scale);
    const p2H = prefabHeightPx(this.mapName, p2Type, this.scale);
    const offset = Math.round(Math.min(SCREEN_W * 0.25, p1W + 120));
    const rawX = (p1X + (Math.random() < 0.5 ? -offset : offset));
    const p2X = Math.max(20, Math.min(SCREEN_W - p2W - 20, rawX));
    const p2Y = this.clampYForPlatform(p1Y - 160, p2H, bandTop, bandBottom);
    const p2 = this.createPlatform(p2Type, p2X, p2Y, 'platform');
    if (p2) {
      this.platforms.set(p2.id, p2);
      this.generateDecorationsFor(p2);
    }

    // Seed reachability state for the next band
    const rects: Array<{x:number;y:number;width:number;height:number}> = [];
    if (p1) rects.push({ x: p1.x, y: p1.y, width: p1W, height: p1H });
    if (p2) rects.push({ x: p2.x, y: p2.y, width: p2W, height: p2H });
    if (rects.length) this.lastBandRects = rects;
  }

  private generateInitialChallenges(): void {
    // Generate 4 challenge bands initially
    for (let i = 0; i < 4; i++) {
      const bandHeight = SCREEN_H * 0.9;
      const bandBottomWorldY = this.generatedMinWorldY;
      const bandTopWorldY = bandBottomWorldY - bandHeight;
      
      this.generateChallengeSegment(bandTopWorldY, bandBottomWorldY);
      this.generatedMinWorldY = bandTopWorldY;
      this.progressDifficulty();
    }
  }

  private generateChallengeSegment(topY: number, bottomY: number): void {
    const challengeLevel = this.getChallengeLevel();
    const segmentHeight = bottomY - topY;
    
    console.log(`[PlatformManager] Generating ${challengeLevel.name} challenge segment`);

    // Calculate envelope for this difficulty level
    const diff = this.currentChallengeIndex / (CHALLENGE_LEVELS.length - 1); // 0 to 1
    const env = this.envelopeFor(diff);

    // Track placed platforms for reachability
    const placed: Array<{x:number;y:number;width:number;height:number;difficulty:string}> = [];

    // Create challenge chains
    const chains = this.createChallengeChains(topY, bottomY, challengeLevel, env);
    
    // Place all platforms from chains
    for (const chain of chains) {
      for (const platformSpec of chain.platforms) {
        const platform = this.createPlatform(
          platformSpec.prefab,
          platformSpec.x,
          platformSpec.y,
          'platform'
        );
        if (platform) {
          this.platforms.set(platform.id, platform);
          
          // Track placed platform
          const width = prefabWidthPx(this.mapName, platformSpec.prefab, this.scale);
          const height = prefabHeightPx(this.mapName, platformSpec.prefab, this.scale);
          placed.push({
            x: platformSpec.x,
            y: platformSpec.y,
            width,
            height,
            difficulty: chain.difficulty
          });
          
          // Add decorations if it's a grass platform
          if (platformSpec.prefab.includes('grass')) {
            this.generateDecorationsFor(platform);
          }
        }
      }
    }

    // Capture the previous band before we mutate it
    const prevRects = this.lastBandRects.slice();

    // Ensure a couple of safe connections (prev → this band, plus one anchor)
    this.ensureForwardReachability(placed, env, topY, bottomY, prevRects);

    // Now update for the next band
    this.lastBandRects = placed.map(p => ({ x: p.x, y: p.y, width: p.width, height: p.height }));

    // Safety bridge: ensure at least one platform in this band is reachable from below
    const hasReachableFromBelow = placed.some(b => 
      this.lastBandRects.some(a => this.isReachableFrom(a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height, env))
    );

    if (!hasReachableFromBelow && this.lastBandRects.length) {
      // Insert a slim "bridge" roughly between the nearest below rect and this band midpoint
      const below = this.lastBandRects.reduce((best, r) => (r.y > best.y ? r : best), this.lastBandRects[0]);
      const type = 'platform-wood-1-final';
      const w = prefabWidthPx(this.mapName, type, this.scale);
      const h = prefabHeightPx(this.mapName, type, this.scale);

      const targetY = Math.max(topY + 8, below.y - env.up * 0.9);
      // horizontally try to line up with below center but keep within run reach
      let x = this.cx(below.x, below.width) - w * 0.5;
      x = Math.max(0, Math.min(x, SCREEN_W - w)); // keep on screen

      // nudge within horizontal reach if needed
      if (!this.isReachableFrom(below.x, below.y, below.width, below.height, x, targetY, w, h, env)) {
        if (this.cx(x, w) > this.cx(below.x, below.width)) {
          x = this.cx(below.x, below.width) + (env.run * 0.9) - w * 0.5;
        } else {
          x = this.cx(below.x, below.width) - (env.run * 0.9) - w * 0.5;
        }
      }

      const p = this.createPlatform(type, x, targetY, 'platform');
      if (p) {
        this.platforms.set(p.id, p);
        this.generateDecorationsFor(p);
        placed.push({ x, y: targetY, width: w, height: h, difficulty: 'bridge' });
      }
    }
  }

  private createChallengeChains(topY: number, bottomY: number, level: ChallengeLevel, env: { up: number; down: number; run: number }): PlatformChain[] {
    const chains: PlatformChain[] = [];
    const segmentHeight = bottomY - topY;
    const platformCount = Math.floor(segmentHeight / SCREEN_H * level.platformDensity);
    
    let currentY = bottomY - 100; // Start near bottom of segment
    let lastPlatformX = SCREEN_W * 0.5; // Start in middle
    let pairPlacedThisBand = false; // Limit to one pair per band
    
    // Ensure at least one platform at the top for continuity
    const bridgeY = this.clampYForPlatform(topY + 50, 0, topY, bottomY);
    const bridgePlatform = this.createBridgePlatform(bridgeY);
    if (bridgePlatform) {
      chains.push({
        platforms: [bridgePlatform],
        difficulty: 'bridge'
      });
    }

    for (let i = 0; i < platformCount; i++) {
      // Decide on challenge type
      const shouldCreateCrossScreen = Math.random() < level.crossScreenChance;
      const shouldCreatePair = Math.random() < level.pairPlatformChance;

      if (shouldCreateCrossScreen && !shouldCreatePair) {
        // Cross-screen jump challenge
        const chain = this.createCrossScreenChain(lastPlatformX, currentY, level, env);
        if (chain && chain.platforms.length > 0) {
          chains.push(chain);
          // Update position for next chain
          const lastPlatform = chain.platforms[chain.platforms.length - 1];
          lastPlatformX = lastPlatform.x;
          currentY = this.clampYForPlatform(
            lastPlatform.y - this.randomBetween(level.minGapY * 1.5, level.maxGapY * 1.5),
            0, topY, bottomY
          );
        }
      } else if (shouldCreatePair && !pairPlacedThisBand) {
        // Left-right platform pair (max one per band)
        const chain = this.createPlatformPair(currentY, level, env);
        if (chain && chain.platforms.length > 0) {
          chains.push(chain);
          // Next platform should connect to one of the pair platforms
          const connectTarget = Math.random() < 0.5 ? chain.platforms[0] : chain.platforms[1];
          lastPlatformX = connectTarget.x;
          currentY = this.clampYForPlatform(
            connectTarget.y - this.randomBetween(level.minGapY, level.maxGapY),
            0, topY, bottomY
          );
          pairPlacedThisBand = true;
        }
      } else {
        // Regular challenging jump
        const chain = this.createRegularJumpChain(lastPlatformX, currentY, level, env);
        if (chain && chain.platforms.length > 0) {
          chains.push(chain);
          const lastPlatform = chain.platforms[chain.platforms.length - 1];
          lastPlatformX = lastPlatform.x;
          currentY = this.clampYForPlatform(
            lastPlatform.y - this.randomBetween(level.minGapY, level.maxGapY),
            0, topY, bottomY
          );
        }
      }
      
      // Ensure we don't go above the segment
      if (currentY < topY + 100) {
          break;
        }
      }
        
    return chains;
  }

  private createBridgePlatform(y: number): any {
    const prefabs = ['platform-grass-3-final', 'platform-wood-3-final'];
    const prefab = prefabs[Math.floor(Math.random() * prefabs.length)];
    const width = prefabWidthPx(this.mapName, prefab, this.scale);
    
    // Place near middle for easy access
    const x = (SCREEN_W - width) * (0.3 + Math.random() * 0.4);
    
    return { prefab, x, y, isLanding: true };
  }

  private createCrossScreenChain(startX: number, startY: number, level: ChallengeLevel, env: { up: number; down: number; run: number }): PlatformChain {
    const platforms = [];
    
    // Determine which side of screen to jump to
    const goingLeft = startX > SCREEN_W * 0.5;
    const targetSide = goingLeft ? 0 : SCREEN_W;
    
    // Create launch platform
    const launchPrefab = Math.random() < 0.5 ? 'platform-grass-1-final' : 'platform-wood-1-final';
    const launchWidth = prefabWidthPx(this.mapName, launchPrefab, this.scale);
    const launchX = goingLeft ? SCREEN_W - launchWidth - 20 : 20;
    
    platforms.push({
      prefab: launchPrefab,
      x: launchX,
      y: startY,
      isLanding: true
    });
    
    // Create landing platform on opposite side
    const landingPrefab = Math.random() < 0.6 ? 'platform-grass-3-final' : 'platform-wood-3-final';
    const landingWidth = prefabWidthPx(this.mapName, landingPrefab, this.scale);
    const landingX = goingLeft ? 20 : SCREEN_W - landingWidth - 20;
    const landingY = this.clampYForPlatform(
      startY - this.randomBetween(level.minGapY, level.maxGapY),
      prefabHeightPx(this.mapName, landingPrefab, this.scale),
      startY - 200, startY + 50 // band bounds around the landing area
    );
    
    // Hard guard: keep within the envelope relative to launch platform
    const pos = { x: landingX, y: landingY };
    const ref = { x: launchX, y: startY };
    
    if (pos) {
      // Hard guard: keep within the envelope relative to 'ref'
      pos.y = Math.min(pos.y, ref.y + Math.round(env.down * 0.95));      // not too far below
      pos.y = Math.max(pos.y, ref.y - Math.round(env.up   * 0.95));      // not too far above

      const maxDx = Math.round(env.run * 0.95);
      if (pos.x < ref.x - maxDx) pos.x = ref.x - maxDx;
      if (pos.x > ref.x + maxDx) pos.x = ref.x + maxDx;
    }
    
    platforms.push({
      prefab: landingPrefab,
      x: pos.x,
      y: pos.y,
      isLanding: true
    });

    return {
      platforms,
      difficulty: 'cross-screen'
    };
  }

  private createPlatformPair(y: number, level: ChallengeLevel, env: { up: number; down: number; run: number }): PlatformChain {
    const platforms = [];
    const delta = Math.round(this.PAIR_VERTICAL_DELTA * this.scale);
    
    // Pick a baseline Y that keeps both platforms within reasonable bounds
    const baseY = y;
    const leftY = baseY + delta;  // lower one on left
    const rightY = baseY;         // upper one on right
    
    const leftType = 'platform-wood-2-left-final';
    const rightType = 'platform-wood-2-right-final';
    
    const leftWidth = prefabWidthPx(this.mapName, leftType, this.scale);
    const rightWidth = prefabWidthPx(this.mapName, rightType, this.scale);
    
    // Flush left/right
    const leftX = 0;
    const rightX = Math.max(0, SCREEN_W - rightWidth);
    
    platforms.push({
      prefab: leftType,
      x: leftX,
      y: leftY,
      isLanding: true
    });
    
    platforms.push({
      prefab: rightType,
      x: rightX,
      y: rightY,
      isLanding: true
    });

    return {
      platforms,
      difficulty: 'platform-pair'
    };
  }

  private createRegularJumpChain(lastX: number, currentY: number, level: ChallengeLevel, env: { up: number; down: number; run: number }): PlatformChain {
    const platforms = [];
    
    // Choose platform type
    const prefabs = [
      'platform-grass-1-final',
      'platform-grass-3-final',
      'platform-wood-1-final',
      'platform-wood-3-final'
    ];
    const prefab = prefabs[Math.floor(Math.random() * prefabs.length)];
    const width = prefabWidthPx(this.mapName, prefab, this.scale);
    
    // Calculate challenging but achievable position
    const gapX = this.randomBetween(level.minGapX, level.maxGapX);
    const direction = Math.random() < 0.5 ? -1 : 1;
    let targetX = lastX + (direction * gapX);
    
    // Ensure platform stays on screen with some margin
    const margin = 40;
    targetX = Math.max(margin, Math.min(SCREEN_W - width - margin, targetX));
    
    // Hard guard: keep within the envelope relative to last platform
    const pos = { x: targetX, y: currentY };
    const ref = { x: lastX, y: currentY + this.randomBetween(level.minGapY, level.maxGapY) }; // reference point
    
    if (pos) {
      // Hard guard: keep within the envelope relative to 'ref'
      pos.y = Math.min(pos.y, ref.y + Math.round(env.down * 0.95));      // not too far below
      pos.y = Math.max(pos.y, ref.y - Math.round(env.up   * 0.95));      // not too far above

      const maxDx = Math.round(env.run * 0.95);
      if (pos.x < ref.x - maxDx) pos.x = ref.x - maxDx;
      if (pos.x > ref.x + maxDx) pos.x = ref.x + maxDx;
    }
    
    platforms.push({
      prefab,
      x: pos.x,
      y: pos.y,
      isLanding: true
    });

    return {
      platforms,
      difficulty: 'regular'
    };
  }

  private randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  // Reachability-enforced placement method
  private isPositionClearForPlacement(
    worldX: number,
    worldY: number,
    width: number,
    height: number,
    placed: Array<{x:number;y:number;width:number;height:number;difficulty:string}>,
    minHGap: number,
    minVGap: number,
    env: { up:number; down:number; run:number },
    neighborRects: Array<{x:number;y:number;width:number;height:number}>
  ): boolean {
    // spacing vs already-placed in this band
    const ax1 = worldX, ay1 = worldY, ax2 = worldX + width, ay2 = worldY + height;
    for (const p of placed) {
      const bx1 = p.x, by1 = p.y, bx2 = p.x + p.width, by2 = p.y + p.height;
      const tooCloseH = (ax2 + minHGap > bx1) && (bx2 + minHGap > ax1);
      const tooCloseV = (ay2 + minVGap > by1) && (by2 + minVGap > ay1);
      if (tooCloseH && tooCloseV) return false;

      // radial blue-noise
      const cxA = (ax1 + ax2) * 0.5, cyA = (ay1 + ay2) * 0.5;
      const cxB = (bx1 + bx2) * 0.5, cyB = (by1 + by2) * 0.5;
      const minRad = Math.max(minHGap, minVGap) * 0.75;
      const dx = cxA - cxB, dy = cyA - cyB;
      if (dx*dx + dy*dy < minRad*minRad) return false;
    }

    // ---- NEW: reachability requirement ----
    // Candidate must be reachable from at least ONE neighbor:
    // - any already placed in this band, OR
    // - something from the previous band below (bridges band seams)
    const neighbors: Array<{x:number;y:number;width:number;height:number}> =
      placed.length ? placed.map(p => ({ x:p.x, y:p.y, width:p.width, height:p.height })) : [];
    neighbors.push(...neighborRects);

    for (const n of neighbors) {
      if (this.isReachableFrom(n.x, n.y, n.width, n.height, worldX, worldY, width, height, env)) {
    return true;
      }
    }
    return false;
  }

  private generateDecorationsFor(platform: PlatformDef): void {
    if (!platform.collision?.solid) return;
    
    const isGrass3 = platform.prefab === 'platform-grass-3-final';
    const isGrass1 = platform.prefab === 'platform-grass-1-final';
    
    if (!isGrass3 && !isGrass1) return;
    
    const segments = prefabTopSolidSegmentsPx(this.mapName, platform.prefab, platform.scale);
    const segment = segments[0];
    if (!segment) return;
    
    const surfaceWorldY = platform.collision.topY;
    const tileSize = getTileSize(this.mapName) * this.scale;
    const numTiles = Math.floor(segment.w / tileSize);
    const occupiedTiles = new Set<number>();
    
    // Trees (only on grass-3)
    if (isGrass3) {
      const diff = this.difficultyAtY(platform.y);
      if (Math.random() < this.treeChanceAt(diff)) {
        const treeTypes = ['tree-large-final', 'tree-medium-final', 'tree-small-final'];
        const treeType = treeTypes[Math.floor(Math.random() * treeTypes.length)];
        const tileIndex = Math.floor(Math.random() * numTiles);
        
        const chosenX = platform.x + segment.x + (tileIndex * tileSize);
        const treeW = this.decorImageWidthPx(treeType);
        const minX = Math.round(platform.x);
        const maxX = Math.round(platform.x + (platform.collision?.width || 0) - treeW);
        const treeX = Math.max(minX, Math.min(Math.round(chosenX), maxX));
        const treeHeight = this.decorImageHeightPx(treeType);
        const baselinePx = Math.round(this.getDecorBaselinePx(treeType) * this.scale);
        const treeY = Math.round(surfaceWorldY - (treeHeight - baselinePx));
        
        if (this.debugDecor) {
          const bottom = treeY + treeHeight;
          console.log('[DECOR ALIGN]', { type: treeType, bottom, surfaceWorldY });
          console.log('[DECOR]', treeType, { platformTopY: surfaceWorldY, decorY: treeY, baselinePx, decorH: treeHeight });
        }
        
        const tree = this.createPlatform(treeType, treeX, treeY, 'decoration');
        if (tree) {
            this.platforms.set(tree.id, tree);
        }
            occupiedTiles.add(tileIndex);

        // Maybe place a second tree on the opposite half
        if (Math.random() < this.TREE_CLUSTER_CHANCE) {
          const secondTreeType = treeTypes[Math.floor(Math.random() * treeTypes.length)];
          const oppositeHalf = tileIndex < numTiles / 2 ? 
            Math.floor(Math.random() * (numTiles - numTiles / 2)) + numTiles / 2 :
            Math.floor(Math.random() * (numTiles / 2));
          
          const secondChosenX = platform.x + segment.x + (oppositeHalf * tileSize);
          const secondTreeW = this.decorImageWidthPx(secondTreeType);
          const secondTreeX = Math.max(minX, Math.min(Math.round(secondChosenX), maxX));
          const secondTreeHeight = this.decorImageHeightPx(secondTreeType);
          const secondTreeY = Math.round(surfaceWorldY - (secondTreeHeight - baselinePx));
          
          const secondTree = this.createPlatform(secondTreeType, secondTreeX, secondTreeY, 'decoration');
          if (secondTree) {
            this.platforms.set(secondTree.id, secondTree);
          }
          occupiedTiles.add(oppositeHalf);
        }
      }
    }
    
    // Mushrooms
    if (Math.random() < 0.3) {
      const mushroomTypes = ['mushroom-red-small-final', 'mushroom-green-small-final'];
      const mushroomType = mushroomTypes[Math.floor(Math.random() * mushroomTypes.length)];
      
        const availableTiles = Array.from({length: numTiles}, (_, i) => i)
        .filter(i => !occupiedTiles.has(i));
        
        if (availableTiles.length > 0) {
          const tileIndex = availableTiles[Math.floor(Math.random() * availableTiles.length)];
        const mushroomX = Math.round(platform.x + segment.x + (tileIndex * tileSize));
        const mushroomHeight = this.decorImageHeightPx(mushroomType);
        const baselinePx = Math.round(this.getDecorBaselinePx(mushroomType) * this.scale);
        const mushroomY = Math.round(surfaceWorldY - (mushroomHeight - baselinePx));
        
        if (this.debugDecor) {
          const bottom = mushroomY + mushroomHeight;
          console.log('[DECOR ALIGN]', { type: mushroomType, bottom, surfaceWorldY });
          console.log('[DECOR]', mushroomType, { platformTopY: surfaceWorldY, decorY: mushroomY, baselinePx, decorH: mushroomHeight });
        }
        
        const mushroom = this.createPlatform(mushroomType, mushroomX, mushroomY, 'decoration');
        if (mushroom) {
          this.platforms.set(mushroom.id, mushroom);
        }
          occupiedTiles.add(tileIndex);
      }
    }
    
    // Grass tufts
    const maxGrass = isGrass3 ? 2 : 1;
      for (let i = 0; i < maxGrass; i++) {
      if (Math.random() < 0.7) {
        const grassTypes = ['grass-1-final', 'grass-2-final', 'grass-3-final'];
        const grassType = grassTypes[Math.floor(Math.random() * grassTypes.length)];
        
          const availableTiles = Array.from({length: numTiles}, (_, i) => i)
          .filter(i => !occupiedTiles.has(i));
          
          if (availableTiles.length > 0) {
            const tileIndex = availableTiles[Math.floor(Math.random() * availableTiles.length)];
          const grassX = Math.round(platform.x + segment.x + (tileIndex * tileSize));
          const grassHeight = this.decorImageHeightPx(grassType);
          const baselinePx = Math.round(this.getDecorBaselinePx(grassType) * this.scale);
          const grassY = Math.round(surfaceWorldY - (grassHeight - baselinePx));
          
          if (this.debugDecor) {
            const bottom = grassY + grassHeight;
            console.log('[DECOR ALIGN]', { type: grassType, bottom, surfaceWorldY });
            console.log('[DECOR]', grassType, { platformTopY: surfaceWorldY, decorY: grassY, baselinePx, decorH: grassHeight });
          }
          
          const grass = this.createPlatform(grassType, grassX, grassY, 'decoration');
          if (grass) {
            this.platforms.set(grass.id, grass);
          }
            occupiedTiles.add(tileIndex);
        }
      }
    }
  }

  // Keep all your existing methods for compatibility
  updateForCamera(cameraY: number, playerWorldY: number): boolean {
    const generateAheadWorldY = playerWorldY - SCREEN_H * 2;
    let generated = false;
    
    if (!this.hasCrossedFirstBand && playerWorldY < this.floorWorldY - SCREEN_H * 0.8) {
      this.hasCrossedFirstBand = true;
    }
    
    if (this.generatedMinWorldY > generateAheadWorldY) {
      while (this.generatedMinWorldY > generateAheadWorldY) {
        const bandHeight = SCREEN_H * 0.9;
        const bandBottomWorldY = this.generatedMinWorldY;
        const bandTopWorldY = bandBottomWorldY - bandHeight;
        
        this.generateChallengeSegment(bandTopWorldY, bandBottomWorldY);
        this.generatedMinWorldY = bandTopWorldY;
        this.progressDifficulty();
        generated = true;
      }
    }
    
    // Keep your existing culling logic
    if (this.hasCrossedFirstBand) {
      const now = Date.now();
      if (now - this.lastCullCheck > this.CULL_CHECK_INTERVAL) {
        this.lastCullCheck = now;
        
        const cullBelowWorldY = playerWorldY + this.PLATFORM_CULL_DISTANCE;
        const culledParentPlatforms: PlatformDef[] = [];
        
        this.platforms.forEach((platform) => {
          if (platform.type === 'platform' && platform.y > cullBelowWorldY && !platform.fadeOut) {
            this.startFadeOut(platform);
            culledParentPlatforms.push(platform);
            generated = true;
          }
        });
        
        // Fade decorations near culled platforms
        this.platforms.forEach((platform) => {
          if (platform.type === 'decoration' && !platform.fadeOut) {
            const isNearCulledParent = culledParentPlatforms.some(parentPlatform => {
              const decorationCenterX = platform.x + (prefabWidthPx(this.mapName, platform.prefab, this.scale) / 2);
              const parentCenterX = parentPlatform.x + (parentPlatform.collision?.width || prefabWidthPx(this.mapName, parentPlatform.prefab, this.scale)) / 2;
              const horizontalDistance = Math.abs(decorationCenterX - parentCenterX);
              const verticalDistance = Math.abs(platform.y - parentPlatform.y);
              
              return horizontalDistance < 200 && verticalDistance < 100;
            });
            
            if (isNearCulledParent) {
              this.startFadeOut(platform);
              generated = true;
            }
          }
        });
      }
    }
    
    return generated;
  }

  // Keep all existing methods (getSolidPlatforms, getAllPlatforms, etc.)
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
    
    if (this.deathFloor && !nearbyPlatforms.includes(this.deathFloor)) {
      nearbyPlatforms.push(this.deathFloor);
    }
    
    return nearbyPlatforms;
  }

  // Keep all existing death floor and fade-out methods...
  updateDeathFloor(playerWorldY: number): void {
    if (!this.hasCrossedFirstBand) {
      if (this.deathFloor) {
        this.platforms.delete(this.deathFloor.id);
        this.deathFloor = null;
      }
      this.highestPlayerY = 0;
      return;
    }

    if (playerWorldY < this.highestPlayerY || this.highestPlayerY === 0) {
      this.highestPlayerY = playerWorldY;
    }

    if (!this.deathFloor) {
      const spawnY = this.highestPlayerY + this.CULL_DISTANCE;
      this.deathFloor = this.createDeathFloor(spawnY);
      this.platforms.set(this.deathFloor.id, this.deathFloor);
    } else {
      const targetY = this.highestPlayerY + this.CULL_DISTANCE;
      
      if (Math.abs(targetY - this.deathFloor.y) > 10) {
        this.deathFloor.y = targetY;
        if (this.deathFloor.collision) {
          this.deathFloor.collision.topY = targetY + 40;
        }
      }
    }
  }

  updateHighestPointOnLanding(platformTopY: number): void {
    if (!this.hasCrossedFirstBand) return;

    if (platformTopY < this.highestPlayerY || this.highestPlayerY === 0) {
      this.highestPlayerY = platformTopY;
    }
  }

  private createDeathFloor(worldY: number): PlatformDef {
    const id = `death_floor_${this.platformCounter++}`;
    const width = SCREEN_W * 2;
    
    return {
      id,
      type: 'platform',
      prefab: 'floor-final',
      x: -SCREEN_W / 2,
      y: worldY,
      scale: this.scale,
      collision: {
        solid: true,
        topY: worldY + 40,
        left: -SCREEN_W / 2,
        right: width - SCREEN_W / 2,
        width,
        height: 100,
      },
    };
  }

  isDeathFloor(platform: PlatformDef): boolean {
    return platform.id === this.deathFloor?.id;
  }

  getDeathFloor(): PlatformDef | null {
    return this.deathFloor;
  }

  updateFadeOutAnimations(): boolean {
    const now = Date.now();
    const toRemove: string[] = [];
    let hasChanges = false;

    this.platforms.forEach((platform, id) => {
      if (platform.fadeOut) {
        const elapsed = now - platform.fadeOut.startTime;
        const progress = Math.min(elapsed / platform.fadeOut.duration, 1.0);
        
        const easeOut = 1 - Math.pow(1 - progress, 3);
        platform.fadeOut.opacity = Math.max(0, 1 - easeOut);
        
        if (progress >= 1.0) {
          toRemove.push(id);
          hasChanges = true;
        }
      }
    });

    toRemove.forEach(id => this.platforms.delete(id));
    return hasChanges;
  }

  private startFadeOut(platform: PlatformDef): void {
    if (!platform.fadeOut) {
      platform.fadeOut = {
        startTime: Date.now(),
        duration: this.FADE_OUT_DURATION,
        opacity: 1.0
      };
    }
  }

  getFloorWorldY(): number {
    return this.floorWorldY;
  }

  debugPlatformsNearY(worldY: number, range = 200): void {
    const nearby = Array.from(this.platforms.values()).filter(p => 
      Math.abs(p.y - worldY) < range
    );
  }

  // Debug method to check current challenge level
  getCurrentChallenge(): { level: string; bandsAtLevel: number; totalBands: number } {
    return {
      level: this.getChallengeLevel().name,
      bandsAtLevel: this.bandsGeneratedAtCurrentLevel,
      totalBands: Math.floor((this.floorWorldY - this.generatedMinWorldY) / (SCREEN_H * 0.9))
    };
  }
}