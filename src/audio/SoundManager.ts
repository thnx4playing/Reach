import { Audio } from 'expo-av';

export class SoundManager {
  private static instance: SoundManager;
  private sounds: Map<string, Audio.Sound> = new Map();
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Set audio mode for game sounds
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      // Preload sound files
      await this.loadSound('jump', require('../../assets/sounds/jump.wav'));
      await this.loadSound('damage', require('../../assets/sounds/damage.wav'));
      await this.loadSound('death', require('../../assets/sounds/death.wav'));
      await this.loadSound('fire-death', require('../../assets/sounds/fire-death.wav'));
      await this.loadSound('fireball', require('../../assets/sounds/fireball.wav'));

      this.isInitialized = true;
      console.log('[SoundManager] Initialized successfully');
    } catch (error) {
      console.error('[SoundManager] Failed to initialize:', error);
    }
  }

  private async loadSound(name: string, source: any): Promise<void> {
    try {
      console.log(`[SoundManager] Attempting to load sound: ${name} from source:`, source);
      const { sound } = await Audio.Sound.createAsync(source, {
        shouldPlay: false,
        isLooping: false,
        volume: 1.0,
      });
      
      this.sounds.set(name, sound);
      console.log(`[SoundManager] Successfully loaded sound: ${name}`);
    } catch (error) {
      console.error(`[SoundManager] Failed to load sound ${name}:`, error);
      console.error(`[SoundManager] Source was:`, source);
    }
  }

  public async playSound(name: string, volume: number = 1.0): Promise<void> {
    if (!this.isInitialized) {
      console.warn('[SoundManager] Not initialized, skipping sound:', name);
      return;
    }

    const sound = this.sounds.get(name);
    if (!sound) {
      console.warn(`[SoundManager] Sound not found: ${name}`);
      return;
    }

    try {
      await sound.setVolumeAsync(volume);
      await sound.replayAsync();
    } catch (error) {
      console.error(`[SoundManager] Failed to play sound ${name}:`, error);
    }
  }

  public async playJumpSound(): Promise<void> {
    await this.playSound('jump', 0.35); // Much quieter for jump (50% of previous)
  }

  public async playDamageSound(): Promise<void> {
    await this.playSound('damage', 0.8); // Slightly quieter for damage
  }

  public async playDeathSound(): Promise<void> {
    await this.playSound('death', 0.9); // Death sound for fall damage and other deaths
  }

  public async playFireDeathSound(): Promise<void> {
    await this.playSound('fire-death', 0.9); // Fire death sound for lava hazard
  }

  public async playFireballSound(): Promise<void> {
    await this.playSound('fireball', 0.8); // Fireball launch sound
  }

  public async cleanup(): Promise<void> {
    for (const [name, sound] of this.sounds) {
      try {
        await sound.unloadAsync();
        console.log(`[SoundManager] Unloaded sound: ${name}`);
      } catch (error) {
        console.error(`[SoundManager] Failed to unload sound ${name}:`, error);
      }
    }
    this.sounds.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const soundManager = SoundManager.getInstance();

