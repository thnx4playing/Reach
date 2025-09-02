import type { SkRect } from "@shopify/react-native-skia";

// ---- Types ----
export type CellName = `cell-${number}-${number}`;
export type CellsRow = Array<CellName | null>;
export type RectRow  = Array<({ x:number; y:number; w:number; h:number } | null)>;

export type Prefab = {
  cells: CellsRow[];  // use these with atlas.frames[frameName]
  rects: RectRow[];   // or draw via srcRect directly
};

export type PrefabCatalog = {
  meta: {
    map: string;
    tileset_image: string;
    tileset_grid_json: string;
    tileSize: number;
  };
  prefabs: Record<string, Prefab>;
};

// ---- Imports per map (static so Metro bundles them) ----
// DARK
import darkGrid   from "../../assets/maps/dark/dark-tileset_grid.json";
import darkPrefs  from "../../assets/maps/dark/dark_prefabs.json";
const darkImage   = require("../../assets/maps/dark/dark-tileset.png") as number;

// DESERT
import desertGrid  from "../../assets/maps/desert/desert-tileset_grid.json";
import desertPrefs from "../../assets/maps/desert/desert_prefabs.json";
const desertImage  = require("../../assets/maps/desert/desert-tileset.png") as number;

// DUNGEON
import dungeonGrid  from "../../assets/maps/dungeon/dungeon-tileset_grid.json";
import dungeonPrefs from "../../assets/maps/dungeon/dungeon_prefabs.json";
const dungeonImage  = require("../../assets/maps/dungeon/dungeon-tileset.png") as number;

// FROZEN
import frozenGrid  from "../../assets/maps/frozen/frozen-tileset_grid.json";
import frozenPrefs from "../../assets/maps/frozen/frozen_prefabs.json";
const frozenImage  = require("../../assets/maps/frozen/frozen-tileset.png") as number;

// GRASSY
import grassyGrid  from "../../assets/maps/grassy/grassy_prefabs_final.json";
import grassyPrefs from "../../assets/maps/grassy/grassy_prefabs.json";
const grassyImage  = require("../../assets/maps/grassy/grassy_prefabs_final.png") as number;

// ---- Registry ----
export const MAPS = {
  dark:    { image: darkImage,    grid: darkGrid,    prefabs: darkPrefs  as PrefabCatalog },
  desert:  { image: desertImage,  grid: desertGrid,  prefabs: desertPrefs as PrefabCatalog },
  dungeon: { image: dungeonImage, grid: dungeonGrid, prefabs: dungeonPrefs as PrefabCatalog },
  frozen:  { image: frozenImage,  grid: frozenGrid,  prefabs: frozenPrefs as PrefabCatalog },
  grassy:  { image: grassyImage,  grid: grassyGrid,  prefabs: grassyPrefs as PrefabCatalog },
} as const;

export type MapName = keyof typeof MAPS;

// Utility
export function getPrefab(map: MapName, name: string): Prefab | undefined {
  return MAPS[map].prefabs.prefabs[name];
}
export function getTileSize(map: MapName) {
  return MAPS[map].prefabs.meta.tileSize;
}

// Helper functions for level generation

// Cache to prevent spam warnings for missing prefabs
const missingPrefabWarnings = new Set<string>();

export function prefabWidthPx(mapName: MapName, prefabName: string, scale = 2) {
  const tile = getTileSize(mapName) * scale;
  const pf = getPrefab(mapName, prefabName);
  
  if (!pf) {
    const warningKey = `${mapName}:${prefabName}`;
    if (!missingPrefabWarnings.has(warningKey)) {
      console.warn(`prefabWidthPx: prefab "${prefabName}" not found in map "${mapName}"`);
      missingPrefabWarnings.add(warningKey);
    }
    return tile; // fallback to single tile width
  }
  

  
  // For cells, count the actual width (excluding nulls at the end)
  const colsFromCells = pf.cells?.reduce((maxCols, row, rowIndex) => {
    // Find the last non-null cell in this row
    let lastCol = -1;
    for (let i = row.length - 1; i >= 0; i--) {
      if (row[i] !== null) {
        lastCol = i;
        break;
      }
    }
    const rowWidth = lastCol + 1;

    return Math.max(maxCols, rowWidth);
  }, 0) ?? 0;
  
  // For rects, count the actual width (excluding nulls at the end)
  const colsFromRects = pf.rects?.reduce((maxCols, row, rowIndex) => {
    // Find the last non-null rect in this row
    let lastCol = -1;
    for (let i = row.length - 1; i >= 0; i--) {
      if (row[i] !== null) {
        lastCol = i;
        break;
      }
    }
    const rowWidth = lastCol + 1;

    return Math.max(maxCols, rowWidth);
  }, 0) ?? 0;
  
  const cols = Math.max(colsFromCells, colsFromRects, 1);
  const widthPx = cols * tile;
  

  
  return widthPx;
}

// ---- Prefab Variants ----
import { cropPrefabColumns } from "./prefabTools";

// Create new small variants without overwriting originals
Object.entries(MAPS).forEach(([mapName, def]) => {
  const p = def.prefabs.prefabs;

  if (p["left-platform"]) {
    p["left-platform-small"] = cropPrefabColumns(p["left-platform"], /*leftCols*/ 2, /*rightCols*/ 0);
  }
  if (p["right-platform"]) {
    p["right-platform-small"] = cropPrefabColumns(p["right-platform"], /*leftCols*/ 0, /*rightCols*/ 2);
  }

  if (__DEV__) {
    // quick sanity: log widths (columns) before/after
    const width = (pf: any) =>
      pf?.cells?.[0]?.length ?? pf?.rects?.[0]?.length ?? "?";

  }
});

