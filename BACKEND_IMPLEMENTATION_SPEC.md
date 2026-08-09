# FreshChain — Backend Implementation Spec

**Read this whole document before writing any code.**

This is a complete, task-by-task build spec for the FreshChain backend. The React
frontend is **already built, working and deployed-ready**. Your job is to build the
FastAPI + Supabase + Claude backend that sits behind it.

The frontend currently runs fully standalone (all algorithms in TypeScript, in the
browser). The backend does **not** replace that — it adds persistence, a real Claude
recommendation, multi-device sync, and the server-side cascade job. The frontend must
keep working perfectly if the backend is down.

---

## 0. Ground rules — read these first

These are non-negotiable. Every task below assumes them.

### R1 — Numeric parity is the hard requirement

The Python algorithms must produce **byte-identical numbers** to the existing
TypeScript ones in `src/lib/algorithms.ts`. If Python says a batch has 3.4 days and
TypeScript says 3.5, the demo shows two different numbers on the same screen and the
project loses.

Section 3 gives you the exact reference implementation. Copy the arithmetic exactly,
including the rounding order.

### R2 — Never break the frontend

The frontend calls the backend with a 6-second timeout and silently falls back to its
on-device path on any error. Do not change that contract. Do not require the backend
for anything the frontend currently does without it.

### R3 — No secrets in the frontend

`ANTHROPIC_API_KEY` and the Supabase **service** key live only in the backend `.env`.
The frontend only ever learns `VITE_API_URL`.

### R4 — snake_case on the wire

The frontend sends and expects `snake_case` JSON. The frontend's TypeScript is
`camelCase` internally and maps at the boundary. Do not "fix" this.

### R5 — Every endpoint must degrade

If Claude times out, return the deterministic fallback text with `"source": "local"`.
If Supabase is unreachable, return a clear 503 with a JSON error body — never a 500
stack trace, never a hang.

---

## 1. What already exists (do not rebuild)

| Path | What it is |
|------|------------|
| `src/lib/algorithms.ts` | The three original algorithms in TypeScript. **This is the parity reference.** |
| `src/lib/vision.ts` | In-browser freshness grading. Stays in the browser — do **not** port to Python. |
| `src/lib/produce.ts` | Crop catalogue: base life, mandi prices, colour profiles, facilities |
| `src/lib/recommend.ts` | Calls `POST {VITE_API_URL}/recommendation`; falls back locally |
| `src/data/seed.ts` | Demo seed data, generated through the real algorithms |
| `src/store/useStore.ts` | Frontend state |

**Read `src/lib/algorithms.ts` and `src/lib/produce.ts` before starting Task 3.**

---

## 2. Target structure

```
backend/
├── main.py                 FastAPI app, CORS, health, exception handlers
├── requirements.txt
├── .env.example
├── .env                    (gitignored)
├── railway.json
├── algorithms/
│   ├── __init__.py
│   ├── produce.py          crop catalogue — mirrors src/lib/produce.ts
│   ├── shelf_life.py       Algorithm 1
│   ├── routing.py          Algorithm 2
│   └── pricing.py          Algorithm 3
├── services/
│   ├── __init__.py
│   ├── claude.py           Anthropic client + prompt + fallback
│   └── db.py               Supabase client + query helpers
├── models/
│   ├── __init__.py
│   └── schemas.py          Pydantic request/response models
├── routers/
│   ├── __init__.py
│   ├── batches.py
│   ├── alerts.py
│   ├── marketplace.py
│   ├── dashboard.py
│   └── recommendation.py
├── jobs/
│   ├── __init__.py
│   └── cascade.py          temperature-excursion sweep
├── seed_data.py            populates Supabase with the demo dataset
└── tests/
    ├── test_parity.py      REQUIRED — proves R1
    ├── test_algorithms.py
    └── test_api.py
```

---

## 3. The parity reference — read before Task 3

This is the exact behaviour your Python must reproduce.

### 3.1 Crop catalogue

| id | label | base_life_days | mandi_price_per_kg | temp_sensitivity |
|----|-------|----------------|--------------------|------------------|
| `tomato` | Tomato | 7 | 28 | 1.15 |
| `mango` | Mango | 5 | 72 | 1.30 |
| `banana` | Banana | 4 | 42 | 1.25 |
| `apple` | Apple | 14 | 118 | 0.60 |
| `potato` | Potato | 30 | 18 | 0.40 |
| `onion` | Onion | 60 | 32 | 0.30 |
| `leafy_greens` | Leafy Greens | 5 | 26 | 1.60 |
| `citrus` | Citrus | 14 | 58 | 0.70 |

