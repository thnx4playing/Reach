export interface ParallaxLayer {
  src: any; // Image source (require() result)
  vFactor: number; // Vertical parallax factor (0-1, where 0 is static, 1 moves with camera)
  hDrift?: number; // Optional horizontal drift in pixels per second
}

export interface ParallaxConfig {
  name: string;
  layers: ParallaxLayer[];
}

export const PARALLAX = {
  grassy: {
    name: 'grassy',
    layers: [
      { 
        src: require('../../assets/parallax/grassy/static_BG1.png'), 
        vFactor: 0.04 
      }, // sky - almost static
      { 
        src: require('../../assets/parallax/grassy/static_BG2.png'), 
        vFactor: 0.08, 
        hDrift: 6 
      }, // clouds - slow sideways drift
      { 
        src: require('../../assets/parallax/grassy/static_BG.png'), 
        vFactor: 0.16 
      }, // far mountains
      { 
        src: require('../../assets/parallax/grassy/static_BG3.png'), 
        vFactor: 0.28 
      }, // near mountains
    ],
  },
} as const;

export type ParallaxVariant = keyof typeof PARALLAX;

