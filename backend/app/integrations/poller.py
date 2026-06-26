"""Background poller + status cache for ReefBeat devices (EQUIPMENT_INTEGRATION_PLAN §4.4).

An APScheduler job polls every viz-enabled, supported, integrated device on an
interval and refreshes an in-memory cache. The status endpoint reads that cache, so
it stays fast and tolerant of brief outages. Last-known *good* status + `last_seen`
are also persisted onto the equipment row, so they survive a restart and drive
offline detection ("last seen 12m ago", frozen last values — never zeros).

Reachability model:
- **online poll**  → cache the fresh status, stamp `last_seen`, persist both.
- **offline poll** → keep the last-good values frozen, mark `online=False`, leave
  `last_seen`/`last_status` untouched so the UI can show how long it's been gone.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

from sqlmodel import Session, select

from ..database import engine
from ..models import Equipment
from . import reefbeat

log = logging.getLogger("reef.reefbeat.poller")

# Gentle on the devices; plenty fresh for an at-a-glance feature (plan §5.3).
POLL_INTERVAL_SECONDS = int(os.environ.get("REEF_DEVICE_POLL_INTERVAL", "45"))

# equipment_id -> {"status": dict|None, "online": bool, "last_seen": dt|None, "checked_at": dt}
# Whole entries are replaced (never mutated in place) so concurrent reads from the
# request loop never see a torn entry.
_CACHE: dict[int, dict[str, Any]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite hands back naive datetimes; treat them as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def get_cached(eq_id: int) -> Optional[dict]:
    return _CACHE.get(eq_id)


def update_cache(eq: Equipment, result: dict, session: Session) -> dict:
    """Fold one poll `result` into the cache for `eq`, persisting on success.

    Seeds the "last good" baseline from the persisted row when the in-memory cache
    is empty (e.g. just after a restart), so offline devices still show last-known.
    """
    now = _now()
    prev = _CACHE.get(eq.id) or {}
    prev_status = prev.get("status")
    prev_last_seen = prev.get("last_seen")
    if prev_status is None and eq.last_status:
        try:
            prev_status = json.loads(eq.last_status)
        except json.JSONDecodeError:
            prev_status = None
    if prev_last_seen is None:
        prev_last_seen = _aware(eq.last_seen)

    if result.get("online"):
        entry = {"status": result, "online": True, "last_seen": now, "checked_at": now}
        eq.last_status = json.dumps(result)
        eq.last_seen = now
        session.add(eq)
        session.commit()
    else:
        entry = {
            "status": prev_status,           # frozen last-known values
            "online": False,
            "last_seen": prev_last_seen,     # how long since we last saw it
            "checked_at": now,
        }
    _CACHE[eq.id] = entry
    return entry


def _targets(session: Session) -> list[Equipment]:
    """Active, viz-enabled, supported, addressable integrated devices."""
    rows = session.exec(
        select(Equipment)
        .where(Equipment.active == True)        # noqa: E712
        .where(Equipment.viz_enabled == True)   # noqa: E712
    ).all()
    return [e for e in rows if e.host and reefbeat.is_supported(e.integration)]


async def _poll_all(targets: list[Equipment]) -> list[dict]:
    clients = [reefbeat.client_for(e.integration, e.host) for e in targets]
    return await asyncio.gather(*(c.poll() for c in clients))


def poll_devices() -> int:
    """Poll all target devices and refresh the cache. Sync entry point for APScheduler.

    Must run in a worker thread (not the request event loop) because it spins its own
    loop via ``asyncio.run`` — the scheduler triggers it, we never call it inline from
    the async lifespan. Returns the number of devices polled (useful for tests).
    """
    with Session(engine) as session:
        targets = _targets(session)
        if not targets:
            return 0
        try:
            results = asyncio.run(_poll_all(targets))
        except Exception:
            log.exception("device poll failed")
            return 0
        online = 0
        for eq, result in zip(targets, results):
            update_cache(eq, result, session)
            online += 1 if result.get("online") else 0
    log.info("polled %d ReefBeat device(s), %d online", len(targets), online)
    return len(targets)
