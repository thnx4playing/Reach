// SubImage.ts — pixel-precise source rects for sprite sheets
export type Frame = { x: number; y: number; w: number; h: number };

export function srcRectFromFrame(frame: Frame) {
  // Skia uses pixel coordinates for srcRect (not normalized).
  // KEEP THESE EXACT KEYS ("x","y","width","height") for Skia <Image srcRect=...>
  return {
    x: frame.x,
    y: frame.y,
    width: frame.w,
    height: frame.h,
  };
}

/**
 * Given a desired on-screen scale, return destination width/height.
 * Keep the aspect ratio of the frame, do not use the full sheet size.
 */
export function destSizeFromFrame(frame: Frame, scale = 1) {
  return { width: Math.round(frame.w * scale), height: Math.round(frame.h * scale) };
}
