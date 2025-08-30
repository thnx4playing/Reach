import { useEffect, useRef, useState } from 'react';

type AnimatorOpts = { loop?: boolean; holdOnEnd?: boolean };

export function useAnimator(
  frames: string[],
  fps = 12,
  opts: AnimatorOpts = {}
) {
  const { loop = true, holdOnEnd = true } = opts;
  const [frameIdx, setFrameIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setFrameIdx(0);
  }, [frames]);

  useEffect(() => {
    if (!frames.length) return;

    if (timerRef.current) clearInterval(timerRef.current);
    let stopped = false;

    const tick = () => {
      setFrameIdx((i) => {
        const next = i + 1;
        if (next >= frames.length) {
          if (loop) return 0;
          stopped = true;
          return holdOnEnd ? frames.length - 1 : i;
        }
        return next;
      });
    };

    const interval = Math.max(1, Math.floor(1000 / Math.max(1, fps)));
    timerRef.current = setInterval(() => {
      if (!stopped) tick();
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [frames, fps, loop, holdOnEnd]);

  return frames[Math.min(frameIdx, Math.max(0, frames.length - 1))] ?? frames[0];
}
