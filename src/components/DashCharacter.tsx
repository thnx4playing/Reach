import React from 'react';
import { SpriteNodeSkia } from '../render/SpriteNodeSkia';
import { useAnimator } from '../hooks/useAnimator';
import type { AnimationState, Animation } from '../types';

// Import atlas data for specified animations
import idleAtlasJson from '../../assets/character/dash/Idle_atlas.json';
import walkAtlasJson from '../../assets/character/dash/Walk_atlas.json';
import runAtlasJson from '../../assets/character/dash/Run_atlas.json';
import jumpAtlasJson from '../../assets/character/dash/Jump_atlas.json';
import crouchIdleAtlasJson from '../../assets/character/dash/Crouch-Idle_atlas.json';
import crouchWalkAtlasJson from '../../assets/character/dash/Crouch-Walk_atlas.json';
import hurtAtlasJson from '../../assets/character/dash/Hurt-Damaged_atlas.json';
import deathAtlasJson from '../../assets/character/dash/Death_atlas.json';

// Import atlas images
const idleImage = require('../../assets/character/dash/Idle_atlas.png');
const walkImage = require('../../assets/character/dash/Walk_atlas.png');
const runImage = require('../../assets/character/dash/Run_atlas.png');
const jumpImage = require('../../assets/character/dash/Jump_atlas.png');
const crouchIdleImage = require('../../assets/character/dash/Crouch-Idle_atlas.png');
const crouchWalkImage = require('../../assets/character/dash/Crouch-Walk_atlas.png');
const hurtImage = require('../../assets/character/dash/Hurt-Damaged_atlas.png');
const deathImage = require('../../assets/character/dash/Death_atlas.png');

// Create frame arrays sorted numerically
const IDLE_FRAMES = Object.keys(idleAtlasJson.frames)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const WALK_FRAMES = Object.keys(walkAtlasJson.frames)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const RUN_FRAMES = Object.keys(runAtlasJson.frames)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const JUMP_FRAMES = Object.keys(jumpAtlasJson.frames)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const CROUCH_IDLE_FRAMES = Object.keys(crouchIdleAtlasJson.frames)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const CROUCH_WALK_FRAMES = Object.keys(crouchWalkAtlasJson.frames)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const HURT_FRAMES = Object.keys(hurtAtlasJson.frames)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const DEATH_FRAMES = Object.keys(deathAtlasJson.frames)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

// Animation configuration
const ANIMATIONS: Record<AnimationState, Animation> = {
  idle: { json: idleAtlasJson, image: idleImage, frames: IDLE_FRAMES, fps: 8 },
  walk: { json: walkAtlasJson, image: walkImage, frames: WALK_FRAMES, fps: 10 },
  run: { json: runAtlasJson, image: runImage, frames: RUN_FRAMES, fps: 12 },
  jump: { json: jumpAtlasJson, image: jumpImage, frames: JUMP_FRAMES, fps: 10 },
  'crouch-idle': { json: crouchIdleAtlasJson, image: crouchIdleImage, frames: CROUCH_IDLE_FRAMES, fps: 8 },
  'crouch-walk': { json: crouchWalkAtlasJson, image: crouchWalkImage, frames: CROUCH_WALK_FRAMES, fps: 10 },
  hurt: { json: hurtAtlasJson, image: hurtImage, frames: HURT_FRAMES, fps: 12 },
  death: { json: deathAtlasJson, image: deathImage, frames: DEATH_FRAMES, fps: 8 },
} as const;

interface DashCharacterProps {
  x: number;
  y: number;
  scale?: number;
  animationState: AnimationState;
}

export const DashCharacter: React.FC<DashCharacterProps> = ({
  x,
  y,
  scale = 2,
  animationState,
}) => {
  const currentAnimation = ANIMATIONS[animationState];
  const frameName = useAnimator(currentAnimation.frames, currentAnimation.fps);

  return (
    <SpriteNodeSkia
      atlas={{ 
        image: currentAnimation.image, 
        frames: currentAnimation.json.frames 
      }}
      frameName={frameName}
      x={x}
      y={y}
      scale={scale}
    />
  );
};
