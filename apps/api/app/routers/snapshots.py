from fastapi import APIRouter, Depends

from ..auth import get_current_uid
from ..firestore_client import get_db
from ..models import SnapshotIn

router = APIRouter(prefix="/snapshots", tags=["snapshots"])


@router.get("")
async def list_snapshots(uid: str = Depends(get_current_uid)):
    db = get_db()
    docs = db.collection("users", uid, "snapshots").order_by("period").stream()
    return [{"id": d.id, **d.to_dict()} for d in docs]


@router.put("/{period}")
async def upsert_snapshot(period: str, snapshot: SnapshotIn, uid: str = Depends(get_current_uid)):
    db = get_db()
    data = snapshot.model_dump()
    data["period"] = period
    db.collection("users", uid, "snapshots").document(period).set(data)
    return data


@router.delete("/{period}")
async def delete_snapshot(period: str, uid: str = Depends(get_current_uid)):
    db = get_db()
    db.collection("users", uid, "snapshots").document(period).delete()
    return {"deleted": period}
