import heapq

from fastapi import APIRouter, Depends, HTTPException

from backend.database import get_db
from backend.auth import verify_init_data

router = APIRouter(prefix="/api/groups", tags=["balances"])


# ---------------------------------------------------------------------------
# Debt simplification
# ---------------------------------------------------------------------------

def simplify_debts(net_map: dict[int, float]) -> list[dict]:
    """
    Given a mapping of member_id → net balance (positive = owed money,
    negative = owes money), produce a minimal list of transactions to settle.
    Uses a greedy max-creditor / max-debtor approach.
    """
    creditors: list[tuple[float, int]] = []  # max-heap (negated)
    debtors: list[tuple[float, int]] = []    # min-heap (already negative)

    for member_id, amount in net_map.items():
        if amount > 0.005:
            heapq.heappush(creditors, (-amount, member_id))
        elif amount < -0.005:
            heapq.heappush(debtors, (amount, member_id))  # amount is already negative

    transactions = []
    while creditors and debtors:
        neg_credit, creditor = heapq.heappop(creditors)
        debt, debtor = heapq.heappop(debtors)

        credit = -neg_credit
        debt_abs = -debt

        settled = round(min(credit, debt_abs), 2)
        transactions.append({
            "from_member_id": debtor,
            "to_member_id": creditor,
            "amount": settled,
        })

        rem_credit = round(credit - settled, 2)
        rem_debt = round(debt_abs - settled, 2)

        if rem_credit > 0.005:
            heapq.heappush(creditors, (-rem_credit, creditor))
        if rem_debt > 0.005:
            heapq.heappush(debtors, (-rem_debt, debtor))

    return transactions


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.get("/{chat_id}/balances")
async def get_balances(chat_id: str, user: dict = Depends(verify_init_data)):
    async with get_db() as db:
        # Resolve group
        g = await db.fetchrow("SELECT id FROM groups WHERE chat_id=$1", chat_id)
        if not g:
            raise HTTPException(status_code=404, detail="Group not found")
        group_id = g["id"]

        # Build member lookup: id → {first_name, last_name, username}
        member_rows = await db.fetch(
            "SELECT id, first_name, last_name, username FROM members WHERE group_id=$1",
            group_id,
        )
        member_info: dict[int, dict] = {
            r["id"]: dict(r) for r in member_rows
        }

        # Gather all distinct currencies from non-deleted expenses
        currencies_rows = await db.fetch(
            "SELECT DISTINCT currency FROM expenses WHERE group_id=$1 AND deleted_at IS NULL",
            group_id,
        )
        currencies = [r["currency"] for r in currencies_rows]

        # Also include currencies from non-deleted settlements
        settlement_currency_rows = await db.fetch(
            "SELECT DISTINCT currency FROM settlements WHERE group_id=$1 AND deleted_at IS NULL",
            group_id,
        )
        for r in settlement_currency_rows:
            if r["currency"] not in currencies:
                currencies.append(r["currency"])

        by_currency: dict[str, dict] = {}

        for currency in currencies:
            # net_balance[member_id] = amount they are owed (positive) or owe (negative)
            net_balance: dict[int, float] = {mid: 0.0 for mid in member_info}

            # --- Expense contributions ---
            # The payer is credited for each split (they paid on behalf of others).
            # Each split member is debited their share.
            split_rows = await db.fetch(
                """SELECT e.paid_by, es.member_id, es.amount
                   FROM expenses e
                   JOIN expense_splits es ON es.expense_id = e.id
                   WHERE e.group_id=$1 AND e.currency=$2 AND e.deleted_at IS NULL""",
                group_id, currency,
            )
            for r in split_rows:
                paid_by = r["paid_by"]
                member_id = r["member_id"]
                amount = r["amount"]

                if paid_by not in net_balance:
                    net_balance[paid_by] = 0.0
                if member_id not in net_balance:
                    net_balance[member_id] = 0.0

                # Payer is owed this split amount by the split member
                if paid_by != member_id:
                    net_balance[paid_by] += amount
                    net_balance[member_id] -= amount
                # If paid_by == member_id, no net effect for that person's own share

            # --- Settlement contributions ---
            # from_member paid to_member, reducing from_member's debt / to_member's credit
            settlement_rows = await db.fetch(
                """SELECT from_member, to_member, amount
                   FROM settlements
                   WHERE group_id=$1 AND currency=$2 AND deleted_at IS NULL""",
                group_id, currency,
            )
            for r in settlement_rows:
                from_member = r["from_member"]
                to_member = r["to_member"]
                amount = r["amount"]

                if from_member not in net_balance:
                    net_balance[from_member] = 0.0
                if to_member not in net_balance:
                    net_balance[to_member] = 0.0

                net_balance[from_member] += amount   # they settled their debt
                net_balance[to_member] -= amount     # they received payment

            # Build net list for response
            net_list = [
                {
                    "member_id": mid,
                    "first_name": member_info.get(mid, {}).get("first_name", ""),
                    "last_name": member_info.get(mid, {}).get("last_name"),
                    "username": member_info.get(mid, {}).get("username"),
                    "net_amount": round(bal, 2),
                }
                for mid, bal in net_balance.items()
            ]

            # Simplify debts
            raw_transactions = simplify_debts(net_balance)

            # Enrich transactions with member names
            enriched = []
            for t in raw_transactions:
                fm = member_info.get(t["from_member_id"], {})
                tm = member_info.get(t["to_member_id"], {})
                enriched.append({
                    "from_member_id": t["from_member_id"],
                    "from_first_name": fm.get("first_name", ""),
                    "from_last_name": fm.get("last_name"),
                    "from_username": fm.get("username"),
                    "to_member_id": t["to_member_id"],
                    "to_first_name": tm.get("first_name", ""),
                    "to_last_name": tm.get("last_name"),
                    "to_username": tm.get("username"),
                    "amount": t["amount"],
                    "currency": currency,
                })

            by_currency[currency] = {
                "net": net_list,
                "simplified_transactions": enriched,
            }

        return {"by_currency": by_currency}
