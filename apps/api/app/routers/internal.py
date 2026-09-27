"""Endpoints called by Cloud infrastructure rather than the frontend.

/internal/monthly-check is hit by Cloud Scheduler once a month (see
infra/terraform/scheduler.tf). Cloud Run stays publicly reachable
(Firebase-authenticated user routes handle their own auth), so this
route verifies the caller itself: Cloud Scheduler attaches a
Google-signed OIDC token for a dedicated service account, and we check
that token's audience and signer here rather than trusting the network
path."""
import os

from fastapi import APIRouter, Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from ..firestore_client import get_db
from .alerts import recompute_for_user

router = APIRouter(prefix="/internal", tags=["internal"])

_google_request = google_requests.Request()


def _verify_scheduler_token(authorization: str) -> None:
    expected_sa = os.environ.get("SCHEDULER_SERVICE_ACCOUNT_EMAIL")
    # A fixed, arbitrary string agreed between this service and the
    # Cloud Scheduler job's oidc_token.audience (infra/terraform/scheduler.tf)
    # — not the service's real URL, so the two never have a circular
    # dependency on each other at apply time.
    expected_audience = os.environ.get("INTERNAL_JOB_AUDIENCE")
    if not expected_sa or not expected_audience:
        raise HTTPException(500, "SCHEDULER_SERVICE_ACCOUNT_EMAIL / INTERNAL_JOB_AUDIENCE not configured")
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        claims = id_token.verify_oauth2_token(token, _google_request, audience=expected_audience)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(401, f"invalid scheduler token: {exc}") from exc
    if claims.get("email") != expected_sa or not claims.get("email_verified", True):
        raise HTTPException(403, "token not issued for the expected scheduler service account")


def _all_uids() -> set[str]:
    db = get_db()
    uids = set()
    for doc in db.collection_group("goals").stream():
        # path is users/{uid}/goals/{goalId}
        uids.add(doc.reference.parent.parent.id)
    for doc in db.collection_group("snapshots").stream():
        uids.add(doc.reference.parent.parent.id)
    return uids


def _notify(uid: str, alerts: list[dict]) -> None:
    """Placeholder notification channel. Wire this to email (SendGrid /
    Gmail API) or push once a provider is chosen — for now it logs, so
    the monthly job is safe to deploy before that decision is made."""
    if alerts:
        print(f"[monthly-check] uid={uid} has {len(alerts)} active alert(s): "
              + "; ".join(a["message"] for a in alerts))
    else:
        print(f"[monthly-check] uid={uid} is on track, no alerts")


@router.post("/monthly-check")
async def monthly_check(authorization: str = Header(default="")):
    _verify_scheduler_token(authorization)
    summary = {}
    for uid in _all_uids():
        alerts = recompute_for_user(uid)
        _notify(uid, alerts)
        summary[uid] = len(alerts)
    return {"usersChecked": len(summary), "alertCounts": summary}
