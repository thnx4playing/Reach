// src/render/GroundBand.tsx
import React from "react";
import { View } from "react-native";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";

type Props = {
  width: number;
  height: number;   // band height in px
  y: number;        // screen Y (top of band)
  opacity?: number; // 0..1
  timeMs?: number;  // animation time in ms (subtle sway)
};

/**
 * Ground band (dirt with grass top) drawn entirely in Skia.
 * Uses layered solid fills (no gradients) for performance and to avoid srcRect issues.
 * API mirrors HazardBand so it can be slotted in easily.
 */
export default function GroundBand({ width, height, y, opacity = 1, timeMs = 0 }: Props) {
  const grassHeight = Math.max(8, Math.round(height * 0.05)); // top green lip
  // Extend dirt area by 50px below the calculated height to fill more black space
  const dirtHeight  = Math.max(0, height - grassHeight + 50);

  // Small wavy grass edge
  const waveAmp = 4;
  const waveLen = 64;
  const phase   = (timeMs % 4000) / 4000 * (Math.PI * 2);

  const makeGrassPath = () => {
    const path = Skia.Path.Make();
    const top = y;
    const bottom = y + grassHeight;

    path.moveTo(0, bottom);
    // Wavy top edge
    const steps = Math.max(8, Math.ceil(width / waveLen));
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      const offset = Math.sin((x / waveLen) * Math.PI * 2 + phase) * waveAmp;
      const yEdge = top + Math.max(-waveAmp, Math.min(waveAmp, offset));
      path.lineTo(x, yEdge);
    }
    path.lineTo(width, bottom);
    path.close();
    return path;
  };

  const makeDirtPath = () => {
    const path = Skia.Path.Make();
    path.addRect({ x: 0, y: y + grassHeight, width, height: dirtHeight });
    return path;
  };

  // Colors tuned for your palette
  const grassPrimary = "#59c93c";
  const grassShadow  = "#3fa62b";
  const dirtDark     = "#4b2f26";
  const dirtMid      = "#5a3a2d";
  const dirtLight    = "#6c4638";

  // Three dirt layers to fake depth
  const dirtLayers = [
    { color: dirtDark, yOff: 0,     hMul: 1.00, op: 1.0 },
    { color: dirtMid,  yOff: 6,     hMul: 0.85, op: 0.9 },
    { color: dirtLight,yOff: 12,    hMul: 0.70, op: 0.85 },
  ];

  const grassPath = makeGrassPath();
  const dirtPath  = makeDirtPath();

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, opacity }}>
      <Canvas style={{ position: "absolute", left: 0, top: 0, width, height: y + height + 50 }}>
        {/* Dirt base rectangles */}
        {dirtLayers.map((l, i) => {
          const h = Math.max(0, dirtHeight * l.hMul);
          return (
            <Path
              key={i}
              path={Skia.Path.MakeFromSVGString(`M0 ${y+grassHeight+l.yOff} H ${width} V ${y+grassHeight+l.yOff+h} H 0 Z`)!}
              color={l.color}
              opacity={l.op}
              style="fill"
            />
          );
        })}

        {/* Grass lip */}
        <Path path={grassPath} color={grassShadow} opacity={1} style="fill" />
        <Path path={grassPath} color={grassPrimary} opacity={0.85} style="fill" />
      </Canvas>
    </View>
  );
}
