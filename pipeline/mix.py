"""The soundtrack: narration + a synthesized music bed (drone, sub pulse, swells into big moments) + SFX
cues, all timed to WORDS from data/lyrics.json. Writes <project>/out/mix.m4a (-14 LUFS, web standard).

    python3 pipeline/mix.py projects/my-video

<project>/sfx.json (every key optional):
{
  "bed":    { "root": 55, "gain": 0.22, "intensity": [[0, 0.55], ["word:break", 0.8], ["end", 0.5]] },
  "pulse":  { "from": "word:started", "to": "word:open", "bpm": 92, "gain": 0.35 },
  "hits":   [ { "at": "word:break", "gain": 1.4 } ],           sub-drops under big moments
  "swells": [ { "to": "word:break", "len": 2.2 } ],              noise rises INTO a moment
  "cues":   [ { "at": "word:break", "sfx": "impact", "db": -10, "offset": -0.02 } ]
}
Times: seconds, "word:ghidra" (start of the first word starting with "ghidra"), "word:break#1" (the second
one), "wordend:injection", "line:hook" (a line id from data/cues.json), "end" (end of the audio).
SFX names are the files in sfx/ (python3 pipeline/synth_sfx.py), or a path to your own file.
"""
import json, subprocess, sys, wave
from pathlib import Path
import numpy as np
from scipy.signal import lfilter
sys.path.insert(0, str(Path(__file__).resolve().parent))
from duration import duration

REPO = Path(__file__).resolve().parent.parent
proj = Path(sys.argv[1] if len(sys.argv) > 1 else "projects/portfolio-intro").resolve()
SR = 44100
cfg = json.loads((proj / "sfx.json").read_text()) if (proj / "sfx.json").exists() else {}
words = [w for l in json.loads((proj / "data/lyrics.json").read_text())["lines"] for w in l["words"]]
cues_line = json.loads((proj / "data/cues.json").read_text()).get("cues", {}) if (proj / "data/cues.json").exists() else {}
D = duration(str(proj / "audio/voiceover.mp3"))


def norm(s): return "".join(c for c in s.lower() if c.isalnum() or c in "'*+%")


def T(ref) -> float:
    if isinstance(ref, (int, float)): return float(ref)
    if ref == "end": return D
    kind, _, q = ref.partition(":")
    if kind == "line": return cues_line[q][0]
    q, _, nth = q.partition("#")
    m = [w for w in words if norm(w["w"]).startswith(norm(q))]
    if not m: sys.exit(f"sfx.json: no word matching {ref!r}")
    w = m[int(nth or 0)]
    return w["end"] if kind == "wordend" else w["start"]


N = int(D * SR); t = np.arange(N) / SR
rng = np.random.default_rng(3)
lp = lambda x, a: lfilter([1 - a], [1, -a], x)

# ---- bed: a detuned drone + slow noise + a faint shimmer, shaped by an intensity curve
b = cfg.get("bed", {})
root = float(b.get("root", 55))
drone = np.sin(2 * np.pi * root * t) * 0.5 + np.sin(2 * np.pi * root * 1.4983 * t + 0.3) * 0.28 + np.sin(2 * np.pi * root * 2.004 * t) * 0.18
drone = np.tanh(drone * (0.75 + 0.25 * np.sin(2 * np.pi * t / 7.3)) * 1.4) * 0.55
bed = drone + lp(rng.standard_normal(N), 0.985) * 0.3 + lp(rng.standard_normal(N), 0.6) * 0.05 * (0.6 + 0.4 * np.sin(2 * np.pi * t / 5.1))
bed += (np.sin(2 * np.pi * root * 12 * t) + 0.6 * np.sin(2 * np.pi * root * 18 * t)) * 0.035 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 3.7))
pts = b.get("intensity", [[0, 0.6], [D * 0.5, 1.0], ["end", 0.5]])
xs, ys = zip(*sorted((T(a), v) for a, v in pts))
bed *= np.interp(t, xs, ys) * np.clip(t / 3, 0, 1) * np.clip((D - t) / 2.5, 0, 1) * float(b.get("gain", 0.22))

