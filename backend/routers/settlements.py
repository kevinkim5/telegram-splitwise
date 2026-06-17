from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.database import get_db
from backend.auth import verify_init_data

router = APIRouter(prefix="/api/groups", tags=["settlements"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SettlementIn(BaseModel):
    from_member_id: int
    to_member_id: int
    amount: float
    currency: str
    note: str | None = None


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

async def _get_group_id(db, chat_id: str) -> int:
    row = await db.execute("SELECT id FROM groups WHERE chat_id=?", (chat_id,))
    g = await row.fetchone()
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g["id"]


async def _format_settlement(db, row) -> dict:
    s = dict(row)

    # Fetch from_member info
    r = await db.execute(
        "SELECT id, first_name, last_name, username FROM members WHERE id=?",
        (s["from_member"],),
    )
    from_m = await r.fetchone()
    s["from_member"] = dict(from_m) if from_m else {"id": s["from_member"]}

    # Fetch to_member info
    r = await db.execute(
        "SELECT id, first_name, last_name, username FROM members WHERE id=?",
        (s["to_member"],),
    )
    to_m = await r.fetchone()
    s["to_member"] = dict(to_m) if to_m else {"id": s["to_member"]}

    return s


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{chat_id}/settlements")
async def list_settlements(chat_id: str, user: dict = Depends(verify_init_data)):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)

        rows = await db.execute(
            """SELECT * FROM settlements
               WHERE group_id=? AND deleted_at IS NULL
               ORDER BY settled_at DESC""",
            (group_id,),
        )
        settlement_rows = await rows.fetchall()

        result = []
        for row in settlement_rows:
            result.append(await _format_settlement(db, row))
        return result


@router.post("/{chat_id}/settlements", status_code=201)
async def create_settlement(
    chat_id: str,
    body: SettlementIn,
    user: dict = Depends(verify_init_data),
):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)

        if body.amount <= 0:
            raise HTTPException(status_code=422, detail="amount must be positive")

        if body.from_member_id == body.to_member_id:
            raise HTTPException(status_code=422, detail="from_member and to_member must differ")

        # Validate both members belong to this group
        for mid in (body.from_member_id, body.to_member_id):
            row = await db.execute(
                "SELECT id FROM members WHERE id=? AND group_id=?",
                (mid, group_id),
            )
            if not await row.fetchone():
                raise HTTPException(
                    status_code=422,
                    detail=f"member_id={mid} not in group",
                )

        cur = await db.execute(
            """INSERT INTO settlements (group_id, from_member, to_member, amount, currency, note)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (group_id, body.from_member_id, body.to_member_id,
             body.amount, body.currency, body.note),
        )
        settlement_id = cur.lastrowid
        await db.commit()

        row = await db.execute("SELECT * FROM settlements WHERE id=?", (settlement_id,))
        settlement_row = await row.fetchone()
        return await _format_settlement(db, settlement_row)


@router.delete("/{chat_id}/settlements/{settlement_id}", status_code=204)
async def delete_settlement(
    chat_id: str,
    settlement_id: int,
    user: dict = Depends(verify_init_data),
):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)

        row = await db.execute(
            "SELECT id FROM settlements WHERE id=? AND group_id=? AND deleted_at IS NULL",
            (settlement_id, group_id),
        )
        if not await row.fetchone():
            raise HTTPException(status_code=404, detail="Settlement not found")

        await db.execute(
            "UPDATE settlements SET deleted_at=strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE id=?",
            (settlement_id,),
        )
        await db.commit()