Facilities per destination (first entry is the default the frontend picks):

```python
FACILITIES = {
    "NGO_RESCUE": [
        "Robin Hood Army — Ghaziabad Chapter",
        "Feeding India Kitchen, Vaishali",
        "Anna Kshetra Community Kitchen, Loni",
    ],
    "QUICK_COMMERCE": [
        "Dark Store — Indirapuram Hub",
        "Dark Store — Vasundhara Sector 9",
        "Dark Store — Noida Sector 62",
    ],
    "RETAIL_EXPORT": [
        "Retail DC — Azadpur Mandi",
        "Retail DC — Ghaziabad Wholesale",
        "Export Consolidation — IGI Cargo",
    ],
}
```

### 3.2 Algorithm 1 — shelf life

```
days_since_harvest = floor((today_midnight - harvest_midnight) / 1 day),  min 0
temp_penalty       = max(0, (temp_c - 15) * 0.3 * temp_sensitivity)
humidity_penalty   = max(0, (humidity_pct - 80) * 0.1)

before_vision      = base_life - days_since_harvest - temp_penalty - humidity_penalty

vision_factor      = clamp(0.15 + (freshness_score / 100) * 0.85, 0.15, 1.0)
vision_penalty     = max(0, before_vision) * (1 - vision_factor)

remaining          = max(0, before_vision - vision_penalty)
result             = round(remaining, 1)
```

Traps:
- `days_since_harvest` uses **calendar midnights**, not elapsed hours.
- `vision_penalty` multiplies `max(0, before_vision)` — a negative `before_vision`
  must not produce a positive penalty.
- Round **once**, at the end, to 1 decimal.
- `freshness_score` defaults to `100` when absent.

### 3.3 Algorithm 2 — routing

| Shelf life | Destination | Urgency | Multiplier | Action window (hours) |
|-----------|-------------|---------|-----------|----------------------|
| `<= 2` | `NGO_RESCUE` | `CRITICAL` | 0.10 | `max(2, round(days * 12))` |
| `<= 5` | `QUICK_COMMERCE` | `HIGH` | 0.70 | `max(6, round(days * 10))` |
| `> 5` | `RETAIL_EXPORT` | `NORMAL` | 1.00 | `48` |

The routing engine picks the channel, then calls the price optimiser with that
multiplier. It returns the optimiser's price as `suggested_price_per_kg`.

```
value_recovered = max(0, round((price - mandi_price * 0.15) * weight_kg))
```

`round()` here is Python's banker's rounding vs JS's half-up — for the integer rupee
totals this is within ₹1 and acceptable. **Do not** use banker's rounding anywhere in
Algorithm 1 or 3.

Destination labels: `NGO Rescue`, `Quick Commerce`, `Retail & Export`.

### 3.4 Algorithm 3 — price optimiser

```
urgency_discount   = clamp(max(0, (5 - shelf_life_days) * 0.08), 0, 0.4)
demand_premium     = clamp(demand_score, 0, 1) * 0.15
channel_base       = mandi_price_per_kg * channel_multiplier
final              = channel_base * (1 - urgency_discount + demand_premium)
price_per_kg       = round(max(mandi_price_per_kg * 0.05, final), 2)
```

`demand_score` defaults to `0.45`.

Also returns: `urgency_discount_pct` = `round(urgency_discount * 100)`,
`demand_premium_pct` = `round(demand_premium * 100)`, `channel_base_per_kg` =
`round(channel_base, 2)`.

### 3.5 Derived helpers

```
grade      = "A" if score > 70 else "B" if score > 40 else "C"
condition  = "Fresh" if score > 70 else "Medium" if score > 40 else "Spoiling"
co2_tonnes = round(weight_kg * 2.5 / 1000, 1)
```

### 3.6 Rounding helper — use this everywhere

Python's `round()` is banker's rounding; JavaScript's `Math.round` is half-up. They
disagree on exactly the values that show up in a demo (`round(0.5)` → `0` in Python,
`1` in JS). Use this in Algorithms 1 and 3:

```python
from decimal import Decimal, ROUND_HALF_UP

def jround(value: float, places: int = 0) -> float:
    """Half-up rounding, matching JavaScript's Math.round."""
    q = Decimal(10) ** -places
    return float(Decimal(str(value)).quantize(q, rounding=ROUND_HALF_UP))
```

---

# TASKS

Each task is independently verifiable. **Do not start a task until the previous one
passes its acceptance criteria.**

---

