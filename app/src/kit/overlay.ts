// The 2D type layer over the 3D world: kickers, display titles, body lines, pills, terminals, the HUD
// frame and burned-in captions. Each element lives in [t0, t1] with a fade in/out and draws itself as a
// pure function of t. Layout is in 1920x1080 logical px at every output scale.
//
// Safe areas (keep type out of these and it never collides):
//  - captions: y > 940 (bottom band)        - HUD: 48 px margin, top text at y ~ 82
//  - when the subject sits on the right third (camera sx > 0), type lives in x 120..900
import { W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { font, measure } from '../engine/type';
import { clamp, ease, hash, lerp, prog, TAU } from '../engine/util';
import BRAND from '@root/brand.json';
import { LINES } from './words';

type Ctx = CanvasRenderingContext2D;
const B = BRAND as { fonts?: { display?: string; mono?: string; body?: string }; name?: string; handle?: string; url?: string };
/** Font families (prefix-weight, see engine/type.ts for what is loaded). */
export const DISPLAY = (wt = 700) => `${B.fonts?.display ?? 'Chakra'}-${wt}`;
export const MONO = (wt = 400) => `${B.fonts?.mono ?? 'JBM'}-${wt}`;
export const BODY = (wt = 400) => `${B.fonts?.body ?? 'PlexSans'}-${wt}`;

const GLITCH = '!<>-_\\/[]{}=+*^?#01ABCDEFxX$%';
/** Text decoding out of noise: chars reveal left to right at cps, the next few scramble. */
export function decode(s: string, t: number, t0: number, cps = 40, tail = 4) {
  const n = Math.floor((t - t0) * cps);
  if (n < 0) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i < n) out += s[i];
    else if (i < n + tail) out += s[i] === ' ' ? ' ' : GLITCH[Math.floor(hash(i, Math.floor(t * 30), 5) * GLITCH.length)];
    else break;
  }
  return out;
}

export interface El { t0: number; t1: number; fi: number; fo: number; draw: (c: Ctx, t: number, a: number) => void }
/** [text, palette key] runs: one title can mix colours, e.g. [['HASEEB ASH','bone'],['FAQ','signal']]. */
export type Runs = [string, string][];

export class Overlay {
  els: El[] = [];

  /** A custom element: draw(c, t, a) with a = fade alpha. */
  el(t0: number, t1: number, draw: El['draw'], fi = 0.35, fo = 0.4) { this.els.push({ t0, t1, fi, fo, draw }); return this; }

  /** Small tracked mono label that decodes in, with an accent bar. The section marker: "02 — AI SECURITY". */
  kicker(s: string, x: number, y: number, t0: number, t1: number, o: { size?: number; col?: string; align?: 'left' | 'center'; bar?: boolean } = {}) {
    const size = o.size ?? 22, tr = size * 0.22, bx = o.bar === false ? 0 : 28;
    const x0 = o.align === 'center' ? x - (measure(s, MONO(600), size, tr) + bx) / 2 : x;
    return this.el(t0, t1, (c, t, a) => {
      c.font = font(MONO(600), size); c.letterSpacing = `${tr}px`;
      c.fillStyle = rgba(o.col ?? 'signal', a);
      if (bx) { const k = prog(t, t0, t0 + 0.3, ease.outCubic); c.fillRect(x0, y - size * 0.42, 16 * k, 3); }
      c.fillText(decode(s, t, t0 + 0.08, 48), x0 + bx, y);
      c.letterSpacing = '0px';
    }, 0.15);
  }

  /** Display type rising out of a mask. */
  title(runs: Runs, x: number, y: number, size: number, t0: number, t1: number, o: { fam?: string; align?: 'left' | 'center'; dur?: number; track?: number } = {}) {
    const fam = o.fam ?? DISPLAY(700), dur = o.dur ?? 0.55, tr = o.track ?? 0;
    return this.el(t0, t1, (c, t, a) => {
      const k = prog(t, t0, t0 + dur, ease.outQuart);
      c.font = font(fam, size); c.letterSpacing = `${tr}px`;
      const wTot = runs.reduce((s, [p]) => s + c.measureText(p).width, 0);
      let xx = o.align === 'center' ? x - wTot / 2 : x;
      c.save();
      c.beginPath(); c.rect(0, y - size * 1.05, W, size * 1.32); c.clip();
      const dy = (1 - k) * size * 1.1;
      for (const [p, ck] of runs) { c.fillStyle = rgba(ck, a); c.fillText(p, xx, y + dy); xx += c.measureText(p).width; }
      c.restore();
      c.letterSpacing = '0px';
    }, 0.01);
  }

