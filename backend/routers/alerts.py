from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from jobs.cascade import run_cascade
from models.schemas import AlertCreate, SpikeRequest
from services import db

router = APIRouter(prefix="/alerts")


@router.get("")
def list_alerts(resolved: bool | None = None) -> list[dict]:
    try:
        return db.list_alerts(resolved)
    except db.DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("")
def create_alert(payload: AlertCreate) -> dict:
    try:
        alert = payload.model_dump()
        alert["id"] = alert["id"] or db.next_sequential_id("ALT", "alerts")
        return db.insert_alert(alert)
    except db.DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/simulate-spike")
def simulate_spike(payload: SpikeRequest) -> dict:
    try:
        return run_cascade(payload.block, payload.temp_celsius)
    except db.DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/{alert_id}/resolve")
def resolve_alert(alert_id: str) -> dict:
    try:
        current = [a for a in db.list_alerts() if a.get("id") == alert_id]
        if not current:
            raise HTTPException(status_code=404, detail="Alert not found")
        timeline = current[0].get("timeline") or []
        timeline.append({"at": datetime.now(timezone.utc).isoformat(), "label": "Acknowledged and closed by operator", "kind": "act"})
        return db.update_alert(alert_id, {"resolved": True, "resolved_at": datetime.now(timezone.utc).isoformat(), "timeline": timeline})
    except db.DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
