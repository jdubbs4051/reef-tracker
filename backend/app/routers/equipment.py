from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import DATA_DIR, get_session
from ..models import Equipment, Photo
from ..schemas import EquipmentCreate, EquipmentRead, EquipmentUpdate

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


def _photo_url_for(session: Session, equipment_id: int) -> Optional[str]:
    photo = session.exec(
        select(Photo)
        .where(Photo.linked_type == "equipment")
        .where(Photo.linked_id == equipment_id)
        .order_by(Photo.id.desc())
    ).first()
    return f"/{photo.file_path}" if photo else None


def _to_read(session: Session, eq: Equipment) -> EquipmentRead:
    return EquipmentRead(
        id=eq.id,
        tank_id=eq.tank_id,
        type=eq.type,
        brand=eq.brand,
        model=eq.model,
        nickname=eq.nickname,
        installed_at=eq.installed_at,
        notes=eq.notes,
        active=eq.active,
        photo_url=_photo_url_for(session, eq.id),
    )


@router.get("", response_model=list[EquipmentRead])
def list_equipment(
    tank_id: int,
    type: Optional[str] = None,
    session: Session = Depends(get_session),
):
    stmt = select(Equipment).where(Equipment.tank_id == tank_id)
    if type:
        stmt = stmt.where(Equipment.type == type)
    stmt = stmt.order_by(Equipment.type, Equipment.id.desc())
    return [_to_read(session, eq) for eq in session.exec(stmt).all()]


@router.post("", response_model=EquipmentRead, status_code=201)
def create_equipment(body: EquipmentCreate, session: Session = Depends(get_session)):
    eq = Equipment(**body.model_dump())
    session.add(eq)
    session.commit()
    session.refresh(eq)
    return _to_read(session, eq)


@router.patch("/{equipment_id}", response_model=EquipmentRead)
def update_equipment(equipment_id: int, body: EquipmentUpdate, session: Session = Depends(get_session)):
    eq = session.get(Equipment, equipment_id)
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(eq, key, value)
    session.add(eq)
    session.commit()
    session.refresh(eq)
    return _to_read(session, eq)


@router.delete("/{equipment_id}", status_code=204)
def delete_equipment(equipment_id: int, session: Session = Depends(get_session)):
    eq = session.get(Equipment, equipment_id)
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")
    # Remove linked photo files + rows, then the record.
    photos = session.exec(
        select(Photo).where(Photo.linked_type == "equipment").where(Photo.linked_id == equipment_id)
    ).all()
    for p in photos:
        try:
            (DATA_DIR / p.file_path).unlink(missing_ok=True)
        except OSError:
            pass
        session.delete(p)
    session.delete(eq)
    session.commit()