// --- Foot Inset System ---

export function prefabHeightPx(map: MapName, prefabName: string, scale = 2) {
  const tile = getTileSize(map) * scale;
  const pf = MAPS[map].prefabs.prefabs[prefabName];
  // Fix: use || instead of ?? to handle empty arrays (length 0)
  const rows = (pf?.cells?.length || pf?.rects?.length || 1);
  return rows * tile;
}

/**
 * Visual foot inset per prefab (px at scale=1).
 * Positive values sink the object downward to hide any "air gap"
 * caused by transparent pixels at the bottom of the art.
 */
const PREFAB_FOOT_INSET: Record<string, number> = {
  // 2.5px @ scale=1 => 5px @ scale=2 (raised by additional 5px)
  'tree-large-final': 2.5,
  'tree-medium-final': 2.5,
  'tree-small-final': 2.5,
  // Floor and platform prefabs that use the same top block
  'floor': 2.5,
  'floor-final': 2.5,
  'platform-grass-3-final': 2.5,
  'platform-grass-1-final': 2.5,
  'platform-wood-3-final': 2.5,
  'platform-wood-1-final': 2.5,
  'platform-wood-2-left-final': 2.5,
  'platform-wood-2-right-final': 2.5,
  // Mushrooms and grass decorations
  'mushroom-red-large-final': 2.5,
  'mushroom-red-medium-final': 2.5,
  'mushroom-red-small-final': 2.5,
  'mushroom-green-large-final': 2.5,
  'mushroom-green-medium-final': 2.5,
  'mushroom-green-small-final': 2.5,
  'grass-1-final': 2.5,
  'grass-2-final': 2.5,
  'grass-3-final': 2.5,
  'grass-4-final': 2.5,
  'grass-5-final': 2.5,
  'grass-6-final': 2.5,
  // add others here if you notice a gap: e.g. 'lamp-post': 2
};

export function prefabFootInsetPx(map: MapName, prefabName: string, scale = 2) {
  return (PREFAB_FOOT_INSET[prefabName] ?? 0) * scale;
}

/** Compute a top-left Y that makes a prefab sit flush on a given surfaceTopY. */
export function alignPrefabYToSurfaceTop(map: MapName, prefabName: string, surfaceTopY: number, scale = 2) {
  const height = prefabHeightPx(map, prefabName, scale);
  const footInset = prefabFootInsetPx(map, prefabName, scale);
  return Math.round(surfaceTopY - height + footInset);
}

// --- One-Way Platform Collision System ---

// Describe top-surface spans for collision (in pixels, local to the prefab)
export type TopSegmentPx = { x: number; y: number; w: number; h: number };

// Solid platform rectangles (in local prefab pixels)
export type SlabPx = { x: number; yTop: number; w: number; h: number };

/**
 * Returns horizontal segments that form the *walkable top* of a prefab.
 * We scan the first (top-most) row that has any solid tiles, then compress
 * contiguous solid columns into segments. Works for `rects` or `cells`.
 */
export function prefabTopSolidSegmentsPx(map: MapName, prefabName: string, scale = 2): TopSegmentPx[] {
  const pf = MAPS[map].prefabs.prefabs[prefabName];
  if (!pf) return [];

  const rows = (pf.rects?.length ? pf.rects : pf.cells) as Array<Array<any | null>>;
  if (!rows?.length) return [];

  // Find the first row that contains any solid tile
  let topRowIdx = 0;
  while (topRowIdx < rows.length && !rows[topRowIdx]?.some(Boolean)) topRowIdx++;

  const row = rows[topRowIdx] || [];
  const tile = getTileSize(map) * scale;

  // Compress contiguous non-null columns into segments
  const segs: TopSegmentPx[] = [];
  let start: number | null = null;
  for (let c = 0; c <= row.length; c++) {
    const solid = c < row.length ? !!row[c] : false; // sentinel false at end
    if (solid && start === null) start = c;
    if ((!solid || c === row.length) && start !== null) {
      const cols = c - start;
      segs.push({ x: start * tile, y: topRowIdx * tile, w: cols * tile, h: tile });
      start = null;
    }
  }
  return segs;
}

/**
 * Returns solid platform rectangles (slabs) for a prefab.
 * Only creates collision boxes for actual solid tiles, not empty space.
 */
export function prefabPlatformSlabsPx(map: MapName, prefabName: string, scale = 2): SlabPx[] {
  const pf = getPrefab(map, prefabName);
  if (!pf) return [];
  const rows = (pf.rects?.length ? pf.rects : pf.cells) as Array<Array<any | null>>;
  if (!rows?.length) return [];

  const tile = getTileSize(map) * scale;
  const slabs: SlabPx[] = [];

  // Create collision boxes only for individual solid tiles
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    
    for (let c = 0; c < row.length; c++) {
      if (row[c]) { // If this tile is solid
        slabs.push({
          x: c * tile,
          yTop: r * tile,
          w: tile,
          h: tile,
        });
      }
    }
  }
  
  return slabs;
}