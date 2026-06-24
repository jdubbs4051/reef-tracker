# Roadmap: Personal Hosting + iOS (TestFlight)

How to take Reef Tracker from "runs on my Mac" to "an app on my iPhone and a browser on
my Mac, sharing one hosted database." Written for a **non-developer driving Claude Code**.

This is a planning document. **Nothing here is implemented.** Each phase lists:
- **What changes** (grounded in the current code)
- **Prompts** you can paste into Claude Code to do the work
- **Manual steps** only you can do (accounts, Apple, clicking through GUIs)

> Goal recap: **v1/MVP is local-only.** Hosting + TestFlight are later phases you opt into
> when the local version feels worth carrying around.

---

## The end-state architecture

```
   Mac browser ─┐
                ├──→  Hosted backend (FastAPI)  ──→  Database  +  Photo storage
   iPhone app ──┘          one HTTPS URL          (one source of truth)
```

One backend in the cloud; two clients (browser + iOS app) hitting the same URL, so both
always see the same data.

> **Chosen approach — Option A (decided).** There is exactly **one** backend, running in the
> cloud, and **one** database (SQLite on a persistent volume) living *inside* it. Your Mac uses
> the browser pointed at that hosted URL — there is **no separate self-hosted backend** to keep
> in sync. The phone and the Mac "share data" by sharing that one backend.
>
> **Why not a directly-shared database:** an iOS app must never connect straight to a database
> over the internet (that ships DB credentials in the app and exposes the DB port publicly).
> The thing that's shared is the **backend in front of the database**, not the database itself.
> So we don't need a separate managed-database product at all — SQLite-on-a-volume is enough.
> (Neon/Supabase Postgres stays a *later* option only if SQLite is ever outgrown.)

---

## Current state (what you already have)

- **Frontend:** React + Vite SPA (`frontend/`). Talks to the backend with **relative URLs**
  — see [api.js](frontend/src/api.js) (`fetch('/api...')`). This works same-origin today but
  **will not work** from an iOS app, which loads from a local bundle, not your server.
- **Backend:** FastAPI single service (`backend/app/`). Serves `/api`, and in Docker also
  serves the built SPA. See [main.py](backend/app/main.py).
- **CORS** is locked to `localhost:5173` and your LAN — see [main.py](backend/app/main.py:41).
  A hosted site and an iOS app are different origins, so this list must grow.
- **Data:** SQLite file (`backend/data/reef.db`) + uploaded **photos on the filesystem**
  (`DATA_DIR/photos`, [main.py](backend/app/main.py:74)). Both live on local disk today.
- **Background jobs:** APScheduler runs in-process for notifications ([scheduler.py](backend/app/scheduler.py)).
- **Packaging:** you already have a `Dockerfile` and `docker-compose.yml` — you are deploy-ready.

The three things that must change to leave your Mac: **(1) API base URL, (2) CORS, (3) where
data + photos live so they survive a redeploy.**

---

## Phase 1 — Local MVP (start here)

**Outcome:** the app runs reliably on your Mac, and you can reach it from your iPhone's
*browser* over your home Wi-Fi (LAN). No App Store, no cloud, no cost. This is essentially
what exists now — this phase is about confirming it works and lightly hardening it.

### What changes
Little to none in code. Mostly verification:
- Confirm `docker-compose up` brings up the app and the SPA loads.
- Confirm your iPhone can open `http://<your-mac-LAN-ip>:<port>` (the CORS LAN regex at
  [main.py](backend/app/main.py:44) already anticipates this).
- Decide on a simple backup habit for `backend/data/reef.db` (it holds your tank history).

### Recommended Claude Code prompts
```
Run the app locally with docker-compose, confirm the SPA and /api/health both respond,
and tell me the exact URL to open from another device on my home Wi-Fi.
```
```
Add a one-command backup script that copies backend/data/reef.db (and the photos folder)
to a timestamped file in a backups/ directory, and document how to restore it.
```

### Manual steps (you)
- Nothing external. No accounts, no payment.

### Exit criteria for Phase 1
You use it for a couple of weeks locally and decide it's worth carrying on your phone.
Only then move to Phase 2.

---

## Phase 2 — Host the backend + database in the cloud

**Outcome:** the backend runs on a cloud host at a stable HTTPS URL. Your Mac browser uses
it; later your iPhone app will too. Same data everywhere.

### What changes (code)
1. **Make the API base URL configurable** (the big one).
   Today [api.js](frontend/src/api.js) hardcodes the relative path `/api`. For a hosted
   build (and especially for the iOS app), it must point at an absolute URL via a build-time
   env var (e.g. `VITE_API_BASE`), defaulting to the relative path so local still works.
2. **Widen CORS** in [main.py](backend/app/main.py:41) to allow your hosted frontend origin
   and (in Phase 3) the iOS app's origin (`capacitor://localhost`). Best done via an env var
   so you don't hardcode URLs.
