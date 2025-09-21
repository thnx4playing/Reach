// PERFORMANCE: Memoized platform renderer to reduce React re-renders
import React from 'react';
import { PrefabNode } from '../render/PrefabNode';
import type { PlatformDef } from '../systems/platform/types';

interface PlatformRendererProps {
  platforms: PlatformDef[];
  mapName: string;
  opacity: number;
}

export const PlatformRenderer = React.memo<PlatformRendererProps>(({ 
  platforms, 
  mapName, 
  opacity 
}) => {
  return (
    <>
      {platforms.map((platform) => (
        <PrefabNode
          key={platform.id}
          map={mapName}
          name={platform.prefab}
          x={platform.x}
          y={platform.y}
          scale={platform.scale}
          opacity={platform.fadeOut?.opacity ?? opacity}
        />
      ))}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better memoization
  return prevProps.platforms === nextProps.platforms && 
         prevProps.opacity === nextProps.opacity &&
         prevProps.mapName === nextProps.mapName;
});
