// src/features/BossHUD.tsx
import React, { useMemo } from 'react';
import { Group, Image as SkImage, useImage } from '@shopify/react-native-skia';

type Props = {
  screenW: number;
  screenH?: number;       // optional; used only for nicer default sizing
  yOffset?: number;       // top padding in px
  hearts: number;         // current hearts (0..maxHearts)
  maxHearts?: number;     // default 5
  title?: string;         // unused here; we use eva.png
};

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

export default React.memo(function BossHUD({
  screenW,
  screenH = 800,
  yOffset = 6,
  hearts,
  maxHearts = 5,
}: Props) {
  const heartImg = useImage(require('../../assets/misc/boss-heart.png'));
  const heartEmptyImg = useImage(require('../../assets/misc/boss-heart-empty.png'));
  const evaImg   = useImage(require('../../assets/misc/eva.png'));

  // Always call useMemo to maintain hook order
  const renderData = useMemo(() => {
    // Wait for images before computing
    if (!heartImg || !heartEmptyImg || !evaImg) return null;

    // ---- Title (EVA) sizing ----
    const evaNaturalW = evaImg.width();
    const evaNaturalH = evaImg.height();
    // Try to keep the EVA title within ~30% of screen width, with sensible caps, then make 100% larger
    const evaTargetW = clamp(Math.round(screenW * 0.28), 90, 260) * 2.0; // 100% larger (double size)
    const evaScale   = evaTargetW / evaNaturalW;
    const evaW       = Math.round(evaNaturalW * evaScale);
    const evaH       = Math.round(evaNaturalH * evaScale);
    const evaX       = Math.round((screenW - evaW) / 2) + 10; // Move right 10px total (6 + 4)
    const evaY       = yOffset + 4; // Move up 16px total (was +20, now +4)

    // ---- Hearts row sizing ----
    const heartNaturalW = heartImg.width();
    const heartNaturalH = heartImg.height();

    // Heart height ~6.75% of screen height; clamp for consistency (50% larger hearts)
    const heartTargetH = clamp(Math.round(screenH * 0.0675), 27, 48);
    const heartScale   = heartTargetH / heartNaturalH;
    const heartW       = Math.round(heartNaturalW * heartScale);
    const heartH       = heartTargetH;

    // Gap between hearts (~8% of heart width - much closer together)
    const gap = Math.round(heartW * 0.08);

    const totalRowW = maxHearts * heartW + (maxHearts - 1) * gap;
    const heartsStartX = Math.round((screenW - totalRowW) / 2);
    const heartsY = evaY + evaH - 29; // moved up 35px total (was +6, now -29)

    // Precompute heart positions; hearts<=maxHearts
    const heartPositions = Array.from({ length: maxHearts }, (_, i) => ({
      x: heartsStartX + i * (heartW + gap),
      y: heartsY,
      filled: i < hearts,
    }));

    return {
      evaX, evaY, evaW, evaH,
      heartW, heartH,
      heartPositions
    };
  }, [screenW, screenH, yOffset, hearts, maxHearts, heartImg, heartEmptyImg, evaImg]);

  // Wait for images before rendering
  if (!renderData) return null;

  return (
    <Group>
      {/* Title */}
      <SkImage image={evaImg} x={renderData.evaX} y={renderData.evaY} width={renderData.evaW} height={renderData.evaH} />

      {/* Hearts */}
      {renderData.heartPositions.map((h, idx) => (
        <SkImage
          key={idx}
          image={h.filled ? heartImg : heartEmptyImg}
          x={h.x}
          y={h.y}
          width={renderData.heartW}
          height={renderData.heartH}
        />
      ))}
    </Group>
  );
}, (a, b) =>
  a.screenW === b.screenW &&
  a.screenH === b.screenH &&
  a.yOffset === b.yOffset &&
  a.hearts === b.hearts &&
  (a.maxHearts ?? 5) === (b.maxHearts ?? 5)
);