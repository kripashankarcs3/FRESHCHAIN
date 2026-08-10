# Plugging the trained model into FreshChain

You have `model.pth`, `predict.py`, `train.py`, `requirements.txt`. This is
exactly where they go and what has to be true for them to work.

**The short version:** drop `model.pth` and `predict.py` into `backend/`,
install the model deps, restart the API. The frontend picks it up automatically
and starts showing a **Trained model** badge instead of **On-device**.

---

## 1. Where the files go

```
backend/
├── model.pth          ← your checkpoint
├── predict.py         ← your inference script
├── requirements-model.txt   (already written — torch, torchvision, Pillow)
├── services/model.py  (already written — the adapter that calls you)
└── routers/vision.py  (already written — the HTTP endpoint)
```

`train.py` is **not** needed at runtime. Keep it in the repo for the judges —
"here is how we trained it" is worth showing — but it never gets imported by
the API.

> `.pth` files are gitignored on purpose. They are large and change
> independently of the code. Copy the checkpoint to the server directly, or
> attach it to a GitHub release, rather than committing it.

---

## 2. The contract `predict.py` must satisfy

The adapter imports `predict.py` and calls **one function**. Name it `predict`
(it also accepts `predict_image`, `run`, `infer` or `classify` if your teammate
already used one of those).

```python
# backend/predict.py

import torch
from PIL import Image
from torchvision import transforms

# Load ONCE at import time, not per request — otherwise every scan pays the
# checkpoint-deserialise cost.
_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
_CLASSES = ["fresh", "medium", "rotten"]          # ← must match training order

_model = torch.load("model.pth", map_location=_DEVICE, weights_only=False)
_model.eval()

# Must be IDENTICAL to the validation transform used in train.py.
_tf = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


def predict(image: Image.Image) -> dict:
    """image is an RGB PIL.Image. Return the dict below."""
    tensor = _tf(image).unsqueeze(0).to(_DEVICE)

    with torch.no_grad():
        logits = _model(tensor)
        probs = torch.softmax(logits, dim=1)[0]

    idx = int(probs.argmax())
    return {
        "label": _CLASSES[idx],
        "confidence": float(probs[idx]),
        "probabilities": {c: float(p) for c, p in zip(_CLASSES, probs)},
    }
```

### Return shape

| Key | Type | Required | Notes |
|-----|------|----------|-------|
| `label` | `str` | yes | Winning class |
| `confidence` | `float` 0–1 | yes | Probability of the winning class |
| `probabilities` | `dict[str, float]` | strongly preferred | Full distribution |

The adapter is permissive — it also accepts a bare `"rotten"` string or a
`("rotten", 0.91)` tuple — but **give it `probabilities`**. The score is a
probability-weighted average, so a borderline 51/49 batch correctly scores
differently from a confident 99/1 one. Without the distribution you lose that.

### Class labels it already understands

`fresh`, `good`, `ripe`, `medium`, `moderate`, `semifresh`, `stale`,
`overripe`, `rotten`, `spoiled`, `bad`

Different labels? Add them to `LABEL_SCORES` in
[backend/services/model.py](backend/services/model.py) — one line each, mapping
your label to a 0–100 score. Anything unmapped defaults to 50, which is safe
but wastes the model's signal.

---

## 3. Install and run

```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-model.txt     # torch, torchvision, Pillow

uvicorn main:app --reload --port 8000
```

Verify:

```bash
curl localhost:8000/vision/status
# {"model_available": true, "engine": "trained-model"}   ← model is live
# {"model_available": false, ...}                        ← check §5
```

Then point the frontend at it:

```bash
# .env in the project root
VITE_API_URL=http://localhost:8000
```

and **rebuild** (`npm run build`) — Vite inlines env vars at build time, so a
restart alone will not pick it up.

---

## 4. How it behaves in the app

```
Photo → POST /vision/analyse ──► model available?
                                  ├─ yes → trained model scores it   ["Trained model" badge]
                                  └─ no / timeout / error
                                        → on-device pixel pipeline   ["On-device" badge]
```

