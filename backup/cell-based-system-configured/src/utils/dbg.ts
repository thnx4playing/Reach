export const DEBUG = true;
export const DBG_EVERY = 20;
let __frame = 0;

export function dbg(...args: any[]) {
  if (!DEBUG) return;
  if ((++__frame % DBG_EVERY) !== 0) return;
  try { console.log(...args); } catch {}
}
