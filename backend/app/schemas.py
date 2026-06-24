"""Request/response schemas for the Phase 1 API (tanks, parameters, readings).

Kept separate from the SQLModel tables so the wire format is explicit and the
input models can omit server-managed fields (ids, timestamps).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---- Parameters ----
class ParameterCreate(BaseModel):
    tank_id: int
    name: str
    unit: str = ""
    target_min: Optional[float] = None
    target_max: Optional[float] = None
    display_order: int = 0
    active: bool = True


class ParameterUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    target_min: Optional[float] = None
    target_max: Optional[float] = None
    display_order: Optional[int] = None
    active: Optional[bool] = None


# ---- Readings ----
class ReadingEntry(BaseModel):
    parameter_id: int
    value: float
    note: str = ""


class ReadingBatchCreate(BaseModel):
    """A dated log entry covering one or more parameters at once."""
    tank_id: int
    measured_at: Optional[datetime] = None  # defaults to now (UTC) server-side
    entries: List[ReadingEntry]


class LatestReading(BaseModel):
    parameter_id: int
    value: float
    measured_at: datetime
    note: str = ""


# ---- Charts ----
class SeriesPoint(BaseModel):
    measured_at: datetime
    value: float


class ParameterSeries(BaseModel):
    parameter_id: int
    name: str
    unit: str
    target_min: Optional[float]
    target_max: Optional[float]
    points: List[SeriesPoint]
    trend_per_week: Optional[float]  # least-squares slope, units/week
    trend_label: str  # human summary, e.g. "Steady · -0.1/wk"


# ---- Tasks (Phase 2) ----
class TaskCreate(BaseModel):
    tank_id: int
    name: str
    category: str = ""
    recurrence_rule: str = "weekly"
    notify_channels: str = "email,ntfy"
    next_due_at: Optional[datetime] = None  # defaults to now + one cadence


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    recurrence_rule: Optional[str] = None
    notify_channels: Optional[str] = None
    next_due_at: Optional[datetime] = None
    active: Optional[bool] = None


class TaskComplete(BaseModel):
    completed_at: Optional[datetime] = None  # defaults to now
    note: str = ""


class NotificationStatus(BaseModel):
    email: bool
    ntfy: bool
    calendar_url: str


class NotificationSettings(BaseModel):
    """Editable ntfy config returned to the Settings page."""
    ntfy_topic: str = ""
    ntfy_url: str = ""


class NotificationSettingsUpdate(BaseModel):
    ntfy_topic: Optional[str] = None
    ntfy_url: Optional[str] = None
    ntfy_token: Optional[str] = None  # optional; only for private/self-hosted servers


class NotificationTestResult(BaseModel):
    ok: bool
    detail: str = ""


# ---- Activity feed (dashboard) ----
class ActivityItem(BaseModel):
    type: str  # "reading" | "task" | "journal" | "livestock"
    title: str
    at: datetime
    color: str  # token name: teal/blue/amber


# ---- Photos (Phase 3) ----
class PhotoRead(BaseModel):
    id: int
    tank_id: int
    file_path: str
    url: str
    caption: str
    linked_type: str
    linked_id: Optional[int]


# ---- Livestock (Phase 3) ----
class LivestockCreate(BaseModel):
    tank_id: int
    common_name: str
    scientific_name: str = ""
    type: str = "fish"  # fish/coral/invert/cuc
    date_added: Optional[datetime] = None
    source: str = ""
    status: str = "alive"  # alive/lost/removed
    notes: str = ""


class LivestockUpdate(BaseModel):
    common_name: Optional[str] = None
    scientific_name: Optional[str] = None
    type: Optional[str] = None
    date_added: Optional[datetime] = None
    source: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class LivestockRead(BaseModel):
    id: int
    tank_id: int
    common_name: str
    scientific_name: str
    type: str
    date_added: Optional[datetime]
    source: str
    status: str
    notes: str
    photo_url: Optional[str] = None


class AdviceItem(BaseModel):
    level: str  # "info" | "caution" | "warn"
    text: str


# ---- Equipment (Phase 4) ----
# Reef-appropriate type list (CHANGE_REQUESTS.md #5). Brand/model stay free text
# for now; a structured brand/model catalog is a later refinement.
EQUIPMENT_TYPES = [
    "Lighting",
    "Return pump",
    "Powerhead / wavemaker",
    "Protein skimmer",
    "Heater",
    "ATO",
    "Doser",
    "Filtration / media reactor",
    "Controller",
    "UV sterilizer",
    "Chiller / fan",
    "RODI system",
    "Other",
]


class EquipmentCreate(BaseModel):
    tank_id: int
    type: str = "Other"
    brand: str = ""
    model: str = ""
    nickname: str = ""
    installed_at: Optional[datetime] = None
    notes: str = ""
    active: bool = True


class EquipmentUpdate(BaseModel):
    type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    nickname: Optional[str] = None
    installed_at: Optional[datetime] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class EquipmentRead(BaseModel):
    id: int
    tank_id: int
    type: str
    brand: str
    model: str
    nickname: str
    installed_at: Optional[datetime]
    notes: str
    active: bool
    photo_url: Optional[str] = None


# ---- Dashboard widgets (Phase 4.4) ----
# Known widget types. The top-3 KPI row (Tank status, Due today, Last logged) is
# fixed and lives outside this list — only the customizable area is persisted.
WIDGET_TYPES = [
    "latest-readings",
    "chart",          # options: { "parameter_id": int }
    "whats-due",
    "calendar",       # task due-date calendar (CHANGE_REQUESTS.md #4)
    "insight",
    "activity",
]


class WidgetConfig(BaseModel):
    id: str            # client-stable id so the same type can appear more than once
    type: str
    options: Dict[str, Any] = Field(default_factory=dict)


class DashboardLayoutRead(BaseModel):
    tank_id: int
    widgets: List[WidgetConfig]


class DashboardLayoutUpdate(BaseModel):
    widgets: List[WidgetConfig]


# ---- Journal (Phase 3) ----
class JournalCreate(BaseModel):
    tank_id: int
    title: str
    body: str = ""
    entry_at: Optional[datetime] = None


class JournalUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    entry_at: Optional[datetime] = None
