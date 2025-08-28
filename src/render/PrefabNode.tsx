import React from "react";
import { Group, Image as SkImage, useImage } from "@shopify/react-native-skia";
import { MAPS, MapName, Prefab } from "../content/maps";

// Draw using atlas frames (recommended)
export function PrefabNode({
  map,
  name,
  x = 0,
  y = 0,
  scale = 1,
}: {
  map: MapName;
  name: string;
  x?: number;
  y?: number;
  scale?: number;
}) {
  const { image, grid, prefabs } = MAPS[map];
  const skiaImage = useImage(image);
  const prefab: Prefab | undefined = prefabs.prefabs[name];
  if (!prefab || !skiaImage) return null;

  const tile = prefabs.meta.tileSize;
  const rows = prefab.cells; // supports null holes

  return (
    <Group>
      {rows.map((row, ry) =>
        row.map((cell, rx) => {
          if (!cell) return null; // hole
          const r = (grid.frames as any)[cell]; // {x,y,w,h}
          const dx = x + rx * tile * scale;
          const dy = y + ry * tile * scale;
          return (
            <SkImage
              key={`${name}-${rx}-${ry}`}
              image={skiaImage}
              x={dx}
              y={dy}
              width={r.w * scale}
              height={r.h * scale}
              rect={{ x: r.x, y: r.y, width: r.w, height: r.h }}
            />
          );
        })
      )}
    </Group>
  );
}

// Optional: direct srcRect route without frame names
export function PrefabNodeSrcRect({
  map,
  name,
  x = 0,
  y = 0,
  scale = 1,
}: {
  map: MapName;
  name: string;
  x?: number;
  y?: number;
  scale?: number;
}) {
  const { image, prefabs } = MAPS[map];
  const skiaImage = useImage(image);
  const prefab = prefabs.prefabs[name];
  if (!prefab || !skiaImage) return null;

  const tile = prefabs.meta.tileSize;
  const rows = prefab.rects;

  return (
    <Group>
      {rows.map((row, ry) =>
        row.map((rect, rx) => {
          if (!rect) return null; // hole
          const dx = x + rx * tile * scale;
          const dy = y + ry * tile * scale;
          return (
            <SkImage
              key={`${name}-rect-${rx}-${ry}`}
              image={skiaImage}
              x={dx}
              y={dy}
              width={rect.w * scale}
              height={rect.h * scale}
              rect={{ x: rect.x, y: rect.y, width: rect.w, height: rect.h }}
            />
          );
        })
      )}
    </Group>
  );
}
