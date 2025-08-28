import { useEffect, useRef, useState } from 'react';

export function useAnimator(frames: string[], fps = 12) {
  const [idx, setIdx] = useState(0);
  const timer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!frames.length) return;
    const interval = 1000 / fps;
    timer.current = setInterval(() => {
      setIdx(i => (i + 1) % frames.length);
    }, interval);
    return () => { 
      if (timer.current) clearInterval(timer.current); 
    };
  }, [frames, fps]);

  return frames[idx] ?? frames[0];
}
