# Scene API

Everything a scene needs, from `app/src/kit/` and `app/src/engine/`. Coordinates: the 2D overlay is
1920×1080 logical px (y down) at every output scale. The 3D world is in units, with the floor at y = −1.6 and
the subject at the origin.

## Stage (kit/stage.ts)
```ts
export default class MyVideo extends Stage {
  build() { /* objects, this.rig keys, this.ui type, this.punches/flashes, this.hud, this.captionsUntil */ }
  update(t: number, f: Frame) { /* move things; f.a.rms is the voice loudness 0..1 */ }
  postAt(t: number) { return { ca: 1 }; }   // optional per-frame post overrides
}
```
| field | meaning |
|---|---|
| `scene`, `cam` | the three.js scene and camera (rendered into a 4× MSAA HDR target) |
| `rig` | `CameraRig`: add keys with `this.rig.add(K(...), K(...))` |
| `ui` | `Overlay`: the 2D type layer |
| `punches: [t, amt][]` | zoom punch on a hit (0.008 subtle, 0.035 big) |
| `flashes: [t, amt][]` | additive white flash (0.1–0.25) |
| `hud` | `{from, to}` for the corner HUD frame (brand tag, timecode, progress), or `null` |
| `captionsUntil` | hide the burned-in captions after this time (e.g. at the end card) |
| `look` | post: bloom, bloomThreshold, halation, vignette, grain, ca… |

The file name of the module is the scene id used in `script.json` / `data/cues.json` plates.

## Words (kit/words.ts)
| call | returns |
|---|---|
| `WT('ghidra')` | start (s) of the first spoken word starting with "ghidra" (case and punctuation ignored) |
| `WT('break', 1)` | the second "break" (0-based nth) |
| `WE('injection')` | end of that word |
| `LINE('every')` | the line containing that word: `{text, start, end, words}` |
| `M(27.6)` | a literal time from the layout read mapped onto the current read (identity unless `data/lyrics.layout.json` exists) |
| `LINES`, `ALLW` | all lines, all words |

A missing word throws `word not found …`. Read align's printout for the exact spelling, because
`WT('a*')`, `WT('30+')`, `WT("let's")` keep their symbols.

## Camera (kit/camera.ts)
`K(t, a, r, y, tg = [0,0,0], sx = 0, fov = 34, ease = inOutCubic)`: a key at time t. The camera sits at
angle `a`° and radius `r` around the origin, at height `y`, and looks at `tg`. `sx` > 0 slides the subject to the
**right third** (type goes left). `ease` is how it arrives at this key.
`ST(a, r = 4.8, y = 0.25)` returns a point on the ground ring, for placing "stations" (props, cards) and aiming at them.

```ts
// hold, then snap to the subject on the word, then drift
r.add(K(WT('ghidra') - 0.5, 90, 10.8, 1.9, [0,0.1,0], 0, 36, ease.linear));   // hold
r.add(K(WT('ghidra') + 0.15, 106, 7.3, 0.55, ST(108, 3.7), 0, 34, ease.inOutQuart)); // arrive
r.add(K(WT('wireshark') - 0.12, 104, 7.1, 0.5, ST(108, 3.7), 0, 34, ease.linear));   // drift
```
`this.rig.relative = true` measures each key's position around its own target instead of the origin, so moving
the target from station to station dollies the camera down a row (see byte_night.ts).
Angles are continuous: going from 175° to −200° spins the long way round, so write −185 instead of 175.
Shot vocabulary: push-in (`r` down), orbit (`a` changes), crane (`y` up, `tg` down to the floor), hero 3/4 (`a` ≈ 30–40°, `sx` ≈ 1.7), top-down (`y` ≈ 9, `r` ≈ 3.5, `fov` 40).

## Overlay (kit/overlay.ts), `this.ui`
| method | use |
|---|---|
| `kicker(text, x, y, t0, t1, {size, col, align, bar})` | small tracked mono label that decodes in: section markers "02 — AI SECURITY" |
| `title(runs, x, y, size, t0, t1, {align, track, fam, dur})` | display type rising out of a mask. `runs` = `[['HASEEB ASH','bone'],['FAQ','signal']]` |
| `body(text, x, y, size, t0, t1, {col, fam, align, a})` | a line that fades and lifts in |
| `pill(text, x, y, size, t0, t1, {align, col})` | status pill with a pulsing dot ("OPEN TO INTERNSHIPS") |
| `terminal(x, y, w, h, title, [[text, t, col]...], t0, t1, size)` | a terminal window that types each line at its time |
| `el(t0, t1, (c, t, a) => {...}, fi, fo)` | anything custom on the 2D canvas; `a` is the fade alpha |
| `decode(text, t, t0, cps)` | glitch-decode helper for custom elements |