3. **Persist data across redeploys (Option A: SQLite on a volume).**
   - **Database:** keep **SQLite on a persistent volume** the host won't wipe — set
     `REEF_DATA_DIR` to the mounted volume path. No separate database product needed. (Hosted
     Postgres via Neon/Supabase stays a *later* option only if SQLite is ever outgrown; it's a
     connection-string change plus a one-time migration.)
   - **Photos:** the filesystem photos folder ([main.py](backend/app/main.py:74)) lives on the
     **same volume** (it already sits under `DATA_DIR`), so it's covered by the same mount.
4. **Secrets/config via environment variables** (notification email/ntfy settings,
   `REEF_STATIC_DIR`, `REEF_DATA_DIR`, `REEF_BASE_URL`) instead of anything baked into the image.

### Recommended Claude Code prompts
```
Refactor frontend/src/api.js so the API base URL comes from an env var (VITE_API_BASE),
defaulting to the relative "/api" path so local dev is unchanged. Update the photo upload
and the /photos image URLs the same way. Don't change any other behavior.
```
```
Make CORS in backend/app/main.py configurable from an env var (comma-separated list of
allowed origins), keeping the current localhost + LAN defaults. Explain what value I'll
set once I know my hosted frontend URL.
```
```
Review the Dockerfile and docker-compose.yml for deploying to Railway. Tell me exactly
how to attach a persistent volume for REEF_DATA_DIR (holding both the SQLite DB and the
photos folder) and what env vars I'll need to set. Recommend, don't deploy.
```
```
(Optional, only if SQLite is ever outgrown) Plan a migration from SQLite to hosted
Postgres (Neon or Supabase) using SQLModel: what changes, how to move my existing data,
and how to roll back. Plan only.
```

> **Host pick: Railway.** Reasoning settled in this session — it deploys straight from the
> Dockerfile, persistent volumes are a few clicks, env vars are a simple panel, it gives an
> HTTPS URL automatically, and (critically) it stays **always-on**. That last point matters:
> the in-process APScheduler reminder job ([scheduler.py](backend/app/scheduler.py)) only fires
> while the service is running, so a host that **sleeps on idle** (most free tiers) would
> silently stop your task notifications. Railway hobby usage is ~**$5/mo**. Fly.io is a cheaper
> but more CLI-heavy alternative; Render's persistent disks need a paid instance and its free
> tier sleeps — worse fit on both counts.

### Manual steps (you)
- Create a **Railway** account and connect billing (a card; expect **~$5/mo**).
- In the dashboard: create the service from the **Dockerfile**, attach a **persistent volume**
  and point `REEF_DATA_DIR` at it, and set the **environment variables** Claude Code tells you to.
- Note the **HTTPS URL** Railway gives you — you'll feed it back to Claude Code for the
  frontend build and CORS.

### Exit criteria for Phase 2
You can open the hosted URL in your Mac browser, log a reading, and see it persist after the
host redeploys. Data is no longer trapped on your Mac.

---

## Phase 3 — iOS app via Capacitor (free first, TestFlight later)

**Outcome:** a real app icon on your iPhone, talking to your Phase 2 backend. No public App
Store listing required.

