# Reef Tracker — Spec & Architecture

**Owner:** Jonathan
**Tank:** Red Sea MAX NANO G2 XL (33 gal system — 29 gal display + ~4 gal AIO sump)
**Status:** Planning. Not yet built.
**Goal:** Self-hosted web app to log water parameters, manage maintenance reminders, track livestock, and (later) surface consumption/trend insights.

---

## 1. Guiding principles

1. **v1 is boring and local.** Runs on the LAN in Docker, no auth, no cloud, no HTTPS. Reachable from a phone browser on the same network.
2. **The app informs, it never autopilots the tank.** Trend flags and suggestions are advisory only. No automated dosing instructions.
3. **Trends matter more than single readings.** Logging exists to produce charts and consumption rates, not just a number history.
4. **Build the data foundation now so later phases don't require migrations.** Multi-tank and consumables structure baked in from day one even if unused at first.

---

## 2. Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Python + FastAPI | Strong validation, auto API docs, clean fit for later trend/prediction logic |
| Database | SQLite (single file) | Zero-config, trivial backup (copy the file), more than enough for a hobby app |
| Frontend | React (Vite) SPA | Needed for charts + photo uploads + responsive phone view |
| Charts | Recharts (or Chart.js) | Line charts with target-range bands |
| Scheduler | APScheduler (in-process) | Fires due-task checks and notifications |
| Deployment | docker-compose, one service + named volume | Persistent volume holds SQLite file + uploaded photos |

**Backup = copy the named volume.** SQLite file and `/photos` both live there.

---

## 3. Notification channels (v1)

All three requested channels, no OAuth rabbit hole:

| Channel | Mechanism | Setup |
|---|---|---|
| Email | SMTP | Creds in env vars |
| Push | **ntfy** | Topic + server URL in env vars; subscribe on phone |
| Calendar | **iCal feed** (`/calendar.ics`) | Subscribe Google/Apple Calendar to the URL; recurring tasks appear automatically |

Deferred: full Google Calendar OAuth API (unnecessary given the iCal feed covers it).

---

## 4. Data model

Every domain table carries `tank_id` from the start (single tank now; QT/second display later).

**tanks** — id, name, volume_gal, notes, active

**parameters** — id, tank_id, name, unit, target_min, target_max, display_order, active

**readings** — id, tank_id, parameter_id, value, measured_at, note

**tasks** — id, tank_id, name, category, recurrence_rule, last_done_at, next_due_at, notify_channels, active

**task_log** — id, task_id, completed_at, note

**livestock** — id, tank_id, common_name, scientific_name, type (fish/coral/invert/cuc), date_added, source, status (alive/lost/removed), notes

**photos** — id, tank_id, file_path, caption, taken_at, linked_type (tank/livestock/journal), linked_id

**journal** — id, tank_id, entry_at, title, body  *(free-text dated event log — "added blenny," "started carbon," "diatom bloom")*

**consumables** — id, tank_id, name, unit, current_qty, reorder_threshold, est_daily_use, vendor, notes

**consumable_log** — id, consumable_id, change_qty, logged_at, reason

Files (photos) stored on the Docker volume; DB stores the path only.

---

## 5. Seeded parameters (mixed-reef defaults)

| Parameter | Unit | Target |
|---|---|---|
| Temperature | °F | 77–78 |
| Salinity | SG | 1.025–1.026 |
| pH | — | 7.9–8.4 |
| Ammonia | ppm | 0 |
| Nitrite | ppm | 0 |
| Nitrate | ppm | 5–10 |
| Phosphate | ppm | 0.03–0.10 |
| Alkalinity | dKH | 8–9 |
| Calcium | ppm | 420–440 |
| Magnesium | ppm | 1300–1350 |

All editable in-app; these are just the seed.

---

## 6. Seeded maintenance tasks (starting recurrence — all editable)

