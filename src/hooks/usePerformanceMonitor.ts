// src/hooks/usePerformanceMonitor.ts
// FPS counter and performance tracking for debugging

import { useRef, useCallback, useState, useEffect } from 'react';
import { log } from '../utils/logger';

export interface PerformanceStats {
  fps: number;
  frameTime: number;      // ms per frame (average)
  frameTimeMax: number;   // worst frame time in window
  memoryWarning: boolean; // true if we detect potential memory issues
}

export interface PerformanceMonitor {
  stats: PerformanceStats;
  /** Call this at the start of each frame */
  frameStart: () => void;
  /** Call this at the end of each frame */
  frameEnd: () => void;
  /** Reset all stats */
  reset: () => void;
}

/**
 * Hook for monitoring game performance
 * Only active in __DEV__ mode to avoid overhead in production
 */
export function usePerformanceMonitor(enabled = __DEV__): PerformanceMonitor {
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 60,
    frameTime: 16.67,
    frameTimeMax: 16.67,
    memoryWarning: false,
  });

  // Tracking refs
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(performance.now());
  const frameStartTimeRef = useRef(0);
  const frameTimesRef = useRef<number[]>([]);
  const maxFrameTimeRef = useRef(0);

  const frameStart = useCallback(() => {
    if (!enabled) return;
    frameStartTimeRef.current = performance.now();
  }, [enabled]);

  const frameEnd = useCallback(() => {
    if (!enabled) return;

    const now = performance.now();
    const frameTime = now - frameStartTimeRef.current;
    
    // Track frame times (keep last 60 frames)
    frameTimesRef.current.push(frameTime);
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }
    
    // Track max frame time
    maxFrameTimeRef.current = Math.max(maxFrameTimeRef.current, frameTime);
    
    frameCountRef.current++;

    // Update stats every second
    const elapsed = now - lastFpsUpdateRef.current;
    if (elapsed >= 1000) {
      const fps = Math.round((frameCountRef.current / elapsed) * 1000);
      const avgFrameTime = frameTimesRef.current.length > 0
        ? frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
        : 16.67;
      
      const newStats: PerformanceStats = {
        fps,
        frameTime: Math.round(avgFrameTime * 100) / 100,
        frameTimeMax: Math.round(maxFrameTimeRef.current * 100) / 100,
        memoryWarning: fps < 30 || maxFrameTimeRef.current > 50,
      };

      setStats(newStats);

      // Log if performance is poor
      if (newStats.memoryWarning) {
        log.performance('Performance warning', newStats);
      }

      // Reset for next second
      frameCountRef.current = 0;
      lastFpsUpdateRef.current = now;
      maxFrameTimeRef.current = 0;
    }
  }, [enabled]);

  const reset = useCallback(() => {
    frameCountRef.current = 0;
    lastFpsUpdateRef.current = performance.now();
    frameTimesRef.current = [];
    maxFrameTimeRef.current = 0;
    setStats({
      fps: 60,
      frameTime: 16.67,
      frameTimeMax: 16.67,
      memoryWarning: false,
    });
  }, []);

  return { stats, frameStart, frameEnd, reset };
}

/**
 * Simple FPS counter ref-based (no React state updates)
 * Use this for minimal overhead when you just need to log FPS
 */
export function createFPSCounter() {
  let frames = 0;
  let lastTime = performance.now();
  let fps = 60;

  return {
    tick: () => {
      frames++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        fps = Math.round((frames / (now - lastTime)) * 1000);
        frames = 0;
        lastTime = now;
      }
    },
    getFPS: () => fps,
    log: () => {
      log.performance(`FPS: ${fps}`);
    },
  };
}
