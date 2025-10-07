// src/ui/BossVerticalHealthBar.tsx
import React, { memo } from 'react';
import { View } from 'react-native';
import { Canvas, Rect, Group } from '@shopify/react-native-skia';

type Props = {
  width?: number;   // total width (heart + bar)
  height?: number;  // overall height
  health: number;   // 0..100
};

const BossVerticalHealthBar = memo(({ width = 30, height = 100, health }: Props) => {
  const W = Math.max(24, Math.round(width));
  const H = Math.max(80, Math.round(height));
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
  const px = Math.max(1, Math.floor((W - 2) / cols * 1.25)); // leave ~1px horizontal margin, 25% larger heart
  const heartW = cols * px;
  const heartH = rows * px;
  const heartX = Math.floor((W - heartW) / 2);
  const heartY = 0; // Heart at the top

  // --- Vertical bar geometry ---
  const outline = 2;          // border thickness
  const gap = 8;              // space between heart and bar
  const trackW = 16;          // fixed pixel track width
  const trackX = Math.floor((W - trackW) / 2);
  const trackY = heartY + heartH + gap;
  const trackH = Math.max(80, H - trackY - 10); // Leave some bottom margin

  // Inner track (white)
  const innerX = trackX + outline;
  const innerY = trackY + outline;
  const innerW = trackW - outline * 2;
  const innerH = trackH - outline * 2;

  // Fill height (from bottom up)
  const fillH = Math.floor((pct / 100) * innerH);

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

        {/* Vertical track outline */}
        <Rect x={trackX} y={trackY} width={trackW} height={trackH} color={BLACK} />

        {/* White inner track */}
        <Rect x={innerX} y={innerY} width={innerW} height={innerH} color={WHITE} />
        {/* Track top highlight */}
        <Rect x={innerX} y={innerY} width={innerW} height={1} color={TOP_HI} />

        {/* Vertical fill (from bottom up) */}
        {fillH > 0 && (
          <>
            <Rect 
              x={innerX} 
              y={innerY + innerH - fillH} // Start from bottom
              width={innerW} 
              height={fillH} 
              color={FILL} 
            />
            {/* subtle top highlight on the fill */}
            {fillH > 2 && (
              <Rect 
                x={innerX} 
                y={innerY + innerH - fillH} 
                width={innerW} 
                height={1} 
                color={TOP_HI} 
              />
            )}
          </>
        )}
      </Canvas>
    </View>
  );
});

export default BossVerticalHealthBar;
