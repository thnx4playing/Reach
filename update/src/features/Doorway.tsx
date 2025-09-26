// src/features/Doorway.tsx
import React, { useMemo } from 'react';
import { Group, Rect } from '@shopify/react-native-skia';
import { DOORWAY_WIDTH, DOORWAY_HEIGHT } from '../config/gameplay';

type Props = {
  doorWorldX: number; // left edge in world px
  doorWorldY: number; // top edge in world px (world Y grows downward)
  worldYToScreenY: (yWorld: number) => number;
  xToScreen: (xWorld: number) => number;
  cameraY: number;
  screenW: number;
  screenH: number;
};

// Simple 8‑bit doorway: frame + inner void + little pediment
export default function Doorway({
  doorWorldX, doorWorldY, worldYToScreenY, xToScreen, screenW, screenH
}: Props) {
  const x = xToScreen(doorWorldX);
  const y = worldYToScreenY(doorWorldY);
  if (x < -200 || x > screenW + 200) return null;
  if (y < -200 || y > screenH + 300) return null;

  const frame = { w: DOORWAY_WIDTH, h: DOORWAY_HEIGHT };
  const gap = 8;

  return (
    <Group transform={[{ translateX: x }, { translateY: y }]}>
      {/* outer frame */}
      <Rect x={0} y={0} width={frame.w} height={frame.h} color="#2b2b2b" />
      {/* inner wall */}
      <Rect x={4} y={4} width={frame.w-8} height={frame.h-8} color="#6b4e2e" />
      {/* darker jamb */}
      <Rect x={8} y={12} width={frame.w-16} height={frame.h-20} color="#1a1a1a" />
      {/* chunky pixels to feel 8‑bit */}
      <Rect x={8} y={frame.h-20} width={frame.w-16} height={8} color="#101010" />
      <Rect x={8} y={12} width={8} height={frame.h-32} color="#3d2a18" />
      <Rect x={frame.w-16} y={12} width={8} height={frame.h-32} color="#3d2a18" />
      {/* little pediment bricks */}
      <Rect x={0} y={-8} width={frame.w} height={8} color="#2b2b2b" />
      <Rect x={4} y={-12} width={frame.w-8} height={4} color="#3c3c3c" />
    </Group>
  );
}

export function playerOverlapsDoor(
  playerX: number, playerY: number,      // player center in world px
  doorX: number, doorY: number,          // door top-left in world px
): boolean {
  const w = DOORWAY_WIDTH;
  const h = DOORWAY_HEIGHT;
  const px = playerX;
  const py = playerY - 24; // bias toward chest/torso
  return (px >= doorX && px <= doorX + w && py >= doorY && py <= doorY + h);
}