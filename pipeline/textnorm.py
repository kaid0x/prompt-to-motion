"""One source of truth for how a script word is SPOKEN, shared by tts.py (what the voice reads) and
align.py (what the aligner listens for). The script keeps its display form ("WSH '26", "30+", "AI"),
captions show it, and this module turns each display word into spoken words:

    "AI"   -> A I          (all-caps words of 2-4 letters are spelled out)
    "'26"  -> TWENTY SIX   "30+" -> THIRTY PLUS   "35%" -> THIRTY FIVE PERCENT   "A*" -> A STAR
    "13"   -> THIRTEEN     "2026" -> TWENTY TWENTY SIX

Anything else can be forced per project in script.json: "pronounce": {"Nmap": "En-map", "Kaido": "Kai-doh"}.
"""
import re

ONES = "ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE THIRTEEN FOURTEEN FIFTEEN SIXTEEN SEVENTEEN EIGHTEEN NINETEEN".split()
TENS = "_ _ TWENTY THIRTY FORTY FIFTY SIXTY SEVENTY EIGHTY NINETY".split()
KEEP_CAPS = {"I", "A", "OK", "NASA", "GIF", "JPEG", "SCUBA"}  # read as words, not letters


def num_words(n: int) -> list[str]:
    if n < 20:
        return [ONES[n]]
    if n < 100:
        return [TENS[n // 10]] + ([ONES[n % 10]] if n % 10 else [])
    if n < 1000:
        return [ONES[n // 100], "HUNDRED"] + (["AND"] + num_words(n % 100) if n % 100 else [])
    if 2000 <= n <= 2099 and n % 100:  # years
        return ["TWENTY"] + num_words(n % 100)
    if n < 10000 and 1100 <= n <= 1999:
        return num_words(n // 100) + (num_words(n % 100) if n % 100 else ["HUNDRED"])
    if n < 1_000_000:
        return num_words(n // 1000) + ["THOUSAND"] + (num_words(n % 1000) if n % 1000 else [])
    return [c for d in str(n) for c in num_words(int(d))]


def spoken(word: str, pronounce: dict[str, str] | None = None) -> list[str]:
    """Spoken words (A-Z and apostrophes, upper case) for one display word."""
    core = word.strip(".,:;!?\"“”()[]…—–")
    if pronounce:
        for k in (word, core, core.lower()):
            if k in pronounce:
                return [w.upper() for w in re.findall(r"[A-Za-z']+", pronounce[k].replace("-", " "))]
    if not core or core in {"—", "–", "-", "·", "/", "&"}:
        return ["AND"] if core == "&" else []
    out: list[str] = []
    m = re.fullmatch(r"'?(\d{1,3}(?:,\d{3})+|\d+)([+%*]?)", core)
    if m:
        out += num_words(int(m.group(1).replace(",", "")))
        out += {"+": ["PLUS"], "%": ["PERCENT"], "*": ["STAR"], "": []}[m.group(2)]
        return out
    if re.fullmatch(r"[A-Z]\*", core):
        return [core[0], "STAR"]
    letters = re.sub(r"[^A-Za-z']", "", core)
    if re.fullmatch(r"[A-Z]{2,4}s?", letters) and letters.rstrip("s") not in KEEP_CAPS:
        return list(letters.rstrip("s")) + (["S"] if letters.endswith("s") else [])
    parts = re.split(r"[-/]", core)
    for p in parts:
        p = re.sub(r"[^A-Za-z']", "", p).strip("'")
        if p:
            out.append(p.upper())
    return out


def tts_text(text: str, pronounce: dict[str, str] | None = None) -> str:
    """The line as the TTS should read it: numbers and acronyms written out, punctuation kept for prosody."""
    res = []
    for w in text.split():
        sp = spoken(w, pronounce)
        core = w.strip(".,:;!?\"“”()[]…")
        trail = w[len(w.rstrip(".,:;!?\"”)…")):]
        if not sp:
            res.append(w)
            continue
        natural = re.sub(r"[^A-Za-z']", "", core).upper() == "".join(sp) and not re.fullmatch(r"[A-Z]{2,4}s?", core)
        if natural:
            res.append(w)
        elif all(len(s) == 1 for s in sp):
            res.append("-".join(sp) + trail)
        else:
            res.append(" ".join(s.lower() for s in sp) + trail)
    return " ".join(res)


if __name__ == "__main__":
    for w in ["AI", "WSH", "'26,", "30+", "35%.", "A*", "13", "TryHackMe's", "Nmap.", "2026", "CTF,", "I'm", "—"]:
        print(f"{w!r:16} {spoken(w)}")
    print(tts_text("I designed WSH '26, our school's hackathon and CTF, with 30+ custom challenges."))
