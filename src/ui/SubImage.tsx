import React from "react";
import { Image as SkImage } from "@shopify/react-native-skia";

export type Frame = { x: number; y: number; w: number; h: number };

export function SubImage({
  image,
  frame,
  x = 0,
  y = 0,
  scale = 1,
}: {
  image: any;         // SkImage from useImage(...)
  frame: Frame;       // source rect on the sprite sheet
  x?: number;         // dest x
  y?: number;         // dest y
  scale?: number;     // scale applied to the frame
}) {
  const dw = Math.round(frame.w * scale);
  const dh = Math.round(frame.h * scale);

  // IMPORTANT: pass the source rect using `rect`, and the output size using width/height.
  return (
    <SkImage
      image={image}
      rect={{ x: frame.x, y: frame.y, width: frame.w, height: frame.h }}
      x={x}
      y={y}
      width={dw}
      height={dh}
      fit="fill"
      filtering="nearest" // crisp pixels for HUD
    />
  );
}