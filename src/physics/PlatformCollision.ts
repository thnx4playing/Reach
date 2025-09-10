import type { PlatformDef } from '../systems/platform/PlatformSystem';

export interface CollisionResult {
  landed: boolean;
  platformY?: number;
}

export function checkPlatformCollision(
  playerBox: { left: number; right: number; bottom: number },
  platforms: PlatformDef[],
  fallingVelocity: number
): CollisionResult {
  if (fallingVelocity >= 0) return { landed: false }; // Not falling
  
  for (const platform of platforms) {
    if (!platform.collision?.solid) continue;
    
    const collision = platform.collision;
    
    // Check horizontal overlap
    if (playerBox.left >= collision.right || playerBox.right <= collision.left) {
      continue; // No horizontal overlap
    }
    
    // Check if player is at or just below the platform surface
    const distanceToSurface = playerBox.bottom - collision.topY;
    if (distanceToSurface >= -5 && distanceToSurface <= 10) {
      return {
        landed: true,
        platformY: collision.topY
      };
    }
  }
  
  return { landed: false };
}
