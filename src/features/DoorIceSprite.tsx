// src/features/DoorIceSprite.tsx
import React from 'react';
import { Image as SkImage, Group } from '@shopify/react-native-skia';
import { useImage } from '@shopify/react-native-skia';
import {
  DOOR_ICE_WIDTH, DOOR_ICE_HEIGHT,
  DOOR_TRIGGER_INNER_X_RATIO,
  DOOR_TRIGGER_BOTTOM_Y_RATIO,
  DOOR_TRIGGER_PAD
} from '../config/gameplay';

type Props = {
  doorWorldX: number; // world left
  doorWorldY: number; // world top
  xToScreen: (x: number) => number;
  worldYToScreenY: (y: number) => number;
  screenW: number;
  screenH: number;
};

export default function DoorIceSprite({
  doorWorldX,
  doorWorldY,
  xToScreen,
  worldYToScreenY,
  screenW,
  screenH,
}: Props) {
  const img = useImage(require('../../assets/misc/door-ice.png'));

  if (!img) return null;

  const sx = xToScreen(doorWorldX);
  const sy = worldYToScreenY(doorWorldY);

  // Scale up the door-ice to make it more prominent
  const scale = 1.5; // 50% larger
  const scaledWidth = DOOR_ICE_WIDTH * scale;
  const scaledHeight = DOOR_ICE_HEIGHT * scale;

  return (
    <Group>
      <SkImage image={img} x={sx} y={sy} width={scaledWidth} height={scaledHeight} />
    </Group>
  );
}

// Reuse the same tight doorway detection function from DoorSprite
export function pointInDoorIceTightFeet(
  px: number,  // player center X (world)
  py: number,  // player feet Y (world)
  dx: number,  // door X (world, left)
  dy: number,  // door Y (world, top)
  innerXRatio: number = DOOR_TRIGGER_INNER_X_RATIO,
  bottomYRatio: number = DOOR_TRIGGER_BOTTOM_Y_RATIO,
  pad: number = DOOR_TRIGGER_PAD
) {
  // Use scaled dimensions to match the visual door size
  const scale = 1.5; // Same scale as in the component
  const scaledWidth = DOOR_ICE_WIDTH * scale;
  const scaledHeight = DOOR_ICE_HEIGHT * scale;
  
  // Inner horizontal band (centered)
  const marginX = (1 - innerXRatio) * 0.5 * scaledWidth;
  const xMin = dx + marginX - pad;
  const xMax = dx + scaledWidth - marginX + pad;

  // For door-ice positioned above platform: extend collision zone down to platform
  // This allows the player to trigger it from the platform below
  const yMin = dy - pad; // Top of door (with padding)
  const yMax = dy + scaledHeight + 200 + pad; // Extend well below the door to reach platform

  return px >= xMin && px <= xMax && py >= yMin && py <= yMax;
}
