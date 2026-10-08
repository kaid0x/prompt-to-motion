// 3D building blocks for the three.js world: the shattering core, the radar floor, drifting dust, holo
// cards, wide lines and colour helpers. All of it is driven by t from the scene's render(); nothing here
// keeps time on its own.
//
// HDR: the scene renders into a half-float target and the post bloom picks up anything brighter than ~0.8,
// so `col('signal', 2.5)` (a colour times 2.5) GLOWS while `col('signal', 0.8)` just sits there. Use
// intensity, not size, to make something read as "hot".
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { PW, PH } from '../engine/gl';
import { HEX, LIN, type PaletteKey } from '../engine/palette';
import { ease, hash, prog, TAU } from '../engine/util';

type Ctx = CanvasRenderingContext2D;

/** A palette colour in linear light, times an HDR intensity. */
export const col = (k: PaletteKey, s = 1) => new THREE.Color().setRGB(LIN[k][0] * s, LIN[k][1] * s, LIN[k][2] * s, THREE.LinearSRGBColorSpace);
/** 0..1 visibility envelope: fades in over fi after a, out over fo before b. */
export const env = (t: number, a: number, b: number, fi = 0.4, fo = 0.4) => Math.min(prog(t, a, a + fi, ease.outCubic), 1 - prog(t, b - fo, b, ease.inCubic));

/** A canvas-drawn texture (cards, labels, paper). Drawn once at init: fonts are loaded by then. */
export function canvasTex(w: number, h: number, draw: (c: Ctx, w: number, h: number) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!, w, h);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  tx.anisotropy = 4;
  tx.minFilter = THREE.LinearMipmapLinearFilter;
  return tx;
}
/** Corner brackets (the "case file" frame) on a 2D canvas. */
export function brackets(c: Ctx, x: number, y: number, w: number, h: number, L: number, color: string, lw = 3) {
  c.strokeStyle = color; c.lineWidth = lw; c.beginPath();
  c.moveTo(x, y + L); c.lineTo(x, y); c.lineTo(x + L, y);
  c.moveTo(x + w - L, y); c.lineTo(x + w, y); c.lineTo(x + w, y + L);
  c.moveTo(x + w, y + h - L); c.lineTo(x + w, y + h); c.lineTo(x + w - L, y + h);
  c.moveTo(x + L, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - L);
  c.stroke();
}

/** Screen-space wide lines (WebGL lines are always 1 px). width in output px. */
export function lineMat(color: THREE.Color, width: number, opacity = 1) {
  const m = new LineMaterial({ linewidth: width, transparent: true, opacity, depthWrite: false, worldUnits: false });
  m.color.copy(color);
  m.resolution.set(PW, PH);
  return m;
}
/** Line segments from a flat [x0,y0,z0, x1,y1,z1, ...] list. */
export function segments(pts: number[], m: LineMaterial) {
  const g = new LineSegmentsGeometry();
  g.setPositions(pts);
  const l = new LineSegments2(g, m);
  l.computeLineDistances();
  return l;
}

/**
 * A flat holo card: a canvas texture on a plane with a wide-line frame you can light up. Front side only
 * (backs of cards seen from behind read as mirrored text).
 */
