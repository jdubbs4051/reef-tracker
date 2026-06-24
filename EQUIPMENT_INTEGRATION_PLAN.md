# Equipment Integration Plan — Red Sea ReefBeat (read-only visibility)

**Owner:** Jonathan
**Status:** Planning. Not yet built.
**Goal:** Surface live status of connected Red Sea devices inside Reef Tracker by
polling them locally over the LAN — read-only, advisory, no control.

Builds on the existing `Equipment` model/router rather than adding a new subsystem.
Fits the spec's principles: **boring and local** (LAN HTTP, no cloud) and
**informs, never autopilots** (status display only).

---

## 1. Source & licensing

Based on the Home Assistant integration
[Elwinmage/ha-reefbeat-component](https://github.com/Elwinmage/ha-reefbeat-component)
(**MIT licensed**). We **port the device-communication knowledge, not the code** —
the component is coupled to Home Assistant (entities, coordinators), so we reuse the
endpoint paths and JSON shapes and reimplement the client against FastAPI/httpx.
Attribute the source in a code comment.

Reference files in that repo: `custom_components/redsea/reefbeat/api.py` (base client),
`led.py`, `ato.py`, `wave.py`, `cloud.py`.

---

## 2. Device reality check (the connected devices)

The component polls each device over plain HTTP on the LAN and caches the JSON.
Read-only visibility is the easy half (the hard half is pushing config changes).

| Device | Local visibility | Endpoints (local) | Notes |
|---|---|---|---|
| **ReefLED G2 60** | ✅ Full | `/device-info`, `/dashboard`, `/manual`, `/mode` | G2 hardware. Exposes intensity, kelvin / white / blue, moon, **LED temperature + fan**, on/off status, current program mode. |
| **ReefATO+** | ✅ Full | `/device-info`, `/dashboard`, `/configuration` | Reservoir / water-level status, auto-fill on/off, volume left. Actions exist (`/resume`, `/update-volume`) but are out of scope for read-only v1. |
| **ReefWave 25** | ⚠️ Partial | `/`, `/auto`, `/device-settings` | **No full local control point** — wave programs live in Red Sea's cloud. Local polling still yields current mode + pump settings. Full state/sync needs the cloud API (`cloud.py`, ReefBeat credentials). Since we only want *visibility*, local-only is acceptable for v1; defer cloud. |
| **ReefDose 4** | ✅ Full *(not yet connected)* | `/device-settings`, `/dosing-queue`, `/dashboard`, `/head/{1..4}/settings` | 4-head doser. Per head: supplement, daily programmed volume, dosed-so-far today, container volume remaining, schedule. Manual-dose / calibration actions exist but are out of scope for read-only v1. **Device owned but not on the network yet** — see the visualization toggle (§4.6). |

Base sources common to devices: `/device-info`, `/firmware`, `/mode`, `/cloud`,
`/wifi`, `/dashboard`.

---

## 3. Approach

- **Port, don't import.** Adapt the device layer into the backend; drop HA base
  classes; keep endpoint knowledge and JSON shapes.
- **Read-only first.** Polling and display only. No control paths in v1.
- **Defensive polling.** Any device may be unreachable → return `{online: false}`
  rather than throwing. Short timeout (~5s). Degrade to static equipment metadata.

---

## 4. Plan

### 4.1 Data model — `backend/app/models.py`
Add to `Equipment` (additive, nullable — no migration pain; schema was pre-baked):
- `host: Optional[str]` — device IP / hostname on the LAN.
- `integration: Optional[str]` — `"reefbeat_led"` | `"reefbeat_ato"` |
  `"reefbeat_wave"` | `"reefbeat_dose"` (null = static equipment, today's behavior).
- `viz_enabled: bool = True` — whether live-status visualization is shown/polled
  for this device (the §4.6 toggle). Lets an owned-but-not-yet-connected device
  (e.g. the ReefDose 4) sit in the app without erroring or polling.
- *(optional)* `last_seen: Optional[datetime]`, `last_status: Optional[str/JSON]`
  for offline detection / cached status.

### 4.2 Reefbeat client — `backend/app/integrations/reefbeat.py`
- `ReefbeatDevice(host)` base with async `fetch(path)` and `poll()`.
- Subclasses `ReefLed`, `ReefAto`, `ReefWave`, `ReefDose`, each returning a
  **normalized** status dict, e.g. LED → `{online, status, intensity, kelvin,
  temperature, fan}`; Dose → `{online, heads: [{n, supplement, daily_ml,
  dosed_ml, container_pct}]}`.
- Use `httpx` (cleaner with FastAPI). Short timeout, no blocking retries.
- Defensive: unreachable → `{online: false}`.

### 4.3 Status endpoint — `backend/app/routers/equipment.py`
- `GET /api/equipment/{id}/status` → normalized live (or cached) status JSON.
- Equipment without `host`/`integration` → `{integration: null}`; UI shows static info.

### 4.4 Background polling — reuse APScheduler (already in stack)
- Job every 30–60s polls all integrated equipment **where `viz_enabled` is true**;
  cache last-known status in memory (+ optional `last_seen`/`last_status` columns).
- Status endpoint reads cache → fast and tolerant of brief outages.
- *(optional)* Feed notable events (ATO reservoir low, LED over-temp) into the
  existing notification + activity-feed plumbing.

### 4.5 Frontend — equipment status cards
Design language borrowed from
[Elwinmage/ha-reef-card](https://github.com/Elwinmage/ha-reef-card): an
information-dense tile with a dominant **circular gauge**, a big central value, a
per-device color accent, status icons, and a plain-language status pill.
(Note: that project's LED/ATO/Wave cards are still "Planned" — we're designing
these, in its spirit.)

**Shared card skeleton** (same for every device, so the view scales as devices are added):
1. **Header** — colored icon chip + nickname + model, and an online/offline dot (top-right).
2. **Hero gauge** — the single most important number for that device, as a ring.
3. **Stat rows** — 2–3 secondary readings.
4. **Status pill** — plain-language summary (e.g. "level OK", "limited · no cloud").

Color accent encodes device type: **amber** = light, **blue** = ATO, **teal** = wave,
**purple** = doser.

**Per-device card content:**

| Device | Accent | Hero | Stat rows | Status pill |
|---|---|---|---|---|
| **ReefLED G2 60** | amber | Intensity % ring | LED temp + fan; white/blue mix; moon % | current program (e.g. `auto · daylight`) |
| **ReefATO+** | blue | Reservoir level % ring | volume left; auto-fill state; last fill | `level OK` (drives low-reservoir notification) |
| **ReefWave 25** | teal | Pump speed % ring | pattern; mode; data source | `limited · no cloud` (honest about local-only state) |
| **ReefDose 4** | purple | **4 small per-head rings** (% of today's dose delivered) | per head: supplement name, dosed-so-far / daily ml, container level bar | `paused` until connected, else `on schedule` / low-container warning |

The doser breaks the single-hero pattern: instead of one big ring it shows a
**2×2 (or 1×4) grid of small head rings** — closest to ha-reef-card's multi-zone
ReefDose layout — since the useful glance is "did every head dose today and is any
container running low."

**States:**
- **Online** — live values, green dot.
- **Offline** (`online: false`) — grey out the card, red dot, **freeze last-known
  values** with a "last seen 12m ago" line (never show zeros). Drives offline alerting.
- **Viz off / not connected** (`viz_enabled = false`) — collapse to a slim metadata
  row with a muted "live status off" label and an enable toggle. No polling, no
  offline error. This is the ReefDose's state today.
- Static equipment (no `integration`) renders as today — no gauge, just metadata.

**Density / navigation:**
- The card is the "dashboard glance" size.
- Card clicks through to an equipment detail page with an expanded view
  (schedules + 24h history chart — reuse the existing Recharts dependency). For the
  doser, the detail view is the natural home for per-head schedules + supplement info.

**Placement:** on the existing equipment view, and optionally a compact strip on
the main dashboard next to "Tank status."

**Form:** add `host`, `integration`, and the `viz_enabled` toggle to the equipment
add/edit form.

### 4.6 Visualization on/off toggle
A per-device switch (`viz_enabled`) controlling whether the live-status panel is
shown and polled — toggleable from the card header and the equipment edit form.

- **Why:** lets an owned-but-not-yet-networked device (today: the ReefDose 4) live
  in the app as proper equipment without showing a permanently "offline" card or
  wasting poll cycles. Flip it on once the device is on the LAN and has a `host`.
- **Off** → card collapses to the slim metadata row (see States); poller skips it.
- **On + no host** → card prompts for an IP rather than polling.
- `PATCH /api/equipment/{id}` already exists — `viz_enabled` rides along on it.

### 4.7 Surfaces — Equipment page vs. dashboard widget
Two render sizes of the same data, both reading the §4.3 status cache. **No new
nav page** — explicitly *not* a "Tank Control" page: it would split equipment
across two routes (the `equipment` nav item + `Equipment.jsx` already exist) and
the name implies control we're deliberately not building (read-only v1).

**A. Equipment page (full view)** — `frontend/src/pages/Equipment.jsx`
- Primary home. The full gauge cards (§4.5), click-through detail, and the
  `viz_enabled` toggle live here.
- Integrated devices render the gauge card; static equipment keeps its plain row.

**B. Dashboard widget (at-a-glance strip)** — `frontend/src/pages/Dashboard.jsx`
- Reuse the existing customizable-widget system (`WIDGET_META` picker, edit mode,
  1/2-column spans) — no new framework.
- Register `'equipment-status': 'Equipment status'` in `WIDGET_META`.
- Render a **compact strip** of mini-cards (one gauge + one headline number each),
  denser than the Equipment-page cards, sized to sit beside "Tank status."
- Add it to `WIDE_BY_DEFAULT` (a horizontal device strip reads best at 2-col).
- Optional/removable like any other widget; respects each device's `viz_enabled`.

### 4.8 Device discovery — optional, later
- v1: **manual IP entry** (simplest, matches "boring and local").
- Later: mDNS / subnet scan (the component auto-detects via subnet scan).

---

## 5. Open decisions (recommendations)
1. **ReefWave depth** → start **local-only** (no creds, partial info); wire cloud
   API later if needed.
2. **HTTP lib** → **httpx**.
3. **Polling interval** → **30–60s** (plenty for visibility, gentle on devices).

## 6. Risks
- **Firmware drift** — community-reverse-engineered endpoints can break on Red Sea
  updates. Mitigate: treat every device as optionally-unreachable; degrade gracefully.
- **Stale IPs** — devices need stable addresses (DHCP reservation) or discovery.

## 7. Suggested phasing
1. Model fields (`host`, `integration`, `viz_enabled`) + manual entry + on/off
   toggle (no live data yet).
2. Reefbeat client (LED + ATO) + status endpoint, on-demand poll.
3. Background poller + cache + offline detection.
4. Frontend status cards on the Equipment page + viz on/off toggle +
   offline/not-connected states.
5. Dashboard `equipment-status` widget (compact strip) via the existing widget system.
6. ReefWave local status.
7. ReefDose 4 (multi-head card) — wire up once the device is on the LAN.
8. *(later)* Discovery; ReefWave cloud; event → notification hooks.
