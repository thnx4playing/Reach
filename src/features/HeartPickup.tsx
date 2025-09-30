// src/features/HeartPickup.tsx
import React, { useEffect, useRef, useReducer } from 'react';
import { Image as SkImage, useImage } from '@shopify/react-native-skia';

type Props = {
  x: number;              // world X position
  y: number;              // world Y position (baseline)
  onCollect?: () => void; // callback when collected
  playerBox: { left: number; right: number; top: number; bottom: number }; // player AABB in screen space
  worldYToScreenY: (yWorld: number) => number;
};

export default function HeartPickup(props: Props) {
  const heartImg = useImage(require('../../assets/misc/heart.png'));
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const tRef = useRef(0);

  // Bounce animation
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      tRef.current += dt;
      tick(); // re-render for bounce
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!heartImg) return null;

  const w = heartImg.width();
  const h = heartImg.height();
  
  // Small bounce: ±8px up/down at 2Hz
  const bounceY = Math.sin(tRef.current * 2 * Math.PI * 2) * 8;
  
  // Convert world Y to screen Y
  const screenX = props.x - w / 2; // center on X
  const screenY = props.worldYToScreenY(props.y) - h + bounceY; // baseline at Y, bounce up/down

  // Simple AABB collision with player
  const heartBox = {
    left: screenX,
    right: screenX + w,
    top: screenY,
    bottom: screenY + h,
  };

  const overlaps =
    heartBox.left < props.playerBox.right &&
    heartBox.right > props.playerBox.left &&
    heartBox.top < props.playerBox.bottom &&
    heartBox.bottom > props.playerBox.top;

  if (overlaps) {
    props.onCollect?.();
  }

  return (
    <SkImage
      image={heartImg}
      x={screenX}
      y={screenY}
      width={w}
      height={h}
    />
  );
}