export function holoCard(w: number, h: number, draw: (c: Ctx, w: number, h: number) => void, frameCol: THREE.Color) {
  const px = 1024, ph = Math.round((px * h) / w);
  const mat = new THREE.MeshBasicMaterial({ map: canvasTex(px, ph, draw), transparent: true, depthWrite: false, side: THREE.FrontSide });
  const frame = lineMat(frameCol, 2.2);
  const x = w / 2, y = h / 2;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat), segments([-x, -y, 0, x, -y, 0, x, -y, 0, x, y, 0, x, y, 0, -x, y, 0, -x, y, 0, -x, -y, 0], frame));
  return { g, mat, frame };
}
/** The default holo card face: id label, big name, a "> sub" line and a progress bar. */
export function cardFace(name: string, sub: string, id: string, tag = '[ ARSENAL ]', display = 'Chakra-700', mono = 'JBM') {
  return (c: Ctx, w: number, h: number) => {
    c.fillStyle = 'rgba(18,22,31,0.92)'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(0, 0, w, 86);
    c.font = `30px "${mono}-600"`; c.letterSpacing = '6px'; c.fillStyle = HEX.signal;
    c.fillText(id, 56, 58);
    c.textAlign = 'right'; c.fillStyle = HEX.ash; c.fillText(tag, w - 56, 58); c.textAlign = 'left';
    c.letterSpacing = '2px';
    let fs = 132; c.font = `${fs}px "${display}"`;
    while (c.measureText(name).width > w - 112) { fs -= 4; c.font = `${fs}px "${display}"`; }
    c.fillStyle = HEX.bone; c.fillText(name, 56, h * 0.52);
    c.font = `40px "${mono}-400"`; c.letterSpacing = '1px'; c.fillStyle = HEX.ash;
    c.fillText(`> ${sub}`, 56, h * 0.68);
    c.fillStyle = HEX.signal; c.fillRect(56, h * 0.79, 220, 8);
    c.fillStyle = 'rgba(138,148,162,0.35)'; c.fillRect(296, h * 0.79, w - 352, 8);
    brackets(c, 18, 18, w - 36, h - 36, 50, HEX.signal, 5);
  };
}

// ------------------------------------------------------------ the shattering core
const SHARD_VERT = /* glsl */ `
attribute vec3 aCenter; attribute float aRand;
uniform float uExplode; uniform float uTime; uniform float uJitter;
varying vec3 vN; varying vec3 vView; varying float vR;
vec3 rot(vec3 p, vec3 ax, float a) { return p * cos(a) + cross(ax, p) * sin(a) + ax * dot(ax, p) * (1.0 - cos(a)); }
void main() {
  vec3 c = aCenter; vec3 dir = normalize(c);
  float j = uJitter * step(0.55, fract(sin(aRand * 91.7 + floor(uTime * 18.0)) * 4375.5));
  float e = uExplode * (0.55 + aRand * 0.9) + j * 0.35;
  vec3 ax = normalize(cross(dir, vec3(0.3, 1.0, 0.1)));
  vec3 p = rot(position - c, ax, e * (1.5 + aRand * 2.5)) * (1.0 - 0.25 * clamp(e, 0.0, 1.0));
  p += c + dir * e * 2.4;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = -mv.xyz; vN = normalize(normalMatrix * rot(normal, ax, e * (1.5 + aRand * 2.5))); vR = aRand;
  gl_Position = projectionMatrix * mv;
}`;
const SHARD_SOLID = /* glsl */ `
uniform vec3 uBase; uniform vec3 uRim; uniform float uA;
varying vec3 vN; varying vec3 vView; varying float vR;
void main() {
  vec3 n = normalize(vN); vec3 v = normalize(vView);
  float ndl = clamp(dot(n, normalize(vec3(0.4, 0.8, 0.5))), 0.0, 1.0);
  float fr = pow(1.0 - abs(dot(n, v)), 2.5);
  vec3 c = uBase * (0.35 + 0.9 * ndl) + uRim * fr + uBase * vR * 0.15;
  gl_FragColor = vec4(c * uA, 1.0);
}`;
const SHARD_WIRE = /* glsl */ `
uniform vec3 uCol; uniform float uA;
void main() { gl_FragColor = vec4(uCol * uA, 1.0); }`;

/**
 * An icosahedron of flat-shaded shards with glowing edges, an inner light, a wire lattice and guard rings.
 * explode 0 = whole, ~0.6 = cracked open, 1.2+ = blown apart. jitter > 0 glitches random shards.
 * rings break apart (two half-arcs each) with ringBreak 0..1.
 */
export class ShardCore {
  group = new THREE.Group();
  shardU = { uExplode: { value: 1 }, uTime: { value: 0 }, uJitter: { value: 0 } };
  solidU = { uBase: { value: col('ink2', 1.4) }, uRim: { value: col('signal', 0.9) }, uA: { value: 1 } };
  wireU = { uCol: { value: col('signal', 2.2) }, uA: { value: 1 } };
  glow: THREE.Mesh;
  lattice: THREE.Mesh;
  rings: { a: THREE.Mesh; b: THREE.Mesh; g: THREE.Group; sp: number; mat: THREE.MeshBasicMaterial }[] = [];