## Task 1 — Project scaffold and health check

**Goal:** FastAPI running locally with CORS open to the frontend.

**Files:** `backend/requirements.txt`, `backend/main.py`, `backend/.env.example`,
`backend/.gitignore`

**Do:**

1. `requirements.txt`, pinned:
   ```
   fastapi==0.115.6
   uvicorn[standard]==0.34.0
   anthropic==0.42.0
   supabase==2.11.0
   python-dotenv==1.0.1
   pydantic==2.10.4
   httpx==0.28.1
   pytest==8.3.4
   ```

2. `main.py` with:
   - `FastAPI(title="FreshChain API", version="1.0.0")`
   - `CORSMiddleware` — `allow_origins` read from env `CORS_ORIGINS`
     (comma-separated), defaulting to
     `["http://localhost:5173", "http://localhost:4173"]`. Allow all methods and
     headers.
   - `GET /health` → `{"status": "ok", "service": "freshchain", "version": "1.0.0"}`
   - A global exception handler returning
     `{"error": "<type>", "detail": "<message>"}` with the right status — never an
     HTML stack trace.

3. `.env.example`:
   ```
   ANTHROPIC_API_KEY=
   SUPABASE_URL=
   SUPABASE_SERVICE_KEY=
   CORS_ORIGINS=http://localhost:5173,http://localhost:4173
   PORT=8000
   ```

**Acceptance:**
```bash
uvicorn main:app --reload --port 8000
curl -s localhost:8000/health          # -> {"status":"ok",...}
curl -s localhost:8000/does-not-exist  # -> JSON error, not HTML
```

---

## Task 2 — Supabase schema

**Goal:** Three tables, correct types, indexes, RLS considered.

**Files:** `backend/schema.sql`

**Do:** Run this in the Supabase SQL editor.

```sql
create table if not exists batches (
  id                   text primary key,          -- 'BATCH-1A00', client-generated
  produce_type         text not null,
  weight_kg            numeric not null check (weight_kg > 0),
  harvest_date         date not null,
  freshness_score      integer not null check (freshness_score between 0 and 100),
  grade                text not null check (grade in ('A','B','C')),
  shelf_life_days      numeric not null check (shelf_life_days >= 0),
  destination          text not null check (destination in ('NGO_RESCUE','QUICK_COMMERCE','RETAIL_EXPORT')),
  destination_label    text not null,
  facility             text not null,
  urgency              text not null check (urgency in ('CRITICAL','HIGH','NORMAL')),
  suggested_price      numeric not null,
  value_recovered      numeric not null default 0,
  status               text not null default 'pending'
                       check (status in ('pending','routed','listed','claimed','delivered')),
  cold_storage_block   text,
  temp_celsius         numeric,
  humidity_pct         numeric,
  confidence           numeric,
  defects              jsonb default '[]'::jsonb,
  signals              jsonb default '[]'::jsonb,
  recommendation       text,
  rerouted_from        text,
  rerouted_reason      text,
  origin               text,
  created_at           timestamptz not null default now()
);

create table if not exists alerts (
  id                 text primary key,            -- 'ALT-2201'
  type               text not null check (type in ('temperature','shelf_life','humidity','route_confirmed','claim')),
  severity           text not null check (severity in ('critical','warning','info')),
  title              text not null,
  message            text not null,
  auto_action        text,
  location           text,
  affected_batch_ids text[] default '{}',
  impact             jsonb,
  timeline           jsonb not null default '[]'::jsonb,
  resolved           boolean not null default false,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now()
);

create table if not exists marketplace (
  id            text primary key,                 -- 'LST-3100'
  batch_id      text not null references batches(id) on delete cascade,
  produce_type  text not null,
  weight_kg     numeric not null,
  days_left     numeric not null,
  price_per_kg  numeric not null default 0,
  buyer_types   text[] not null default '{}',
  location      text,
  distance_km   numeric,
  is_free       boolean not null default false,
  claimed       boolean not null default false,
  claimed_by    text,
  claimed_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_batches_urgency    on batches(urgency);
create index if not exists idx_batches_status     on batches(status);
create index if not exists idx_batches_created    on batches(created_at desc);
create index if not exists idx_batches_block      on batches(cold_storage_block);
create index if not exists idx_alerts_resolved    on alerts(resolved, created_at desc);
create index if not exists idx_market_claimed     on marketplace(claimed, created_at desc);
```

**Notes:**
- `id` is `text`, not `uuid` — the frontend generates readable IDs (`BATCH-1A00`) and
  a judge reads them aloud during the demo. Do not change this to `uuid`.
