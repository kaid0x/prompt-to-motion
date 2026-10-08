#!/usr/bin/env bash
# Join the rendered chunks, add the soundtrack (out/mix.m4a, else the bare narration) and encode the
# deliverable. MAX_MB caps the file size with a 2-pass encode (default 28, under most chat/upload limits).
#
#   pipeline/finish.sh projects/my-video            # -> projects/my-video/out/<name>.mp4
#   MAX_MB=95 NAME=launch pipeline/finish.sh projects/my-video
set -euo pipefail
cd "$(dirname "$0")/.."
PROJ=${1:-projects/portfolio-intro}
NAME=${NAME:-$(basename "$PROJ")}; MAX_MB=${MAX_MB:-28}
O="$PROJ/out"
(cd "$O/chunks" && ls c*.mp4 | sed "s/^/file '/;s/$/'/" > list.txt)
ffmpeg -v error -y -f concat -safe 0 -i "$O/chunks/list.txt" -c copy "$O/picture.mp4"
AUD="$O/mix.m4a"; [ -f "$AUD" ] || AUD="$PROJ/audio/voiceover.mp3"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$O/picture.mp4")
# video bitrate that lands at MAX_MB with 160k audio and ~3% container overhead (capped at 12 Mb/s)
VB=$(python3 -c "print(min(12000, int(($MAX_MB*8*1024*0.97/$DUR) - 160)))")
P="$O/x264pass"
ffmpeg -v error -y -i "$O/picture.mp4" -c:v libx264 -preset slow -b:v ${VB}k -pass 1 -passlogfile "$P" -an -f null /dev/null
ffmpeg -v error -y -i "$O/picture.mp4" -i "$AUD" -map 0:v -map 1:a -c:v libx264 -preset slow -b:v ${VB}k -maxrate $((VB*14/10))k -bufsize $((VB*2))k \
  -pass 2 -passlogfile "$P" -pix_fmt yuv420p -c:a aac -b:a 160k -shortest -movflags +faststart "$O/$NAME.mp4"
rm -f "$P"*
ls -lh "$O/$NAME.mp4" | awk '{print $5, $9}'
echo "DONE $O/$NAME.mp4"
