import React from 'react';
import { Canvas, Image, useImage } from '@shopify/react-native-skia';

interface HealthBarProps {
  health: number; // 0-100 percentage
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export const HealthBar: React.FC<HealthBarProps> = ({ 
  health, 
  width = 120, 
  height = 24, 
  x = 0, 
  y = 0 
}) => {
  // Map health percentage to the correct image file
  // Health system uses 5 hits, so we have 6 levels: 5,4,3,2,1,0 bars remaining
  const getHealthImagePath = (healthPercent: number): any => {
    if (healthPercent >= 100) return require('../../assets/ui/health_100.png'); // 5 bars (0 hits)
    if (healthPercent >= 80) return require('../../assets/ui/health_80.png');   // 4 bars (1 hit)
    if (healthPercent >= 60) return require('../../assets/ui/health_60.png');   // 3 bars (2 hits)
    if (healthPercent >= 40) return require('../../assets/ui/health_40.png');   // 2 bars (3 hits)
    if (healthPercent >= 20) return require('../../assets/ui/health_20.png');   // 1 bar (4 hits)
    return require('../../assets/ui/health_0.png'); // 0 bars (5 hits - dead)
  };

  const healthImage = useImage(getHealthImagePath(health));
  
  if (!healthImage) {
    return null;
  }

  return (
    <Canvas
      style={{
        position: 'absolute',
        top: y,
        left: x,
        width: width,
        height: height,
        zIndex: 9999,
        pointerEvents: 'none'
      }}
    >
      <Image
        image={healthImage}
        x={0}
        y={0}
        width={width}
        height={height}
        fit="contain" // Maintains aspect ratio and fits within bounds
      />
    </Canvas>
  );
};

// Alternative version that preloads all images for better performance
export const HealthBarPreloaded: React.FC<HealthBarProps> = ({ 
  health, 
  width = 120, 
  height = 24, 
  x = 0, 
  y = 0 
}) => {
  // Preload all health bar images
  const health100 = useImage(require('../../assets/ui/health_100.png'));
  const health80 = useImage(require('../../assets/ui/health_80.png'));
  const health60 = useImage(require('../../assets/ui/health_60.png'));
  const health40 = useImage(require('../../assets/ui/health_40.png'));
  const health20 = useImage(require('../../assets/ui/health_20.png'));
  const health0 = useImage(require('../../assets/ui/health_0.png'));

  // Select the current health image
  // Health system uses 5 hits, so we have 6 levels: 5,4,3,2,1,0 bars remaining
  const getCurrentHealthImage = (healthPercent: number) => {
    if (healthPercent >= 100) return health100; // 5 bars (0 hits)
    if (healthPercent >= 80) return health80;   // 4 bars (1 hit)
    if (healthPercent >= 60) return health60;   // 3 bars (2 hits)
    if (healthPercent >= 40) return health40;   // 2 bars (3 hits)
    if (healthPercent >= 20) return health20;   // 1 bar (4 hits)
    return health0; // 0 bars (5 hits - dead)
  };

  const currentImage = getCurrentHealthImage(health);
  
  if (!currentImage) {
    return null;
  }

  return (
    <Canvas
      style={{
        position: 'absolute',
        top: y,
        left: x,
        width: width,
        height: height,
        zIndex: 9999,
        pointerEvents: 'none'
      }}
    >
      <Image
        image={currentImage}
        x={0}
        y={0}
        width={width}
        height={height}
        fit="contain"
      />
    </Canvas>
  );
};

// Usage example component
export const GameHealthBar: React.FC<{ playerHealth: number }> = ({ playerHealth }) => {
  return (
    <HealthBar
      health={playerHealth}
      width={120}
      height={24}
      x={20}
      y={20}
    />
  );
};

export default HealthBar;