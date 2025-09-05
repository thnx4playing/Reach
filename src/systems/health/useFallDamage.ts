import { useEffect, useRef } from "react";
import { Dimensions } from "react-native";
import { useHealth } from "./HealthContext";

export function useFallDamage(onGroundRef: React.RefObject<boolean>, feetYRef: React.RefObject<number>) {
  const { takeDamage } = useHealth();
  const prevGrounded = useRef<boolean>(true);
  const peakFeetY = useRef<number>(0);
  const screenH = Dimensions.get("window").height;
  const threshold = screenH / 5; // easier to trigger; tune later

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