| Task | Category | Suggested cadence |
|---|---|---|
| Water change (~3 gal) | water | weekly |
| Test Alk/Cal/Mag | testing | weekly |
| Test Nitrate/Phosphate | testing | weekly |
| Check/refill ATO reservoir | water | as needed / weekly |
| Inspect ReefMat advance | filtration | weekly |
| Clean skimmer cup | filtration | weekly |
| Replace carbon | media | monthly |
| Calibrate refractometer | testing | monthly |
| Glass/pump cleaning | maintenance | biweekly |

---

## 7. Build phases

**Phase 1 — Foundation** ✅ done
- DB + FastAPI skeleton in Docker
- Parameter logging (dated multi-value entry)
- Parameter list + line charts with target-range bands
- Configurable parameters

**Phase 2 — Maintenance & reminders** ✅ done
- Task definitions w/ recurrence
- "What's due" dashboard
- Email + ntfy notifications
- iCal feed

**Phase 3 — Livestock, photos, journal** ✅ done
- Livestock records (per-animal, with status + photos)
- Photo uploads (volume-stored)
- Maintenance/event journal
- Stocking advice (bioload/aggression/compatibility, LFS voice — advisory only)

**Phase 4 — Refinements & dashboard customization** ⬅️ next
Driven by real use after Phases 1–3; full detail in [CHANGE_REQUESTS.md](CHANGE_REQUESTS.md).
Sequenced deliberately so the later trend/consumables work isn't built twice. In order:
1. **Quick wins** — blank the logging entry fields (no prefilled sample values);
   mark the dashboard "Worth a look" card as a preview of the Phase 5 advisory engine.
2. **Equipment log** — brand / model / type (light, return pump, skimmer, heater,
   ATO, doser, filtration/reactor, controller, UV, chiller, RODI, …); photos optional.
3. **Parameter history & charts** — historical readings grid (dates × parameters) with
   journal-event markers on trend breaks; charts for *all* parameters, not just the
   selected one. Repurposes the Log Reading page into grid + condensed logging form.
4. **Customizable dashboard widgets** ✅ done — persistent top-3 KPIs (Tank status, Due
   today, Last logged); user-addable/removable/reorderable widgets below (extra charts,
   calendar, etc.), persisted per-tank via `/api/dashboard/layout`. Includes a task
   **calendar** widget on the dashboard (highlights due dates, hover for details). This
   framework lands *before* Phase 5 so trend flags can arrive as a widget.

**Phase 5 — Smarts (advisory only)** *(was Phase 4)*
- Consumable consumption tracking → reorder reminders
- Parameter-trend flags (e.g. "alk consumption rising ~0.4 dKH/wk") — surfaced via the
  Phase 4 widget framework / the "Worth a look" card
- Optional gentle suggestions (copepods, reef food, start 2-part) — **never dosing amounts**

*Note: Consumables tracking is self-contained and could be pulled forward into Phase 4 if
desired — it doesn't depend on the refinements above.*

---

## 8. Screens (see wireframe)

1. **Dashboard** — persistent top-3 KPIs + customizable widgets below (charts, task
   calendar, recent activity, insight preview)  *(customization: Phase 4)*
2. **Log Reading** — historical readings grid (dates × parameters) with journal-event
   markers, plus a condensed, blank logging form  *(grid + blank fields: Phase 4)*
3. **Parameters / Charts** — charts for all parameters with target bands + trends
   *(all-parameter charts: Phase 4)*
4. **Tasks** — list, due status, mark-done, edit recurrence
5. **Livestock** — gallery/list w/ status, detail view, stocking advice
6. **Journal** — dated event entries
7. **Equipment** — brand / model / type log  *(Phase 4)*
8. **Consumables** — stock levels, consumption rate, reorder flags  *(Phase 5)*
9. **Settings** — parameters, tanks, notification config

---

## 9. Explicitly out of scope for v1
- Auth / multi-user / remote access / HTTPS
- Google Calendar OAuth
- Automated dosing instructions
- Mobile native app (responsive web only)
