import React, { useMemo } from "react";
import { Dimensions, Image as RNImage } from "react-native";
import { Canvas, Rect } from "@shopify/react-native-skia";
import { useImage } from "@shopify/react-native-skia";
import { SubImage } from "./SubImage";

// Each frame is 116x23, stacked vertically with 1px gaps -> pitch=24
const HP_SPRITE = require("../../assets/ui/hp_bar.png");
const HP_URI = RNImage.resolveAssetSource(HP_SPRITE)?.uri ?? "";
const FRAME_W = 116;
const FRAME_H = 23;
const PITCH = 24; // 23px frame + 1px spacer row
const SCALE = 2;  // HUD scale on screen

function frameFromHits(hits: number, maxHits: number) {
  // Rows top→bottom are FULL→EMPTY:
  // row = hits (0..maxHits). For maxHits=5:
  // 0 => 5/5 (y = 0)
  // 1 => 4/5 (y = 24)
  // ...
  // 5 => 0/5 (y = 120)
  const row = Math.max(0, Math.min(maxHits, hits));
  return { x: 0, y: row * PITCH, w: FRAME_W, h: FRAME_H };
}

export default function HPBar({ hits, maxHits }: { hits: number; maxHits: number }) {
  const img = useImage(HP_URI);
  const frame = useMemo(() => frameFromHits(hits, maxHits), [hits, maxHits]);

  const dw = Math.round(frame.w * SCALE);
  const dh = Math.round(frame.h * SCALE);

  const { width: screenW } = Dimensions.get("window");
  const padding = 12;
  const x = Math.round(screenW - padding - dw);
  const y = padding;

  console.log(`[HPBar] hits=${hits} maxHits=${maxHits} row=${Math.max(0, Math.min(maxHits, hits))} frame=`, frame);
  console.log(`[HPBar] HP_URI=`, HP_URI, "img=", img ? `loaded ${img.width}x${img.height}` : "loading...");

  // If the image isn't ready yet, draw a faint placeholder so your slot is visible.
  if (!img) {
    return (
      <Canvas
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: dw,
          height: dh,
          pointerEvents: "none",
          zIndex: 9999,
        }}
      >
        <Rect x={0} y={0} width={dw} height={dh} color="rgba(255,255,255,0.07)" />
      </Canvas>
    );
  }

  return (
    <Canvas
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: dw,
        height: dh,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      <SubImage image={img} frame={frame} x={0} y={0} scale={SCALE} />
      {/* Micro-test: draw a thin outline so you see the exact box the bar occupies */}
      <Rect
        x={0}
        y={0}
        width={dw}
        height={dh}
        color="rgba(255,255,255,0.15)"
      />
    </Canvas>
  );
}