  /** A body line that fades and lifts in. */
  body(s: string, x: number, y: number, size: number, t0: number, t1: number, o: { fam?: string; col?: string; align?: CanvasTextAlign; a?: number } = {}) {
    return this.el(t0, t1, (c, t, a) => {
      const k = prog(t, t0, t0 + 0.45, ease.outCubic);
      c.font = font(o.fam ?? BODY(400), size); c.textAlign = o.align ?? 'left';
      c.fillStyle = rgba(o.col ?? 'bone', a * k * (o.a ?? 1));
      c.fillText(s, x, y + (1 - k) * 14);
      c.textAlign = 'left';
    }, 0.01);
  }

  /** A status pill with a pulsing dot ("OPEN TO INTERNSHIPS"). */
  pill(s: string, x: number, y: number, size: number, t0: number, t1: number, o: { align?: 'left' | 'center'; col?: string } = {}) {
    const ck = o.col ?? 'acid';
    return this.el(t0, t1, (c, t, a) => {
      const k = prog(t, t0, t0 + 0.45, ease.outBack);
      c.font = font(MONO(600), size); c.letterSpacing = `${size * 0.16}px`;
      const tw = c.measureText(s).width, h = size * 2, w = tw + size * 3.2;
      const x0 = o.align === 'center' ? x - w / 2 : x;
      c.save(); c.translate(x0 + w / 2, y); c.scale(lerp(0.85, 1, k), lerp(0.85, 1, k)); c.translate(-w / 2, 0);
      c.fillStyle = rgba('ink', 0.88 * a); c.beginPath(); c.roundRect(0, -h / 2, w, h, h / 2); c.fill();
      c.fillStyle = rgba(ck, 0.14 * a); c.strokeStyle = rgba(ck, 0.85 * a); c.lineWidth = 2;
      c.beginPath(); c.roundRect(0, -h / 2, w, h, h / 2); c.fill(); c.stroke();
      c.fillStyle = rgba(ck, a * (0.55 + 0.45 * Math.cos(t * 5))); c.beginPath(); c.arc(size * 1.1, 0, size * 0.32, 0, TAU); c.fill();
      c.fillStyle = rgba(ck, a); c.textBaseline = 'middle'; c.fillText(s, size * 2, 1);
      c.textBaseline = 'alphabetic'; c.restore(); c.letterSpacing = '0px';
    }, 0.01);
  }

  /** A terminal window that types its lines, each at its own time. lines: [text, t, colour]. */
  terminal(x: number, y: number, w: number, h: number, title: string, lines: [string, number, string][], t0: number, t1: number, size = 32) {
    return this.el(t0, t1, (c, t, a) => {
      const k = prog(t, t0, t0 + 0.45, ease.outCubic);
      c.fillStyle = rgba('ink', 0.86 * a); c.strokeStyle = rgba('graphite', a); c.lineWidth = 2;
      c.beginPath(); c.roundRect(x, y, w, h * k, 10); c.fill(); c.stroke();
      c.fillStyle = rgba('ink2', a); c.beginPath(); c.roundRect(x, y, w, 44, [10, 10, 0, 0]); c.fill();
      ['signal', '#F5A524', 'acid'].forEach((cc, i) => { c.fillStyle = rgba(cc, a * 0.9); c.beginPath(); c.arc(x + 26 + i * 22, y + 22, 6.5, 0, TAU); c.fill(); });
      c.font = font(MONO(400), 18); c.fillStyle = rgba('ash', a); c.textAlign = 'center'; c.fillText(title, x + w / 2, y + 28); c.textAlign = 'left';
      if (k < 1) return;
      c.font = font(MONO(400), size);
      let last = -1;
      lines.forEach(([s, tl, cc], i) => {
        if (t < tl) return;
        const n = Math.min(s.length, Math.floor((t - tl) * 42));
        c.fillStyle = rgba(cc, a);
        c.fillText(s.slice(0, n), x + 36, y + 104 + i * size * 1.8);
        last = i;
      });
      if (last < 0) return;
      const [s, tl] = lines[last]!;
      const n = Math.min(s.length, Math.floor((t - tl) * 42));
      if (Math.floor(t * 2.5) % 2 === 0) { c.fillStyle = rgba('bone', a * 0.9); c.fillRect(x + 36 + measure(s.slice(0, n), MONO(400), size) + 6, y + 104 + last * size * 1.8 - size * 0.8, size * 0.5, size); }
    }, 0.2, 0.4);
  }

