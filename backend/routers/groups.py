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
        group = await db.fetchrow(
            """INSERT INTO groups (chat_id, title) VALUES ($1, $2)
               ON CONFLICT(chat_id) DO UPDATE SET title=EXCLUDED.title
               RETURNING id, chat_id, title, created_at""",
            body.chat_id, body.title
        )

        member = await db.fetchrow(
            """INSERT INTO members (group_id, telegram_user_id, first_name, last_name, username)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT(group_id, telegram_user_id) DO UPDATE SET
                 first_name=EXCLUDED.first_name,
                 last_name=EXCLUDED.last_name,
                 username=EXCLUDED.username
               RETURNING id, group_id, telegram_user_id, first_name, last_name, username""",
            group["id"], str(user["id"]), user.get("first_name", ""),
            user.get("last_name"), user.get("username")
        )

        return {"group": dict(group), "member": dict(member)}


@router.get("/{chat_id}/members")
async def list_members(chat_id: str, user: dict = Depends(verify_init_data)):
    async with get_db() as db:
        g = await db.fetchrow("SELECT id FROM groups WHERE chat_id=$1", chat_id)
        if not g:
            raise HTTPException(status_code=404, detail="Group not found")
        rows = await db.fetch(
            "SELECT id, telegram_user_id, first_name, last_name, username FROM members WHERE group_id=$1 ORDER BY first_name",
            g["id"]
        )
        return [dict(r) for r in rows]
