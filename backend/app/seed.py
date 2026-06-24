"""Seed data — runs once on an empty DB.

Values mirror REEF_TRACKER_SPEC.md §5/§6 and the dashboard mockup. Sample readings
(8 weekly points per parameter) are seeded so charts and "latest readings" have
something to show on first launch.
"""
from datetime import timedelta

from sqlmodel import Session, select

from .models import Journal, Livestock, Parameter, Reading, Tank, Task, utcnow
from .recurrence import next_due

# (name, unit, target_min, target_max)  — display_order is the list index
SEED_PARAMETERS = [
    ("Temperature", "°F", 77.0, 78.0),
    ("Salinity", "SG", 1.025, 1.026),
    ("pH", "", 7.9, 8.4),
    ("Ammonia", "ppm", 0.0, 0.0),
    ("Nitrite", "ppm", 0.0, 0.0),
    ("Nitrate", "ppm", 5.0, 10.0),
    ("Phosphate", "ppm", 0.03, 0.10),
    ("Alkalinity", "dKH", 8.0, 9.0),
    ("Calcium", "ppm", 420.0, 440.0),
    ("Magnesium", "ppm", 1300.0, 1350.0),
]

# (name, category, recurrence_rule, due_in_days) — due offset from "now" at seed time.
# due_in_days=None marks a task already completed this cycle (not currently due).
SEED_TASKS = [
    ("Water change (~3 gal)", "water", "weekly", 0),
    ("Test Alk/Cal/Mag", "testing", "weekly", 0),
    ("Test Nitrate/Phosphate", "testing", "weekly", 3),
    ("Check/refill ATO reservoir", "water", "weekly", 1),
    ("Inspect ReefMat advance", "filtration", "weekly", 2),
    ("Clean skimmer cup", "filtration", "weekly", 1),
    ("Replace carbon", "media", "monthly", 9),
    ("Calibrate refractometer", "testing", "monthly", None),
    ("Glass/pump cleaning", "maintenance", "biweekly", 5),
]

# 8 weekly sample points per parameter (oldest -> newest), newest matches the mockup.
SAMPLE_SERIES = {
    "Temperature": [77.8, 77.5, 77.7, 77.4, 77.6, 77.5, 77.7, 77.6],
    "Salinity": [1.026, 1.025, 1.025, 1.026, 1.025, 1.025, 1.025, 1.025],
    "pH": [8.0, 8.1, 8.0, 8.2, 8.1, 8.0, 8.1, 8.1],
    "Ammonia": [0, 0, 0, 0, 0, 0, 0, 0],
    "Nitrite": [0, 0, 0, 0, 0, 0, 0, 0],
    "Nitrate": [6, 7, 8, 9, 9, 10, 11, 12],
    "Phosphate": [0.04, 0.05, 0.05, 0.06, 0.05, 0.05, 0.04, 0.05],
    "Alkalinity": [8.5, 8.4, 8.2, 8.7, 8.3, 8.4, 8.3, 8.4],
    "Calcium": [430, 428, 425, 422, 420, 419, 418, 418],
    "Magnesium": [1340, 1335, 1330, 1325, 1320, 1320, 1318, 1320],
}


def seed_if_empty(session: Session) -> None:
    existing = session.exec(select(Tank)).first()
    if existing:
        return

    tank = Tank(
        name="Red Sea MAX NANO G2 XL",
        volume_gal=29.0,
        notes="33 gal system — 29 gal display + ~4 gal AIO sump",
        active=True,
    )
    session.add(tank)
    session.commit()
    session.refresh(tank)

    params: dict[str, Parameter] = {}
    for order, (name, unit, tmin, tmax) in enumerate(SEED_PARAMETERS):
        p = Parameter(
            tank_id=tank.id,
            name=name,
            unit=unit,
            target_min=tmin,
            target_max=tmax,
            display_order=order,
            active=True,
        )
        session.add(p)
        params[name] = p
    session.commit()
    for p in params.values():
        session.refresh(p)

    now = utcnow()
    for name, cat, rule, due_in in SEED_TASKS:
        if due_in is None:
            # Completed this cycle: backdate last_done, next due one cadence out.
            done = now - timedelta(days=2)
            session.add(
                Task(
                    tank_id=tank.id, name=name, category=cat, recurrence_rule=rule,
                    notify_channels="email,ntfy",
                    last_done_at=done, next_due_at=next_due(done, rule),
                )
            )
        else:
            session.add(
                Task(
                    tank_id=tank.id, name=name, category=cat, recurrence_rule=rule,
                    notify_channels="email,ntfy",
                    next_due_at=now + timedelta(days=due_in),
                )
            )

    for name, series in SAMPLE_SERIES.items():
        param = params[name]
        n = len(series)
        for i, value in enumerate(series):
            measured = now - timedelta(weeks=(n - 1 - i))
            session.add(
                Reading(
                    tank_id=tank.id,
                    parameter_id=param.id,
                    value=float(value),
                    measured_at=measured,
                )
            )

    # (common_name, scientific_name, type, status, added_days_ago, notes)
    for common, sci, kind, status, ago, notes in [
        ("Clown Goby", "Gobiodon okinawae", "fish", "alive", 3, "Tiny yellow goby; perches in the hammer."),
        ("Ocellaris Clown", "Amphiprion ocellaris", "fish", "alive", 40, "Hosting the hammer instead of an anemone."),
        ("Hammer Coral", "Euphyllia ancora", "coral", "alive", 60, "Big polyp extension under blues."),
        ("Trochus Snail ×3", "Trochus sp.", "cuc", "alive", 70, "Workhorse algae grazers."),
    ]:
        session.add(
            Livestock(
                tank_id=tank.id, common_name=common, scientific_name=sci, type=kind,
                status=status, date_added=now - timedelta(days=ago), source="LFS", notes=notes,
            )
        )

    # (title, body, days_ago)
    for title, body, ago in [
        ("Added yellow clown goby", "Tiny, settled into the hammer within minutes. Eating frozen day one — good sign.", 3),
        ("Started running carbon", "Slight yellow tint to the water. One bag in the AIO, will pull in a month.", 9),
        ("Diatom bloom on sand", "Brown dusting — textbook for a young tank. Riding it out, no chemicals.", 15),
        ("First water change post-cycle", "", 24),
    ]:
        session.add(Journal(tank_id=tank.id, title=title, body=body, entry_at=now - timedelta(days=ago)))

    session.commit()
