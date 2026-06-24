# Reef Tracker — Maintenance Checklists Plan

**Captured:** 2026-06-24 · **Owner:** Jonathan
**Status:** Planning notes — not started. Implement in a later session.

A customizable, reusable checklist feature for maintenance procedures (water change,
filter swap, skimmer clean, etc.). The defining example: a **Water Change** procedure
with steps like *1) ensure salt has mixed ≥24h, 2) shut off ATO, 3) shut off return
pump + skimmer, 4) drain N gallons …* — followed step-by-step, and (critically) reminding
you to turn equipment back **on** at the end.

---

## 0. Decisions locked (this session)

- **Phasing A → B → C** as below (agreed).
- **Standalone page** (`Checklists`, new nav entry) — *and* a **dashboard widget** so
  templates can be launched / in-progress runs surfaced from the home screen.
- **Per-tank** templates (consistent with the rest of the app; everything carries `tank_id`).
- **Link to Tasks** (a due maintenance task can launch its linked procedure; finishing the
  run reschedules the task) — kept, lands in Phase B.
- **Migration runner + automatic DB backup land NOW** (Phase A), not deferred — see §3.

---

## 1. Core concept: templates (reusable) + runs (one execution)

The existing `Task` is a *reminder* ("water change is due"). A checklist is the *procedure*
— the ordered steps you follow when you do it. Two separate things that can link:

- **Checklist template** — reusable, editable, ordered list of steps. The thing you "customize."
- **Checklist run** — one time you walk through it. Records start/finish + per-step state.
  This is what makes it more than a static note (history, "what's still off", safety guards).
- **Link** — a `Task` may point at a template, so a *due* water-change task becomes
  "tap → run the procedure → finishing it auto-completes & reschedules the task" (reusing the
  existing `complete_task` flow + `TaskLog`).

Same step data drives **two views**: a **guided mode** (one step at a time, big Next — good for
wet hands mid-change) and a **compact checklist** view. Build the data once, offer both.

---

## 2. Data model (3 new tables + 1 column)

In `backend/app/models.py`, mirroring existing conventions (UTC storage, `tank_id` everywhere,
deactivate-not-delete):

```
ChecklistTemplate
  id, tank_id (FK tanks.id, index), name, category ("" / reuse task CATEGORIES),
  description (""), active (True), updated_at (utcnow)

ChecklistStep
  id, template_id (FK, index), position (int), text, detail (""),
  kind ("note" | "wait" | "input" | "critical"), config (str JSON, default "{}")

ChecklistRun
  id, template_id (FK, index), tank_id (FK, index), task_id (FK tasks.id, nullable),
  started_at (utcnow), completed_at (nullable), status ("in_progress" | "completed" | "abandoned"),
  state (str JSON, default "{}")
```

And on the existing `Task` table:

```
Task.checklist_template_id: Optional[int] = Field(default=None, foreign_key="checklist_template.id")
```

Two deliberate choices that match what's already here:

- **Run `state` as a JSON blob** (per-step done flags + captured values + per-step notes), same
  rationale as `DashboardLayout.widgets` — it's read/written whole, nothing to query inside it.
  Avoids a 4th child table.
- **Steps as a real child table** (not JSON) because the editor reorders/edits them individually
  and `position` ordering reads cleanly. Saved as a whole array on template save (see §4).

---

## 3. Migration + backup (lands in Phase A — REQUESTED NOW)

### The gotcha
Today the schema is created by `SQLModel.metadata.create_all(engine)` in
`backend/app/database.py:22`, called from the lifespan startup in `backend/app/main.py:42`.
`create_all` **creates missing tables but never alters existing ones**. So:

- The **3 new tables** appear automatically on next startup (fine on the existing `reef.db`).
- The **new `Task.checklist_template_id` column** will **NOT** be added to the existing `tasks`
  table by `create_all`. This needs a real migration. (`backend/data/reef.db` already exists with
  data, so we can't just wipe it.)

### Approach: lightweight in-house migration runner + auto-backup
No heavy dep. We already have a `settings` key/value table (`models.Setting`) — use it to store a
`schema_version`. New module `backend/app/migrations.py`:

```python
# pseudo-shape
SCHEMA_VERSION = 2  # bump per migration

def run_migrations(session):
    current = int(get_setting("schema_version", "1"))
    if current < 2:
        # idempotent: only ALTER if the column is missing
        cols = {r[1] for r in session.exec(text("PRAGMA table_info(tasks)"))}
        if "checklist_template_id" not in cols:
            session.exec(text("ALTER TABLE tasks ADD COLUMN checklist_template_id INTEGER"))
        set_setting("schema_version", "2")
```

- SQLite `ADD COLUMN` is safe/cheap and the `PRAGMA table_info` guard makes it idempotent.
- Future schema changes = new `if current < N` block + bump `SCHEMA_VERSION`.
- (Alembic is the "proper" alternative if migrations get complex later — note it, don't adopt yet.)

### Backup safety (so a failed migration can't lose data)
New `backend/app/backup.py` → `backup_db()`:

- Before running migrations, copy `reef.db` → `data/backups/reef-<UTC-timestamp>.db`
  (`shutil.copy2`). The whole app state is one directory (`database.py` docstring), so a file
  copy is a complete snapshot.
- Keep the **last N** (e.g. 10) and prune older ones.
- Skip if the DB is brand-new/empty (nothing to back up).
- Optional niceties: a `GET /api/admin/backup` endpoint to trigger a manual snapshot, and surface
  "last backup" + a "Back up now" button on the Settings page.

### New startup order (`main.py` lifespan)
```
create_db_and_tables()      # creates the 3 new tables
backup_db()                 # snapshot BEFORE altering anything
run_migrations(session)     # add tasks.checklist_template_id, bump version
seed_if_empty(session)      # unchanged
+ seed_checklists_if_empty  # see §7
```
Wrap `run_migrations` in try/except that logs the backup path on failure so recovery is obvious.

---

## 4. API (mirrors existing CRUD in `backend/app/routers/`)

New `backend/app/routers/checklists.py`, registered in `main.py` like the others:

```
GET    /api/checklists?tank_id=&include_inactive=false   # list templates (with steps)
POST   /api/checklists                                    # create template + steps array
GET    /api/checklists/{id}                               # one template + steps
PATCH  /api/checklists/{id}                               # rename/category/description + steps (whole array)
DELETE /api/checklists/{id}                               # deactivate

POST   /api/checklists/{id}/runs                          # start a run (optional ?task_id=)
GET    /api/checklists/runs/{run_id}
PATCH  /api/checklists/runs/{run_id}                      # update state: toggle step / capture value / note
POST   /api/checklists/runs/{run_id}/complete             # finalize
GET    /api/checklists/runs?tank_id=&status=in_progress   # for the dashboard widget / "resume"
```

- **Steps are sent as a whole array** on template create/PATCH (no per-step endpoints) — lists are
  short and this keeps reordering trivial. Server rewrites `position` from array index.
- **`/complete`**: set `completed_at` + `status="completed"`; if `task_id` is set, run the existing
  `complete_task` logic (reschedule via `recurrence.next_due` + write a `TaskLog`); add a `checklist`
  activity-feed item.
- Schemas go in `backend/app/schemas.py`: `ChecklistTemplateCreate/Update/Read`, `ChecklistStepIn`,
  `ChecklistRunRead`, `RunStateUpdate`, plus a `CHECKLIST_STEP_KINDS` constant (mirror on frontend).

---

## 5. Step "kinds" — where this beats a notepad (the salt example)

`kind` + a small `config` JSON per step:

- **`note`** — plain instruction. The default; covers most steps.
- **`wait` / precondition** — "Salt has mixed ≥24h." `config: { hours: 24 }`. A "start mixing"
  action stamps a time (stored on the run or as a `Setting`/journal marker); the step shows
  *"ready ✓"* or *"~6h to go"*. Directly answers step 1 of the water-change example.
- **`input` / capture** — "Record post-change salinity" / "gallons changed".
  `config: { target: "reading", parameter_id } | { target: "journal" }`. Captured value can write
  straight into `readings` or `journal`, so doing maintenance logs your data.
- **`critical`** — the "turn return pump / skimmer / ATO back **ON**" steps. If a run is left
  `in_progress`/abandoned with criticals undone → dashboard warning (and optional ntfy/email nudge
  via the existing `notifications` module): *"Heads up — return pump may still be off."* This guard
  is the single most valuable thing a reef checklist can do.

Phase A ships `note` only; `wait`/`input`/`critical` land in Phase C.

---

## 6. Frontend

### Standalone page
- **New nav entry** `{ id: 'checklists', label: 'Checklists', icon: 'list' }` in
  `frontend/src/data.js` (the `nav` array). Wire the route in `frontend/src/App.jsx` (add to the
  page map next to `tasks`/`equipment`) + new `frontend/src/pages/Checklists.jsx`.
  - Note: `tasks` currently uses the `list` icon — pick a distinct icon for checklists
    (e.g. a new "clipboard"/"check-square" in `icons.jsx` + `iconMap.jsx`) to avoid clashing.
- **Template editor**: name + category + ordered steps (add / edit text / reorder up-down first —
  reuse the Dashboard widget reorder pattern; drag-and-drop later). Delete = deactivate.
- **Run view**: guided one-step mode ⇄ compact checklist toggle; per-step check + note; finish button.
- API client additions in `frontend/src/api.js` (mirror the `listTasks/createTask/...` block) and a
  `CHECKLIST_STEP_KINDS` constant mirroring the backend.

### Dashboard widget
- Add `'checklists'` to `WIDGET_TYPES` in `backend/app/schemas.py` (the `save_layout` validator at
  `routers/dashboard.py:69` rejects unknown types) **and** to `WIDGET_META` in
  `frontend/src/pages/Dashboard.jsx:23`, plus a `case 'checklists':` in the `renderWidget` switch
  (~`Dashboard.jsx:355`).
- Widget contents: quick-launch buttons for this tank's templates, any **in-progress run**
  (resume), and the **critical-undone safety warning** from §5. It does not need to be in the
  default layout — being addable from the "Add widget" picker is enough.

### Tasks page link (Phase B)
- When a task has `checklist_template_id`, show a **"Run"** action on its row in
  `frontend/src/pages/Tasks.jsx` that starts a run (`POST /runs?task_id=`). Allow picking/clearing a
  linked template in the task add/edit form.

---

## 7. Seed data

New `seed_checklists_if_empty(session)` (called from lifespan; guarded like `seed_if_empty`).
Seed a handful of starter procedures for the existing tank so the feature isn't empty:

- **Water Change** (the worked example, incl. `critical` "pumps back ON" steps in Phase C)
- **Filter Sock / ReefMat swap**
- **Skimmer clean**
- **Glass / algae clean**
- **New coral acclimation**

Link the seeded **Water Change** template to the existing `"Water change (~3 gal)"` seed task once
linking exists (Phase B). Keep all copy in the LFS voice (`uploads/CLAUDE.md` §0).

---

## 8. Phasing

**Phase A — foundation + MVP**
- Migration runner + auto-backup + startup reorder (§3). *(This is the infra that has to be right.)*
- 3 tables + `Task.checklist_template_id` column.
- Template CRUD (note-only steps), simple check-off run that persists.
- Standalone Checklists page (editor + compact run view).
- Seed Water Change template.

**Phase B — integration**
- Guided one-step run mode.
- Link templates ↔ tasks; "Run" from a due task; completing a run reschedules the task + writes a
  `TaskLog`.
- `checklist` activity-feed item; dashboard widget (launch / resume / in-progress).

**Phase C — smart steps + safety**
- `wait` precondition (salt-mixed timer), `input` capture (→ readings/journal), `critical` steps.
- Critical-undone dashboard warning + optional ntfy/email nudge for abandoned runs.
- Duplicate-template-to-another-tank; reorder polish (drag-and-drop).

---

## 9. Affected files (summary)

- **Backend:** `models.py` (+3 tables, +1 column), new `migrations.py`, new `backup.py`,
  `database.py` (helpers), `main.py` (startup order + router include), `schemas.py`
  (checklist schemas + `WIDGET_TYPES`), new `routers/checklists.py`, `seed.py`
  (checklist seeding), `routers/activity.py` (checklist item), `routers/tasks.py`
  (link + run-on-complete), `notifications.py` (Phase C nudge).
- **Frontend:** `data.js` (nav), `App.jsx` (route), new `pages/Checklists.jsx`, `api.js`
  (client + constants), `pages/Dashboard.jsx` (widget), `pages/Tasks.jsx` (Run / link),
  `icons.jsx` + `iconMap.jsx` (checklist icon), `theme.css` (styles).

## 10. Cross-cutting reminders
- LFS voice for all new copy (`uploads/CLAUDE.md` §0).
- Everything carries `tank_id` (multi-tank ready).
- UTC storage, local display.
- No new heavy deps without reason (stdlib + small libs).
- **Back up before every migration**; keep the version in the `settings` table; migrations idempotent.