> **You do NOT have to pay the $99 to get started.** Apple's
> [membership comparison](https://developer.apple.com/support/compare-memberships/) confirms
> a **free** Apple account can install your own app on your own device via Xcode — the only
> catch is the build **expires every 7 days** and reinstalling means plugging into your Mac
> and re-running from Xcode. TestFlight (and its ~90-day, over-the-air, no-cable builds) is the
> *only* part that needs the **$99/year** program.
>
> **Recommended path: do Phase 3a free first.** It proves the whole pipeline works (Capacitor
> wrap + hosted backend + app on your real phone) at zero cost. Move to Phase 3b and pay the
> $99 only once the 7-day reinstall chore gets annoying. The code and setup are **identical**
> either way — paying just swaps the weekly tethered reinstall for a quarterly over-the-air one.

| | **3a — Free account** | **3b — Paid ($99/yr)** |
|---|---|---|
| App on your own iPhone | ✅ | ✅ |
| Build lifespan | **7 days** | ~90 days (TestFlight) |
| Reinstall | plug into Mac, re-run in Xcode | over-the-air via TestFlight |
| TestFlight / extra testers | ❌ | ✅ (up to 100) |
| Cost | $0 | $99/year |

### What changes (code)
1. **Add Capacitor** to the frontend. It wraps your existing built React app in a native iOS
   shell — you reuse essentially all your current UI code.
2. **Point the app at the hosted backend.** This is why Phase 2's configurable API base URL
   matters: the iOS build sets `VITE_API_BASE` to your hosted HTTPS URL (relative paths can't
   work — the app's files load locally, not from your server).
3. **Add `capacitor://localhost` to the allowed CORS origins** (env var from Phase 2).
4. **App basics:** app icon, splash screen, app name/bundle id. Optionally native camera for
   tank photos and native notifications later.
5. **(Optional) Native push:** today notifications go via email/ntfy ([notifications.py](backend/app/notifications.py)).
   The **ntfy app on iOS** is the low-effort path and needs no Apple push setup. True native
   push (APNs) is a larger, later add-on.

### Recommended Claude Code prompts
The first prompt is the same for both 3a and 3b — Capacitor setup doesn't care which Apple
tier you're on.
```
Add Capacitor to the frontend so I can build an iOS app from the existing React app.
Set it up to read the backend URL from VITE_API_BASE, add capacitor://localhost to the
backend CORS allow-list, and generate an app icon and splash screen from my logo in
frontend/src/assets. Give me the exact commands to open the project in Xcode.
```
**Phase 3a (free)** — install on your own phone, no paid program:
```
Walk me step by step through running this app on my own iPhone from Xcode using a free
"Personal Team" signing setup (no paid Apple Developer Program). Explain the 7-day
expiry and exactly what I re-do when a build stops opening. Assume I've never used Xcode
and pause after each step so I can confirm.
```
**Phase 3b (paid)** — once the 7-day chore gets old:
```
Walk me step by step through archiving the app in Xcode and uploading it to TestFlight,
including how to set the bundle identifier and signing. Assume I've never used Xcode.
Pause after each step so I can confirm.
```
**Optional, either tier:**
```
Wire up the ntfy iOS app as my push notifications so task reminders reach my phone
without Apple Push setup. Explain what I install and subscribe to.
```

### Manual steps (you) — the real friction
**Phase 3a (free, recommended start):**
- Sign in to Xcode with a **free** Apple ID (no $99). Set the project to your "Personal Team."
- **Xcode** does the signing/build — you click through it; plug your iPhone into your Mac to install.
  Claude Code can interpret errors but cannot click Xcode/Apple portals for you.
  *This is the step most likely to frustrate; budget patience here, not for the code.*
- **Every ~7 days**, reconnect and re-run from Xcode to refresh the expired build.

**Phase 3b (paid, when you want over-the-air convenience):**
- **Enroll in the Apple Developer Program** ($99/year; identity verification can take days).
- **App Store Connect:** create the app record, add yourself as a TestFlight tester, install
  the **TestFlight app** on your iPhone, accept the build. Builds then last ~90 days and refresh
  over the air — no cable, no Xcode dance.

### Exit criteria for Phase 3
The app icon is on your home screen, it opens, and it shows the same data as your Mac browser.
(Reached in 3a at $0; 3b only changes how often/how you reinstall.)

---

## Costs & recurring chores

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | **$99 / year — optional** | Only needed for TestFlight (over-the-air, ~90-day builds). Skip it and use a free account (Phase 3a) to start. |
| Cloud hosting | **$0–15 / month** | Railway/Render/Fly free or hobby tier is plenty for one user |
| Mac + Xcode | $0 | You already have macOS |
| **Build refresh chore** | time only | Free account: reconnect to Mac + re-run in Xcode **every 7 days**. Paid/TestFlight: ~15-min rebuild **every ~90 days**, over the air, **no App Store review**. |

---

## Decisions settled (this session)

1. **Architecture: Option A** — one cloud backend + one DB inside it; Mac browser and iPhone
   both hit it. No separate self-hosted backend, no directly-shared database.
2. **Host: Railway** — Dockerfile deploy, persistent volume, always-on (keeps the scheduler
   firing), ~$5/mo.
3. **Database: SQLite on the persistent volume** — no separate DB product. Neon/Supabase
   Postgres is a *later* option only if SQLite is outgrown.
4. **Photos: same persistent volume** as the DB (already under `DATA_DIR`).

### Still open
- **Notifications** — ntfy app (easy, recommended first) vs. native APNs push (more work, nicer).

## Summary

| Phase | You get | Code work | Your manual work | Cost |
|---|---|---|---|---|
| **1 — Local MVP** | Works on Mac + phone *browser* on Wi-Fi | ~none (verify + backup) | none | $0 |
| **2 — Hosting** | One cloud URL (Railway), shared data, Mac browser | configurable API URL, CORS, SQLite-on-volume | Railway account, volume, env vars | ~$5/mo |
| **3a — iOS (free)** | Real iOS app on your phone (7-day builds) | Capacitor wrap, icon, point at host | free Apple ID, Xcode/signing, weekly reinstall | $0 |
| **3b — TestFlight** | Same app, ~90-day over-the-air builds | (none beyond 3a) | enroll $99 program, App Store Connect | +$99/yr |

The hard parts are **Apple's signing/Xcode** and **standing up reliable hosting** — both are
clicking-through-other-people's-systems, not coding. The code itself is well within what
Claude Code can do for you.
