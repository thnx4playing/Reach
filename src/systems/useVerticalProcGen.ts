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
  initialPlatforms: Platform[];    // typically just the floor pieces now
  initialDecorations: Platform[];  // optional ground props
  scale?: number;
  maxScreens?: number;             // default 10 screens
  initialBands?: number;           // NEW: how many bands to pre-generate on load (default 1)
};

const PROCGEN_DEFAULTS = {
  MAX_SCREENS: 10,
  EDGE_MARGIN: 40,
  MIN_DX: 120,
  MIN_DY: 100,
  ATTEMPTS_PER_BAND: 12,
  PLATFORM_WEIGHTS: [
    ['platform-grass-1-final', 3],
    ['platform-grass-3-final', 2],
    ['platform-wood-1-final',  2],
    ['platform-wood-3-final',  1],
    ['platform-wood-2-left-final',  1],
    ['platform-wood-2-right-final', 1],
  ] as Array<[string, number]>,
  TREE_TRY:   { large: 0.20, medium: 0.40, small: 0.60 },
  MUSHROOM_P: 0.60,
  GRASS_P:    0.80,
  MAX_MUSH_GRASS3: 2,
  MAX_MUSH_GRASS1: 1,
  MAX_GRASS_GRASS3: 3,
  MAX_GRASS_GRASS1: 1,
};

const AHEAD_BUFFER_SCREENS = 1; // how many screens we generate ahead of camera

