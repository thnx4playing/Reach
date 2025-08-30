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
import { MAPS } from '../content/maps';
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

interface GameScreenProps {
  levelData: LevelData;
  onBack: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({ levelData, onBack }) => {
  const [cameraY, setCameraY] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);

  const floorPieces = useMemo(
    () => makeStaticFloor(levelData.mapName, SCREEN_W, SCREEN_H, SCALE, 'floor'),
    [levelData.mapName]
  );
  // NOTE: if you ever see a teleport when changing maps, try Math.max(...) here.
  const floorTopY = useMemo(() => Math.min(...floorPieces.map(p => p.y)), [floorPieces]);

  const firstIdleKey = Object.keys((idleJson as any).frames)[0];
  const firstIdleFrame = (idleJson as any).frames[firstIdleKey];
  const charW = (firstIdleFrame?.w ?? 32) * SCALE;

  // INPUT (smoothed elsewhere)
  const dirXRef    = useRef<-1|0|1>(0);
  const speedRef   = useRef<'idle'|'run'>('idle');

  const [dirX, setDirX] = useState<-1|0|1>(0);
  const [speedLevel, setSpeedLevel] = useState<'idle'|'run'>('idle');

  // WORLD STATE (authoritative in refs; state mirrors for rendering)
  const xRef  = useRef(Math.round(SCREEN_W * 0.5 - charW / 2));
  const zRef  = useRef(0);          // height above floor
  const vzRef = useRef(0);
  const [x, setX] = useState(xRef.current);
  const [z, setZ] = useState(zRef.current);

  // Simple timer for parallax animation
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsedSec((Date.now() - t0) / 1000), 16);
    return () => clearInterval(id);
  }, []);

  const mapDef = MAPS[levelData.mapName];

  // Pad callback (from CirclePad): update refs + state mirror
  const onPad = (o: { dirX: -1|0|1; magX: number }) => {
    // Hysteresis is in your CirclePad → GameScreen smoothing already; just map to level.
    setDirX(o.dirX);
    dirXRef.current = o.dirX;

    let level: 'idle'|'run' = 'idle';
    if (o.magX > 0.6) level = 'run';  // Lowered from 0.75 to reduce delay

    setSpeedLevel(level);
    speedRef.current = level;
  };

  // Jump only if grounded
  const doJump = () => {
    if (zRef.current <= 0.0001) {
      vzRef.current = JUMP_VEL;
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

      // Horizontal
      const speed = speedRef.current === 'idle' ? 0 : RUN_SPEED;
      xRef.current = Math.max(0, Math.min(SCREEN_W - charW, xRef.current + dirXRef.current * speed * dt));

      // Vertical
      vzRef.current -= GRAVITY * dt;
      zRef.current  += vzRef.current * dt;

      if (zRef.current <= 0) {
        zRef.current = 0;
        vzRef.current = 0;
      }

      // Push to state for render
      setX(xRef.current);
      setZ(zRef.current);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [charW]); // only depends on sprite width

  return (
    <View style={styles.root}>
      <MapImageProvider source={mapDef.image} tag={`MIP:${levelData.mapName}`}>
        <Canvas style={styles.canvas}>
          {/* Parallax Background - only show for grassy map for now */}
          {levelData.mapName === 'grassy' && (
            <ParallaxBackground
              variant={PARALLAX.grassy}
              cameraY={cameraY}
              timeSec={elapsedSec}
              viewport={{ width: SCREEN_W, height: SCREEN_H }}
            />
          )}
          
          {/* Test tile canary - shows instantly if image loading works */}
          {/* <TestTile /> */}
          
          {/* Render floor pieces */}
          {floorPieces.map((piece, index) => (
            <PrefabNode
              key={`floor-${index}`}
              map={levelData.mapName}
              name={piece.prefab}
              x={piece.x}
              y={piece.y}
              scale={piece.scale}
            />
          ))}
          
          {/* Render all other platforms */}
          {levelData.platforms.map((platform, index) => (
            <PrefabNode
              key={`platform-${index}`}
              map={levelData.mapName}
              name={platform.prefab}
              x={platform.x}
              y={platform.y}
              scale={platform.scale || 2}
            />
          ))}

          {/* 🔴 IMPORTANT: ensure there is ONLY ONE DashCharacter in the tree */}
          <DashCharacter
            floorTopY={floorTopY}
            posX={x}
            lift={z}
            scale={SCALE}
            input={{
              vx: speedLevel === 'idle' ? 0 : (dirX * RUN_SPEED),
              dirX,
              crouch: false,  // Always false - no crouch functionality
              onGround: z <= 0.0001,
            }}
          />
        </Canvas>
      </MapImageProvider>

      <CirclePad size={72} onChange={onPad} />
      <JumpButton size={72} onJump={doJump} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  canvas: { flex: 1 },
});