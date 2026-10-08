"""Narration from script.json with Kokoro (local, free, Apache-2.0), one clip per line with the line's
pause after it, so the timeline knows exactly where each line starts.

    python3 pipeline/tts.py projects/my-video                 # voice from script.json
    python3 pipeline/tts.py projects/my-video --voice af_heart

Writes <project>/audio/voiceover.mp3 and <project>/data/cues.json:
    { duration, plates: [[scene_id, start_s], ...], cues: { line_id: [start, end] } }
script.json "plates": [["my_scene", "first_line_id"], ...] puts each scene's start on its first line.

Using a different voice (ElevenLabs, your own recording)? Skip this script: save the read as
audio/voiceover.mp3 (lead with ~0.8 s of silence, end with ~2.5 s for the end card), write
data/cues.json by hand ({"plates": [["my_scene", 0]]}) and go on with align.py.

Voices worth trying: am_michael, am_adam, bm_george (male), af_heart, af_bella, bf_emma (female).
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

sys.path.insert(0, str(Path(__file__).parent))
from textnorm import tts_text  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
proj = Path(args[0] if args else "projects/portfolio-intro").resolve()
script = json.loads((proj / "script.json").read_text())
vc = script.get("voice", {})
voice = sys.argv[sys.argv.index("--voice") + 1] if "--voice" in sys.argv else vc.get("voice", "am_michael")
speed = float(vc.get("speed", 1.0))
M = REPO / "models" / "kokoro"
k = Kokoro(str(M / "kokoro-v1.0.int8.onnx"), str(M / "voices-v1.0.bin"))

SR = 24000
lead = float(script.get("lead", 0.8))
t, audio, cues = lead, [np.zeros(int(lead * SR), np.float32)], {}
for i, line in enumerate(script["lines"]):
    lid = line.get("id", f"l{i}")
    say = line.get("say") or tts_text(line["text"], script.get("pronounce"))
    s, sr = k.create(say, voice=voice, speed=speed, lang=vc.get("lang", "en-us"))
    s = s.astype(np.float32)
    on = np.abs(s) > 0.01
    i0, i1 = int(np.argmax(on)), len(s) - int(np.argmax(on[::-1]))
    s = s[max(0, i0 - 240): min(len(s), i1 + 1200)]  # trim the clip's own silences, keep a breath
    gap = float(line.get("pause", 0.45 if i + 1 < len(script["lines"]) else 2.5))
    cues[lid] = [round(t, 3), round(t + len(s) / SR, 3)]
    audio += [s, np.zeros(int(gap * SR), np.float32)]
    t += len(s) / SR + gap
    print(f"{cues[lid][0]:6.2f}  {lid:10} {say}")

y = np.concatenate(audio)
y = y / (np.abs(y).max() + 1e-9) * 0.89
(proj / "audio").mkdir(exist_ok=True)
(proj / "data").mkdir(exist_ok=True)
wav = proj / "audio" / "narration.wav"
sf.write(wav, y, SR)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "192k", str(proj / "audio" / "voiceover.mp3")], check=True)
plates = [[pid, cues[first][0] if isinstance(first, str) else float(first)] for pid, first in script.get("plates", [])]
if plates:
    plates[0][1] = 0.0  # the first scene starts with the video
(proj / "data" / "cues.json").write_text(json.dumps({"duration": round(len(y) / SR, 3), "plates": plates, "cues": cues}, indent=1))
print(f"{voice}: {len(y) / SR:.2f} s -> audio/voiceover.mp3, data/cues.json")
