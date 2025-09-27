// src/features/Doorway.tsx
import React from 'react';
import { Group, Rect, Circle } from '@shopify/react-native-skia';
import { DOORWAY_WIDTH, DOORWAY_HEIGHT } from '../config/gameplay';

type Props = {
  doorWorldX: number; // world left (px)
  doorWorldY: number; // world top  (px)
  worldYToScreenY: (yWorld: number) => number;
  xToScreen: (xWorld: number) => number;
  screenW: number;
  screenH: number;
  pixelSnap?: boolean;       // snap after world->screen to prevent wobble
};

const W = DOORWAY_WIDTH;     // 64
const H = DOORWAY_HEIGHT;    // 96

// inner jamb
const JX = 6;
const JY = 10;
const JW = W - 12;
const JH = H - 18;

export default function Doorway({
  doorWorldX,
  doorWorldY,
  worldYToScreenY,
  xToScreen,
  screenW,
  screenH,
  pixelSnap = true,
}: Props) {
  let sx = xToScreen(doorWorldX);
  let sy = worldYToScreenY(doorWorldY);
  if (pixelSnap) { sx = Math.round(sx); sy = Math.round(sy); }

  // simple cull
  if (sx < -200 || sx > screenW + 200) return null;
  if (sy < -240 || sy > screenH + 340) return null;

  // very clear rounded top: semicircle reaching both jamb sides
  const archTopY = JY + 2;
  const archBottomY = JY + JH - 6;
  const r = Math.floor(JW / 2);     // full semicircle
  const cx = JX + JW / 2;
  const cy = archTopY + r;

  return (
    <Group transform={[{ translateX: sx }, { translateY: sy }]}>
      {/* chunky outer frame */}
      <Rect x={0} y={0} width={W} height={H} color="#2b2b2b" />
      {/* inner wall */}
      <Rect x={4} y={4} width={W - 8} height={H - 8} color="#6b4e2e" />
      {/* jamb background */}
      <Rect x={JX} y={JY} width={JW} height={JH} color="#1a1a1a" />
      {/* arched void: top semicircle + rectangle shaft */}
      <Circle cx={cx} cy={cy} r={r} color="#0b0b0b" />
      <Rect x={JX} y={cy} width={JW} height={archBottomY - cy} color="#0b0b0b" />
      {/* 8-bit accents */}
      <Rect x={6} y={H - 16} width={W - 12} height={8} color="#101010" />
      <Rect x={6} y={12} width={8} height={H - 28} color="#3d2a18" />
      <Rect x={W - 14} y={12} width={8} height={H - 28} color="#3d2a18" />
      <Rect x={4} y={4} width={W - 8} height={2} color="#8b6a45" />
    </Group>
  );
}

export function playerOverlapsDoor(
  playerX: number, playerY: number, doorX: number, doorY: number
): boolean {
  const px = playerX;
  const py = playerY - 24; // torso bias
  return (px >= doorX && px <= doorX + W && py >= doorY && py <= doorY + H);
}
