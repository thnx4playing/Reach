import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { makeStaticFloor } from '../content/floor';
import { DashCharacter } from './DashCharacter';
import { CirclePad } from '../input/CirclePad';
import { JumpButton } from '../input/JumpButton';
import { PrefabNode } from '../render/PrefabNode';
import ParallaxBackground from '../render/ParallaxBackground';
import { PARALLAX } from '../content/parallaxConfig';
import type { LevelData } from '../content/levels';
import { MAPS, getPrefab, getTileSize, prefabWidthPx } from '../content/maps';
import { MapImageProvider } from '../render/MapImageContext';
// import TestTile from '../render/TestTile';
import idleJson from '../../assets/character/dash/Idle_atlas.json';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Feel
const SCALE      = 2;
const WALK_SPEED = 120;
const RUN_SPEED  = 260;
const GRAVITY    = 1800;
const JUMP_VEL   = 400;  // Reduced from 620 for smoother jump
const JUMP_VELOCITY = JUMP_VEL;  // Alias for consistency
const ACCEL = 800;  // Acceleration rate
const DECEL = 600;  // Deceleration rate
const PAD_SIZE = 140;  // Consistent control sizing
const FOOT_OFFSET = 1; // tweak 0..2 to taste

interface GameScreenProps {
  levelData: LevelData;
  onBack: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({ levelData, onBack }) => {
  const [cameraY, setCameraY] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  
  // State variables
  const [x, setX] = useState(SCREEN_W * 0.5);
  const [z, setZ] = useState(0);
  const [dirX, setDirX] = useState(0);
  const [speedLevel, setSpeedLevel] = useState<'idle'|'walk'|'run'>('idle');
  
  // Refs for physics
  const xRef = useRef(SCREEN_W * 0.5);
  const zRef = useRef(0);
  const vxRef = useRef(0);
  const vzRef = useRef(0);
  const dirXRef = useRef(0);
  const speedRef = useRef<'idle'|'walk'|'run'>('idle');
  const onGroundRef = useRef(true);

  // Top Y of the surface under a given X (floor + any platform under that X)
  const surfaceTopAtX = (xCenter: number) => {
    // start with the floor as the base surface
    let topY = floorTopY;

    for (const p of levelData.platforms ?? []) {
      if (!p?.prefab || typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      
      try {
        const w = prefabWidthPx(levelData.mapName, p.prefab, p.scale ?? 2);
        const left = p.x;
        const right = p.x + w;

        // if Dash's center is horizontally over this prefab, consider it
        if (xCenter >= left && xCenter <= right) {
          if (p.y < topY) {
            topY = p.y; // smaller y = visually higher
          }
        }
      } catch (error) {
        // Skip this platform if prefabWidthPx fails
        if (__DEV__) {
          console.warn('Failed to get width for prefab:', p.prefab, error);
        }
        continue;
      }
    }
    return topY;
  };

  // Floor pieces are already included in levelData.platforms from buildLevel()
  // Use proper floor calculation from floor.ts
  
const floorTopY = useMemo(() => {
  // tile size + prefab rows from the active map
  const meta = (MAPS as any)[levelData.mapName]?.prefabs?.meta;
  const tile = meta?.tileSize ?? 16;

  const pf = (MAPS as any)[levelData.mapName]?.prefabs?.prefabs?.floor;
  const rows = (pf?.cells?.length ?? pf?.rects?.length ?? 2);

  const floorHeight = rows * tile * SCALE; // rows * tile * SCALE
  const result = Math.round(SCREEN_H - floorHeight);
  
  // Optional debug log
  if (__DEV__) {
    console.log('floor rows:', rows, 'tile:', tile, 'SCALE:', SCALE, 'floorTopY:', result);
  }
  
  return result;
}, [levelData.mapName]);

  const mapDef = MAPS[levelData.mapName];

  // Character width calculation
  const firstIdleKey = Object.keys((idleJson as any).frames)[0];
  const firstIdleFrame = (idleJson as any).frames[firstIdleKey];
  const charW = (firstIdleFrame?.w ?? 32) * SCALE;

  // Initialize spawn height on the correct surface
  useEffect(() => {
    const cx = xRef.current + charW * 0.5;
    const surfTop = surfaceTopAtX(cx);
    const groundLift = Math.max(0, floorTopY - surfTop); // height above FLOOR
    zRef.current = groundLift;
    setZ(groundLift);
    onGroundRef.current = true;
  }, [floorTopY, levelData.mapName, levelData.platforms?.length]);

  // Pad callback (from CirclePad): update refs + state mirror
  const onPad = (o: { dirX: -1|0|1; magX: number }) => {
    setDirX(o.dirX);
    dirXRef.current = o.dirX;

    // Hysteresis bands: enter at *_IN, exit at *_OUT (OUT < IN)
    const WALK_IN = 0.05, WALK_OUT = 0.03; // Match CirclePad sensitivity
    const RUN_IN  = 0.35, RUN_OUT  = 0.25; // Match CirclePad sensitivity

    let level = speedRef.current;
    const m = o.magX;

    if (level === 'idle') {
      level = m >= RUN_IN ? 'run' : (m >= WALK_IN ? 'walk' : 'idle');
    } else if (level === 'walk') {
      level = m >= RUN_IN ? 'run' : (m <= WALK_OUT ? 'idle' : 'walk');
    } else { // run
      level = m <= RUN_OUT ? 'walk' : 'run';
    }

    setSpeedLevel(level);
    speedRef.current = level;
  };

  // Jump only if grounded
  const doJump = () => {
    if (onGroundRef.current) {
      vzRef.current = JUMP_VELOCITY;
      onGroundRef.current = false;
    }
  };

  // ONE RAF LOOP — runs once; uses refs so it never duplicates.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

            const loop = (t: number) => {
      // At the very start of your loop(t):
      if (__DEV__) {
        // increment a global frame id and reset per-frame draw counter
        (globalThis as any).__dashFrameID = ((globalThis as any).__dashFrameID ?? 0) + 1;
        (globalThis as any).__dashDraws = 0;
      }

      const dt = Math.min(0.033, (t - last) / 1000);
      last = t;

      // Horizontal movement with momentum preservation
      const target = speedRef.current === 'idle' ? 0
                   : speedRef.current === 'walk' ? WALK_SPEED
                   : RUN_SPEED;

      // Apply friction only on ground
      if (onGroundRef.current) {
        vxRef.current *= 0.85;     // ground friction
      } else {
        vxRef.current *= 0.995;    // minimal air drag
      }

      // Drive horizontal speed from input bands
      if (dirXRef.current !== 0) {
        const desired = dirXRef.current * target;
        const dv = desired - vxRef.current;
        const step = Math.sign(dv) * Math.min(Math.abs(dv), ACCEL);
        vxRef.current += step;
      } else {
        const dv = -vxRef.current;
        const step = Math.sign(dv) * Math.min(Math.abs(dv), DECEL);
        vxRef.current += step;
      }

      xRef.current = Math.max(0, Math.min(SCREEN_W - charW, xRef.current + vxRef.current * dt));

      // Vertical
      vzRef.current -= GRAVITY * dt;
      zRef.current  += vzRef.current * dt;

      // Surface-based grounding
      const cx = xRef.current + charW * 0.5;
      const surfTop = surfaceTopAtX(cx);
      const groundLift = Math.max(0, floorTopY - surfTop); // 0 on floor; >0 on raised platforms

      if (zRef.current <= groundLift) {
        zRef.current = groundLift;
        vzRef.current = 0;
        onGroundRef.current = true;
      } else {
        onGroundRef.current = false;
      }

      // Push to state for render
      setX(xRef.current);
      setZ(zRef.current);
      
      // Update parallax timing and camera
      setElapsedSec(t / 1000);
      // Keep background stable - no vertical camera movement to prevent jumping
      setCameraY(0);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [charW]); // only depends on sprite width

  return (
    <View style={styles.root}>
      <MapImageProvider source={mapDef.image} tag={`MIP:${levelData.mapName}`}>
        <Canvas style={styles.canvas}>
          {/* Parallax Background */}
          <ParallaxBackground
            variant={PARALLAX[levelData.mapName]}
            cameraY={cameraY}
            timeSec={elapsedSec}
            viewport={{ width: SCREEN_W, height: SCREEN_H }}
          />
          
          {/* Test tile canary - shows instantly if image loading works */}
          {/* <TestTile /> */}
          
          {/* Render all platforms (includes floor pieces) */}
          {levelData.platforms?.filter(Boolean).map((platform, index) => {
            // Defensive check for required properties
            if (!platform || typeof platform.x !== 'number' || typeof platform.y !== 'number' || !platform.prefab) {
              console.warn(`Invalid platform at index ${index}:`, platform);
              return null;
            }
            
            return (
              <PrefabNode
                key={`platform-${index}`}
                map={levelData.mapName}
                name={platform.prefab}
                x={platform.x}
                y={platform.y}
                scale={platform.scale || 2}
              />
            );
          })}

          {/* 🔴 IMPORTANT: ensure there is ONLY ONE DashCharacter in the tree */}
          <DashCharacter
            floorTopY={floorTopY}
            posX={x}
            lift={z}
            scale={SCALE}
            footOffset={FOOT_OFFSET}
            input={{
              vx: vxRef.current,  // Use actual velocity for momentum preservation
              dirX,
              crouch: false,  // Always false - no crouch functionality
              onGround: onGroundRef.current,
            }}
          />
        </Canvas>
      </MapImageProvider>

      <CirclePad 
        size={PAD_SIZE}
        deadzone={0.02}
        onChange={onPad}
      />
      <JumpButton size={PAD_SIZE} onJump={doJump} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  canvas: { flex: 1 },
});