"""Red Sea ReefBeat device client — read-only LAN polling (EQUIPMENT_INTEGRATION_PLAN).

Devices speak plain HTTP on the local network and return JSON. We *port the
device-communication knowledge* (endpoint paths + JSON shapes) from the MIT-licensed
Home Assistant component https://github.com/Elwinmage/ha-reefbeat-component — we do
not import its code (it's coupled to HA entities/coordinators). Endpoints/keys here
mirror that component's `reefbeat/` clients and `sensor.py` JSONPaths.

Design (plan §3):
- **Read-only.** No control paths (no /resume, /update-volume, manual dose).
- **Defensive.** Any device may be unreachable or on different firmware → never throw
  to the caller; return ``{"online": False, ...}`` and read every JSON key with
  ``.get()`` so a missing/renamed field degrades to ``None`` rather than crashing.
- **Normalized.** Each device returns a flat status dict the frontend cards consume,
  independent of the raw firmware payload.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

import httpx

log = logging.getLogger("reef.reefbeat")

# Short timeout: a glance feature must not hang the request when a device is off (§3).
DEFAULT_TIMEOUT = 5.0

# Integration keys stored on Equipment.integration (mirror schemas.EQUIPMENT_INTEGRATIONS).
INTEGRATION_LED = "reefbeat_led"
INTEGRATION_ATO = "reefbeat_ato"
INTEGRATION_WAVE = "reefbeat_wave"
INTEGRATION_DOSE = "reefbeat_dose"


def _num(value: Any) -> Optional[float]:
    """Coerce a JSON value to float, or None if absent/garbage (defensive)."""
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


class ReefbeatDevice:
    """Base client. Subclasses implement :meth:`normalize` over fetched sources."""

    # Endpoints fetched on every poll. Subclasses extend this.
    SOURCES: tuple[str, ...] = ("/device-info", "/dashboard")

    def __init__(self, host: str, *, timeout: float = DEFAULT_TIMEOUT, secure: bool = False):
        scheme = "https" if secure else "http"
        self.host = host
        self.base_url = f"{scheme}://{host}"
        self.timeout = timeout

    async def _get(self, client: httpx.AsyncClient, path: str) -> Optional[dict]:
        """GET one endpoint; return parsed JSON or None (never raises)."""
        try:
            resp = await client.get(f"{self.base_url}{path}", timeout=self.timeout)
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPError, ValueError) as exc:  # network, status, or bad JSON
            log.debug("reefbeat %s%s failed: %s", self.base_url, path, exc)
            return None

    async def poll(self) -> dict:
        """Fetch all SOURCES and return a normalized status dict.

        On total unreachability returns ``{"online": False, "integration": ...}``.
        """
        # Fetch all endpoints concurrently so an offline device costs ~one timeout,
        # not (timeout × number of sources).
        async with httpx.AsyncClient() as client:
            results = await asyncio.gather(*(self._get(client, p) for p in self.SOURCES))
        sources: dict[str, Optional[dict]] = dict(zip(self.SOURCES, results))

        # Offline only if *nothing* answered — robust across device types (ReefWave
        # exposes device-info at "/" rather than "/device-info", etc.).
        if all(v is None for v in sources.values()):
            return {"online": False, "integration": self.integration}

        status = self.normalize(sources)
        status.setdefault("online", True)
        status["integration"] = self.integration
        # Device-info may live at different paths per device; use the first present.
        info = next((sources.get(p) for p in self.INFO_PATHS if sources.get(p)), {}) or {}
        status.setdefault("model", info.get("hw_model") or info.get("model"))
        status.setdefault("firmware", info.get("fw_version") or info.get("firmware"))
        return status

    # --- to be provided by subclasses ---
    integration: str = ""
    INFO_PATHS: tuple[str, ...] = ("/device-info",)

    def normalize(self, sources: dict[str, Optional[dict]]) -> dict:  # pragma: no cover
        raise NotImplementedError


class ReefLed(ReefbeatDevice):
    """ReefLED G2 — color/brightness, LED temperature + fan, moon, on/off."""

    integration = INTEGRATION_LED
    SOURCES = ("/device-info", "/dashboard", "/manual", "/moonphase")

    def normalize(self, sources: dict[str, Optional[dict]]) -> dict:
        manual = sources.get("/manual") or {}
        moon = sources.get("/moonphase") or {}
        white = _num(manual.get("white"))
        blue = _num(manual.get("blue"))
        moon_pct = _num(moon.get("intensity"))
        # On/off isn't a direct field on G2; derive it like the HA component does.
        any_light = any(v and v > 0 for v in (white, blue, moon_pct))
        return {
            "status": "on" if any_light else "off",
            "intensity": _num(manual.get("intensity")),
            "kelvin": _num(manual.get("kelvin")),
            "white": white,
            "blue": blue,
            "moon": moon_pct,
            "temperature": _num(manual.get("temperature")),
            "fan": _num(manual.get("fan")),
        }


class ReefAto(ReefbeatDevice):
    """ReefATO+ — reservoir level, volume left, auto-fill (pump) state."""

    integration = INTEGRATION_ATO

    def normalize(self, sources: dict[str, Optional[dict]]) -> dict:
        d = sources.get("/dashboard") or {}
        return {
            "water_level": d.get("water_level"),        # e.g. "ok" / "low"
            "volume_left": _num(d.get("volume_left")),
            "today_fills": _num(d.get("today_fills")),
            "today_volume_usage": _num(d.get("today_volume_usage")),
            "pump_state": d.get("pump_state"),          # auto-fill on/off
        }


class ReefWave(ReefbeatDevice):
    """ReefWave — pump pattern + intensity. **Local-only / partial** (plan §2): the
    wave *programs* live in Red Sea's cloud, so local polling yields the current
    schedule (intervals) but not full cloud state. We surface what's local and flag
    ``limited`` so the UI is honest ("limited · no cloud"). Device-info is at "/".
    """

    integration = INTEGRATION_WAVE
    SOURCES = ("/device-info", "/", "/auto", "/device-settings")
    INFO_PATHS = ("/device-info", "/")

    def normalize(self, sources: dict[str, Optional[dict]]) -> dict:
        auto = sources.get("/auto") or {}
        intervals = auto.get("intervals") or []
        # No single "live speed" without the cloud; the first scheduled interval is the
        # best honest local proxy for the current pump program.
        cur = intervals[0] if intervals else {}
        return {
            "pump_pct": _num(cur.get("fti")),        # forward intensity %
            "reverse_pct": _num(cur.get("rti")),     # reverse intensity %
            "wave_type": cur.get("type"),            # e.g. "ra" / "un" (Red Sea codes)
            "direction": cur.get("direction"),       # alt / fw / rw
            "schedule_count": len(intervals),
            "limited": True,                         # local-only; cloud has the rest
            "data_source": "local",
        }


def _supplement_name(supp: Any) -> Optional[str]:
    """A head's supplement may be a plain string or an object — pull a display name."""
    if isinstance(supp, str):
        return supp or None
    if isinstance(supp, dict):
        for k in ("display_name", "name", "short_name", "brand_name"):
            if supp.get(k):
                return supp[k]
    return None


