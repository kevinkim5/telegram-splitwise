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
    g = await db.fetchrow("SELECT id FROM groups WHERE chat_id=$1", chat_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g["id"]


async def _format_settlement(db, row) -> dict:
    s = dict(row)

    # Fetch from_member info
    from_m = await db.fetchrow(
        "SELECT id, first_name, last_name, username FROM members WHERE id=$1",
        s["from_member"],
    )
    s["from_member"] = dict(from_m) if from_m else {"id": s["from_member"]}

    # Fetch to_member info
    to_m = await db.fetchrow(
        "SELECT id, first_name, last_name, username FROM members WHERE id=$1",
        s["to_member"],
    )
    s["to_member"] = dict(to_m) if to_m else {"id": s["to_member"]}

    return s


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{chat_id}/settlements")
async def list_settlements(chat_id: str, user: dict = Depends(verify_init_data)):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)

        settlement_rows = await db.fetch(
            """SELECT * FROM settlements
               WHERE group_id=$1 AND deleted_at IS NULL
               ORDER BY settled_at DESC""",
            group_id,
        )

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
            member_check = await db.fetchrow(
                "SELECT id FROM members WHERE id=$1 AND group_id=$2",
                mid, group_id,
            )
            if not member_check:
                raise HTTPException(
                    status_code=422,
                    detail=f"member_id={mid} not in group",
                )

        settlement_id = await db.fetchval(
            """INSERT INTO settlements (group_id, from_member, to_member, amount, currency, note)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id""",
            group_id, body.from_member_id, body.to_member_id,
            body.amount, body.currency, body.note,
        )

        settlement_row = await db.fetchrow(
            "SELECT * FROM settlements WHERE id=$1", settlement_id
        )
        return await _format_settlement(db, settlement_row)


@router.delete("/{chat_id}/settlements/{settlement_id}", status_code=204)
async def delete_settlement(
    chat_id: str,
    settlement_id: int,
    user: dict = Depends(verify_init_data),
):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)

        existing = await db.fetchrow(
            "SELECT id FROM settlements WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL",
            settlement_id, group_id,
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Settlement not found")

        await db.execute(
            "UPDATE settlements SET deleted_at=NOW() WHERE id=$1",
            settlement_id,
        )
