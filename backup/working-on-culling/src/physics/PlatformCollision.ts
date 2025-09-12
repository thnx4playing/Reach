import type { PlatformDef } from '../systems/platform/types';

export interface CollisionResult {
  landed: boolean;
  platformWorldY?: number; // Return world Y coordinate
}

export function checkPlatformCollision(
  playerWorldBox: { left: number; right: number; bottom: number }, // Player box in WORLD coordinates
  platforms: PlatformDef[],
  fallingVelocity: number
): CollisionResult {
  if (fallingVelocity >= 0) return { landed: false }; // Not falling
  
  for (const platform of platforms) {
    if (!platform.collision?.solid) continue;
    
    const collision = platform.collision;
    
    // All collision detection in WORLD coordinates
    // Check horizontal overlap
    if (playerWorldBox.left >= collision.right || playerWorldBox.right <= collision.left) {
      continue; // No horizontal overlap
    }
    
    // Check if player is at or just below the platform surface
    const distanceToSurface = playerWorldBox.bottom - collision.topY;
    if (distanceToSurface >= -5 && distanceToSurface <= 15) {
      return {
        landed: true,
        platformWorldY: collision.topY // Return world Y coordinate
      };
    }
  }
  
  return { landed: false };
}