  /** Draw every live element. */
  draw(c: Ctx, t: number) {
    for (const e of this.els) {
      if (t < e.t0 || t > e.t1) continue;
      const a = Math.min(prog(t, e.t0, e.t0 + e.fi), 1 - prog(t, e.t1 - e.fo, e.t1));
      if (a <= 0.003) continue;
      c.save(); e.draw(c, t, a); c.restore();
    }
  }
}

/** Corner brackets, brand tag, a REC timecode and a progress hairline. a: 0..1 opacity. */
export function hudFrame(c: Ctx, t: number, duration: number, a: number) {
  if (a <= 0) return;
  const m = 48, L = 34;
  c.strokeStyle = rgba('ash', 0.55 * a); c.lineWidth = 2;
  c.beginPath();
  c.moveTo(m, m + L); c.lineTo(m, m); c.lineTo(m + L, m);
  c.moveTo(W - m - L, m); c.lineTo(W - m, m); c.lineTo(W - m, m + L);
  c.moveTo(W - m, H - m - L); c.lineTo(W - m, H - m); c.lineTo(W - m - L, H - m);
  c.moveTo(m + L, H - m); c.lineTo(m, H - m); c.lineTo(m, H - m - L);
  c.stroke();
  c.font = font(MONO(600), 16); c.letterSpacing = '3px';
  const tag = B.handle ? `[${B.handle.toUpperCase()}]` : '';
  c.fillStyle = rgba('signal', a); c.fillText(tag, m + 26, m + 34);
  c.fillStyle = rgba('ash', a * 0.9); c.fillText((B.url ?? '').toUpperCase(), m + 26 + (tag ? measure(tag, MONO(600), 16, 3) + 14 : 0), m + 34);
  c.textAlign = 'right';
  const tc = `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}`;
  c.fillStyle = rgba('ash', a * 0.9); c.fillText(tc, W - m - 26, m + 34);
  c.fillStyle = rgba('signal', a * (Math.floor(t * 1.6) % 2 ? 1 : 0.35)); c.beginPath(); c.arc(W - m - 26 - measure(tc, MONO(600), 16, 3) - 16, m + 28, 5, 0, TAU); c.fill();
  c.textAlign = 'left'; c.letterSpacing = '0px';
  c.fillStyle = rgba('graphite', a); c.fillRect(m, H - m + 14, W - 2 * m, 2);
  c.fillStyle = rgba('signal', a); c.fillRect(m, H - m + 14, (W - 2 * m) * clamp(t / duration), 2);
}

/**
 * Burned-in captions: the current line, each word lighting up as it is spoken. Most social video autoplays
 * muted; captions are what keeps a muted viewer watching. Hidden after `until`.
 */
export function captions(c: Ctx, t: number, o: { until?: number; size?: number; maxW?: number } = {}) {
  const ln = LINES.find((l) => t >= l.start - 0.15 && t <= l.end + 0.35);
  if (!ln || t >= (o.until ?? Infinity)) return;
  const ca = prog(t, ln.start - 0.15, ln.start + 0.1) * (1 - prog(t, ln.end + 0.15, ln.end + 0.35));
  const size = o.size ?? 28, fam = BODY(500), maxW = o.maxW ?? 1300, lh = size * 1.43;
  c.font = font(fam, size);
  const sp = c.measureText(' ').width;
  const ws = ln.words.map((w) => ({ w, wd: c.measureText(w.w).width }));
  const rows: typeof ws[] = [[]];
  let rw = 0;
  for (const x of ws) { if (rw + x.wd > maxW && rows[rows.length - 1]!.length) { rows.push([]); rw = 0; } rows[rows.length - 1]!.push(x); rw += x.wd + sp; }
  const y0 = H - 92 - (rows.length - 1) * lh;
  rows.forEach((row, r) => {
    const wTot = row.reduce((s, x) => s + x.wd, 0) + sp * (row.length - 1);
    let x0 = W / 2 - wTot / 2;
    const y = y0 + r * lh;
    c.fillStyle = rgba('ink', 0.55 * ca); c.fillRect(x0 - 14, y - size * 1.07, wTot + 28, lh);
    for (const x of row) {
      const on = t >= x.w.start - 0.02;
      c.fillStyle = rgba(on ? 'bone' : 'ash', ca * (on ? 0.96 : 0.5));
      c.fillText(x.w.w, x0, y);
      x0 += x.wd + sp;
    }
  });
}
