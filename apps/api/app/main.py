from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import agent, alerts, goals, internal, public, snapshots

app = FastAPI(title="Shisan Rashinban API", version="0.1.0")

# Firebase Hosting serves the frontend from a different origin than
# Cloud Run, so the API needs CORS. Tighten allow_origins to the real
# Hosting domain once it is known (see infra/terraform/cloud_run.tf).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(goals.router)
app.include_router(snapshots.router)
app.include_router(alerts.router)
app.include_router(agent.router)
app.include_router(internal.router)
app.include_router(public.router)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
