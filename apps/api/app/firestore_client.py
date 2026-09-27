"""Shared Firestore client. Cloud Run injects application-default
credentials automatically via the attached service account, so no key
file is needed here or in production."""
from functools import lru_cache
from google.cloud import firestore


@lru_cache(maxsize=1)
def get_db() -> firestore.Client:
    return firestore.Client()


ASSET_KEYS = ["cash", "domesticStock", "foreignStock", "bonds", "other"]
