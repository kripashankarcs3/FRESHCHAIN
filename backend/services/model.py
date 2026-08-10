"""
Trained freshness model.

This is an *adapter*, not the model. Your teammate's `predict.py` owns the
architecture, the preprocessing and the class labels; this file's only job is to
call it, normalise whatever it returns into the one shape the product consumes,
and make absolutely sure a broken or missing model can never take the API down.

Contract expected from predict.py — see MODEL_INTEGRATION.md:

    predict(image: PIL.Image.Image) -> dict
        {
          "label": "fresh" | "medium" | "rotten",
          "confidence": 0.0-1.0,
          "probabilities": {"fresh": 0.87, "medium": 0.10, "rotten": 0.03},
        }

If `predict.py` exposes a differently-named callable we try a short list of
common names before giving up, so the integration does not hinge on one
spelling.
"""

from __future__ import annotations

import importlib
import io
import logging
import os
import time
from functools import lru_cache
from typing import Any, Callable

log = logging.getLogger(__name__)

# Where the checkpoint and predict.py live. Overridable so the same image can
# run in Docker, on Railway, or from a laptop without editing code.
MODEL_DIR = os.getenv("MODEL_DIR", os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODEL_PATH = os.getenv("MODEL_PATH", os.path.join(MODEL_DIR, "model.pth"))
MODEL_VERSION = os.getenv("MODEL_VERSION", "freshchain-cv-v1")

# Names we will accept for the entry point inside predict.py.
_ENTRY_POINTS = ("predict", "predict_image", "run", "infer", "classify")

# Maps whatever the model calls its classes onto a 0-100 freshness score.
# The midpoints are deliberate: "medium" produce should land in the routing
# engine's 3-5 day band, not straddle the boundary.
LABEL_SCORES: dict[str, int] = {
    "fresh": 88,
    "freshripe": 88,
    "fresh_ripe": 88,
    "good": 88,
    "ripe": 78,
    "medium": 55,
    "moderate": 55,
    "semifresh": 55,
    "semi_fresh": 55,
    "stale": 32,
    "overripe": 32,
    "rotten": 14,
    "spoiled": 14,
    "bad": 14,
    "freshrotten": 14,
}


class ModelUnavailable(RuntimeError):
    """
    The model cannot serve at all — missing checkpoint, failed import, broken
    weights. The router maps this to 503 and the client permanently falls back
    to on-device grading for the session.
    """


class BadImage(ValueError):
    """
    This *particular* upload could not be decoded. Distinct from
    ModelUnavailable on purpose: a single corrupt photo must not convince the
    client that the model is dead and disable it for the rest of the session.
    Maps to 422.
    """


@lru_cache(maxsize=1)
def _load_predictor() -> Callable[[Any], dict]:
    """
    Imports predict.py once and returns its entry point.

    Cached because importing torch and deserialising a checkpoint is expensive —
    we pay it on the first request, not on every scan.
    """
    if not os.path.exists(MODEL_PATH):
        raise ModelUnavailable(f"No checkpoint at {MODEL_PATH}")

    try:
        module = importlib.import_module("predict")
    except ImportError as exc:  # pragma: no cover - depends on deployment layout
        raise ModelUnavailable(f"Could not import predict.py: {exc}") from exc

    for name in _ENTRY_POINTS:
        fn = getattr(module, name, None)
        if callable(fn):
            log.info("Freshness model loaded via predict.%s", name)
            return fn

    raise ModelUnavailable(
        f"predict.py exposes none of {_ENTRY_POINTS}. Rename your inference "
        f"function to `predict(image)` or set one of these names."
    )


def is_available() -> bool:
    """Cheap check used by /health so the UI can show model status."""
    try:
        _load_predictor()
        return True
    except Exception:
        return False


def _score_from(label: str, probabilities: dict[str, float]) -> int:
    """
    Turns a class prediction into the 0-100 score the algorithms consume.

    Uses the full distribution as a weighted average rather than the winning
    label alone: a 51/49 fresh/rotten split is genuinely a borderline batch and
    should not score identically to a confident 99/1 fresh.
    """
    if probabilities:
        total = sum(probabilities.values()) or 1.0
        weighted = sum(
            LABEL_SCORES.get(str(k).lower().replace(" ", "_"), 50) * (v / total)
            for k, v in probabilities.items()
        )
        return max(0, min(100, round(weighted)))

    return LABEL_SCORES.get(str(label).lower().replace(" ", "_"), 50)


def _defects_for(label: str, score: int) -> list[dict]:
    """
    The model gives a class, not a defect list. Rather than invent findings,
    we emit one honest, clearly model-attributed line so the UI's defects panel
    is never empty-but-wrong.
    """
    key = str(label).lower()
    if score >= 70:
        return []
    if "rot" in key or "spoil" in key or "bad" in key:
        return [
            {
                "label": "Model flagged spoilage",
                "severity": min(1.0, (70 - score) / 70),
                "detail": f"Classifier assigned '{label}' with the surface consistent with active decay.",
            }
        ]
    return [
        {
            "label": "Model flagged degradation",
            "severity": min(1.0, (70 - score) / 70),
            "detail": f"Classifier assigned '{label}' — condition is past peak but not spoiled.",
        }
    ]


def analyse(image_bytes: bytes, produce_type: str) -> dict:
    """
    Runs the trained model over one photo.

    Raises `ModelUnavailable` when the model cannot answer — the router turns
    that into a 503 and the frontend silently falls back to on-device grading.
    """
    predictor = _load_predictor()

    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover
        raise ModelUnavailable("Pillow is required to decode uploads") from exc

    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise BadImage(f"Could not decode the uploaded image: {exc}") from exc

    started = time.perf_counter()
    try:
        raw = predictor(image)
    except Exception as exc:
        log.exception("Model inference failed")
        raise ModelUnavailable(f"Inference failed: {exc}") from exc
    elapsed_ms = (time.perf_counter() - started) * 1000

    # Be permissive about the return shape — a teammate's script might return a
    # bare label, a (label, confidence) tuple, or the full dict.
    if isinstance(raw, str):
        label, confidence, probabilities = raw, 0.75, {}
    elif isinstance(raw, tuple) and len(raw) >= 2:
        label, confidence, probabilities = str(raw[0]), float(raw[1]), {}
    elif isinstance(raw, dict):
        label = str(raw.get("label") or raw.get("class") or raw.get("prediction") or "unknown")
        probabilities = raw.get("probabilities") or raw.get("probs") or {}
        confidence = float(raw.get("confidence") or (max(probabilities.values()) if probabilities else 0.75))
    else:
        raise ModelUnavailable(
            f"predict() returned an unsupported type: {type(raw).__name__}. "
            f"See MODEL_INTEGRATION.md for the expected return shape."
        )

    probabilities = {str(k): float(v) for k, v in dict(probabilities).items()}
    score = _score_from(label, probabilities)

    return {
        "freshness_score": score,
        "confidence": round(max(0.0, min(1.0, confidence)), 3),
        "label": label,
        "probabilities": probabilities,
        "defects": _defects_for(label, score),
        "elapsed_ms": round(elapsed_ms, 1),
        "model_version": MODEL_VERSION,
        "produce_type": produce_type,
    }
