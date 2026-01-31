// src/engine/floor.ts
// This file now re-exports from the SINGLE SOURCE OF TRUTH in physics.ts
// Kept for backward compatibility with existing imports

import { getFloorTopY, FLOOR_TOP_Y, SCREEN, FLOOR } from '../config/physics';
import type { MapName } from '../config/mapProfiles';

// Re-export the unified floor calculation
export { getFloorTopY, FLOOR_TOP_Y };

/**
 * Get floor top Y for a specific map.
 * All maps now use the SAME floor calculation for consistency.
 * This ensures smooth transitions between all map types.
 */
export function floorTopYFor(_mapName: MapName): number {
  // All maps use the same floor position
  return FLOOR_TOP_Y;
}

// Legacy exports for backward compatibility
export const SCREEN_H = SCREEN.HEIGHT;
export const SKIA_FLOOR_HEIGHT = FLOOR.COLLISION_HEIGHT;
export const SKIA_VISUAL_OFFSET = FLOOR.VISUAL_OFFSET;
