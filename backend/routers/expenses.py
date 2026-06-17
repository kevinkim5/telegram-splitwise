from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.database import get_db
from backend.auth import verify_init_data

router = APIRouter(prefix="/api/groups", tags=["expenses"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SplitIn(BaseModel):
    member_id: int
    amount: float | None = None  # required for custom, ignored for equal


class ExpenseIn(BaseModel):
    description: str
    total_amount: float
    currency: str
    paid_by_member_id: int
    split_type: str  # 'equal' or 'custom'
    splits: list[SplitIn]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_group_id(db, chat_id: str) -> int:
    g = await db.fetchrow("SELECT id FROM groups WHERE chat_id=$1", chat_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g["id"]


async def _format_expense(db, expense_row) -> dict:
    exp = dict(expense_row)

    # Fetch paid_by member
    paid_by_member = await db.fetchrow(
        "SELECT id, first_name, last_name, username FROM members WHERE id=$1",
        exp["paid_by"],
    )
    exp["paid_by"] = dict(paid_by_member) if paid_by_member else {"id": exp["paid_by"]}

    # Fetch splits with member info
    split_rows = await db.fetch(
        """SELECT es.member_id, es.amount, m.first_name, m.last_name, m.username
           FROM expense_splits es
           JOIN members m ON m.id = es.member_id
           WHERE es.expense_id=$1
           ORDER BY m.first_name""",
        exp["id"],
    )
    exp["splits"] = [dict(r) for r in split_rows]
    return exp


def _validate_splits(expense: ExpenseIn) -> list[tuple[int, float]]:
    """Return list of (member_id, amount) after validation/computation."""
    if not expense.splits:
        raise HTTPException(status_code=422, detail="splits must not be empty")

    if expense.split_type == "equal":
        per_share = round(expense.total_amount / len(expense.splits), 10)
        return [(s.member_id, per_share) for s in expense.splits]

    elif expense.split_type == "custom":
        for s in expense.splits:
            if s.amount is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"amount is required for custom split (member_id={s.member_id})",
                )
        total = sum(s.amount for s in expense.splits)
        if abs(total - expense.total_amount) > 0.01:
            raise HTTPException(
                status_code=422,
                detail=f"Sum of split amounts ({total}) does not match total_amount ({expense.total_amount})",
            )
        return [(s.member_id, s.amount) for s in expense.splits]

    else:
        raise HTTPException(status_code=422, detail="split_type must be 'equal' or 'custom'")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/{chat_id}/expenses")
async def list_expenses(
    chat_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(30, ge=1, le=100),
    user: dict = Depends(verify_init_data),
):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)
        offset = (page - 1) * limit

        total = await db.fetchval(
            "SELECT COUNT(*) FROM expenses WHERE group_id=$1 AND deleted_at IS NULL",
            group_id,
        )

        expense_rows = await db.fetch(
            """SELECT * FROM expenses
               WHERE group_id=$1 AND deleted_at IS NULL
               ORDER BY created_at DESC
               LIMIT $2 OFFSET $3""",
            group_id, limit, offset,
        )

        items = []
        for row in expense_rows:
            items.append(await _format_expense(db, row))
        return {"total": total, "page": page, "items": items}


@router.post("/{chat_id}/expenses", status_code=201)
async def create_expense(
    chat_id: str,
    body: ExpenseIn,
    user: dict = Depends(verify_init_data),
):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)

        # Validate paid_by member belongs to group
        paid_by_check = await db.fetchrow(
            "SELECT id FROM members WHERE id=$1 AND group_id=$2",
            body.paid_by_member_id, group_id,
        )
        if not paid_by_check:
            raise HTTPException(status_code=422, detail="paid_by_member_id not in group")

        splits = _validate_splits(body)

        # Validate all split members belong to group
        for member_id, _ in splits:
            member_check = await db.fetchrow(
                "SELECT id FROM members WHERE id=$1 AND group_id=$2",
                member_id, group_id,
            )
            if not member_check:
                raise HTTPException(
                    status_code=422,
                    detail=f"member_id={member_id} not in group",
                )

        # Insert expense, get id via RETURNING
        expense_id = await db.fetchval(
            """INSERT INTO expenses (group_id, description, total_amount, currency, paid_by, split_type)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id""",
            group_id, body.description, body.total_amount, body.currency,
            body.paid_by_member_id, body.split_type,
        )

        # Insert splits
        for member_id, amount in splits:
            await db.execute(
                "INSERT INTO expense_splits (expense_id, member_id, amount) VALUES ($1, $2, $3)",
                expense_id, member_id, amount,
            )

        expense_row = await db.fetchrow("SELECT * FROM expenses WHERE id=$1", expense_id)
        return await _format_expense(db, expense_row)


@router.get("/{chat_id}/expenses/{expense_id}")
async def get_expense(
    chat_id: str,
    expense_id: int,
    user: dict = Depends(verify_init_data),
):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)

        expense_row = await db.fetchrow(
            "SELECT * FROM expenses WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL",
            expense_id, group_id,
        )
        if not expense_row:
            raise HTTPException(status_code=404, detail="Expense not found")

        return await _format_expense(db, expense_row)


@router.put("/{chat_id}/expenses/{expense_id}")
async def update_expense(
    chat_id: str,
    expense_id: int,
    body: ExpenseIn,
    user: dict = Depends(verify_init_data),
):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)

        existing = await db.fetchrow(
            "SELECT id FROM expenses WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL",
            expense_id, group_id,
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Expense not found")

        # Validate paid_by member belongs to group
        paid_by_check = await db.fetchrow(
            "SELECT id FROM members WHERE id=$1 AND group_id=$2",
            body.paid_by_member_id, group_id,
        )
        if not paid_by_check:
            raise HTTPException(status_code=422, detail="paid_by_member_id not in group")

        splits = _validate_splits(body)

        # Validate all split members belong to group
        for member_id, _ in splits:
            member_check = await db.fetchrow(
                "SELECT id FROM members WHERE id=$1 AND group_id=$2",
                member_id, group_id,
            )
            if not member_check:
                raise HTTPException(
                    status_code=422,
                    detail=f"member_id={member_id} not in group",
                )

        # Update expense
        await db.execute(
            """UPDATE expenses
               SET description=$1, total_amount=$2, currency=$3, paid_by=$4, split_type=$5,
                   updated_at=NOW()
               WHERE id=$6""",
            body.description, body.total_amount, body.currency,
            body.paid_by_member_id, body.split_type, expense_id,
        )

        # Replace splits
        await db.execute("DELETE FROM expense_splits WHERE expense_id=$1", expense_id)
        for member_id, amount in splits:
            await db.execute(
                "INSERT INTO expense_splits (expense_id, member_id, amount) VALUES ($1, $2, $3)",
                expense_id, member_id, amount,
            )

        expense_row = await db.fetchrow("SELECT * FROM expenses WHERE id=$1", expense_id)
        return await _format_expense(db, expense_row)


@router.delete("/{chat_id}/expenses/{expense_id}", status_code=204)
async def delete_expense(
    chat_id: str,
    expense_id: int,
    user: dict = Depends(verify_init_data),
):
    async with get_db() as db:
        group_id = await _get_group_id(db, chat_id)

        existing = await db.fetchrow(
            "SELECT id FROM expenses WHERE id=$1 AND group_id=$2 AND deleted_at IS NULL",
            expense_id, group_id,
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Expense not found")

        await db.execute(
            "UPDATE expenses SET deleted_at=NOW() WHERE id=$1",
            expense_id,
        )
