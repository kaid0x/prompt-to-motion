// PORTFOLIO INTRO (the flagship example) — a ~54 s personal intro: one continuous three.js world (a
// shattered icosahedron "system" over a radar floor) with a camera that flies between stations on the
// narration's words, and type in the brand's faces on top.
//
// Read it top to bottom as a pattern:
//   build()  → objects (buildX), camera keys (buildCamera), type (buildType). All times come from words:
//              WT('ghidra') is when "Ghidra" is said. Literal times are wrapped in M() so a new voice
//              re-times them (see kit/words.ts).
//   update() → every moving thing as a pure function of t.
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Frame, PostOverrides } from '../engine/scene';
import { W } from '../engine/gl';
import { HEX, LIN, rgba } from '../engine/palette';
import { font } from '../engine/type';
import { ease, lerp, prog, pulse, hash, TAU } from '../engine/util';
import { Stage } from '../kit/stage';
import { K, ST } from '../kit/camera';
import { WT, WE, M } from '../kit/words';
import { DISPLAY, MONO, BODY, decode } from '../kit/overlay';
import { ShardCore, RadarFloor, dust, col, env, canvasTex, holoCard, cardFace, lineMat, segments } from '../kit/world';

const D2R = Math.PI / 180;
const TOOLS_R = 4.0;
const TOOL_A = [144, 108, 72, 36];
const tc = (i: number) => ST(TOOL_A[i]!, TOOLS_R, 0.15);
const A_LAB = -200, A_PAPER = -260, A_THM = -320;

