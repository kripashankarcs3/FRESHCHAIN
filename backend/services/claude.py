import os
from functools import lru_cache

import httpx
from anthropic import Anthropic, APIConnectionError, APITimeoutError, RateLimitError

from algorithms.produce import FACILITIES, PRODUCE, get_produce

SYSTEM_PROMPT = """You are a supply-chain advisor at a fresh-produce mandi in Ghaziabad, Uttar Pradesh.
You write for warehouse supervisors, in the Hindi-English mix they actually speak.

The routing decision has ALREADY been made by FreshChain's routing engine. You do not
question it, re-decide it, or suggest alternatives. You explain what to do about it.

Write exactly 2-3 sentences. State: where to send it, by when, at what rate, and what
happens if they wait. Use the numbers given — never invent a number. No preamble, no
bullet points, no markdown."""

_cache: dict[tuple[str, str, int], str] = {}


def format_inr(value: float) -> str:
    rounded = str(int(round(value)))
    if len(rounded) <= 3:
        return f"₹{rounded}"
    last = rounded[-3:]
    rest = rounded[:-3]
    groups = []
    while len(rest) > 2:
        groups.insert(0, rest[-2:])
        rest = rest[:-2]
    if rest:
        groups.insert(0, rest)
    return f"₹{','.join(groups + [last])}"


def fallback_recommendation(data) -> str:
    spec = get_produce(data.produce_type)
    total_value = format_inr(data.suggested_price * data.weight_kg)
    route_value = max(0, round((data.suggested_price - spec.mandi_price_per_kg * 0.15) * data.weight_kg))
    if data.destination == "NGO_RESCUE":
        return f"{data.weight_kg:g} kg {spec.label.lower()} ka shelf life sirf {data.shelf_life_days:g} din bacha hai — retail bhejoge toh raaste mein hi kharab ho jaayega. Aaj hi {data.facility} ko rescue channel pe do, agle {max(2, round(data.shelf_life_days * 12))} ghante ke andar pickup schedule karo. Rate {format_inr(data.suggested_price)}/kg, total {total_value} — poora write-off se {format_inr(route_value)} bach jaayega."
    if data.destination == "QUICK_COMMERCE":
        return f"{data.shelf_life_days:g} din ka life hai — quick commerce ke liye bilkul sahi window. {data.facility} ko aaj shaam tak dispatch karo, wahan stock ek din mein turn ho jaata hai. {format_inr(data.suggested_price)}/kg pe list karo (mandi se 30% neeche, par clearance guaranteed) — {data.weight_kg:g} kg ka {total_value}. {max(6, round(data.shelf_life_days * 10))} ghante se zyada rukoge toh rescue channel mein chala jaayega."
    return f"Batch strong hai — {data.shelf_life_days:g} din ka shelf life, full retail distance sambhal lega. {data.facility} ko normal lot ke saath bhejo, koi discount ki zaroorat nahi. Mandi rate {format_inr(data.suggested_price)}/kg pe {total_value} milega. Cold chain 15°C ke neeche rakho, warna {spec.label.lower()} ka life tezi se girta hai."


def _prompt(data) -> str:
    spec = get_produce(data.produce_type)
    total_value = format_inr(data.suggested_price * data.weight_kg)
    return f"Crop: {spec.label}\nWeight: {data.weight_kg:g} kg\nFreshness score: {data.freshness_score}/100\nShelf life: {data.shelf_life_days:g} days\nDestination: {data.destination}\nFacility: {data.facility}\nRate: {format_inr(data.suggested_price)}/kg\nTotal lot value: {total_value}"


def cached_recommendation(data) -> str | None:
    return _cache.get((data.produce_type, data.destination, round(data.shelf_life_days)))


def recommendation(data) -> tuple[str, str]:
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        return fallback_recommendation(data), "local"
    try:
        client = Anthropic(api_key=key, timeout=httpx.Timeout(4.0))
        try:
            response = client.messages.create(model="claude-sonnet-4-6", max_tokens=250, temperature=0.4, system=SYSTEM_PROMPT, messages=[{"role": "user", "content": _prompt(data)}])
        except APIConnectionError:
            response = client.messages.create(model="claude-sonnet-4-6", max_tokens=250, temperature=0.4, system=SYSTEM_PROMPT, messages=[{"role": "user", "content": _prompt(data)}])
        text = "".join(getattr(block, "text", "") for block in response.content).strip()
        if text:
            _cache[(data.produce_type, data.destination, round(data.shelf_life_days))] = text
            return text, "claude"
    except (APITimeoutError, APIConnectionError, RateLimitError, Exception):
        cached = cached_recommendation(data)
        if cached:
            return cached, "local"
    return fallback_recommendation(data), "local"


def prewarm_cache() -> int:
    from models.schemas import RecommendationRequest
    for produce_type in PRODUCE:
        for destination, facilities in FACILITIES.items():
            days = 1.0 if destination == "NGO_RESCUE" else 3.5 if destination == "QUICK_COMMERCE" else 7.0
            price = get_produce(produce_type).mandi_price_per_kg
            data = RecommendationRequest(produce_type=produce_type, weight_kg=500, freshness_score=75, shelf_life_days=days, destination=destination, suggested_price=price, facility=facilities[0])
            _cache[(produce_type, destination, round(days))] = fallback_recommendation(data)
    return len(_cache)
