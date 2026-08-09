from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

ProduceType = Literal["tomato", "mango", "banana", "apple", "potato", "onion", "leafy_greens", "citrus"]
Destination = Literal["NGO_RESCUE", "QUICK_COMMERCE", "RETAIL_EXPORT"]
Urgency = Literal["CRITICAL", "HIGH", "NORMAL"]
BatchStatus = Literal["pending", "routed", "listed", "claimed", "delivered"]


class RecommendationRequest(BaseModel):
    produce_type: ProduceType
    weight_kg: float = Field(gt=0)
    freshness_score: int = Field(ge=0, le=100)
    shelf_life_days: float = Field(ge=0)
    destination: Destination
    suggested_price: float = Field(ge=0)
    facility: str


class RecommendationResponse(BaseModel):
    text: str
    source: Literal["claude", "local"]


class BatchIntake(BaseModel):
    produce_type: ProduceType
    weight_kg: float = Field(gt=0)
    harvest_date: date
    freshness_score: int = Field(ge=0, le=100)
    temp_celsius: float = 15.0
    humidity_pct: float = 80.0
    cold_storage_block: str | None = None
    confidence: float | None = None
    defects: list[Any] = Field(default_factory=list)
    signals: list[Any] = Field(default_factory=list)
    origin: str | None = None


class StatusPatch(BaseModel):
    status: BatchStatus


class ListingCreate(BaseModel):
    batch_id: str


class ClaimRequest(BaseModel):
    buyer: str


class AlertCreate(BaseModel):
    id: str | None = None
    type: Literal["temperature", "shelf_life", "humidity", "route_confirmed", "claim"]
    severity: Literal["critical", "warning", "info"]
    title: str
    message: str
    auto_action: str | None = None
    location: str | None = None
    affected_batch_ids: list[str] = Field(default_factory=list)
    impact: dict[str, Any] | None = None
    timeline: list[dict[str, Any]] = Field(default_factory=list)


class SpikeRequest(BaseModel):
    block: str
    temp_celsius: float


class TrendPoint(BaseModel):
    date: str
    tonnes: float
    recovered: float
    spoiled: float


class DashboardStats(BaseModel):
    tonnes_saved: float
    value_recovered: float
    batches_routed: int
    batches_total: int
    co2_tonnes: float
    critical: int
    high: int
    normal: int
    pending: int
    open_alerts: int
    critical_alerts: int
    value_at_risk: float


class LimitQuery(BaseModel):
    limit: int = Field(default=100, ge=1, le=500)

    @field_validator("limit")
    @classmethod
    def clamp_limit(cls, value: int) -> int:
        return min(value, 500)
