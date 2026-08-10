from datetime import date

import pytest
from fastapi.testclient import TestClient

import services.db as db
from main import app

client = TestClient(app)


def test_health():
    assert client.get("/health").status_code == 200


def test_recommendation_local(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    response = client.post("/recommendation", json={"produce_type": "mango", "weight_kg": 340, "freshness_score": 58, "shelf_life_days": 0.8, "destination": "NGO_RESCUE", "suggested_price": 5.27, "facility": "Robin Hood Army — Ghaziabad Chapter"})
    assert response.status_code == 200
    assert response.json()["source"] == "local"


def test_post_batch_and_bad_produce(monkeypatch):
    saved = {}
    monkeypatch.setattr(db, "insert_batch", lambda batch: saved.setdefault("batch", batch))
    response = client.post("/batches", json={"produce_type": "tomato", "weight_kg": 520, "harvest_date": date.today().isoformat(), "freshness_score": 74, "temp_celsius": 16, "humidity_pct": 81})
    assert response.status_code == 200
    assert response.json()["shelf_life_days"] >= 0
    bad = client.post("/batches", json={"produce_type": "bad", "weight_kg": 1, "harvest_date": date.today().isoformat(), "freshness_score": 74})
    assert bad.status_code == 422


def test_already_claimed_listing(monkeypatch):
    monkeypatch.setattr(db, "claim_listing", lambda listing_id, buyer: None)
    response = client.post("/marketplace/LST-1/claim", json={"buyer": "NGO"})
    assert response.status_code == 409


def test_invalid_transition(monkeypatch):
    monkeypatch.setattr(db, "get_batch", lambda batch_id: {"id": batch_id, "status": "pending"})
    response = client.patch("/batches/BATCH-1/status", json={"status": "delivered"})
    assert response.status_code == 409
