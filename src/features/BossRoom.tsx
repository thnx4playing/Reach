// src/features/BossRoom.tsx
import React, { useMemo } from 'react';
import { Group, Rect } from '@shopify/react-native-skia';
import type { PlatformDef } from '../systems/platform/types';
import { BOSSROOM_PLATFORM_COUNT } from '../config/gameplay';

type Props = {
  floorYWorld: number;              // top of the floor (like floorTopY)
  screenW: number;
  screenH: number;
  xToScreen: (xWorld: number) => number;
  worldYToScreenY: (yWorld: number) => number;
  tileW: number;
  roomWidthWorld: number;
  platforms: PlatformDef[];
};

// Simple full‑width floor band and fixed platforms
export default function BossRoom({
  floorYWorld, screenW, screenH, xToScreen, worldYToScreenY, roomWidthWorld, platforms
}: Props) {
  const y = worldYToScreenY(floorYWorld);
  return (
    <Group>
      {/* full floor */}
      <Rect x={0} y={y} width={screenW} height={24} color="#3a3a3a" />
      {/* fixed platforms are rendered by existing PlatformRenderer via props */}
    </Group>
  );
}
