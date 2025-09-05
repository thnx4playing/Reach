// TouchTrace.ts – minimal ring buffer for gesture/touch events
export type Trace = {
  t: number;             // ms
  name: string;          // 'Pad' | 'Jump' | etc.
  phase: string;         // 'down'|'start'|'change'|'end'|'finalize'|'cancel'
  ids?: number[];        // active/changed touch ids
  np?: number;           // numberOfPointers
  xy?: [number, number]; // x,y when relevant
  note?: any;            // extra info
};

const SIZE = 300;
const buf: (Trace | undefined)[] = new Array(SIZE);
let idx = 0;

export function trace(ev: Trace) {
  buf[idx] = ev;
  idx = (idx + 1) % SIZE;
}

export function dumpTrace(label = 'TOUCH TRACE DUMP') {
  // Function kept for potential debugging but no longer logs
}
