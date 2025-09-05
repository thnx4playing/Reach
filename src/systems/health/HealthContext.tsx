import React, { createContext, useContext, useMemo, useRef, useState, useCallback, useEffect } from "react";
import { HealthSystem } from "./HealthSystem";

// Guard against duplicate module loading
declare global {
  // eslint-disable-next-line no-var
  var __HEALTH_CTX_MODULES__: Set<string> | undefined;
}
if (!global.__HEALTH_CTX_MODULES__) global.__HEALTH_CTX_MODULES__ = new Set();
const THIS_PATH = 'src/systems/health/HealthContext.tsx';
if (__DEV__) {
  if (global.__HEALTH_CTX_MODULES__.has(THIS_PATH)) {
    console.warn('[HEALTH_CTX] Duplicate HealthContext module loaded. Check mixed import paths.');
  }
  global.__HEALTH_CTX_MODULES__.add(THIS_PATH);
}

type Ctx = { sys: HealthSystem; hits: number; isDead: boolean; bars: number; instanceId: string;
  takeDamage: (n?: number) => boolean; heal: (n?: number) => void; reset: () => void; };

const C = createContext<Ctx | null>(null);

export const HealthProvider: React.FC<{ children: React.ReactNode; }> = ({ children }) => {
  const sysRef = useRef<HealthSystem | null>(null);
  const [, forceUpdate] = useState(0);

  // Debug: Log provider mount
  useEffect(() => {
    console.log('[HEALTH CONTEXT DEBUG] HealthProvider mounted');
    return () => {
      console.log('[HEALTH CONTEXT DEBUG] HealthProvider unmounted');
    };
  }, []);

  // Initialize the health system
  if (!sysRef.current) {
    console.log('[HEALTH CONTEXT DEBUG] Initializing new HealthSystem with 5 hearts');
    sysRef.current = new HealthSystem(5); // 5 hearts total
  } else {
    console.log('[HEALTH CONTEXT DEBUG] Using existing HealthSystem:', sysRef.current.instanceId);
  }

  const triggerUpdate = useCallback(() => {
    if (__DEV__) {
      console.log('HEALTH CONTEXT DEBUG: triggerUpdate() called, forcing re-render');
    }
    forceUpdate(prev => prev + 1);
  }, []);

  const takeDamage = useCallback((n?: number) => {
    if (__DEV__) {
      console.log(`HEALTH CONTEXT DEBUG: takeDamage(${n}) called`);
    }
    const result = sysRef.current!.takeDamage(n);
    if (__DEV__) {
      console.log(`HEALTH CONTEXT DEBUG: takeDamage result=${result}, will triggerUpdate=${result}`);
    }
    if (result) triggerUpdate();
    return result;
  }, [triggerUpdate]);

  const heal = useCallback((n?: number) => {
    sysRef.current!.heal(n);
    triggerUpdate();
  }, [triggerUpdate]);

  const reset = useCallback(() => {
    sysRef.current!.reset();
    triggerUpdate();
  }, [triggerUpdate]);

          // Compute value directly to ensure it's always current
        const sys = sysRef.current!;
        if (__DEV__) {
          console.log('[HEALTH CONTEXT] Computing value: sys=', sys, 'hits=', sys.state.hits, 'bars=', sys.bars);
        }
        const value: Ctx = {
          sys,
          hits: sys.state.hits,
          isDead: sys.state.isDead,
          bars: sys.bars,
          instanceId: sys.instanceId,
          takeDamage,
          heal,
          reset
        };

        useEffect(() => {
          if (__DEV__) console.log('[HEALTH_CTX] mounted instanceId=', sysRef.current!.instanceId);
        }, []);

  return <C.Provider value={value}>{children}</C.Provider>;
};

export function useHealth() { 
  const v = useContext(C); 
  console.log('[HEALTH CONTEXT DEBUG] useHealth called, context value:', v);
  if (!v) {
    console.error('[HEALTH CONTEXT DEBUG] useHealth outside provider - context is null');
    throw new Error("useHealth outside provider"); 
  }
  console.log('[HEALTH CONTEXT DEBUG] useHealth returning:', {
    hits: v.hits,
    isDead: v.isDead,
    bars: v.bars,
    instanceId: v.instanceId,
    sysState: v.sys.state
  });
  return v; 
}
