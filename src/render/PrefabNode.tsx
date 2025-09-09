import React from "react";
import { Image as SkImageComponent, useImage } from "@shopify/react-native-skia";
import { MAPS, MapName } from "../content/maps";
import { usePreloadedImage } from "./ImagePreloaderContext";
import { grassyPrefabImages } from "../assets/grassyPrefabs";

type Props = { map: MapName; name: string; x?: number; y?: number; scale?: number };

export function PrefabNode({ map, name, x = 0, y = 0, scale = 2 }: Props) {
  const def = MAPS[map];
  const pf = def.prefabs?.prefabs?.[name];
  if (!pf) { 
    if (__DEV__) console.warn(`[PrefabNode] missing "${name}" in "${map}"`); 
    return null; 
  }

  // Prefer preloaded (zero-jank). If not yet loaded, try direct useImage source from manifest.
  const img = usePreloadedImage(map, name);
  const fallbackImg = !img ? (() => {
    const src = map === "grassy" ? grassyPrefabImages[name] : undefined;
    return src ? useImage(src) : null;
  })() : null;
  
  const finalImg = img || fallbackImg;
  if (!finalImg) {
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

  const tile = (def.prefabs?.meta?.tileSize ?? 16) * scale;
  let cols = 1, rows = 1;

  if (pf.cells?.length) {
    rows = pf.cells.length;
    cols = Math.max(...pf.cells.map(row => {
      let maxCol = 0;
      for (let i = row.length - 1; i >= 0; i--) if (row[i] != null) { maxCol = i + 1; break; }
      return maxCol;
    }));
  } else if (pf.rects?.length) {
    rows = pf.rects.length;
    cols = Math.max(...pf.rects.map(row => {
      let maxCol = 0;
      for (let i = row.length - 1; i >= 0; i--) if (row[i] != null) { maxCol = i + 1; break; }
      return maxCol;
    }));
  }

  const width = cols * tile;
  const height = rows * tile;

  // optional foot inset (same idea as the other AI's version)
  const footInset = (["tree-large-final","tree-medium-final","tree-small-final",
                      "mushroom-red-large-final","mushroom-red-medium-final","mushroom-red-small-final",
                      "mushroom-green-large-final","mushroom-green-medium-final","mushroom-green-small-final",
                      "grass-1-final","grass-2-final","grass-3-final","grass-4-final","grass-5-final","grass-6-final"]
                    .includes(name) ? 2.5*scale : 0);

  return (
    <SkImageComponent
      image={finalImg}
      x={Math.round(x)} y={Math.round(y + footInset)}
      width={Math.round(width)} height={Math.round(height)}
      fit="fill"
    />
  );
}

// Static property to track warned prefabs
(PrefabNode as any)._warnedPrefabs = new Set();