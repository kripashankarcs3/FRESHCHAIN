import argparse
from datetime import date, datetime, timedelta, timezone

from algorithms.produce import COLD_STORAGE_BLOCKS, FACILITIES
from algorithms.routing import grade_of, smart_route
from algorithms.shelf_life import calculate_shelf_life
from services import db
from services.claude import fallback_recommendation

RAW = [
    ("mango", 340, 2, 58, 18.5, 84, 1.2, None),
    ("leafy_greens", 120, 1, 54, 17.0, 86, 0.7, None),
    ("banana", 290, 1, 62, 17.5, 85, 2.1, None),
    ("tomato", 310, 3, 49, 17.5, 83, 3.4, None),
    ("tomato", 520, 2, 74, 16.0, 81, 2.4, None),
    ("banana", 610, 1, 78, 15.5, 80, 3.1, None),
    ("mango", 420, 1, 82, 14.0, 78, 4.0, None),
    ("leafy_greens", 95, 0, 86, 9.0, 79, 5.0, None),
    ("tomato", 430, 2, 80, 15.0, 76, 6.5, None),
    ("apple", 860, 8, 85, 9.5, 72, 7.2, None),
    ("citrus", 540, 7, 78, 13.0, 75, 8.1, None),
    ("tomato", 780, 1, 88, 14.0, 74, 9.4, None),
    ("apple", 950, 3, 92, 8.0, 70, 10.6, None),
    ("potato", 2400, 6, 86, 13.0, 76, 12.0, None),
    ("onion", 3100, 9, 90, 16.0, 68, 13.5, None),
    ("citrus", 680, 2, 84, 11.0, 72, 15.2, None),
    ("apple", 1200, 5, 89, 7.5, 68, 17.0, None),
    ("mango", 260, 2, 50, 18.0, 87, 20.0, "listed"),
    ("leafy_greens", 140, 2, 48, 18.0, 88, 21.5, "listed"),
    ("banana", 380, 2, 66, 16.5, 82, 22.8, "claimed"),
    ("potato", 1800, 11, 82, 15.5, 77, 26.0, "delivered"),
    ("onion", 2200, 14, 88, 17.0, 66, 28.5, "delivered"),
]

ORIGINS = ["Modinagar farm cluster", "Hapur collection centre", "Muradnagar FPO", "Baghpat farm gate", "Meerut aggregation point", "Bulandshahr cluster"]


def batch_id(index: int) -> str:
    return f"BATCH-{0x1a00 + index * 977:04X}"


def make_batch(row, index: int) -> dict:
    produce_type, kg, harvest, score, temp, rh, hrs, status = row
    harvest_date = date.today() - timedelta(days=harvest)
    shelf = calculate_shelf_life(produce_type, harvest_date, temp, rh, score)
    route = smart_route(shelf.days, kg, produce_type)
    facility = FACILITIES[route.destination][index % len(FACILITIES[route.destination])]
    class R:
        pass
    r = R()
    r.produce_type = produce_type
    r.weight_kg = kg
    r.freshness_score = score
    r.shelf_life_days = shelf.days
    r.destination = route.destination
    r.suggested_price = route.suggested_price_per_kg
    r.facility = facility
    return {
        "id": batch_id(index),
        "produce_type": produce_type,
        "weight_kg": kg,
        "harvest_date": harvest_date.isoformat(),
        "freshness_score": score,
        "grade": grade_of(score),
        "shelf_life_days": shelf.days,
        "destination": route.destination,
        "destination_label": route.destination_label,
        "facility": facility,
        "urgency": route.urgency,
        "suggested_price": route.suggested_price_per_kg,
        "value_recovered": route.value_recovered,
        "status": status or "routed",
        "cold_storage_block": COLD_STORAGE_BLOCKS[index % len(COLD_STORAGE_BLOCKS)],
        "temp_celsius": temp,
        "humidity_pct": rh,
        "confidence": 0.88,
        "defects": [],
        "signals": [],
        "recommendation": fallback_recommendation(r),
        "origin": ORIGINS[index % len(ORIGINS)],
        "created_at": (datetime.now(timezone.utc) - timedelta(hours=hrs)).isoformat(),
    }


def make_listing(batch: dict, index: int) -> dict:
    free = batch["shelf_life_days"] <= 1
    return {
        "id": f"LST-{3100 + index}",
        "batch_id": batch["id"],
        "produce_type": batch["produce_type"],
        "weight_kg": batch["weight_kg"],
        "days_left": batch["shelf_life_days"],
        "price_per_kg": 0 if free else batch["suggested_price"],
        "buyer_types": ["NGO", "Canteen"] if free else ["NGO", "Dark Store"],
        "location": "Ghaziabad node · Bay 2",
        "distance_km": 2.4,
        "is_free": free,
        "claimed": batch["status"] == "claimed",
        "claimed_by": "Robin Hood Army — Ghaziabad Chapter" if batch["status"] == "claimed" else None,
        "created_at": batch["created_at"],
    }


def reset() -> None:
    client = db.require_client()
    client.table("marketplace").delete().neq("id", "").execute()
    client.table("alerts").delete().neq("id", "").execute()
    client.table("batches").delete().neq("id", "").execute()


def seed(skip_if_present: bool) -> None:
    if skip_if_present and db.list_batches(limit=1):
        print("Seed skipped; batches already exist")
        return
    batches = [make_batch(row, i) for i, row in enumerate(RAW)]
    for batch in batches:
        db.insert_batch(batch)
    listings = ([b for b in batches if b["status"] in ("listed", "claimed")] + [b for b in batches if b["urgency"] == "CRITICAL" and b["status"] not in ("listed", "claimed")])[:6]
    for i, batch in enumerate(listings):
        db.insert_listing(make_listing(batch, i))
    for i in range(5):
        db.insert_alert({"id": f"ALT-{2201 - i}", "type": "temperature", "severity": "critical" if i < 2 else "warning", "title": "FreshChain seeded alert", "message": "Seeded demo alert", "affected_batch_ids": [], "timeline": [], "resolved": i >= 3})
    active = [b for b in batches if b["status"] not in ("claimed", "delivered")]
    dist = {u: len([b for b in active if b["urgency"] == u]) for u in ("CRITICAL", "HIGH", "NORMAL")}
    print(f"Seeded {len(batches)} batches; urgency={dist}; value_recovered={sum(b['value_recovered'] for b in batches)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    args = parser.parse_args()
    if args.reset:
        reset()
    seed(not args.reset)
