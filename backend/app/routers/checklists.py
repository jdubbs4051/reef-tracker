"""Checklist templates (reusable procedures) + runs (one walk-through).

Mirrors the CRUD style of the other routers. Steps are sent as a whole array on
template create/update (no per-step endpoints) — lists are short and this keeps
reordering trivial; the server rewrites `position` from the array index.

Phase A ships note-only steps and a simple check-off run that persists its state.
"""
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import (
    ChecklistRun,
    ChecklistStep,
    ChecklistTemplate,
    Journal,
    Reading,
    Task,
    TaskLog,
    utcnow,
)
from ..recurrence import next_due
from ..schemas import (
    ChecklistRunRead,
    ChecklistStepIn,
    ChecklistStepRead,
    ChecklistTemplateCreate,
    ChecklistTemplateRead,
    ChecklistTemplateUpdate,
    RunStateUpdate,
)

router = APIRouter(prefix="/api/checklists", tags=["checklists"])


# ---- serialization helpers ----

def _step_read(s: ChecklistStep) -> ChecklistStepRead:
    try:
        cfg = json.loads(s.config) if s.config else {}
    except json.JSONDecodeError:
        cfg = {}
    return ChecklistStepRead(
        id=s.id, position=s.position, text=s.text, detail=s.detail, kind=s.kind, config=cfg
    )


def _steps_for(session: Session, template_id: int) -> list[ChecklistStep]:
    return session.exec(
        select(ChecklistStep)
        .where(ChecklistStep.template_id == template_id)
        .order_by(ChecklistStep.position, ChecklistStep.id)
    ).all()


def _template_read(session: Session, t: ChecklistTemplate) -> ChecklistTemplateRead:
    steps = [_step_read(s) for s in _steps_for(session, t.id)]
    return ChecklistTemplateRead(
        id=t.id, tank_id=t.tank_id, name=t.name, category=t.category,
        description=t.description, active=t.active, steps=steps,
    )


def _replace_steps(session: Session, template_id: int, steps: list[ChecklistStepIn]) -> None:
    """Delete the template's existing steps and write the new array, in order."""
    for old in _steps_for(session, template_id):
        session.delete(old)
    for i, s in enumerate(steps):
        session.add(
            ChecklistStep(
                template_id=template_id,
                position=i,
                text=s.text,
                detail=s.detail,
                kind=s.kind,
                config=json.dumps(s.config or {}),
            )
        )


def _run_read(session: Session, r: ChecklistRun) -> ChecklistRunRead:
    t = session.get(ChecklistTemplate, r.template_id)
    steps = [_step_read(s) for s in _steps_for(session, r.template_id)]
    try:
        state = json.loads(r.state) if r.state else {}
    except json.JSONDecodeError:
        state = {}
    return ChecklistRunRead(
        id=r.id, template_id=r.template_id, tank_id=r.tank_id, task_id=r.task_id,
        started_at=r.started_at, completed_at=r.completed_at, status=r.status,
        state=state, template_name=t.name if t else "(deleted)", steps=steps,
    )


# ---- templates ----

@router.get("", response_model=list[ChecklistTemplateRead])
def list_templates(
    tank_id: int,
    include_inactive: bool = False,
    session: Session = Depends(get_session),
):
    stmt = select(ChecklistTemplate).where(ChecklistTemplate.tank_id == tank_id)
    if not include_inactive:
        stmt = stmt.where(ChecklistTemplate.active == True)  # noqa: E712
    templates = session.exec(stmt.order_by(ChecklistTemplate.name)).all()
    return [_template_read(session, t) for t in templates]


