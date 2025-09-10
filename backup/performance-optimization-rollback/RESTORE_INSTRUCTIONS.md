# Performance Optimization Rollback Instructions

## Current State (Before Performance Optimizations)
This backup was created before implementing performance optimizations to fix "glitchy" jumps and falls during camera movement.

## Files Backed Up:
- `src/components/GameScreen.tsx` - Main game screen with current camera logic
- `src/systems/platform/PlatformManager.ts` - Platform manager with current debug logging

## Issues Being Addressed:
1. **Debug Log Spam**: `PlatformManager.updateForCamera called` logs flooding console
2. **Camera Update Frequency**: Camera updates every 5 frames causing smoothness issues
3. **Platform Generation Performance**: Expensive operations during camera movement
4. **State Update Timing**: Inconsistent update frequencies causing "glitchy" feeling

## To Rollback (if needed):
```bash
# Restore GameScreen.tsx
cp backup/performance-optimization-rollback/GameScreen.tsx src/components/

# Restore PlatformManager.ts  
cp backup/performance-optimization-rollback/PlatformManager.ts src/systems/platform/

# Commit the rollback
git add -A
git commit -m "Rollback: Restore pre-performance-optimization state"
git push origin main
```

## Performance Optimizations Being Applied:
1. Remove remaining debug logs from PlatformManager
2. Increase camera update frequency from every 5 frames to every 2-3 frames
3. Throttle platform generation to prevent frame drops
4. Optimize state updates for consistent timing

## Expected Results:
- Smoother camera movement
- Reduced console spam
- Better frame consistency during camera transitions
- Eliminated "glitchy" feeling during jumps/falls when camera moves

## Date Created:
$(date)