  constructor(scene: THREE.Scene, radius = 1.15) {
    const geo = new THREE.IcosahedronGeometry(radius, 1);
    const pos = geo.getAttribute('position');
    const cen = new Float32Array(pos.count * 3), rnd = new Float32Array(pos.count);
    for (let f = 0; f < pos.count / 3; f++) {
      const c = [0, 1, 2].map((ax) => ([0, 1, 2].reduce((s, k) => s + pos.getComponent(3 * f + k, ax), 0)) / 3);
      const r = hash(f, 11);
      for (let k = 0; k < 3; k++) { cen.set(c, (3 * f + k) * 3); rnd[3 * f + k] = r; }
    }
    geo.setAttribute('aCenter', new THREE.BufferAttribute(cen, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    geo.computeVertexNormals();
    const solid = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: SHARD_VERT, fragmentShader: SHARD_SOLID, uniforms: { ...this.shardU, ...this.solidU }, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    const wire = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: SHARD_VERT, fragmentShader: SHARD_WIRE, uniforms: { ...this.shardU, ...this.wireU }, wireframe: true }));
    this.glow = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 0.365, 3), new THREE.MeshBasicMaterial({ color: col('signal', 3) }));
    this.lattice = new THREE.Mesh(new THREE.IcosahedronGeometry(radius * 1.7, 2), new THREE.MeshBasicMaterial({ color: col('ash', 0.22), wireframe: true, transparent: true, depthWrite: false }));
    this.group.add(solid, wire, this.glow, this.lattice);
    scene.add(this.group);
    const defs: [number, number, number, PaletteKey, number][] = [[2.35, 70, 10, 'ash', 0.45], [2.75, 100, -25, 'signal', 1.2], [3.1, 60, 40, 'ash', 0.3]];
    defs.forEach(([R, rx, rz, ck, s], i) => {
      const mat = new THREE.MeshBasicMaterial({ color: col(ck, s), transparent: true, depthWrite: false });
      const a = new THREE.Mesh(new THREE.TorusGeometry(R, 0.012, 6, 160, Math.PI), mat);
      const b = new THREE.Mesh(new THREE.TorusGeometry(R, 0.012, 6, 160, Math.PI), mat);
      b.rotation.z = Math.PI;
      const g = new THREE.Group(); g.add(a, b);
      g.rotation.set((rx * Math.PI) / 180, 0, (rz * Math.PI) / 180);
      scene.add(g);
      this.rings.push({ a, b, g, sp: (i % 2 ? -1 : 1) * (0.12 + i * 0.05), mat });
    });
  }

  /**
   * explode/jitter: see class doc. glow: inner light intensity (2-3 idle, 6+ for a hit). fade: 0..1 overall.
   * ringBreak 0..1, ringsIn 0..1 (rings fade in at the start), latticeA: lattice opacity.
   */
  update(t: number, o: { explode: number; jitter?: number; glow?: number; glowScale?: number; fade?: number; wire?: number; ringBreak?: number; ringsIn?: number[]; latticeA?: number }) {
    const fade = o.fade ?? 1;
    this.shardU.uExplode.value = o.explode;
    this.shardU.uTime.value = t;
    this.shardU.uJitter.value = o.jitter ?? 0;
    this.solidU.uA.value = fade;
    this.wireU.uA.value = fade * (o.wire ?? 1);
    this.group.rotation.set(0.25 + t * 0.05, t * 0.16, 0.1);
    this.lattice.rotation.set(-t * 0.03, -t * 0.09, 0);
    (this.lattice.material as THREE.MeshBasicMaterial).opacity = o.latticeA ?? 1;
    this.glow.scale.setScalar(o.glowScale ?? 1);
    (this.glow.material as THREE.MeshBasicMaterial).color.copy(col('signal', o.glow ?? 2.4));
    this.glow.visible = fade > 0.01;
    const brk = o.ringBreak ?? 0;
    this.rings.forEach((R, i) => {
      R.g.rotation.y = t * R.sp + i;
      R.a.position.set(0, brk * (0.9 + i * 0.3), 0); R.b.position.set(0, -brk * (0.9 + i * 0.3), 0);
      R.a.rotation.x = brk * 0.6; R.b.rotation.x = -brk * 0.6;
      R.mat.opacity = Math.max(0, Math.min(1, (o.ringsIn?.[i] ?? 1) * (1 - brk * 0.85) * fade));
    });
  }
}

