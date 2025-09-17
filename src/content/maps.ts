import type { SkRect } from "@shopify/react-native-skia";

// ---- Types ----
export type CellName = `cell-${number}-${number}`;
export type CellsRow = Array<CellName | null>;
export type RectRow  = Array<({ x:number; y:number; w:number; h:number } | null)>;

export type Prefab = {
  cells?: CellsRow[];  // prefer cells that reference frames
  rects?: RectRow[];   // fallback: absolute src rects on the atlas
};

export type PrefabCatalog = {
  meta: {
    map: string;
    tileset_image: string;
    tileSize: number;
    margin?: number;
    spacing?: number;
    columns?: number;
    rows?: number;
  };
  frames?: Record<string, {x:number;y:number;w:number;h:number}>;
  prefabs: Record<string, Prefab>;
};

// ---- Imports per map (PNG + catalog JSON; frames come from catalog) ----
import darkPrefs   from "../../assets/maps/dark/dark_prefabs.json";
const darkImage    = require("../../assets/maps/dark/dark-tileset-final.png") as number;

import desertPrefs from "../../assets/maps/desert/desert_prefabs.json";
const desertImage  = require("../../assets/maps/desert/desert-tileset-final.png") as number;

import dungeonPrefs from "../../assets/maps/dungeon/dungeon_prefabs.json";
const dungeonImage  = require("../../assets/maps/dungeon/dungeon-tileset-final.png") as number;

import frozenPrefs  from "../../assets/maps/frozen/frozen_prefabs.json";
const frozenImage   = require("../../assets/maps/frozen/frozen-tileset-final.png") as number;

// Grassy map now uses individual sprites, no tilesheet needed

// ---- Registry ----
export type MapDef = {
  image: number | string;
  prefabs: PrefabCatalog;
  frames: Record<string, {x:number;y:number;w:number;h:number}>;
};

// Helper map for grassy platform column counts
const GRASSY_PLATFORM_COLS: Record<string, number> = {
  "platform-grass-1-final": 1,
  "platform-grass-3-final": 3,
  "platform-wood-1-final": 1,
  "platform-wood-2-left-final": 2,
  "platform-wood-2-right-final": 2,
  "platform-wood-3-final": 3,
  "floor-final": 1,
};

// Fix 4: Verify wood platforms have correct collision definitions
// Create minimal grassy catalog for prefab definitions (no image needed)
const grassyCatalog: PrefabCatalog = {
  meta: {
    map: "grassy",
    tileset_image: "individual_sprites",
    tileSize: 16,
  },
  frames: {}, // No frames needed for individual sprites
  prefabs: {
    // Platform prefabs with proper solid cells for collision detection
    "floor-final": { cells: [["cell-0-0"]] }, // Use cell reference instead of number
    "platform-grass-1-final": { cells: [["cell-0-0"]] },
    "platform-grass-3-final": { cells: [["cell-0-0", "cell-1-0", "cell-2-0"]] },
    "platform-wood-1-final": { cells: [["cell-0-0"]] }, // FIXED: Make wood platforms solid
    "platform-wood-2-left-final": { cells: [["cell-0-0", "cell-1-0"]] },
    "platform-wood-2-right-final": { cells: [["cell-0-0", "cell-1-0"]] },
    "platform-wood-3-final": { cells: [["cell-0-0", "cell-1-0", "cell-2-0"]] },
    // Decoration prefabs (no collision needed)
    "tree-large-final": { cells: [[null, null, null, null], [null, null, null, null]] },
    "tree-medium-final": { cells: [[null, null, null, null], [null, null, null, null]] },
    "tree-small-final": { cells: [[null, null, null, null]] },
    "mushroom-red-small-final": { cells: [[null, null, null, null]] },
    "mushroom-green-small-final": { cells: [[null, null, null, null]] },
    "grass-1-final": { cells: [[null, null, null, null]] },
    "grass-2-final": { cells: [[null, null, null, null]] },
    "grass-3-final": { cells: [[null, null, null, null]] },
    "grass-4-final": { cells: [[null, null, null, null]] },
    "grass-5-final": { cells: [[null, null, null, null]] },
    "grass-6-final": { cells: [[null, null, null, null]] },
    "heart-potion-final": { cells: [[null, null, null, null]] },
    "blue-potion-final": { cells: [[null, null, null, null]] },
    "key-final": { cells: [[null, null, null, null]] },
    "bow-final": { cells: [[null, null, null, null]] },
    "sword-final": { cells: [[null, null, null, null]] },
    "wand-final": { cells: [[null, null, null, null]] },
    "boot-final": { cells: [[null, null, null, null]] },
  }
};
const darkCatalog   = darkPrefs       as PrefabCatalog;
const desertCatalog = desertPrefs     as PrefabCatalog;
const dungeonCatalog= dungeonPrefs    as PrefabCatalog;
const frozenCatalog = frozenPrefs     as PrefabCatalog;

export const MAPS = {
  dark:    { image: darkImage,    prefabs: darkCatalog,    frames: (darkCatalog as any).frames || {} },
  desert:  { image: desertImage,  prefabs: desertCatalog,  frames: (desertCatalog as any).frames || {} },
  dungeon: { image: dungeonImage, prefabs: dungeonCatalog, frames: (dungeonCatalog as any).frames || {} },
  frozen:  { image: frozenImage,  prefabs: frozenCatalog,  frames: (frozenCatalog as any).frames || {} },
  grassy:  { image: undefined,  prefabs: grassyCatalog,  frames: {} },
} as const;

export type MapName = keyof typeof MAPS;

// Utility
export function getPrefab(map: MapName, name: string): Prefab | undefined {
  return MAPS[map].prefabs.prefabs[name];
}
export function getTileSize(map: MapName) {
  return MAPS[map].prefabs.meta.tileSize ?? 16;
}
export function getFrame(map: MapName, cell: string) {
  return MAPS[map].frames[cell];
}

