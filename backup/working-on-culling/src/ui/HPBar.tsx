import React, { useMemo, useRef, useEffect } from "react";
import { Dimensions } from "react-native";
import { Canvas } from "@shopify/react-native-skia";
import { useImage } from "@shopify/react-native-skia";
import { SubImageShader } from "./SubImageShader";
import hpAtlas from "../../assets/ui/hp_bar.json";

// Global module state
const __hpbarGlobal = (global as any);
__hpbarGlobal.__hpbarMounts ??= 0;
__hpbarGlobal.__hpbarSingleton ??= null; // will hold the id of the active instance

const HP_SPRITE = require("../../assets/ui/hp_bar.png");

type Frame = { x: number; y: number; w: number; h: number };
type Atlas = { frames: Record<string, Frame> };
const FRAMES = (hpAtlas as unknown as Atlas).frames;

// "Design" size of the atlas JSON (what the JSON was authored for)
const DESIGN_W = 116;
const DESIGN_H = 141;

const SCALE = 2;
const MAX_BARS = 5;

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function HPBar() {
  const idRef = useRef(Math.random().toString(36).slice(2));

  // Dev-only singleton guard
  if (__DEV__ && __hpbarGlobal.__hpbarSingleton && __hpbarGlobal.__hpbarSingleton !== idRef.current) {
    // Another instance is already active – render nothing
    return null;
  }

  // On mount, claim singleton; on unmount, release it
  useEffect(() => {
    __hpbarGlobal.__hpbarMounts += 1;
    if (__DEV__) {
      if (!__hpbarGlobal.__hpbarSingleton) __hpbarGlobal.__hpbarSingleton = idRef.current;
      console.log("[HPBar MOUNTED]", idRef.current, "active=", __hpbarGlobal.__hpbarMounts, "singleton=", __hpbarGlobal.__hpbarSingleton);
    }
    return () => {
      __hpbarGlobal.__hpbarMounts -= 1;
      if (__DEV__ && __hpbarGlobal.__hpbarSingleton === idRef.current) {
        __hpbarGlobal.__hpbarSingleton = null;
      }
      if (__DEV__) console.log("[HPBar UNMOUNTED]", idRef.current, "active=", __hpbarGlobal.__hpbarMounts);
    };
  }, []);

  const img = useImage(HP_SPRITE);          // <<< important: require(), not URI

  const { useHealth } = require("../systems/health/HealthContext");
  let bars = MAX_BARS;
  try { bars = Math.max(0, Math.min(MAX_BARS, useHealth()?.bars ?? MAX_BARS)); } catch {}

  const key = `hp_${bars}`;
  const logical = FRAMES[key] ?? FRAMES["hp_5"]; // JSON frame in "design" pixels

  // Map the JSON's 116×141 grid to the *actual* image pixel grid
  const assetScaleX = img ? img.width()  / DESIGN_W : 1;
  const assetScaleY = img ? img.height() / DESIGN_H : 1;

  const framePx: Frame = useMemo(() => ({
    x: logical.x * assetScaleX,
    y: logical.y * assetScaleY,
    w: logical.w * assetScaleX,
    h: logical.h * assetScaleY,
  }), [logical, assetScaleX, assetScaleY]);

  // Debug logging removed to reduce console spam

  const width  = logical.w * SCALE; // HUD display size uses logical (keeps UI consistent)
  const height = logical.h * SCALE;


  return (
    <Canvas
      style={{
        position: "absolute",
        right: 12,
        top: 42,
        width,
        height,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {/* framePx is in actual image pixels; SubImageShader uses ImageShader for precise sampling */}
      <SubImageShader image={img} frame={framePx} x={0} y={0} scale={SCALE} />
    </Canvas>
  );
}