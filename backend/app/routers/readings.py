from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import Parameter, Reading, utcnow
from ..schemas import (
    LatestReading,
    ParameterSeries,
    ReadingBatchCreate,
    SeriesPoint,
)

router = APIRouter(prefix="/api/readings", tags=["readings"])


@router.post("", response_model=list[Reading], status_code=201)
def create_readings(body: ReadingBatchCreate, session: Session = Depends(get_session)):
    """Log a dated entry of one or more parameter values at once (Screen 2)."""
    if not body.entries:
        raise HTTPException(status_code=400, detail="No entries provided")
    measured_at = body.measured_at or utcnow()
    created: list[Reading] = []
    for entry in body.entries:
        reading = Reading(
            tank_id=body.tank_id,
            parameter_id=entry.parameter_id,
            value=entry.value,
            measured_at=measured_at,
            note=entry.note,
        )
        session.add(reading)
        created.append(reading)
    session.commit()
    for r in created:
        session.refresh(r)
    return created


@router.get("", response_model=list[Reading])
def list_readings(
    tank_id: int,
    parameter_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    stmt = select(Reading).where(Reading.tank_id == tank_id)
    if parameter_id is not None:
        stmt = stmt.where(Reading.parameter_id == parameter_id)
    stmt = stmt.order_by(Reading.measured_at)
    return session.exec(stmt).all()


@router.get("/latest", response_model=list[LatestReading])
def latest_readings(tank_id: int, session: Session = Depends(get_session)):
    """Most recent reading per parameter — drives the dashboard's latest readings."""
    rows = session.exec(
        select(Reading)
        .where(Reading.tank_id == tank_id)
        .order_by(Reading.measured_at)
    ).all()
    latest: dict[int, Reading] = {}
    for r in rows:
        latest[r.parameter_id] = r  # later rows overwrite -> keeps newest
    return [
        LatestReading(
            parameter_id=r.parameter_id,
            value=r.value,
            measured_at=r.measured_at,
            note=r.note,
        )
        for r in latest.values()
    ]


def _trend_per_week(points: List[SeriesPoint]) -> Optional[float]:
    """Least-squares slope in units per week. None if fewer than 2 points."""
    if len(points) < 2:
        return None
    t0 = points[0].measured_at
    xs = [(p.measured_at - t0).total_seconds() / (7 * 86400) for p in points]  # weeks
    ys = [p.value for p in points]
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    denom = sum((x - mean_x) ** 2 for x in xs)
    if denom == 0:
        return None
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom
    return slope


def _trend_label(slope: Optional[float], unit: str) -> str:
    if slope is None:
        return "Not enough data"
    word = "Steady" if abs(slope) < 0.15 else ("Rising" if slope > 0 else "Falling")
    rounded = round(slope, 1) or 0.0  # collapse -0.0 -> 0.0
    suffix = f" {unit}" if unit and unit not in ("", "SG") else ""
    return f"{word} · {rounded:+.1f}{suffix}/wk"


def _series_for(session: Session, tank_id: int, param: Parameter, weeks: int) -> ParameterSeries:
    since = datetime.now(timezone.utc) - timedelta(weeks=weeks)
    rows = session.exec(
        select(Reading)
        .where(Reading.tank_id == tank_id)
        .where(Reading.parameter_id == param.id)
        .where(Reading.measured_at >= since)
        .order_by(Reading.measured_at)
    ).all()
    points = [SeriesPoint(measured_at=r.measured_at, value=r.value) for r in rows]
    slope = _trend_per_week(points)
    return ParameterSeries(
        parameter_id=param.id,
        name=param.name,
        unit=param.unit,
        target_min=param.target_min,
        target_max=param.target_max,
        points=points,
        trend_per_week=slope,
        trend_label=_trend_label(slope, param.unit),
    )


@router.get("/series", response_model=ParameterSeries)
def parameter_series(
    tank_id: int,
    parameter_id: int,
    weeks: int = 8,
    session: Session = Depends(get_session),
):
    """Time series for one parameter + a simple trend, for the charts screen."""
    param = session.get(Parameter, parameter_id)
    if not param or param.tank_id != tank_id:
        raise HTTPException(status_code=404, detail="Parameter not found")
    return _series_for(session, tank_id, param, weeks)


@router.get("/series-all", response_model=list[ParameterSeries])
def all_parameter_series(
    tank_id: int,
    weeks: int = 8,
    session: Session = Depends(get_session),
):
    """One series per active parameter — drives the all-parameter chart grid.
    A single call avoids N round-trips from the Parameters screen."""
    params = session.exec(
        select(Parameter)
        .where(Parameter.tank_id == tank_id)
        .where(Parameter.active == True)  # noqa: E712 — SQLModel needs ==, not `is`
        .order_by(Parameter.display_order)
    ).all()
    return [_series_for(session, tank_id, p, weeks) for p in params]
