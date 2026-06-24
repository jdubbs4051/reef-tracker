#!/usr/bin/env python3
"""Generate narration MP3s for the Reef Tracker 75-sec trailer via ElevenLabs,
then probe each clip's duration. Warm/casual voice: Hannah."""
import json, os, subprocess, sys, urllib.request, pathlib

KEY = pathlib.Path(os.path.expanduser("~/.reef_demo_elevenlabs_key")).read_text().strip()
VOICE = "cgSgspJ2msm6clMCkdW9"  # Jessica - Playful, Bright, Warm (free-tier premade)
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "audio"
OUT.mkdir(exist_ok=True)

SEGMENTS = [
    ("vo_1", "Every reef keeper I know tracks their tank in a mess of spreadsheets, "
             "sticky notes, and memory. So I built this instead. It's called Reef Tracker. "
             "Self-hosted, running on my own network — no cloud, no subscription."),
    ("vo_2", "One glance tells me how the tank's doing. Status is computed live from my water "
             "parameters, what's due today, and everything that's happened lately — all on a "
             "dashboard I can lay out however I want."),
    ("vo_3", "I log a whole test session in one shot, and every parameter charts against its "
             "target range. Because with a reef, the trend matters way more than any single number."),
    ("vo_4", "Maintenance runs on a schedule that reminds me — on my phone, in my email, or right "
             "in my calendar. I check it off, and the next one's already set."),
    ("vo_5", "And when I add livestock, it talks back — like a local fish store owner looking over "
             "my shoulder. Try to put a tang in a nano? It tells me straight: skip it. Honest "
             "advice that never gets in my way."),
    ("vo_6", "My tank. My data. My hardware. Reef Tracker doesn't run the reef — it just makes "
             "sure I never have to do it blind."),
]

def tts(name, text):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}?output_format=mp3_44100_128"
    body = json.dumps({
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True},
    }).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "xi-api-key": KEY, "Content-Type": "application/json", "Accept": "audio/mpeg",
    })
    with urllib.request.urlopen(req) as r:
        data = r.read()
    path = OUT / f"{name}.mp3"
    path.write_bytes(data)
    return path

def dur(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", str(path)])
    return float(out.strip())

def main():
    total_chars = sum(len(t) for _, t in SEGMENTS)
    print(f"total characters: {total_chars}")
    durations = {}
    for name, text in SEGMENTS:
        p = tts(name, text)
        d = dur(p)
        durations[name] = round(d, 3)
        print(f"{name}: {d:.2f}s  ({len(text)} chars)")
    (HERE / "durations.json").write_text(json.dumps(durations, indent=2))
    print("total audio:", round(sum(durations.values()), 2), "s")

if __name__ == "__main__":
    main()