// ---------------------------------------------------------------------------
// Sizing helpers
export function prefabWidthPx(map: MapName, prefabName: string, scale = 2): number {
  const p = getPrefab(map, prefabName);
  const tile = getTileSize(map) * scale;
  if (!p) return tile;
  if (p.cells) {
    const cols = Math.max(0, ...p.cells.map(row => row.length));
    // Fallback for grassy map if cols is 0 (all null cells)
    if (map === "grassy" && cols === 0) {
      const fallbackCols = GRASSY_PLATFORM_COLS[prefabName] ?? 1;
      return fallbackCols * tile;
    }
    return Math.max(1, cols) * tile;
  }
  if (p.rects) {
    let maxX = 0;
    p.rects.forEach((row, ry) => row.forEach((r, rx) => { if (r) maxX = Math.max(maxX, rx+1); }));
    return Math.max(1, maxX) * tile;
  }
  return tile;
}

export function prefabHeightPx(map: MapName, prefabName: string, scale = 2): number {
  const p = getPrefab(map, prefabName);
  const tile = getTileSize(map) * scale;
  if (!p) return tile;
  if (p.cells) {
    const rows = p.cells.length;
    // Fallback for grassy map if rows is 0 (empty cells array)
    if (map === "grassy" && rows === 0) {
      return tile; // platforms are 1 tile tall for collision/top-solid purposes
    }
    return Math.max(1, rows) * tile;
  }
  if (p.rects) {
    let maxY = 0;
    p.rects.forEach((row, ry) => row.forEach((r, rx) => { if (r) maxY = Math.max(maxY, ry+1); }));
    return Math.max(1, maxY) * tile;
  }
  return tile;
}

// Visual foot inset per prefab (px at scale=1)
export const PREFAB_FOOT_INSET: Record<string, number> = {
  // Platforms (no inset needed - they ARE the surface)
  'floor-final': 0,
  'platform-grass-1-final': 0,
  'platform-grass-3-final': 0,
  'platform-wood-1-final': 0,
  'platform-wood-2-left-final': 0,
  'platform-wood-2-right-final': 0,
  'platform-wood-3-final': 0,
  
  // Decorations (proper foot insets to sit on platforms)
  'tree-large-final': -2,
  'tree-medium-final': -2,
  'tree-small-final': -2,
  'mushroom-red-small-final': 9,
  'mushroom-green-small-final': 9,
  'grass-1-final': 12,
  'grass-2-final': 12,
  'grass-3-final': 12,
  'grass-4-final': 12,
  'grass-5-final': 12,
  'grass-6-final': 12,
};

export function alignPrefabYToSurfaceTop(
  map: MapName,
  prefabName: string,
  surfaceTopY: number,
  scale = 2
): number {
  const footInset = (PREFAB_FOOT_INSET[prefabName] ?? 0) * scale;
  const h = prefabHeightPx(map, prefabName, scale);
  
  // FIXED: Ensure decorations sit ON TOP of the surface, not above it
  // surfaceTopY is the Y coordinate of the walkable surface
  // We want the bottom of the decoration sprite to sit ON the surface
  // So decoration Y = surfaceTopY - decorationHeight + footInset
  // The footInset should be positive to move the decoration down onto the surface
  return Math.round(surfaceTopY - h + footInset);
}

export function prefabTopSolidSegmentsPx(
  map: MapName,
  prefabName: string,
  scale = 2
): Array<{ x:number; y:number; w:number; h:number }> {
  const p = getPrefab(map, prefabName);
  const tile = getTileSize(map) * scale;
  const segs: Array<{x:number;y:number;w:number;h:number}> = [];
  if (!p) return segs;
  const rows = p.cells ?? p.rects?.map(row => row.map(r => (r ? 1 : null))) ?? [];
  let topRowIdx = -1;
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].some(Boolean)) { topRowIdx = r; break; }
  }
  if (topRowIdx < 0) {
    // Fallback for grassy map if no truthy cells found
    if (map === "grassy") {
      const cols = GRASSY_PLATFORM_COLS[prefabName] ?? 1;
      return [{ x: 0, y: 0, w: cols * tile, h: tile }];
    }
    return segs;
  }
  const row = rows[topRowIdx];
  let start: number | null = null;
  for (let c = 0; c <= row.length; c++) {
    const solid = row[c] ? true : false;
    if (solid && start === null) start = c;
    if ((!solid || c === row.length) && start !== null) {
      const cols = c - start;
      segs.push({ x: start * tile, y: topRowIdx * tile, w: cols * tile, h: tile });
      start = null;
    }
  }
  return segs;
}

export type SlabPx = { x:number; yTop:number; w:number; h:number };

export function prefabPlatformSlabsPx(map: MapName, prefabName: string, scale = 2): SlabPx[] {
  const p = getPrefab(map, prefabName);
  const tile = getTileSize(map) * scale;
  const slabs: SlabPx[] = [];
  if (!p) return slabs;
  const rows = p.cells ?? p.rects?.map(row => row.map(r => (r ? 1 : null))) ?? [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c]) {
        slabs.push({ x: c*tile, yTop: r*tile, w: tile, h: tile });
      }
    }
  }
  // Fallback for grassy map if no slabs found (empty rows array)
  if (slabs.length === 0 && map === "grassy") {
    const cols = GRASSY_PLATFORM_COLS[prefabName] ?? 1;
    const fallbackSlabs = Array.from({ length: cols }, (_, c) => ({ 
      x: c * tile, 
      yTop: 0, 
      w: tile, 
      h: tile 
    }));
    return fallbackSlabs;
  }
  return slabs;
}