# ---- sub pulse and hits
sub = np.zeros(N)
def thump(t0, amp=1.0, f0=110, f1=42, dec=0.32):
    i0 = int(t0 * SR)
    if i0 >= N or i0 < 0: return
    tt = np.arange(min(int(0.9 * SR), N - i0)) / SR
    sub[i0:i0 + len(tt)] += np.sin(2 * np.pi * (f1 * tt + (f0 - f1) * 0.05 * (1 - np.exp(-tt / 0.05)))) * np.exp(-tt / dec) * amp
if "pulse" in cfg:
    p = cfg["pulse"]; per = 60 / float(p.get("bpm", 92)); x, k = T(p["from"]), 0
    while x < T(p["to"]):
        thump(x, 0.55 * float(p.get("gain", 0.35)) / 0.35)
        if k % 4 == 3: thump(x + per / 2, 0.18)
        x += per; k += 1
for h in cfg.get("hits", []):
    thump(T(h["at"]), float(h.get("gain", 1.0)), 140, 38, 0.6)
sub *= 0.35

# ---- swells
sw = np.zeros(N)
for s in cfg.get("swells", []):
    i1 = int(T(s["to"]) * SR); i0 = max(0, i1 - int(float(s.get("len", 2.0)) * SR))
    if i1 > i0:
        sw[i0:i1] += lp(rng.standard_normal(i1 - i0) * np.linspace(0, 1, i1 - i0) ** 2.5, 0.7) * 0.175

mix = bed + sub + sw
st = np.clip(np.stack([mix, np.roll(mix, 37) * 0.98], 1), -1, 1)
(proj / "out").mkdir(exist_ok=True)
with wave.open(str(proj / "out/bed.wav"), "wb") as f:
    f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes((st * 32767 * 0.9).astype("<i2").tobytes())

# ---- ffmpeg: voice chain, bed ducked under the voice, SFX on their cues, loudness-normalised
cue = cfg.get("cues", [])
a = ["ffmpeg", "-v", "error", "-y", "-i", str(proj / "audio/voiceover.mp3"), "-i", str(proj / "out/bed.wav")]
fl = ["[0:a]aresample=44100,aformat=channel_layouts=stereo,highpass=f=70,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,volume=1dB,asplit=2[vo][sc]",
      "[1:a]aformat=sample_rates=44100:channel_layouts=stereo[bedr]",
      "[bedr][sc]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=350[bed]"]
for i, c in enumerate(cue):
    src = Path(c["sfx"]) if "/" in c["sfx"] else REPO / "sfx" / f"{c['sfx']}.wav"
    if not src.exists(): sys.exit(f"missing sfx {src} (run python3 pipeline/synth_sfx.py)")
    a += ["-i", str(src)]
    ms = max(0, int((T(c["at"]) + float(c.get("offset", 0))) * 1000))
    fl.append(f"[{i + 2}:a]aformat=sample_rates=44100:channel_layouts=stereo,volume={c.get('db', -14)}dB,adelay={ms}|{ms}[s{i}]")
if cue:
    fl.append("".join(f"[s{i}]" for i in range(len(cue))) + f"amix=inputs={len(cue)}:normalize=0:duration=longest[fx]")
    fl.append(f"[vo][bed][fx]amix=inputs=3:normalize=0:duration=longest,atrim=0:{D},loudnorm=I=-14:TP=-1.2:LRA=9[out]")
else:
    fl.append(f"[vo][bed]amix=inputs=2:normalize=0:duration=longest,atrim=0:{D},loudnorm=I=-14:TP=-1.2:LRA=9[out]")
a += ["-filter_complex", ";".join(fl), "-map", "[out]", "-ar", "44100", "-c:a", "aac", "-b:a", "192k", str(proj / "out/mix.m4a")]
subprocess.run(a, check=True)
print(f"out/mix.m4a  {D:.2f}s, {len(cue)} sfx cues")
