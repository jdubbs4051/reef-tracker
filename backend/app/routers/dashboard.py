"""Per-tank dashboard layout (Phase 4.4).

Stores the ordered list of customizable widgets below the fixed KPI row. The KPI
row itself (Tank status, Due today, Last logged) is not part of this — it's always
present. When a tank has no saved layout yet, we return a sensible default that
mirrors the classic dashboard plus the new task calendar, so the first visit looks
finished rather than empty.
"""
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import DashboardLayout, Parameter, utcnow
from ..schemas import (
    WIDGET_TYPES,
    DashboardLayoutRead,
    DashboardLayoutUpdate,
    WidgetConfig,
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _wid() -> str:
    return uuid.uuid4().hex[:8]


def _default_widgets(session: Session, tank_id: int) -> list[WidgetConfig]:
    """Recreate the classic dashboard layout, plus a task calendar."""
    params = session.exec(
        select(Parameter)
        .where(Parameter.tank_id == tank_id)
        .order_by(Parameter.display_order, Parameter.id)
    ).all()
    # The classic dashboard featured the Alkalinity trend; fall back to the first
    # parameter so the default chart always has something to show.
    chart_param = next((p for p in params if p.name == "Alkalinity"), params[0] if params else None)

    widgets = [
        WidgetConfig(id=_wid(), type="latest-readings"),
        WidgetConfig(id=_wid(), type="whats-due"),
    ]
    if chart_param:
        widgets.append(WidgetConfig(id=_wid(), type="chart", options={"parameter_id": chart_param.id}))
    widgets += [
        WidgetConfig(id=_wid(), type="insight"),
        WidgetConfig(id=_wid(), type="calendar"),
        WidgetConfig(id=_wid(), type="activity"),
    ]
    return widgets


@router.get("/layout", response_model=DashboardLayoutRead)
def get_layout(tank_id: int, session: Session = Depends(get_session)):
    row = session.get(DashboardLayout, tank_id)
    if row and row.widgets:
        widgets = [WidgetConfig(**w) for w in json.loads(row.widgets)]
    else:
        widgets = _default_widgets(session, tank_id)
    return DashboardLayoutRead(tank_id=tank_id, widgets=widgets)


@router.put("/layout", response_model=DashboardLayoutRead)
def save_layout(tank_id: int, body: DashboardLayoutUpdate, session: Session = Depends(get_session)):
    for w in body.widgets:
        if w.type not in WIDGET_TYPES:
            raise HTTPException(status_code=400, detail=f"Unknown widget type: {w.type}")

    payload = json.dumps([w.model_dump() for w in body.widgets])
    row = session.get(DashboardLayout, tank_id)
    if row:
        row.widgets = payload
        row.updated_at = utcnow()
    else:
        row = DashboardLayout(tank_id=tank_id, widgets=payload)
    session.add(row)
    session.commit()
    return DashboardLayoutRead(tank_id=tank_id, widgets=body.widgets)
