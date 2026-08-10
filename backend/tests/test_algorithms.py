from datetime import date, timedelta

import pytest

from algorithms.produce import get_produce
from algorithms.routing import smart_route
from algorithms.shelf_life import calculate_shelf_life


def test_future_harvest_is_zero_elapsed():
    assert calculate_shelf_life("tomato", date.today() + timedelta(days=2), 15, 80, 100).days == 7.0


def test_freshness_bounds():
    assert calculate_shelf_life("tomato", date.today(), 15, 80, 100).days == 7.0
    assert calculate_shelf_life("tomato", date.today(), 15, 80, 0).days == 1.0


def test_unknown_produce_type():
    with pytest.raises(ValueError):
        get_produce("bad")


def test_no_penalties_below_thresholds():
    result = calculate_shelf_life("tomato", date.today(), 14, 76, 100)
    assert result.days == 7.0
    assert all("Temperature" not in f["label"] and "Humidity" not in f["label"] for f in result.factors)


def test_routing_boundaries():
    assert smart_route(2.0, 100, "tomato").urgency == "CRITICAL"
    assert smart_route(5.0, 100, "tomato").urgency == "HIGH"
    assert smart_route(5.1, 100, "tomato").urgency == "NORMAL"
