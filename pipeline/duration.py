"""Print a media file's duration in seconds. Uses ffprobe when it is installed, otherwise ffmpeg alone
(the ffmpeg that setup.sh installs from the imageio-ffmpeg package has no ffprobe).

    python3 pipeline/duration.py projects/my-video/audio/voiceover.mp3
"""
import re, shutil, subprocess, sys


def duration(path: str) -> float:
    if shutil.which("ffprobe"):
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                             capture_output=True, text=True).stdout.strip()
        if out:
            return float(out)
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", path], capture_output=True, text=True).stderr
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    if not m:
        sys.exit(f"could not read the duration of {path}:\n{err.strip()[-400:]}")
    h, mnt, s = m.groups()
    return int(h) * 3600 + int(mnt) * 60 + float(s)


if __name__ == "__main__":
    print(f"{duration(sys.argv[1]):.6f}")