const GAUGE_FRAG = /* glsl */ `
uniform float uFill; uniform vec3 uCol; uniform vec3 uBg; uniform float uA;
varying vec2 vUv;
void main() { vec3 c = vUv.x < uFill ? uCol : uBg; gl_FragColor = vec4(c * uA, 1.0); }`;
const UV_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export default class PortfolioIntro extends Stage {
  core!: ShardCore;
  floor!: RadarFloor;
  dust!: THREE.Points;
  toolCards: { g: THREE.Group; mat: THREE.MeshBasicMaterial; frame: LineMaterial; t: number }[] = [];
  ai = new THREE.Group();
  nodes: { m: THREE.Mesh; p: THREE.Vector3; tInf: number }[] = [];
  edges!: LineSegments2;
  edgePairs: [number, number][] = [];
  edgeMat!: LineMaterial;
  packet!: LineSegments2;
  packetMat!: LineMaterial;
  packetHead!: THREE.Mesh;
  packetFrom = new THREE.Vector3();
  entry = 0;
  towers = new THREE.Group();
  cubes: { m: THREE.Group; tl: number; base: THREE.Vector3; mats: [THREE.MeshBasicMaterial, THREE.LineBasicMaterial] }[] = [];
  lab = new THREE.Group();
  leds: THREE.Mesh[] = [];
  paper = new THREE.Group();
  stamp!: THREE.Mesh;
  thm = new THREE.Group();
  gaugeU = { uFill: { value: 0 }, uCol: { value: col('signal', 2.0) }, uBg: { value: col('graphite', 0.8) }, uA: { value: 1 } };
  gaugeMat!: THREE.ShaderMaterial;

  build() {
    this.core = new ShardCore(this.scene);
    this.floor = new RadarFloor(this.scene);
    this.dust = dust(this.scene);
    this.buildTools();
    this.buildAI();
    this.buildTowers();
    this.buildLab();
    this.buildPaper();
    this.buildTHM();
    this.buildCamera();
    this.buildType();
    this.hud = { from: 0.6, to: M(50.6) };
    this.captionsUntil = M(51.4);
  }

  // ============================================================ objects
  buildTools() {
    const tools: [string, string, string][] = [
      ['BURP SUITE', 'web proxy · intercept', 'TOOL_0x01'],
      ['GHIDRA', 'reverse engineering', 'TOOL_0x02'],
      ['WIRESHARK', 'packet analysis', 'TOOL_0x03'],
      ['NMAP', 'network recon', 'TOOL_0x04'],
    ];
    const tts = [WT('burp'), WT('ghidra'), WT('wireshark'), WT('nmap')];
    tools.forEach(([name, sub, id], i) => {
      const cd = holoCard(2.1, 1.3, cardFace(name, sub, id), col('signal', 1.6));
      const p = tc(i);
      cd.g.position.set(...p);
      cd.g.lookAt(p[0] * 3, p[1], p[2] * 3);
      this.scene.add(cd.g);
      this.toolCards.push({ ...cd, t: tts[i]! });
    });
  }

  /** A sphere of nodes (the "model"); an injected packet hits one and red spreads hop by hop. */
  buildAI() {
    const N = 26, R = 2.45, pts: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      pts.push(new THREE.Vector3(Math.cos(th) * r * R, y * R * 0.85, Math.sin(th) * r * R));
    }
    const key = new Set<string>();
    pts.forEach((p, i) => {
      const nn = pts.map((q, j) => [j, p.distanceTo(q)] as [number, number]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 3);
      for (const [j] of nn) { const k = `${Math.min(i, j)}-${Math.max(i, j)}`; if (!key.has(k)) { key.add(k); this.edgePairs.push([Math.min(i, j), Math.max(i, j)]); } }
    });
    // the packet comes in from the side the camera looks from during this section
    const aiCamA = -35 * D2R;
    const dir = new THREE.Vector3(Math.cos(aiCamA - 0.9), 0.35, Math.sin(aiCamA - 0.9)).normalize();
    let best = -1e9;
    pts.forEach((p, i) => { const d = p.clone().normalize().dot(dir); if (d > best) { best = d; this.entry = i; } });
    const hop = new Array(N).fill(1e9); hop[this.entry] = 0;
    const q = [this.entry];
    while (q.length) { const i = q.shift()!; for (const [a, b] of this.edgePairs) { const j = a === i ? b : b === i ? a : -1; if (j >= 0 && hop[j] > hop[i] + 1) { hop[j] = hop[i] + 1; q.push(j); } } }
    const tInj = WE('injection') - 0.1;
    const ng = new THREE.OctahedronGeometry(0.075, 0);
    pts.forEach((p, i) => {
      const m = new THREE.Mesh(ng, new THREE.MeshBasicMaterial({ color: col('bone', 1.3), transparent: true }));
      m.position.copy(p);
      this.ai.add(m);
      this.nodes.push({ m, p, tInf: tInj + hop[i] * 0.22 + hash(i, 4) * 0.08 });
    });
    const ep: number[] = [];
    for (const [a, b] of this.edgePairs) { const A = pts[a]!, B = pts[b]!; ep.push(A.x, A.y, A.z, B.x, B.y, B.z); }
    this.edgeMat = lineMat(new THREE.Color(1, 1, 1), 1.6, 1);
    this.edgeMat.vertexColors = true;
    this.edges = segments(ep, this.edgeMat);
    (this.edges.geometry as LineSegmentsGeometry).setColors(new Array(ep.length).fill(0.3));
    this.ai.add(this.edges);
    const E = pts[this.entry]!;
    this.packetFrom.copy(E.clone().add(dir.clone().multiplyScalar(14)));
    this.packetMat = lineMat(col('signal', 4), 3.2);
    this.packet = segments([0, 0, 0, 0, 0, 1], this.packetMat);
    this.ai.add(this.packet);
    this.packetHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 2), new THREE.MeshBasicMaterial({ color: col('ember', 8) }));
    this.ai.add(this.packetHead);
    this.scene.add(this.ai);
  }

  /** 32 challenge blocks in 7 towers (categories), dropping in one by one up to "30+". */
  buildTowers() {
    const heights = [5, 4, 5, 4, 5, 4, 5];
    const s = 0.4, gap = 0.04;
    const box = new THREE.BoxGeometry(s, s, s);
    const eg = new THREE.EdgesGeometry(box);
    const order: [number, number][] = [];
    for (let lvl = 0; lvl < 5; lvl++) for (let c = 0; c < 7; c++) if (lvl < heights[c]!) order.push([c, lvl]);
    const t0 = WT('designed') + 0.2, t1 = WT('30+') + 0.2;
    order.forEach(([c, lvl], k) => {
      const a = (c / 7) * TAU + 0.3, R = 3.55;
      const base = new THREE.Vector3(Math.cos(a) * R, -1.6 + s / 2 + lvl * (s + gap), Math.sin(a) * R);
      const hot = hash(k, 9) > 0.75;
      const fm = new THREE.MeshBasicMaterial({ color: col(hot ? 'blood' : 'ink2', hot ? 0.9 : 1.6), transparent: true });
      const lm = new THREE.LineBasicMaterial({ color: col(hot ? 'signal' : 'ash', hot ? 2.2 : 0.9), transparent: true });
      const g = new THREE.Group();
      g.add(new THREE.Mesh(box, fm), new THREE.LineSegments(eg, lm));
      g.rotation.y = -a;
      this.towers.add(g);
      this.cubes.push({ m: g, tl: lerp(t0, t1, k / (order.length - 1)), base, mats: [fm, lm] });
    });
    this.scene.add(this.towers);
  }

  /** A Raspberry-Pi-like board from boxes: PCB, SoC, RAM, USB/Ethernet, GPIO header, two LEDs. */
  buildLab() {
    const B = (w: number, h: number, d: number, c: THREE.Color, x: number, y: number, z: number, edge?: THREE.Color) => {
      const g = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: c, transparent: true }));
      m.position.set(x, y, z);
      this.lab.add(m);
      if (edge) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: edge, transparent: true })); l.position.copy(m.position); this.lab.add(l); }
    };
    B(1.7, 0.05, 1.12, col('ink2', 2.2), 0, 0, 0, col('ash', 0.9));
    B(0.42, 0.06, 0.42, col('graphite', 1.4), -0.15, 0.055, 0.05, col('signal', 1.6));
    B(0.3, 0.05, 0.22, col('graphite', 1.1), 0.25, 0.05, 0.05, col('ash', 0.6));
    for (let i = 0; i < 2; i++) B(0.3, 0.3, 0.26, col('ash', 0.35), 0.72, 0.17, -0.3 + i * 0.34, col('bone', 0.8));
    B(0.3, 0.26, 0.3, col('ash', 0.3), 0.72, 0.15, 0.38, col('bone', 0.8));
    for (let i = 0; i < 20; i++) for (let j = 0; j < 2; j++) B(0.04, 0.07, 0.04, col('ash', 0.8), -0.75 + i * 0.065, 0.06, -0.48 + j * 0.065);
    for (let i = 0; i < 2; i++) {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: col(i ? 'acid' : 'signal', 4) }));
      led.position.set(-0.78, 0.05, 0.35 + i * 0.09);
      this.lab.add(led); this.leds.push(led);
    }
    const p = ST(A_LAB, 4.8, 0.12);
    this.lab.position.set(...p);
    this.lab.lookAt(p[0] * 3, p[1], p[2] * 3);
    this.lab.rotateX(0.55);
    this.lab.scale.setScalar(0.8);
    this.scene.add(this.lab);
  }

  /** A research paper sheet that gets an A* stamp slammed onto it. */
  buildPaper() {
    const tex = canvasTex(820, 1060, (c, w, h) => {
      c.fillStyle = HEX.bone; c.fillRect(0, 0, w, h);
      c.fillStyle = HEX.ink;
      c.font = font(MONO(600), 20); c.letterSpacing = '4px'; c.fillText('RESEARCH PAPER', 64, 86);
      c.letterSpacing = '0px';
      c.font = font(DISPLAY(700), 60);
      c.fillText('AI SURVEILLANCE', 64, 180); c.fillText('& PRIVACY', 64, 248);
      c.fillStyle = HEX.blood; c.fillRect(64, 280, 120, 6);
      c.fillStyle = '#5E6B80'; c.font = font(BODY(500), 22); c.fillText('Muhammad Haseeb Ashfaq', 64, 330);
      for (let i = 0; i < 17; i++) {
        const y = 400 + i * 34, wl = i % 6 === 5 ? 0.55 : 0.82 + hash(i, 3) * 0.12;
        c.fillStyle = 'rgba(44,54,69,0.55)'; c.fillRect(64, y, (w - 128) * wl, 12);
      }
      c.strokeStyle = 'rgba(10,13,18,0.25)'; c.lineWidth = 2; c.strokeRect(24, 24, w - 48, h - 48);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.62), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, color: new THREE.Color(0.9, 0.9, 0.9) }));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.62), new THREE.MeshBasicMaterial({ color: col('ash', 0.5), transparent: true, side: THREE.DoubleSide }));
    back.position.set(0.08, -0.08, -0.06); back.rotation.z = 0.04;
    const stampTex = canvasTex(512, 512, (c) => {
      c.strokeStyle = HEX.signal; c.lineWidth = 22;
      c.beginPath(); c.arc(256, 256, 220, 0, TAU); c.stroke();
      c.lineWidth = 6; c.beginPath(); c.arc(256, 256, 186, 0, TAU); c.stroke();
      c.fillStyle = HEX.signal; c.font = font(DISPLAY(700), 230); c.textAlign = 'center'; c.fillText('A*', 256, 335);
      c.font = font(MONO(700), 34); c.letterSpacing = '6px'; c.fillText('GRADE', 262, 140);
    });
    this.stamp = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.72), new THREE.MeshBasicMaterial({ map: stampTex, transparent: true, depthWrite: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    this.stamp.position.set(0.28, -0.35, 0.03); this.stamp.rotation.z = -0.2;
    this.paper.add(back, m, this.stamp);
    const p = ST(A_PAPER, 4.8, 0.2);
    this.paper.position.set(...p);
    this.paper.lookAt(p[0] * 3, p[1], p[2] * 3);
    this.scene.add(this.paper);
  }

  /** A ring gauge filling to the 65th percentile, "TOP 35%" in the middle. */
  buildTHM() {
    const bg = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.06, 12, 160), new THREE.ShaderMaterial({ vertexShader: UV_VERT, fragmentShader: GAUGE_FRAG, uniforms: this.gaugeU }));
    this.gaugeMat = bg.material as THREE.ShaderMaterial;
    bg.rotation.z = Math.PI / 2; bg.scale.x = -1; // start at 12 o'clock, fill clockwise
    const ticks: number[] = [];
    for (let i = 0; i < 60; i++) { const a = (i / 60) * TAU, r0 = 0.92, r1 = i % 5 ? 0.97 : 1.02; ticks.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0); }
    const tk = segments(ticks, lineMat(col('ash', 0.8), 1.4));
    const label = canvasTex(640, 640, (c) => {
      c.textAlign = 'center';
      c.fillStyle = HEX.ash; c.font = font(MONO(600), 40); c.letterSpacing = '8px'; c.fillText('TOP', 326, 230);
      c.letterSpacing = '0px'; c.fillStyle = HEX.bone; c.font = font(DISPLAY(700), 190); c.fillText('35%', 320, 400);
      c.fillStyle = HEX.signal; c.font = font(MONO(600), 34); c.letterSpacing = '4px'; c.fillText('TRYHACKME', 324, 480);
    });
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: label, transparent: true, depthWrite: false, color: new THREE.Color(1.3, 1.3, 1.3) }));
    this.thm.add(bg, tk, lm);
    const p = ST(A_THM, 4.8, 0.25);
    this.thm.position.set(...p);
    this.thm.lookAt(p[0] * 3, p[1], p[2] * 3);
    this.scene.add(this.thm);
  }

  // ============================================================ camera
  buildCamera() {
    const L = ease.linear, IO = ease.inOutCubic, Q = ease.inOutQuart;
    const r = this.rig;
    const tBreak = WT('break');
    // hook: push in from far away, arriving as he says "break"
    r.add(K(0, 92, 18, 0.7, [0, 0, 0], 0, 30), K(tBreak - 0.05, 82, 8.6, 0.45, [0, 0, 0], 0, 33, ease.outCubic), K(M(5.35), 72, 6.9, 0.35, [0, 0.05, 0], 0, 34, L));
    // name: orbit to a 3/4 hero with the core on the right third
    r.add(K(M(6.5), 38, 6.4, 0.95, [0, 0, 0], 1.75, 34, Q), K(M(9.15), 26, 6.0, 1.05, [0, 0, 0], 1.85, 34, L));
    // whoami: crane up over the radar floor
    r.add(K(M(10.3), 14, 3.4, 9.8, [0, -1.6, 0.2], 1.2, 40, Q), K(M(14.0), -14, 3.6, 9.2, [0, -1.6, 0.2], 1.2, 40, L));
    // tools: wide on the ring of cards, then track card to card on each name
    r.add(K(M(15.6), 90, 11.6, 2.3, [0, 0.1, 0], 0, 36, Q));
    const tts = [WT('burp'), WT('ghidra'), WT('wireshark'), WT('nmap')];
    r.add(K(tts[0]! - 0.55, 90, 10.8, 1.9, [0, 0.1, 0], 0, 36, L));
    tts.forEach((tt, i) => {
      const p = tc(i), tg: [number, number, number] = [p[0] * 0.92, p[1], p[2] * 0.92];
      const nxt = tts[i + 1] ?? WE('nmap') + 0.6;
      r.add(K(tt + 0.15, TOOL_A[i]! - 2, 7.3, 0.55, tg, 0, 34, Q), K(Math.min(nxt - 0.12, tt + 0.6), TOOL_A[i]! - 4, 7.1, 0.5, tg, 0, 34, L));
    });
    // AI: swing round the core, pushing in through the attacks
    r.add(K(WT('now') + 1.0, -20, 6.9, 1.5, [0, 0.2, 0], 1.45, 36, Q), K(WT('prompt') - 0.1, -33, 6.1, 1.0, [0, 0.15, 0], 1.35, 36, L));
    r.add(K(WT('attacking') + 0.3, -52, 5.2, 0.55, [0, 0.1, 0], 1.15, 36, IO), K(M(27.6), -66, 4.7, 0.35, [0, 0.1, 0], 0.95, 36, L));
    // WSH: rise high and wide, slow orbit while the towers build
    r.add(K(WT('wsh') + 0.1, -118, 10.6, 5.6, [0, -0.7, 0], 1.6, 38, Q), K(M(35.7), -178, 9.4, 3.4, [0, -0.6, 0], 1.6, 38, L));
    // stations: arrive (Q), then drift (L) until the next move
    const stK = (t: number, a: number, dur: number) => {
      const p = ST(a, 4.8, 0.2);
      r.add(K(t, a + 4, 8.6, 0.95, p, 0.85, 34, Q), K(t + dur, a - 3, 8.1, 0.85, p, 0.85, 34, L));
    };
    stK(WT('raspberry') + 0.3, A_LAB, WT('wrote') - 0.35 - WT('raspberry') - 0.3);
    stK(WT('a*') + 0.1, A_PAPER, WT('rank') - 0.45 - WT('a*') - 0.1);
    stK(WT('tryhackme') + 0.3, A_THM, M(45.4) - WT('tryhackme') - 0.3);
    // open to internships: pull back to the front; end: wide
    r.add(K(WT('open') + 0.6, -270, 10.6, 1.6, [0, -0.75, 0], 0, 34, Q), K(M(49.5), -270, 9.4, 1.3, [0, -0.8, 0], 0, 34, L));
    r.add(K(M(51.2), -268, 13.5, 1.0, [0, 0.1, 0], 0, 34, IO), K(M(53.7), -264, 14.6, 1.2, [0, 0.1, 0], 0, 34, L));
  }

  // ============================================================ type
  buildType() {
    const X = 132, u = this.ui;
    // ---- hook
    const tBreak = WT('break');
    u.kicker('MOST PEOPLE USE SYSTEMS.', W / 2, 742, WT('most'), M(5.45), { size: 26, col: 'ash', align: 'center' });
    u.title([['I ', 'bone'], ['BREAK', 'signal'], [' THEM.', 'bone']], W / 2, 842, 92, tBreak - 0.05, M(5.45), { align: 'center', dur: 0.4, track: 2 });
    u.body('to see how they hold together.', W / 2, 900, 34, WT('to'), M(5.45), { align: 'center', col: 'ash' });
    this.punches.push([tBreak + 0.02, 0.035]);
    this.flashes.push([tBreak + 0.02, 0.22]);
    // ---- name
    const tN = WT('muhammad');
    u.kicker('AI SECURITY · OFFENSIVE SECURITY · THREAT INTEL', X, 392, tN - 0.35, M(9.45));
    u.title([['MUHAMMAD', 'bone']], X, 518, 118, tN - 0.05, M(9.45), { track: 3 });
    u.title([['HASEEB ', 'bone'], ['ASH', 'bone'], ['FAQ', 'signal']], X, 640, 118, WT('haseeb') - 0.05, M(9.45), { track: 3 });
    const tK = WT('kaido') - 0.15;
    u.el(tK, M(9.45), (c, t, a) => {
      c.font = font(MONO(600), 44); c.letterSpacing = '4px';
      c.fillStyle = rgba('signal', a); c.fillText('[', X, 724);
      const bw = c.measureText('[').width;
      c.fillStyle = rgba('bone', a); c.fillText(decode('kaido', t, tK, 18, 3), X + bw + 4, 724);
      c.fillStyle = rgba('signal', a); c.fillText(']', X + bw + 4 + c.measureText('kaido').width + 4, 724);
      c.letterSpacing = '0px';
    }, 0.05);
    u.body('// aspiring_ai_pentester', X, 782, 26, WT('kaido') + 0.35, M(9.45), { fam: MONO(400), col: 'ash' });
    // ---- whoami
    const tw0 = WT('year') - 0.35;
    u.terminal(120, 330, 820, 330, 'kaido@mhaseebashfaq: ~', [
      ['$ whoami', tw0, 'acid'],
      ['> kaido · year 13 student', WT('year'), 'bone'],
      ['> location: dubai, uae', WT('dubai'), 'bone'],
      ['> focus: offensive_security + ai', WT('offensive'), 'signal'],
    ], tw0 - 0.25, M(14.25));
    // ---- tools
    u.kicker('01 — WHERE I STARTED', X, 170, WT('started') - 0.1, WT('burp') + 0.1);
    u.title([['THREAT INTEL ', 'bone'], ['+ PENTESTING', 'signal']], X, 252, 64, WT('threat') - 0.05, WT('burp') + 0.1);
    // ---- AI
    u.kicker('02 — WHAT I DO NOW', X, 300, WT('now') + 0.2, M(27.65));
    u.title([['AI ', 'signal'], ['SECURITY', 'bone']], X, 400, 100, WT('ai', 1) - 0.05, M(27.65), { track: 2 });
    const aiList: [string, number][] = [['PROMPT INJECTION', WT('prompt')], ['JAILBREAKS', WT('jailbreaks')], ['ATTACKING LANGUAGE MODELS', WT('attacking')]];
    aiList.forEach(([s, t0], i) => {
      u.el(t0 - 0.05, M(27.65), (c, t, a) => {
        const k = prog(t, t0 - 0.05, t0 + 0.35, ease.outCubic);
        const y = 500 + i * 64;
        c.fillStyle = rgba('signal', a); c.fillRect(X, y - 22, 6, 30 * k);
        c.font = font(MONO(600), 30); c.letterSpacing = '3px'; c.fillStyle = rgba('bone', a);
        c.fillText(decode(s, t, t0, 46), X + 26, y);
        c.letterSpacing = '0px';
      }, 0.01);
      this.punches.push([t0 + 0.05, 0.008]);
    });
    this.flashes.push([WT('attacking') + 0.05, 0.12]);
    // ---- WSH '26
    const tW0 = WT('designed'), t30 = WT('30+');
    u.kicker('03 — I DESIGNED', X, 210, tW0 - 0.05, M(35.75));
    u.title([['WSH ', 'bone'], ["'26", 'signal']], X, 352, 150, WT('wsh') - 0.05, M(35.75), { track: 4 });
    u.kicker("WESTMINSTER SCHOOL'S HACKATHON + CTF", X, 420, WT('hackathon') - 0.2, M(35.75), { col: 'ash', bar: false, size: 24 });
    u.el(tW0 + 0.3, M(35.75), (c, t, a) => {
      const n = t >= t30 ? 30 : Math.floor(30 * prog(t, tW0 + 0.3, t30, ease.inOutQuad));
      c.font = font(DISPLAY(700), 132); c.fillStyle = rgba('signal', a);
      c.fillText(String(n).padStart(2, '0') + (t >= t30 ? '+' : ''), X, 850);
      c.font = font(MONO(600), 24); c.letterSpacing = '5px'; c.fillStyle = rgba('bone', a);
      c.fillText('CUSTOM CHALLENGES', X + 8, 896);
      c.letterSpacing = '0px';
    }, 0.3);
    this.punches.push([t30 + 0.02, 0.02]);
    const tC = WT('custom');
    u.el(tC, M(35.75), (c, t, a) => {
      const k = prog(t, tC, tC + 0.4, ease.outCubic), x0 = X + 440;
      c.fillStyle = rgba('graphite', a); c.fillRect(x0 - 40, 760, 2, 140 * k);
      c.font = font(DISPLAY(700), 132); c.fillStyle = rgba('bone', a * k); c.fillText('7', x0, 850);
      c.font = font(MONO(600), 24); c.letterSpacing = '5px'; c.fillText('CATEGORIES', x0 + 8, 896); c.letterSpacing = '0px';
    }, 0.01);
    // ---- stations (one block at a time in the same place: each ends before the next starts)
    const station = (head: string, lines: [string, string][][], sub: string, t0: number, t1: number) => {
      u.kicker(head, X, 560, t0, t1);
      lines.forEach((runs, i) => u.title(runs, X, 650 + i * 82, 74, t0 + 0.12 + i * 0.12, t1));
      if (sub) u.body(sub, X, 650 + (lines.length - 1) * 82 + 66, 30, t0 + 0.45, t1, { fam: MONO(400), col: 'ash' });
    };
    station('04 — HOMELAB', [[['RASPBERRY PI ', 'bone'], ['SECURITY', 'signal']], [['HOMELAB', 'bone']]], '', WT('raspberry') - 0.1, WT('wrote') + 0.05);
    station('05 — RESEARCH', [[['AI SURVEILLANCE', 'bone']], [['& PRIVACY', 'bone']]], '> cambridge research paper · grade A*', WT('wrote') + 0.1, WT('and', 3) + 0.05);
    station('06 — RANKED', [[['TRYHACKME ', 'bone'], ['TOP 35%', 'signal']]], '> SOC L1 · Jr Penetration Tester paths', WT('and', 3) + 0.1, M(45.55));
    this.punches.push([WT('a*') + 0.15, 0.03]);
    this.flashes.push([WT('a*') + 0.15, 0.1]);
    // ---- open to internships
    u.pill('OPEN TO INTERNSHIPS', W / 2, 742, 30, WT('open') - 0.05, M(49.55), { align: 'center' });
    u.title([['AI SECURITY', 'bone'], [' · ', 'signal'], ['OFFENSIVE SECURITY', 'bone']], W / 2, 860, 64, WT('ai', 2) - 0.1, M(49.55), { align: 'center', track: 2 });
    // ---- end
    u.title([["LET'S ", 'bone'], ['BREAK', 'signal'], [' SOMETHING', 'bone']], W / 2, 520, 100, WT("let's") - 0.05, M(51.55), { align: 'center', track: 2 });
    u.title([['TOGETHER.', 'bone']], W / 2, 630, 100, WT('together', 1) - 0.05, M(51.55), { align: 'center', track: 2 });
    this.punches.push([WT('break', 1) + 0.02, 0.03]);
    this.flashes.push([WT('break', 1) + 0.02, 0.18]);
    const tE = M(51.45), END = 1e9;
    u.title([['MUHAMMAD HASEEB ASH', 'bone'], ['FAQ', 'signal']], W / 2, 420, 92, tE + 0.1, END, { align: 'center', track: 2 });
    u.kicker('AI SECURITY · OFFENSIVE SECURITY · THREAT INTEL', W / 2, 486, tE + 0.3, END, { align: 'center' });
    const links: [string, string][] = [['web', 'mhaseebashfaq.com'], ['github', 'github.com/kaid0x'], ['linkedin', 'linkedin.com/in/haseeb-ashfaq-504595317'], ['mail', 'haseebashfaq207@gmail.com']];
    links.forEach(([k, v], i) => {
      const t0 = tE + 0.55 + i * 0.12;
      u.el(t0, END, (c, t, a) => {
        const kk = prog(t, t0, t0 + 0.4, ease.outCubic), y = 600 + i * 56 + (1 - kk) * 10;
        c.font = font(MONO(400), 26); c.textAlign = 'right'; c.fillStyle = rgba('ash', a * kk); c.fillText(k, W / 2 - 30, y);
        c.textAlign = 'left'; c.font = font(MONO(600), 30); c.fillStyle = rgba(i === 0 ? 'signal' : 'bone', a * kk); c.fillText(v, W / 2 - 4, y);
      }, 0.01);
    });
    u.el(tE + 0.5, END, (c, t, a) => { const k = prog(t, tE + 0.5, tE + 1.1, ease.inOutCubic); c.fillStyle = rgba('graphite', a); c.fillRect(W / 2 - 1, 570, 2, 210 * k); }, 0.01);
    u.pill('OPEN TO INTERNSHIPS', W / 2, 868, 22, tE + 1.0, END, { align: 'center' });
  }

  // ============================================================ per-frame
  update(t: number, f: Frame) {
    const tBreak = WT('break'), tHold = WT('hold'), tAtk = WT('attacking'), tEnd = WT('break', 1), tJ = WT('jailbreaks');
    const rms = f.a?.rms ?? 0;
    const ai = env(t, WT('now'), M(27.7), 0.8, 0.8);
    // the core: assembles, cracks on "break", reseals on "hold together", glitches on "attacking", blows apart at the end
    let ex = 1 - prog(t, 0.2, tBreak - 0.25, ease.outQuart);
    ex = Math.max(ex, 0.62 * prog(t, tBreak, tBreak + 0.3, ease.outExpo) * (1 - prog(t, tHold - 0.05, tHold + 0.55, ease.inOutCubic)));
    ex = Math.max(ex, 0.22 * prog(t, tAtk, tAtk + 0.2, ease.outExpo) * (1 - prog(t, tAtk + 0.9, M(27.6), ease.inOutCubic)));
    ex = Math.max(ex, 1.25 * prog(t, tEnd, tEnd + 1.6, ease.outExpo));
    const coreFade = 1 - prog(t, tEnd + 0.4, tEnd + 2.0);
    this.core.update(t, {
      explode: ex,
      jitter: 0.6 * (prog(t, tAtk, tAtk + 0.1) - prog(t, tAtk + 0.9, tAtk + 1.3)),
      glow: (2.2 + rms * 3 + 4 * pulse(t, tAtk, 0.4)) * (1 - prog(t, tEnd + 0.1, tEnd + 0.6)),
      glowScale: 0.9 + rms * 0.35 + 0.6 * pulse(t, tBreak, 0.25),
      fade: coreFade,
      wire: 1 + 1.5 * pulse(t, tBreak, 0.3) + 1.2 * pulse(t, tAtk, 0.3),
      ringBreak: prog(t, tJ, tJ + 0.7, ease.outExpo) * (1 - prog(t, M(44.6), M(46.6), ease.inOutCubic)),
      ringsIn: [0, 1, 2].map((i) => prog(t, 0.6 + i * 0.3, 2.4 + i * 0.3)),
      latticeA: (0.55 + 0.45 * (1 - ai)) * (1 - prog(t, tEnd, tEnd + 1.2)),
    });
    // floor: brighter for the top-down whoami shot; pings on "Dubai", "open" and "break"
    this.floor.update(t, 0.7 + 0.6 * env(t, M(9.6), M(14.2), 0.8, 0.8) + 0.3 * env(t, M(45.6), M(50), 0.5, 0.8));
    this.floor.ping(0, -1.6, 1.4, WT('dubai'));
    this.floor.ping(1, 0, 0, WT('open') - 0.05, true);
    this.floor.ping(2, 0, 0, WT('open') + 0.9, true);
    this.floor.ping(3, 0, 0, tBreak);
    this.dust.rotation.y = t * 0.02;
    // tool cards: light up as each is named
    this.toolCards.forEach((C, i) => {
      const t0 = M(14.9) + i * 0.14;
      const v = env(t, t0, M(20.9) + i * 0.1, 0.6, 0.5);
      const hot = prog(t, C.t - 0.1, C.t + 0.15) * (1 - 0.6 * prog(t, C.t + 1.0, C.t + 1.6));
      C.g.visible = v > 0.005;
      C.mat.opacity = v * (0.55 + 0.45 * Math.max(hot, prog(t, M(20.0), M(20.3))));
      C.frame.opacity = v;
      C.frame.color.copy(col('signal', 0.6 + 3.4 * hot));
      C.g.scale.setScalar(lerp(0.6, 1, ease.outBack(prog(t, t0, t0 + 0.7))) * (1 + 0.06 * hot));
      const p = tc(i);
      C.g.position.set(p[0], p[1] + Math.sin(t * 0.9 + i) * 0.04 + hot * 0.1, p[2]);
    });
    // AI graph: packet in on "prompt injection", red spreads hop by hop
    this.ai.visible = ai > 0.005;
    if (this.ai.visible) {
      this.ai.rotation.y = t * 0.06;
      const red = LIN.signal, ash = LIN.ash;
      const infK = (i: number) => prog(t, this.nodes[i]!.tInf, this.nodes[i]!.tInf + 0.2);
      this.nodes.forEach((N, i) => {
        const k = infK(i);
        const m = N.m.material as THREE.MeshBasicMaterial;
        m.color.copy(col('bone', 1.2)).lerp(col('signal', 3.2), k);
        m.opacity = ai;
        N.m.scale.setScalar(lerp(0.4, 1, ease.outBack(prog(t, WT('now') + i * 0.03, WT('now') + 0.5 + i * 0.03))) * (1 + 0.6 * pulse(t, N.tInf, 0.2)));
        N.m.rotation.set(t, t * 0.7, 0);
      });
      const cols: number[] = [];
      for (const [a, b] of this.edgePairs) for (const k of [infK(a), infK(b)]) {
        const s = 0.42 + 2.4 * k;
        cols.push(lerp(ash[0], red[0], k) * s, lerp(ash[1], red[1], k) * s, lerp(ash[2], red[2], k) * s);
      }
      (this.edges.geometry as LineSegmentsGeometry).setColors(cols);
      this.edgeMat.opacity = ai;
      const tP = WT('prompt') - 0.05, tI = WE('injection') - 0.1;
      const k = prog(t, tP, tI, ease.inQuad);
      const E = this.nodes[this.entry]!.p;
      const head = this.packetFrom.clone().lerp(E, k), tail = this.packetFrom.clone().lerp(E, Math.max(0, k - 0.35));
      (this.packet.geometry as LineSegmentsGeometry).setPositions([tail.x, tail.y, tail.z, head.x, head.y, head.z]);
      const pv = t > tP && t < tI + 0.6 ? 1 - prog(t, tI, tI + 0.6) : 0;
      this.packetMat.opacity = pv; this.packet.visible = pv > 0.01;
      this.packetHead.position.copy(head); this.packetHead.visible = t > tP && t < tI + 0.05;
    }
    // towers: each block drops in and lands with a flash
    const tw = env(t, WT('designed') - 0.2, M(36.3), 0.3, 0.7);
    this.towers.visible = tw > 0.005;
    this.towers.rotation.y = t * 0.035;
    this.cubes.forEach((C, k) => {
      const land = prog(t, C.tl - 0.35, C.tl, ease.inQuad);
      C.m.visible = t > C.tl - 0.35 && tw > 0.005;
      C.m.position.set(C.base.x, C.base.y + (1 - land) * 2.2, C.base.z);
      C.m.scale.setScalar(1 + 0.25 * pulse(t, C.tl, 0.12));
      const op = tw * prog(t, C.tl - 0.35, C.tl - 0.15);
      C.mats[0].opacity = op; C.mats[1].opacity = op;
      const hot = hash(k, 9) > 0.75;
      C.mats[1].color.copy(col(hot ? 'signal' : 'ash', (hot ? 2.2 : 0.9) + 3 * pulse(t, C.tl, 0.2)));
    });
    // stations
    const fadeAll = (g: THREE.Object3D, v: number, skip?: THREE.Material | THREE.Object3D) =>
      g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && o !== skip && m !== skip) { m.opacity = v; m.transparent = true; } });
    const vLab = env(t, WT('raspberry') - 0.3, WT('wrote') + 0.9, 0.5, 0.5);
    this.lab.visible = vLab > 0.005;
    fadeAll(this.lab, vLab);
    this.leds.forEach((L, i) => (L.material as THREE.MeshBasicMaterial).color.copy(col(i ? 'acid' : 'signal', Math.floor(t * (i ? 3 : 7)) % 2 ? 4 : 0.6)));
    const lp = ST(A_LAB, 4.8, 0.12);
    this.lab.position.set(lp[0], lp[1] + Math.sin(t * 1.1) * 0.05, lp[2]);
    const vPap = env(t, WT('wrote') - 0.2, WT('rank') + 0.8, 0.5, 0.5);
    this.paper.visible = vPap > 0.005;
    fadeAll(this.paper, vPap, this.stamp);
    const tA = WT('a*'), sk = prog(t, tA - 0.05, tA + 0.15, ease.inQuad);
    (this.stamp.material as THREE.MeshBasicMaterial).opacity = vPap * sk;
    this.stamp.scale.setScalar(lerp(2.4, 1, sk));
    this.paper.rotation.z = Math.sin(t * 0.6) * 0.03;
    const vT = env(t, WT('rank') - 0.2, M(45.9), 0.5, 0.5);
    this.thm.visible = vT > 0.005;
    this.gaugeU.uFill.value = 0.65 * prog(t, WT('tryhackme'), WT('35%') + 0.4, ease.inOutCubic);
    this.gaugeU.uA.value = vT;
    fadeAll(this.thm, vT, this.gaugeMat);
  }

  /** A chromatic-aberration spike on the "attacking language models" glitch. */
  override postAt(t: number): PostOverrides {
    const tAtk = WT('attacking');
    return { ca: 1.0 + 6 * (prog(t, tAtk, tAtk + 0.05) - prog(t, tAtk + 0.6, tAtk + 1.0)) };
  }
}
