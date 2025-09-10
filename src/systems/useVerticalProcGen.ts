// This file has been deprecated and removed.
// Platform generation is now handled by PlatformManager.ts
// 
// If you need to access this file, it has been moved to the new
// map-specific configuration system in PlatformManager.ts
//
// The new system provides:
// - Map-specific platform configurations
// - Better decoration placement with tile-based collision prevention
// - Support for special positioning (left/right flush platforms)
// - 30% increased platform density
//
// To migrate any remaining usage:
// 1. Replace useVerticalProcGen with PlatformManager
// 2. Update map configurations in MAP_PLATFORM_CONFIGS
// 3. Use the new tile-based decoration system

export {}; // Keep file as empty module to prevent import errors during migration