import React from 'react';
import { Group, Rect } from '@shopify/react-native-skia';

// Minimal 5x7 pixel font for capitals (we only need E, V, A here; include a few more for future)
const GLYPHS: Record<string, string[]> = {
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'E': ['11111','10000','11110','10000','10000','10000','11111'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  // common extras (optional):
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};

export default function PixelText({
  text, x, y, pixelSize = 3, color = '#fff', border = '#000', align = 'left',
}: {
  text: string; x: number; y: number; pixelSize?: number; color?: string; border?: string; align?: 'left'|'center'|'right';
}) {
  const chars = text.toUpperCase().split('');
  const charW = 5 * pixelSize;
  const charH = 7 * pixelSize;
  const pad = pixelSize; // 1 pixel between glyphs
  const width = chars.length * charW + (chars.length - 1) * pad;

  let startX = x;
  if (align === 'center') startX = Math.round(x - width / 2);
  if (align === 'right')  startX = Math.round(x - width);

  return (
    <Group>
      {chars.map((ch, i) => {
        const bitmap = GLYPHS[ch] || GLYPHS[' '];
        const gx = startX + i * (charW + pad);
        return (
          <Group key={i}>
            {/* border (draw a 1px expanded box for each filled pixel) */}
            {bitmap.map((row, ry) =>
              row.split('').map((b, rx) =>
                b === '1' ? <Rect key={`b-${i}-${ry}-${rx}`} x={gx + rx*pixelSize - 1} y={y + ry*pixelSize - 1} width={pixelSize+2} height={pixelSize+2} color={border}/> : null
              )
            )}
            {/* fill */}
            {bitmap.map((row, ry) =>
              row.split('').map((b, rx) =>
                b === '1' ? <Rect key={`f-${i}-${ry}-${rx}`} x={gx + rx*pixelSize} y={y + ry*pixelSize} width={pixelSize} height={pixelSize} color={color}/> : null
              )
            )}
          </Group>
        );
      })}
    </Group>
  );
}
