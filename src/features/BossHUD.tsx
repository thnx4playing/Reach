// src/features/BossHUD.tsx
import React from 'react';
import { Group, Image as SkImage, useImage } from '@shopify/react-native-skia';

type Props = {
  screenW: number;
  screenH?: number;
  yOffset?: number;
  hearts: number;         // current hearts (0..5)
  maxHearts?: number;
  barGapY?: number;       // distance from EVA bottom to bar (px)
};

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

export default React.memo(function BossHUD({
  screenW,
  screenH = 800,
  yOffset = 6,
  hearts,
  maxHearts = 6,
  barGapY,
}: Props) {
  // Load EVA title
  const evaImg = useImage(require('../../assets/misc/eva.png'));
  
  // Load all 7 health states (6 full -> empty after death)
  const health1 = useImage(require('../../assets/ui/boss-health-1.png')); // 6 hearts (full health)
  const health2 = useImage(require('../../assets/ui/boss-health-2.png')); // 5 hearts (1 hit)
  const health3 = useImage(require('../../assets/ui/boss-health-3.png')); // 4 hearts (2 hits)
  const health4 = useImage(require('../../assets/ui/boss-health-4.png')); // 3 hearts (3 hits)
  const health5 = useImage(require('../../assets/ui/boss-health-5.png')); // 2 hearts (4 hits)
  const health6 = useImage(require('../../assets/ui/boss-health-6.png')); // 1 heart (5 hits)
  const health7 = useImage(require('../../assets/ui/boss-health-7.png')); // empty bar (death - 0 hearts)

  // Pick the right image based on current hearts
  let healthImg = health1;
  if (hearts === 5) healthImg = health2;      // 5 hearts (1 hit)
  else if (hearts === 4) healthImg = health3; // 4 hearts (2 hits)
  else if (hearts === 3) healthImg = health4; // 3 hearts (3 hits)
  else if (hearts === 2) healthImg = health5; // 2 hearts (4 hits)
  else if (hearts === 1) healthImg = health6; // 1 heart (5 hits)
  else if (hearts <= 0) healthImg = health7;  // Show empty bar when dead (0 or less)

  // Wait for images to load
  if (!healthImg || !evaImg) return null;

  // EVA title sizing (100% larger than original - another 50%)
  const evaNaturalW = evaImg.width();
  const evaNaturalH = evaImg.height();
  const evaTargetW = clamp(Math.round(screenW * 0.28 * 2.475), 225, 645); // 100% larger (1.65 * 1.5)
  const evaScale = evaTargetW / evaNaturalW;
  const evaW = Math.round(evaNaturalW * evaScale);
  const evaH = Math.round(evaNaturalH * evaScale);
  const evaX = Math.round((screenW - evaW) / 2) + 5; // 5px to the right
  const evaY = yOffset - 6; // 6px higher than yOffset

  // Health bar sizing
  const healthNaturalW = healthImg.width();
  const healthNaturalH = healthImg.height();
  
  // Target width ~40% of screen, with caps
  const healthTargetW = clamp(Math.round(screenW * 0.4), 120, 320);
  const healthScale = healthTargetW / healthNaturalW;
  const healthW = Math.round(healthNaturalW * healthScale);
  const healthH = Math.round(healthNaturalH * healthScale);
  
  const healthX = Math.round((screenW - healthW) / 2);
  const gapY = (barGapY ?? -5); // default keeps current look
  const healthY = Math.round(evaY + evaH + gapY);

  // Debug: log positions
  console.log('[BossHUD] evaY:', evaY, 'evaH:', evaH, 'healthY:', healthY, 'gapY:', gapY, 'actual gap:', healthY - (evaY + evaH));

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
  (a.maxHearts ?? 6) === (b.maxHearts ?? 6) &&
  (a.barGapY ?? -5) === (b.barGapY ?? -5)
);