- `free` is a reserved-ish word in some tooling; the column is `is_free`. The API
  still exposes it as `free` (see Task 7).
- The backend uses the **service key** and bypasses RLS. If you enable RLS, add a
  service-role policy or every write will silently fail.

**Acceptance:** All three tables visible in Supabase with the right columns; a manual
insert and select round-trips.

---

## Task 3 — Port the three algorithms (the critical task)

**Goal:** `algorithms/` produces numbers identical to the TypeScript.

**Files:** `algorithms/produce.py`, `algorithms/shelf_life.py`,
`algorithms/routing.py`, `algorithms/pricing.py`

**Do:**

1. `produce.py` — the catalogue from §3.1 as a dict of dataclasses, plus `FACILITIES`.
   Include a `get_produce(produce_type)` that raises a clear `ValueError` on an
   unknown crop.

2. `shelf_life.py` — `calculate_shelf_life(produce_type, harvest_date, temp_celsius,
   humidity_pct, freshness_score=100) -> ShelfLifeResult`, exactly per §3.2.
   Return `days`, `base_life_days`, and a `factors` list of
   `{"label": str, "days": float}` (only non-zero entries), matching the TypeScript's
   labels:
   - `"Days since harvest"`
   - `"Temperature {t:.1f}°C"`
   - `"Humidity {h:.0f}%"`
   - `"Visual condition {score:.0f}/100"`

3. `pricing.py` — `optimize_price(shelf_life_days, mandi_price_per_kg, demand_score=0.45,
   channel_multiplier=1.0) -> PriceResult`, exactly per §3.4.

4. `routing.py` — `smart_route(shelf_life_days, weight_kg, produce_type,
   mandi_price_per_kg=None, demand_score=0.45) -> RouteResult`, exactly per §3.3.
   Include the three `rationale` strings verbatim from `src/lib/algorithms.ts`.

Use `jround` from §3.6 everywhere. Type-hint everything. No I/O, no network, no
database access in this package — these are pure functions.

**Acceptance — `tests/test_parity.py` must exist and pass.**

Hardcode these expected values (computed from the TypeScript implementation) and
assert exact equality. `harvest_date` is expressed as days before today:

These values were generated by executing the actual TypeScript implementation — they
are ground truth, not estimates. `weight_kg` affects only `value_recovered`, so it is
listed for completeness.

| # | crop | harvest (days ago) | temp | rh | score | weight | → days | → urgency | → destination | → price/kg |
|---|------|--------------------|------|-----|-------|--------|--------|-----------|---------------|-----------|
| 1 | `tomato` | 2 | 16.0 | 81 | 74 | 520 | **3.5** | `HIGH` | `QUICK_COMMERCE` | **18.57** |
| 2 | `mango` | 2 | 18.5 | 84 | 58 | 340 | **0.8** | `CRITICAL` | `NGO_RESCUE` | **5.27** |
| 3 | `leafy_greens` | 1 | 17.0 | 86 | 54 | 120 | **1.5** | `CRITICAL` | `NGO_RESCUE` | **2.05** |
| 4 | `banana` | 1 | 15.5 | 80 | 78 | 610 | **2.3** | `HIGH` | `QUICK_COMMERCE` | **25.03** |
| 5 | `apple` | 3 | 8.0 | 70 | 92 | 950 | **10.3** | `NORMAL` | `RETAIL_EXPORT` | **125.96** |
| 6 | `onion` | 9 | 16.0 | 68 | 90 | 3100 | **46.6** | `NORMAL` | `RETAIL_EXPORT` | **34.16** |
| 7 | `potato` | 6 | 13.0 | 76 | 86 | 2400 | **21.1** | `NORMAL` | `RETAIL_EXPORT` | **19.21** |
| 8 | `citrus` | 7 | 13.0 | 75 | 78 | 540 | **5.7** | `NORMAL` | `RETAIL_EXPORT` | **61.91** |

All eight use the default `demand_score = 0.45`.

Also assert:
- `calculate_shelf_life("tomato", today, 14, 76, 100).days == 7.0`
- A batch harvested 40 days ago returns `0.0`, never negative.
- `freshness_score=0` yields `days` at most 15 % of `before_vision`.

**If any row disagrees, stop and fix the port. Do not proceed to Task 4.**

