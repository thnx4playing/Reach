// src/ui/SubImageShader.tsx
import React from "react";
import {
  Rect,
  Paint,
  ImageShader,
  type SkImage as SkiaImage,
} from "@shopify/react-native-skia";

export type Frame = { x: number; y: number; w: number; h: number };

export function SubImageShader({
  image,
  frame,
  x = 0,
  y = 0,
  scale = 1,
}: {
  image: SkiaImage | null;
  frame: Frame;  // in IMAGE pixels (not logical)
  x?: number;
  y?: number;
  scale?: number;
}) {
  if (!image) return null;

  // Snap the destination origin to device pixels (prevents "drift").
  const dx = Math.round(x);
  const dy = Math.round(y);

  // Destination size on screen.
  const dw = Math.round(frame.w * scale);
  const dh = Math.round(frame.h * scale);

  // Mapping: imageCoord = frame.xy + (local - dxy) * (1/scale)
  // Important: order matters; transforms are applied in sequence.
  const transform = [
    { translateX: -dx },               // local -> rect-local
    { translateY: -dy },
    { scale: 1 / scale },              // scale to image pixels
    { translateX: frame.x },           // offset to frame top-left
    { translateY: frame.y },
  ];

  // Optional: sanity log to prove corners map correctly
  if (__DEV__) {
    const mapX0 = frame.x + (0 - 0) * (1 / scale);
    const mapX1 = frame.x + (dw - 0) * (1 / scale);
    const mapY0 = frame.y + (0 - 0) * (1 / scale);
    const mapY1 = frame.y + (dh - 0) * (1 / scale);
    console.log("[HPBar shader map]", {
      dx, dy, dw, dh,
      expectX0: frame.x, expectX1: frame.x + frame.w,
      expectY0: frame.y, expectY1: frame.y + frame.h,
      calcX0: mapX0, calcX1: mapX1, calcY0: mapY0, calcY1: mapY1,
    });
  }

  return (
    <Rect x={dx} y={dy} width={dw} height={dh} antiAlias={false}>
      <Paint>
        <ImageShader
          image={image}
          tx="clamp"
          ty="clamp"
          fm="nearest"
          transform={transform}
        />
      </Paint>
    </Rect>
  );
}