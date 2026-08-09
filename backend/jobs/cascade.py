from datetime import datetime, timezone

from algorithms.produce import FACILITIES
from algorithms.routing import smart_route
from algorithms.shelf_life import calculate_shelf_life, jround
from services import db


def run_cascade(block: str, temp_celsius: float) -> dict:
    batches = [b for b in db.list_batches(limit=500) if b.get("cold_storage_block") == block and b.get("status") not in ("delivered", "claimed")]
    affected = []
    days_lost = []
    rerouted = 0
    for batch in batches:
        before = float(batch["shelf_life_days"])
        shelf = calculate_shelf_life(batch["produce_type"], batch["harvest_date"], temp_celsius, float(batch.get("humidity_pct") or 80), float(batch.get("freshness_score") or 100))
        route = smart_route(shelf.days, float(batch["weight_kg"]), batch["produce_type"])
        patch = {
            "shelf_life_days": shelf.days,
            "destination": route.destination,
            "destination_label": route.destination_label,
            "facility": FACILITIES[route.destination][0],
            "urgency": route.urgency,
            "suggested_price": route.suggested_price_per_kg,
            "value_recovered": route.value_recovered,
            "temp_celsius": temp_celsius,
            "rerouted_from": batch["destination"],
            "rerouted_reason": f"{block} temperature excursion",
        }
        updated = db.update_batch(batch["id"], patch)
        affected.append(updated)
        days_lost.append(max(0, before - shelf.days))
        if route.destination != batch["destination"]:
            rerouted += 1
        if route.urgency == "CRITICAL":
            from routers.marketplace import create_listing_from_batch
            create_listing_from_batch(updated)
    now = datetime.now(timezone.utc).isoformat()
    alert = db.insert_alert({
        "id": db.next_sequential_id("ALT", "alerts"),
        "type": "temperature",
        "severity": "critical",
        "title": f"Cold storage {block} — temperature spike",
        "message": f"{block} climbed to {temp_celsius:g} °C. {len(affected)} batches in the block have been re-evaluated.",
        "auto_action": f"{rerouted} batches re-routed automatically. Receiving buyers notified.",
        "location": f"{block} · Ghaziabad node",
        "affected_batch_ids": [b["id"] for b in affected],
        "impact": {"label": "Shelf life", "before": f"{jround(sum(days_lost), 1)} days lost", "after": f"{len(affected)} batches checked"},
        "timeline": [
            {"at": now, "label": f"Sensor reported {temp_celsius:g} °C in {block}", "kind": "detect"},
            {"at": now, "label": f"Shelf life recomputed for {len(affected)} batches", "kind": "compute"},
            {"at": now, "label": "Routing engine re-ran and changed destinations where needed", "kind": "act"},
            {"at": now, "label": "Receiving buyers notified of the revised slot", "kind": "notify"},
        ],
    })
    avg = jround(sum(days_lost) / len(days_lost), 1) if days_lost else 0
    return {"alert": alert, "affected_batches": affected, "summary": {"batches_evaluated": len(batches), "batches_rerouted": rerouted, "days_lost_avg": avg}}