// ------------------------------------------------------------ the radar floor
const FLOOR_VERT = /* glsl */ `
varying vec2 vP;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FLOOR_FRAG = /* glsl */ `
uniform float uTime; uniform float uSweep; uniform float uBright; uniform vec4 uPing[4]; uniform vec3 uRed; uniform vec3 uGreen;
uniform vec3 uLine; uniform vec3 uLine2; uniform vec3 uBg;
varying vec2 vP;
float gridl(vec2 p, float s, float w) { vec2 q = p / s; vec2 f = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - clamp(min(f.x, f.y) / w, 0.0, 1.0); }
void main() {
  float r = length(vP);
  float g1 = gridl(vP, 1.0, 1.0), g5 = gridl(vP, 5.0, 1.3);
  float rings = 1.0 - clamp(abs(fract(r / 2.5 - 0.5) - 0.5) * 2.5 / (fwidth(r / 2.5) * 2.5 + 1e-4), 0.0, 1.0);
  float d = mod(uSweep - atan(vP.y, vP.x), 6.2831853);
  float sw = exp(-d * 3.0) * smoothstep(16.0, 2.0, r);
  float fade = exp(-r * 0.075);
  vec3 c = (uLine * g1 * 0.55 + uLine2 * g5 * 0.9 + uLine2 * rings * 0.5) * uBright;
  c += uRed * sw * 0.1 * uBright + uRed * (rings * sw) * 0.6 * uBright + uRed * (g1 * sw) * 0.25 * uBright;
  for (int i = 0; i < 4; i++) {
    vec4 P = uPing[i];
    float age = uTime - P.z;
    if (age < 0.0 || age > 2.6 || P.w < 0.5) continue;
    float pr = length(vP - P.xy);
    float k = 1.0 - age / 2.6;
    vec3 pc = P.w > 1.5 ? uGreen : uRed;
    for (int j = 0; j < 3; j++) { float rad = max(0.0, age - float(j) * 0.35) * 2.4; c += pc * exp(-abs(pr - rad) * 14.0) * k * 1.6; }
    c += pc * exp(-pr * 6.0) * 2.0 * smoothstep(0.0, 0.1, age) * k;
  }
  gl_FragColor = vec4(uBg + c * fade, 1.0);
}`;

/** An infinite-looking grid floor with radar rings, a rotating sweep and up to 4 ping slots. */
export class RadarFloor {
  u: Record<string, THREE.IUniform>;
  pings: THREE.Vector4[] = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
  constructor(scene: THREE.Scene, y = -1.6) {
    this.u = {
      uTime: { value: 0 }, uSweep: { value: 0 }, uBright: { value: 1 }, uPing: { value: this.pings },
      uRed: { value: col('signal') }, uGreen: { value: col('acid') },
      uLine: { value: col('graphite', 0.9) }, uLine2: { value: col('ash', 0.38) }, uBg: { value: col('ink') },
    };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.ShaderMaterial({ vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: this.u }));
    m.rotation.x = -Math.PI / 2; m.position.y = y;
    scene.add(m);
  }
  /** slot 0..3: a ping at floor point (x, z) starting at t0; green = acid instead of signal. */
  ping(slot: number, x: number, z: number, t0: number, green = false) { this.pings[slot]!.set(x, z, t0, green ? 2 : 1); }
  update(t: number, bright = 1, sweepSpeed = 1.1) { this.u.uTime!.value = t; this.u.uSweep!.value = t * sweepSpeed; this.u.uBright!.value = bright; }
}

/** Drifting dust: a few thousand points in a wide shell. */
export function dust(scene: THREE.Scene, n = 2200) {
  const dp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 4 + Math.pow(hash(i, 3), 0.7) * 30, th = hash(i, 1) * TAU, ph = Math.acos(2 * hash(i, 2) - 1);
    dp.set([r * Math.sin(ph) * Math.cos(th), Math.max(-1.5, r * Math.cos(ph) * 0.45), r * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: col('ash', 0.9), size: 0.035, sizeAttenuation: true, transparent: true, depthWrite: false }));
  scene.add(p);
  return p;
}