const pickWeighted = (pairs: Array<[string, number]>) => {
  const total = pairs.reduce((s, [,w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [name, w] of pairs) { r -= w; if (r <= 0) return name; }
  return pairs[0][0];
};

export function useVerticalProcGen(
  opts: Opts,
  playerWorldY: number,     // <<— wire this to your player's Y (world coords)
): ProcGenState {
  const {
    mapName,
    floorTopY,
    initialPlatforms,
    initialDecorations,
    scale = 2,
    maxScreens = PROCGEN_DEFAULTS.MAX_SCREENS,
    initialBands = 1,   // NEW: prime 1 band of platforms at start by default
  } = opts;

  const [platforms, setPlatforms] = useState<Platform[]>(() => initialPlatforms.slice());
  const [decorations, setDecorations] = useState<Platform[]>(() => initialDecorations.slice());
  const [cameraY, setCameraY] = useState(0);

  // how high we will ever build this run
  const TOP_LIMIT_Y = useMemo(
    () => Math.round(floorTopY - maxScreens * SCREEN_H),
    [floorTopY, maxScreens]
  );

  // track how far we've generated upwards (smaller y = higher on screen)
  const generatedMinYRef = useRef<number>(Math.min(floorTopY, ...initialPlatforms.map(p => p.y)));

  const rectOverlap = (a: {x:number;y:number;w:number;h:number}, b:{x:number;y:number;w:number;h:number}) =>
    (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);

  const farEnough = (a:{x:number;y:number}, b:{x:number;y:number}, dx=PROCGEN_DEFAULTS.MIN_DX, dy=PROCGEN_DEFAULTS.MIN_DY) =>
    (Math.abs(a.x - b.x) >= dx && Math.abs(a.y - b.y) >= dy);

  const pickPlatformX = useCallback((name: string, wPx: number) => {
    if (name === 'platform-wood-2-left-final')  return 0;
    if (name === 'platform-wood-2-right-final') return Math.max(0, SCREEN_W - wPx);
    const minX = PROCGEN_DEFAULTS.EDGE_MARGIN;
    const maxX = Math.max(minX, SCREEN_W - PROCGEN_DEFAULTS.EDGE_MARGIN - wPx);
    return Math.round(minX + Math.random() * (maxX - minX));
  }, []);

  const tryPlacePlatform = useCallback((
    name: string,
    bandTopY: number,
    bandBottomY: number,
    existing: Platform[],
  ): Platform | null => {
    const wPx = prefabWidthPx(mapName, name, scale);
    const hPx = prefabHeightPx(mapName, name, scale);
    for (let k=0; k<40; k++) {
      const x = pickPlatformX(name, wPx);
      const y = Math.round(bandTopY + Math.random() * Math.max(0, bandBottomY - bandTopY - hPx));
      const rect = { x, y, w: wPx, h: hPx };
      let ok = true;
      for (const p of existing) {
        const pw = prefabWidthPx(mapName, p.prefab, p.scale ?? scale);
        const ph = prefabHeightPx(mapName, p.prefab, p.scale ?? scale);
        const prect = { x: p.x, y: p.y, w: pw, h: ph };
        if (rectOverlap(rect, prect) || !farEnough({x: x+wPx/2, y: y+hPx/2}, {x: p.x+pw/2, y: p.y+ph/2})) {
          ok = false; break;
        }
      }
      if (ok) return { prefab: name, x, y, scale };
    }
    return null;
  }, [mapName, scale, pickPlatformX]);

  const spawnEnvForPlatform = useCallback((platform: Platform): Platform[] => {
    const out: Platform[] = [];
    const plat = platform.prefab;
    const isGrass3 = plat === 'platform-grass-3-final';
    const isGrass1 = plat === 'platform-grass-1-final';
    const isWood   = plat.startsWith('platform-wood-');
    if (isWood) return out;

    const segs = prefabTopSolidSegmentsPx(mapName, plat, platform.scale ?? scale);
    const seg = segs[0];
    if (!seg) return out;

    const surfaceTopY = platform.y + seg.y;
    const segLeft = platform.x + seg.x;
    const segRight = segLeft + seg.w;

    const randomXFor = (envName: string) => {
      const w = prefabWidthPx(mapName, envName, platform.scale ?? scale);
      const left = segLeft, right = Math.max(left, segRight - w);
      return Math.round(left + Math.random() * Math.max(0, right - left));
    };

    const addEnvAtTop = (name: string, x: number) => {
      out.push({
        prefab: name,
        x,
        y: alignPrefabYToSurfaceTop(mapName, name, surfaceTopY, platform.scale ?? scale),
        scale: platform.scale ?? scale,
      });
    };

    // Trees: max 1 on grass-3 (20% large, else 40% medium, else 60% small)
    if (isGrass3) {
      const r = Math.random();
      if (r < PROCGEN_DEFAULTS.TREE_TRY.large)       addEnvAtTop('tree-large-final',  randomXFor('tree-large-final'));
      else if (r < PROCGEN_DEFAULTS.TREE_TRY.medium) addEnvAtTop('tree-medium-final', randomXFor('tree-medium-final'));
      else if (r < PROCGEN_DEFAULTS.TREE_TRY.small)  addEnvAtTop('tree-small-final',  randomXFor('tree-small-final'));
    }

    // Mushrooms
    const mushSlots = isGrass3 ? PROCGEN_DEFAULTS.MAX_MUSH_GRASS3
                      : isGrass1 ? PROCGEN_DEFAULTS.MAX_MUSH_GRASS1 : 0;
    const mushNames = [
      'mushroom-red-large-final','mushroom-red-medium-final','mushroom-red-small-final',
      'mushroom-green-large-final','mushroom-green-medium-final','mushroom-green-small-final'
    ];
    for (let i=0; i<mushSlots; i++) {
      if (Math.random() < PROCGEN_DEFAULTS.MUSHROOM_P) {
        const name = mushNames[(Math.random() * mushNames.length) | 0];
        addEnvAtTop(name, randomXFor(name));
      }
    }

    // Grass tufts
    const grassSlots = isGrass3 ? PROCGEN_DEFAULTS.MAX_GRASS_GRASS3
                       : isGrass1 ? PROCGEN_DEFAULTS.MAX_GRASS_GRASS1 : 0;
    const grassNames = ['grass-1-final','grass-2-final','grass-3-final','grass-4-final','grass-5-final','grass-6-final'];
    for (let i=0; i<grassSlots; i++) {
      if (Math.random() < PROCGEN_DEFAULTS.GRASS_P) {
        const name = grassNames[(Math.random() * grassNames.length) | 0];
        addEnvAtTop(name, randomXFor(name));
      }
    }

    return out;
  }, [mapName, scale]);

  const generateBand = useCallback((bandTopY: number, bandBottomY: number) => {
    const newPlatforms: Platform[] = [];
    const snapshot = platforms.concat(); // existing at this moment
    for (let i=0; i<PROCGEN_DEFAULTS.ATTEMPTS_PER_BAND; i++) {
      const name = pickWeighted(PROCGEN_DEFAULTS.PLATFORM_WEIGHTS);
      const placed = tryPlacePlatform(name, bandTopY, bandBottomY, snapshot.concat(newPlatforms));
      if (placed) newPlatforms.push(placed);
    }
    const newDecos = newPlatforms.flatMap(spawnEnvForPlatform);
    return { newPlatforms, newDecos };
  }, [platforms, tryPlacePlatform, spawnEnvForPlatform]);

  // NEW: Prime initial bands so platforms are visible on first screen
  useEffect(() => {
    // Start just above the floor and build upward by whole screens
    let bandBottomY = floorTopY - 20;
    let minY = generatedMinYRef.current;
    const collectedP: Platform[] = [];
    const collectedD: Platform[] = [];
    
    // Use initial platforms as the base for collision detection
    const basePlatforms = initialPlatforms.slice();
    
    for (let b = 0; b < Math.max(0, initialBands); b++) {
      const bandTopY = Math.max(TOP_LIMIT_Y, bandBottomY - SCREEN_H);
      
      // Generate platforms for this band without depending on current state
      const newPlatforms: Platform[] = [];
      for (let i=0; i<PROCGEN_DEFAULTS.ATTEMPTS_PER_BAND; i++) {
        const name = pickWeighted(PROCGEN_DEFAULTS.PLATFORM_WEIGHTS);
        const placed = tryPlacePlatform(name, bandTopY, bandBottomY, basePlatforms.concat(collectedP, newPlatforms));
        if (placed) newPlatforms.push(placed);
      }
      
      const newDecos = newPlatforms.flatMap(spawnEnvForPlatform);
      
      if (newPlatforms.length) {
        collectedP.push(...newPlatforms);
        collectedD.push(...newDecos);
        minY = Math.min(minY, bandTopY);
      }
      bandBottomY = bandTopY - 20;
    }
    
    if (collectedP.length) {
      setPlatforms(prev => prev.concat(collectedP));
      setDecorations(prev => prev.concat(collectedD));
      generatedMinYRef.current = minY;
    }
    // one-time prime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera follow upward (only rises; no downward snap)
  useEffect(() => {
    // Keep player around 60% from bottom; start scrolling after ~40% from top
    const DEADZONE_FROM_TOP = Math.round(SCREEN_H * 0.40);
    // We treat y increasing downward. When player goes up (y decreases),
    // raise camera so that player is never above the deadzone line.
    const targetCam = Math.max(0, Math.min(
      // never exceed built range
      (floorTopY - TOP_LIMIT_Y),
      // only rise if player is above deadzone
      cameraY < playerWorldY - DEADZONE_FROM_TOP ? cameraY : (playerWorldY - DEADZONE_FROM_TOP)
    ));
    // Ensure monotonic rise
    const nextCam = Math.max(cameraY, -targetCam); // negative because playerWorldY decreases upward
    // Simpler, robust version: just keep camera so that (playerWorldY - cameraY) >= DEADZONE_FROM_TOP
    const desired = Math.max(0, cameraY, playerWorldY - DEADZONE_FROM_TOP);
    setCameraY(desired);

    // Generate ahead (buffer) up to TOP_LIMIT_Y
    const wantTop = Math.max(TOP_LIMIT_Y, desired - AHEAD_BUFFER_SCREENS * SCREEN_H);
    while (generatedMinYRef.current > wantTop) {
      const bandBottomY = generatedMinYRef.current - 20;
      const bandTopY = Math.max(TOP_LIMIT_Y, bandBottomY - SCREEN_H);
      
      // Inline generation to avoid dependency on generateBand
      const newPlatforms: Platform[] = [];
      for (let i=0; i<PROCGEN_DEFAULTS.ATTEMPTS_PER_BAND; i++) {
        const name = pickWeighted(PROCGEN_DEFAULTS.PLATFORM_WEIGHTS);
        const placed = tryPlacePlatform(name, bandTopY, bandBottomY, []);
        if (placed) newPlatforms.push(placed);
      }
      
      const newDecos = newPlatforms.flatMap(spawnEnvForPlatform);
      
      if (!newPlatforms.length) break;
      setPlatforms(prev => prev.concat(newPlatforms));
      setDecorations(prev => prev.concat(newDecos));
      generatedMinYRef.current = bandTopY;
    }

    // Cull far below (keep ~2 screens below camera)
    const cullBelow = desired + AHEAD_BUFFER_SCREENS * SCREEN_H + 800;
    setPlatforms(prev => prev.filter(p => p.y < cullBelow));
    setDecorations(prev => prev.filter(d => d.y < cullBelow));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerWorldY, floorTopY, TOP_LIMIT_Y]);

  return { platforms, decorations, cameraY };
}
