from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from ..auth import get_current_uid
from ..evaluation import alert_message, evaluate_goal
from ..firestore_client import get_db

router = APIRouter(prefix="/alerts", tags=["alerts"])


def recompute_for_user(uid: str) -> list[dict]:
    """Re-evaluate every goal against the latest snapshot and keep the
    `alerts` collection in sync: an unresolved deviation gets a
    document, a resolved one has its document removed. Returns the
    current alert list. Shared by the on-demand endpoint below and by
    the Cloud Scheduler-triggered monthly check."""
    db = get_db()
    goals = [{"id": d.id, **d.to_dict()} for d in db.collection("users", uid, "goals").stream()]
    snapshots = [{"id": d.id, **d.to_dict()} for d in db.collection("users", uid, "snapshots").stream()]
    alerts_col = db.collection("users", uid, "alerts")

    now = datetime.now(timezone.utc).isoformat()
    current = []
    for goal in goals:
        result = evaluate_goal(goal, snapshots)
        status = result["status"]
        if status in ("warn", "critical"):
            alert = {
                "goalId": goal["id"],
                "goalTitle": goal["title"],
                "category": goal["category"],
                "status": status,
                "message": alert_message(goal, result),
                "updatedAt": now,
            }
            alerts_col.document(goal["id"]).set(alert)
            current.append(alert)
        else:
            alerts_col.document(goal["id"]).delete()
    return current


@router.get("")
async def list_alerts(uid: str = Depends(get_current_uid)):
    return recompute_for_user(uid)
