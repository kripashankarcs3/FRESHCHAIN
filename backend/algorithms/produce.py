from dataclasses import dataclass


@dataclass(frozen=True)
class ProduceSpec:
    id: str
    label: str
    base_life_days: int
    mandi_price_per_kg: float
    temp_sensitivity: float


PRODUCE: dict[str, ProduceSpec] = {
    "tomato": ProduceSpec("tomato", "Tomato", 7, 28, 1.15),
    "mango": ProduceSpec("mango", "Mango", 5, 72, 1.30),
    "banana": ProduceSpec("banana", "Banana", 4, 42, 1.25),
    "apple": ProduceSpec("apple", "Apple", 14, 118, 0.60),
    "potato": ProduceSpec("potato", "Potato", 30, 18, 0.40),
    "onion": ProduceSpec("onion", "Onion", 60, 32, 0.30),
    "leafy_greens": ProduceSpec("leafy_greens", "Leafy Greens", 5, 26, 1.60),
    "citrus": ProduceSpec("citrus", "Citrus", 14, 58, 0.70),
}

FACILITIES: dict[str, list[str]] = {
    "NGO_RESCUE": [
        "Robin Hood Army — Ghaziabad Chapter",
        "Feeding India Kitchen, Vaishali",
        "Anna Kshetra Community Kitchen, Loni",
    ],
    "QUICK_COMMERCE": [
        "Dark Store — Indirapuram Hub",
        "Dark Store — Vasundhara Sector 9",
        "Dark Store — Noida Sector 62",
    ],
    "RETAIL_EXPORT": [
        "Retail DC — Azadpur Mandi",
        "Retail DC — Ghaziabad Wholesale",
        "Export Consolidation — IGI Cargo",
    ],
}

COLD_STORAGE_BLOCKS = ["Block A", "Block B", "Block C", "Block D"]


def get_produce(produce_type: str) -> ProduceSpec:
    try:
        return PRODUCE[produce_type]
    except KeyError as exc:
        raise ValueError(f"Unknown produce type: {produce_type}") from exc
