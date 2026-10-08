---
name: motion-video
description: Make a narrated, word-synced motion-graphics video (MP4) from a prompt with the prompt-to-motion repo, covering script, voice, word alignment, three.js scenes, contact-sheet checks, chunked render, music and SFX, and size-capped export. Use for intros, explainers, launch teasers, event openers and social clips, or to change one of these videos.
---

# Motion video: prompt to MP4

You turn a brief into a finished, narrated motion-graphics video rendered from code. Every frame is a
pure function of time. The narration is the timeline: each spoken word cues the camera, the type, the 3D
objects and the sound. No editor and no keyframes by hand.

The repo is **prompt-to-motion** (`github.com/kaid0x/prompt-to-motion`). If it isn't in the working
directory, clone it first. Everything below refers to its layout:

```
app/src/scenes/<scene>.ts     one scene module per video (copy starter.ts or portfolio_intro.ts)
app/src/kit/                  Stage, camera rig, words/timing, overlay type, 3D building blocks
projects/<name>/              one folder per video:
  script.json                 the words, the voice, which scene plays        (you write this)
  brand.json                  colours, fonts, handle/url                      (you write this)
  sfx.json                    music bed, sub hits, swells, SFX on words       (you write this)
  audio/voiceover.mp3         narration (tts.py, or the user's own file)
  data/lyrics.json            word timings (align.py)
  data/audio.json             loudness envelopes (analyze_audio.py)
  data/cues.json              which scene plays when (tts.py, or by hand)
pipeline/                     tts.py, align.py, analyze_audio.py, synth_sfx.py, mix.py, render.sh, finish.sh
```

Read `references/scene-api.md` before writing a scene and `references/pitfalls.md` before rendering.
`references/prompts.md` has example briefs and what each one turns into, and `references/troubleshooting.md`
covers errors. These files sit next to this SKILL.md, and in the repo at `skill/motion-video/references/`.

## Workflow

### 0. Set up (once per machine)
```sh
cd app && bun install && cd ..
pip install onnxruntime kokoro-onnx soundfile numpy scipy
python pipeline/get_models.py      # Kokoro TTS + wav2vec2 aligner (~170 MB, CPU)
python pipeline/synth_sfx.py       # royalty-free SFX library -> sfx/
```
You also need ffmpeg and Chrome. On Linux servers, set `CHROME_PATH=/path/to/chrome`.

### 1. The brief
Settle these from the prompt and any links or files the user gives. Ask only about what you can't infer.
- **Purpose and viewer:** who watches, where (LinkedIn autoplay is muted, so captions matter), and what they should do next.
- **Length:** 30–60 s is the sweet spot. That's about 2.3 spoken words per second, so 70–140 words.
- **Facts:** pull them from the user's site, CV or docs. Never invent achievements, numbers or titles. If you add descriptive filler (a tool's one-line description, say), tell the user which parts you added.
- **Brand:** colours and fonts from the site's CSS variables, logo colours or a poster. Map them to the 9 roles in `brand.json`: ink (background), ink2 (surfaces), graphite (lines), ash (secondary text), bone (primary text), signal (the one accent), ember (hot accent), blood (deep accent), acid (rare second accent).
- **Voice:** Kokoro (free, local: `am_michael`, `bm_george`, `af_heart`...) or the user's own ElevenLabs or mic file.
- **Deliverable:** resolution, and a size cap if it must fit an upload limit (`MAX_MB`).

### 2. The script (`projects/<name>/script.json`)
- Write a **hook** in the first 3 seconds (a contrast, a claim, a question), then one idea per line and a call to action at the end.
- One line = one beat = one visual idea. Short lines cut better than long ones.
- Write the display form (`WSH '26`, `30+`, `AI`). `textnorm.py` speaks it correctly, and `"pronounce"` fixes names (`"Nmap": "En-map"`).
- Give `pause` after each line (0.35–0.55 s) and ~2.5 s after the last one for the end card.
- `"plates": [["my_scene", "first_line_id"]]` picks the scene module.

