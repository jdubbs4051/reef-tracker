"""Photo upload + records. Files are written to the data volume (DATA_DIR/photos);
the DB stores only the relative path (REEF_TRACKER_SPEC.md §4). Served read-only at
/photos via a static mount in main.py.
"""
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlmodel import Session

from ..database import DATA_DIR, get_session
from ..models import Photo, utcnow
from ..schemas import PhotoRead

router = APIRouter(prefix="/api/photos", tags=["photos"])

PHOTOS_DIR = DATA_DIR / "photos"
ALLOWED = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}
MAX_BYTES = 12 * 1024 * 1024  # 12 MB


def to_read(photo: Photo) -> PhotoRead:
    return PhotoRead(
        id=photo.id,
        tank_id=photo.tank_id,
        file_path=photo.file_path,
        url=f"/{photo.file_path}",
        caption=photo.caption,
        linked_type=photo.linked_type,
        linked_id=photo.linked_id,
    )


@router.post("", response_model=PhotoRead, status_code=201)
async def upload_photo(
    file: UploadFile = File(...),
    tank_id: int = Form(...),
    linked_type: str = Form(""),
    linked_id: Optional[int] = Form(None),
    caption: str = Form(""),
    session: Session = Depends(get_session),
):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext or 'unknown'}")
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 12 MB)")

    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4().hex}{ext}"
    (PHOTOS_DIR / name).write_bytes(content)

    photo = Photo(
        tank_id=tank_id,
        file_path=f"photos/{name}",
        caption=caption,
        taken_at=utcnow(),
        linked_type=linked_type,
        linked_id=linked_id,
    )
    session.add(photo)
    session.commit()
    session.refresh(photo)
    return to_read(photo)


@router.delete("/{photo_id}", status_code=204)
def delete_photo(photo_id: int, session: Session = Depends(get_session)):
    photo = session.get(Photo, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")
    # Best-effort file cleanup; the DB row is the source of truth.
    try:
        (DATA_DIR / photo.file_path).unlink(missing_ok=True)
    except OSError:
        pass
    session.delete(photo)
    session.commit()
