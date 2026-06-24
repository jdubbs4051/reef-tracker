# CLAUDE.md — Reef Tracker

**Owner:** Jonathan
**Tank:** Red Sea MAX NANO G2 XL (33 gal system — 29 gal display + ~4 gal AIO sump)
**Status:** Planning. Not yet built.
**Goal:** Self-hosted web app that logs water parameters, manages maintenance reminders, tracks livestock, and surfaces consumption/trend insights — all delivered with the judgment of a veteran local fish store owner who genuinely wants this tank to thrive.

---

## 0. The voice behind the build

Every feature, default, warning, and piece of copy should sound like a **veteran LFS owner** — someone who's kept reef tanks for 30+ years, has watched hobbyists succeed and fail, and gives honest, experience-grounded advice rather than parroting forum myths or selling unnecessary gear.

When building, ask: *"What would a trusted LFS owner who actually wants my tank to thrive tell me here?"*

Apply this expertise consistently:

- **Patience over speed.** The #1 killer of reef tanks is rushing. Cycling, stocking, and equipment changes should always be paced. Warn against impatience.
- **Stability beats perfection.** Stable "imperfect" parameters beat chasing ideal numbers. Discourage reacting to single readings; emphasize trends.
- **Nutrient management is nuanced.** Zero nitrate/phosphate is not the goal — corals need some nutrients. Flag ultra-low-nutrient crashes.
- **Test what matters, when it matters.** Heavy testing during cycling and after changes; don't over-test a stable, established tank.
- **Livestock compatibility and bioload are real constraints.** Honest stocking limits, aggression warnings, quarantine advocacy.
- **Buy once, cry once — but don't over-buy.** Quality where it matters (salt, test kits, flow, return pump); push back on gadget creep.
- **Observation is a skill.** Encourage daily visual checks: polyp extension, fish behavior, color, slime, algae type.

The app never gives reckless advice (adding fish to an uncycled tank, large untested parameter swings, incompatible livestock) without a clear, plain-spoken warning. And critically — **the app informs, it never autopilots the tank.** All trend flags and suggestions are advisory. No automated dosing instructions, ever.

---

## 1. Guiding principles

1. **v1 is boring and local.** Runs on the LAN in Docker — no auth, no cloud, no HTTPS. Reachable from a phone browser on the same network.
2. **The app informs, it never autopilots the tank.** Trend flags and suggestions are advisory only.
3. **Trends matter more than single readings.** Logging exists to produce charts and consumption rates, not just a number history. This is the LFS "stability over perfection" principle expressed in software.
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

Every domain table carries `tank_id` from the start (single tank now; QT/second display later). Treat all reference data — target ranges, parameters, species, tasks — as **configurable data, not hardcoded logic**, so the LFS guidance can be refined as Jonathan's experience evolves.

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

Files (photos) stored on the Docker volume; DB stores the path only. Store timestamps in UTC; display in local time.

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

All editable in-app; these are just the seed. The guidance layer should read against these as the LFS owner would — flagging not just out-of-range values but **rapid swings** (e.g., alk moving >1 dKH/day), which matter more than any single reading.

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

**Phase 1 — Foundation**
- DB + FastAPI skeleton in Docker
- Parameter logging (dated multi-value entry)
- Parameter list + line charts with target-range bands
- Configurable parameters

**Phase 2 — Maintenance & reminders**
- Task definitions w/ recurrence
- "What's due" dashboard
- Email + ntfy notifications
- iCal feed

**Phase 3 — Livestock, photos, journal**
- Livestock records (per-animal, with status + photos)
- Photo uploads (volume-stored)
- Maintenance/event journal
- Compatibility/aggression and bioload flags when adding stock (LFS voice)

**Phase 4 — Smarts (advisory only)**
- Consumable consumption tracking → reorder reminders
- Parameter-trend flags (e.g. "alk consumption rising ~0.4 dKH/wk")
- Optional gentle suggestions (copepods, reef food, start 2-part) — **never dosing amounts**

The guidance engine should be a **transparent rules layer** over logged data — advice you can trace back to a reading or trend, not a black box. Plain-language interpretation in the LFS voice: what a reading likely means and what to do, calmly.

---

## 8. Screens (see wireframe)

1. **Dashboard** — what's due, latest readings w/ in/out-of-range flags, recent journal
2. **Log Reading** — date + value fields for active parameters (fast — most logging happens phone-in-hand at the tank)
3. **Parameters / Charts** — per-parameter line chart with target band; trend summary
4. **Tasks** — list, due status, mark-done, edit recurrence
5. **Livestock** — gallery/list w/ status, detail view
6. **Journal** — dated event entries
7. **Consumables** — stock levels, consumption rate, reorder flags
8. **Settings** — parameters, tanks, notification config

**Design principles:** Mobile-first. Fast logging (seconds, minimal taps). Trends and context over raw numbers. Calm, confident voice — warm and direct like good counter advice, never preachy or panicky. Progressive disclosure: essentials up front, advanced detail (trace elements, ORP, dosing math) on drill-down.

---

## 9. Explicitly out of scope for v1
- Auth / multi-user / remote access / HTTPS
- Google Calendar OAuth
- Automated dosing instructions
- Mobile native app (responsive web only)

---

## 10. Engineering style (standing preferences)

- Cautious, surgical changes. Don't refactor broadly without being asked.
- Communicate explicitly: state assumptions, flag judgment calls vs. deterministic transforms.
- Fail loudly — surface errors clearly rather than swallowing them.
- Respect token/scope discipline; do the asked-for thing well before expanding.

---

## 11. Tone reminder for all generated copy

Write like the LFS owner talking across the counter: knowledgeable, honest, encouraging, occasionally opinionated, never condescending. The goal is a hobbyist with a **thriving** tank — not a maximally complicated one.
