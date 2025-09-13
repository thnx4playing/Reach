export interface PlatformDef {
  id: string;
  type: 'platform' | 'decoration';
  prefab: string;
  x: number;
  y: number; // Always top-left of sprite
  scale: number;
  // Collision data (computed once)
  collision?: {
    solid: boolean;
    topY: number; // Y coordinate of walkable surface
    left: number;
    right: number;
    width: number;
    height: number;
  };
  // Fade-out animation state
  fadeOut?: {
    startTime: number; // Timestamp when fade started
    duration: number;  // Fade duration in milliseconds
    opacity: number;   // Current opacity (0.0 to 1.0)
  };
}
