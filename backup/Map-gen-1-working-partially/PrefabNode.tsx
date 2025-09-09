import React from "react";
import { Image as SkImage, Group, useImage } from "@shopify/react-native-skia";
import { MAPS, MapName } from "../content/maps";

type Props = { map: MapName; name: string; x?: number; y?: number; scale?: number };

export function PrefabNode({ map, name, x = 0, y = 0, scale = 2 }: Props) {
  const def = MAPS[map];
  const pf = def.prefabs?.prefabs?.[name];
  if (!pf) {
    if (__DEV__) console.warn(`[PrefabNode] missing prefab "${name}" in map "${map}"`);
    return null;
  }
  
  const tileSize = def.prefabs?.meta?.tileSize ?? 16;
  const tile = tileSize * scale;

  // SIMPLIFIED: Only use direct image loading to avoid crashes
  const img = useImage(def.image);

  if (!img) {
    if (__DEV__) console.warn(`[PrefabNode] No image loaded for map "${map}", prefab "${name}"`);
    return null;
  }

  const renderTile = (tileRect: any, rx: number, ry: number, key: string) => {
    if (!tileRect) return null;

    // Source coordinates (where the tile is in the tileset)
    const sx = tileRect.x;
    const sy = tileRect.y;
    const sw = tileRect.w;
    const sh = tileRect.h;

    // Destination coordinates (where to draw the tile)
    const dx = x + rx * tile;
    const dy = y + ry * tile;
    const dw = sw * scale;
    const dh = sh * scale;


    // Use Group clipping approach that worked before
    return (
      <Group
        key={key}
        clip={{ x: dx, y: dy, width: dw, height: dh }}
      >
        <SkImage
          image={img}
          x={dx - sx * scale}
          y={dy - sy * scale}
          width={img.width() * scale}
          height={img.height() * scale}
          filterMode="nearest"
        />
      </Group>
    );
  };

  return (
    <>
      {/* Handle rects format (grassy map direct rectangles) */}
      {pf.rects?.map((row: any[], ry: number) =>
        row.map((r: any, rx: number) =>
          r ? renderTile(r, rx, ry, `r-${rx}-${ry}`) : null
        )
      )}
      
      {/* Handle cells format (other maps with frame references) */}
      {pf.cells?.map((row: any[], ry: number) =>
        row.map((cell: string | null, rx: number) => {
          if (!cell) return null;
          // Use Cursor's corrected frame lookup
          const frame = def.frames?.[cell] || (def.grid as any)?.[cell] || (def.grid as any)?.frames?.[cell];
          return frame ? renderTile(frame, rx, ry, `c-${rx}-${ry}`) : null;
        })
      )}
    </>
  );
}