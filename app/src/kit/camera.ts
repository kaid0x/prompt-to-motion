// A cinematic camera as a list of keys. Positions are CYLINDRICAL around the world origin (angle a in
// degrees, radius r, height y), so interpolating two keys orbits instead of cutting through the subject.
// Each key also has a look-at target, a lateral framing shift `sx` (positive puts the subject on the
// RIGHT third, leaving the left for type), a field of view and the easing INTO that key.
//
// Rules of thumb (learned the hard way):
//  - Every move needs a HOLD key before it, or the camera creeps across the whole gap: put a key with the
//    same framing just before the move starts (linear ease), then the move key (inOutCubic/Quart).
//  - Ease into arrivals with inOutQuart for "snap-to-subject", linear for slow drifts between keys.
//  - Keep handheld noise subtle (0.03-0.06 units). It reads as "filmed", more reads as "drunk".
import * as THREE from 'three';
import { clamp, ease, lerp, noise1 } from '../engine/util';

export type V3 = [number, number, number];
export interface CamKey { t: number; a: number; r: number; y: number; tg: V3; sx: number; fov: number; ez: (x: number) => number }
const D2R = Math.PI / 180;

/** A camera key. ez is the easing used to arrive at this key from the previous one. */
export const K = (t: number, a: number, r: number, y: number, tg: V3 = [0, 0, 0], sx = 0, fov = 34, ez: (x: number) => number = ease.inOutCubic): CamKey =>
  ({ t, a, r, y, tg, sx, fov, ez });

/** A point on the ground ring at angle a (degrees), radius r and height y: where to put "stations". */
export const ST = (a: number, r = 4.8, y = 0.25): V3 => [r * Math.cos(a * D2R), y, r * Math.sin(a * D2R)];

export class CameraRig {
  keys: CamKey[] = [];
  /**
   * relative = true: the cylindrical position is measured around each key's TARGET instead of the world
   * origin, so moving the target tracks the camera along with it (a dolly down a row of stations).
   */
  relative = false;
  constructor(public cam: THREE.PerspectiveCamera, public handheld = 0.05) {}
  add(...k: CamKey[]) { this.keys.push(...k); this.keys.sort((a, b) => a.t - b.t); return this; }
  /** Pose the camera at time t. */
  at(t: number) {
    const k = this.keys;
    if (!k.length) return;
    let i = 0;
    while (i + 1 < k.length && k[i + 1]!.t <= t) i++;
    const A = k[i]!, B = k[Math.min(i + 1, k.length - 1)]!;
    const u = A === B || t <= A.t ? 0 : B.ez(clamp((t - A.t) / (B.t - A.t)));
    const a = lerp(A.a, B.a, u) * D2R, r = lerp(A.r, B.r, u), y = lerp(A.y, B.y, u);
    const tg = [0, 1, 2].map((j) => lerp(A.tg[j]!, B.tg[j]!, u)) as V3;
    const sx = lerp(A.sx, B.sx, u), fov = lerp(A.fov, B.fov, u);
    const hh = this.handheld;
    const pos = new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
    if (this.relative) pos.add(new THREE.Vector3(...tg));
    pos.x += noise1(t * 0.31, 1) * hh * 2; pos.y += noise1(t * 0.27, 2) * hh; pos.z += noise1(t * 0.29, 3) * hh * 2;
    const tgt = new THREE.Vector3(...tg);
    tgt.x += noise1(t * 0.4, 4) * hh * 0.5; tgt.y += noise1(t * 0.37, 5) * hh * 0.5;
    const fwd = tgt.clone().sub(pos).normalize();
    const right = fwd.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
    tgt.addScaledVector(right, -sx);
    const c = this.cam;
    c.position.copy(pos);
    c.up.set(0, 1, 0);
    c.lookAt(tgt);
    c.rotateZ(noise1(t * 0.23, 6) * hh * 0.12);
    c.fov = fov;
    c.updateProjectionMatrix();
  }
}