> **Regenerate the table yourself** if you ever change the algorithms. From the repo
> root, create `_parity.ts`:
> ```ts
> import { calculateShelfLife, smartRoute } from './src/lib/algorithms';
> const rows: [string, number, number, number, number, number][] = [
>   ['tomato', 2, 16.0, 81, 74, 520],
>   ['mango', 2, 18.5, 84, 58, 340],
>   ['leafy_greens', 1, 17.0, 86, 54, 120],
>   ['banana', 1, 15.5, 80, 78, 610],
>   ['apple', 3, 8.0, 70, 92, 950],
>   ['onion', 9, 16.0, 68, 90, 3100],
>   ['potato', 6, 13.0, 76, 86, 2400],
>   ['citrus', 7, 13.0, 75, 78, 540],
> ];
> rows.forEach(([crop, ago, temp, rh, score, kg]) => {
>   const harvest = new Date(Date.now() - ago * 86_400_000);
>   const s = calculateShelfLife(crop as never, harvest, { tempCelsius: temp, humidityPct: rh }, score);
>   const r = smartRoute(s.days, kg, crop as never);
>   console.log(crop, s.days, r.urgency, r.suggestedPricePerKg, r.destination);
> });
> ```
> then `npx tsx _parity.ts`. Delete the file afterwards.

---

## Task 4 — Supabase service layer

**Goal:** One place that talks to the database.

**Files:** `services/db.py`

**Do:**

1. Lazily create a module-level Supabase client from `SUPABASE_URL` +
   `SUPABASE_SERVICE_KEY`. If either is missing, log a warning once and set the client
   to `None` — **do not crash on import.** Every endpoint must still respond (503 for
   DB-backed routes, 200 for `/health` and `/recommendation`).

2. Implement, all with try/except returning `(data, error)` or raising a typed
   `DatabaseError`:
   - `insert_batch(batch: dict) -> dict`
   - `list_batches(urgency=None, status=None, limit=100) -> list[dict]`
   - `get_batch(batch_id) -> dict | None`
   - `update_batch(batch_id, patch: dict) -> dict`
   - `insert_alert(alert) -> dict`
   - `list_alerts(resolved: bool | None = None) -> list[dict]`
   - `update_alert(alert_id, patch) -> dict`
   - `insert_listing(listing) -> dict`
   - `list_listings(claimed: bool | None = None) -> list[dict]`
   - `claim_listing(listing_id, buyer) -> dict`  ← must be idempotent-safe: only
     update `where claimed = false`, and return `None` if nothing was updated so the
     router can return 409.
   - `dashboard_counts() -> dict`

3. `next_sequential_id(prefix, table) -> str` — reads the max numeric suffix and
   returns `f"{prefix}-{n+1}"`, matching the frontend's `ALT-2202` / `LST-3106` style.

**Acceptance:** With `.env` populated, a throwaway script inserts a batch, lists it,
updates its status, and reads it back. With `.env` emptied, `GET /health` still
returns 200.

---

## Task 5 — Claude recommendation endpoint

**Goal:** The one endpoint the frontend already calls today.

**Files:** `services/claude.py`, `routers/recommendation.py`, `models/schemas.py`

**This is the highest-value task — the frontend is already wired for it.**

### Exact contract (do not change any field name)

`POST /recommendation`

Request:
```json
{
  "produce_type":    "tomato",
  "weight_kg":       520,
  "freshness_score": 74,
  "shelf_life_days": 3.5,
  "destination":     "QUICK_COMMERCE",
  "suggested_price": 18.57,
  "facility":        "Dark Store — Indirapuram Hub"
}
```

Response `200`:
```json
{ "text": "…", "source": "claude" }
```

The frontend reads **only** `text`. `source` is for your logs and the UI badge.
On any failure return `200` with the fallback text and `"source": "local"` — a
non-200 makes the frontend discard the whole response.

### Claude call

- Model: `claude-sonnet-4-6`
- `max_tokens`: 250
- `temperature`: 0.4
- Timeout: **4 seconds** (the frontend gives up at 6; leave headroom)
- One retry on connection error only — never on timeout.

System prompt:
```
You are a supply-chain advisor at a fresh-produce mandi in Ghaziabad, Uttar Pradesh.
You write for warehouse supervisors, in the Hindi-English mix they actually speak.

The routing decision has ALREADY been made by FreshChain's routing engine. You do not
question it, re-decide it, or suggest alternatives. You explain what to do about it.

Write exactly 2-3 sentences. State: where to send it, by when, at what rate, and what
happens if they wait. Use the numbers given — never invent a number. No preamble, no
bullet points, no markdown.
```

User prompt: interpolate the batch fields, the crop's label, and the total lot value
(`suggested_price * weight_kg`), formatted in Indian numbering (₹2,84,000).

