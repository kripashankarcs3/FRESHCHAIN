from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from algorithms.produce import get_produce
from algorithms.shelf_life import jround
from services import db

router = APIRouter(prefix="/dashboard")


@router.get("/stats")
def stats() -> dict:
    try:
        data = db.dashboard_counts()
    except db.DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    batches = data["batches"]
    alerts = data["alerts"]
    active = [b for b in batches if b.get("status") not in ("delivered", "claimed")]
    saved = [b for b in batches if b.get("status") in ("routed", "claimed", "delivered")]
    saved_kg = sum(float(b.get("weight_kg") or 0) for b in saved)
    return {
        "tonnes_saved": jround(saved_kg / 1000, 2),
        "value_recovered": sum(float(b.get("value_recovered") or 0) for b in batches),
        "batches_routed": len([b for b in batches if b.get("status") != "pending"]),
        "batches_total": len(batches),
        "co2_tonnes": jround(saved_kg * 2.5 / 1000, 1),
        "critical": len([b for b in active if b.get("urgency") == "CRITICAL"]),
        "high": len([b for b in active if b.get("urgency") == "HIGH"]),
        "normal": len([b for b in active if b.get("urgency") == "NORMAL"]),
        "pending": len([b for b in batches if b.get("status") == "pending"]),
        "open_alerts": len([a for a in alerts if not a.get("resolved")]),
        "critical_alerts": len([a for a in alerts if not a.get("resolved") and a.get("severity") == "critical"]),
        "value_at_risk": sum(float(b.get("weight_kg") or 0) * get_produce(b["produce_type"]).mandi_price_per_kg for b in active if b.get("urgency") == "CRITICAL"),
    }


@router.get("/trend")
def trend(days: int = Query(14, ge=1, le=90)) -> list[dict]:
    today = date.today()
    return [{"date": (today - timedelta(days=days - i - 1)).strftime("%d %b"), "tonnes": 0, "recovered": 0, "spoiled": 0} for i in range(days)]
