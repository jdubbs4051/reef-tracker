"""Recent activity feed for the dashboard — a merged timeline of logged reading
batches and completed maintenance tasks. Real Phase 1–2 events (no journal yet;
that's Phase 3).
"""
from sqlalchemy import func

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..database import get_session
from ..models import ChecklistRun, ChecklistTemplate, Journal, Livestock, Reading, Task, TaskLog
from ..schemas import ActivityItem

router = APIRouter(prefix="/api/activity", tags=["activity"])


@router.get("", response_model=list[ActivityItem])
def recent_activity(tank_id: int, limit: int = 6, session: Session = Depends(get_session)):
    items: list[ActivityItem] = []

    # Reading batches: rows sharing a measured_at were logged together.
    batches = session.exec(
        select(Reading.measured_at, func.count(Reading.id))
        .where(Reading.tank_id == tank_id)
        .group_by(Reading.measured_at)
        .order_by(Reading.measured_at.desc())
        .limit(limit)
    ).all()
    for measured_at, count in batches:
        noun = "reading" if count == 1 else "readings"
        items.append(
            ActivityItem(type="reading", title=f"Logged {count} {noun}", at=measured_at, color="blue")
        )

    # Completed tasks.
    completions = session.exec(
        select(TaskLog.completed_at, Task.name)
        .join(Task, Task.id == TaskLog.task_id)
        .where(Task.tank_id == tank_id)
        .order_by(TaskLog.completed_at.desc())
        .limit(limit)
    ).all()
    for completed_at, name in completions:
        items.append(
            ActivityItem(type="task", title=f"Completed: {name}", at=completed_at, color="teal")
        )

    # Journal entries.
    entries = session.exec(
        select(Journal.entry_at, Journal.title)
        .where(Journal.tank_id == tank_id)
        .order_by(Journal.entry_at.desc())
        .limit(limit)
    ).all()
    for entry_at, title in entries:
        items.append(ActivityItem(type="journal", title=title, at=entry_at, color="amber"))

    # Livestock additions.
    added = session.exec(
        select(Livestock.date_added, Livestock.common_name)
        .where(Livestock.tank_id == tank_id)
        .where(Livestock.date_added.is_not(None))
        .order_by(Livestock.date_added.desc())
        .limit(limit)
    ).all()
    for date_added, name in added:
        items.append(ActivityItem(type="livestock", title=f"Added {name}", at=date_added, color="teal"))

    # Completed checklist runs.
    runs = session.exec(
        select(ChecklistRun.completed_at, ChecklistTemplate.name)
        .join(ChecklistTemplate, ChecklistTemplate.id == ChecklistRun.template_id)
        .where(ChecklistRun.tank_id == tank_id)
        .where(ChecklistRun.status == "completed")
        .where(ChecklistRun.completed_at.is_not(None))
        .order_by(ChecklistRun.completed_at.desc())
        .limit(limit)
    ).all()
    for completed_at, name in runs:
        items.append(ActivityItem(type="checklist", title=f"Ran: {name}", at=completed_at, color="blue"))

    items.sort(key=lambda i: i.at, reverse=True)
    return items[:limit]
