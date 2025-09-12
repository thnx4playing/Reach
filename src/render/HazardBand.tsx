// src/render/HazardBand.tsx
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Canvas, Rect, RuntimeShader, Skia, useClock } from "@shopify/react-native-skia";
import { useDerivedValue } from "react-native-reanimated";

type Props = {
  width: number;
  height: number;   // band height in px
  y: number;        // screen Y (top of band)
  opacity?: number; // 0..1
};

/**
 * One-rect, GPU-only animated hazard band.
 * Looks like glowing lava/fire with a wavy top edge.
 * No sprites, no image uploads, minimal CPU work.
 */
export default function HazardBand({ width, height, y, opacity = 1 }: Props) {
  // Compile shader once - SIMPLIFIED VERSION FOR DEBUGGING
  const effect = useMemo(
    () =>
      Skia.RuntimeEffect.Make(`
uniform float2 iResolution; // (width, height)
uniform float iTime;
uniform float uOpacity;

half4 main(float2 xy) {
  // Normalize coordinates into [0,1]
  float2 uv = xy / iResolution;

  // Simple animated red-orange gradient
  float wave = 0.1 * sin(uv.x * 10.0 + iTime * 3.0);
  float edge = 0.2 + wave;
  
  // Simple mask
  float mask = smoothstep(edge, edge - 0.1, uv.y);
  
  // Simple color: red to orange
  half3 color = mix(half3(0.8, 0.2, 0.0), half3(1.0, 0.5, 0.0), uv.y);
  
  return half4(color, mask * uOpacity);
}
    `)!,
    []
  );

  // Drive animation time with Skia's clock (keeps work on UI/GPU side)
  const clock = useClock();
  const uniforms = useDerivedValue(() => {
    return {
      iResolution: [width, height],
      iTime: clock.value / 1000, // seconds
      uOpacity: opacity,
    };
  }, [width, height]);

  // Absolute overlay sized to the band area
  return (
    <View style={{ position: "absolute", left: 0, top: y, width, height, zIndex: 10 }}>
      <Canvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height}>
          <RuntimeShader source={effect} uniforms={uniforms} />
        </Rect>
      </Canvas>
    </View>
  );
}
