import React from "react";
import { Image as SkImage, rect, useImage } from "@shopify/react-native-skia";
import { MAPS } from "../content/maps";

// Minimal test component to isolate the rendering issue
export const TestFloorTile: React.FC<{ x: number; y: number }> = ({ x, y }) => {
  const grassyImage = useImage(MAPS.grassy.image);
  
  if (!grassyImage) {
    console.log('TestFloorTile: Image not loaded');
    return null;
  }

  console.log('TestFloorTile: Image loaded', {
    width: grassyImage.width(),
    height: grassyImage.height()
  });

  // Test with a simple 16x16 tile from top-left corner
  return (
    <SkImage
      image={grassyImage}
      x={x}
      y={y}
      width={32} // 16 * 2 scale
      height={32} // 16 * 2 scale
      srcRect={rect(0, 0, 16, 16)} // Top-left 16x16 tile
    />
  );
};

// Add this to your GameScreen Canvas temporarily to test basic image rendering:
// <TestFloorTile x={100} y={100} />

// If this shows the correct single tile, then the issue is in the prefab coordinate mapping.
// If this still shows the whole tileset, then there's a deeper Skia rendering issue.