@router.post("", response_model=ChecklistTemplateRead, status_code=201)
def create_template(body: ChecklistTemplateCreate, session: Session = Depends(get_session)):
    t = ChecklistTemplate(
        tank_id=body.tank_id, name=body.name, category=body.category,
        description=body.description,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    _replace_steps(session, t.id, body.steps)
    session.commit()
    return _template_read(session, t)


# --- runs (declared before /{template_id} so "runs" isn't read as a template id) ---

@router.get("/runs", response_model=list[ChecklistRunRead])
def list_runs(
    tank_id: int,
    status: Optional[str] = None,
    session: Session = Depends(get_session),
):
    stmt = select(ChecklistRun).where(ChecklistRun.tank_id == tank_id)
    if status:
        stmt = stmt.where(ChecklistRun.status == status)
    runs = session.exec(stmt.order_by(ChecklistRun.started_at.desc())).all()
    return [_run_read(session, r) for r in runs]


@router.get("/runs/{run_id}", response_model=ChecklistRunRead)
def get_run(run_id: int, session: Session = Depends(get_session)):
    r = session.get(ChecklistRun, run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    return _run_read(session, r)


@router.patch("/runs/{run_id}", response_model=ChecklistRunRead)
def update_run(run_id: int, body: RunStateUpdate, session: Session = Depends(get_session)):
    r = session.get(ChecklistRun, run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    if r.status != "in_progress":
        raise HTTPException(status_code=409, detail="Run is already finished")
    r.state = json.dumps(body.state or {})
    session.add(r)
    session.commit()
    session.refresh(r)
    return _run_read(session, r)


def _save_input_captures(session: Session, r: ChecklistRun) -> None:
    """Write any 'input' step captures into readings/journal (Phase C).

    Doing maintenance logs your data: a step like "record post-change salinity"
    (config target=reading) writes a Reading; target=journal writes a Journal entry.
    Invalid/blank values are skipped rather than failing the whole finish.
    """
    try:
        state = json.loads(r.state) if r.state else {}
    except json.JSONDecodeError:
        state = {}
    inputs = state.get("inputs", {})
    if not inputs:
        return
    for s in _steps_for(session, r.template_id):
        if s.kind != "input":
            continue
        raw = inputs.get(str(s.id))
        if raw is None or str(raw).strip() == "":
            continue
        try:
            cfg = json.loads(s.config) if s.config else {}
        except json.JSONDecodeError:
            cfg = {}
        target = cfg.get("target", "journal")
        if target == "reading" and cfg.get("parameter_id"):
            try:
                value = float(raw)
            except (TypeError, ValueError):
                continue  # not a number — skip rather than break the finish
            session.add(Reading(
                tank_id=r.tank_id, parameter_id=int(cfg["parameter_id"]),
                value=value, measured_at=r.completed_at, note=f"via checklist: {s.text}",
            ))
        else:
            session.add(Journal(
                tank_id=r.tank_id, title=s.text, body=str(raw), entry_at=r.completed_at,
            ))


@router.post("/runs/{run_id}/complete", response_model=ChecklistRunRead)
def complete_run(run_id: int, session: Session = Depends(get_session)):
    r = session.get(ChecklistRun, run_id)
    if not r:
        raise HTTPException(status_code=404, detail="Run not found")
    r.completed_at = utcnow()
    r.status = "completed"
    session.add(r)
    _save_input_captures(session, r)
    # If this run was launched from a due task, finishing it completes &
    # reschedules that task (reuses the Task.complete flow). Phase B linking.
    if r.task_id:
        task = session.get(Task, r.task_id)
        if task:
            task.last_done_at = r.completed_at
            task.next_due_at = next_due(r.completed_at, task.recurrence_rule)
            task.last_notified_at = None
            session.add(task)
            session.add(TaskLog(task_id=task.id, completed_at=r.completed_at,
                                note="Completed via checklist"))
    session.commit()
    session.refresh(r)
    return _run_read(session, r)


# ---- template item routes (parameterized — declared after the /runs routes) ----

@router.get("/{template_id}", response_model=ChecklistTemplateRead)
def get_template(template_id: int, session: Session = Depends(get_session)):
    t = session.get(ChecklistTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return _template_read(session, t)


@router.patch("/{template_id}", response_model=ChecklistTemplateRead)
def update_template(
    template_id: int, body: ChecklistTemplateUpdate, session: Session = Depends(get_session)
):
    t = session.get(ChecklistTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Checklist not found")
    data = body.model_dump(exclude_unset=True)
    for key in ("name", "category", "description"):
        if key in data:
            setattr(t, key, data[key])
    t.updated_at = utcnow()
    session.add(t)
    if body.steps is not None:
        _replace_steps(session, t.id, body.steps)
    session.commit()
    return _template_read(session, t)


@router.delete("/{template_id}", status_code=204)
def deactivate_template(template_id: int, session: Session = Depends(get_session)):
    t = session.get(ChecklistTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Checklist not found")
    t.active = False
    session.add(t)
    session.commit()


@router.post("/{template_id}/runs", response_model=ChecklistRunRead, status_code=201)
def start_run(
    template_id: int,
    task_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    t = session.get(ChecklistTemplate, template_id)
    if not t:
        raise HTTPException(status_code=404, detail="Checklist not found")
    r = ChecklistRun(template_id=t.id, tank_id=t.tank_id, task_id=task_id)
    session.add(r)
    session.commit()
    session.refresh(r)
    return _run_read(session, r)
