"""SQLModel tables — the full data model from REEF_TRACKER_SPEC.md §4.

The entire schema is defined up front (multi-tank, livestock, consumables, etc.)
even though Phase 1 only reads/writes tanks, parameters, and readings. Per the
spec's guiding principle #4: build the foundation now so later phases don't need
migrations. Timestamps are stored in UTC; the frontend renders them in local time.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Setting(SQLModel, table=True):
    """App-wide key/value config editable at runtime (e.g. the ntfy topic).

    Lets settings live in the DB instead of only env vars, so they can be changed
    from the Settings page without a restart. Values fall back to env vars when unset.
    """
    __tablename__ = "settings"
    key: str = Field(primary_key=True)
    value: str = ""


class Tank(SQLModel, table=True):
    __tablename__ = "tanks"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    volume_gal: float
    notes: str = ""
    active: bool = True


class Parameter(SQLModel, table=True):
    __tablename__ = "parameters"
    id: Optional[int] = Field(default=None, primary_key=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    name: str
    unit: str = ""
    target_min: Optional[float] = None
    target_max: Optional[float] = None
    display_order: int = 0
    active: bool = True


class Reading(SQLModel, table=True):
    __tablename__ = "readings"
    id: Optional[int] = Field(default=None, primary_key=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    parameter_id: int = Field(foreign_key="parameters.id", index=True)
    value: float
    measured_at: datetime = Field(default_factory=utcnow, index=True)
    note: str = ""


class Task(SQLModel, table=True):
    __tablename__ = "tasks"
    id: Optional[int] = Field(default=None, primary_key=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    name: str
    category: str = ""
    recurrence_rule: str = ""  # human/RRULE-ish string, e.g. "weekly"
    last_done_at: Optional[datetime] = None
    next_due_at: Optional[datetime] = None
    notify_channels: str = ""  # CSV: "email,ntfy"
    last_notified_at: Optional[datetime] = None  # set by the scheduler; once per due cycle
    active: bool = True


class TaskLog(SQLModel, table=True):
    __tablename__ = "task_log"
    id: Optional[int] = Field(default=None, primary_key=True)
    task_id: int = Field(foreign_key="tasks.id", index=True)
    completed_at: datetime = Field(default_factory=utcnow)
    note: str = ""


class Livestock(SQLModel, table=True):
    __tablename__ = "livestock"
    id: Optional[int] = Field(default=None, primary_key=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    common_name: str
    scientific_name: str = ""
    type: str = ""  # fish/coral/invert/cuc
    date_added: Optional[datetime] = None
    source: str = ""
    status: str = "alive"  # alive/lost/removed
    notes: str = ""


class Equipment(SQLModel, table=True):
    __tablename__ = "equipment"
    id: Optional[int] = Field(default=None, primary_key=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    type: str = ""  # e.g. "Lighting", "Return pump" — see schemas.EQUIPMENT_TYPES
    brand: str = ""
    model: str = ""
    nickname: str = ""  # optional shorthand, e.g. "the AI Prime over the frag rack"
    installed_at: Optional[datetime] = None
    notes: str = ""
    active: bool = True


class Photo(SQLModel, table=True):
    __tablename__ = "photos"
    id: Optional[int] = Field(default=None, primary_key=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    file_path: str
    caption: str = ""
    taken_at: Optional[datetime] = None
    linked_type: str = ""  # tank/livestock/journal
    linked_id: Optional[int] = None


class Journal(SQLModel, table=True):
    __tablename__ = "journal"
    id: Optional[int] = Field(default=None, primary_key=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    entry_at: datetime = Field(default_factory=utcnow, index=True)
    title: str
    body: str = ""


class Consumable(SQLModel, table=True):
    __tablename__ = "consumables"
    id: Optional[int] = Field(default=None, primary_key=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    name: str
    unit: str = ""
    current_qty: float = 0
    reorder_threshold: float = 0
    est_daily_use: float = 0
    vendor: str = ""
    notes: str = ""


class ConsumableLog(SQLModel, table=True):
    __tablename__ = "consumable_log"
    id: Optional[int] = Field(default=None, primary_key=True)
    consumable_id: int = Field(foreign_key="consumables.id", index=True)
    change_qty: float = 0
    logged_at: datetime = Field(default_factory=utcnow)
    reason: str = ""


class DashboardLayout(SQLModel, table=True):
    """Per-tank customizable dashboard layout (Phase 4.4).

    One row per tank, holding the ordered list of widgets below the fixed KPI row
    as a JSON string. Kept as a single JSON blob (not a child table) because the
    layout is read and written whole — there's nothing to query inside it.
    """
    __tablename__ = "dashboard_layout"
    tank_id: int = Field(foreign_key="tanks.id", primary_key=True)
    widgets: str = "[]"  # JSON array of {id, type, options}
    updated_at: datetime = Field(default_factory=utcnow)
