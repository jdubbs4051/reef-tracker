from datetime import timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import Task, TaskLog, utcnow
from ..recurrence import is_scheduled, next_due
from ..schemas import TaskComplete, TaskCreate, TaskUpdate

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _sort_key(t: Task):
    # Scheduled tasks first (soonest due), then unscheduled ("as needed") last.
    return (t.next_due_at is None, t.next_due_at or utcnow())


@router.get("", response_model=list[Task])
def list_tasks(
    tank_id: int,
    include_inactive: bool = False,
    session: Session = Depends(get_session),
):
    stmt = select(Task).where(Task.tank_id == tank_id)
    if not include_inactive:
        stmt = stmt.where(Task.active == True)  # noqa: E712
    tasks = session.exec(stmt).all()
    return sorted(tasks, key=_sort_key)


@router.post("", response_model=Task, status_code=201)
def create_task(body: TaskCreate, session: Session = Depends(get_session)):
    due = body.next_due_at
    if due is None and is_scheduled(body.recurrence_rule):
        due = next_due(utcnow(), body.recurrence_rule)
    task = Task(
        tank_id=body.tank_id,
        name=body.name,
        category=body.category,
        recurrence_rule=body.recurrence_rule,
        notify_channels=body.notify_channels,
        next_due_at=due,
        checklist_template_id=body.checklist_template_id,
    )
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.patch("/{task_id}", response_model=Task)
def update_task(task_id: int, body: TaskUpdate, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    data = body.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(task, key, value)
    # If the cadence changed but no explicit due date was given, reschedule from now.
    if "recurrence_rule" in data and "next_due_at" not in data:
        task.next_due_at = next_due(utcnow(), task.recurrence_rule)
        task.last_notified_at = None
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.post("/{task_id}/complete", response_model=Task)
def complete_task(task_id: int, body: TaskComplete, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    done_at = body.completed_at or utcnow()
    task.last_done_at = done_at
    task.next_due_at = next_due(done_at, task.recurrence_rule)
    task.last_notified_at = None  # allow the next cycle to notify again
    session.add(task)
    session.add(TaskLog(task_id=task.id, completed_at=done_at, note=body.note))
    session.commit()
    session.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def deactivate_task(task_id: int, session: Session = Depends(get_session)):
    task = session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.active = False
    session.add(task)
    session.commit()
