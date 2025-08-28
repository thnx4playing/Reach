import { MAPS, MapName } from "./maps";

export type PlatformSpec = { prefab: string; x: number; y: number; scale: number };

/** Build a static floor that spans the bottom of the screen. */
export function makeStaticFloor(
  map: MapName,
  screenWidth: number,
  screenHeight: number,
  scale = 2,
  prefabName: string = "floor" // your 2-tiles-stacked prefab
): PlatformSpec[] {
  const def = MAPS[map];
  const tile = def.prefabs.meta.tileSize;

  const pf = def.prefabs.prefabs[prefabName];
  if (!pf) throw new Error(`Missing prefab "${prefabName}" for map "${map}"`);

  // prefab width/height in tiles (supports cells OR rects definitions)
  const colsCells = pf.cells ? Math.max(...pf.cells.map(r => r.length)) : 0;
  const colsRects = pf.rects ? Math.max(...pf.rects.map(r => r.length)) : 0;
  const rowsCells = pf.cells ? pf.cells.length : 0;
  const rowsRects = pf.rects ? pf.rects.length : 0;

  const cols = Math.max(colsCells, colsRects, 1);
  const rows = Math.max(rowsCells, rowsRects, 2); // your floor is two tiles tall

  const prefabWpx = cols * tile * scale;
  const prefabHpx = rows * tile * scale;

  // floor sits flush with bottom to cover all blue background
  const y = Math.round(screenHeight - prefabHpx);

  // fill width (+1 tile so we never see a seam on wide screens)
  const count = Math.ceil(screenWidth / prefabWpx) + 1;

  const pieces: PlatformSpec[] = [];
  for (let i = 0; i < count; i++) {
    pieces.push({
      prefab: prefabName,
      x: Math.round(i * prefabWpx), // pixel-snap to avoid hairline gaps
      y,
      scale,
    });
  }
  return pieces;
}
