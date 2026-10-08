// STARTER — the smallest complete video (~19 s): copy this file to start a new one.
//
//   projects/starter/script.json   the words (and which scene plays)       → pipeline/tts.py, align.py
//   projects/starter/brand.json    colours, fonts, handle/url for the HUD
//   app/src/scenes/starter.ts      this file: what happens on which word
//
// The pattern for every beat of a video:
//   1. an OBJECT does something on a word      (update(): prog(t, WT('written'), ...))
//   2. the CAMERA arrives on that word          (buildCamera(): K(WT('written'), ...))
//   3. TYPE says the idea in 2-5 words          (buildType(): this.ui.title(..., WT('written'), ...))
//   4. a PUNCH/FLASH/SFX lands the moment       (this.punches, sfx.json)
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W } from '../engine/gl';
import { ease, lerp, prog, pulse } from '../engine/util';
import { Stage } from '../kit/stage';
import { K, ST } from '../kit/camera';
import { WT, WE, LINE } from '../kit/words';
import { MONO } from '../kit/overlay';
import { ShardCore, RadarFloor, dust, col, env, holoCard, cardFace } from '../kit/world';

const CARD_A = [130, 90, 50]; // where the three cards stand on the ring (degrees)

export default class Starter extends Stage {
  core!: ShardCore;
  floor!: RadarFloor;
  dust!: THREE.Points;
  cards: { g: THREE.Group; mat: THREE.MeshBasicMaterial; frame: import('three/examples/jsm/lines/LineMaterial.js').LineMaterial; t: number }[] = [];

  build() {
    this.core = new ShardCore(this.scene);
    this.floor = new RadarFloor(this.scene);
    this.dust = dust(this.scene);
    // three holo cards, one per thing a word can cue
    const words: [string, string, string][] = [['CAMERA', 'moves on a word', 'CUE_01'], ['TYPE', 'lands on a word', 'CUE_02'], ['LIGHT', 'flares on a word', 'CUE_03']];
    words.forEach(([name, sub, id], i) => {
      const c = holoCard(2.1, 1.3, cardFace(name, sub, id, '[ CUE ]'), col('signal', 1.6));
      const p = ST(CARD_A[i]!, 4.0, 0.15);
      c.g.position.set(...p);
      c.g.lookAt(p[0] * 3, p[1], p[2] * 3);
      this.scene.add(c.g);
      this.cards.push({ ...c, t: WT(name.toLowerCase()) });
    });
    this.buildCamera();
    this.buildType();
  }

  buildCamera() {
    const Q = ease.inOutQuart, L = ease.linear;
    const r = this.rig;
    // hook: push in, arriving on "written"
    r.add(K(0, 95, 16, 0.6, [0, 0, 0], 0, 30), K(WT('written'), 85, 8.0, 0.4, [0, 0, 0], 0, 33, ease.outCubic));
    // code: orbit to a 3/4 view, subject on the right third so the type has the left
    r.add(K(WT('every') + 0.4, 40, 6.6, 1.0, [0, 0, 0], 1.7, 34, Q), K(LINE('every').end, 30, 6.2, 1.1, [0, 0, 0], 1.8, 34, L));
    // cue: wide on the cards, then track to each one as it is named (hold key, then move key)
    r.add(K(WT('narration') + 0.3, 90, 11.5, 2.2, [0, 0.1, 0], 0, 36, Q), K(WT('camera') - 0.5, 90, 10.8, 1.9, [0, 0.1, 0], 0, 36, L));
    this.cards.forEach((c, i) => {
      const p = ST(CARD_A[i]!, 4.0 * 0.92, 0.15);
      r.add(K(c.t + 0.15, CARD_A[i]! - 2, 7.3, 0.55, p, 0, 34, Q));
      r.add(K((this.cards[i + 1]?.t ?? WE('light') + 0.4) - 0.15, CARD_A[i]! - 4, 7.1, 0.5, p, 0, 34, L));
    });
    // how: crane up over the floor while the steps ping
    r.add(K(WT('write') + 0.4, 10, 4.0, 8.5, [0, -1.6, 0], 0, 40, Q), K(WT('render') + 0.6, -20, 4.2, 8.0, [0, -1.6, 0], 0, 40, L));
    // end: back to the front, wide
    r.add(K(WT('prompt') + 0.3, 90, 9.5, 0.9, [0, -0.4, 0], 0, 34, Q), K(this.ctx.audio.duration, 92, 11.5, 1.0, [0, -0.4, 0], 0, 34, L));
  }

