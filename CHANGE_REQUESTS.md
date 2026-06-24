# Reef Tracker — Change Requests / Backlog

**Captured:** 2026-06-23 · **Owner:** Jonathan
**Status:** Not started — planning notes only. Implement in a later session.

These are enhancements requested after Phases 1–3 shipped. Each item has the request,
implementation notes, affected files, and open questions. Nothing here is built yet.

---

## 1. Parameters page → charts for all parameters
**Request:** On the Parameters page, the "Other parameters" list is currently a row of
value chips. Change those into **charts** so every parameter shows a trend graph (not
just the selected one).

**Notes / approach:**
- Today only the selected parameter renders a `TrendChart`; the rest are list rows.
- Option A: a grid of small "sparkline" charts (one mini `TrendChart` per parameter),
  click to expand. Option B: keep the big selected chart + show small charts below.
- Reuse `TrendChart` (it already auto-scales + draws the target band). May want a
  `compact` variant (smaller height, no axis labels) for the grid.
- Each mini chart needs its own `/api/readings/series` call — consider a batch endpoint
  (`/api/readings/series?parameter_ids=...`) to avoid N requests, or fetch lazily.

**Affected:** `frontend/src/pages/Parameters.jsx`, `frontend/src/components/TrendChart.jsx`,
possibly `backend/app/routers/readings.py` (batch series endpoint).

---

## 2. Repurpose Log Reading page → historical grid/table + inline logging
**Request:** Turn the Log Reading page into a **grid/table of historical readings** —
**dates vertical (rows), parameters horizontal (columns)**. In that grid, show an
**indicator where a journal entry breaks a trend** (e.g. added a fish, started dosing) so
parameter shifts can be correlated with events.

Keep the **logging form on the same page** but **condense it** and make the entry fields
**blank** (currently they prefill with last/sample values — that reads as fake data).

**Notes / approach:**
- Grid: rows = distinct `measured_at` dates (desc), columns = active parameters. Cell =
  value, color-coded by in/out-of-range (`statusFor`). This is a pivot of the readings
  data — likely easiest with a new endpoint `/api/readings/grid?tank_id=` returning
  `{ dates: [...], parameters: [...], cells: {date: {param_id: value}} }`, or pivot
  client-side from `GET /api/readings`.
- Journal-on-grid: overlay a marker on the date row when a journal entry exists near that
  date (join journal `entry_at` to the reading dates; hover shows the entry title/body).
  Decide matching rule (same calendar day? nearest reading?).
- Logging form: reuse current multi-value entry but **remove the `placeholder`/prefill of
  last values** (see `LogReading.jsx` — `placeholder={last[p.id]...}` and `last` hints),
  shrink row sizing. Keep the date picker + batch save.

**Affected:** `frontend/src/pages/LogReading.jsx` (major rework), `backend/app/routers/readings.py`
(optional pivot/grid endpoint), needs journal data joined in.

**Open question:** Does the logging form stay above or below the historical grid? Default:
condensed form on top, grid below.

---

