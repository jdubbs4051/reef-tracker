"""Database engine + session. SQLite single file, location set by REEF_DATA_DIR.

The data dir holds both the SQLite file and (later) uploaded photos, so the whole
app state is one directory — trivial to back up by copying the Docker volume.
"""
import os
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DATA_DIR = Path(os.environ.get("REEF_DATA_DIR", "./data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)
(DATA_DIR / "photos").mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "reef.db"
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
