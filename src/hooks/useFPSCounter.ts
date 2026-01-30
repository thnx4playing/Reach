// src/hooks/useFPSCounter.ts
// Performance monitoring hook - tracks FPS and frame timing
// Only active in __DEV__ mode

import { useRef, useCallback, useState } from 'react';

interface FPSStats {
  fps: number;
  avgFrameTime: number;  // ms
  minFrameTime: number;  // ms (best frame)
  maxFrameTime: number;  // ms (worst frame)
  droppedFrames: number; // frames that took > 32ms
}

interface UseFPSCounterOptions {
  enabled?: boolean;
  sampleWindow?: number;  // How many frames to average over
  updateInterval?: number; // How often to update state (ms)
}

export function useFPSCounter(options: UseFPSCounterOptions = {}) {
  const {
    enabled = __DEV__,
    sampleWindow = 60,
    updateInterval = 500,
  } = options;

  const [stats, setStats] = useState<FPSStats>({
    fps: 60,
    avgFrameTime: 16.67,
    minFrameTime: 16.67,
    maxFrameTime: 16.67,
    droppedFrames: 0,
  });

  // Refs for tracking (don't cause re-renders)
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);
  const droppedFramesRef = useRef<number>(0);

  // Call this at the START of each RAF frame
  const markFrameStart = useCallback(() => {
    if (!enabled) return;
    
    const now = performance.now();
    
    if (lastFrameTimeRef.current > 0) {
      const frameTime = now - lastFrameTimeRef.current;
      
      // Track frame time
      frameTimesRef.current.push(frameTime);
      
      // Keep only recent samples
      if (frameTimesRef.current.length > sampleWindow) {
        frameTimesRef.current.shift();
      }
      
      // Count dropped frames (> 32ms = missed 60fps target by a lot)
      if (frameTime > 32) {
        droppedFramesRef.current++;
      }
      
      // Update state periodically (not every frame)
      if (now - lastUpdateTimeRef.current > updateInterval) {
        const times = frameTimesRef.current;
        if (times.length > 0) {
          const avg = times.reduce((a, b) => a + b, 0) / times.length;
          const min = Math.min(...times);
          const max = Math.max(...times);
          
          setStats({
            fps: Math.round(1000 / avg),
            avgFrameTime: Math.round(avg * 100) / 100,
            minFrameTime: Math.round(min * 100) / 100,
            maxFrameTime: Math.round(max * 100) / 100,
            droppedFrames: droppedFramesRef.current,
          });
        }
        lastUpdateTimeRef.current = now;
      }
    }
    
    lastFrameTimeRef.current = now;
  }, [enabled, sampleWindow, updateInterval]);

  // Reset stats (e.g., on level change)
  const reset = useCallback(() => {
    frameTimesRef.current = [];
    lastFrameTimeRef.current = 0;
    lastUpdateTimeRef.current = 0;
    droppedFramesRef.current = 0;
    setStats({
      fps: 60,
      avgFrameTime: 16.67,
      minFrameTime: 16.67,
      maxFrameTime: 16.67,
      droppedFrames: 0,
    });
  }, []);

  return {
    stats,
    markFrameStart,
    reset,
    enabled,
  };
}