  buildType() {
    const X = 132, u = this.ui, D = this.ctx.audio.duration;
    // hook
    const tEd = WT('edited'), tWr = WT('written');
    u.kicker('THIS VIDEO WAS NEVER', W / 2, 760, WT('this'), LINE('this').end + 0.4, { align: 'center', col: 'ash' });
    u.title([['EDITED.', 'ash']], W / 2, 860, 96, tEd - 0.05, tWr + 0.05, { align: 'center' });
    u.title([['WRITTEN.', 'signal']], W / 2, 860, 110, tWr - 0.02, LINE('this').end + 0.4, { align: 'center', track: 3 });
    this.punches.push([tWr, 0.035]);
    this.flashes.push([tWr, 0.18]);
    // code
    u.kicker('01 — EVERY FRAME IS CODE', X, 360, WT('every'), LINE('every').end + 0.35);
    u.title([['frame = ', 'bone'], ['f(t)', 'signal']], X, 480, 110, WT('code'), LINE('every').end + 0.35, { fam: MONO(700) });
    u.body('a pure function of time', X, 560, 40, WT('pure'), LINE('every').end + 0.35, { col: 'ash' });
    // cue
    u.kicker('02 — THE NARRATION IS THE TIMELINE', X, 170, WT('narration') - 0.1, WT('camera') + 0.1);
    // how: three steps, each on its word
    const steps: [string, string][] = [['SCRIPT', 'script'], ['VOICE', 'voice'], ['RENDER', 'render']];
    u.kicker('03 — HOW', X, 380, WT('write') - 0.1, LINE('write').end + 0.4);
    steps.forEach(([s, w], i) => {
      u.title([[`${i + 1}  `, 'signal'], [s, 'bone']], X, 500 + i * 110, 96, WT(w) - 0.05, LINE('write').end + 0.4, { track: 3 });
      this.punches.push([WT(w), 0.012]);
    });
    // end
    u.title([['PROMPT ', 'bone'], ['TO ', 'ash'], ['MOTION', 'signal']], W / 2, 560, 120, WT('prompt') - 0.05, D + 1, { align: 'center', track: 4 });
    u.kicker('GITHUB.COM/KAID0X/PROMPT-TO-MOTION', W / 2, 640, WE('motion') + 0.3, D + 1, { align: 'center', col: 'ash', bar: false });
    this.flashes.push([WT('motion'), 0.15]);
    this.hud = { from: 0.6, to: WT('prompt') - 0.3 };
    this.captionsUntil = WT('prompt') - 0.1;
  }

  update(t: number, f: Frame) {
    const tWr = WT('written'), tMo = WT('motion');
    const rms = f.a?.rms ?? 0;
    // the core assembles, cracks open on "written", reseals; blows apart on "motion" and fades out
    let ex = 1 - prog(t, 0.2, tWr - 0.2, ease.outQuart);
    ex = Math.max(ex, 0.55 * prog(t, tWr, tWr + 0.3, ease.outExpo) * (1 - prog(t, tWr + 0.6, tWr + 1.3, ease.inOutCubic)));
    ex = Math.max(ex, 1.2 * prog(t, tMo, tMo + 1.6, ease.outExpo));
    this.core.update(t, {
      explode: ex,
      glow: (2.2 + rms * 3 + 3 * pulse(t, tWr, 0.3)) * (1 - prog(t, tMo + 0.1, tMo + 0.6)),
      glowScale: 0.9 + rms * 0.35,
      fade: 1 - prog(t, tMo + 0.6, tMo + 2.2),
      wire: 1 + 1.5 * pulse(t, tWr, 0.3),
      ringsIn: [0, 1, 2].map((i) => prog(t, 0.6 + i * 0.3, 2.4 + i * 0.3)),
    });
    // the floor brightens for the top-down "how" shot; a ping on each step
    this.floor.update(t, 0.7 + 0.6 * env(t, WT('write'), LINE('write').end + 0.6, 0.6, 0.6));
    this.floor.ping(0, -2, 1, WT('script'));
    this.floor.ping(1, 0, 0, WT('voice'));
    this.floor.ping(2, 2, -1, WT('render'), true);
    this.floor.ping(3, 0, 0, tMo);
    this.dust.rotation.y = t * 0.02;
    // cards: fade in with the line, light up as each is named
    const t0 = WT('narration') - 0.2, t1 = LINE('narration').end + 0.6;
    this.cards.forEach((c, i) => {
      const v = env(t, t0 + i * 0.12, t1, 0.6, 0.5);
      const hot = prog(t, c.t - 0.1, c.t + 0.15) * (1 - 0.6 * prog(t, c.t + 1.0, c.t + 1.6));
      c.g.visible = v > 0.005;
      c.mat.opacity = v * (0.55 + 0.45 * hot);
      c.frame.opacity = v;
      c.frame.color.copy(col('signal', 0.6 + 3.4 * hot));
      c.g.scale.setScalar(lerp(0.6, 1, ease.outBack(prog(t, t0 + i * 0.12, t0 + i * 0.12 + 0.7))) * (1 + 0.06 * hot));
    });
  }
}
