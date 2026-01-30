// src/hooks/useAppLifecycle.ts
// Handles app state changes (background/foreground) and provides pause functionality

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { log } from '../utils/logger';

export interface AppLifecycleState {
  /** Whether the app is currently active (foreground) */
  isActive: boolean;
  /** Whether the game should be paused */
  isPaused: boolean;
  /** Current app state */
  appState: AppStateStatus;
  /** Manually pause the game */
  pause: () => void;
  /** Manually resume the game */
  resume: () => void;
  /** Toggle pause state */
  togglePause: () => void;
}

/**
 * Hook that manages app lifecycle and pause state
 * Automatically pauses when app goes to background
 */
export function useAppLifecycle(): AppLifecycleState {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  
  // Track if we auto-paused due to background
  const autoPausedRef = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      log.debug('App state changed', { from: appState, to: nextAppState });
      
      // Going to background - auto pause
      if (appState === 'active' && nextAppState.match(/inactive|background/)) {
        autoPausedRef.current = true;
        log.debug('App backgrounded - auto pausing');
      }
      
      // Coming back to foreground - only auto-resume if we auto-paused
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        if (autoPausedRef.current && !manuallyPaused) {
          autoPausedRef.current = false;
          log.debug('App foregrounded - auto resuming');
        }
      }
      
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
    };
  }, [appState, manuallyPaused]);

  const pause = useCallback(() => {
    setManuallyPaused(true);
  }, []);

  const resume = useCallback(() => {
    setManuallyPaused(false);
    autoPausedRef.current = false;
  }, []);

  const togglePause = useCallback(() => {
    setManuallyPaused(prev => !prev);
  }, []);

  const isActive = appState === 'active';
  const isPaused = manuallyPaused || !isActive;

  return {
    isActive,
    isPaused,
    appState,
    pause,
    resume,
    togglePause,
  };
}

/**
 * Simplified hook that just returns whether the game should run
 * Use this in the game loop to skip updates when paused/backgrounded
 */
export function useGameActive(): boolean {
  const { isPaused } = useAppLifecycle();
  return !isPaused;
}
