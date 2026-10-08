// BYTE NIGHT IN NUMBERS — a light, editorial data story (~24 s, fictional event). Different on purpose:
// paper-white palette, lit and shadowed 3D (MeshLambert + a soft shadow), a long-lens camera that DOLLIES down
// a street of stations (rig.relative = true) instead of orbiting, and condensed display numbers that roll up.
//
// Each stat is a station on the x axis that builds itself from the thing it counts:
//   S0 60 team tokens · S1 120 student cubes · S2 32 challenge slabs in 7 columns · S3 1,400 flags · S4 the photo finish
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Frame } from '../engine/scene';
import { W } from '../engine/gl';
import { HEX, rgba, type PaletteKey } from '../engine/palette';
import { font } from '../engine/type';
import { ease, hash, lerp, prog, pulse, clamp } from '../engine/util';
import { Stage } from '../kit/stage';
import { K, type V3 } from '../kit/camera';
import { WT, WE, LINE } from '../kit/words';
import { DISPLAY, MONO } from '../kit/overlay';
import { col, canvasTex } from '../kit/world';

const SX = [0, 14, 28, 42, 56]; // station centres on x (far enough apart that a neighbour never sits behind the type)
const DOTS_FRAG = /* glsl */ `
uniform vec3 uBg; uniform vec3 uDot; varying vec2 vP;
void main() {
  vec2 g = abs(fract(vP / 0.5) - 0.5) * 0.5;               // 0.5-unit dot grid
  float d = length(g);
  float dot = 1.0 - smoothstep(0.018, 0.018 + fwidth(d) * 1.5, d);
  float fade = exp(-length(vP - vec2(28.0, 0.0)) * 0.022);
  gl_FragColor = vec4(mix(uBg, uDot, dot * 0.55 * fade), 1.0);
}`;
const DOTS_VERT = /* glsl */ `varying vec2 vP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;

type Inst = { mesh: THREE.InstancedMesh; base: THREE.Vector3[]; t: number[] };

export default class ByteNight extends Stage {
  teams!: Inst;
  students!: Inst;
  slabs!: Inst;
  flags!: Inst;
  bars: THREE.Mesh[] = [];
  m = new THREE.Matrix4();
  q = new THREE.Quaternion();
  v = new THREE.Vector3();
  s = new THREE.Vector3();

  build() {
    // ---- look: a light frame must not bloom, so the threshold sits above paper white
    this.look = { bloom: 0.12, bloomThreshold: 1.6, bloomKnee: 0.3, bloomRadius: 0.6, halation: 0, vignette: 0.22, grain: 0.028, ca: 0.3 };
    this.rig.relative = true;
    this.rig.handheld = 0.03;
    const r = this.ctx.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // ---- floor: paper with a dot grid, plus a shadow-catcher on top
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShaderMaterial({ vertexShader: DOTS_VERT, fragmentShader: DOTS_FRAG, uniforms: { uBg: { value: col('ink') }, uDot: { value: col('graphite', 0.8) } } }));
    floor.rotation.x = -Math.PI / 2;
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.ShadowMaterial({ opacity: 0.16 }));
    catcher.rotation.x = -Math.PI / 2; catcher.position.y = 0.002; catcher.receiveShadow = true;
    this.scene.add(floor, catcher);
    // ---- light: soft sky fill + one key light with a shadow covering the whole street
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b2a4, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.25);
    key.position.set(SX[2]! - 9, 18, 12); key.target.position.set(SX[2]!, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -36, right: 36, top: 14, bottom: -14, near: 1, far: 70 });
    key.shadow.radius = 3;
    this.scene.add(key, key.target);

    const lam = (k: PaletteKey, s = 1) => new THREE.MeshLambertMaterial({ color: col(k, s) });
    // S0: 60 team tokens (10 x 6), they light up on "zero sleep"
    this.teams = this.grid(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 24), lam('ink2'), 10, 6, 0.48, SX[0]!, WT('sixty') - 0.1, WE('teams') + 0.2);
    // S1: 120 student cubes (12 x 10)
    this.students = this.grid(new THREE.BoxGeometry(0.28, 0.28, 0.28), lam('ink2'), 12, 10, 0.37, SX[1]!, WT('120') - 0.05, WT('students') + 0.4);
    // S2: 32 challenge slabs stacked in 7 category columns
    const heights = [6, 5, 4, 5, 4, 4, 4];
    const slabBase: V3[] = [], slabT: number[] = [];
    const t0 = WT('32') - 0.05, t1 = WT('categories') + 0.2;
    let k = 0;
    heights.forEach((h, c) => { for (let l = 0; l < h; l++) slabBase.push([SX[2]! + (c - 3) * 0.78, 0.11 + l * 0.24, 0]); });
    const order = slabBase.map((_, i) => i).sort((a, b) => slabBase[a]![1] - slabBase[b]![1] || slabBase[a]![0] - slabBase[b]![0]);
    order.forEach((i) => { slabT[i] = lerp(t0, t1, k++ / (slabBase.length - 1)); });
    this.slabs = this.inst(new THREE.BoxGeometry(0.62, 0.2, 0.62), lam('ink2'), slabBase, slabT);
    const ramp: PaletteKey[] = ['signal', 'acid', 'bone', 'ember', 'ash', 'blood', 'graphite'];
    let si = 0;
    heights.forEach((h, c) => { for (let l = 0; l < h; l++) this.slabs.mesh.setColorAt(si++, col(ramp[c]!)); });
    // S3: 1,400 flags in a sunflower spiral, planted from the centre out
    const pole = new THREE.BoxGeometry(0.012, 0.2, 0.012); pole.translate(0, 0.1, 0);
    const cloth = new THREE.BufferGeometry();
    cloth.setAttribute('position', new THREE.Float32BufferAttribute([0.006, 0.2, 0, 0.1, 0.165, 0, 0.006, 0.13, 0], 3));
    cloth.computeVertexNormals();
    const poleN = pole.toNonIndexed(); poleN.deleteAttribute('uv');
    const flagGeo = mergeGeometries([poleN, cloth])!;
    const NF = 1400, flagBase: V3[] = [], flagT: number[] = [];
    for (let i = 0; i < NF; i++) {
      const rr = Math.sqrt((i + 0.5) / NF) * 2.7, th = i * 2.399963;
      flagBase.push([SX[3]! + Math.cos(th) * rr, 0, Math.sin(th) * rr]);
      flagT.push(lerp(WT('1,400') - 0.05, WE('captured') + 0.1, Math.pow(i / NF, 0.85)));
    }
    this.flags = this.inst(flagGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), flagBase, flagT);
    for (let i = 0; i < NF; i++) this.flags.mesh.setColorAt(i, col(hash(i, 5) > 0.88 ? 'signal' : 'bone', hash(i, 5) > 0.88 ? 1 : 0.9));
    // S4: the photo finish, two bars and their name tags
    (['signal', 'graphite'] as PaletteKey[]).forEach((ck, i) => {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.9), lam(ck, ck === 'graphite' ? 1.25 : 1));
      bar.position.set(SX[4]! + (i ? 0.75 : -0.75), 0, 0);
      bar.castShadow = true;
      this.scene.add(bar); this.bars.push(bar);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(512, 128, (c) => {
        c.font = `56px "${MONO(600)}"`; c.fillStyle = i ? HEX.ash : HEX.signal; c.textAlign = 'center'; c.fillText(i ? 'SEGFAULT' : 'NULLPTR', 256, 84);
      }) }));
      tag.rotation.x = -Math.PI / 2; tag.position.set(bar.position.x, 0.01, 0.9);
      this.scene.add(tag);
    });
    this.buildCamera();
    this.buildType();
  }

  /** An instanced set with per-instance base positions and appear times. */
  inst(geo: THREE.BufferGeometry, mat: THREE.Material, base: V3[], t: number[]): Inst {
    const mesh = new THREE.InstancedMesh(geo, mat, base.length);
    mesh.castShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < base.length; i++) mesh.setColorAt(i, col('ink2'));
    this.scene.add(mesh);
    return { mesh, base: base.map((b) => new THREE.Vector3(...b)), t };
  }
  /** A cols x rows grid of instances around station x, appearing in a diagonal wave over [t0, t1]. */
  grid(geo: THREE.BufferGeometry, mat: THREE.Material, cols: number, rows: number, gap: number, x: number, t0: number, t1: number) {
    const geoH = (geo.boundingBox ?? (geo.computeBoundingBox(), geo.boundingBox!)).max.y;
    const base: V3[] = [], t: number[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      base.push([x + (c - (cols - 1) / 2) * gap, geoH, (r - (rows - 1) / 2) * gap]);
      t.push(lerp(t0, t1, (c + r) / (cols + rows - 2)) + hash(c, r, 3) * 0.06);
    }
    return this.inst(geo, mat, base, t);
  }

  buildCamera() {
    const Q = ease.inOutQuart, L = ease.linear, r = this.rig;
    const st = (i: number): V3 => [SX[i]!, 0.4, 0];
    // hook on the team tokens: a slow push
    r.add(K(0, 62, 19, 10, st(0), 2.2, 22), K(LINE('one').end, 70, 16, 8.5, st(0), 2.4, 22, L));
    // title: crane up and look down the street
    r.add(K(WT('byte') + 0.2, 40, 20, 13, [SX[1]! - 5, 0, 0], 1.0, 26, Q), K(WT('numbers'), 46, 19, 12, [SX[1]! - 4, 0, 0], 1.2, 26, L));
    // each stat: dolly to its station on the number word, drift while it builds
    // a > 90 puts the camera on the -x side looking down the street, so the station behind is out of shot
    const stat = (i: number, tIn: number, tOut: number, a = 100, rr = 15.5) => r.add(K(tIn, a, rr, 8.4, st(i), 2.4, 22, Q), K(tOut, a + 6, rr - 1, 7.6, st(i), 2.5, 22, L));
    stat(1, WT('120') + 0.15, WT('32') - 0.45);
    stat(2, WT('32') + 0.15, WT('1,400') - 0.45, 96);
    stat(3, WT('1,400') + 0.15, WT('and') - 0.45, 104, 13);
    // the photo finish: lower and closer, the bars tower over the lens
    r.add(K(WT('winning'), 104, 15, 4.2, [SX[4]!, 2.0, 0], 2.6, 24, Q), K(LINE('winning').end + 0.4, 110, 14.2, 3.8, [SX[4]!, 2.1, 0], 2.7, 24, L));
    // end: pull up and back to see the whole night at once
    r.add(K(WT('see') + 0.9, 80, 50, 30, [SX[2]! + 1, 7, 0], 0, 30, ease.inOutCubic), K(this.ctx.audio.duration, 84, 56, 33, [SX[2]! + 1, 7, 0], 0, 30, L));
  }

  buildType() {
    const X = 132, u = this.ui, D = this.ctx.audio.duration;
    // hook: three short lines stacking up
    const tEnd = LINE('one').end + 0.5;
    u.title([['ONE NIGHT.', 'bone']], X, 360, 118, WT('one') - 0.05, tEnd, { fam: DISPLAY(900) });
    u.title([['SIXTY TEAMS.', 'bone']], X, 480, 118, WT('sixty') - 0.05, tEnd, { fam: DISPLAY(900) });
    u.title([['ZERO SLEEP.', 'signal']], X, 600, 118, WT('zero') - 0.05, tEnd, { fam: DISPLAY(900) });
    this.punches.push([WT('zero'), 0.012]);
    // title
    u.kicker('IN NUMBERS', X, 420, WT('in') - 0.1, LINE('byte').end + 0.4);
    u.title([['BYTE NIGHT ', 'bone'], ['2026', 'signal']], X, 590, 170, WT('byte') - 0.05, LINE('byte').end + 0.4, { fam: DISPLAY(900) });
    // stat blocks: kicker, a number that rolls up on its word, a label
    const stat = (kick: string, value: number, label: string, tN: number, tDone: number, t1: number, extra?: [string, number]) => {
      u.kicker(kick, X, 330, tN - 0.15, t1);
      u.el(tN - 0.05, t1, (c, t, a) => {
        const v = Math.round(value * prog(t, tN, tDone, ease.outCubic));
        c.font = font(DISPLAY(900), 280); c.fillStyle = rgba('bone', a);
        c.fillText(v.toLocaleString('en-US'), X - 8, 600);
        c.font = font(DISPLAY(700), 64); c.fillStyle = rgba('ash', a * prog(t, tN + 0.2, tN + 0.6));
        c.fillText(label, X, 690);
      }, 0.1);
      if (extra) u.title([[extra[0], 'signal']], X, 780, 64, extra[1], t1, { fam: DISPLAY(700) });
      this.punches.push([tDone, 0.01]);
    };
    stat('01 — PEOPLE', 120, 'STUDENTS', WT('120'), WE('students'), WT('32') - 0.35);
    stat('02 — CHALLENGES', 32, 'CHALLENGES', WT('32'), WT('across'), WT('1,400') - 0.35, ['ACROSS 7 CATEGORIES', WT('7') - 0.05]);
    stat('03 — FLAGS', 1400, 'FLAGS CAPTURED', WT('1,400'), WE('captured'), WT('and') - 0.35);
    // the photo finish
    const tW = WT('winning'), t4 = WT('4');
    u.kicker('04 — THE FINISH', X, 330, WT('and') - 0.1, LINE('winning').end + 0.6);
    u.title([['ONE WINNER.', 'bone']], X, 470, 118, tW - 0.05, LINE('winning').end + 0.6, { fam: DISPLAY(900) });
    u.title([['BY ', 'bone'], ['4 POINTS.', 'signal']], X, 590, 118, t4 - 0.1, LINE('winning').end + 0.6, { fam: DISPLAY(900) });
    u.pill('+4', X + 6, 690, 28, t4 + 0.05, LINE('winning').end + 0.6, { col: 'signal' });
    this.punches.push([t4, 0.025]);
    this.flashes.push([t4, 0.06]);
    // end
    u.title([['SEE YOU ', 'bone'], ['NEXT YEAR.', 'signal']], W / 2, 340, 150, WT('see') - 0.05, D + 1, { align: 'center', fam: DISPLAY(900) });
    u.kicker('BYTE NIGHT 2027 · BYTENIGHT.EXAMPLE', W / 2, 420, WE('year') + 0.3, D + 1, { align: 'center', col: 'ash', bar: false });
    this.hud = { from: 0.6, to: WT('see') };
    this.captionsUntil = WT('see') - 0.1;
  }

  /** Pose every instance: rise in with a little overshoot at its time. */
  pose(I: Inst, t: number, o: { drop?: number; pop?: boolean; tint?: (i: number, k: number) => THREE.Color | null } = {}) {
    const { mesh, base } = I;
    for (let i = 0; i < base.length; i++) {
      const k = prog(t, I.t[i]!, I.t[i]! + 0.32, ease.outBack);
      const b = base[i]!;
      this.v.set(b.x, b.y + (o.drop ?? 0) * (1 - clamp(k)) , b.z);
      const sc = o.pop ? Math.max(0.0001, k) : Math.max(0.0001, Math.min(1, k * 3));
      this.s.set(sc, sc, sc);
      this.m.compose(this.v, this.q, this.s);
      mesh.setMatrixAt(i, this.m);
      const c = o.tint?.(i, k);
      if (c) mesh.setColorAt(i, c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (o.tint && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  update(t: number, _f: Frame) {
    const tZero = WT('zero');
    // teams: pop in; on "zero sleep" a wave turns them on
    this.pose(this.teams, t, { pop: true, tint: (i, _k) => {
      const c = i % 10, r = Math.floor(i / 10);
      const on = prog(t, tZero + (c + r) * 0.03, tZero + (c + r) * 0.03 + 0.15);
      return col('ink2').lerp(col('signal'), on);
    } });
    // students: rise out of the floor in a wave, every ninth one in the accent
    this.pose(this.students, t, { drop: -0.45, tint: (i, k) => (i % 9 === 4 ? col('ink2').lerp(col('acid'), clamp(k)) : null) });
    // challenge slabs drop onto their stacks
    this.pose(this.slabs, t, { drop: 1.6 });
    // flags plant themselves from the centre out
    this.pose(this.flags, t, { pop: true });
    // the photo finish: SEGFAULT leads, NULLPTR overtakes and wins by 4
    const tR = WT('and') - 0.1, tW = WT('4');
    this.bars.forEach((bar, i) => {
      const k = prog(t, tR, tW, ease.inOutCubic);
      const race = i ? 3.86 * Math.min(1, k * 1.08) : 4.0 * Math.pow(k, 1.25);
      const h = Math.max(0.001, race + (i ? 0 : 0.12 * pulse(t, tW, 0.15)));
      bar.scale.y = h; bar.position.y = h / 2;
    });
  }
}
