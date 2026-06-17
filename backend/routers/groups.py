from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.database import get_db
from backend.auth import verify_init_data

router = APIRouter(prefix="/api/groups", tags=["groups"])


class JoinRequest(BaseModel):
    chat_id: str
    title: str | None = None


@router.post("/join")
async def join_group(body: JoinRequest, user: dict = Depends(verify_init_data)):
    async with get_db() as db:
        # Upsert group
        await db.execute(
            "INSERT INTO groups (chat_id, title) VALUES (?, ?)"
            " ON CONFLICT(chat_id) DO UPDATE SET title=excluded.title",
            (body.chat_id, body.title),
        )

        row = await db.execute("SELECT * FROM groups WHERE chat_id=?", (body.chat_id,))
        group = dict(await row.fetchone())

        # Upsert member
        await db.execute(
            """INSERT INTO members (group_id, telegram_user_id, first_name, last_name, username)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(group_id, telegram_user_id) DO UPDATE SET
                 first_name=excluded.first_name,
                 last_name=excluded.last_name,
                 username=excluded.username""",
            (
                group["id"],
                str(user["id"]),
                user.get("first_name", ""),
                user.get("last_name"),
                user.get("username"),
            ),
        )
        await db.commit()

        row = await db.execute(
            "SELECT * FROM members WHERE group_id=? AND telegram_user_id=?",
            (group["id"], str(user["id"])),
        )
        member = dict(await row.fetchone())
        return {"group": group, "member": member}


@router.get("/{chat_id}/members")
async def list_members(chat_id: str, user: dict = Depends(verify_init_data)):
    async with get_db() as db:
        row = await db.execute("SELECT id FROM groups WHERE chat_id=?", (chat_id,))
        g = await row.fetchone()
        if not g:
            raise HTTPException(status_code=404, detail="Group not found")

        rows = await db.execute(
            "SELECT * FROM members WHERE group_id=? ORDER BY first_name",
            (g["id"],),
        )
        return [dict(r) for r in await rows.fetchall()]
