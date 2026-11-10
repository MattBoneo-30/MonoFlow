"""Optional stateless Python insights endpoint for Monoflow.

Run locally: uvicorn api.main:app --host 127.0.0.1 --port 8000
No accounts, files, database, or server-side session persistence.
"""
from collections import defaultdict
from datetime import datetime
from typing import Annotated

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Monoflow Insights", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["POST", "GET"],
    allow_headers=["Content-Type"],
)


class SessionData(BaseModel):
    completed_at: datetime
    minutes: Annotated[float, Field(gt=0, le=1440)]


class InsightRequest(BaseModel):
    sessions: Annotated[list[SessionData], Field(max_length=10000)]


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "monoflow-insights"}


@app.post("/insights")
def insights(payload: InsightRequest) -> dict:
    daily = defaultdict(float)
    for session in payload.sessions:
        daily[session.completed_at.date().isoformat()] += session.minutes
    most_productive_day = max(daily, key=daily.get) if daily else None
    return {
        "total_sessions": len(payload.sessions),
        "total_minutes": round(sum(s.minutes for s in payload.sessions), 2),
        "most_productive_day": most_productive_day,
        "minutes_by_day": dict(sorted(daily.items())),
    }
