"""In-process scheduler (APScheduler) that checks for due tasks and notifies once
per due cycle. See REEF_TRACKER_SPEC.md §2 — fires due-task checks and notifications.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from .database import engine
from .integrations.poller import POLL_INTERVAL_SECONDS, poll_devices
from .models import ChecklistRun, ChecklistStep, ChecklistTemplate, Task
from .notifications import notify_run_safety, notify_task_due

log = logging.getLogger("reef.scheduler")

# How often to scan for due tasks. Default hourly; override for testing.
CHECK_INTERVAL_SECONDS = int(os.environ.get("REEF_CHECK_INTERVAL", "3600"))
# Nudge about a checklist run left open this long with critical steps undone.
RUN_NUDGE_HOURS = int(os.environ.get("REEF_RUN_NUDGE_HOURS", "6"))

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


def check_abandoned_runs() -> int:
    """Nudge once about checklist runs left open past RUN_NUDGE_HOURS with critical
    steps still unchecked — the "did you turn the return pump back on?" safety guard.

    Returns the number of nudges sent (useful for tests).
    """
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=RUN_NUDGE_HOURS)
    sent = 0
    with Session(engine) as session:
        runs = session.exec(
            select(ChecklistRun).where(ChecklistRun.status == "in_progress")
        ).all()
        for run in runs:
            if _aware(run.started_at) is None or _aware(run.started_at) > cutoff:
                continue
            try:
                state = json.loads(run.state) if run.state else {}
            except json.JSONDecodeError:
                state = {}
            if state.get("nudged_at"):  # nudge only once per run
                continue
            done = state.get("done", {})
            criticals = session.exec(
                select(ChecklistStep)
                .where(ChecklistStep.template_id == run.template_id)
                .where(ChecklistStep.kind == "critical")
            ).all()
            undone = [s.text for s in criticals if not done.get(str(s.id))]
            if not undone:
                continue
            template = session.get(ChecklistTemplate, run.template_id)
            name = template.name if template else "checklist"
            try:
                notify_run_safety(name, undone)
            except Exception:
                log.exception("safety nudge failed for run %s", run.id)
                continue
            state["nudged_at"] = now.isoformat()
            run.state = json.dumps(state)
            session.add(run)
            sent += 1
        session.commit()
    if sent:
        log.info("abandoned-run check sent %d safety nudge(s)", sent)
    return sent


def start_scheduler() -> None:
    global _scheduler
    if _scheduler:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(check_due_tasks, "interval", seconds=CHECK_INTERVAL_SECONDS, id="due_check")
    _scheduler.add_job(check_abandoned_runs, "interval", seconds=CHECK_INTERVAL_SECONDS, id="run_safety_check")
    # ReefBeat device poll. next_run_time=now so the first poll fires almost immediately
    # in a scheduler worker thread — it spins its own event loop (asyncio.run) and so
    # must NOT be called inline from the async lifespan.
    _scheduler.add_job(
        poll_devices,
        "interval",
        seconds=POLL_INTERVAL_SECONDS,
        id="device_poll",
        next_run_time=datetime.now(timezone.utc),
    )
    _scheduler.start()
    log.info("scheduler started (every %ds, devices every %ds)", CHECK_INTERVAL_SECONDS, POLL_INTERVAL_SECONDS)
    check_due_tasks()  # run once at startup so reminders aren't delayed
    check_abandoned_runs()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
