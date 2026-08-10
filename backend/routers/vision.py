"""
Trained-model grading endpoint.

Deliberately returns 503 (not 500) when the model is missing or fails: the
frontend treats 503 as "fall back to on-device grading" and the demo continues
without a visible error. A 500 would read as a bug; this is a designed state.
"""

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.model import BadImage, ModelUnavailable, analyse, is_available

log = logging.getLogger(__name__)

router = APIRouter(prefix="/vision", tags=["vision"])

# Refuse absurd uploads before they reach the model. Phone photos are ~2-6 MB.
MAX_UPLOAD_BYTES = 12 * 1024 * 1024


@router.get("/status")
def vision_status():
    """Lets the UI show whether the trained model is actually serving."""
    available = is_available()
    return {
        "model_available": available,
        "engine": "trained-model" if available else "on-device-fallback",
    }


@router.post("/analyse")
async def analyse_image(image: UploadFile = File(...), produce_type: str = Form("tomato")):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="Upload must be an image")

    payload = await image.read()
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 12 MB limit")
    if not payload:
        raise HTTPException(status_code=422, detail="Empty upload")

    try:
        return analyse(payload, produce_type)
    except BadImage as exc:
        # 422, not 503 — one unreadable photo must not convince the client the
        # model is dead and disable it for the rest of the session.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except ModelUnavailable as exc:
        log.warning("Falling back to on-device grading: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
