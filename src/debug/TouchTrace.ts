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
  if (__DEV__) {
    // keep it compact in dev
    // eslint-disable-next-line no-console
    console.log('TRACE', ev.name, ev.phase, ev.ids ?? [], ev.xy ?? []);
  }
}

export function dumpTrace(label = 'TOUCH TRACE DUMP') {
  // eslint-disable-next-line no-console
  console.log(`\n==== ${label} (last ${SIZE}) ====`);
  for (let i = 0; i < SIZE; i++) {
    const j = (idx + i) % SIZE;
    const ev = buf[j];
    if (ev) {
      // eslint-disable-next-line no-console
      console.log(`${new Date(ev.t).toISOString()} | ${ev.name} | ${ev.phase} | np=${ev.np ?? ''} | ids=${(ev.ids ?? []).join(',')} | xy=${ev.xy ?? ''}`, ev.note ?? '');
    }
  }
  // eslint-disable-next-line no-console
  console.log('==== END TRACE DUMP ====\n');
}