Fonts: `DISPLAY(700)`, `MONO(400|600|700)`, `BODY(400|500|600)` follow `brand.json` `fonts`. Loaded families:
`Chakra` (500/600/700), `JBM` (400/600/700), `PlexSans` (400/500/600), `Archivo` via `F.archivo(width, weight)`,
`Plex` mono, `Cormorant` serif (see `engine/type.ts`). To add a font, drop the .woff in `app/public/fonts/` and add a DEFS line.

Safe areas: captions occupy y > 940. The HUD sits in a 48 px margin. When the subject is right-third, keep type in x 120–900.
Sizes that read at 1080p: kicker 22–26, body 30–40, titles 64–150.

## 3D building blocks (kit/world.ts)
| block | what |
|---|---|
| `new ShardCore(scene)` + `.update(t, {explode, jitter, glow, glowScale, fade, wire, ringBreak, ringsIn, latticeA})` | icosahedron of shards with glowing edges, inner light, lattice and guard rings. `explode` 0 whole, 0.6 cracked, 1.2+ blown apart |
| `new RadarFloor(scene)` + `.update(t, bright)` + `.ping(slot, x, z, t0, green)` | grid floor with radar rings, sweep and 4 ping slots |
| `dust(scene)` | drifting points (rotate `.rotation.y` slowly) |
| `holoCard(w, h, draw, frameColor)` → `{g, mat, frame}` | canvas-textured card with a wide-line frame (light it via `frame.color`) |
| `cardFace(name, sub, id, tag)` | the default card face drawing |
| `canvasTex(w, h, draw)` | any canvas-drawn texture (paper, labels, stamps) |
| `lineMat(color, px)` + `segments([x0,y0,z0,x1,y1,z1,…], mat)` | wide screen-space lines (WebGL lines are 1 px) |
| `col('signal', 2.5)` | palette colour × HDR intensity (> ~0.8 blooms) |
| `env(t, a, b, fi, fo)` | 0..1 visibility envelope |

**Lit scenes** (byte_night.ts): add a `HemisphereLight` + `DirectionalLight` and use `MeshLambertMaterial`. For soft shadows,
set `this.ctx.renderer.shadowMap.enabled = true`, `castShadow` on the light and objects, and a `ShadowMaterial` plane as a
shadow catcher. **Many objects:** use one `InstancedMesh` and set the matrices per frame (`setMatrixAt`, then `instanceMatrix.needsUpdate`).
**Light backgrounds:** raise `look.bloomThreshold` above the paper colour (~1.6) or the whole frame blooms.

Any three.js object works: `MeshBasicMaterial` (unlit, predictable colours) is the default look. Use
`transparent: true` and drive `opacity` with `env()` to fade props in and out per section.

## Engine helpers (engine/util.ts)
`prog(t, a, b, ease)` gives eased 0..1 progress, `pulse(t, t0, halfLife)` a decaying hit, `ease.*` (outCubic,
inOutQuart, outBack, outExpo…), `lerp`, `clamp`, `hash(i, seed)` a deterministic random, and `noise1(x, seed)` smooth noise.

## Project files
**script.json**
```json
{ "voice": {"engine": "kokoro", "voice": "am_michael", "speed": 1.0}, "lead": 0.8,
  "pronounce": {"Nmap": "En-map"},
  "lines": [{"id": "hook", "text": "…", "pause": 0.5, "say": "optional exact TTS text"}],
  "plates": [["my_scene", "hook"]] }
```
**brand.json**
```json
{ "name": "…", "handle": "kaido", "url": "example.com",
  "colors": {"ink": "#0A0D12", "signal": "#FF4044", "…": "…"},
  "fonts": {"display": "Chakra", "mono": "JBM", "body": "PlexSans"} }
```
**sfx.json**: see the header of `pipeline/mix.py`. The SFX library (`python3 pipeline/synth_sfx.py`) has
whoosh_soft, whoosh_fast, impact, hit_small, riser, reverse, glitch, blip, blip_low, tick, typing, chime, stamp, scan, zap and shatter.

## Render CLI (from `app/`, with `PROJECT=projects/<name>`)
```sh
bun scripts/render.ts sheet --times 2,5.5,9 --cols 4 --out /tmp/s.png     # contact sheet
bun scripts/render.ts stills --t 12.5 --out /tmp/stills                    # full-size frames
bun scripts/render.ts perf --from 10 --to 12 --scale 0.6666667             # ms per frame
bunx vite                                                                   # live preview (space, ←/→)
```
