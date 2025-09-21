// PERFORMANCE: Throttled animation hook for better frame control
import { useEffect, useRef } from 'react';

export const useThrottledAnimation = (callback: () => void, fps = 60) => {
  const frameRef = useRef(0);
  const targetInterval = 1000 / fps;
  
  useEffect(() => {
    let lastTime = 0;
    
    const tick = (currentTime: number) => {
      if (currentTime - lastTime >= targetInterval) {
        callback();
        lastTime = currentTime;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    
    frameRef.current = requestAnimationFrame(tick);
    
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [callback, targetInterval]);
};
