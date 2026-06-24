"""Notification channels — email (SMTP) and push (ntfy), configured by env vars.

No OAuth, no cloud SDKs (REEF_TRACKER_SPEC.md §3). A channel that isn't configured
is simply skipped and logged — the app fails loudly on send errors but never on a
missing-config no-op, so it runs fine on a fresh LAN install with nothing set up yet.
"""
from __future__ import annotations

import logging
import os
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from sqlmodel import Session

from .database import engine
from .models import Setting

log = logging.getLogger("reef.notifications")


def get_setting(key: str) -> str | None:
    """Return a saved (non-empty) setting value, or None if unset."""
    with Session(engine) as session:
        row = session.get(Setting, key)
    return row.value if row and row.value else None


def set_setting(key: str, value: str) -> None:
    with Session(engine) as session:
        row = session.get(Setting, key)
        if row:
            row.value = value
        else:
            row = Setting(key=key, value=value)
        session.add(row)
        session.commit()


def _cfg(db_key: str, env_key: str, default: str = "") -> str:
    """Resolve config: saved DB value first, then env var, then default."""
    saved = get_setting(db_key)
    if saved is not None:
        return saved
    return os.environ.get(env_key, default)


def ntfy_topic() -> str:
    return _cfg("ntfy_topic", "NTFY_TOPIC")


def ntfy_server() -> str:
    return (_cfg("ntfy_url", "NTFY_URL") or "https://ntfy.sh").rstrip("/")


def email_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_TO"))


def ntfy_configured() -> bool:
    return bool(ntfy_topic())


def calendar_url() -> str:
    base = os.environ.get("REEF_BASE_URL", "").rstrip("/")
    return f"{base}/calendar.ics" if base else "/calendar.ics"


def send_email(subject: str, body: str) -> bool:
    if not email_configured():
        log.info("email skipped (not configured): %s", subject)
        return False
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    sender = os.environ.get("SMTP_FROM", user or "reef-tracker@localhost")
    recipients = os.environ["SMTP_TO"]

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = recipients
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=15) as server:
        if os.environ.get("SMTP_TLS", "true").lower() != "false":
            server.starttls()
        if user:
            server.login(user, password)
        server.send_message(msg)
    log.info("email sent: %s", subject)
    return True


def send_ntfy(title: str, message: str) -> bool:
    topic = ntfy_topic()
    if not topic:
        log.info("ntfy skipped (not configured): %s", title)
        return False
    base = ntfy_server()
    headers = {"Title": title, "Tags": "ocean"}
    token = _cfg("ntfy_token", "NTFY_TOKEN")
    if token:  # for reserved/private or self-hosted servers with access control
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{base}/{topic}",
        data=message.encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except urllib.error.URLError as e:
        log.error("ntfy send failed: %s", e)
        raise
    log.info("ntfy sent: %s", title)
    return True


def notify_task_due(task_name: str, channels: str) -> None:
    """Send a due-task reminder to the task's enabled, configured channels."""
    wanted = {c.strip() for c in (channels or "").split(",") if c.strip()}
    subject = f"Reef Tracker — due: {task_name}"
    body = f"{task_name} is due. Open Reef Tracker to mark it done."
    if "email" in wanted:
        send_email(subject, body)
    if "ntfy" in wanted:
        send_ntfy("Reef Tracker", f"Due: {task_name}")
