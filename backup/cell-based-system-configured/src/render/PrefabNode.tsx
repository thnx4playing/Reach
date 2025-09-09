import React, { useMemo } from "react";
import { Image as SkImage, rect } from "@shopify/react-native-skia";
import { Image as RNImage } from "react-native";
import { MAPS, MapName, getTileSize } from "../content/maps";
import { useMapSkImage } from "./MapImageContext";

type Props = { map: MapName; name: string; x?: number; y?: number; scale?: number };

// Resolve a URI for numeric RN asset IDs
function resolveUri(source: number | string) {
  if (typeof source === "number") {
    const res = RNImage.resolveAssetSource(source);
    return res?.uri ?? "";
  }
  return source || "";
}

export function PrefabNode({ map, name, x = 0, y = 0, scale = 2 }: Props) {
  const def = MAPS[map];
  const pf = def.prefabs.prefabs[name];
  if (!pf) {
    if (__DEV__) console.warn(`[PrefabNode] missing prefab "${name}" for map "${map}"`);
    return null;
  }

  const tile = getTileSize(map) * scale;

  // Prefer shared Skia image provided by <MapImageProvider>
  const shared = useMapSkImage();
  const uri = useMemo(() => resolveUri(def.image), [def.image]);
  // If you ever want a local fallback: const img = useImage(uri);
  const img = shared;

  if (!img) return null;

  const frames = def.frames;

  const drawCell = (cellId: string, rx: number, ry: number, key: string) => {
    const f = frames[cellId];
    if (!f) {
      if (__DEV__) console.warn(`[PrefabNode] unknown cell "${cellId}" for map "${map}"`);
      return null;
    }
    const dx = x + rx * tile;
    const dy = y + ry * tile;
    return (
      <SkImage
        key={key}
        image={img}
        x={dx}
        y={dy}
        width={Math.round(f.w * scale)}
        height={Math.round(f.h * scale)}
        srcRect={rect(f.x, f.y, f.w, f.h)}
      />
    );
  };

  const drawRect = (f: {x:number;y:number;w:number;h:number}, rx: number, ry: number, key: string) => {
    const dx = x + rx * tile;
    const dy = y + ry * tile;
    return (
      <SkImage
        key={key}
        image={img}
        x={dx}
        y={dy}
        width={Math.round(f.w * scale)}
        height={Math.round(f.h * scale)}
        srcRect={rect(f.x, f.y, f.w, f.h)}
      />
    );
  };

  return (
    <>
      {pf.cells?.map((row, ry) =>
        row.map((cell, rx) => (cell ? drawCell(cell, rx, ry, `c-${rx}-${ry}`) : null))
      )}
      {pf.rects?.map((row, ry) =>
        row.map((r, rx) => (r ? drawRect(r, rx, ry, `r-${rx}-${ry}`) : null))
      )}
    </>
  );
}