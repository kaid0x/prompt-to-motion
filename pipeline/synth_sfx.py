"""A royalty-free SFX library, synthesized from noise and sines (no samples, nothing to license):
whooshes, impacts, risers, glitches, UI blips, typing, a chime, a stamp, a scanner sweep, shattering glass.
Deterministic (seeded), so everyone who runs it gets the same files.

    python3 pipeline/synth_sfx.py          # -> sfx/*.wav (44.1 kHz stereo)
"""
from pathlib import Path
import numpy as np
from scipy.signal import butter, lfilter, sosfilt
import wave

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "sfx"
rng = np.random.default_rng(7)


def t_(d): return np.arange(int(d * SR)) / SR
def noise(d): return rng.standard_normal(int(d * SR))
def env(n, a, d, curve=3.0):
    x = np.ones(n); ai = int(a * SR)
    if ai: x[:ai] = np.linspace(0, 1, ai) ** 2
    x[ai:] = np.exp(-np.linspace(0, curve, n - ai)) if d else 1
    return x
def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)
def lp(x, f, order=2): return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)
def hp(x, f, order=2): return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)
def sweep_filter(x, f0, f1, q=3.0, steps=48):
    """Band-pass with a moving centre (blockwise), for whooshes and risers."""
    out = np.zeros_like(x); n = len(x); blk = n // steps + 1; zi = None
    for i in range(steps):
        a, b = i * blk, min(n, (i + 1) * blk)
        if a >= n: break
        fc = f0 * (f1 / f0) ** (i / (steps - 1))
        lo, hi = max(30, fc / (1 + 1 / q)), min(SR / 2 - 100, fc * (1 + 1 / q))
        bb, aa = butter(2, [lo, hi], btype="band", fs=SR)
        if zi is None: zi = np.zeros(max(len(aa), len(bb)) - 1)
        out[a:b], zi = lfilter(bb, aa, x[a:b], zi=zi)
    return out
def stereo(x, width=0.0):
    d = int(0.0007 * SR * width)
    r = np.concatenate([np.zeros(d), x[:len(x) - d]]) if d else x
    return np.stack([x, r], 1)
def save(name, x):
    x = np.asarray(x, float)
    if x.ndim == 1: x = stereo(x, 1)
    x = x / (np.abs(x).max() + 1e-9) * 0.89
    fade = min(len(x), int(0.004 * SR)); x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    OUT.mkdir(exist_ok=True)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as f:
        f.setnchannels(2); f.setsampwidth(2); f.setframerate(SR); f.writeframes((x * 32767).astype("<i2").tobytes())
    print(f"sfx/{name}.wav  {len(x) / SR:.2f}s")


def whoosh(d=0.9, f0=300, f1=3200, peak=0.6):
    n = noise(d); x = sweep_filter(n, f0, f1, q=2.2)
    tt = t_(d); e = np.exp(-((tt / d - peak) ** 2) / 0.05)
    return x * e
def impact(d=1.4, sub=48):
    tt = t_(d)
    body = np.sin(2 * np.pi * (sub * tt + 60 * 0.04 * (1 - np.exp(-tt / 0.04)))) * np.exp(-tt / 0.35)
    crack = lp(noise(d), 2500) * np.exp(-tt / 0.05)
    tail = lp(noise(d), 600) * np.exp(-tt / 0.5) * 0.25
    return np.tanh(1.6 * (body + 0.6 * crack + tail))
def hit_small(d=0.5):
    tt = t_(d)
    return np.sin(2 * np.pi * 95 * tt) * np.exp(-tt / 0.08) + bp(noise(d), 800, 4000) * np.exp(-tt / 0.02) * 0.5
def riser(d=2.4):
    tt = t_(d); k = (tt / d) ** 2
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * k) / SR) * 0.25 * k
    return (sweep_filter(noise(d), 200, 6000, q=3) * k + tone)
def reverse(d=1.1):
    x = impact(d, 60)[::-1]
    return x * np.linspace(0, 1, len(x)) ** 1.5
def glitch(d=0.45):
    x = noise(d); tt = t_(d)
    gate = (np.floor(tt * 60) % 3 != 0).astype(float)
    crush = np.round(x * 4) / 4
    tone = np.sign(np.sin(2 * np.pi * (300 + 1200 * rng.random()) * tt))
    return (bp(crush, 1200, 7000) * 0.7 + tone * 0.25) * gate * np.exp(-tt / 0.25)
def blip(f=1320, d=0.12):
    tt = t_(d); return np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.03) + 0.3 * np.sin(2 * np.pi * 2 * f * tt) * np.exp(-tt / 0.015)
def tick(d=0.05):
    tt = t_(d); return hp(noise(d), 3000) * np.exp(-tt / 0.004)
def typing(n=14, gap=0.075, d=1.2):
    x = np.zeros(int(d * SR))
    for i in range(n):
        a = int((i * gap + rng.uniform(-0.012, 0.012)) * SR)
        if a < 0 or a >= len(x): continue
        c = tick(0.04) * rng.uniform(0.5, 1.0) + bp(noise(0.04), 300, 1200) * np.exp(-t_(0.04) / 0.006) * 0.4
        x[a:a + len(c)] += c[: len(x) - a]
    return x
def chime(d=1.6):
    tt = t_(d)
    return sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt / dd) * g for f, dd, g in [(880, 0.6, 1), (1318.5, 0.45, 0.6), (1760, 0.3, 0.3)]) * (1 - np.exp(-tt / 0.004))
def stamp(d=0.6):
    tt = t_(d)
    return np.tanh(2 * (lp(noise(d), 1500) * np.exp(-tt / 0.03) + np.sin(2 * np.pi * 70 * tt) * np.exp(-tt / 0.09)))
def scan(d=1.2):
    tt = t_(d); f = 600 + 2400 * (tt / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 * np.sin(np.pi * tt / d) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 22 * tt)))
def zap(d=0.5):
    tt = t_(d); f = 3200 * np.exp(-tt / 0.08) + 120
    return np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * np.exp(-tt / 0.12) * 0.6 + hp(noise(d), 4000) * np.exp(-tt / 0.03) * 0.4
def shatter(d=1.8):
    x = np.zeros(int(d * SR))
    for _ in range(60):
        a = int(rng.exponential(0.25) * SR)
        if a >= len(x): continue
        f = rng.uniform(2500, 9000); dd = rng.uniform(0.02, 0.12)
        c = np.sin(2 * np.pi * f * t_(dd)) * np.exp(-t_(dd) / (dd / 3)) * rng.uniform(0.2, 1)
        x[a:a + len(c)] += c[: len(x) - a]
    return x + impact(d, 55) * 0.5


if __name__ == "__main__":
    save("whoosh_soft", whoosh(1.1, 200, 1800))
    save("whoosh_fast", whoosh(0.55, 500, 5000, 0.55))
    save("impact", impact())
    save("hit_small", hit_small())
    save("riser", riser())
    save("reverse", reverse())
    save("glitch", glitch())
    save("blip", blip(1320))
    save("blip_low", blip(880))
    save("tick", tick())
    save("typing", typing())
    save("chime", chime())
    save("stamp", stamp())
    save("scan", scan())
    save("zap", zap())
    save("shatter", shatter())
