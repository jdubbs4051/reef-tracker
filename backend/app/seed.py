"""Seed data — runs once on an empty DB.

Values mirror REEF_TRACKER_SPEC.md §5/§6 and the dashboard mockup. Sample readings
(8 weekly points per parameter) are seeded so charts and "latest readings" have
something to show on first launch.
"""
import json
from datetime import timedelta

from sqlmodel import Session, select

from .models import (
    ChecklistStep,
    ChecklistTemplate,
    Journal,
    Livestock,
    Parameter,
    Reading,
    Tank,
    Task,
    utcnow,
)
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


# Starter procedures, in the LFS voice (uploads/CLAUDE.md §0). Each is
# (name, category, description, [step, ...]) where a step is (text, detail) for a
# plain note, or (text, detail, kind[, config]) for a smart step. `kind` is one of
# note | wait | input | critical (Phase C); config may reference a parameter by
# name (resolved to parameter_id at seed time).
SEED_CHECKLISTS = [
    (
        "Water Change (~3 gal)",
        "water",
        "Slow and steady. The water change itself is easy — the part people forget is turning the gear back ON at the end.",
        [
            ("New saltwater has mixed and matched", "Mixed at least 24h, heated to tank temp, salinity matched to the display. Don't rush this — mismatched water is the whole risk.", "wait", {"hours": 24}),
            ("Gather supplies", "Bucket, siphon/hose, towel, the pre-mixed saltwater. Lay a towel where you'll set anything wet."),
            ("Shut off the ATO", "So it doesn't try to top off while the level is down."),
            ("Shut off return pump + skimmer", "Skimmer will overflow on a changing water level if you leave it running."),
            ("Drain ~3 gallons", "Siphon from the display, working around the rockwork to lift detritus. Stop at your marked line."),
            ("Refill with the new saltwater", "Pour slowly against the glass or a rock so you don't blast the sand bed."),
            ("Turn the return pump back ON", "Check flow returns and the display level looks right.", "critical"),
            ("Turn the skimmer back ON", "Give it a few minutes — it'll foam over for a bit after a change, that's normal.", "critical"),
            ("Turn the ATO back ON", "The single most-forgotten step. Confirm it's armed before you walk away.", "critical"),
            ("Record post-change salinity", "Quick refractometer check once flow's back — logs straight to your readings.", "input", {"target": "reading", "parameter_name": "Salinity"}),
            ("Final once-over", "Temp, flow, everything running, no leaks. Wipe up and you're done."),
        ],
    ),
    (
        "Filter Sock / ReefMat Swap",
        "filtration",
        "Quick job, but a dirty sock is a nitrate factory — don't let it sit.",
        [
            ("Have the clean sock / fresh roll ready", "Rinsed and on hand before you pull the dirty one."),
            ("Lift out the dirty filter sock", "Expect a little spill — keep a towel under it."),
            ("Drop in the clean sock", "Seat it fully so water passes through, not around."),
            ("Confirm water is flowing through, not overflowing", "If it's bypassing, reseat it."),
            ("Rinse the dirty sock soon", "Cold water, no soap, ever. Or toss it in the wash bag."),
        ],
    ),
    (
        "Skimmer Cup Clean",
        "filtration",
        "A clean cup and neck = a skimmer that actually pulls gunk. Two-minute job.",
        [
            ("Lift off the collection cup", "Twist and pull — go slow so you don't slosh skimmate into the sump."),
            ("Empty and rinse the cup", "Tap water is fine here. A bottle brush gets the film off."),
            ("Wipe the neck/riser tube", "This is where buildup kills performance — a paper towel down the neck does wonders."),
            ("Reseat the cup", "Back on firmly so it doesn't pop loose."),
            ("Re-check the skimmer adjustment", "It'll need a minute to settle back into a steady foam."),
        ],
    ),
    (
        "Glass / Algae Clean",
        "maintenance",
        "Do it before a water change so you can siphon out what you knock loose.",
        [
            ("Scrape the glass", "Magnet cleaner or scraper. Keep the blade off the sand — a grain between blade and glass scratches."),
            ("Spot-clean rockwork if needed", "A toothbrush over stubborn algae, then let the flow carry it off."),
            ("Let detritus settle, then siphon", "Pairs perfectly with a water change — siphon the loosened gunk out."),
            ("Wipe the rim and lid", "Salt creep and dust off the edges keeps things tidy and bright."),
        ],
    ),
    (
        "New Coral Acclimation",
        "livestock",
        "Patience here pays off for years. Light and flow shock kill more new corals than anything in the bag.",
        [
            ("Float the bag to match temperature", "15–20 minutes, lights off or dimmed."),
            ("Drip or scoop acclimate to your water", "Especially for sensitive corals — match salinity slowly over ~30 min."),
            ("Dip for pests", "A coral dip catches hitchhikers before they reach your tank. Cheap insurance."),
            ("Place low and in modest flow first", "Let it adjust before moving it up into more light over the coming weeks."),
            ("Note it in the Journal", "Date, source, where you placed it — future-you will want the record."),
        ],
    ),
]


def seed_checklists_if_empty(session: Session) -> None:
    """Seed starter procedures for the existing tank — guarded like seed_if_empty."""
    if session.exec(select(ChecklistTemplate)).first():
        return
    tank = session.exec(select(Tank)).first()
    if not tank:
        return  # nothing to attach them to yet

    # For resolving input-step config that references a parameter by name.
    params_by_name = {
        p.name: p for p in session.exec(select(Parameter).where(Parameter.tank_id == tank.id)).all()
    }

    for name, category, description, steps in SEED_CHECKLISTS:
        t = ChecklistTemplate(tank_id=tank.id, name=name, category=category, description=description)
        session.add(t)
        session.commit()
        session.refresh(t)
        for i, step in enumerate(steps):
            text, detail = step[0], step[1]
            kind = step[2] if len(step) > 2 else "note"
            config = dict(step[3]) if len(step) > 3 else {}
            # Resolve a parameter reference to its id for this tank.
            pname = config.pop("parameter_name", None)
            if pname and pname in params_by_name:
                config["parameter_id"] = params_by_name[pname].id
            session.add(ChecklistStep(
                template_id=t.id, position=i, text=text, detail=detail,
                kind=kind, config=json.dumps(config),
            ))
    session.commit()


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
