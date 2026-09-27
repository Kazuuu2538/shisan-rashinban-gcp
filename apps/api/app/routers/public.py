"""Public, non-secret configuration the frontend needs before a user
signs in. Firebase web API keys are not secrets (they identify the
project, not authorize access — Firebase Auth + Firestore security
rules do that), so serving them from here avoids a manual copy-paste
step between Terraform and the frontend on every environment."""
import os

from fastapi import APIRouter

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/config")
async def public_config():
    # The frontend already knows the API's own base URL (injected into
    # config.js at deploy time — see apps/web), so this only needs to
    # hand back the Firebase web config for anything that prefers to
    # fetch it at runtime instead of bundling it.
    return {
        "firebase": {
            "apiKey": os.environ.get("FIREBASE_API_KEY", ""),
            "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN", ""),
            "projectId": os.environ.get("FIREBASE_PROJECT_ID", ""),
            "appId": os.environ.get("FIREBASE_APP_ID", ""),
        },
    }
