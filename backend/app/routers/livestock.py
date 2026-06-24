from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import DATA_DIR, get_session
from ..livestock_advice import advise
from ..models import Livestock, Photo, Tank, utcnow
from ..schemas import AdviceItem, LivestockCreate, LivestockRead, LivestockUpdate

router = APIRouter(prefix="/api/livestock", tags=["livestock"])


def _photo_url_for(session: Session, livestock_id: int) -> Optional[str]:
    photo = session.exec(
        select(Photo)
        .where(Photo.linked_type == "livestock")
        .where(Photo.linked_id == livestock_id)
        .order_by(Photo.id.desc())
    ).first()
    return f"/{photo.file_path}" if photo else None


def _to_read(session: Session, ls: Livestock) -> LivestockRead:
    return LivestockRead(
        id=ls.id,
        tank_id=ls.tank_id,
        common_name=ls.common_name,
        scientific_name=ls.scientific_name,
        type=ls.type,
        date_added=ls.date_added,
        source=ls.source,
        status=ls.status,
        notes=ls.notes,
        photo_url=_photo_url_for(session, ls.id),
    )


@router.get("", response_model=list[LivestockRead])
def list_livestock(
    tank_id: int,
    type: Optional[str] = None,
    status: Optional[str] = None,
    session: Session = Depends(get_session),
):
    stmt = select(Livestock).where(Livestock.tank_id == tank_id)
    if type:
        stmt = stmt.where(Livestock.type == type)
    if status:
        stmt = stmt.where(Livestock.status == status)
    stmt = stmt.order_by(Livestock.date_added.desc(), Livestock.id.desc())
    return [_to_read(session, ls) for ls in session.exec(stmt).all()]


@router.get("/advice", response_model=list[AdviceItem])
def stocking_advice(
    tank_id: int,
    type: str = "fish",
    common_name: str = "",
    session: Session = Depends(get_session),
):
    tank = session.get(Tank, tank_id)
    if not tank:
        raise HTTPException(status_code=404, detail="Tank not found")
    alive = session.exec(
        select(Livestock).where(Livestock.tank_id == tank_id).where(Livestock.status == "alive")
    ).all()
    return [AdviceItem(**a) for a in advise(tank.volume_gal, alive, type, common_name)]


@router.post("", response_model=LivestockRead, status_code=201)
def create_livestock(body: LivestockCreate, session: Session = Depends(get_session)):
    data = body.model_dump()
    if data.get("date_added") is None:
        data["date_added"] = utcnow()
    ls = Livestock(**data)
    session.add(ls)
    session.commit()
    session.refresh(ls)
    return _to_read(session, ls)


@router.patch("/{livestock_id}", response_model=LivestockRead)
def update_livestock(livestock_id: int, body: LivestockUpdate, session: Session = Depends(get_session)):
    ls = session.get(Livestock, livestock_id)
    if not ls:
        raise HTTPException(status_code=404, detail="Livestock not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(ls, key, value)
    session.add(ls)
    session.commit()
    session.refresh(ls)
    return _to_read(session, ls)


@router.delete("/{livestock_id}", status_code=204)
def delete_livestock(livestock_id: int, session: Session = Depends(get_session)):
    ls = session.get(Livestock, livestock_id)
    if not ls:
        raise HTTPException(status_code=404, detail="Livestock not found")
    # Remove linked photo files + rows, then the record.
    photos = session.exec(
        select(Photo).where(Photo.linked_type == "livestock").where(Photo.linked_id == livestock_id)
    ).all()
    for p in photos:
        try:
            (DATA_DIR / p.file_path).unlink(missing_ok=True)
        except OSError:
            pass
        session.delete(p)
    session.delete(ls)
    session.commit()
