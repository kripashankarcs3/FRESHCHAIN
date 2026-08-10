from dataclasses import dataclass

from .shelf_life import clamp, jround


@dataclass(frozen=True)
class PriceResult:
    price_per_kg: float
    urgency_discount_pct: int
    demand_premium_pct: int
    mandi_price_per_kg: float
    channel_multiplier: float
    channel_base_per_kg: float


def optimize_price(
    shelf_life_days: float,
    mandi_price_per_kg: float,
    demand_score: float = 0.45,
    channel_multiplier: float = 1.0,
) -> PriceResult:
    urgency_discount = clamp(max(0, (5 - shelf_life_days) * 0.08), 0, 0.4)
    demand_premium = clamp(demand_score, 0, 1) * 0.15
    channel_base = mandi_price_per_kg * channel_multiplier
    final = channel_base * (1 - urgency_discount + demand_premium)
    return PriceResult(
        price_per_kg=jround(max(mandi_price_per_kg * 0.05, final), 2),
        urgency_discount_pct=int(jround(urgency_discount * 100)),
        demand_premium_pct=int(jround(demand_premium * 100)),
        mandi_price_per_kg=mandi_price_per_kg,
        channel_multiplier=channel_multiplier,
        channel_base_per_kg=jround(channel_base, 2),
    )
