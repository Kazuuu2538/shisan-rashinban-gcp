import uuid
from typing import Union

from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_uid
from ..firestore_client import get_db
from ..models import PortfolioGoalIn, SavingsGoalIn

router = APIRouter(prefix="/goals", tags=["goals"])


@router.get("")
async def list_goals(uid: str = Depends(get_current_uid)):
    db = get_db()
    docs = db.collection("users", uid, "goals").stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]


@router.post("")
async def create_goal(goal: Union[SavingsGoalIn, PortfolioGoalIn], uid: str = Depends(get_current_uid)):
    db = get_db()
    if isinstance(goal, PortfolioGoalIn):
        total = sum(getattr(goal.targetAllocation, k) for k in
                    ["cash", "domesticStock", "foreignStock", "bonds", "other"])
        if round(total) != 100:
            raise HTTPException(400, f"目標配分の合計が100%になっていません（現在 {total}%）")
    goal_id = uuid.uuid4().hex
    db.collection("users", uid, "goals").document(goal_id).set(goal.model_dump())
    return {"id": goal_id, **goal.model_dump()}


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, uid: str = Depends(get_current_uid)):
    db = get_db()
    db.collection("users", uid, "goals").document(goal_id).delete()
    db.collection("users", uid, "alerts").document(goal_id).delete()
    return {"deleted": goal_id}
