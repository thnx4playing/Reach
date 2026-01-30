// src/hooks/useScreenDimensions.ts
// Responsive screen dimensions that update on rotation/resize
// Fixes the issue of Dimensions.get('window') being called at module load time

import { useState, useEffect } from 'react';
import { Dimensions, ScaledSize } from 'react-native';

export interface ScreenDimensions {
  width: number;
  height: number;
  isLandscape: boolean;
  isPortrait: boolean;
  scale: number;
  fontScale: number;
}

/**
 * Hook that provides reactive screen dimensions
 * Updates automatically on rotation or window resize
 */
export function useScreenDimensions(): ScreenDimensions {
  const [dimensions, setDimensions] = useState<ScreenDimensions>(() => {
    const { width, height, scale, fontScale } = Dimensions.get('window');
    return {
      width,
      height,
      isLandscape: width > height,
      isPortrait: height >= width,
      scale,
      fontScale,
    };
  });

  useEffect(() => {
    const onChange = ({ window }: { window: ScaledSize }) => {
      setDimensions({
        width: window.width,
        height: window.height,
        isLandscape: window.width > window.height,
        isPortrait: window.height >= window.width,
        scale: window.scale,
        fontScale: window.fontScale,
      });
    };

    const subscription = Dimensions.addEventListener('change', onChange);

    return () => {
      subscription?.remove();
    };
  }, []);

  return dimensions;
}

/**
 * Get current screen dimensions (non-reactive, for one-time use)
 * Use this in contexts where hooks aren't available
 */
export function getScreenDimensions(): ScreenDimensions {
  const { width, height, scale, fontScale } = Dimensions.get('window');
  return {
    width,
    height,
    isLandscape: width > height,
    isPortrait: height >= width,
    scale,
    fontScale,
  };
}

/**
 * Screen dimension constants for use in static contexts
 * WARNING: These won't update on rotation - prefer the hook when possible
 */
export const INITIAL_SCREEN = getScreenDimensions();
