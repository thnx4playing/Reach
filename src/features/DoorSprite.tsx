// src/features/DoorSprite.tsx
import React from 'react';
import { Image as SkImage, Group } from '@shopify/react-native-skia';
import { useImage } from '@shopify/react-native-skia';
import { DOORWAY_WIDTH, DOORWAY_HEIGHT } from '../config/gameplay';

type Props = {
  doorWorldX: number; // world left
  doorWorldY: number; // world top
  xToScreen: (x: number) => number;
  worldYToScreenY: (y: number) => number;
  screenW: number;
  screenH: number;
};

export default function DoorSprite({
  doorWorldX, doorWorldY, xToScreen, worldYToScreenY, screenW, screenH,
}: Props) {
  const img = useImage(require('../../assets/misc/door.png'));
  if (!img) return null;

  // Since we're inside a world transform group, use world coordinates directly
  // The parent Group with translateY: -cameraY will handle the camera transform
  const sx = Math.round(doorWorldX);
  const sy = Math.round(doorWorldY);

  // Simple cull (convert to screen space for culling)
  const screenX = xToScreen(doorWorldX);
  const screenY = worldYToScreenY(doorWorldY);
  if (screenX < -200 || screenX > screenW + 200) return null;
  if (screenY < -240 || screenY > screenH + 340) return null;

  return (
    <Group>
      <SkImage image={img} x={sx} y={sy} width={DOORWAY_WIDTH} height={DOORWAY_HEIGHT} />
    </Group>
  );
}

export function pointInDoor(px: number, py: number, dx: number, dy: number) {
  return (px >= dx && px <= dx + DOORWAY_WIDTH &&
          py >= dy && py <= dy + DOORWAY_HEIGHT);
}
