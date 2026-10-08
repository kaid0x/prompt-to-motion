"""Download the two local models the pipeline uses (once, ~170 MB total). Both run on CPU.

  models/kokoro/   Kokoro-82M TTS, int8 ONNX + voices         (Apache-2.0, github.com/thewh1teagle/kokoro-onnx)
  models/w2v2/     wav2vec2-base-960h CTC aligner, ONNX + vocab (Apache-2.0, facebook/wav2vec2-base-960h)

    python pipeline/get_models.py            # both
    python pipeline/get_models.py kokoro     # just one

The aligner is exported from the Hugging Face checkpoint with PyTorch the first time (needs
`pip install torch transformers`); after that only onnxruntime is needed.
"""
import json, sys, urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
want = set(sys.argv[1:]) or {"kokoro", "w2v2"}


def fetch(url: str, dst: Path):
    if dst.exists() and dst.stat().st_size > 0:
        print(f"have {dst.relative_to(REPO)}"); return
    dst.parent.mkdir(parents=True, exist_ok=True)
    print(f"get  {url}")
    tmp = dst.with_suffix(dst.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(dst)


if "kokoro" in want:
    base = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
    fetch(base + "kokoro-v1.0.int8.onnx", REPO / "models/kokoro/kokoro-v1.0.int8.onnx")
    fetch(base + "voices-v1.0.bin", REPO / "models/kokoro/voices-v1.0.bin")

if "w2v2" in want:
    out = REPO / "models/w2v2"
    if list(out.glob("*.onnx")):
        print("have models/w2v2/*.onnx")
    else:
        import torch
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
        name = "facebook/wav2vec2-base-960h"
        print(f"export {name} -> ONNX")
        out.mkdir(parents=True, exist_ok=True)
        proc = Wav2Vec2Processor.from_pretrained(name)
        model = Wav2Vec2ForCTC.from_pretrained(name).eval()
        (out / "vocab.json").write_text(json.dumps(proc.tokenizer.get_vocab()))
        x = torch.zeros(1, 16000)
        torch.onnx.export(model, (x,), str(out / "w2v2_base_960h.onnx"), input_names=["input_values"], output_names=["logits"],
                          dynamic_axes={"input_values": {0: "batch", 1: "samples"}, "logits": {0: "batch", 1: "frames"}}, opset_version=17)
        try:  # 4x smaller, same alignments
            from onnxruntime.quantization import quantize_dynamic, QuantType
            quantize_dynamic(str(out / "w2v2_base_960h.onnx"), str(out / "w2v2_base_960h_q.onnx"), weight_type=QuantType.QUInt8)
            (out / "w2v2_base_960h.onnx").unlink()
        except Exception as e:  # noqa: BLE001
            print("quantization skipped:", e)
print("models ready")
