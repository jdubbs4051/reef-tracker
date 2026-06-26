"""Automatic DB snapshots — so a failed migration can never lose data.

The whole app state is one directory (see database.py), so a plain file copy of
reef.db is a complete snapshot. We take one before running migrations and keep
the last N, pruning older ones. Self-hosted, no cloud, no extra deps.
"""
from __future__ import annotations

import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .database import DB_PATH

log = logging.getLogger("reef.backup")

BACKUP_DIR = DB_PATH.parent / "backups"
KEEP = 10  # how many snapshots to retain


def _prune(keep: int = KEEP) -> None:
    snaps = sorted(BACKUP_DIR.glob("reef-*.db"))
    for old in snaps[:-keep]:
        try:
            old.unlink()
        except OSError as e:  # best-effort; a stuck prune shouldn't block startup
            log.warning("could not prune old backup %s: %s", old.name, e)


def backup_db(keep: int = KEEP) -> Path | None:
    """Snapshot reef.db into data/backups/reef-<UTC-timestamp>.db.

    Skips (returns None) if the DB doesn't exist yet or is empty — a brand-new
    install has nothing worth backing up.
    """
    if not DB_PATH.exists() or DB_PATH.stat().st_size == 0:
        return None
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = BACKUP_DIR / f"reef-{stamp}.db"
    shutil.copy2(DB_PATH, dest)
    log.info("backed up DB -> %s", dest)
    _prune(keep)
    return dest
