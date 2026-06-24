"""Reef Tracker API.

Single FastAPI service: serves the JSON API under /api and (in the packaged
Docker image) the built React SPA as static files. See REEF_TRACKER_SPEC.md §2.
"""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .database import DATA_DIR, create_db_and_tables, engine
from .notifications import (
    calendar_url,
    email_configured,
    ntfy_configured,
    ntfy_server,
    ntfy_topic,
    send_ntfy,
    set_setting,
)
from .routers import activity, calendar, dashboard, equipment, journal, livestock, parameters, photos, readings, tanks, tasks
from .schemas import (
    NotificationSettings,
    NotificationSettingsUpdate,
    NotificationStatus,
    NotificationTestResult,
)
from .scheduler import start_scheduler, stop_scheduler
from .seed import seed_if_empty

# Surface our INFO logs (scheduler ticks, notification sends/skips) alongside uvicorn's.
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    with Session(engine) as session:
        seed_if_empty(session)
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Reef Tracker", version="0.1.0", lifespan=lifespan)

# Dev convenience: the Vite dev server (5173) calls the API directly. In the
# packaged image the SPA is same-origin so CORS is moot.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"http://(192\.168|10|172)\..*:5173",  # LAN phones
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tanks.router)
app.include_router(parameters.router)
app.include_router(readings.router)
app.include_router(tasks.router)
app.include_router(activity.router)
app.include_router(livestock.router)
app.include_router(equipment.router)
app.include_router(journal.router)
app.include_router(photos.router)
app.include_router(calendar.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/notifications/status", response_model=NotificationStatus)
def notifications_status():
    return NotificationStatus(
        email=email_configured(),
        ntfy=ntfy_configured(),
        calendar_url=calendar_url(),
    )


@app.get("/api/notifications/settings", response_model=NotificationSettings)
def get_notification_settings():
    return NotificationSettings(ntfy_topic=ntfy_topic(), ntfy_url=ntfy_server())


@app.put("/api/notifications/settings", response_model=NotificationSettings)
def update_notification_settings(body: NotificationSettingsUpdate):
    # Only the fields provided are touched; empty string clears the saved value
    # (config then falls back to the env var, if any).
    if body.ntfy_topic is not None:
        set_setting("ntfy_topic", body.ntfy_topic.strip())
    if body.ntfy_url is not None:
        set_setting("ntfy_url", body.ntfy_url.strip())
    if body.ntfy_token is not None:
        set_setting("ntfy_token", body.ntfy_token.strip())
    return NotificationSettings(ntfy_topic=ntfy_topic(), ntfy_url=ntfy_server())


@app.post("/api/notifications/test", response_model=NotificationTestResult)
def test_notification():
    if not ntfy_configured():
        return NotificationTestResult(ok=False, detail="No ntfy topic set — add one and save first.")
    try:
        send_ntfy("Reef Tracker", "Test notification 🐠 — your ntfy setup works!")
    except Exception as e:  # surface the failure to the UI instead of 500-ing
        return NotificationTestResult(ok=False, detail=f"Send failed: {e}")
    return NotificationTestResult(ok=True, detail="Sent — check your phone.")


# Uploaded photos live on the data volume; served read-only.
_photos = DATA_DIR / "photos"
_photos.mkdir(parents=True, exist_ok=True)
app.mount("/photos", StaticFiles(directory=_photos), name="photos")

# Serve the built SPA when present (Docker). Mounted last so /api wins.
_static = os.environ.get("REEF_STATIC_DIR", "")
if _static and Path(_static).is_dir():
    app.mount("/", StaticFiles(directory=_static, html=True), name="spa")
