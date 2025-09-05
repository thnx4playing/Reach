import { useEffect, useRef, useState } from "react";
import { useHealth } from "./HealthContext";

// Hurt animation system that manages temporary hurt state
export function useDamageAnimations() {
  const { isDead, hits, instanceId } = useHealth();
  const lastHitsRef = useRef(0);
  const [isHurt, setIsHurt] = useState(false);
  const hurtTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  useEffect(() => {
    // Play hurt animation when damage is taken
    if (!isDead && hits > lastHitsRef.current) {
      // Set hurt state to true
      setIsHurt(true);
      
      // Clear any existing timeout
      if (hurtTimeoutRef.current) {
        clearTimeout(hurtTimeoutRef.current);
      }
      
      // Set hurt state to false after animation duration (about 0.5 seconds)
      hurtTimeoutRef.current = setTimeout(() => {
        setIsHurt(false);
      }, 500);
    }
    lastHitsRef.current = hits;
  }, [hits, isDead]);

  useEffect(() => {
    if (isDead) {
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
