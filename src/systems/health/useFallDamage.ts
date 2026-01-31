import { useEffect, useRef } from "react";
import { useHealth } from "./HealthContext";
import { useSound } from "../audio/useSound";
import { SHARED, TOWER_PHYSICS } from "../config/physics";

export function useFallDamage(onGroundRef: React.RefObject<boolean>, feetYRef: React.RefObject<number>) {
  const { takeDamage } = useHealth();
  const { playDamageSound } = useSound();
  const prevGrounded = useRef<boolean>(true);
  const peakFeetY = useRef<number>(0);
  // Use unified screen height and fall damage threshold from physics
  const screenH = SHARED.SCREEN_H;
  const threshold = screenH * TOWER_PHYSICS.FALL_DAMAGE_THRESHOLD_SCREENS;

  useEffect(() => {
    const interval = setInterval(() => {
      const onGround = onGroundRef.current ?? true;
      const feetY = feetYRef.current ?? 0;
      const was = prevGrounded.current;

      if (!onGround) {
        if (prevGrounded.current) {
          // Just started falling, initialize peak
          peakFeetY.current = feetY;
        }
        prevGrounded.current = false;
        peakFeetY.current = Math.min(peakFeetY.current, feetY); // store highest point (lower Y)
        return;
      }

      // landed
      if (!was) {
        const drop = feetY - peakFeetY.current; // Y grows downward in screen space
        if (drop >= threshold) {
          takeDamage(1);
          playDamageSound();
        }
      }
      prevGrounded.current = true;
      peakFeetY.current = feetY;
    }, 16); // Check at ~60fps

    return () => {
      clearInterval(interval);
    };
  }, [onGroundRef, feetYRef, takeDamage, threshold]);
}
