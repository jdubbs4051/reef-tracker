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
    # Optional link to a procedure: a due task can launch its checklist (Phase B).
    # Added to the existing tasks table by migrations.py (create_all won't ALTER it).
    checklist_template_id: Optional[int] = Field(
        default=None, foreign_key="checklist_templates.id"
    )


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
    # Red Sea ReefBeat integration (EQUIPMENT_INTEGRATION_PLAN §4.1) — additive,
    # nullable. Added to the existing equipment table by migrations.py.
    host: Optional[str] = None  # device IP / hostname on the LAN
    integration: Optional[str] = None  # see schemas.EQUIPMENT_INTEGRATIONS (null = static gear)
    viz_enabled: bool = True  # show/poll the live-status card (the §4.6 toggle)
    last_seen: Optional[datetime] = None  # set by the poller; for offline detection
    last_status: Optional[str] = None  # cached normalized status JSON (poller, later phase)


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


class ChecklistTemplate(SQLModel, table=True):
    """A reusable maintenance procedure (e.g. "Water Change") — the ordered steps
    you follow when you do it. Distinct from a Task (a reminder that it's *due*);
    a Task may link to a template so a due reminder can launch the procedure.
    """
    __tablename__ = "checklist_templates"
    id: Optional[int] = Field(default=None, primary_key=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    name: str
    category: str = ""  # "" or reuse task CATEGORIES
    description: str = ""
    active: bool = True  # deactivate-not-delete, like the rest of the app
    updated_at: datetime = Field(default_factory=utcnow)


class ChecklistStep(SQLModel, table=True):
    """One ordered step of a template. A real child table (not JSON) because the
    editor reorders/edits steps individually and `position` ordering reads cleanly.
    """
    __tablename__ = "checklist_steps"
    id: Optional[int] = Field(default=None, primary_key=True)
    template_id: int = Field(foreign_key="checklist_templates.id", index=True)
    position: int = 0
    text: str
    detail: str = ""
    kind: str = "note"  # note | wait | input | critical (only "note" used in Phase A)
    config: str = "{}"  # JSON blob for kind-specific config (Phase C)


class ChecklistRun(SQLModel, table=True):
    """One walk-through of a template. Records start/finish + per-step state, which
    is what makes a checklist more than a static note (history, "what's still off").

    `state` is a JSON blob (per-step done flags / captured values / notes), same
    rationale as DashboardLayout.widgets — it's read and written whole.
    """
    __tablename__ = "checklist_runs"
    id: Optional[int] = Field(default=None, primary_key=True)
    template_id: int = Field(foreign_key="checklist_templates.id", index=True)
    tank_id: int = Field(foreign_key="tanks.id", index=True)
    task_id: Optional[int] = Field(default=None, foreign_key="tasks.id")  # Phase B link
    started_at: datetime = Field(default_factory=utcnow)
    completed_at: Optional[datetime] = None
    status: str = "in_progress"  # in_progress | completed | abandoned
    state: str = "{}"
