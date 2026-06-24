# Reef Tracker

Self-hosted reef tank companion — logs water parameters, charts trends against
target ranges, and (in later phases) manages maintenance reminders, livestock,
and consumables. See [REEF_TRACKER_SPEC.md](REEF_TRACKER_SPEC.md) for the full plan, and
[MOBILE_AND_HOSTING_ROADMAP.md](MOBILE_AND_HOSTING_ROADMAP.md) for taking it to cloud hosting
and a personal iPhone app via TestFlight.

**Status: Phases 1–3 complete** (Foundation · Maintenance & reminders · Livestock, photos & journal).

| Layer | Tech |
|---|---|
| Backend | Python · FastAPI · SQLModel · SQLite · APScheduler |
| Frontend | React (Vite) SPA |
| Deploy | docker-compose, one service + named volume |

## What's built

**Phase 1 — Foundation**
- FastAPI + SQLite skeleton with the full data model from the spec (multi-tank,
  livestock, consumables, etc. defined up front so later phases need no migrations).
- Seeded mixed-reef parameters, the tank, maintenance tasks, and 8 weeks of sample
  readings on first launch.
- **Parameter logging** — dated, multi-value entry (`POST /api/readings`).
- **Parameters & charts** — per-parameter line chart with target-range band + trend.
- **Configurable parameters** — add / edit target ranges / remove, in Settings.

**Phase 2 — Maintenance & reminders**
- **Tasks with recurrence** — list, filter (all/due/this week), mark-done (recomputes
  the next due date), and edit cadence inline. Cadences: daily / weekly / biweekly /
  monthly / as needed.
- **"What's due" dashboard** — live tasks + due-today count + sidebar badge.
- **Notifications** — email (SMTP) and push (ntfy), driven by env vars; an in-process
  APScheduler job checks for due tasks and notifies once per due cycle.
- **iCal feed** at `/calendar.ics` — subscribe Google/Apple Calendar; recurring tasks
  appear automatically.

**Phase 3 — Livestock, photos & journal**
- **Livestock** — gallery with type filters, add/edit, status (alive/lost/removed),
  delete, and per-animal detail.
- **Photo uploads** — stored on the data volume, served read-only at `/photos`; the
  DB keeps only the path.
- **Journal** — dated event timeline (add/delete).
- **Stocking advice** — a transparent, advisory-only rules layer (LFS voice) flags
  bioload / aggression / compatibility concerns as you add livestock; never blocks.
- The dashboard is fully live now: **Tank status** (computed from out-of-range
  readings), a rule-based **"Worth a look"** insight, and a **Recent activity** feed
  merging readings, completed tasks, journal entries, and livestock additions.

## Notification config (Phase 2)

All optional — unset channels are simply skipped. Set as environment variables
(e.g. in `docker-compose.yml`):

| Var | Channel | Notes |
|---|---|---|
| `SMTP_HOST`, `SMTP_TO` | Email | required pair to enable email |
| `SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`/`SMTP_TLS` | Email | optional (port 587, TLS on by default) |
| `NTFY_TOPIC` | Push | enables ntfy; `NTFY_URL` defaults to `https://ntfy.sh` |
| `REEF_BASE_URL` | iCal | absolute base for the advertised feed URL |
| `REEF_CHECK_INTERVAL` | Scheduler | due-check interval in seconds (default 3600) |

## Run with Docker (production-style, one service)

```bash
docker compose up --build
# open http://localhost:8000  (or http://<lan-ip>:8000 from your phone)
```

The SQLite file and uploaded photos live in the `reef-data` named volume —
**back up by copying that volume.**

## Run locally (dev, two processes)

Backend:

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
REEF_DATA_DIR=./data .venv/bin/uvicorn app.main:app --reload --port 8000
```

Frontend (Vite dev server proxies `/api` → `localhost:8000`):

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

Interactive API docs: http://localhost:8000/docs

## Layout

```
backend/app/          FastAPI app
  routers/            tanks, parameters, readings, tasks, activity,
                      livestock, journal, photos, calendar (iCal)
  recurrence.py       cadence -> next-due computation
  notifications.py    SMTP + ntfy senders (env-driven)
  scheduler.py        APScheduler due-task check
  livestock_advice.py transparent stocking-advice rules (LFS voice)
  seed.py             first-launch seed data
frontend/src/         React SPA — pages/, components/, api.js, TankContext
Dockerfile            multi-stage: build SPA, serve it + the API from one Python image
docker-compose.yml    one service + reef-data volume (SQLite + /photos)
```

## Next phase

Phase 4 — consumables tracking → reorder reminders, and advisory parameter-trend
flags (consumption rates, gentle suggestions; never dosing amounts). See the spec.