### Fallback

Port `compose()` from `src/lib/recommend.ts` verbatim into
`services/claude.py::fallback_recommendation()`. It must return the same three
channel-specific strings the frontend produces. Use it when:
- `ANTHROPIC_API_KEY` is unset
- the API times out, errors, or rate-limits
- the response is empty

### Prewarm cache (do this — it is the demo's insurance)

Add `GET /recommendation/prewarm` which generates and caches recommendations for the
8 crops × 3 destinations = 24 combinations into an in-memory dict keyed by
`(produce_type, destination, round(shelf_life_days))`. On a live request, if Claude
fails, check the cache before falling back to the composer. Call this once before the
demo.

**Acceptance:**
```bash
curl -s -X POST localhost:8000/recommendation \
  -H 'Content-Type: application/json' \
  -d '{"produce_type":"mango","weight_kg":340,"freshness_score":58,
       "shelf_life_days":0.8,"destination":"NGO_RESCUE",
       "suggested_price":5.27,"facility":"Robin Hood Army — Ghaziabad Chapter"}'
```
- Returns 200 with a 2–3 sentence Hindi-English recommendation, `source: "claude"`.
- With `ANTHROPIC_API_KEY` unset: still 200, `source: "local"`, sensible text.
- Then start the frontend with `VITE_API_URL=http://localhost:8000`, scan a batch, and
  confirm the Recommendation card's badge reads **Claude** instead of **On-device**.

---

## Task 6 — Batches API

**Files:** `routers/batches.py`, `models/schemas.py`

| Method | Path | Behaviour |
|--------|------|-----------|
| `POST` | `/batches` | Accept intake, run all three algorithms server-side, persist, return the full batch |
| `GET` | `/batches` | List. Query params: `urgency`, `status`, `limit` (default 100, max 500) |
| `GET` | `/batches/{id}` | One batch, 404 if missing |
| `PATCH` | `/batches/{id}/status` | Body `{"status": "routed"}`. Validate the transition |
| `POST` | `/batches/{id}/accept` | Set `routed`; if `urgency == CRITICAL`, also create the marketplace listing (Task 7) and return both |

`POST /batches` request:
```json
{
  "produce_type": "tomato",
  "weight_kg": 520,
  "harvest_date": "2026-08-08",
  "freshness_score": 74,
  "temp_celsius": 16.0,
  "humidity_pct": 81,
  "cold_storage_block": "Block A",
  "confidence": 0.88,
  "defects": [],
  "signals": [],
  "origin": "Bay 2 intake"
}
```

The server computes `shelf_life_days`, `grade`, `destination`, `destination_label`,
`facility`, `urgency`, `suggested_price`, `value_recovered` and `recommendation`.
**Never trust these from the client** — recomputing them server-side is what makes the
API the source of truth.

Generate `id` server-side in the frontend's format: `BATCH-` + 4 uppercase hex chars,
retrying on collision.

Valid status transitions (reject anything else with 409):
```
pending  -> routed
routed   -> listed | delivered
listed   -> claimed
claimed  -> delivered
```

**Acceptance:** POST a batch → the returned `shelf_life_days` and `suggested_price`
match the Task 3 parity table for the same inputs. GET it back. Accept it. Try an
invalid transition and get a 409.

---

## Task 7 — Marketplace API

