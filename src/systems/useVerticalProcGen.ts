import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions } from 'react-native';
import type { Platform } from '../content/levels';
import { prefabWidthPx, prefabTopSolidSegmentsPx, prefabHeightPx, alignPrefabYToSurfaceTop } from '../content/maps';

type MapName = keyof typeof import('../content/maps').MAPS;

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

export type ProcGenState = {
  platforms: Platform[];
  decorations: Platform[];
  cameraY: number;
};

type Opts = {
  mapName: MapName;
  floorTopY: number;
  initialPlatforms: Platform[]; // typically just the floor pieces now
  initialDecorations: Platform[]; // optional ground props
  scale?: number;
  maxScreens?: number; // default 10 screens
  initialBands?: number; // NEW: how many bands to pre-generate on load (default 1)
};

const PROCGEN_DEFAULTS = {
  MAX_SCREENS: 10,
  EDGE_MARGIN: 40,
  MIN_DX: 120,
  MIN_DY: 100,
  ATTEMPTS_PER_BAND: 8, // Reduced from 12
  PLATFORM_WEIGHTS: [
    ['platform-grass-1-final', 3],
    ['platform-grass-3-final', 2],
    ['platform-wood-1-final',  2],
    ['platform-wood-3-final',  1],
    ['platform-wood-2-left-final', 1],
    ['platform-wood-2-right-final', 1],
  ] as Array<[string, number]>,
  TREE_TRY: { large: 0.20, medium: 0.40, small: 0.60 },
  MUSHROOM_P: 0.60,
  GRASS_P: 0.80,
  MAX_MUSH_GRASS3: 2,
  MAX_MUSH_GRASS1: 1,
  MAX_GRASS_GRASS3: 3,
  MAX_GRASS_GRASS1: 1,
};

const AHEAD_BUFFER_SCREENS = 3.0; // MASSIVELY INCREASED: Pre-generate 3 screens ahead

