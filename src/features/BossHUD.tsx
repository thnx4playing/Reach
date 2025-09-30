// src/features/BossHUD.tsx
import React, { useMemo } from 'react';
import { Group, Image as SkImage, useImage } from '@shopify/react-native-skia';

type Props = {
  screenW: number;
  screenH?: number;
  yOffset?: number;
  hearts: number;         // current hearts (0..5)
  maxHearts?: number;
};

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

export default React.memo(function BossHUD({
  screenW,
  screenH = 800,
  yOffset = 6,
  hearts,
  maxHearts = 5,
}: Props) {
  // Load all 6 health states (5 full -> 0 full)
  const health1 = useImage(require('../../assets/ui/boss-health-1.png')); // 5 hearts
  const health2 = useImage(require('../../assets/ui/boss-health-2.png')); // 4 hearts
  const health3 = useImage(require('../../assets/ui/boss-health-3.png')); // 3 hearts
  const health4 = useImage(require('../../assets/ui/boss-health-4.png')); // 2 hearts
  const health5 = useImage(require('../../assets/ui/boss-health-5.png')); // 1 heart
  const health6 = useImage(require('../../assets/ui/boss-health-6.png')); // 0 hearts

  // Pick the right image based on current hearts
  let healthImg = health1;
  if (hearts === 4) healthImg = health2;
  else if (hearts === 3) healthImg = health3;
  else if (hearts === 2) healthImg = health4;
  else if (hearts === 1) healthImg = health5;
  else if (hearts === 0) healthImg = health6;

  // Wait for image to load
  if (!healthImg) return null;

  // Auto-scale to fit screen
  const naturalW = healthImg.width();
  const naturalH = healthImg.height();
  
  // Target width ~40% of screen, with caps
  const targetW = clamp(Math.round(screenW * 0.4), 120, 320);
  const scale = targetW / naturalW;
  const w = Math.round(naturalW * scale);
  const h = Math.round(naturalH * scale);
  
  const x = Math.round((screenW - w) / 2);
  const y = yOffset;

  return (
    <Group>
      <SkImage image={healthImg} x={x} y={y} width={w} height={h} />
    </Group>
  );
}, (a, b) =>
  a.screenW === b.screenW &&
  a.screenH === b.screenH &&
  a.yOffset === b.yOffset &&
  a.hearts === b.hearts &&
  (a.maxHearts ?? 5) === (b.maxHearts ?? 5)
);