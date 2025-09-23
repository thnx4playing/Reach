// src/ui/SkiaHealthBar.tsx
import React, { memo } from 'react';
import { View } from 'react-native';
import { Canvas, Rect, Group } from '@shopify/react-native-skia';

type Props = {
  width?: number;   // total width (heart + bar)
  height?: number;  // overall height (18–22 looks best)
  health: number;   // 0..100
};

const SkiaHealthBar = memo(({ width = 170, height = 20, health }: Props) => {
  const H = Math.max(16, Math.round(height));
  const W = Math.max(120, Math.round(width));
  const pct = Math.max(0, Math.min(100, health));

  // --- Pixel heart mask (bigger, crisp) ---
  const heartMask = [
    '..111..111..',
    '.1111111111.',
    '.1111111111.',
    '.1111111111.',
    '..11111111..',
    '...111111...',
    '....1111....',
    '.....11.....',
  ];
  const rows = heartMask.length;
  const cols = heartMask[0].length;
  const px = Math.max(1, Math.floor((H - 2) / rows)); // leave ~1px vertical margin
  const heartW = cols * px;
  const heartH = rows * px;
  const heartY = Math.floor((H - heartH) / 2);
  const heartX = 0;

  // --- Bar geometry (flat rectangle with thick black outline) ---
  const outline = 2;          // border thickness
  const gap = 5;              // space between heart and bar
  const trackH = 12;          // fixed pixel track height
  const trackY = Math.floor((H - trackH) / 2);
  const trackX = heartX + heartW + gap;
  const trackW = Math.max(48, W - trackX);

  // Inner track (white)
  const innerX = trackX + outline;
  const innerY = trackY + outline;
  const innerW = trackW - outline * 2;
  const innerH = trackH - outline * 2;

  // Fill width
  const fillW = Math.floor((pct / 100) * innerW);

  // Color by health thresholds
  let FILL = '#2ecc71'; // green
  if (pct <= 66 && pct > 33) FILL = '#f39c12';       // orange
  if (pct <= 33) FILL = '#e74c3c';                   // red

  const BLACK = '#000000';
  const WHITE = '#ffffff';
  const TOP_HI = '#eaeaea'; // 1px top highlight for track/fill

  // helpers to render the heart
  const renderHeart = (color: string, ox: number, oy: number) =>
    heartMask.flatMap((row, ry) =>
      row.split('').map((c, rx) => {
        if (c !== '1') return null;
        const x = heartX + ox + rx * px;
        const y = heartY + oy + ry * px;
        return <Rect key={`${color}-${ox}-${oy}-${rx}-${ry}`} x={x} y={y} width={px} height={px} color={color} />;
      }),
    );

  return (
    <View style={{ width: W, height: H }}>
      <Canvas style={{ width: W, height: H }}>
        {/* Heart outline: draw heart at 8 neighbor offsets + center in black, then red on top */}
        <Group>
          {[-px, 0, px].flatMap((dx) => [-px, 0, px].map((dy) => renderHeart(BLACK, dx, dy)))}
          {renderHeart('#e03535', 0, 0)}
        </Group>

        {/* Track outline */}
        <Rect x={trackX} y={trackY} width={trackW} height={trackH} color={BLACK} />

        {/* White inner track */}
        <Rect x={innerX} y={innerY} width={innerW} height={innerH} color={WHITE} />
        {/* Track top highlight */}
        <Rect x={innerX} y={innerY} width={innerW} height={1} color={TOP_HI} />

        {/* Fill */}
        {fillW > 0 && (
          <>
            <Rect x={innerX} y={innerY} width={fillW} height={innerH} color={FILL} />
            {/* subtle top highlight on the fill */}
            {fillW > 2 && <Rect x={innerX} y={innerY} width={fillW} height={1} color={TOP_HI} />}
          </>
        )}
      </Canvas>
    </View>
  );
});

export default SkiaHealthBar;