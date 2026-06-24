"""In-process scheduler (APScheduler) that checks for due tasks and notifies once
per due cycle. See REEF_TRACKER_SPEC.md §2 — fires due-task checks and notifications.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from .database import engine
from .models import Task
from .notifications import notify_task_due

log = logging.getLogger("reef.scheduler")

# How often to scan for due tasks. Default hourly; override for testing.
CHECK_INTERVAL_SECONDS = int(os.environ.get("REEF_CHECK_INTERVAL", "3600"))

_scheduler: BackgroundScheduler | None = None


def _aware(dt: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; treat them as UTC for comparison."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def check_due_tasks() -> int:
    """Notify for any active task now due that hasn't been notified this cycle.

    Returns the number of notifications sent (useful for tests).
    """
    now = datetime.now(timezone.utc)
    sent = 0
    with Session(engine) as session:
        tasks = session.exec(select(Task).where(Task.active == True)).all()  # noqa: E712
        for task in tasks:
            due = _aware(task.next_due_at)
            if due is None or due > now:
                continue
            notified = _aware(task.last_notified_at)
            # Notify once per due cycle: skip if we've already notified since it came due.
            if notified is not None and notified >= due:
                continue
            try:
                notify_task_due(task.name, task.notify_channels)
            except Exception:  # fail loudly in logs, keep the loop alive
                log.exception("notification failed for task %s", task.id)
                continue
            task.last_notified_at = now
            session.add(task)
            sent += 1
        session.commit()
    if sent:
        log.info("due-task check sent %d notification(s)", sent)
    return sent


def start_scheduler() -> None:
    global _scheduler
    if _scheduler:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(check_due_tasks, "interval", seconds=CHECK_INTERVAL_SECONDS, id="due_check")
    _scheduler.start()
    log.info("scheduler started (every %ds)", CHECK_INTERVAL_SECONDS)
    check_due_tasks()  # run once at startup so reminders aren't delayed


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
