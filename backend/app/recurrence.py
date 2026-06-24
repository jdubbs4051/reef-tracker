"""Task recurrence — turn a human cadence string into the next due date.

Cadences are stored as plain strings (REEF_TRACKER_SPEC.md §6 uses "weekly",
"monthly", etc.) so they stay editable and readable. "as needed" / "" means the
task has no automatic schedule — it only becomes due when a human sets it.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta

# Canonical cadences offered in the UI.
CADENCES = ["daily", "weekly", "biweekly", "monthly", "as needed"]

_FIXED_DAYS = {"daily": 1, "weekly": 7, "biweekly": 14, "fortnightly": 14}


def normalize_rule(rule: Optional[str]) -> str:
    return (rule or "").strip().lower()


def is_scheduled(rule: Optional[str]) -> bool:
    """True if the cadence produces automatic due dates."""
    r = normalize_rule(rule)
    if r in ("", "as needed", "as-needed", "none"):
        return False
    return r in _FIXED_DAYS or r == "monthly" or bool(re.fullmatch(r"every\s+\d+\s+days?", r))


def next_due(from_dt: datetime, rule: Optional[str]) -> Optional[datetime]:
    """Next due datetime after `from_dt` for the given cadence, or None if unscheduled."""
    r = normalize_rule(rule)
    if not is_scheduled(r):
        return None
    if r == "monthly":
        return from_dt + relativedelta(months=1)
    if r in _FIXED_DAYS:
        return from_dt + timedelta(days=_FIXED_DAYS[r])
    m = re.fullmatch(r"every\s+(\d+)\s+days?", r)
    if m:
        return from_dt + timedelta(days=int(m.group(1)))
    return None  # unreachable given is_scheduled, but explicit
