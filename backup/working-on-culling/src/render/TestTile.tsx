import React from "react";
import { Image as SkImage, Rect } from "@shopify/react-native-skia";
import { useMapSkImage } from "./MapImageContext";

export default function TestTile() {
  const img = useMapSkImage();
  if (!img) return null;

  // Draw a 16x16 tile from top-left of the tilesheet at (12,12)
  const src = { x: 0, y: 0, w: 16, h: 16 };
  const dst = { x: 12, y: 12, w: 32, h: 32 }; // scale 2

  return (
    <>
      <SkImage
        image={img}
        x={dst.x}
        y={dst.y}
        width={dst.w}
        height={dst.h}
        rect={{ x: src.x, y: src.y, width: src.w, height: src.h }}
      />
      <Rect x={dst.x} y={dst.y} width={dst.w} height={dst.h} color="lime" style="stroke" strokeWidth={1} />
    </>
  );
}

