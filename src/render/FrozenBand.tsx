import React from "react";
import { View } from "react-native";
import { Canvas, Path, Skia, Rect, Circle } from "@shopify/react-native-skia";

type Props = {
  width: number;
  height: number;   // band height in px
  y: number;        // screen Y (top of band)
  opacity?: number; // 0..1
  timeMs?: number;  // animation time in ms (subtle shimmer)
};

/**
 * Frozen/ice floor band drawn entirely in Skia.
 * Features:
 * - Icy blue-white gradient effect using layered fills
 * - Subtle jagged ice edge on top
 * - Darker ice layers below suggesting depth
 * - Optional sparkle/shimmer effect
 * API mirrors GroundBand so it can be slotted in easily.
 */
export default function FrozenBand({ width, height, y, opacity = 1, timeMs = 0 }: Props) {
  const iceTopHeight = Math.max(6, Math.round(height * 0.08)); // top icy layer
  const iceDepth = Math.max(0, height - iceTopHeight);

  // Jagged ice edge (more angular than grass waves)
  const iceEdgeAmp = 3;
  const iceEdgeLen = 32;
  const phase = (timeMs % 8000) / 8000 * (Math.PI * 2); // Very slow shimmer

  const makeIceEdgePath = () => {
    const path = Skia.Path.Make();
    const top = y;
    const bottom = y + iceTopHeight;

    path.moveTo(0, bottom);
    
    // Jagged/crystalline top edge
    const steps = Math.max(12, Math.ceil(width / iceEdgeLen));
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * width;
      // Mix of sharp peaks and flat sections for ice crystals
      const jag = i % 2 === 0 
        ? Math.sin((x / iceEdgeLen) * Math.PI * 2 + phase * 0.5) * iceEdgeAmp
        : -Math.sin((x / iceEdgeLen) * Math.PI * 2 + phase * 0.5) * iceEdgeAmp * 0.5;
      const yEdge = top + Math.max(-iceEdgeAmp, Math.min(iceEdgeAmp, jag));
      path.lineTo(x, yEdge);
    }
    path.lineTo(width, bottom);
    path.close();
    return path;
  };

  const makeIceDepthPath = () => {
    const path = Skia.Path.Make();
    path.addRect({ x: 0, y: y + iceTopHeight, width, height: iceDepth });
    return path;
  };

  // Ice colors - pale blue-white gradient effect
  const iceSurface = "#e8f4f8";     // Very pale blue-white (lightest)
  const iceHighlight = "#ffffff";   // Pure white highlights
  const iceMid = "#c5dde5";         // Light blue
  const iceDeep = "#9fb8c4";        // Medium blue
  const iceDark = "#7a99a8";        // Darker blue depths

  // Ice depth layers (simulate looking down into ice)
  const depthLayers = [
    { color: iceMid,  yOff: 0,  hMul: 1.00, op: 1.0 },
    { color: iceDeep, yOff: 8,  hMul: 0.75, op: 0.9 },
    { color: iceDark, yOff: 16, hMul: 0.50, op: 0.8 },
  ];

  const iceEdgePath = makeIceEdgePath();
  const iceDepthPath = makeIceDepthPath();

  // Sparkle effect - occasional small white dots that shimmer
  const sparkles = React.useMemo(() => {
    const s = [];
    const seed = 12345;
    let rng = seed;
    const random = () => {
      rng = (rng * 9301 + 49297) % 233280;
      return rng / 233280;
    };
    
    const count = Math.floor(width / 80); // ~1 sparkle per 80px
    for (let i = 0; i < count; i++) {
      s.push({
        x: random() * width,
        y: y + random() * Math.min(height, 40), // Only sparkle in top portion
        phase: random() * Math.PI * 2,
        size: 1 + random() * 2,
      });
    }
    return s;
  }, [width, height, y]);

  const t = (timeMs % 10000) / 10000; // 10 second cycle for sparkles

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, opacity }}>
      <Canvas style={{ position: "absolute", left: 0, top: 0, width, height: y + height }}>
        {/* Ice depth layers (darker blue going down) */}
        {depthLayers.map((l, i) => {
          const h = Math.max(0, iceDepth * l.hMul);
          return (
            <Path
              key={i}
              path={Skia.Path.MakeFromSVGString(`M0 ${y+iceTopHeight+l.yOff} H ${width} V ${y+iceTopHeight+l.yOff+h} H 0 Z`)!}
              color={l.color}
              opacity={l.op}
              style="fill"
            />
          );
        })}

        {/* Ice surface (top layer with jagged edge) */}
        <Path path={iceEdgePath} color={iceMid} opacity={1} style="fill" />
        <Path path={iceEdgePath} color={iceSurface} opacity={0.9} style="fill" />
        
        {/* Top highlight for shine effect */}
        <Rect 
          x={0} 
          y={y} 
          width={width} 
          height={2} 
          color={iceHighlight} 
          opacity={0.6} 
        />

        {/* Sparkles - shimmer effect */}
        {sparkles.map((s, i) => {
          const alpha = 0.3 + 0.5 * Math.abs(Math.sin(t * Math.PI * 2 + s.phase));
          return (
            <Circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.size}
              color={iceHighlight}
              opacity={alpha}
            />
          );
        })}
        
        {/* Additional scattered micro-highlights for texture */}
        <Rect 
          x={width * 0.1} 
          y={y + 2} 
          width={2} 
          height={2} 
          color={iceHighlight} 
          opacity={0.4 + 0.3 * Math.sin(t * Math.PI * 4)} 
        />
        <Rect 
          x={width * 0.35} 
          y={y + 3} 
          width={1} 
          height={1} 
          color={iceHighlight} 
          opacity={0.5 + 0.3 * Math.sin(t * Math.PI * 4 + 1)} 
        />
        <Rect 
          x={width * 0.65} 
          y={y + 2} 
          width={2} 
          height={1} 
          color={iceHighlight} 
          opacity={0.4 + 0.3 * Math.sin(t * Math.PI * 4 + 2)} 
        />
        <Rect 
          x={width * 0.85} 
          y={y + 4} 
          width={1} 
          height={2} 
          color={iceHighlight} 
          opacity={0.5 + 0.3 * Math.sin(t * Math.PI * 4 + 3)} 
        />
      </Canvas>
    </View>
  );
}