**Files:** `routers/marketplace.py`

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/marketplace` | List. Query params: `claimed` (bool), `free` (bool) |
| `POST` | `/marketplace` | Create a listing from `{"batch_id": "..."}` |
| `POST` | `/marketplace/{id}/claim` | Body `{"buyer": "..."}`. 409 if already claimed |

Listing rules — these must match the frontend exactly:
- `is_free = days_left <= 1`
- `price_per_kg = 0` when free, else the batch's `suggested_price`
- Free listings: `buyer_types` may only contain `NGO` and `Canteen`. A dark store
  must never be able to claim donated produce.
- Priced listings: any of `NGO`, `Dark Store`, `Canteen`, `Processor`
- Claiming sets the listing `claimed`, `claimed_by`, `claimed_at` **and** the batch's
  status to `claimed`, in that order. If the batch update fails, roll the listing
  back.

The API exposes the column `is_free` as `free` in JSON, matching the frontend's
`Listing` type.

**Acceptance:** Create a listing from a critical batch, claim it, confirm the batch
status flipped to `claimed`, and confirm a second claim returns 409.

---

## Task 8 — Alerts API and the cascade job

**Files:** `routers/alerts.py`, `jobs/cascade.py`

| Method | Path | Behaviour |
|--------|------|-----------|
| `GET` | `/alerts` | List. Query param `resolved` (bool) |
| `POST` | `/alerts` | Create an alert manually |
| `POST` | `/alerts/{id}/resolve` | Mark resolved, append a timeline entry |
| `POST` | `/alerts/simulate-spike` | **The demo endpoint.** Body `{"block": "Block C", "temp_celsius": 24}` |

### The cascade — `jobs/cascade.py`

This is the product's signature behaviour. Given a block and a temperature:

1. **Detect** — find all batches in that block with `status not in ('delivered','claimed')`.
2. **Recompute** — for each, recalculate shelf life at the new temperature by
   re-running `calculate_shelf_life` with the elevated `temp_celsius`. (The frontend's
   local version subtracts a flat 3 days; the backend does it properly — this is an
   upgrade, and the numbers will differ slightly. That is expected and fine.)
3. **Re-route** — re-run `smart_route` on the new shelf life. Persist the new
   destination, facility, price, urgency, `rerouted_from`, `rerouted_reason`.
4. **Notify** — build the alert with a 4-entry `timeline` of kinds
   `detect` → `compute` → `act` → `notify`, matching the frontend's `Alert` type.
5. Any batch that crossed into `CRITICAL` also gets a marketplace listing.

Response:
```json
{
  "alert": { ...full alert... },
  "affected_batches": [ ...full batches... ],
  "summary": { "batches_evaluated": 5, "batches_rerouted": 3, "days_lost_avg": 2.8 }
}
```

Alert `id` from `next_sequential_id("ALT", "alerts")`. Timeline entry shape:
`{"at": "<iso8601>", "label": "...", "kind": "detect|compute|act|notify"}`.

**Acceptance:** `POST /alerts/simulate-spike` with `{"block":"Block C","temp_celsius":24}`
returns an alert plus the re-routed batches; `GET /batches?urgency=CRITICAL` shows more
rows than before; the affected batches carry `rerouted_reason`.

---

## Task 9 — Dashboard stats

**Files:** `routers/dashboard.py`

`GET /dashboard/stats` → one query-efficient response:

```json
{
  "tonnes_saved": 18.02,
  "value_recovered": 636000,
  "batches_routed": 22,
  "batches_total": 22,
  "co2_tonnes": 45.1,
  "critical": 6,
  "high": 5,
  "normal": 8,
  "pending": 0,
  "open_alerts": 3,
  "critical_alerts": 2,
  "value_at_risk": 86780
}
```

Definitions — these must match `useMetrics()` in `src/store/useStore.ts`:
- **active** = `status not in ('delivered', 'claimed')`
- `tonnes_saved` = total kg of batches in `routed | claimed | delivered`, ÷ 1000, 2 dp
- `value_at_risk` = Σ over **active CRITICAL** batches of `weight_kg × mandi_price`
- `co2_tonnes` = `saved_kg × 2.5 / 1000`, 1 dp

Do this in **at most 3 queries**. Do not fetch every batch and aggregate in Python if
the row count could grow.

Add `GET /dashboard/trend?days=14` returning `[{date, tonnes, recovered, spoiled}]`.

**Acceptance:** After seeding, the numbers match what the frontend shows when running
standalone (within rounding).

---

## Task 10 — Seed script

**Files:** `seed_data.py`

Port the 22-batch dataset from `src/data/seed.ts` (the `RAW` array), plus the 5 alerts
and the marketplace listings.

**Critical:** do not hardcode the derived values. Run every raw row through your Python
`calculate_shelf_life` → `smart_route` → `optimize_price`, exactly as `seed.ts` does.
This is a second, independent parity check — if the seeded dashboard totals differ from
the frontend's standalone numbers, your port is wrong.

```bash
python seed_data.py --reset   # truncate then seed
python seed_data.py           # seed only if empty
```

Print a summary on completion: batch count, urgency distribution, total value
recovered. Expected distribution among **active** batches (`status not in
('delivered','claimed')`) is **6 CRITICAL, 5 HIGH, 8 NORMAL** — note that 2 of the
6 critical rows are already `listed` on the rescue board, not `pending`; they still
count as active and critical until claimed.

**Acceptance:** `GET /dashboard/stats` after seeding returns `critical: 6`,
`high: 5`, `normal: 8`.

---

## Task 11 — Tests

**Files:** `tests/test_parity.py`, `tests/test_algorithms.py`, `tests/test_api.py`

1. `test_parity.py` — Task 3's table. Non-negotiable.
2. `test_algorithms.py` — edge cases:
   - harvest date in the future → treated as 0 days elapsed, never negative
   - `freshness_score = 0` and `= 100`
   - unknown produce type → `ValueError`
   - `temp_celsius` below 15 → zero temperature penalty
   - `humidity_pct` below 80 → zero humidity penalty
   - shelf life exactly `2.0` → `CRITICAL`; exactly `5.0` → `HIGH`; `5.1` → `NORMAL`
     (**boundary conditions are `<=`, verify both sides**)
3. `test_api.py` — FastAPI `TestClient`, DB mocked:
   - health returns 200
   - `POST /batches` computes correctly and rejects a bad `produce_type` with 422
   - `POST /recommendation` returns 200 with `source: "local"` when the key is unset
   - claiming an already-claimed listing returns 409
   - an invalid status transition returns 409

```bash
pytest -v          # all green before you call this done
```

---

## Task 12 — Deploy to Railway

**Files:** `railway.json`, `Procfile`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build":  { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "uvicorn main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE",
    "healthcheckPath": "/health"
  }
}
```

