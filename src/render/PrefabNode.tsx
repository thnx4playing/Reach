import React, { useEffect, useMemo } from "react";
import { Group, Image as SkImage, Rect, useImage } from "@shopify/react-native-skia";
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

  useEffect(() => {
    // One concise log per prefab to prove what we're drawing with
    // eslint-disable-next-line no-console
    console.log("[PrefabNode:image]", {
      map, name,
      fromCtx: !!imgFromCtx,
      fromLocal: !!imgLocal,
      final: !!skImage,
    });
  }, [map, name, imgFromCtx, imgLocal, skImage]);

  const draw = (f: any, rx: number, ry: number, key: string) => {
    // source rect from the tilesheet (pixels)
    const sx = f.x, sy = f.y, sw = f.w, sh = f.h;

    // destination box on screen (pixels)
    const dx = rx * tile * scale;
    const dy = ry * tile * scale;
    const dw = sw * scale;
    const dh = sh * scale;

    // scale the *entire* tileset so that sw×sh → dw×dh
    const s = dw / sw; // = scale for square tiles

    return (
      <React.Fragment key={key}>
        {/* 1) clip to destination box */}
        <Group clip={{ x: dx, y: dy, width: dw, height: dh }}>
          {/* 2) draw the whole image translated so (sx,sy) maps to (dx,dy) */}
          {skImage && (
            <SkImage
              image={skImage}
              x={dx - sx * s}
              y={dy - sy * s}
              width={skImage.width() * s}
              height={skImage.height() * s}
              filterMode="nearest"
            />
          )}
        </Group>

        {/* Debug outline stays so we can see placement */}
        <Rect x={dx} y={dy} width={dw} height={dh} color="magenta" style="stroke" strokeWidth={1} />
      </React.Fragment>
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