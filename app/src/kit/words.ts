// The narration as data. data/lyrics.json holds every spoken word with its start/end (pipeline/align.py
// writes it), so scenes time things to WORDS, never to hard-coded seconds:
//   WT('ghidra')      start of the first word starting with "ghidra"
//   WT('break', 1)    start of the second "break"
//   WE('injection')   end of that word
// When a scene was laid out on one read and the voice is replaced, copy the old lyrics.json to
// data/lyrics.layout.json: M(x) then maps any literal time x from the old read onto the new one,
// word by word, so hand-placed moments (a camera move at 27.6 s) follow the new voice too.
import LY from '@root/data/lyrics.json';
import { lerp } from '../engine/util';

export interface Wd { w: string; start: number; end: number }
export interface Ln { text: string; start: number; end: number; words: Wd[] }

export const LINES = (LY as { lines: Ln[] }).lines;
export const ALLW = LINES.flatMap((l) => l.words);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9'*+%]/g, '');

function find(q: string, nth: number): Wd {
  const k = norm(q);
  const m = ALLW.filter((w) => norm(w.w).startsWith(k));
  const w = m[nth];
  if (!w) throw new Error(`word not found in data/lyrics.json: "${q}" #${nth} (${m.length} matches)`);
  return w;
}
/** Start time (s) of the nth spoken word starting with q (case and punctuation ignored). */
export const WT = (q: string, nth = 0) => find(q, nth).start;
/** End time (s) of that word. */
export const WE = (q: string, nth = 0) => find(q, nth).end;
/** The line containing the nth word starting with q. */
export const LINE = (q: string, nth = 0) => { const w = find(q, nth); return LINES.find((l) => l.words.includes(w))!; };

// ---- retiming (see header)
let AO: number[] = [0], AN: number[] = [0];
/** Load data/lyrics.layout.json if present. Call (and await) in the scene's init() before building. */
export async function loadLayout() {
  try {
    const r = await fetch('data/lyrics.layout.json');
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return;
    const old = (await r.json()) as { lines: Ln[] };
    const ow = old.lines.flatMap((l) => l.words);
    if (ow.length !== ALLW.length) { console.warn(`lyrics.layout.json has ${ow.length} words, lyrics.json ${ALLW.length}: retiming off`); return; }
    AO = [0, ...ow.map((w) => w.start), ow[ow.length - 1]!.end];
    AN = [0, ...ALLW.map((w) => w.start), ALLW[ALLW.length - 1]!.end];
  } catch { /* no layout file: identity */ }
}
/** Map a time from the layout read onto the current read (identity without lyrics.layout.json). */
export function M(x: number): number {
  const n = AO.length;
  if (n < 2) return x;
  if (x >= AO[n - 1]!) return AN[n - 1]! + (x - AO[n - 1]!);
  let i = 0;
  while (i + 1 < n && AO[i + 1]! <= x) i++;
  const a = AO[i]!, b = AO[i + 1]!;
  return lerp(AN[i]!, AN[i + 1]!, b > a ? (x - a) / (b - a) : 0);
}
