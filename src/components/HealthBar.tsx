import React from 'react';
import { Canvas, Image, useImage, Rect, Group } from '@shopify/react-native-skia';

interface HealthBarProps {
  health: number; // 0-100 percentage
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

const HealthBar: React.FC<HealthBarProps> = ({ 
  health, 
  width = 200, 
  height = 40, 
  x = 0, 
  y = 0 
}) => {
  const healthBarImage = useImage(require('../../assets/ui/hp_bar.png'));
  
  if (!healthBarImage) {
    return null;
  }

  // Map health percentage to heart segments (6 hearts = 100%, 5 hearts = 83%, etc.)
  const getHealthSegment = (healthPercent: number): number => {
    if (healthPercent >= 100) return 0; // 6 hearts (full)
    if (healthPercent >= 83) return 1;  // 5 hearts
    if (healthPercent >= 67) return 2;  // 4 hearts  
    if (healthPercent >= 50) return 3;  // 3 hearts
    if (healthPercent >= 33) return 4;  // 2 hearts
    if (healthPercent >= 17) return 5;  // 1 heart
    return 5; // 0 hearts (same as 1 heart segment for now)
  };

  const segment = getHealthSegment(health);
  
  // Get image dimensions
  const imageWidth = healthBarImage.width();
  const imageHeight = healthBarImage.height();
  
  // Calculate exact segment height
  const segmentHeight = imageHeight / 6;
  
  // Calculate precise Y position (round to avoid sub-pixel issues)
  const sourceY = Math.floor(segment * segmentHeight);
  const sourceHeight = Math.floor(segmentHeight);

  // Debug log to verify rendering
  if (__DEV__) {
    console.log("[HealthBar] Rendering:", {
      health,
      segment,
      sourceY,
      imageWidth,
      imageHeight,
      segmentHeight,
      position: { x, y, width, height }
    });
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
      {/* Use Group with clip to ensure no bleeding */}
      <Group
        clip={
          <Rect x={0} y={0} width={width} height={height} />
        }
      >
        <Image
          image={healthBarImage}
          x={0}
          y={-sourceY}
          width={width}
          height={height}
          fit="fill"
        />
      </Group>
    </Canvas>
  );
};

// Alternative approach with manual rect clipping for extra safety
const HealthBarSafe: React.FC<HealthBarProps> = ({ 
  health, 
  width = 200, 
  height = 40, 
  x = 0, 
  y = 0 
}) => {
  const healthBarImage = useImage(require('../../assets/ui/hp_bar.png'));
  
  if (!healthBarImage) {
    return null;
  }

  const getHealthSegment = (healthPercent: number): number => {
    if (healthPercent >= 100) return 0;
    if (healthPercent >= 83) return 1;
    if (healthPercent >= 67) return 2;
    if (healthPercent >= 50) return 3;
    if (healthPercent >= 33) return 4;
    return 5;
  };

  const segment = getHealthSegment(health);
  const imageHeight = healthBarImage.height();
  const segmentHeight = imageHeight / 6;
  
  // Use integer values to prevent sub-pixel rendering issues
  const sourceY = Math.round(segment * segmentHeight);
  const sourceHeight = Math.round(segmentHeight);

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
      <Group
        clip={
          <Rect x={0} y={0} width={width} height={height} />
        }
      >
        <Image
          image={healthBarImage}
          x={0}
          y={-sourceY}
          width={width}
          height={height}
          fit="contain" // Use contain instead of fill to maintain aspect ratio
        />
      </Group>
    </Canvas>
  );
};

// Usage example component
const GameHealthBar: React.FC<{ playerHealth: number }> = ({ playerHealth }) => {
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
