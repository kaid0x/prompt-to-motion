#!/usr/bin/env bash
# Resumable chunked render of a project's video (picture only; the soundtrack is muxed by finish.sh).
# Chunks that already exist are skipped, so if the machine sleeps or the job dies, run it again.
#
#   pipeline/render.sh projects/my-video                 # 1080p30
#   SCALE=0.6666667 pipeline/render.sh projects/my-video # 720p, ~2x faster (no-GPU machines)
#   FPS=60 STEP=10 pipeline/render.sh projects/my-video
#
# Long renders on a remote/agent box: start it detached so it survives the session,
#   setsid nohup pipeline/render.sh projects/my-video > render.log 2>&1 &
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d .venv/bin ] && PATH="$PWD/.venv/bin:$PATH"  # setup.sh may have put ffmpeg here
PROJ=${1:-projects/portfolio-intro}
SCALE=${SCALE:-1}; FPS=${FPS:-30}; STEP=${STEP:-12}; CRF=${CRF:-16}
DUR=$(python3 pipeline/duration.py "$PROJ/audio/voiceover.mp3")
N=$(python3 -c "import math;print(math.ceil($DUR/$STEP))")
mkdir -p "$PROJ/out/chunks"
export PROJECT="$PROJ"
for ((i=0;i<N;i++)); do
  out="$PROJ/out/chunks/c$(printf %03d $i).mp4"
  [ -f "$out" ] && continue
  from=$(python3 -c "print($i*$STEP)"); to=$(python3 -c "print(min($DUR, ($i+1)*$STEP))")
  echo "chunk $((i+1))/$N  ${from}s-${to}s  $(date +%T)"
  (cd app && bun scripts/render.ts video --from "$from" --to "$to" --fps "$FPS" --samples 1 --crf "$CRF" --preset fast \
      --scale "$SCALE" --noaudio --out "../$PROJ/out/chunks/tmp_$i.mp4") > "$PROJ/out/chunks/log_$i.txt" 2>&1
  mv "$PROJ/out/chunks/tmp_$i.mp4" "$out"
done
echo "RENDERED $N chunks $(date +%T)"
