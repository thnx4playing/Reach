import React from 'react';
import { Image } from '@shopify/react-native-skia';
import type { SpriteAtlas, AtlasFrame } from '../types';

interface SpriteNodeSkiaProps {
  atlas: SpriteAtlas;
  frameName: string;
  x: number;
  y: number;
  scale?: number;
}

export const SpriteNodeSkia: React.FC<SpriteNodeSkiaProps> = ({
  atlas,
  frameName,
  x,
  y,
  scale = 1,
}) => {
  const frame: AtlasFrame | undefined = atlas.frames[frameName];
  
  if (!frame) {
    console.warn(`Frame "${frameName}" not found in atlas`);
    return null;
  }

  const { x: fx, y: fy, w, h } = frame;
  const scaledW = w * scale;
  const scaledH = h * scale;

  return (
    <Image
      image={atlas.image}
      x={x}
      y={y}
      width={scaledW}
      height={scaledH}
      rect={{ x: fx, y: fy, width: w, height: h }}
    />
  );
};
