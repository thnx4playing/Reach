// src/hooks/useAppPause.ts
// Automatically pause game when app goes to background
// Critical for mobile - prevents physics explosions when returning

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';

interface UseAppPauseResult {
  /** Whether the game loop should run */
  shouldRun: boolean;
  /** Current app state */
  appState: AppStateStatus;
  /** Manual pause (user triggered) */
  isPausedManually: boolean;
  /** Pause the game manually */
  pause: () => void;
  /** Resume the game manually */
  resume: () => void;
  /** Toggle pause state */
  togglePause: () => void;
}

/**
 * Hook to handle automatic pause when app goes to background
 * 
 * IMPORTANT: Use `shouldRun` to gate your RAF loop, not just manual pause.
 * This prevents physics explosions when the user switches apps.
 */
export function useAppPause(): UseAppPauseResult {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [isPausedManually, setIsPausedManually] = useState(false);
  
  // Track if we need to show a "tap to resume" overlay
  const wasBackgroundedRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      // Going to background
      if (appState === 'active' && nextAppState.match(/inactive|background/)) {
        wasBackgroundedRef.current = true;
      }
      
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState]);

  const pause = useCallback(() => {
    setIsPausedManually(true);
  }, []);

  const resume = useCallback(() => {
    setIsPausedManually(false);
    wasBackgroundedRef.current = false;
  }, []);

  const togglePause = useCallback(() => {
    setIsPausedManually(prev => !prev);
  }, []);

  // Game should run only when:
  // 1. App is active (foreground)
  // 2. Not manually paused
  const shouldRun = appState === 'active' && !isPausedManually;

  return {
    shouldRun,
    appState,
    isPausedManually,
    pause,
    resume,
    togglePause,
  };
}
