// src/content/prefabTools.ts
export type Cell = string | null;
export type Rect = { x: number; y: number; w: number; h: number } | null;

export type PrefabDef = {
  cells?: Cell[][];
  rects?: Rect[][];
};

/** Slice columns off the left/right sides of a 2D grid (keeps row count). */
function crop2D<T>(rows: (T | null)[][], leftCols: number, rightCols: number) {
  const L = Math.max(0, leftCols | 0);
  const R = Math.max(0, rightCols | 0);
  return rows.map((row) => {
    const end = Math.max(L, row.length - R); // guard against over-trim
    return row.slice(L, end);
  });
}

/** Return a COPY of a prefab with columns removed from left/right edges. */
export function cropPrefabColumns(pf: PrefabDef, leftCols = 0, rightCols = 0): PrefabDef {
  const out: PrefabDef = { ...pf };
  if (pf.cells) out.cells = crop2D(pf.cells, leftCols, rightCols);
  if (pf.rects) out.rects = crop2D(pf.rects, leftCols, rightCols);
  return out;
}
