import React, { useEffect, useMemo } from "react";
import { Group, Image as SkImage, Rect, useImage, Atlas, Skia, rect } from "@shopify/react-native-skia";
import { Image as RNImage } from "react-native";
import { MAPS, MapName } from "../content/maps";
import { useMapSkImage } from "./MapImageContext";

type Props = { map: MapName; name: string; x?: number; y?: number; scale?: number };

// Compatibility helper: resolve a usable URI from a numeric RN asset
function resolveUri(source: number | string) {
  if (typeof source === "number") {
    const res = RNImage.resolveAssetSource(source);
    return res?.uri ?? "";
  }
  return source || "";
}

export function PrefabNode({ map, name, x = 0, y = 0, scale = 1 }: Props) {
  const { grid, prefabs, image: tileset } = MAPS[map];
  const pf = prefabs.prefabs[name];
  if (!pf) return null;

  const tile = prefabs.meta.tileSize;

  // 1) Try the shared Skia image from context
  const imgFromCtx = useMapSkImage();

  // 2) Fallback: load the tileset here (works even if provider isn't wrapping)
  const uri = useMemo(() => resolveUri(tileset), [tileset]);
  const imgLocal = useImage(typeof tileset === "number" ? (tileset as any) : uri);

  // 3) Final image we'll draw with
  const skImage = imgFromCtx ?? imgLocal ?? null;



  const draw = (f: any, rx: number, ry: number, key: string) => {
    if (!skImage) return null;

    // source rect from the tilesheet (pixels)
    const sx = f.x, sy = f.y, sw = f.w, sh = f.h;

    // destination position on screen (pixels)
    const dx = rx * tile * scale;
    const dy = ry * tile * scale;

    // Create sprite rect for Atlas
    const spriteRect = rect(sx, sy, sw, sh);
    
    // Create transform for Atlas (scale and position)
    const transform = Skia.RSXform(scale, 0, dx, dy);

    return (
      <Atlas
        key={key}
        image={skImage}
        sprites={[spriteRect]}
        transforms={[transform]}
      />
    );
  };

  const getFrame = (cell: string) => (grid as any)[cell] || (grid as any)?.frames?.[cell];

  return (
    <Group transform={[{ translateX: x }, { translateY: y }]}>
      {pf.cells?.map((row, ry) =>
        row.map((cell, rx) => (cell ? draw(getFrame(cell), rx, ry, `c-${rx}-${ry}`) : null))
      )}
      {pf.rects?.map((row, ry) =>
        row.map((r, rx) => (r ? draw(r, rx, ry, `r-${rx}-${ry}`) : null))
      )}
    </Group>
  );
}