import aiosqlite
import os
from contextlib import asynccontextmanager
from pathlib import Path

from backend.config import settings

SCHEMA_PATH = Path(__file__).parent / "db" / "schema.sql"


def _db_path() -> str:
    return settings.database_url


async def init_db():
    path = _db_path()
    db_dir = os.path.dirname(path)
    os.makedirs(db_dir if db_dir else ".", exist_ok=True)
    async with aiosqlite.connect(path) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("PRAGMA journal_mode = WAL")
        schema = SCHEMA_PATH.read_text()
        await db.executescript(schema)
        await db.commit()


@asynccontextmanager
async def get_db():
    async with aiosqlite.connect(_db_path()) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        yield db
