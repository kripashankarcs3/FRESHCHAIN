from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from .produce import get_produce


@dataclass(frozen=True)
class ShelfLifeResult:
    days: float
    base_life_days: int
    factors: list[dict[str, Any]]


def jround(value: float, places: int = 0) -> float:
    q = Decimal(10) ** -places
    return float(Decimal(str(value)).quantize(q, rounding=ROUND_HALF_UP))


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def _as_date(value: date | datetime | str) -> date:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value[:10])


def calculate_shelf_life(
    produce_type: str,
    harvest_date: date | datetime | str,
    temp_celsius: float,
    humidity_pct: float,
    freshness_score: float = 100,
    today: date | None = None,
) -> ShelfLifeResult:
    spec = get_produce(produce_type)
    current = today or date.today()
    harvested = _as_date(harvest_date)
    days_since_harvest = max(0, (current - harvested).days)
    temp_penalty = max(0, (temp_celsius - 15) * 0.3 * spec.temp_sensitivity)
    humidity_penalty = max(0, (humidity_pct - 80) * 0.1)
    before_vision = spec.base_life_days - days_since_harvest - temp_penalty - humidity_penalty
    vision_factor = clamp(0.15 + (freshness_score / 100) * 0.85, 0.15, 1.0)
    vision_penalty = max(0, before_vision) * (1 - vision_factor)
    remaining = max(0, before_vision - vision_penalty)
    factors = [
        {"label": "Days since harvest", "days": -days_since_harvest},
        {"label": f"Temperature {temp_celsius:.1f}°C", "days": -jround(temp_penalty, 1)},
        {"label": f"Humidity {jround(humidity_pct):.0f}%", "days": -jround(humidity_penalty, 1)},
        {"label": f"Visual condition {jround(freshness_score):.0f}/100", "days": -jround(vision_penalty, 1)},
    ]
    return ShelfLifeResult(jround(remaining, 1), spec.base_life_days, [f for f in factors if f["days"] != 0])
