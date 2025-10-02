// src/features/HeartPickup.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Group, Image as SkImage, Circle, Rect, useImage } from '@shopify/react-native-skia';

type Props = {
  xWorld: number;
  yWorld: number;
  xToScreen: (x: number) => number;
  worldYToScreenY: (yWorld: number) => number;
  screenW: number;
  screenH: number;
  // We keep spawnAtMs only to reset the animation when a new heart is spawned
  spawnAtMs?: number;
  fadeMs?: number; // default 850ms
};

export const HEART_W = 32;
export const HEART_H = 32;

function clamp01(v:number){ return Math.max(0, Math.min(1, v)); }
function smoothstep(t:number){ return t*t*(3 - 2*t); }

export default function HeartPickup({
  xWorld, yWorld, xToScreen, worldYToScreenY, screenW, screenH, spawnAtMs, fadeMs = 850
}: Props) {
  const img = useImage(require('../../assets/misc/heart-powerup.png'));
  
  // Debug image loading
  React.useEffect(() => {
    if (img) {
      console.log('[DEBUG] Heart image loaded successfully');
    } else {
      console.log('[DEBUG] Heart image not loaded yet');
    }
  }, [img]);
  const x = xToScreen(xWorld);
  const y = worldYToScreenY(yWorld);

  // Local animation clock (isolated from parent clocks & Skia quirks)
  const startRef = useRef<number>(0);
  const [now, setNow] = useState<number>(0);

  useEffect(() => {
    startRef.current = performance.now();
    setNow(startRef.current);
    let raf = 0;
    const tick = () => {
      setNow(performance.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spawnAtMs]);

  // Fade progress (0..1), clamped & eased
  const elapsed = Math.max(0, now - startRef.current);
  const p = clamp01(elapsed / fadeMs);
  const alpha = smoothstep(p);
  
  // Use the calculated alpha for proper fade animation
  const finalAlpha = alpha;
  
  // Debug logging
  if (Math.random() < 0.01) { // Log occasionally to avoid spam
    console.log('[DEBUG] HeartPickup fade:', { elapsed, p, alpha, now, startRef: startRef.current });
  }

  // Idle motion
  const tSec = now / 1000;
  const bounce = Math.sin(tSec * 4) * 3;
  const scale = 1 + Math.sin(tSec * 2) * 0.05;

  const drawW = HEART_W * scale;
  const drawH = HEART_H * scale;
  const drawX = x + (HEART_W - drawW) * 0.5;
  const drawY = y + (HEART_H - drawH) * 0.5 + bounce;

  return (
    <Group>
      {/* spawn rings behind the heart during fade-in (independent opacity) */}
      {p < 1 && (
        <Group opacity={0.75 * (1 - p)}>
          <Circle cx={x + HEART_W/2} cy={y + HEART_H/2} r={12 + p*16} color="#ffd54a" />
          <Circle cx={x + HEART_W/2} cy={y + HEART_H/2} r={8 + p*12}  color="#ff9a00" />
          <Circle cx={x + HEART_W/2} cy={y + HEART_H/2} r={4 + p*8}   color="#fff47a" />
        </Group>
      )}

      {/* faint halo so it never disappears against bright floors */}
      <Circle
        cx={x + HEART_W/2}
        cy={y + HEART_H/2 + bounce}
        r={Math.max(HEART_W, HEART_H) * 0.55}
        color="#ffffff"
        opacity={finalAlpha * 0.18}
      />

      {/* heart image fades directly OR fallback rect if image isn't loaded */}
      {img ? (
        <SkImage opacity={finalAlpha} image={img} x={drawX} y={drawY} width={drawW} height={drawH} />
      ) : (
        // Visible fallback when the PNG isn't found/loaded: a red pixel-heart block
        <Group opacity={finalAlpha}>
          <Rect x={drawX} y={drawY} width={drawW} height={drawH} color="red" />
        </Group>
      )}
    </Group>
  );
}
