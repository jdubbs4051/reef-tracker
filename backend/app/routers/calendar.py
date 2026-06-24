"""iCal feed at /calendar.ics — subscribe Google/Apple Calendar to it and recurring
maintenance tasks appear automatically (REEF_TRACKER_SPEC.md §3). No OAuth needed.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlmodel import Session, select

from ..database import get_session
from ..models import Task
from ..recurrence import is_scheduled, normalize_rule

router = APIRouter(tags=["calendar"])

# Map a cadence to an iCal RRULE body.
_RRULE = {
    "daily": "FREQ=DAILY",
    "weekly": "FREQ=WEEKLY",
    "biweekly": "FREQ=WEEKLY;INTERVAL=2",
    "fortnightly": "FREQ=WEEKLY;INTERVAL=2",
    "monthly": "FREQ=MONTHLY",
}


def _rrule(rule: str) -> str | None:
    r = normalize_rule(rule)
    if r in _RRULE:
        return _RRULE[r]
    if r.startswith("every"):
        parts = r.split()
        if len(parts) == 3 and parts[1].isdigit():
            return f"FREQ=DAILY;INTERVAL={parts[1]}"
    return None


def _fmt_date(dt: datetime) -> str:
    return dt.strftime("%Y%m%d")


def _fmt_stamp(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


@router.get("/calendar.ics")
def calendar_feed(session: Session = Depends(get_session)):
    tasks = session.exec(select(Task).where(Task.active == True)).all()  # noqa: E712
    now = datetime.now(timezone.utc)

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Reef Tracker//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Reef Tracker — Maintenance",
    ]
    for t in tasks:
        if not t.next_due_at or not is_scheduled(t.recurrence_rule):
            continue
        rrule = _rrule(t.recurrence_rule)
        lines += [
            "BEGIN:VEVENT",
            f"UID:reef-task-{t.id}@reef-tracker",
            f"DTSTAMP:{_fmt_stamp(now)}",
            f"DTSTART;VALUE=DATE:{_fmt_date(t.next_due_at)}",
            f"SUMMARY:{t.name}",
            f"CATEGORIES:{t.category}",
            "DESCRIPTION:Reef Tracker maintenance task",
        ]
        if rrule:
            lines.append(f"RRULE:{rrule}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")

    body = "\r\n".join(lines) + "\r\n"
    return Response(content=body, media_type="text/calendar")
