import React, { useMemo } from "react";
import { Canvas, Group } from "@shopify/react-native-skia";
import hpAtlas from "../../assets/ui/hp_bar.json";
import hpPng from "../../assets/ui/hp_bar.png";
import SubImage from "./SubImage";

type Frame = { x: number; y: number; w: number; h: number };
type Atlas = {
  frames: Record<string, Frame>;
};

const HP_BAR = {
  atlas: hpPng,
  frames: hpAtlas as unknown as Atlas,
};

type Props = {
  hits: number;     // how many times player has been hit
  maxHits: number;  // total hearts
  scale?: number;   // visual scale (2 = 2x)
  right?: number;   // inset from right edge
  top?: number;     // inset from top edge
  debug?: boolean;
};

export default function SkiaHPBar({
  hits,
  maxHits,
  scale = 2,
  right = 10,
  top = 10,
  debug = false,
}: Props) {
  // Remaining hearts
  const remaining = Math.max(0, Math.min(maxHits, maxHits - hits));

  // hp_bar.json uses hp_5..hp_1 and hp_0
  const key = `hp_${remaining}`;

  const frame = HP_BAR.frames.frames[key];

  if (!frame) {
    console.warn(`[SkiaHPBar] Frame not found for key: ${key}`);
    return null;
  }

  const width = frame.w * scale;
  const height = frame.h * scale;

  console.log(`[SkiaHPBar] hits=${hits} maxHits=${maxHits} remaining=${remaining} key=${key} frame=`, frame);

  // We size the Canvas exactly to the bar to keep overdraw low
  return (
    <Canvas
      // Top-right anchor
      style={{
        position: "absolute",
        right,
        top,
        width,
        height,
      }}
      pointerEvents="none"
    >
      <Group>
        <SubImage
          image={HP_BAR.atlas}
          frame={frame}
          x={0}
          y={0}
          scale={scale}
          debug={debug}
        />
      </Group>
    </Canvas>
  );
}
