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
| `no ONNX model in models/w2v2` | `python3 pipeline/get_models.py`. It downloads the model from the v0.1.0 release; if that fails it exports it locally (needs `pip install torch transformers`). |
| `command not found: python` / `pip` (macOS) | Macs only ship `python3`. Run `./setup.sh`, then `source .venv/bin/activate` in each new terminal. |
| `ModuleNotFoundError: kokoro_onnx` (or numpy, soundfile…) | The venv isn't active. `source .venv/bin/activate`, or re-run `./setup.sh`. |
| `ffprobe: command not found` | Run `./setup.sh` (on Intel Macs it downloads ffmpeg into `.venv/bin`), then `source .venv/bin/activate`. Otherwise install ffmpeg: `brew install ffmpeg` (Apple Silicon), `sudo apt install ffmpeg` (Debian/Ubuntu). |
| `brew install ffmpeg` builds for ages on an Intel Mac | Homebrew stopped shipping Intel bottles in 2026 and compiles from source. Cancel it and run `./setup.sh`, which fetches a static Intel build. |
| zsh: `no matches found` or `command not found: #` | You pasted a line with a `# comment` or a glob. Paste the README commands one block at a time, as written. |
| `waitForFunction: Target page, context or browser has been closed` | Usually run from the wrong folder or with a `PROJECT` that doesn't exist. Run render commands from the repo root as `pipeline/render.sh projects/<name>`. Also happens if the run is interrupted with Ctrl+C. |
| Kokoro mispronounces a word | `"pronounce": {"Kaido": "Kai-doh"}`, or a per-line `"say"` with the exact text to read. |
