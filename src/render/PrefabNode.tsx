import React from "react";
import { Image as SkImageComponent, useImage, Group } from "@shopify/react-native-skia";
import { MAPS, MapName } from "../content/maps";
import { usePreloadedImage } from "./ImagePreloaderContext";
import { grassyPrefabImages } from "../assets/grassyPrefabs";
import { darkPrefabImages } from "../assets/darkPrefabs";
import { frozenPrefabImages } from "../assets/frozenPrefabs";

type Props = { map: MapName; name: string; x?: number; y?: number; scale?: number; opacity?: number };

export function PrefabNode({ map, name, x = 0, y = 0, scale = 2, opacity = 1.0 }: Props) {
  // Normalize map for assets (bossroom uses dark tiles)
  const logicalMap = (map === "bossroom" ? "dark" : map) as MapName;
  const def = MAPS[logicalMap];
  const pf = def.prefabs?.prefabs?.[name];
  if (!pf) {
    // Don't bail—fall back to image dimensions so we still render
    if (__DEV__) {
      const warned = ((PrefabNode as any)._warnedPrefabs ?? new Set()) as Set<string>;
      const key = `${logicalMap}:${name}`;
      if (!warned.has(key)) {
        console.warn(`[PrefabNode] missing "${name}" in "${logicalMap}" — drawing by image size.`);
        warned.add(key);
        (PrefabNode as any)._warnedPrefabs = warned;
      }
    }
  }

  // Always call hooks unconditionally
  const pre = usePreloadedImage(logicalMap, name);
  const lazy = useImage(
    logicalMap === "grassy"
      ? grassyPrefabImages[name]
      : logicalMap === "dark"
      ? darkPrefabImages[name]
      : logicalMap === "frozen"
      ? frozenPrefabImages[name]
      : undefined
  );
  const finalImg = pre || lazy;
  if (!finalImg) return null;

  // Draw at the PNG's intrinsic size (scaled)
  const width  = finalImg.width()  * scale;
  const height = finalImg.height() * scale;

  // ONE place will apply foot inset: alignPrefabYToSurfaceTop (not here)
  return (
    <Group opacity={opacity}>
      <SkImageComponent
        image={finalImg}
        x={Math.round(x)}
        y={Math.round(y)}
        width={Math.round(width)}
        height={Math.round(height)}
        fit="fill"
      />
    </Group>
  );
}

// Static property to track warned prefabs
(PrefabNode as any)._warnedPrefabs = new Set();