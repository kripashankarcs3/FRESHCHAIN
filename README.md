<<<<<<< HEAD
# Fresh vs Rotten Classification API

A Flask + PyTorch backend API for classifying fruit/produce images as `fresh` or `rotten`.

## Setup

1. Install Python 3.11.
2. Create and activate a virtual environment:

```powershell
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1
```

3. Install dependencies:

```powershell
pip install -r requirements.txt
```

## Run

```powershell
python app.py
```

Server runs on `http://127.0.0.1:5000` by default.

## API

### POST /predict

- Content type: `multipart/form-data`
- Field:
  - `file`: image file

Example response:

```json
{
  "prediction": "fresh"
}
```

### GET /health

Returns service health status.

Example response:

```json
{
  "status": "ok"
}
```
=======
# FreshChain — Produce Intelligence OS

**Scan karo. Route karo. Waste bachao.**

India loses 15–30 % of its fresh produce every year. Not because there is no food —
because nobody knows *where* to send a batch, and *when*, before it spoils.

FreshChain is the decision layer that answers exactly that. Photograph a batch, and
it grades the surface, predicts how many days of life are actually left, picks the
channel the batch can still reach in time, prices it, and — when a cold room moves —
re-routes everything in that block on its own.

---

## What is actually running

Three original algorithms do the thinking. No model API is involved in any routing
decision.

| # | Algorithm | File | What it decides |
|---|-----------|------|-----------------|
| 1 | Shelf-life calculator | [src/lib/algorithms.ts](src/lib/algorithms.ts) | Days of life left, from crop base life, harvest age, storage temperature, humidity and visible condition |
| 2 | Smart routing engine | [src/lib/algorithms.ts](src/lib/algorithms.ts) | NGO Rescue (≤ 2 d) · Quick Commerce (3–5 d) · Retail & Export (6 d +) |
| 3 | Price optimiser | [src/lib/algorithms.ts](src/lib/algorithms.ts) | `mandi rate × channel multiplier × (1 − urgency discount + demand premium)` |

The three compose into a single quoted rate per batch, so the routing card, the batch
card and the marketplace listing can never disagree with each other.

### Freshness grading runs in the browser

[src/lib/vision.ts](src/lib/vision.ts) analyses the uploaded photo's actual pixels on a
canvas — no upload, no inference server, no per-scan cost, and it works with the venue
wifi down. Roughly 50 ms for a phone photo.

1. Downsample to 224 × 224.
2. Segment the specimen from the background with a centre-weighted chroma mask.
3. Score four independent decay signals against the crop's healthy colour profile:
   - **Colour match** — hue drift, plus the share of surface that has actually browned
   - **Vibrancy** — brightness and chroma; decaying tissue darkens
   - **Surface integrity** — necrotic tissue, mould and bruise cores
   - **Texture** — wrinkling and break-up, via Sobel magnitude over interior pixels only
4. Combine into 0–100 and emit the defects that drove the number.

Browning is detected as a *joint* condition — earth-tone hue **and** low brightness —
because hue alone cannot separate a rotten tomato from a ripe one.

Every figure the interface shows traces back to one of those four measurements. That
matters when a judge asks what the AI actually did.

### Where the language model sits

Strictly last, and strictly optional. The routing decision is already made before
[src/lib/recommend.ts](src/lib/recommend.ts) runs; the model only puts that decision
into language a mandi supervisor can act on. Set `VITE_API_URL` and Claude writes it.
Leave it unset — or let the network fail — and an on-device composer writes it from the
same numbers. **No routing outcome changes either way.**

---

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run typecheck    # tsc, no emit
npm run lint         # eslint, zero warnings
npm run build        # production bundle
npm run preview      # serve the build
```

Copy `.env.example` to `.env` only if you want the Claude-written recommendation.
The app is fully self-contained without it — that is the configuration to demo on
venue wifi.

---

## The five screens

| Route | Screen | Purpose |
|-------|--------|---------|
| `/` | **Dashboard** | What is happening right now: tonnes saved, value recovered, triage counts, value at risk, the decision queue, live alerts and cold-chain telemetry |
| `/scan` | **Batch Scan** | Photo → grade → shelf life → route → recommendation → accept |
| `/routing` | **Routing** | Every active batch, filterable by urgency, as cards or a dense table |
| `/alerts` | **Alert Center** | Cascade detection with the full detect → recompute → re-route → notify chain |
| `/marketplace` | **Rescue Marketplace** | Near-expiry stock claimable by NGOs, community kitchens and dark stores. Under 24 hours it goes out free |

Everything is connected through one store — a batch scanned on `/scan` immediately
moves the dashboard counters, appears in the routing queue, and lands on the rescue
board if it grades critical. Nothing in the app is a screenshot.

---

## Demo path

1. **Dashboard** — the floor at a glance. `₹…` at risk inside the 48-hour window.
2. **Batch Scan** — photograph real produce (the camera button works on a phone).
   Watch the six-stage pipeline, then the score reveal.
3. **Accept & route** — the batch enters the queue and the counters move.
4. **Alerts → Simulate temperature spike** — Block C hits 24 °C. Shelf life is
   recomputed, destinations change, buyers are notified. No operator touched it.
5. **Rescue Marketplace** — claim a free batch for an NGO.

The "Simulate temperature spike" control is in the sidebar too, so the cascade can be
triggered from any screen mid-demo.

---

## Design

The product is built as a **control room for perishables**, not a consumer app.

The organising idea: **the brand colour is the freshness signal.** Mint green means
"this batch is safe", and as shelf life decays the interface drains through amber into
red. Because colour carries meaning, it is spent nowhere else — everything structural
is monochrome. All red, amber and green in the product resolves through one map in
[src/lib/urgencyStyle.ts](src/lib/urgencyStyle.ts), so a batch cannot be red on one
screen and amber on another.

Supporting rules:

- **Mono for all operational data.** Batch IDs, temperatures, prices, timestamps and
  shelf life are JetBrains Mono; the interface is Inter Tight. That split is what makes
  the UI read as an instrument rather than a template.
- **Hairlines, not shadows.** 1 px borders, radius capped at 14 px, one inset highlight.
- **One repeated object.** The segmented shelf-life decay bar appears on every batch on
  every screen, with tick marks on the 2-day and 5-day routing thresholds — so an
  operator can see *why* a batch sits in its channel without reading a word.

---

## Stack

React 18 · TypeScript · Vite · Tailwind · Zustand · Framer Motion · Recharts · lucide

Recharts is lazy-loaded so the dashboard's metric row paints without waiting on a
150 kB chart library.

---

## Structure

```
src/
  lib/
    algorithms.ts     the three original algorithms
    vision.ts         in-browser freshness grading
    recommend.ts      language layer + optional Claude call
    produce.ts        crop catalogue: base life, prices, colour profiles
    urgencyStyle.ts   the single urgency → colour map
  data/seed.ts        Ghaziabad pilot node, all derived through the real algorithms
  store/useStore.ts   one store; every screen reads and writes it
  components/         layout · ui primitives · viz · batch card
  screens/            the five workspaces
```

Seed data is generated by running the same functions the live scan flow uses, so any
card a judge picks will survive arithmetic.
>>>>>>> 38c20f1eb79732c8f4bf252d5ea98dbd5db830dd
