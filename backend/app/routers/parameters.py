from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..database import get_session
from ..models import Parameter
from ..schemas import ParameterCreate, ParameterUpdate

router = APIRouter(prefix="/api/parameters", tags=["parameters"])


@router.get("", response_model=list[Parameter])
def list_parameters(
    tank_id: int,
    include_inactive: bool = False,
    session: Session = Depends(get_session),
):
    stmt = select(Parameter).where(Parameter.tank_id == tank_id)
    if not include_inactive:
        stmt = stmt.where(Parameter.active == True)  # noqa: E712
    stmt = stmt.order_by(Parameter.display_order, Parameter.id)
    return session.exec(stmt).all()


@router.post("", response_model=Parameter, status_code=201)
def create_parameter(body: ParameterCreate, session: Session = Depends(get_session)):
    param = Parameter(**body.model_dump())
    session.add(param)
    session.commit()
    session.refresh(param)
    return param


@router.patch("/{parameter_id}", response_model=Parameter)
def update_parameter(
    parameter_id: int,
    body: ParameterUpdate,
    session: Session = Depends(get_session),
):
    param = session.get(Parameter, parameter_id)
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(param, key, value)
    session.add(param)
    session.commit()
    session.refresh(param)
    return param


@router.delete("/{parameter_id}", status_code=204)
def deactivate_parameter(parameter_id: int, session: Session = Depends(get_session)):
    """Soft-delete: keep history intact, just hide the parameter."""
    param = session.get(Parameter, parameter_id)
    if not param:
        raise HTTPException(status_code=404, detail="Parameter not found")
    param.active = False
    session.add(param)
    session.commit()
