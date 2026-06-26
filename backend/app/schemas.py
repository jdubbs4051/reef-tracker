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


class ReadingDelete(BaseModel):
    """Delete one or more readings by id (e.g. a whole day's row from the table)."""
    tank_id: int
    ids: List[int]


class ReadingUpdate(BaseModel):
    """Edit a single previously-logged reading (correct a bad/old value)."""
    value: Optional[float] = None
    note: Optional[str] = None


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
    checklist_template_id: Optional[int] = None  # optional linked procedure (Phase B)


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    recurrence_rule: Optional[str] = None
    notify_channels: Optional[str] = None
    next_due_at: Optional[datetime] = None
    active: Optional[bool] = None
    # Send an id to link; send null to clear it (omit to leave unchanged).
    checklist_template_id: Optional[int] = None


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


# Red Sea ReefBeat device integrations (EQUIPMENT_INTEGRATION_PLAN §4.1). A null/""
# integration means static equipment (no live polling) — today's behavior.
# (mirror on the frontend in api.js)
EQUIPMENT_INTEGRATIONS = [
    "reefbeat_led",
    "reefbeat_ato",
    "reefbeat_wave",
    "reefbeat_dose",
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
    host: Optional[str] = None
    integration: Optional[str] = None
    viz_enabled: bool = True


class EquipmentUpdate(BaseModel):
    type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    nickname: Optional[str] = None
    installed_at: Optional[datetime] = None
    notes: Optional[str] = None
    active: Optional[bool] = None
    host: Optional[str] = None
    integration: Optional[str] = None
    viz_enabled: Optional[bool] = None


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
    host: Optional[str] = None
    integration: Optional[str] = None
    viz_enabled: bool = True
    last_seen: Optional[datetime] = None


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
    "checklists",       # quick-launch templates + resume in-progress runs (Phase B)
    "equipment-status", # compact ReefBeat device strip (EQUIPMENT_INTEGRATION_PLAN §4.7B)
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


# ---- Checklists (Phase A) ----
# Step kinds. Phase A ships "note" only; wait/input/critical land in Phase C.
# (mirror on the frontend in api.js)
CHECKLIST_STEP_KINDS = ["note", "wait", "input", "critical"]


class ChecklistStepIn(BaseModel):
    """One step as sent by the editor. `position` is ignored on input — the server
    rewrites it from the array index so reordering is just sending a new order."""
    text: str
    detail: str = ""
    kind: str = "note"
    config: Dict[str, Any] = Field(default_factory=dict)


class ChecklistStepRead(BaseModel):
    id: int
    position: int
    text: str
    detail: str
    kind: str
    config: Dict[str, Any]


class ChecklistTemplateCreate(BaseModel):
    tank_id: int
    name: str
    category: str = ""
    description: str = ""
    steps: List[ChecklistStepIn] = Field(default_factory=list)


class ChecklistTemplateUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    # When provided, replaces the whole step list (positions rewritten from index).
    steps: Optional[List[ChecklistStepIn]] = None


class ChecklistTemplateRead(BaseModel):
    id: int
    tank_id: int
    name: str
    category: str
    description: str
    active: bool
    steps: List[ChecklistStepRead]


class ChecklistRunRead(BaseModel):
    id: int
    template_id: int
    tank_id: int
    task_id: Optional[int]
    started_at: datetime
    completed_at: Optional[datetime]
    status: str
    state: Dict[str, Any]
    # Echo the template name + steps so the run view has everything in one call.
    template_name: str
    steps: List[ChecklistStepRead]


class RunStateUpdate(BaseModel):
    """Whole-blob update of a run's state (per-step done flags / values / notes)."""
    state: Dict[str, Any]


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
