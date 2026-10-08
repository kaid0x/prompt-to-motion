"""data/audio.json for a narration: the loudness envelopes the engine exposes to scenes (f.a.rms, ...),
voice onsets (word starts, if data/lyrics.json exists) and a nominal 120 BPM grid (narration has no beat;
the grid only feeds generic helpers).

    python3 pipeline/analyze_audio.py projects/my-video
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np

proj = Path(sys.argv[1] if len(sys.argv) > 1 else "projects/portfolio-intro").resolve()
SR, FPS = 16000, 100
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(proj / "audio" / "voiceover.mp3"), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                     capture_output=True, check=True).stdout
y = np.frombuffer(raw, dtype=np.float32)
dur = len(y) / SR
hop = SR // FPS
n = int(np.ceil(dur * FPS))
pad = np.concatenate([np.zeros(hop), y, np.zeros(3 * hop)])
frames = np.stack([pad[i * hop: i * hop + 2 * hop] for i in range(n)])
spec = np.abs(np.fft.rfft(frames * np.hanning(2 * hop), axis=1))
freqs = np.fft.rfftfreq(2 * hop, 1 / SR)


def norm(x):
    x = np.convolve(x, np.ones(3) / 3, mode="same")
    return np.clip(x / (np.percentile(x, 99.5) + 1e-9), 0, 1)


def band(lo, hi):
    return norm(np.sqrt((spec[:, (freqs >= lo) & (freqs < hi)] ** 2).mean(axis=1)))


rms = norm(np.sqrt((frames ** 2).mean(axis=1)))
feat = {"rms": rms, "vocal": band(150, 4000), "low": band(20, 250), "mid": band(250, 2000), "high": band(2000, 8000)}
for k in ("drums", "bass", "other"):
    feat[k] = np.zeros(n)

onsets = []
lp = proj / "data" / "lyrics.json"
if lp.exists():
    for line in json.loads(lp.read_text())["lines"]:
        for w in line["words"]:
            onsets.append([round(w["start"], 3), 1.0])

period = 0.5
beats = [round(i * period, 3) for i in range(int(dur / period) + 1)]
out = {
    "duration": round(dur, 3), "bpm": 120.0, "beat_period": period, "time_signature": 4,
    "beats": beats, "downbeats": beats[::4],
    "sections": [{"name": "narration", "start": 0.0, "end": round(dur, 3)}],
    "fps": FPS,
    "features": {k: [round(float(v), 4) for v in a] for k, a in feat.items()},
    "onsets": {"vonset": onsets, "kick": [], "snare": [], "hat": []},
}
(proj / "data").mkdir(exist_ok=True)
(proj / "data" / "audio.json").write_text(json.dumps(out))
print(f"audio.json: {dur:.2f}s, {n} frames, {len(onsets)} word onsets")