Set in the Railway dashboard: `ANTHROPIC_API_KEY`, `SUPABASE_URL`,
`SUPABASE_SERVICE_KEY`, and `CORS_ORIGINS` including the deployed Vercel URL.

**Acceptance:** `curl https://<app>.up.railway.app/health` returns 200 from another
machine. Then set `VITE_API_URL` in Vercel to that URL, redeploy the frontend, scan a
batch, and confirm the recommendation badge reads **Claude**.

---

## 13. Final verification checklist

Do not report the backend as done until every line is ticked.

**Parity**
- [ ] `pytest tests/test_parity.py` — all 8 rows pass exactly
- [ ] Seeded dashboard shows `critical: 6, high: 5, normal: 8`
- [ ] A batch POSTed to the API shows the same shelf life the frontend computes locally

**API**
- [ ] `/health` 200
- [ ] All endpoints in Tasks 5–9 respond correctly
- [ ] Every error path returns JSON, never HTML or a stack trace
- [ ] Bad input returns 422; conflicts return 409; missing returns 404

**Resilience**
- [ ] `ANTHROPIC_API_KEY` unset → `/recommendation` still 200, `source: "local"`
- [ ] Supabase env unset → the app still boots and `/health` still returns 200
- [ ] Claude timeout at 4s does not exceed the frontend's 6s budget

**Integration**
- [ ] Frontend with `VITE_API_URL` set: scan → recommendation badge reads **Claude**
- [ ] Frontend with `VITE_API_URL` unset: everything still works identically
- [ ] CORS allows both `localhost:5173` and the deployed Vercel origin

**Deployment**
- [ ] Railway health check green
- [ ] `curl` from outside the network succeeds

---

## 14. Things that will go wrong — read before debugging

| Symptom | Cause |
|---------|-------|
| Python shelf life differs from TS by 0.1 | Used `round()` instead of half-up `jround()`. See §3.6 |
| Off-by-one day on shelf life | Used elapsed hours instead of calendar midnight difference |
| Frontend still shows "On-device" | `VITE_API_URL` not set at **build** time (Vite inlines env vars — you must rebuild, not just restart) |
| CORS error in the browser console | `CORS_ORIGINS` missing the exact origin including port and scheme |
| Supabase insert silently no-ops | RLS enabled without a service-role policy |
| Batch inserts fail on `id` | You changed `id` to `uuid`. It must stay `text` |
| `free` column errors | Column is `is_free`; only the JSON field is `free` |
| Cascade returns 0 affected | Filtered on `status != 'delivered'` but forgot `'claimed'` |
| Recommendation reads generic | You let Claude re-decide the routing. The system prompt forbids it — check you sent the destination |

---

## 15. Priority if time runs short

Hackathon reality: if you cannot finish everything, build in this order and stop
wherever you run out of time. Each stopping point leaves a working system.

1. **Task 5 — `/recommendation`** — the only endpoint the frontend already calls.
   Alone, it upgrades the demo from on-device text to real Claude output.
2. **Tasks 1 + 3 + 11** — scaffold, algorithms, parity tests. This is what a judge
   asking "what did you actually build?" wants to see.
3. **Tasks 2 + 4 + 6 + 10** — persistence, so the demo survives a refresh.
4. **Task 8** — the server-side cascade.
5. **Tasks 7 + 9 + 12** — marketplace, stats, deploy.

**The frontend is a complete, working product without any of this.** Never leave it in
a state where a half-finished backend breaks it.
