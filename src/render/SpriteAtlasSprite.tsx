import React, { useMemo } from "react";
import { Atlas, Group, Skia, rect as skRect, type SkImage } from "@shopify/react-native-skia";

// Set to true while debugging; false for prod
const DEBUG = false;

/**
 * Single-frame Atlas sprite with foot anchoring + horizontal flip.
 * - Exactly ONE rect + ONE transform.
 * - No negative RSXform (avoids upside-down).
 * - Scaling is done with an outer Group; RSXform stays identity.
 */
export default function SpriteAtlasSprite({
  image,
  frame,         // { x, y, w, h } in atlas pixels
  x,              // world X for the LEFT edge
  baselineY,      // world Y for feet (bottom)
  scale = 1,
  flipX = false,
  tag = 'Dash',           // <-- NEW (optional)
}: {
  image: SkImage | null;
  frame: { x: number; y: number; w: number; h: number };
  x: number;
  baselineY: number;
  scale?: number;
  flipX?: boolean;
  tag?: string;
}) {
  if (!image) return null;

  const fx = frame.x | 0, fy = frame.y | 0, fw = frame.w | 0, fh = frame.h | 0;
  const sprites = useMemo(() => [skRect(fx, fy, fw, fh)], [fx, fy, fw, fh]);

  // Identity RSXform; we position/scale with Groups instead.
  const transforms = useMemo(() => [Skia.RSXform(1, 0, 0, 0)], []);

  // Feet anchoring
  const drawW = fw * scale;
  const drawH = fh * scale;
  const topY  = baselineY - drawH;

  // Horizontal flip by mirroring X only (no upside-down)
  const outerTransform = flipX
    ? [{ translateX: Math.round(x + drawW) }, { translateY: Math.round(topY) }, { scaleX: -1 }, { scaleY: 1 }]
    : [{ translateX: Math.round(x) },        { translateY: Math.round(topY) }, { scaleX:  1 }, { scaleY: 1 }];

  if (__DEV__ && DEBUG) {
    console.log("Atlas draw frame", { x: fx, y: fy, w: fw, h: fh }, { scale, flipX });
  }

  // Hard assertion - this component CANNOT draw more than one sprite
  if (__DEV__) {
    const sCount = sprites.length, tCount = transforms.length;
    if (sCount !== 1 || tCount !== 1) {
      throw new Error(`Atlas misuse: expected 1 sprite & 1 transform, got sprites=${sCount}, transforms=${tCount}`);
    }
  }

  if (__DEV__) {
    (globalThis as any).__dashDraws = ((globalThis as any).__dashDraws ?? 0) + 1;
    const frameID = (globalThis as any).__dashFrameID ?? 0;
    // This will print once per *real* draw of the sprite each frame
    console.log('DASH_DRAW', { frameID, draws: (globalThis as any).__dashDraws, tag, frame, scale, flipX });
  }

  return (
    <Group transform={outerTransform}>
      <Group transform={[{ scaleX: scale }, { scaleY: scale }]}>
        {DEBUG && (
          <Group>
            {/* visualize destination box */}
            <Atlas image={image} sprites={[skRect(0,0,0,0)]} transforms={[Skia.RSXform(1,0,0,0)]}/>
          </Group>
        )}
        <Atlas image={image} sprites={sprites} transforms={transforms} />
      </Group>
    </Group>
  );
}
