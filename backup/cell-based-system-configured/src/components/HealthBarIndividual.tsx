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
  const getHealthImagePath = (healthPercent: number): any => {
    if (healthPercent >= 100) return require('../../assets/ui/health_100.png'); // 6 hearts
    if (healthPercent >= 83) return require('../../assets/ui/health_80.png');   // 5 hearts
    if (healthPercent >= 67) return require('../../assets/ui/health_60.png');   // 4 hearts
    if (healthPercent >= 50) return require('../../assets/ui/health_40.png');   // 3 hearts
    if (healthPercent >= 33) return require('../../assets/ui/health_20.png');   // 2 hearts
    return require('../../assets/ui/health_0.png'); // 1 heart or empty
  };

  const healthImage = useImage(getHealthImagePath(health));
  
  if (!healthImage) {
    return null;
  }

  return (
    <Canvas style={{ width: width + x, height: height + y }}>
      <Image
        image={healthImage}
        x={x}
        y={y}
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
  const getCurrentHealthImage = (healthPercent: number) => {
    if (healthPercent >= 100) return health100;
    if (healthPercent >= 83) return health80;
    if (healthPercent >= 67) return health60;
    if (healthPercent >= 50) return health40;
    if (healthPercent >= 33) return health20;
    return health0;
  };

  const currentImage = getCurrentHealthImage(health);
  
  if (!currentImage) {
    return null;
  }

  return (
    <Canvas style={{ width: width + x, height: height + y }}>
      <Image
        image={currentImage}
        x={x}
        y={y}
        width={width}
        height={height}
        fit="contain"
      />
    </Canvas>
  );
};

// Simple usage component
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
