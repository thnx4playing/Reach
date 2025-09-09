import { useEffect } from 'react';
import { soundManager } from './SoundManager';

export const useSound = () => {
  useEffect(() => {
    // Initialize sound manager when hook is first used
    soundManager.initialize();

    // Cleanup on unmount
    return () => {
      soundManager.cleanup();
    };
  }, []);

  return {
    playJumpSound: () => soundManager.playJumpSound(),
    playDamageSound: () => soundManager.playDamageSound(),
    playSound: (name: string, volume?: number) => soundManager.playSound(name, volume),
  };
};

