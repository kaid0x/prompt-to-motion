// LUMEN — a calm, premium launch teaser (~19 s, fictional product). Different on purpose: no grid, no HUD,
// a soft gradient sky with bokeh, ONE hero object (a ring of seven days) and slow, almost still camera
// moves. Story told by the ring:
//   "small things"  → macro on a single glowing habit orb
//   "ring of light" → the seven day-tracks draw in
//   "each habit…"   → orbs fly in and fill the days, the core glow builds
//   "miss a day"    → Friday stays hollow and breathes in warm light: it waits
//   "Lumen."        → Friday fills, the ring completes, the wordmark lands inside it
import * as THREE from 'three';
import type { Frame } from '../engine/scene';
import { W, PW } from '../engine/gl';
import { HEX, LIN } from '../engine/palette';
import { ease, hash, lerp, prog, pulse, clamp, TAU } from '../engine/util';
import { Stage } from '../kit/stage';
import { K } from '../kit/camera';
import { WT, WE, LINE } from '../kit/words';
import { DISPLAY, MONO } from '../kit/overlay';
import { col, canvasTex } from '../kit/world';

const R = 2.0; // ring radius
const SEG = 7, GAP = 0.09; // radians of gap between days
const segMid = (i: number) => Math.PI / 2 - (i + 0.5) * (TAU / SEG); // Monday at the top, clockwise
const MISSED = 4; // Friday

