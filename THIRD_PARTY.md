# Third-party components

| component | where | licence | notes |
|---|---|---|---|
| **pdoom-video** engine by Giacomo Magnanini ([mexicat/pdoom-video](https://github.com/mexicat/pdoom-video)) | `app/src/engine/`, `app/scripts/render.ts`, `app/src/main.ts`, `app/vite.config.ts` | MIT (`app/src/engine/LICENSE`) | Time-driven three.js renderer, HDR post (bloom, halation, grain), typography, headless-Chrome exporter. Modified here: project routing (`PROJECT`), brand-driven palette, Linux/Windows GPU flags and `CHROME_PATH`, fractional output scale, private dev server per render. |
| three.js | npm | MIT | |
| Fonts | `app/public/fonts/` | SIL OFL 1.1 / public domain | see `app/public/fonts/LICENSES.md` |
| Kokoro-82M TTS (ONNX build by thewh1teagle/kokoro-onnx) | downloaded to `models/kokoro/` | Apache-2.0 | not redistributed in this repo |
| wav2vec2-base-960h (facebook) | exported to `models/w2v2/` | Apache-2.0 | not redistributed in this repo |

Everything else (the `kit/`, the scenes, the `pipeline/`, the synthesized SFX in `sfx/`, the skill and the docs) is
original to this repo and MIT-licensed (see `LICENSE`).

Narration in the example projects was generated with Kokoro (voices `am_michael`, `bm_george`, `af_heart`). Byte Night and Lumen are fictional.
