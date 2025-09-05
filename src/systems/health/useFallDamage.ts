import { useEffect, useRef } from "react";
import { Dimensions } from "react-native";
import { useHealth } from "./HealthContext";

export function useFallDamage(onGroundRef: React.RefObject<boolean>, feetYRef: React.RefObject<number>) {
  if (__DEV__) {
    console.log('FALL DAMAGE DEBUG: useFallDamage hook called');
  }
  const { takeDamage } = useHealth();
  const prevGrounded = useRef<boolean>(true);
  const peakFeetY = useRef<number>(0);
  const screenH = Dimensions.get("window").height;
  const threshold = screenH / 5; // easier to trigger; tune later

  useEffect(() => {
    if (__DEV__) {
      console.log('FALL DAMAGE DEBUG: useEffect triggered, starting interval');
    }
    const interval = setInterval(() => {
      const onGround = onGroundRef.current ?? true;
      const feetY = feetYRef.current ?? 0;
      const was = prevGrounded.current;
      
      if (__DEV__ && Math.random() < 0.01) { // Log occasionally to avoid spam
        console.log('FALL DAMAGE DEBUG: Interval tick - onGround:', onGround, 'feetY:', feetY, 'was:', was);
      }

      if (!onGround) {
        if (prevGrounded.current) {
          // Just started falling, initialize peak
          peakFeetY.current = feetY;
        }
        prevGrounded.current = false;
        peakFeetY.current = Math.min(peakFeetY.current, feetY); // store highest point (lower Y)
        if (__DEV__) {
          console.log('FALL DEBUG: In air, peakFeetY:', peakFeetY.current, 'current feetY:', feetY);
        }
        return;
      }

      // landed
      if (!was) {
        const drop = feetY - peakFeetY.current; // Y grows downward in screen space
        if (__DEV__) {
          console.log('FALL DEBUG: Landed! Drop:', drop, 'threshold:', threshold, 'peakFeetY:', peakFeetY.current, 'feetY:', feetY);
        }
        if (drop >= threshold) {
          if (__DEV__) {
            console.log('FALL DEBUG: Taking damage! Drop:', drop, '>= threshold:', threshold);
          }
          takeDamage(1);
        }
      }
      prevGrounded.current = true;
      peakFeetY.current = feetY;
    }, 16); // Check at ~60fps

    return () => {
      if (__DEV__) {
        console.log('FALL DAMAGE DEBUG: useEffect cleanup, clearing interval');
      }
      clearInterval(interval);
    };
  }, [onGroundRef, feetYRef, takeDamage, threshold]);
}
