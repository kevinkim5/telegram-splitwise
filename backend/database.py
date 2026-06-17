import asyncpg
from contextlib import asynccontextmanager
from pathlib import Path

from backend.config import settings

SCHEMA_PATH = Path(__file__).parent / "db" / "schema.sql"


async def init_db():
    conn = await asyncpg.connect(settings.db_url)
    try:
        schema = SCHEMA_PATH.read_text()
        await conn.execute(schema)
    finally:
        await conn.close()


@asynccontextmanager
async def get_db():
    conn = await asyncpg.connect(settings.db_url)
    try:
        yield conn
    finally:
        await conn.close()
