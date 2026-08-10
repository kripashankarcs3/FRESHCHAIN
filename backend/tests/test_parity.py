from datetime import date, timedelta

from algorithms.routing import smart_route
from algorithms.shelf_life import calculate_shelf_life


def test_parity_rows():
    rows = [
        ("tomato", 2, 16.0, 81, 74, 520, 3.5, "HIGH", "QUICK_COMMERCE", 18.57),
        ("mango", 2, 18.5, 84, 58, 340, 0.8, "CRITICAL", "NGO_RESCUE", 5.27),
        ("leafy_greens", 1, 17.0, 86, 54, 120, 1.5, "CRITICAL", "NGO_RESCUE", 2.05),
        ("banana", 1, 15.5, 80, 78, 610, 2.3, "HIGH", "QUICK_COMMERCE", 25.03),
        ("apple", 3, 8.0, 70, 92, 950, 10.3, "NORMAL", "RETAIL_EXPORT", 125.96),
        ("onion", 9, 16.0, 68, 90, 3100, 46.6, "NORMAL", "RETAIL_EXPORT", 34.16),
        ("potato", 6, 13.0, 76, 86, 2400, 21.1, "NORMAL", "RETAIL_EXPORT", 19.21),
        ("citrus", 7, 13.0, 75, 78, 540, 5.7, "NORMAL", "RETAIL_EXPORT", 61.91),
    ]
    for crop, ago, temp, rh, score, kg, days, urgency, destination, price in rows:
        shelf = calculate_shelf_life(crop, date.today() - timedelta(days=ago), temp, rh, score)
        route = smart_route(shelf.days, kg, crop)
        assert shelf.days == days
        assert route.urgency == urgency
        assert route.destination == destination
        assert route.suggested_price_per_kg == price


def test_reference_edges():
    assert calculate_shelf_life("tomato", date.today(), 14, 76, 100).days == 7.0
    assert calculate_shelf_life("tomato", date.today() - timedelta(days=40), 14, 76, 100).days == 0.0
    low = calculate_shelf_life("tomato", date.today(), 14, 76, 0)
    assert low.days <= 7 * 0.15
