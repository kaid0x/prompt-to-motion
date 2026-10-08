import { hexToLinear } from './util';
import BRAND from '@root/brand.json';

// The palette: nine named roles. Defaults are a dark "terminal" look; each project overrides any of
// them in its brand.json ("colors": { "signal": "#FF4044", ... }), so one engine serves every brand.
const DEFAULTS = {
  ink: '#0A0D12', // background
  ink2: '#12161F', // raised surfaces (cards, panels)
  graphite: '#2C3645', // lines, quiet structure
  ash: '#8A94A2', // secondary text
  bone: '#E7EAEF', // primary text
  signal: '#FF4044', // the accent: one colour that means "look here"
  ember: '#FF8A8C', // hot core of accent highlights
  blood: '#C8202B', // deep accent
  acid: '#3DD68C', // rare second accent (status, success)
};

export const HEX = { ...DEFAULTS, ...((BRAND as { colors?: Record<string, string> }).colors ?? {}) } as Record<keyof typeof DEFAULTS, string>;

export type PaletteKey = keyof typeof DEFAULTS;

/** Linear RGB triplets for GL uniforms. */
export const LIN: Record<PaletteKey, [number, number, number]> = Object.fromEntries(
  Object.entries(HEX).map(([k, v]) => [k, hexToLinear(v)]),
) as Record<PaletteKey, [number, number, number]>;

/** CSS rgba() for Canvas2D. Accepts a palette key or a #hex. */
export function rgba(key: PaletteKey | string, a = 1): string {
  const hex = (HEX as Record<string, string>)[key] ?? key;
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
