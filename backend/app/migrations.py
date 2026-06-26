"""Lightweight in-house schema migrations.

`SQLModel.metadata.create_all` creates missing *tables* but never ALTERs existing
ones, so a new column on an existing table (e.g. tasks.checklist_template_id) needs
a real migration. We track the applied version in the `settings` key/value table and
run forward-only, idempotent steps. Always back up first (see backup.py / main.py).

Adopt Alembic if migrations ever get complex; this is deliberately minimal for now.
"""
from __future__ import annotations

import logging

from sqlalchemy import text
from sqlmodel import Session

from .models import Setting

log = logging.getLogger("reef.migrations")

SCHEMA_VERSION = 3  # bump per migration


def _get_version(session: Session) -> int:
    row = session.get(Setting, "schema_version")
    try:
        return int(row.value) if row and row.value else 1
    except ValueError:
        return 1


def _set_version(session: Session, version: int) -> None:
    row = session.get(Setting, "schema_version")
    if row:
        row.value = str(version)
    else:
        row = Setting(key="schema_version", value=str(version))
    session.add(row)
    session.commit()


def _columns(session: Session, table: str) -> set[str]:
    rows = session.execute(text(f"PRAGMA table_info({table})")).all()
    return {r[1] for r in rows}  # r[1] is the column name


def run_migrations(session: Session) -> None:
    current = _get_version(session)
    if current >= SCHEMA_VERSION:
        return
    log.info("running migrations: v%d -> v%d", current, SCHEMA_VERSION)

    # v1 -> v2: add tasks.checklist_template_id (the 3 checklist tables themselves
    # are created by create_all). Guarded so it's a no-op on a fresh DB where
    # create_all already made the column.
    if current < 2:
        if "checklist_template_id" not in _columns(session, "tasks"):
            session.execute(text("ALTER TABLE tasks ADD COLUMN checklist_template_id INTEGER"))
            session.commit()
            log.info("added tasks.checklist_template_id")
        _set_version(session, 2)

    # v2 -> v3: Red Sea ReefBeat integration fields on equipment (host, integration,
    # viz_enabled, last_seen, last_status). Additive/nullable; guarded per column so
    # it's a no-op on a fresh DB where create_all already made them.
    if current < 3:
        cols = _columns(session, "equipment")
        adds = [
            ("host", "ALTER TABLE equipment ADD COLUMN host VARCHAR"),
            ("integration", "ALTER TABLE equipment ADD COLUMN integration VARCHAR"),
            ("viz_enabled", "ALTER TABLE equipment ADD COLUMN viz_enabled BOOLEAN DEFAULT 1"),
            ("last_seen", "ALTER TABLE equipment ADD COLUMN last_seen DATETIME"),
            ("last_status", "ALTER TABLE equipment ADD COLUMN last_status VARCHAR"),
        ]
        for col, sql in adds:
            if col not in cols:
                session.execute(text(sql))
                log.info("added equipment.%s", col)
        session.commit()
        _set_version(session, 3)

    log.info("migrations complete (now v%d)", SCHEMA_VERSION)
