import React from "react";
import { Image as SkImage, useImage, Group } from "@shopify/react-native-skia";
import { MAPS, MapName } from "../content/maps";
import { useMapSkImage } from "./MapImageContext";

type Props = { map: MapName; name: string; x?: number; y?: number; scale?: number };


export function PrefabNode({ map, name, x = 0, y = 0, scale = 2 }: Props) {
  const def = MAPS[map];
  const pf = def.prefabs?.prefabs?.[name];
  if (!pf) {
    if (__DEV__) console.warn(`[PrefabNode] missing prefab "${name}" in map "${map}"`);
    return null;
  }
  const tile = (def.prefabs?.meta?.tileSize ?? 16) * scale;

  // SIMPLIFIED: Use direct image loading only
  const { skImage: ctxImg } = useMapSkImage();
  const img = ctxImg || useImage(def.image);

  if (!img) {
    // Only warn once per prefab type to reduce spam
    if (__DEV__ && !(PrefabNode as any)._warnedPrefabs) {
      (PrefabNode as any)._warnedPrefabs = new Set();
    }
    const warnKey = `${map}-${name}`;
    if (__DEV__ && !(PrefabNode as any)._warnedPrefabs.has(warnKey)) {
      console.warn(`[PrefabNode] No image loaded for map "${map}", prefab "${name}"`);
      (PrefabNode as any)._warnedPrefabs.add(warnKey);
    }
    return null;
  }

  const drawRect = (f: any, rx: number, ry: number, key: string) => {
    if (!f) return null;
    const sx = f.x, sy = f.y, sw = f.w, sh = f.h;

    // Absolute, top-left placement
    const dx = x + rx * tile;
    const dy = y + ry * tile;
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);

    // FIXED: Use Group with clip instead of srcRect to avoid clipping issues
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
          fit="fill"
        />
      </Group>
    );
  };

  return (
    <>
      {pf.cells?.map((row: any[], ry: number) =>
        row.map((cell: string | null, rx: number) => {
          if (!cell) return null;
          // Use correct frame lookup priority for grassy map
          const frame = def.frames?.[cell] || (def as any).grid?.[cell] || (def as any).grid?.frames?.[cell];
          return frame ? drawRect(frame, rx, ry, `c-${rx}-${ry}`) : null;
        })
      )}
      {pf.rects?.map((row: any[], ry: number) =>
        row.map((r: any, rx: number) => (r ? drawRect(r, rx, ry, `r-${rx}-${ry}`) : null))
      )}
    </>
  );
}

// Static property to track warned prefabs
(PrefabNode as any)._warnedPrefabs = new Set();