const SKY_V = /* glsl */ `varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_F = /* glsl */ `
uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uGlow; uniform float uGlowK; varying vec3 vD;
void main() {
  vec3 c = mix(uBottom, uTop, smoothstep(-0.6, 0.7, vD.y));
  float toward = max(0.0, dot(vD, vec3(0.0, 0.05, -1.0)));      // a soft bloom of light behind the ring
  c += uGlow * pow(toward, 18.0) * uGlowK;
  gl_FragColor = vec4(c, 1.0);
}`;
const SEG_V = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SEG_F = /* glsl */ `
uniform float uFill; uniform vec3 uCol; uniform float uA; varying vec2 vUv;
void main() { if (vUv.x > uFill) discard; gl_FragColor = vec4(uCol * uA, 1.0); }`;
const BOKEH_V = /* glsl */ `
attribute float aSize; attribute float aPhase; uniform float uTime; uniform float uScale; varying float vA;
void main() {
  vec3 p = position + vec3(sin(uTime * 0.13 + aPhase) * 0.4, sin(uTime * 0.11 + aPhase * 2.0) * 0.3, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uScale * 220.0 / -mv.z;
  vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 0.5 + aPhase * 5.0));
  gl_Position = projectionMatrix * mv;
}`;
const BOKEH_F = /* glsl */ `
uniform vec3 uCol; uniform float uA; varying float vA;
void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.36, d) * (0.6 + 0.4 * smoothstep(0.3, 0.48, d)); gl_FragColor = vec4(uCol * a * vA * uA, a); }`;

interface Day { track: THREE.Mesh; fillU: { uFill: { value: number }; uCol: { value: THREE.Color }; uA: { value: number } }; tFill: number; label: THREE.Mesh }

export default class Lumen extends Stage {
  days: Day[] = [];
  orbs: { m: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t0: number; t1: number }[] = [];
  skyU = { uTop: { value: col('ink2', 1.1) }, uBottom: { value: col('ink') }, uGlow: { value: col('signal', 0.14) }, uGlowK: { value: 0 } };
  bokehU = { uTime: { value: 0 }, uScale: { value: PW / 1920 }, uCol: { value: col('ember', 0.55) }, uA: { value: 1 } };
  hero!: THREE.Mesh;

  build() {
    this.look = { bloom: 0.95, bloomThreshold: 0.7, bloomKnee: 0.6, bloomRadius: 0.9, halation: 0.04, vignette: 0.55, grain: 0.03, ca: 0.5 };
    this.hud = null;
    this.rig.handheld = 0.02;
    // sky
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.ShaderMaterial({ vertexShader: SKY_V, fragmentShader: SKY_F, uniforms: this.skyU, side: THREE.BackSide, depthWrite: false })));
    // bokeh: soft discs at many depths
    const N = 260, pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos.set([(hash(i, 1) - 0.5) * 26, (hash(i, 2) - 0.5) * 14, -2 - hash(i, 3) * 22], i * 3);
      size[i] = 0.08 + Math.pow(hash(i, 4), 3) * 0.5; ph[i] = hash(i, 5) * TAU;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    bg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    this.scene.add(new THREE.Points(bg, new THREE.ShaderMaterial({ vertexShader: BOKEH_V, fragmentShader: BOKEH_F, uniforms: this.bokehU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    // the seven days: a dim track, a fill that sweeps along it, and a day letter outside
    const arc = TAU / SEG - GAP;
    const fills = [WT('each'), WT('keep'), WT('glow'), WT('brighter'), WT('lumen', 1) + 0.15, WT('simply'), WT('waits')];
    'MTWTFSS'.split('').forEach((d, i) => {
      const start = segMid(i) + arc / 2; // the fill runs clockwise: from the segment's start angle downwards
      const track = new THREE.Mesh(new THREE.TorusGeometry(R, 0.035, 10, 64, arc), new THREE.MeshBasicMaterial({ color: col('graphite', 1.5), transparent: true }));
      track.rotation.z = start - arc; this.scene.add(track);
      const fillU = { uFill: { value: 0 }, uCol: { value: col('signal', 2.6) }, uA: { value: 1 } };
      const fill = new THREE.Mesh(new THREE.TorusGeometry(R, 0.062, 12, 96, arc), new THREE.ShaderMaterial({ vertexShader: SEG_V, fragmentShader: SEG_F, uniforms: fillU }));
      fill.rotation.z = start; fill.scale.y = -1; // mirror so uv.x grows clockwise from the segment start
      this.scene.add(fill);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: canvasTex(128, 128, (c) => {
        c.font = `64px "${MONO(400)}"`; c.fillStyle = HEX.ash; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(d, 64, 68);
      }) }));
      label.position.set(Math.cos(segMid(i)) * (R + 0.42), Math.sin(segMid(i)) * (R + 0.42), 0);
      this.scene.add(label);
      this.days.push({ track, fillU, tFill: fills[i]!, label });
    });
    // habit orbs: each flies in from the dark and lands on its day as it fills
    this.days.forEach((d, i) => {
      if (i === MISSED) return;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 3), new THREE.MeshBasicMaterial({ color: col('ember', 5) }));
      const a = hash(i, 9) * TAU;
      const from = new THREE.Vector3(Math.cos(a) * 7, Math.sin(a) * 4, -6 + hash(i, 8) * 3);
      const to = new THREE.Vector3(Math.cos(segMid(i) + (TAU / SEG - GAP) / 2) * R, Math.sin(segMid(i) + (TAU / SEG - GAP) / 2) * R, 0);
      this.scene.add(m);
      this.orbs.push({ m, from, to, t0: d.tFill - 0.75, t1: d.tFill });
    });
    // the hero orb of the opening macro shot
    this.hero = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 3), new THREE.MeshBasicMaterial({ color: col('ember', 2.6) }));
    this.scene.add(this.hero);
    this.buildCamera();
    this.buildType();
  }

  buildCamera() {
    const r = this.rig, L = ease.linear, IO = ease.inOutCubic;
    const top: [number, number, number] = [0, R + 0.9, 0];
    // macro on one orb, then a long slow pull back that reveals the ring
    r.add(K(0, 90, 2.6, R + 1.0, top, 0, 28), K(LINE('small').end + 0.2, 90, 2.2, R + 0.95, top, 0, 28, L));
    r.add(K(WT('lumen') + 0.4, 90, 11, 0.6, [0, 0.1, 0], 0, 30, IO), K(WT('miss') - 0.3, 92, 9.6, 0.4, [0, 0.05, 0], 0, 30, L));
    // a gentle lean towards the missed day while it waits
    r.add(K(WT('waits'), 95, 9.2, 0.25, [0.2, -0.15, 0], 0, 30, IO));
    // back to centre for the wordmark, then the slowest push
    r.add(K(WT('lumen', 1) + 0.3, 90, 9.6, 0.25, [0, 0, 0], 0, 30, IO), K(this.ctx.audio.duration, 90, 8.6, 0.2, [0, 0, 0], 0, 30, L));
  }

  buildType() {
    const u = this.ui, D = this.ctx.audio.duration, Y = 560, LOW = 840; // inside the ring once it exists, below the orb before
    const line = (s: string, t0: number, t1: number, size = 44, ck = 'bone', y = Y) => u.title([[s, ck]], W / 2, y, size, t0, t1, { align: 'center', fam: DISPLAY(300), track: 2, dur: 0.8 });
    line('Small things.', WT('small') - 0.05, LINE('small').end + 0.5, 52, 'bone', LOW);
    line('Every day.', WT('every') - 0.05, LINE('small').end + 0.5, 52, 'signal', LOW + 66);
    line("That's how habits are built.", WT("that's") - 0.05, LINE("that's").end + 0.45, 52, 'bone', LOW);
    line('A ring of light.', WT('ring') - 0.25, LINE('lumen').end + 0.45);
    line('Keep a habit. Watch it glow.', WT('keep') - 0.1, LINE('each').end + 0.45);
    line('Miss a day? It waits for you.', WT('miss') - 0.05, LINE('miss').end + 0.45, 44, 'acid');
    // the wordmark lands inside the ring
    const tL = WT('lumen', 1);
    u.title([['lumen', 'bone']], W / 2, 590, 170, tL - 0.05, D + 1, { align: 'center', fam: DISPLAY(300), track: 6, dur: 0.9 });
    u.pill('LAUNCHING MARCH 3', W / 2, 975, 24, WT('launching') - 0.05, D + 1, { align: 'center', col: 'signal' });
    this.captionsUntil = tL - 0.1;
  }

  update(t: number, _f: Frame) {
    const tL = WT('lumen', 1), tRing = WT('ring');
    this.bokehU.uTime.value = t;
    this.bokehU.uA.value = prog(t, 0, 1.5);
    // the sky and the core glow build with every kept day
    const kept = this.days.reduce((s, d, i) => s + (i === MISSED && t < tL ? 0 : prog(t, d.tFill, d.tFill + 0.6)), 0);
    this.skyU.uGlowK.value = 0.3 + 0.14 * kept + 0.6 * pulse(t, tL, 0.6);
    // tracks draw in on "ring of light", one day after another
    this.days.forEach((d, i) => {
      const tin = prog(t, WT('lumen') + i * 0.24, WT('lumen') + 0.7 + i * 0.24, ease.outCubic); // the tracks draw in, day by day, from "Lumen" to "ring"
      (d.track.material as THREE.MeshBasicMaterial).opacity = tin;
      (d.label.material as THREE.MeshBasicMaterial).opacity = tin * 0.9;
      d.track.scale.setScalar(lerp(0.92, 1, tin));
      d.fillU.uFill.value = prog(t, d.tFill, d.tFill + 0.55, ease.inOutCubic);
      d.fillU.uCol.value.copy(col('signal', 2.2 + 1.6 * pulse(t, d.tFill + 0.5, 0.35) + 1.2 * pulse(t, tL, 0.5)));
      if (i === MISSED) {
        // the missed day: hollow, breathing in warm light until it is kept at the end
        const wait = prog(t, WT('miss'), WT('miss') + 0.4) * (1 - prog(t, tL, tL + 0.3));
        const breathe = 0.5 + 0.5 * Math.sin((t - WT('miss')) * 3.2);
        (d.track.material as THREE.MeshBasicMaterial).color.copy(col('graphite', 1.5)).lerp(col('acid', 1.2 + 1.4 * breathe), wait);
      }
    });
    // orbs fly in along a curve and vanish into their day
    this.orbs.forEach((o) => {
      const k = prog(t, o.t0, o.t1, ease.inOutCubic);
      o.m.visible = t > o.t0 && t < o.t1 + 0.05;
      o.m.position.lerpVectors(o.from, o.to, k);
      o.m.position.y += Math.sin(k * Math.PI) * 0.8;
      o.m.scale.setScalar(1 + 0.6 * Math.sin(k * Math.PI));
    });
    // the opening orb hovers above Monday, then drops into the ring as it appears
    const k = prog(t, LINE('small').end + 0.4, WT('ring'), ease.inOutCubic);
    this.hero.position.set(0, R + 0.9 - k * 0.9 + Math.sin(t * 1.6) * 0.03 * (1 - k), 0);
    this.hero.visible = t < WT('ring') + 0.1;
    this.hero.scale.setScalar(1 + 0.15 * Math.sin(t * 2.4) + 0.4 * clamp(1 - k));
    void LIN;
  }
}
