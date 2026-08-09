from datetime import datetime, timezone
import secrets

from fastapi import APIRouter, HTTPException, Query

from algorithms.produce import FACILITIES
from algorithms.routing import grade_of, smart_route
from algorithms.shelf_life import calculate_shelf_life
from models.schemas import BatchIntake, StatusPatch
from services import db
from services.claude import fallback_recommendation

router = APIRouter(prefix="/batches")
TRANSITIONS = {"pending": {"routed"}, "routed": {"listed", "delivered"}, "listed": {"claimed"}, "claimed": {"delivered"}}


def _db_error(exc: db.DatabaseError) -> HTTPException:
    return HTTPException(status_code=503, detail=str(exc))


def build_batch(payload: BatchIntake, batch_id: str | None = None, status: str = "pending") -> dict:
    shelf = calculate_shelf_life(payload.produce_type, payload.harvest_date, payload.temp_celsius, payload.humidity_pct, payload.freshness_score)
    route = smart_route(shelf.days, payload.weight_kg, payload.produce_type)
    facility = FACILITIES[route.destination][0]
    batch = {
        "id": batch_id or f"BATCH-{secrets.token_hex(2).upper()}",
        "produce_type": payload.produce_type,
        "weight_kg": payload.weight_kg,
        "harvest_date": payload.harvest_date.isoformat(),
        "freshness_score": payload.freshness_score,
        "grade": grade_of(payload.freshness_score),
        "shelf_life_days": shelf.days,
        "destination": route.destination,
        "destination_label": route.destination_label,
        "facility": facility,
        "urgency": route.urgency,
        "suggested_price": route.suggested_price_per_kg,
        "value_recovered": route.value_recovered,
        "status": status,
        "cold_storage_block": payload.cold_storage_block,
        "temp_celsius": payload.temp_celsius,
        "humidity_pct": payload.humidity_pct,
        "confidence": payload.confidence,
        "defects": payload.defects,
        "signals": payload.signals,
        "origin": payload.origin,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    class R:
        pass
    r = R()
    r.produce_type = payload.produce_type
    r.weight_kg = payload.weight_kg
    r.freshness_score = payload.freshness_score
    r.shelf_life_days = shelf.days
    r.destination = route.destination
    r.suggested_price = route.suggested_price_per_kg
    r.facility = facility
    batch["recommendation"] = fallback_recommendation(r)
    return batch


@router.post("")
def create_batch(payload: BatchIntake) -> dict:
    for _ in range(8):
        batch = build_batch(payload)
        try:
            return db.insert_batch(batch)
        except db.DatabaseError as exc:
            if "duplicate" not in str(exc).lower() and "already" not in str(exc).lower():
                raise _db_error(exc)
    raise HTTPException(status_code=409, detail="Could not allocate batch id")


@router.get("")
def list_batches(urgency: str | None = None, status: str | None = None, limit: int = Query(100, ge=1, le=500)) -> list[dict]:
    try:
        return db.list_batches(urgency, status, limit)
    except db.DatabaseError as exc:
        raise _db_error(exc)


@router.get("/{batch_id}")
def get_batch(batch_id: str) -> dict:
    try:
        batch = db.get_batch(batch_id)
    except db.DatabaseError as exc:
        raise _db_error(exc)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


@router.patch("/{batch_id}/status")
def patch_status(batch_id: str, payload: StatusPatch) -> dict:
    batch = get_batch(batch_id)
    if payload.status not in TRANSITIONS.get(batch["status"], set()):
        raise HTTPException(status_code=409, detail="Invalid status transition")
    try:
        return db.update_batch(batch_id, {"status": payload.status})
    except db.DatabaseError as exc:
        raise _db_error(exc)


@router.post("/{batch_id}/accept")
def accept_batch(batch_id: str) -> dict:
    batch = patch_status(batch_id, StatusPatch(status="routed"))
    listing = None
    if batch["urgency"] == "CRITICAL":
        from routers.marketplace import create_listing_from_batch
        listing = create_listing_from_batch(batch)
    return {"batch": batch, "listing": listing}
