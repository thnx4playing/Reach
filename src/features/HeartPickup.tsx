// src/features/HeartPickup.tsx
import React from 'react';
import { Group, Image as SkImage, useImage } from '@shopify/react-native-skia';

type Props = {
  xWorld: number;
  yWorld: number;
  xToScreen: (x: number) => number;
  worldYToScreenY: (yWorld: number) => number;
  screenW: number;
  screenH: number;
  nowMs?: number;
};

export const HEART_W = 32;
export const HEART_H = 32;

export default function HeartPickup({
  xWorld, yWorld, xToScreen, worldYToScreenY, screenW, screenH, nowMs = Date.now()
}: Props) {
  const img = useImage(require('../../assets/misc/heart-powerup.png'));
  const x = xToScreen(xWorld);
  const y = worldYToScreenY(yWorld);

  // subtle bob + pulse
  const t = nowMs / 1000;
  const bounce = Math.sin(t * 4) * 3;
  const scale  = 1 + Math.sin(t * 2) * 0.05;

  const drawW = HEART_W * scale;
  const drawH = HEART_H * scale;
  const drawX = x + (HEART_W - drawW) * 0.5;
  const drawY = y + (HEART_H - drawH) * 0.5 + bounce;

  if (!img) return null;
  return (
    <Group>
      <SkImage image={img} x={drawX} y={drawY} width={drawW} height={drawH} />
    </Group>
  );
}
