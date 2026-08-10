from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from models.schemas import ClaimRequest, ListingCreate
from services import db

router = APIRouter(prefix="/marketplace")


def _listing_json(row: dict) -> dict:
    out = dict(row)
    out["free"] = out.pop("is_free", False)
    return out


def _distance_for(destination: str, block: str | None) -> float:
    """
    Plausible haul distance, mirroring the frontend's distanceFor(). Rescue
    partners are inside the city; retail and export hubs are further out.
    Keyed off the storage block so a batch always reports the same distance
    rather than every listing showing an identical 2.4 km.
    """
    base = {"NGO_RESCUE": 2.4, "QUICK_COMMERCE": 6.8}.get(destination, 14.2)
    offset = (ord((block or "A")[-1]) % 5) * 0.7
    return round(base + offset, 1)


def create_listing_from_batch(batch: dict) -> dict:
    if existing := [l for l in db.list_listings() if l.get("batch_id") == batch["id"]]:
        return _listing_json(existing[0])
    is_free = float(batch["shelf_life_days"]) <= 1
    listing = {
        "id": db.next_sequential_id("LST", "marketplace"),
        "batch_id": batch["id"],
        "produce_type": batch["produce_type"],
        "weight_kg": batch["weight_kg"],
        "days_left": batch["shelf_life_days"],
        "price_per_kg": 0 if is_free else batch["suggested_price"],
        "buyer_types": ["NGO", "Canteen"] if is_free else ["NGO", "Dark Store", "Canteen", "Processor"],
        "location": f"Ghaziabad node · {batch.get('cold_storage_block') or 'Bay 2'}",
        "distance_km": _distance_for(batch["destination"], batch.get("cold_storage_block")),
        "is_free": is_free,
        "claimed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    inserted = db.insert_listing(listing)
    db.update_batch(batch["id"], {"status": "listed"})
    return _listing_json(inserted)


@router.get("")
def list_marketplace(claimed: bool | None = None, free: bool | None = None) -> list[dict]:
    try:
        return [_listing_json(row) for row in db.list_listings(claimed, free)]
    except db.DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("")
def create_listing(payload: ListingCreate) -> dict:
    try:
        batch = db.get_batch(payload.batch_id)
        if not batch:
            raise HTTPException(status_code=404, detail="Batch not found")
        return create_listing_from_batch(batch)
    except db.DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.post("/{listing_id}/claim")
def claim_listing(listing_id: str, payload: ClaimRequest) -> dict:
    try:
        listing = db.claim_listing(listing_id, payload.buyer)
        if not listing:
            raise HTTPException(status_code=409, detail="Listing already claimed")
        try:
            db.update_batch(listing["batch_id"], {"status": "claimed"})
        except db.DatabaseError:
            db.update_batch(listing["batch_id"], {"status": "listed"})
            db.update_listing(listing_id, {"claimed": False, "claimed_by": None, "claimed_at": None})
            raise
        return _listing_json(listing)
    except db.DatabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