const pickWeighted = (pairs: Array<[string, number]>) => {
  const total = pairs.reduce((s, [,w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of pairs) {
    r -= w;
    if (r <= 0) {
      return name;
    }
  }
  return pairs[0][0];
};

export function useVerticalProcGen(
  opts: Opts,
  playerWorldY: number,
): ProcGenState {
  const {
    mapName,
    floorTopY,
    initialPlatforms,
    initialDecorations,
    scale = 2,
    maxScreens = PROCGEN_DEFAULTS.MAX_SCREENS,
    initialBands = 1,
  } = opts;

  // FIXED: Initialize state more carefully
  const [platforms, setPlatforms] = useState<Platform[]>(() => {
    // Deep copy to prevent mutations
    return initialPlatforms.map(p => ({ ...p }));
  });

  const [decorations, setDecorations] = useState<Platform[]>(() => {
    return initialDecorations.map(d => ({ ...d }));
  });

  const [cameraY, setCameraY] = useState(0);

  // How high we will ever build this run
  const TOP_LIMIT_Y = useMemo(
    () => Math.round(floorTopY - maxScreens * SCREEN_H),
    [floorTopY, maxScreens]
  );

  // FIXED: Track generated bounds more precisely
  const generatedMinYRef = useRef<number>(
    initialPlatforms.length === 0 ? floorTopY : Math.min(floorTopY, ...initialPlatforms.map(p => p.y))
  );

  // Ref to track current platforms for collision detection
  const platformsRef = useRef<Platform[]>([]);
  useEffect(() => {
    platformsRef.current = platforms;
  }, [platforms]);

  // PERFORMANCE: Track last processed playerWorldY to prevent constant recalculation
  const lastProcessedPlayerWorldYRef = useRef<number>(playerWorldY);

  // FIXED: Better overlap detection
  const rectOverlap = (a: {x:number;y:number;w:number;h:number}, b:{x:number;y:number;w:number;h:number}, MARGIN = 8) => (
    a.x < b.x + b.w + MARGIN && a.x + a.w + MARGIN > b.x &&
    a.y < b.y + b.h + MARGIN && a.y + a.h + MARGIN > b.y
  );

  // FIXED: More generous spacing requirements
  const farEnough = (a:{x:number;y:number}, b:{x:number;y:number}, dx=PROCGEN_DEFAULTS.MIN_DX, dy=PROCGEN_DEFAULTS.MIN_DY) => (
    Math.abs(a.x - b.x) >= dx || Math.abs(a.y - b.y) >= dy
  ); // Changed && to || for more flexibility

  const pickPlatformX = useCallback((name: string, wPx: number) => {
    if (name === 'platform-wood-2-left-final') return 0;
    if (name === 'platform-wood-2-right-final') return Math.max(0, SCREEN_W - wPx);
    
    const minX = PROCGEN_DEFAULTS.EDGE_MARGIN;
    const maxX = Math.max(minX, SCREEN_W - PROCGEN_DEFAULTS.EDGE_MARGIN - wPx);
    return Math.round(minX + Math.random() * (maxX - minX));
  }, []);

  // FIXED: Better platform placement algorithm
  const tryPlacePlatform = useCallback((
    name: string,
    bandTopY: number,
    bandBottomY: number,
    existing: Platform[],
  ): Platform | null => {
    const wPx = prefabWidthPx(mapName, name, scale);
    const hPx = prefabHeightPx(mapName, name, scale);
    
    // More attempts for better distribution
    for (let k = 0; k < 50; k++) {
      const x = pickPlatformX(name, wPx);
      
      // Better Y distribution - avoid clustering at band edges
      const bandHeight = Math.max(hPx, bandBottomY - bandTopY);
      const yRange = Math.max(0, bandHeight - hPx);
      const y = Math.round(bandTopY + (yRange * 0.2) + Math.random() * (yRange * 0.6));
      
      const rect = { x, y, w: wPx, h: hPx };
      let ok = true;
      
      // Optimize: Only check nearby platforms instead of all existing platforms
      const NEAR_WINDOW = SCREEN_H * 2.0; // 2 screens around the candidate y
      const nearby = existing.filter(p => {
        const pCenterY = p.y + (prefabHeightPx(mapName, p.prefab, p.scale ?? scale) / 2);
        const candidateCenterY = y + hPx / 2;
        return Math.abs(pCenterY - candidateCenterY) < NEAR_WINDOW;
      });
      
      for (const p of nearby) {
        const pw = prefabWidthPx(mapName, p.prefab, p.scale ?? scale);
        const ph = prefabHeightPx(mapName, p.prefab, p.scale ?? scale);
        const prect = { x: p.x, y: p.y, w: pw, h: ph };
        
        if (rectOverlap(rect, prect)) {
          ok = false; 
          break;
        }
        
        // FIXED: More flexible spacing check
        const centerA = { x: x + wPx/2, y: y + hPx/2 };
        const centerB = { x: p.x + pw/2, y: p.y + ph/2 };
        if (!farEnough(centerA, centerB, PROCGEN_DEFAULTS.MIN_DX * 0.7, PROCGEN_DEFAULTS.MIN_DY * 0.7)) {
          ok = false; 
          break;
        }
      }
      
      if (ok) return { prefab: name, x, y, scale };
    }
    return null;
  }, [mapName, scale, pickPlatformX]);

  // Fix 3: Correct environment item positioning
  const spawnEnvForPlatform = useCallback((platform: Platform): Platform[] => {
    const out: Platform[] = [];
    const plat = platform.prefab;
    const isGrass3 = plat === 'platform-grass-3-final';
    const isGrass1 = plat === 'platform-grass-1-final';
    const isWood = plat.startsWith('platform-wood-');
    
    if (isWood) return out;
    
    // Get the platform's collision segments
    const segs = prefabTopSolidSegmentsPx(mapName, plat, platform.scale ?? scale);
    const seg = segs[0];
    if (!seg) return out;
    
    // FIXED: Calculate the actual top surface of the platform
    // The platform.y is the TOP of the platform sprite
    // seg.y is the offset from platform top to the collision surface
    const surfaceTopY = platform.y + seg.y; // This is the collision surface top
    const segLeft = platform.x + seg.x;
    const segRight = segLeft + seg.w;
    
    const randomXFor = (envName: string) => {
      const w = prefabWidthPx(mapName, envName, platform.scale ?? scale);
      const left = segLeft, right = Math.max(left, segRight - w);
      return Math.round(left + Math.random() * Math.max(0, right - left));
    };
    
    const addEnvAtTop = (name: string, x: number) => {
      // FIXED: Use the collision surface top as the base for positioning
      // alignPrefabYToSurfaceTop expects the surface Y and positions the sprite above it
      const envY = alignPrefabYToSurfaceTop(mapName, name, surfaceTopY, platform.scale ?? scale);
      
      out.push({
        prefab: name,
        x,
        y: envY,
        scale: platform.scale ?? scale,
      });
    };
    
    // Trees: max 1 on grass-3
    if (isGrass3) {
      const r = Math.random();
      if (r < PROCGEN_DEFAULTS.TREE_TRY.large) addEnvAtTop('tree-large-final', randomXFor('tree-large-final'));
      else if (r < PROCGEN_DEFAULTS.TREE_TRY.medium) addEnvAtTop('tree-medium-final', randomXFor('tree-medium-final'));
      else if (r < PROCGEN_DEFAULTS.TREE_TRY.small) addEnvAtTop('tree-small-final', randomXFor('tree-small-final'));
    }
    
    // Mushrooms
    const mushSlots = isGrass3 ? PROCGEN_DEFAULTS.MAX_MUSH_GRASS3 : isGrass1 ? PROCGEN_DEFAULTS.MAX_MUSH_GRASS1 : 0;
    const mushNames = ['mushroom-red-large-final','mushroom-red-medium-final','mushroom-red-small-final', 'mushroom-green-large-final','mushroom-green-medium-final','mushroom-green-small-final'];
    for (let i = 0; i < mushSlots; i++) {
      if (Math.random() < PROCGEN_DEFAULTS.MUSHROOM_P) {
        const name = mushNames[(Math.random() * mushNames.length) | 0];
        addEnvAtTop(name, randomXFor(name));
      }
    }
    
    // Grass tufts
    const grassSlots = isGrass3 ? PROCGEN_DEFAULTS.MAX_GRASS_GRASS3 : isGrass1 ? PROCGEN_DEFAULTS.MAX_GRASS_GRASS1 : 0;
    const grassNames = ['grass-1-final','grass-2-final','grass-3-final','grass-4-final','grass-5-final','grass-6-final'];
    for (let i = 0; i < grassSlots; i++) {
      if (Math.random() < PROCGEN_DEFAULTS.GRASS_P) {
        const name = grassNames[(Math.random() * grassNames.length) | 0];
        addEnvAtTop(name, randomXFor(name));
      }
    }
    
    return out;
  }, [mapName, scale]);

  // FIXED: Improved generation function that's more reliable
  const generateBand = useCallback((
    bandTopY: number,
    bandBottomY: number,
    existingPlatforms: Platform[]
  ) => {
    const newPlatforms: Platform[] = [];
    // Use all existing platforms (including new ones from this session)
    const allExisting = existingPlatforms.slice();
    
    for (let i = 0; i < PROCGEN_DEFAULTS.ATTEMPTS_PER_BAND; i++) {
      const name = pickWeighted(PROCGEN_DEFAULTS.PLATFORM_WEIGHTS);
      const placed = tryPlacePlatform(name, bandTopY, bandBottomY, allExisting.concat(newPlatforms));
      if (placed) {
        newPlatforms.push(placed);
      }
    }
    
    
    const newDecos = newPlatforms.flatMap(spawnEnvForPlatform);
    return { newPlatforms, newDecos };
  }, [tryPlacePlatform, spawnEnvForPlatform]);

  // PERFORMANCE: Pre-generate much more content upfront
  useEffect(() => {
    let bandBottomY = floorTopY - 20;
    let minY = generatedMinYRef.current;
    const collectedP: Platform[] = [];
    const collectedD: Platform[] = [];
    const basePlatforms = initialPlatforms.slice();
    
    // PERFORMANCE: Generate 5 bands upfront instead of just 1
    const bandsToGenerate = Math.max(5, initialBands);
    
    for (let b = 0; b < bandsToGenerate; b++) {
      const bandTopY = Math.max(TOP_LIMIT_Y, bandBottomY - SCREEN_H);
      
      // Use the improved generation function
      const { newPlatforms, newDecos } = generateBand(bandTopY, bandBottomY, basePlatforms.concat(collectedP));
      
      if (newPlatforms.length) {
        collectedP.push(...newPlatforms);
        collectedD.push(...newDecos);
        minY = Math.min(minY, bandTopY);
      }
      
      bandBottomY = bandTopY - 20;
    }
    
    if (collectedP.length) {
      setPlatforms(prev => [...prev, ...collectedP]);
      setDecorations(prev => [...prev, ...collectedD]);
      generatedMinYRef.current = minY;
    }
  }, []); // Run only once on mount

  // Fix 1: Optimize procedural generation to prevent lag
  useEffect(() => {
    // PERFORMANCE: Only process if playerWorldY has changed significantly AND camera should move
    const DEADZONE_FROM_TOP = Math.round(SCREEN_H * 0.35);
    const targetCameraY = Math.max(0, playerWorldY - DEADZONE_FROM_TOP);
    const newCameraY = Math.max(cameraY, -targetCameraY);
    
    // Only process generation if camera actually needs to move or player moved significantly
    const cameraWillMove = Math.abs(newCameraY - cameraY) > 1;
    const playerWorldYChange = Math.abs(playerWorldY - lastProcessedPlayerWorldYRef.current);
    
    if (!cameraWillMove && playerWorldYChange < 128) { // INCREASED threshold when camera not moving
      return; // Skip processing entirely
    }
    
    lastProcessedPlayerWorldYRef.current = playerWorldY;
    
    // Only update camera if it actually changed
    if (cameraWillMove) {
      setCameraY(newCameraY);
    }
    
    // Only generate if camera moved significantly
    if (cameraWillMove) {
      const cameraTop = newCameraY;
      const wantGenerateAbove = cameraTop - AHEAD_BUFFER_SCREENS * SCREEN_H;
      
      // Generate new bands if we're getting close to the limit
      if (generatedMinYRef.current > wantGenerateAbove && generatedMinYRef.current > TOP_LIMIT_Y) {
        let bandsGenerated = 0;
        const maxBandsPerFrame = 1;
        
        while (generatedMinYRef.current > wantGenerateAbove && 
               generatedMinYRef.current > TOP_LIMIT_Y && 
               bandsGenerated < maxBandsPerFrame) {
          
          const bandBottomY = generatedMinYRef.current - 20;
          const bandTopY = Math.max(TOP_LIMIT_Y, bandBottomY - SCREEN_H);
          
          const currentPlatforms = platformsRef.current;
          const { newPlatforms, newDecos } = generateBand(bandTopY, bandBottomY, currentPlatforms);
          
          if (newPlatforms.length === 0) {
            break;
          }
          
          setPlatforms(prev => [...prev, ...newPlatforms]);
          setDecorations(prev => [...prev, ...newDecos]);
          generatedMinYRef.current = bandTopY;
          bandsGenerated++;
        }
      }
      
      // Cull platforms that are far below camera
      const cullBelowY = newCameraY + AHEAD_BUFFER_SCREENS * SCREEN_H + 200;
      setPlatforms(prev => {
        const filtered = prev.filter(p => p.y < cullBelowY);
        return filtered;
      });
      setDecorations(prev => {
        const filtered = prev.filter(d => d.y < cullBelowY);
        return filtered;
      });
    }
  }, [playerWorldY, floorTopY, TOP_LIMIT_Y, cameraY]);

  
  return { platforms, decorations, cameraY };
}