## 3. Logging fields blank (not sample/last values)
**Request:** (Tied to #2.) Entry fields should start **empty**, not show last reading as a
value. Today they show last values as input `placeholder`s + a "last X" hint, which can
read like pre-filled sample data.

**Notes:** Smallest change — drop the placeholder prefill; optionally keep a subtle "last:
X" helper text but visually distinct from an entered value. Confirm with Jonathan whether
to keep the "last" hint at all.

**Affected:** `frontend/src/pages/LogReading.jsx`.

---

## 4. Dashboard calendar (right rail) of tasks  ✅ done (Phase 4.4)
**Request:** Add a **calendar** to the Dashboard (right rail), **highlighting dates that
have tasks**; **hover shows task details**.

**Shipped:** `frontend/src/components/TaskCalendar.jsx` — custom month calendar (no deps,
prev/next nav) that highlights each task's `next_due_at` day, tints overdue days, outlines
today, and lists the day's tasks on hover. Wired in as the `calendar` dashboard widget (#7).

**Notes / approach:**
- Month calendar component (build small/custom or add a light dep — prefer custom to keep
  the no-heavy-deps style). Highlight days where a task's `next_due_at` falls; a day may
  have multiple tasks → tooltip lists them.
- Data already available from `GET /api/tasks`. Could also project recurring tasks forward
  a few weeks (use the cadence) so the calendar shows upcoming occurrences, not just the
  single `next_due_at`. Decide: show only next due, or expand recurrences across the month.
- Hover/tooltip: reuse the due-badge styling; show task name + cadence + due label.
- Ties into #7 (customizable widgets) — the calendar could be one of the addable widgets.

**Affected:** new `frontend/src/components/TaskCalendar.jsx`, `frontend/src/pages/Dashboard.jsx`.

---

## 5. Equipment log section
**Request:** A new **Equipment** section. Future: pick from known brands/models. For now:
**brand, model, type** (free text + a type dropdown). Asked for recommended types.

**Recommended `type` values (reef-appropriate):**
- **Lighting** (LED/T5/hybrid fixture)
- **Return pump**
- **Powerhead / wavemaker** (flow)
- **Protein skimmer**
- **Heater**
- **ATO** (auto top-off)
- **Doser** (dosing pump)
- **Filtration / media reactor** (carbon/GFO/biopellet, ReefMat/roller)
- **Controller** (e.g. Apex/Reef tools) + probes
- **UV sterilizer**
- **Chiller / fan** (cooling)
- **RODI system** (water prep)
- **Other** (catch-all)

**Notes / approach:**
- New table `equipment` — suggested columns: `id, tank_id, type, brand, model, nickname,
  installed_at, notes, active`. Carries `tank_id` like everything else (multi-tank ready).
- Mirrors existing CRUD patterns: `routers/equipment.py` + schemas + a frontend page
  (list grouped by type, add/edit/delete) + nav entry. The **Consumables** nav slot is
  still a placeholder; Equipment is a new sibling.
- Future "select from brands/models": would need a reference catalog (seeded or external).
  Out of scope for first pass — keep brand/model as free text now, structure later.
- Photos can attach via the existing `/api/photos` (`linked_type="equipment"`).

**Affected:** new `backend/app/models.py` table + `routers/equipment.py` + schemas;
new `frontend/src/pages/Equipment.jsx`; nav in `frontend/src/data.js` + `App.jsx`.

---

## 6. Dashboard "Worth a look" → mark as future development
**Request:** The "Worth a look" insight card on the Dashboard should be flagged as
**future development** (it's a v1 rules-based stub; the real advisory engine is Phase 4).

**Notes:** Lightweight — add a small "Preview" / "Coming soon" tag on the card, or visually
de-emphasize it. The logic lives in `buildInsight()` in `Dashboard.jsx`. Decide whether to
keep it visible-but-labeled or hide behind a flag. Recommend: keep visible with a subtle
"Preview" chip so the idea is still demonstrated.

**Affected:** `frontend/src/pages/Dashboard.jsx`.

---

## 7. Customizable dashboard widgets  ✅ done (Phase 4.4)
**Request:** Make Dashboard **widgets customizable** — user can add multiple (e.g. several
charts). The **top three KPIs (Tank status, Due today, Last logged) stay persistent**.

**Shipped:** Dashboard refactored into a widget registry rendered from a per-tank layout.
The top-3 KPI row is fixed; below it a "Customize" mode lets you add/remove/reorder widgets
(types: latest-readings, parameter chart with a per-widget parameter picker, what's-due,
calendar, insight, recent activity — same type may appear multiple times). Layout persists
to a backend `dashboard_layout` table (one JSON row per tank) via `GET/PUT
/api/dashboard/layout`; first visit returns a sensible default mirroring the classic
dashboard plus the calendar. Decisions taken: per-tank, backend persistence, simple
up/down reorder (no drag-and-drop yet). Files: `backend/app/models.py`,
`backend/app/schemas.py`, `backend/app/routers/dashboard.py`, `backend/app/main.py`,
`frontend/src/pages/Dashboard.jsx`, `frontend/src/components/TaskCalendar.jsx`,
`frontend/src/api.js`, `frontend/src/icons.jsx`, `frontend/src/iconMap.jsx`,
`frontend/src/theme.css`.

**Notes / approach (biggest item — architectural):**
- Introduce a widget model: a list of widget configs (type + options) the user can add/
  remove/reorder. Widget types to start: parameter chart (choose which parameter),
  what's-due, recent activity, calendar (#4), latest readings, insight.
- Persistence: store layout per tank. Options — (a) `localStorage` (fast, no backend, but
  not synced across devices) or (b) a backend `dashboard_layout` table/JSON column (synced,
  matches the "phone + desktop" goal). Recommend backend persistence given multi-device use.
- The top 3 KPI row is fixed/non-removable; everything below is the customizable area.
- UI: an "edit layout" mode (add widget picker, drag-to-reorder or up/down, remove). Could
  use a simple ordered list first, add drag-and-drop later.
- This subsumes #1 (multiple charts) and #4 (calendar as a widget) — consider building the
  widget framework first, then #1/#4 become widget types.

**Affected:** `frontend/src/pages/Dashboard.jsx` (refactor into widget registry +
renderer), new widget components, likely a `backend` layout-persistence endpoint.

**Open questions:**
- Per-tank or global layout? (Recommend per-tank.)
- Drag-and-drop now or simple add/remove/reorder first? (Recommend simple first.)
- localStorage vs backend persistence? (Recommend backend for cross-device.)

---

## 8. Maintenance checklists (customizable procedures)  → see CHECKLISTS_PLAN.md
**Request:** A customizable, reusable checklist for maintenance procedures (e.g. a Water
Change: salt mixed ≥24h → shut off ATO → shut off return/skimmer → drain → …), followed
step-by-step and reminding you to turn equipment back **on** at the end.

**Decisions locked:** standalone `Checklists` page **+** an addable dashboard widget;
per-tank templates; link templates ↔ tasks (a due task launches its procedure, finishing
reschedules it); ship the **migration runner + automatic DB backup** as part of this work
(no longer deferred). Phasing A (foundation + MVP) → B (task linking, guided mode, widget,
activity) → C (smart steps: salt-mix timer / data capture / critical "pumps back on" guard).

**Model:** 3 new tables (`ChecklistTemplate`, `ChecklistStep`, `ChecklistRun`) + a
`Task.checklist_template_id` column. The column add needs a real migration (`create_all`
only creates tables, never alters) — handled by a lightweight `migrations.py` tracking
`schema_version` in the existing `settings` table, run **after** a `backup_db()` snapshot.

**Full plan, file-by-file:** `CHECKLISTS_PLAN.md`.

---

## Suggested sequencing (when resumed)
1. **#3** (blank logging fields) — trivial, immediate polish.
2. **#6** (label "Worth a look") — trivial.
3. **#5** (Equipment section) — self-contained, follows existing patterns.
4. **#1** (parameter charts) + **#2** (historical grid + journal markers) — related data work.
5. **#7** (customizable widgets framework) — do before/with **#4** (calendar widget), since
   the calendar is a natural first custom widget.

## Cross-cutting reminders
- Keep the LFS voice for any new copy (see `uploads/CLAUDE.md` §0).
- Everything carries `tank_id` (multi-tank ready).
- UTC storage, local display.
- No new heavy deps without reason (current style: stdlib + small libs).
- The schema-migration gotcha still applies: `create_all` won't alter existing tables.
  Adding `equipment` / `dashboard_layout` on a fresh DB is fine; an existing DB needs a
  real migration tool (decide before adding more tables).
