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

  // Debug logging removed to reduce console spam

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