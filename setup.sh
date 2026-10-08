#!/usr/bin/env bash
# One-time setup: checks the tools, creates .venv with the Python packages, installs the app's packages,
# downloads the two local models and generates the SFX library. If ffmpeg is missing it installs one into .venv.
# Safe to re-run: finished steps are skipped.
set -e
cd "$(dirname "$0")"
ok()   { printf '  \033[32mok\033[0m       %s\n' "$1"; }
warn() { printf '  \033[33mmissing\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mmissing\033[0m  %s\n' "$1"; }
have_ffmpeg() { command -v ffmpeg >/dev/null 2>&1 || [ -x .venv/bin/ffmpeg ]; }

echo "Checking tools"
BLOCKED=0
if command -v bun >/dev/null 2>&1; then ok "bun $(bun --version)"
else fail "bun: curl -fsSL https://bun.sh/install | bash   (then open a new terminal)"; BLOCKED=1; fi

# kokoro-onnx supports Python 3.10-3.13 only, so pick the first compatible interpreter
PYOK='import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)'
PY=""
for c in python3.12 python3.13 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c "$PYOK" 2>/dev/null; then PY="$c"; break; fi
done
if [ -n "$PY" ]; then ok "$($PY --version 2>&1) ($PY)"
else fail "Python 3.10-3.13 (found: $(python3 --version 2>&1 || echo none)). macOS: brew install python@3.12   Linux: sudo apt install python3.12 python3.12-venv"; BLOCKED=1; fi

if have_ffmpeg; then ok "ffmpeg"
else warn "ffmpeg: will install one into .venv below (from the imageio-ffmpeg package)"; fi

CHROME=0
if [ -n "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ]; then ok "Chrome (CHROME_PATH)"; CHROME=1
elif [ -d "/Applications/Google Chrome.app" ] || command -v google-chrome >/dev/null 2>&1 \
  || [ -d "/c/Program Files/Google/Chrome" ] || [ -d "/mnt/c/Program Files/Google/Chrome" ]; then ok "Google Chrome"; CHROME=1
else warn "Google Chrome: install it from google.com/chrome, or point CHROME_PATH at a Chrome/Chromium binary"; fi

if [ "$BLOCKED" = 1 ]; then echo; echo "Install what's marked missing above, then run ./setup.sh again."; exit 1; fi

echo; echo "Python packages (in .venv)"
if [ -x .venv/bin/python ] && ! .venv/bin/python -c "$PYOK" 2>/dev/null; then
  echo "  .venv uses an unsupported Python, recreating it"; rm -rf .venv
fi
[ -x .venv/bin/python ] || "$PY" -m venv .venv
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q -r requirements.txt
ok "installed"

if ! have_ffmpeg; then
  # A static ffmpeg build (with x264 and mp3) from PyPI, so no Homebrew needed. Homebrew no longer ships
  # bottles for Intel Macs and compiles ffmpeg from source there, which takes a very long time.
  echo; echo "ffmpeg (imageio-ffmpeg package, into .venv/bin)"
  .venv/bin/python -m pip install -q imageio-ffmpeg
  FF=$(.venv/bin/python -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())")
  ln -sf "$FF" .venv/bin/ffmpeg
  .venv/bin/ffmpeg -version >/dev/null && ok "$(.venv/bin/ffmpeg -version | head -1 | cut -d' ' -f1-3)"
fi

echo; echo "App packages"
(cd app && bun install >/dev/null) && ok "installed"

echo; echo "Models (~215 MB, once)"
.venv/bin/python pipeline/get_models.py

echo; echo "Sound effects"
.venv/bin/python pipeline/synth_sfx.py >/dev/null && ok "sfx/ generated"

echo
if ! have_ffmpeg || [ "$CHROME" = 0 ]; then
  echo "Almost done. Still missing (see above):"
  have_ffmpeg || echo "  - ffmpeg"
  [ "$CHROME" = 1 ] || echo "  - Google Chrome"
  echo "Install them, then run ./setup.sh again."
else
  echo "Done. In every new terminal, start with:"
  echo "  cd $(pwd) && source .venv/bin/activate"
fi
