"""Firebase ID token verification. The frontend sends
`Authorization: Bearer <firebase-id-token>` on every request; this
module resolves it to the caller's uid and rejects anything else."""
import firebase_admin
from firebase_admin import auth as firebase_auth
from fastapi import Header, HTTPException, status

try:
    firebase_admin.get_app()
except ValueError:
    firebase_admin.initialize_app()


async def get_current_uid(authorization: str = Header(default="")) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        decoded = firebase_auth.verify_id_token(token)
    except Exception as exc:  # noqa: BLE001 - surfaced as a clean 401
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid token: {exc}") from exc
    uid = decoded.get("uid")
    if not uid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token has no uid")
    return uid
