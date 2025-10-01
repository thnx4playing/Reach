// src/features/BossHUD.tsx
import React from 'react';
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
  // Load EVA title
  const evaImg = useImage(require('../../assets/misc/eva.png'));
  
  // Load all 7 health states (5 full -> empty after death)
  const health1 = useImage(require('../../assets/ui/boss-health-1.png')); // 5 hearts
  const health2 = useImage(require('../../assets/ui/boss-health-2.png')); // 4 hearts
  const health3 = useImage(require('../../assets/ui/boss-health-3.png')); // 3 hearts
  const health4 = useImage(require('../../assets/ui/boss-health-4.png')); // 2 hearts
  const health5 = useImage(require('../../assets/ui/boss-health-5.png')); // 1 heart
  const health6 = useImage(require('../../assets/ui/boss-health-6.png')); // 0 hearts
  const health7 = useImage(require('../../assets/ui/boss-health-7.png')); // empty bar (after death)

  // Pick the right image based on current hearts
  let healthImg = health1;
  if (hearts === 4) healthImg = health2;
  else if (hearts === 3) healthImg = health3;
  else if (hearts === 2) healthImg = health4;
  else if (hearts === 1) healthImg = health5;
  else if (hearts === 0) healthImg = health6;
  else if (hearts < 0) healthImg = health7; // Show empty bar after death

  // Wait for images to load
  if (!healthImg || !evaImg) return null;

  // EVA title sizing (10% larger)
  const evaNaturalW = evaImg.width();
  const evaNaturalH = evaImg.height();
  const evaTargetW = clamp(Math.round(screenW * 0.28 * 1.1), 100, 286); // 10% larger
  const evaScale = evaTargetW / evaNaturalW;
  const evaW = Math.round(evaNaturalW * evaScale);
  const evaH = Math.round(evaNaturalH * evaScale);
  const evaX = Math.round((screenW - evaW) / 2) + 5; // 5px to the right
  const evaY = yOffset - 10; // 10px up

  // Health bar sizing
  const healthNaturalW = healthImg.width();
  const healthNaturalH = healthImg.height();
  
  // Target width ~40% of screen, with caps
  const healthTargetW = clamp(Math.round(screenW * 0.4), 120, 320);
  const healthScale = healthTargetW / healthNaturalW;
  const healthW = Math.round(healthNaturalW * healthScale);
  const healthH = Math.round(healthNaturalH * healthScale);
  
  const healthX = Math.round((screenW - healthW) / 2);
  const healthY = evaY + evaH + 10; // 10px gap below EVA

  return (
    <Group>
      {/* EVA Title */}
      <SkImage image={evaImg} x={evaX} y={evaY} width={evaW} height={evaH} />

      {/* Health Bar */}
      <SkImage image={healthImg} x={healthX} y={healthY} width={healthW} height={healthH} />
    </Group>
  );
}, (a, b) =>
  a.screenW === b.screenW &&
  a.screenH === b.screenH &&
  a.yOffset === b.yOffset &&
  a.hearts === b.hearts &&
  (a.maxHearts ?? 5) === (b.maxHearts ?? 5)
);