This ordering is deliberate and it is the reason **the demo cannot break**:

- Model serving → you get the real classifier, and the UI says so.
- Backend down, torch not installed, wifi dies mid-pitch → the browser grades
  it in ~50 ms and the demo continues. Nobody sees an error.

The badge on the result card always states which engine actually ran. Do not
remove it — claiming the model ran when the fallback did is the one thing that
would genuinely embarrass you if a judge probed.

The model owns the **score**. The on-device pass still runs alongside it (it is
cheap) to supply the four measured surface signals — colour, vibrancy, surface
integrity, texture — so the "What the model saw" panel stays populated with real
measurements rather than going blank.

---

## 4b. Known behaviour of the current checkpoint — read before demoing

Measured against `model.pth` as shipped. The model is a 2-layer CNN trained on
`["fresh", "rotten"]` with `Resize(224) + ToTensor()` and **no normalisation**,
so it keys strongly on overall image brightness.

Same red produce, only the background changed:

| Scene | Verdict |
|-------|---------|
| Red produce on a **white** background | `fresh` 0.99 ✅ |
| Red produce on a **grey** background | `fresh` 0.93–0.99 ✅ |
| Red produce on a **dark** background | `rotten` 0.60–0.99 ❌ |

Colour discrimination itself is sound — solid red, green and orange all read
`fresh`; solid brown reads `rotten` at 1.00. The failure mode is specifically
**dark frames**.

**What this means for the demo:** photograph the batch on a light surface in
good light. A perfectly fresh tomato shot in a dim room will be classified
rotten and routed to NGO rescue on stage. Test with your actual demo photos
before you present — this is the single most likely way the live scan
embarrasses you.

Longer-term fixes (not needed for the hackathon): add brightness/contrast
augmentation to `train.py`, or normalise with ImageNet statistics in both
`train.py` and `predict.py`. Do not add normalisation to only one of them.

---

## 5. When `model_available` is false

Check in this order:

| Symptom | Cause |
|---------|-------|
| `No checkpoint at .../model.pth` | File not in `backend/`, or set `MODEL_PATH` env var to its real location |
| `Could not import predict.py` | Not in `backend/`, or it throws at import — run `python -c "import predict"` and read the traceback |
| `predict.py exposes none of (...)` | Your function has a different name — rename it to `predict` |
| `Inference failed: ...` | Preprocessing mismatch, or the checkpoint was saved as a `state_dict` (see below) |

**`state_dict` vs full model.** If `train.py` saved with
`torch.save(model.state_dict(), ...)`, you cannot `torch.load` it straight into
a usable model — you must rebuild the architecture first:

```python
from torchvision import models
_model = models.resnet50(weights=None)
_model.fc = torch.nn.Linear(_model.fc.in_features, len(_CLASSES))
_model.load_state_dict(torch.load("model.pth", map_location=_DEVICE))
_model.eval()
```

Ask your teammate which one `train.py` used — this is the single most common
integration failure.

---

## 6. Deploying it

Torch is ~200 MB CPU-only, ~2.5 GB with CUDA. Free tiers often reject the build.

| Option | When |
|--------|------|
| **Railway / Render with model deps** | Simplest. Check the build-size limit first |
| **API without model deps** | Install only `requirements.txt`. Every scan falls back to on-device — still a complete demo |
| **Convert to ONNX** | If you later want the model to run *in the browser*, export to ONNX and load it with onnxruntime-web. Keeps the offline guarantee, but it is a separate piece of work |

For a hackathon tomorrow: **run the model locally on your laptop** and point the
frontend at `http://localhost:8000`. You get the trained model in the demo
without fighting a deploy pipeline, and the deployed Vercel build still works
standalone for anyone who opens the link.

---

## 7. Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MODEL_PATH` | `backend/model.pth` | Checkpoint location |
| `MODEL_DIR` | `backend/` | Where `predict.py` is looked up |
| `MODEL_VERSION` | `freshchain-cv-v1` | Shown in the UI for traceability |