### 3. Voice, timings, envelopes
```sh
python pipeline/tts.py projects/<name>          # skip if the user supplies a voice file
python pipeline/align.py projects/<name>        # -> data/lyrics.json (check the printout!)
python pipeline/analyze_audio.py projects/<name>
```
Read align's printout. Every word should land in order with plausible gaps. If a name is off, add it to
`pronounce` and re-run. **With a user-supplied file** (ElevenLabs, say): pad it to ~0.8 s lead and ~2.5 s tail
with ffmpeg, save it as `audio/voiceover.mp3`, write `data/cues.json` as `{"plates": [["my_scene", 0]]}`,
then run align and analyze. Transcribe-check that the read matches the script before aligning.

**Replacing the voice of a finished video:** copy the old `data/lyrics.json` to `data/lyrics.layout.json`
first, then align the new read. Literal times wrapped in `M()` re-time automatically, and `WT()` times
were already word-based.

### 4. Beat sheet (before any code)
Make a small table, one row per line: the line, the **trigger word**, what the **object** does, where
the **camera** goes, the **type** on screen (2–5 words, not the full sentence, since captions carry that) and
the **sound**. Plan one big moment per ~10 s (a shatter, a flash, a stamp) and quieter beats around it.

### 5. The scene (`app/src/scenes/<scene>.ts`)
Start from the example closest to the brief, and change the look rather than reusing it unchanged:
| example | look | techniques |
|---|---|---|
| `starter.ts` | dark, one accent | the smallest complete video |
| `portfolio_intro.ts` | dark "case file", orbiting camera | holo cards, node graph, towers, props, stations on a ring |
| `byte_night.ts` | light editorial data story | lit + shadowed 3D, InstancedMesh (1,400 objects), rolling counters, dolly down a street (`rig.relative`) |
| `lumen.ts` | calm premium product teaser | gradient sky, bokeh, one hero object, near-still camera, centred light type, no HUD |

Extend `Stage`:
`build()` creates objects, camera keys and type, and `update(t, f)` moves objects as a pure function of `t`.
**Every time comes from a word:** `WT('ghidra')`, `WE('injection')`, `LINE('every').end`, `WT('break', 1)`.

### 6. Check before rendering (non-negotiable)
```sh
cd app && PROJECT=projects/<name> bun scripts/render.ts sheet --times 1.5,4,7.5,... --cols 4 --out /tmp/sheet.png
```
Look at the sheet. Include a time inside **every beat** and **every transition**. Check for text
overflow or collisions, type under the captions band, cards overlapping, things cropped at frame edges, a glow
behind a title, empty frames and mirrored backs. Fix, re-sheet, repeat. It takes ~1 minute and saves a
30-minute re-render.

### 7. Render (chunked, resumable)
```sh
SCALE=0.6666667 pipeline/render.sh projects/<name>   # 720p30, ~1 s/frame on CPU-only boxes
pipeline/render.sh projects/<name>                    # 1080p30 (use with a GPU)
```
In an agent sandbox, start it **detached** (`setsid nohup ... &`) and poll the log in short foreground waits,
because a user message can cancel your foreground command and idle sandboxes get recycled. Chunks that exist are
skipped, so re-running resumes. Tell the user the ETA and that a new message might interrupt the render.

### 8. Sound
Write `projects/<name>/sfx.json` (bed, pulse, hits, swells, cues on words; see scene-api.md), then:
```sh
python pipeline/mix.py projects/<name>       # -> out/mix.m4a, -14 LUFS, bed ducked under the voice
```
Keep SFX 8–20 dB under the voice. Put whooshes 0.3 s *before* a camera move, impacts *on* the word, and risers ending *on* it.

### 9. Finish and deliver
```sh
MAX_MB=28 NAME=<file> pipeline/finish.sh projects/<name>    # concat + mux + 2-pass size-capped H.264
```
Pull 4 frames from the final MP4 with ffmpeg and look at them before sending. Then deliver the file and
say in one or two lines what's in it, plus anything the user should verify (facts you inferred, licence
notes such as ElevenLabs free-plan attribution).

## Iterating on feedback
- "Text goes out of the badge" → measure and fit (see pitfalls), then re-sheet every beat, because the same flaw usually appears elsewhere.
- "Change the colours" → edit `brand.json`. No scene changes needed.
- "Better voice" → step 3 with the layout trick, then re-render (the timing moved).
- "Louder whoosh" or "less music" → edit `sfx.json`, then run `mix.py` and `finish.sh`. The picture doesn't need re-rendering.
- "Faster or shorter" → shorten the script, not the animation. Re-run tts, align and analyze, and the scene re-times itself.
