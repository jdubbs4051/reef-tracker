from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import Journal, utcnow
from ..schemas import JournalCreate, JournalUpdate

router = APIRouter(prefix="/api/journal", tags=["journal"])


@router.get("", response_model=list[Journal])
def list_journal(tank_id: int, session: Session = Depends(get_session)):
    return session.exec(
        select(Journal).where(Journal.tank_id == tank_id).order_by(Journal.entry_at.desc())
    ).all()


@router.post("", response_model=Journal, status_code=201)
def create_entry(body: JournalCreate, session: Session = Depends(get_session)):
    entry = Journal(
        tank_id=body.tank_id,
        title=body.title,
        body=body.body,
        entry_at=body.entry_at or utcnow(),
    )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.patch("/{entry_id}", response_model=Journal)
def update_entry(entry_id: int, body: JournalUpdate, session: Session = Depends(get_session)):
    entry = session.get(Journal, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def delete_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(Journal, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    session.delete(entry)
    session.commit()