class ReefDose(ReefbeatDevice):
    """ReefDose 2/4 — per-head dosing. ``/dashboard`` carries the per-head daily/dosed
    figures; ``/head/{n}/settings`` carries each head's supplement. We always fetch
    heads 1–4 (extra heads 404 → None and are skipped), and normalize to a `heads`
    list the multi-head card renders (plan §4.5).
    """

    integration = INTEGRATION_DOSE
    SOURCES = (
        "/device-info",
        "/dashboard",
        "/device-settings",
        "/head/1/settings",
        "/head/2/settings",
        "/head/3/settings",
        "/head/4/settings",
    )

    @staticmethod
    def _head_data(heads: Any, n: int) -> dict:
        """`heads` may be a dict keyed by head number or a list — handle both."""
        if isinstance(heads, dict):
            return heads.get(str(n)) or heads.get(n) or {}
        if isinstance(heads, list) and 0 < n <= len(heads):
            return heads[n - 1] or {}
        return {}

    def normalize(self, sources: dict[str, Optional[dict]]) -> dict:
        dash = sources.get("/dashboard") or {}
        heads_raw = dash.get("heads")
        # Which heads exist: those present in the dashboard, else those whose settings
        # answered, else assume 4 (this is the ReefDose *4*).
        present = []
        for n in (1, 2, 3, 4):
            if self._head_data(heads_raw, n) or sources.get(f"/head/{n}/settings"):
                present.append(n)
        if not present:
            present = [1, 2, 3, 4]

        heads = []
        for n in present:
            hd = self._head_data(heads_raw, n)
            settings = sources.get(f"/head/{n}/settings") or {}
            auto = _num(hd.get("auto_dosed_today")) or 0
            manual = _num(hd.get("manual_dosed_today")) or 0
            heads.append({
                "n": n,
                "supplement": _supplement_name(settings.get("supplement")),
                "daily_ml": _num(hd.get("daily_dose")),
                "dosed_ml": auto + manual,
                "remaining_days": _num(hd.get("remaining_days")),
                "state": hd.get("state"),
            })
        return {"heads": heads}


# Map an Equipment.integration value to its client class. LED + ATO + Wave + Dose
# all supported (Dose lights up once the device is on the LAN).
_CLIENTS: dict[str, type[ReefbeatDevice]] = {
    INTEGRATION_LED: ReefLed,
    INTEGRATION_ATO: ReefAto,
    INTEGRATION_WAVE: ReefWave,
    INTEGRATION_DOSE: ReefDose,
}


def client_for(integration: Optional[str], host: Optional[str]) -> Optional[ReefbeatDevice]:
    """Build a device client for an integration/host pair, or None if unsupported."""
    if not integration or not host:
        return None
    cls = _CLIENTS.get(integration)
    return cls(host) if cls else None


def is_supported(integration: Optional[str]) -> bool:
    return bool(integration) and integration in _CLIENTS
