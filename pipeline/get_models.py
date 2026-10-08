"""Download the two local models the pipeline uses (once, ~215 MB total). Both run on CPU.

  models/kokoro/   Kokoro-82M TTS, int8 ONNX + voices         (Apache-2.0, github.com/thewh1teagle/kokoro-onnx)
  models/w2v2/     wav2vec2-base-960h CTC aligner, ONNX + vocab (Apache-2.0, facebook/wav2vec2-base-960h)

    python3 pipeline/get_models.py            # both
    python3 pipeline/get_models.py kokoro     # just one

The aligner downloads from this repo's v0.1.0 release. If that fails, it is exported from the Hugging Face
checkpoint instead, which needs `pip install torch transformers` once.
"""
import json, subprocess, sys, urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
want = set(sys.argv[1:]) or {"kokoro", "w2v2"}


def fetch(url: str, dst: Path):
    if dst.exists() and dst.stat().st_size > 0:
        print(f"have {dst.relative_to(REPO)}"); return
    dst.parent.mkdir(parents=True, exist_ok=True)
    print(f"get  {url}")
    tmp = dst.with_suffix(dst.suffix + ".part")
    try:
        urllib.request.urlretrieve(url, tmp)
    except Exception as e:  # noqa: BLE001  python.org builds on macOS often lack SSL certificates; curl has them
        print(f"     urllib failed ({e}), retrying with curl")
        subprocess.run(["curl", "-fL", "--retry", "3", "-o", str(tmp), url], check=True)
    tmp.rename(dst)


if "kokoro" in want:
    base = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
    fetch(base + "kokoro-v1.0.int8.onnx", REPO / "models/kokoro/kokoro-v1.0.int8.onnx")
    fetch(base + "voices-v1.0.bin", REPO / "models/kokoro/voices-v1.0.bin")

if "w2v2" in want:
    out = REPO / "models/w2v2"
    out.mkdir(parents=True, exist_ok=True)
    (out / "vocab.json").write_text((REPO / "pipeline/w2v2_vocab.json").read_text())
    if list(out.glob("*.onnx")):
        print("have models/w2v2/*.onnx")
    else:
        # a quantized ONNX export of facebook/wav2vec2-base-960h (Apache-2.0), attached to the v0.1.0 release
        try:
            fetch("https://github.com/kaid0x/prompt-to-motion/releases/download/v0.1.0/w2v2_base_960h_q.onnx", out / "w2v2_base_960h_q.onnx")
        except Exception as e:  # noqa: BLE001
            print("release download failed (", e, "): exporting from Hugging Face instead (needs: pip install torch transformers)")
            import torch
            from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
            name = "facebook/wav2vec2-base-960h"
            proc = Wav2Vec2Processor.from_pretrained(name)
            model = Wav2Vec2ForCTC.from_pretrained(name).eval()
            (out / "vocab.json").write_text(json.dumps(proc.tokenizer.get_vocab()))
            torch.onnx.export(model, (torch.zeros(1, 16000),), str(out / "w2v2_base_960h.onnx"), input_names=["input_values"], output_names=["logits"],
                              dynamic_axes={"input_values": {0: "batch", 1: "samples"}, "logits": {0: "batch", 1: "frames"}}, opset_version=17)
print("models ready")
