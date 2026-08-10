from dataclasses import asdict, dataclass

from .pricing import PriceResult, optimize_price
from .produce import get_produce
from .shelf_life import jround

DESTINATION_LABEL = {
    "NGO_RESCUE": "NGO Rescue",
    "QUICK_COMMERCE": "Quick Commerce",
    "RETAIL_EXPORT": "Retail & Export",
}


@dataclass(frozen=True)
class RouteResult:
    destination: str
    destination_label: str
    urgency: str
    action_window_hours: int
    suggested_price_per_kg: float
    price: PriceResult
    value_recovered: int
    rationale: str


def smart_route(
    shelf_life_days: float,
    weight_kg: float,
    produce_type: str,
    mandi_price_per_kg: float | None = None,
    demand_score: float = 0.45,
) -> RouteResult:
    spec = get_produce(produce_type)
    mandi_price = spec.mandi_price_per_kg if mandi_price_per_kg is None else mandi_price_per_kg
    if shelf_life_days <= 2:
        destination = "NGO_RESCUE"
        urgency = "CRITICAL"
        multiplier = 0.1
        action_window_hours = max(2, int(jround(shelf_life_days * 12)))
        rationale = "Below the two-day threshold this batch cannot survive a retail distance. Diverting to rescue channels recovers social value and avoids a full write-off."
    elif shelf_life_days <= 5:
        destination = "QUICK_COMMERCE"
        urgency = "HIGH"
        multiplier = 0.7
        action_window_hours = max(6, int(jround(shelf_life_days * 10)))
        rationale = "Three to five days of life suits 10-minute delivery, where stock turns within a day of arriving at the dark store."
    else:
        destination = "RETAIL_EXPORT"
        urgency = "NORMAL"
        multiplier = 1.0
        action_window_hours = 48
        rationale = "With six or more days remaining the batch tolerates full retail and export lead times at an unreduced rate."
    price = optimize_price(shelf_life_days, mandi_price, demand_score, multiplier)
    value_recovered = max(0, round((price.price_per_kg - mandi_price * 0.15) * weight_kg))
    return RouteResult(destination, DESTINATION_LABEL[destination], urgency, action_window_hours, price.price_per_kg, price, value_recovered, rationale)


def grade_of(score: float) -> str:
    return "A" if score > 70 else "B" if score > 40 else "C"


def condition_of(score: float) -> str:
    return "Fresh" if score > 70 else "Medium" if score > 40 else "Spoiling"


def co2_avoided(weight_kg: float) -> float:
    return jround(weight_kg * 2.5 / 1000, 1)


def route_to_dict(route: RouteResult) -> dict:
    data = asdict(route)
    data["price"] = asdict(route.price)
    return data
