export type PlayerBox = {
  left: number; right: number; top: number; bottom: number;
  cx: number; feetY: number; w: number; h: number;
};

/** Build the player AABB in WORLD pixels. */
export function getPlayerBox(params: {
  xRefIsLeftEdge: boolean; // true if xRef is sprite left-edge; false if center
  x: number;               // xRef.current (WORLD)
  z: number;               // zRef.current (height above floor)
  floorTopY: number;       // WORLD Y of floor top
  charW: number;           // sprite visual width in px
  colW: number;            // collider width
  colH: number;            // collider height
}): PlayerBox {
  const { xRefIsLeftEdge, x, z, floorTopY, charW, colW, colH } = params;
  const cx    = xRefIsLeftEdge ? (x + charW * 0.5) : x;
  const feetY = floorTopY - z;
  const left  = cx - colW * 0.5;
  const right = cx + colW * 0.5;
  const top   = feetY - colH;
  const bottom= feetY;
  return { left, right, top, bottom, cx, feetY, w: colW, h: colH };
}
