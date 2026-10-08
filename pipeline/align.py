"""Word timings for a narration: CTC forced alignment of the script against the audio.

A character-level CTC model (wav2vec2-base-960h, ONNX) gives per-frame log-probabilities (20 ms frames).
The whole script's spoken characters are aligned in ONE Viterbi pass, so a long read never drifts. Each
display word then gets the span of its characters. Works for any voice: TTS, ElevenLabs, your own mic.

    python3 pipeline/align.py projects/my-video            # uses models/w2v2/*.onnx (pipeline/get_models.py)

Reads  <project>/script.json (lines[].text, optional "pronounce") and <project>/audio/voiceover.mp3
Writes <project>/data/lyrics.json: { lines: [{ text, start, end, words: [{ w, start, end }] }] }
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).parent))
from textnorm import spoken  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
proj = Path(sys.argv[1] if len(sys.argv) > 1 else "projects/portfolio-intro").resolve()
MODEL_DIR = REPO / "models" / "w2v2"
SR, HOP = 16000, 320
FRAME = HOP / SR


def load_audio(p: Path) -> np.ndarray:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def emissions(y: np.ndarray) -> np.ndarray:
    """Log-softmax CTC emissions [T, V], computed in 30 s windows with 1 s overlap."""
    model = sorted(MODEL_DIR.glob("*.onnx"))
    if not model:
        sys.exit(f"no ONNX model in {MODEL_DIR}: run python3 pipeline/get_models.py")
    sess = ort.InferenceSession(str(model[0]), providers=["CPUExecutionProvider"])
    win, ov = 30 * SR, 1 * SR
    out, pos = [], 0
    while pos < len(y):
        seg = y[max(0, pos - ov): pos + win + ov]
        seg = (seg - seg.mean()) / (seg.std() + 1e-7)
        lg = sess.run(None, {sess.get_inputs()[0].name: seg[None, :].astype(np.float32)})[0][0]
        lo = 0 if pos == 0 else int(round(ov / HOP))
        n = int(round(min(win, len(y) - pos) / HOP))
        out.append(lg[lo: lo + n])
        pos += win
    lg = np.concatenate(out)
    lg = lg - lg.max(axis=1, keepdims=True)
    return lg - np.log(np.exp(lg).sum(axis=1, keepdims=True))


def viterbi(E: np.ndarray, tokens: list[int], blank: int) -> list[tuple[int, int]]:
    """Forced alignment over the CTC topology (blank, t0, blank, t1, ...). Returns (first, last) frame per token."""
    S = [blank]
    for t in tokens:
        S += [t, blank]
    S = np.array(S)
    T, N = len(E), len(S)
    NEG = -1e30
    # skip transitions allowed into a label when it differs from the label two states back
    skip = np.zeros(N, bool)
    skip[3::2] = S[3::2] != S[1:-2:2]
    dp = np.full(N, NEG); dp[0] = E[0, S[0]]; dp[1] = E[0, S[1]]
    back = np.zeros((T, N), np.int8)  # 0 stay, 1 from s-1, 2 from s-2
    for t in range(1, T):
        stay = dp
        prev1 = np.concatenate([[NEG], dp[:-1]])
        prev2 = np.where(skip, np.concatenate([[NEG, NEG], dp[:-2]]), NEG)
        cand = np.stack([stay, prev1, prev2])
        arg = cand.argmax(axis=0)
        dp = cand[arg, np.arange(N)] + E[t, S]
        back[t] = arg
    s = N - 1 if dp[N - 1] >= dp[N - 2] else N - 2
    path = np.zeros(T, int)
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(back[t, s])
    spans = []
    for k in range(len(tokens)):
        fr = np.where(path == 2 * k + 1)[0]
        spans.append((int(fr[0]), int(fr[-1])) if len(fr) else (-1, -1))
    return spans


def main():
    script = json.loads((proj / "script.json").read_text())
    pron = script.get("pronounce", {})
    vocab = json.loads((MODEL_DIR / "vocab.json").read_text())
    blank, sep = vocab["<pad>"], vocab["|"]
    y = load_audio(proj / "audio" / "voiceover.mp3")
    E = emissions(y)
    # tokens for the whole script; remember which display word each char belongs to
    tokens, owner, disp = [], [], []
    for li, line in enumerate(script["lines"]):
        for w in line["text"].split():
            wi = len(disp)
            disp.append((li, w))
            for sw in spoken(w, pron):
                for ch in sw:
                    if ch in vocab:
                        tokens.append(vocab[ch]); owner.append(wi)
                tokens.append(sep); owner.append(-1)
    spans = viterbi(E, tokens, blank)
    fr = {}
    for (a, b), o in zip(spans, owner):
        if o < 0 or a < 0:
            continue
        lo, hi = fr.get(o, (a, b))
        fr[o] = (min(lo, a), max(hi, b))
    words = []
    for wi, (li, w) in enumerate(disp):
        if wi in fr:
            a, b = fr[wi]
            words.append([li, w, a * FRAME, (b + 1) * FRAME + 0.04])
        else:  # silent display word (a dash): pin it to the previous word's end
            t = words[-1][3] if words else 0.0
            words.append([li, w, t, t])
    for i in range(len(words) - 1):  # never overlap the next word
        words[i][3] = min(words[i][3], max(words[i][2] + 0.05, words[i + 1][2]))
    lines = []
    for li, line in enumerate(script["lines"]):
        ws = [{"w": w, "start": round(s, 3), "end": round(e, 3)} for (l, w, s, e) in words if l == li]
        lines.append({"text": line["text"], "start": ws[0]["start"], "end": ws[-1]["end"], "words": ws})
    (proj / "data").mkdir(exist_ok=True)
    (proj / "data" / "lyrics.json").write_text(json.dumps({"source": "pipeline/align.py (wav2vec2 CTC)", "lines": lines}, indent=1))
    for l in lines:
        print(f"{l['start']:6.2f}-{l['end']:6.2f}  " + " ".join(f"{w['w']}[{w['start']:.2f}]" for w in l["words"]))


if __name__ == "__main__":
    main()
