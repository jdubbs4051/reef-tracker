# Reef Tracker — demo video build

Auto-generated ~70s product trailer. Final file: **`reef_tracker_demo.mp4`** (1080p, H.264/AAC).

## Pipeline (re-run order)
1. **Start the app** — backend on :8000 (`cd ../backend && REEF_DATA_DIR=./data .venv/bin/uvicorn app.main:app --port 8000`) and frontend on :5173 (`npm run dev --prefix ../frontend`).
2. **Capture frames** — `node capture.js` (+ `capture_advisor.js`, `capture_rest.js`) → `frames/` (3840×2160 @2x via headless Chrome).
3. **Overlays** — `node generate_overlays.js` → `overlays/` (title/end cards + caption bars, rendered in Chrome because this ffmpeg build lacks drawtext).
4. **Narration** — `python3 gen_vo.py` → `audio/vo_1..6.mp3` + `durations.json` (ElevenLabs; voice in the script).
5. **Assemble** — `python3 build.py` → Ken-Burns scenes → `work/video.mp4` + `work/voice.wav` → mux → `reef_tracker_demo.mp4`.
6. **Loudness** — final `loudnorm` pass applied at mux (I=-16, TP=-1.5).

## To tweak
- **Caption text** → `generate_overlays.js` (`CAPTIONS`), re-run steps 3 + 5.
- **Narration wording / voice** → `gen_vo.py` (`SEGMENTS`, `VOICE`), re-run steps 4 + 5. (Voice = Jessica, a free-tier premade. Hannah `ZSNL4hPqCnqoMPaI4jGX` is a library voice and needs a paid ElevenLabs plan.)
- **Scene timing / framing / crops** → `build.py` (`SCENES`).

## For Premiere
All raw assets live here: `frames/` (clean UI stills), `overlays/` (title/end cards, caption PNGs), `audio/` (per-line VO). Drop them on a timeline for full editorial control + music.
