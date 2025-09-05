import { useEffect, useRef, useState } from "react";
import { useHealth } from "./HealthContext";

// Hurt animation system that manages temporary hurt state
export function useDamageAnimations() {
  const { isDead, hits, instanceId } = useHealth();
  const lastHitsRef = useRef(0);
  const [isHurt, setIsHurt] = useState(false);
  const hurtTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  if (__DEV__) {
    console.log('[DAMAGE ANIM] ctx instanceId=', instanceId, 'hits=', hits);
  }

  useEffect(() => {
    // Play hurt animation when damage is taken
    if (!isDead && hits > lastHitsRef.current) {
      console.log(`HURT ANIMATION DEBUG: Player took damage! Hits: ${hits}, setting isHurt=true`);
      
      // Set hurt state to true
      setIsHurt(true);
      
      // Clear any existing timeout
      if (hurtTimeoutRef.current) {
        clearTimeout(hurtTimeoutRef.current);
      }
      
      // Set hurt state to false after animation duration (about 0.5 seconds)
      hurtTimeoutRef.current = setTimeout(() => {
        console.log(`HURT ANIMATION DEBUG: Setting isHurt=false after 500ms`);
        setIsHurt(false);
      }, 500);
    }
    lastHitsRef.current = hits;
  }, [hits, isDead]);

  useEffect(() => {
    if (isDead) {
      console.log("Player died!");
      // Clear hurt state when dead
      setIsHurt(false);
      if (hurtTimeoutRef.current) {
        clearTimeout(hurtTimeoutRef.current);
      }
    }
  }, [isDead]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hurtTimeoutRef.current) {
        clearTimeout(hurtTimeoutRef.current);
      }
    };
  }, []);

  return { isHurt };
}
