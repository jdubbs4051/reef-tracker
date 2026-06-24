#!/usr/bin/env python3
"""Assemble the Reef Tracker 75-sec trailer from frames + overlays + narration.
Builds Ken-Burns scenes, concats video, builds the voice track, muxes."""
import json, os, subprocess, pathlib

HERE = pathlib.Path(__file__).resolve().parent
FR = HERE / "frames"
OV = HERE / "overlays"
AU = HERE / "audio"
WORK = HERE / "work"
WORK.mkdir(exist_ok=True)
FFMPEG = "/opt/homebrew/bin/ffmpeg"

D = json.loads((HERE / "durations.json").read_text())

# Each scene: name, image, duration, crop (w:h:x:y in 3840x2160 src or None), caption png or None, zmax
S3LOG = 4.3
S3TREND = round(D["vo_3"] - S3LOG, 3)
TITLE_D, END_D = 2.2, 2.6

SCENES = [
    ("title",   OV/"title.png",       TITLE_D,  None,                None,            1.05),
    ("s1",      FR/"01_dashboard.png", D["vo_1"], None,               OV/"cap1.png",   1.10),
    ("s2",      FR/"01_dashboard.png", D["vo_2"], "3360:1890:240:90", OV/"cap2.png",   1.12),
    ("s3log",   FR/"02_log_modal.png", S3LOG,    None,                OV/"cap3.png",   1.08),
    ("s3trend", FR/"03_trends.png",    S3TREND,  None,                OV/"cap3.png",   1.08),
    ("s4",      FR/"05_tasks.png",     D["vo_4"], "2240:1260:430:150",OV/"cap4.png",   1.10),
    ("s5",      FR/"07_advisor_tang.png", D["vo_5"], "2200:1238:880:120", OV/"cap5.png", 1.08),
    ("s6",      FR/"01_dashboard.png", D["vo_6"], None,                OV/"cap6.png",   1.10),
    ("end",     OV/"end.png",          END_D,    None,                None,            1.05),
]

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("FAILED:", " ".join(cmd[:6]), "...")
        print(r.stderr[-1500:])
        raise SystemExit(1)

def build_scene(name, img, dur, crop, cap, zmax):
    frames = max(2, round(dur * 30))
    incr = (zmax - 1.0) / frames
    pre = f"crop={crop}," if crop else ""
    z = f"zoompan=z='min(zoom+{incr:.6f},{zmax})':d={frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=30"
    base = f"[0:v]{pre}scale=3840:2160:flags=lanczos,{z},setsar=1[base]"
    out = WORK / f"{name}.mp4"
    if cap:
        fc = f"{base};[base][1:v]overlay=0:0:format=auto[v]"
        cmd = [FFMPEG, "-y", "-loop", "1", "-t", f"{dur}", "-i", str(img),
               "-i", str(cap), "-filter_complex", fc, "-map", "[v]"]
    else:
        fc = base.replace("[base]", "[v]")
        cmd = [FFMPEG, "-y", "-loop", "1", "-t", f"{dur}", "-i", str(img),
               "-filter_complex", fc, "-map", "[v]"]
    cmd += ["-t", f"{dur}", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-crf", "18", "-preset", "medium", str(out)]
    run(cmd)
    print(f"  scene {name}: {dur:.2f}s")
    return out

def main():
    print("Building scenes...")
    paths = [build_scene(*s) for s in SCENES]

    # concat video
    listfile = WORK / "concat.txt"
    listfile.write_text("".join(f"file '{p}'\n" for p in paths))
    video = WORK / "video.mp4"
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(listfile),
         "-c", "copy", str(video)])
    print("video track built")

    # voice track: lead silence + vo_1..6 + tail silence, all stereo 44.1k
    inputs = ["-f", "lavfi", "-t", f"{TITLE_D}", "-i", "anullsrc=r=44100:cl=stereo"]
    labels = ["[0:a]"]
    for i in range(1, 7):
        inputs += ["-i", str(AU / f"vo_{i}.mp3")]
        labels.append(f"[{i}:a]")
    inputs += ["-f", "lavfi", "-t", f"{END_D}", "-i", "anullsrc=r=44100:cl=stereo"]
    labels.append("[7:a]")
    fmt = ";".join(f"{labels[i]}aformat=sample_rates=44100:channel_layouts=stereo[a{i}]" for i in range(8))
    chain = "".join(f"[a{i}]" for i in range(8)) + "concat=n=8:v=0:a=1[a]"
    voice = WORK / "voice.wav"
    run([FFMPEG, "-y", *inputs, "-filter_complex", f"{fmt};{chain}", "-map", "[a]", str(voice)])
    print("voice track built")

    # mux
    out = HERE / "reef_tracker_demo.mp4"
    run([FFMPEG, "-y", "-i", str(video), "-i", str(voice),
         "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac",
         "-b:a", "192k", "-shortest", str(out)])
    # report
    dur = subprocess.check_output(["/opt/homebrew/bin/ffprobe", "-v", "error",
        "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(out)]).strip()
    print(f"\nDONE -> {out.name}  ({float(dur):.1f}s)")

if __name__ == "__main__":
    main()
