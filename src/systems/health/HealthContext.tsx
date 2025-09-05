import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from "react";
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
    return () => {
      // Cleanup on unmount
    };
  }, []);

  // Initialize the health system
  if (!sysRef.current) {
    sysRef.current = new HealthSystem(5); // 5 hearts total
  }

  const triggerUpdate = useCallback(() => {
    forceUpdate(prev => prev + 1);
  }, []);

  const takeDamage = useCallback((n?: number) => {
    const result = sysRef.current!.takeDamage(n);
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


  return <C.Provider value={value}>{children}</C.Provider>;
};

export function useHealth() { 
  const v = useContext(C); 
  if (!v) {
    throw new Error("useHealth outside provider"); 
  }
  return v; 
}
