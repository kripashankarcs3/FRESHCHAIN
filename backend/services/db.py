import logging
import os
from typing import Any

from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)
_client: Any = None
_client_checked = False


class DatabaseError(Exception):
    pass


def get_client() -> Any:
    global _client, _client_checked
    if _client_checked:
        return _client
    _client_checked = True
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        log.warning("Supabase env is missing; DB-backed routes will return 503")
        return None
    try:
        from supabase import create_client
        _client = create_client(url, key)
    except Exception as exc:
        log.warning("Supabase client init failed: %s", exc)
        _client = None
    return _client


def require_client() -> Any:
    client = get_client()
    if client is None:
        raise DatabaseError("Supabase is not configured")
    return client


def _execute(query: Any) -> Any:
    try:
        return query.execute().data
    except DatabaseError:
        raise
    except Exception as exc:
        raise DatabaseError(str(exc)) from exc


def insert_batch(batch: dict) -> dict:
    data = _execute(require_client().table("batches").insert(batch))
    return data[0]


def list_batches(urgency: str | None = None, status: str | None = None, limit: int = 100) -> list[dict]:
    query = require_client().table("batches").select("*").order("created_at", desc=True).limit(limit)
    if urgency:
        query = query.eq("urgency", urgency)
    if status:
        query = query.eq("status", status)
    return _execute(query)


def get_batch(batch_id: str) -> dict | None:
    data = _execute(require_client().table("batches").select("*").eq("id", batch_id).limit(1))
    return data[0] if data else None


def update_batch(batch_id: str, patch: dict) -> dict:
    data = _execute(require_client().table("batches").update(patch).eq("id", batch_id))
    if not data:
        raise DatabaseError("Batch update returned no rows")
    return data[0]


def insert_alert(alert: dict) -> dict:
    data = _execute(require_client().table("alerts").insert(alert))
    return data[0]


def list_alerts(resolved: bool | None = None) -> list[dict]:
    query = require_client().table("alerts").select("*").order("created_at", desc=True)
    if resolved is not None:
        query = query.eq("resolved", resolved)
    return _execute(query)


def update_alert(alert_id: str, patch: dict) -> dict:
    data = _execute(require_client().table("alerts").update(patch).eq("id", alert_id))
    if not data:
        raise DatabaseError("Alert update returned no rows")
    return data[0]


def insert_listing(listing: dict) -> dict:
    data = _execute(require_client().table("marketplace").insert(listing))
    return data[0]


def list_listings(claimed: bool | None = None, free: bool | None = None) -> list[dict]:
    query = require_client().table("marketplace").select("*").order("created_at", desc=True)
    if claimed is not None:
        query = query.eq("claimed", claimed)
    if free is not None:
        query = query.eq("is_free", free)
    return _execute(query)


def claim_listing(listing_id: str, buyer: str) -> dict | None:
    from datetime import datetime, timezone
    data = _execute(require_client().table("marketplace").update({"claimed": True, "claimed_by": buyer, "claimed_at": datetime.now(timezone.utc).isoformat()}).eq("id", listing_id).eq("claimed", False))
    return data[0] if data else None


def update_listing(listing_id: str, patch: dict) -> dict:
    data = _execute(require_client().table("marketplace").update(patch).eq("id", listing_id))
    if not data:
        raise DatabaseError("Listing update returned no rows")
    return data[0]


def next_sequential_id(prefix: str, table: str) -> str:
    data = _execute(require_client().table(table).select("id").like("id", f"{prefix}-%"))
    highest = 0
    for row in data:
        try:
            highest = max(highest, int(str(row["id"]).split("-")[1]))
        except (IndexError, ValueError, TypeError):
            pass
    return f"{prefix}-{highest + 1}"


def dashboard_counts() -> dict:
    batches = _execute(require_client().table("batches").select("*"))
    alerts = _execute(require_client().table("alerts").select("severity,resolved"))
    return {"batches": batches, "alerts": alerts}
