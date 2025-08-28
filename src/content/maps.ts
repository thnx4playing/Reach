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
import grassyGrid  from "../../assets/maps/grassy/grassy-tileset_grid.json";
import grassyPrefs from "../../assets/maps/grassy/grassy_prefabs.json";
const grassyImage  = require("../../assets/maps/grassy/grassy-tileset.png") as number;

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
