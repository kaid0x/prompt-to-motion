# Troubleshooting

| symptom | cause and fix |
|---|---|
| `browserType.launch: Chromium distribution 'chrome' is not found` | Install Google Chrome, or point at a Chromium binary: `CHROME_PATH=/path/to/chrome`. |
| Rendering is very slow (≈1–2 s per frame) | No GPU, so WebGL runs on SwiftShader. Draft at 720p (`SCALE=0.6666667`) and 30 fps, and render the final on a machine with a GPU (Mac: Metal, Windows: D3D11; set automatically). |
| `word not found in data/lyrics.json: "x"` | The script changed or the spelling differs. Re-run `align.py` and copy the word from its printout. |
| Words land in the wrong place | Check align's printout. Fix names with `"pronounce"`, make sure the audio actually reads the script (transcribe it), and re-align. |
| A frame has a strong red/coloured tint in `--only` renders | Another plate overlapping that time wasn't loaded. Render without `--only`. |
| Element flashes white / NaN | An `Infinity` end time or a divide-by-zero in a fade. Use finite times. |
| Camera drifts slowly through a whole section | A missing hold key before the move (see scene-api.md, Camera). |
| Fonts look like Times / fallback | The family name in `font()` doesn't match `engine/type.ts` DEFS, or the file is missing from `app/public/fonts`. |
| `bun install` errors on a Windows-copied folder | `node_modules` from another OS. Delete it and run `bun install` again. |
| File too big to send | `MAX_MB=28 pipeline/finish.sh projects/<name>`. It re-encodes 2-pass to the cap without re-rendering. |
| Render died halfway | Run `pipeline/render.sh` again. Finished chunks are skipped. Start long renders with `setsid nohup … &`. |
| `no ONNX model in models/w2v2` | `python pipeline/get_models.py` (needs `pip install torch transformers` once for the export). |
| Kokoro mispronounces a word | `"pronounce": {"Kaido": "Kai-doh"}`, or a per-line `"say"` with the exact text to read. |
