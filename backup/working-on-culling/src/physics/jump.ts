export type JumpState = {
  coyoteMsLeft: number;
  bufferMsLeft: number;
  ignoreCeilFrames: number;
};

// FIXED: Better balanced timing for more responsive jumps
export const COYOTE_MS = 100;   // Reduced from 120 - grace after leaving ground
export const BUFFER_MS = 120;   // Reduced from 140 - grace after pressing jump early/late  
export const LIFTOFF_IGNORE_FRAMES = 4; // Increased from 3 - ignore ceiling briefly after jump

export function initJumpState(): JumpState {
  return { coyoteMsLeft: 0, bufferMsLeft: 0, ignoreCeilFrames: 0 };
}

export function noteJumpPressed(js: JumpState) {
  js.bufferMsLeft = BUFFER_MS;
}

export function tickJumpTimers(js: JumpState, dtMs: number, grounded: boolean) {
  if (grounded) {
    js.coyoteMsLeft = COYOTE_MS;
  } else if (js.coyoteMsLeft > 0) {
    js.coyoteMsLeft = Math.max(0, js.coyoteMsLeft - dtMs);
  }
  if (js.bufferMsLeft > 0) {
    js.bufferMsLeft = Math.max(0, js.bufferMsLeft - dtMs);
  }
}

export function shouldExecuteJump(js: JumpState) {
  return js.bufferMsLeft > 0 && js.coyoteMsLeft > 0;
}

export function consumeJump(js: JumpState) {
  js.bufferMsLeft = 0;
  js.coyoteMsLeft = 0; // ADDED: Clear coyote time to prevent double jumps
  js.ignoreCeilFrames = LIFTOFF_IGNORE_FRAMES;
}

export function tickIgnoreCeil(js: JumpState) {
  if (js.ignoreCeilFrames > 0) js.ignoreCeilFrames--;
}