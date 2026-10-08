// Stage: the base class for a 3D video plate. It owns the three.js scene, the camera rig, the 2D overlay,
// captions and the post settings; a subclass only builds things and moves them.
//
//   export default class MyVideo extends Stage {
//     build() { ...add objects to this.scene, camera keys to this.rig, type to this.ui... }
//     update(t, f) { ...move objects as a pure function of t... }
//   }
//
// Everything must be a deterministic function of t: the preview, stills and the chunked export all
// render frames out of order, so no state may accumulate between frames.
import * as THREE from 'three';
import { Scene, type Frame, type PostOverrides } from '../engine/scene';
import { Layer2D, makeRT, W, H, clearRT } from '../engine/gl';
import { LIN } from '../engine/palette';
import { prog, pulse } from '../engine/util';
import { CameraRig } from './camera';
import { Overlay, captions, hudFrame } from './overlay';
import { loadLayout } from './words';

export abstract class Stage extends Scene {
  /** 4x MSAA target for the 3D pass (thin lines and wireframes shimmer without it). */
  rt = makeRT(W, H, { samples: 4 });
  layer = new Layer2D();
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(34, W / H, 0.05, 200);
  rig = new CameraRig(this.cam);
  ui = new Overlay();
  /** [t, amount]: a quick zoom punch (0.01 subtle .. 0.04 big) on a hit. */
  punches: [number, number][] = [];
  /** [t, amount]: an additive white flash (0.1 .. 0.25). */
  flashes: [number, number][] = [];
  /** HUD frame visibility window and captions cut-off (s). Set in build(). */
  hud: { from: number; to: number } | null = { from: 0.6, to: Infinity };
  captionsUntil = Infinity;
  /** Post-processing look. Bloom picks up HDR > threshold; halation tints highlights warm. */
  look: PostOverrides = { bloom: 0.75, bloomThreshold: 0.78, bloomKnee: 0.5, bloomRadius: 0.8, halation: 0.1, vignette: 0.5, grain: 0.05, ca: 1.0 };

  abstract build(): void;
  abstract update(t: number, f: Frame): void;
  /** Per-frame post overrides on top of `look` (e.g. a chromatic-aberration spike on a glitch). */
  postAt(_t: number): PostOverrides { return {}; }

  override async init() {
    await loadLayout();
    this.build();
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const { renderer, comp } = this.ctx;
    const t = f.t;
    this.update(t, f);
    this.rig.at(t);
    clearRT(renderer, this.rt, LIN.ink, 1);
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.cam);
    clearRT(renderer, out, LIN.ink, 1);
    comp.draw(renderer, this.rt.texture, out, { mode: 'replace' });

    const L = this.layer; L.clear();
    const c = L.ctx;
    this.ui.draw(c, t);
    const D = this.ctx.audio.duration;
    if (this.hud) hudFrame(c, t, D, prog(t, this.hud.from, this.hud.from + 0.8) * (1 - prog(t, this.hud.to, this.hud.to + 0.7)));
    captions(c, t, { until: this.captionsUntil });
    comp.draw(renderer, L.upload(), out);

    let zoom = 1, flash = 0;
    for (const [tp, amt] of this.punches) zoom += amt * pulse(t, tp, 0.09);
    for (const [tp, amt] of this.flashes) flash += amt * pulse(t, tp, 0.08);
    const fade = Math.max(1 - prog(t, 0, 0.7), prog(t, D - 0.7, D));
    return { ...this.look, hud: 0, frame: 0, zoom, flash, fade, ...this.postAt(t) };
  }
}
