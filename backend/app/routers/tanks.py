from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..database import get_session
from ..models import Tank

router = APIRouter(prefix="/api/tanks", tags=["tanks"])


@router.get("", response_model=list[Tank])
def list_tanks(session: Session = Depends(get_session)):
    return session.exec(select(Tank).where(Tank.active == True)).all()  # noqa: E712
