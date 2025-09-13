import React from "react";
import { Image as SkImageComponent, useImage, Group } from "@shopify/react-native-skia";
import { MAPS, MapName } from "../content/maps";
import { usePreloadedImage } from "./ImagePreloaderContext";
import { grassyPrefabImages } from "../assets/grassyPrefabs";

type Props = { map: MapName; name: string; x?: number; y?: number; scale?: number; opacity?: number };

export function PrefabNode({ map, name, x = 0, y = 0, scale = 2, opacity = 1.0 }: Props) {
  const def = MAPS[map];
  const pf = def.prefabs?.prefabs?.[name];
  if (!pf) { 
    if (__DEV__) console.warn(`[PrefabNode] missing "${name}" in "${map}"`); 
    return null; 
  }

  // Always call hooks unconditionally
  const pre = usePreloadedImage(map, name);
  const lazy = useImage(map === "grassy" ? grassyPrefabImages[name] : undefined);
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