#!/usr/bin/env bash
# One-time setup: checks the tools, creates .venv with the Python packages, installs the app's
# packages, downloads the two local models and generates the SFX library. Safe to re-run.
set -e
cd "$(dirname "$0")"
MISSING=0
ok()   { printf '  \033[32mok\033[0m  %s\n' "$1"; }
miss() { printf '  \033[31mmissing\033[0m  %s\n' "$1"; MISSING=1; }

echo "Checking tools"
if command -v bun >/dev/null 2>&1; then ok "bun $(bun --version)"; else miss "bun: curl -fsSL https://bun.sh/install | bash   (then open a new terminal)"; fi
# kokoro-onnx supports Python 3.10-3.13 only, so pick the first compatible interpreter
PY=""
for c in python3.12 python3.13 python3.11 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)' 2>/dev/null; then PY="$c"; break; fi
done
if [ -n "$PY" ]; then ok "$($PY --version 2>&1) ($PY)"
else miss "Python 3.10-3.13 (found: $(python3 --version 2>&1 || echo none)): macOS: brew install python@3.12   Linux: sudo apt install python3.12 python3.12-venv"; fi
if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then ok "ffmpeg"; else miss "ffmpeg: macOS: brew install ffmpeg   Linux: sudo apt install ffmpeg"; fi
if [ -n "$CHROME_PATH" ] && [ -x "$CHROME_PATH" ]; then ok "Chrome (CHROME_PATH)"
elif [ -d "/Applications/Google Chrome.app" ]; then ok "Google Chrome"
elif command -v google-chrome >/dev/null 2>&1; then ok "Google Chrome"
elif [ -d "/c/Program Files/Google/Chrome" ] || [ -d "/mnt/c/Program Files/Google/Chrome" ]; then ok "Google Chrome"
else miss "Google Chrome: install it from google.com/chrome, or point CHROME_PATH at a Chrome/Chromium binary"; fi
if [ "$MISSING" = 1 ]; then echo; echo "Install what's missing above, then run ./setup.sh again."; exit 1; fi

echo; echo "Python packages (in .venv)"
if [ -x .venv/bin/python ] && ! .venv/bin/python -c 'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,13) else 1)' 2>/dev/null; then
  echo "  .venv uses an unsupported Python, recreating it"; rm -rf .venv
fi
[ -x .venv/bin/python ] || "$PY" -m venv .venv
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q -r requirements.txt
ok "installed"

echo; echo "App packages"
(cd app && bun install >/dev/null) && ok "installed"

echo; echo "Models (~215 MB, once)"
.venv/bin/python pipeline/get_models.py

echo; echo "Sound effects"
.venv/bin/python pipeline/synth_sfx.py >/dev/null && ok "sfx/ generated"

echo
echo "Done. In every new terminal, start with:"
echo "  cd $(pwd) && source .venv/bin/activate"
