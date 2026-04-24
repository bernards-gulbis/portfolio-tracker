"""
Unit tests for PriceService
"""

from datetime import UTC
from unittest.mock import Mock, patch

import pytest
import requests

from app.services.price_service import PriceService


class TestPriceService:
    """Test suite for PriceService"""

    def setup_method(self):
        """Clear the price cache before each test"""
        PriceService._price_cache.clear()

    def test_get_current_price_success(self):
        """Test successful price fetch for a single ticker"""
        # Mock the API response
        mock_response = Mock()
        mock_response.json.return_value = {
            "chart": {"result": [{"meta": {"regularMarketPrice": 150.25}}]}
        }
        mock_response.raise_for_status = Mock()

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ):
            price = PriceService.get_current_price("AAPL")

        assert price == pytest.approx(150.25)

    def test_get_current_price_missing_data(self):
        """Test price fetch when API returns incomplete data"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "chart": {
                "result": [
                    {
                        "meta": {}  # Missing regularMarketPrice
                    }
                ]
            }
        }
        mock_response.raise_for_status = Mock()

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ):
            price = PriceService.get_current_price("INVALID")

        assert price is None

    def test_get_current_price_empty_result(self):
        """Test price fetch when API returns empty result"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "chart": {
                "result": []  # Empty result
            }
        }
        mock_response.raise_for_status = Mock()

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ):
            price = PriceService.get_current_price("INVALID")

        assert price is None

    def test_get_current_price_network_error(self):
        """Test price fetch with network error"""
        with patch(
            "app.services.price_service.requests.get",
            side_effect=requests.exceptions.ConnectionError("Network error"),
        ):
            price = PriceService.get_current_price("AAPL")

        assert price is None

    def test_get_current_price_timeout(self):
        """Test price fetch with timeout"""
        with patch(
            "app.services.price_service.requests.get",
            side_effect=requests.exceptions.Timeout("Timeout"),
        ):
            price = PriceService.get_current_price("AAPL")

        assert price is None

    def test_get_current_price_http_error(self):
        """Test price fetch with HTTP error"""
        mock_response = Mock()
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError(
            "404 Not Found"
        )

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ):
            price = PriceService.get_current_price("INVALID")

        assert price is None

    def test_get_current_price_json_decode_error(self):
        """Test price fetch with JSON decode error"""
        mock_response = Mock()
        mock_response.json.side_effect = ValueError("Invalid JSON")
        mock_response.raise_for_status = Mock()

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ):
            price = PriceService.get_current_price("AAPL")

        assert price is None

    def test_get_current_prices_success_multiple(self):
        """Test successful price fetch for multiple tickers"""

        def mock_get_current_price(ticker):
            prices = {"AAPL": 150.25, "GOOGL": 2800.50, "MSFT": 320.00}
            return prices.get(ticker)

        with patch.object(
            PriceService, "get_current_price", side_effect=mock_get_current_price
        ):
            prices = PriceService.get_current_prices(["AAPL", "GOOGL", "MSFT"])

        assert prices == {"AAPL": 150.25, "GOOGL": 2800.50, "MSFT": 320.00}

    def test_get_current_prices_empty_list(self):
        """Test price fetch with empty ticker list"""
        prices = PriceService.get_current_prices([])
        assert prices == {}

    def test_get_current_prices_with_failures(self):
        """Test price fetch where some tickers fail"""

        def mock_get_current_price(ticker):
            if ticker == "AAPL":
                return 150.25
            elif ticker == "INVALID":
                raise Exception("API Error")
            else:
                return None

        with patch.object(
            PriceService, "get_current_price", side_effect=mock_get_current_price
        ):
            prices = PriceService.get_current_prices(["AAPL", "INVALID", "NOTFOUND"])

        assert prices["AAPL"] == pytest.approx(150.25)
        assert prices["INVALID"] is None
        assert prices["NOTFOUND"] is None

    def test_get_current_prices_parallel_execution(self):
        """Test that price fetches are executed in parallel"""
        call_count = {"count": 0}

        def mock_get_current_price(ticker):
            call_count["count"] += 1
            return 100.0 + call_count["count"]

        with patch.object(
            PriceService, "get_current_price", side_effect=mock_get_current_price
        ):
            prices = PriceService.get_current_prices(
                ["AAPL", "GOOGL", "MSFT", "TSLA", "AMZN"]
            )

        # All tickers should have been called
        assert len(prices) == 5
        assert all(
            ticker in prices for ticker in ["AAPL", "GOOGL", "MSFT", "TSLA", "AMZN"]
        )
        assert call_count["count"] == 5

    def test_get_current_prices_custom_max_workers(self):
        """Test price fetch with custom max_workers parameter"""

        def mock_get_current_price(ticker):
            return 100.0

        with patch.object(
            PriceService, "get_current_price", side_effect=mock_get_current_price
        ):
            prices = PriceService.get_current_prices(["AAPL", "GOOGL"], max_workers=2)

        assert len(prices) == 2
        assert prices["AAPL"] == pytest.approx(100.0)
        assert prices["GOOGL"] == pytest.approx(100.0)

    def test_get_current_price_api_request_format(self):
        """Test that API request is formatted correctly"""
        mock_response = Mock()
        mock_response.json.return_value = {
            "chart": {"result": [{"meta": {"regularMarketPrice": 150.25}}]}
        }
        mock_response.raise_for_status = Mock()

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ) as mock_get:
            PriceService.get_current_price("AAPL")

            # Verify the request was made with correct parameters
            mock_get.assert_called_once()
            call_args = mock_get.call_args

            # Check URL
            assert "AAPL" in call_args[0][0]
            assert "query1.finance.yahoo.com" in call_args[0][0]

            # Check headers
            assert "headers" in call_args[1]
            assert "User-Agent" in call_args[1]["headers"]

            # Check params
            assert "params" in call_args[1]
            assert call_args[1]["params"]["interval"] == "1d"
            assert call_args[1]["params"]["range"] == "1d"

            # Check timeout
            assert "timeout" in call_args[1]
            assert call_args[1]["timeout"] == 10


class TestPriceServiceCaching:
    """Tests for price caching behavior"""

    def setup_method(self):
        PriceService._price_cache.clear()

    def test_cache_hit_returns_cached_price(self):
        """Test that a recently cached price is returned without API call"""
        from datetime import datetime

        now = datetime.now(UTC)
        PriceService._price_cache["AAPL"] = (150.0, now)

        with patch("app.services.price_service.requests.get") as mock_get:
            price = PriceService.get_current_price("AAPL")

        mock_get.assert_not_called()
        assert price == pytest.approx(150.0)

    def test_cache_expired_fetches_new_price(self):
        """Test that an expired cache entry triggers a new API call"""
        from datetime import datetime, timedelta

        expired_time = (
            datetime.now(UTC) - PriceService._cache_ttl - timedelta(seconds=1)
        )
        PriceService._price_cache["AAPL"] = (100.0, expired_time)

        mock_response = Mock()
        mock_response.json.return_value = {
            "chart": {"result": [{"meta": {"regularMarketPrice": 200.0}}]}
        }
        mock_response.raise_for_status = Mock()

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ):
            price = PriceService.get_current_price("AAPL")

        assert price == pytest.approx(200.0)

    def test_cache_hit_returns_none_price(self):
        """Test that None is returned from cache when that was the cached value"""
        from datetime import datetime

        now = datetime.now(UTC)
        PriceService._price_cache["BAD"] = (None, now)

        with patch("app.services.price_service.requests.get") as mock_get:
            price = PriceService.get_current_price("BAD")

        mock_get.assert_not_called()
        assert price is None


class TestGetUsdToEurRate:
    """Tests for USD/EUR exchange rate fetching"""

    def setup_method(self):
        PriceService._price_cache.clear()

    def test_get_usd_to_eur_rate_success(self):
        """Test successful EUR/USD conversion"""
        with patch.object(PriceService, "get_current_price", return_value=1.10):
            rate = PriceService.get_usd_to_eur_rate()

        assert rate == pytest.approx(1.0 / 1.10)

    def test_get_usd_to_eur_rate_none_price(self):
        """Test when exchange rate price is None"""
        with patch.object(PriceService, "get_current_price", return_value=None):
            rate = PriceService.get_usd_to_eur_rate()

        assert rate is None

    def test_get_usd_to_eur_rate_zero_price(self):
        """Test when exchange rate price is zero (avoid division by zero)"""
        with patch.object(PriceService, "get_current_price", return_value=0.0):
            rate = PriceService.get_usd_to_eur_rate()

        assert rate is None

    def test_get_usd_to_eur_rate_safe_success(self):
        """Test safe wrapper returns rate on success"""
        with patch.object(PriceService, "get_usd_to_eur_rate", return_value=0.91):
            rate = PriceService.get_usd_to_eur_rate_safe()

        assert rate == pytest.approx(0.91)

    def test_get_usd_to_eur_rate_safe_network_error(self):
        """Test safe wrapper returns None on network error"""
        with patch.object(
            PriceService,
            "get_usd_to_eur_rate",
            side_effect=requests.exceptions.ConnectionError("fail"),
        ):
            rate = PriceService.get_usd_to_eur_rate_safe()

        assert rate is None

    def test_get_usd_to_eur_rate_safe_unexpected_error(self):
        """Test safe wrapper returns None on unexpected error"""
        with patch.object(
            PriceService,
            "get_usd_to_eur_rate",
            side_effect=RuntimeError("unexpected"),
        ):
            rate = PriceService.get_usd_to_eur_rate_safe()

        assert rate is None


class TestDetermineFetchRanges:
    """Tests for _determine_fetch_ranges logic"""

    def _dt(self, date_str):
        from datetime import datetime

        return datetime.strptime(date_str, "%Y-%m-%d")

    def _d(self, date_str):
        from datetime import date as d

        return d.fromisoformat(date_str)

    def test_no_cache_returns_full_range(self):
        start = self._dt("2025-01-01")
        end = self._dt("2025-01-31")
        yesterday = self._d("2025-02-01")

        ranges = PriceService._determine_fetch_ranges({}, start, end, yesterday)
        assert ranges == [(start, end)]

    def test_fully_cached_returns_empty(self):
        """When cached data covers the entire requested range"""
        start = self._dt("2025-01-10")
        end = self._dt("2025-01-20")
        yesterday = self._d("2025-01-25")
        cached = {"2025-01-10": 100.0, "2025-01-20": 110.0}

        ranges = PriceService._determine_fetch_ranges(cached, start, end, yesterday)
        assert ranges == []

    def test_gap_before_cached(self):
        """When start_date is before the earliest cached date"""
        start = self._dt("2025-01-01")
        end = self._dt("2025-01-15")
        yesterday = self._d("2025-01-20")
        cached = {"2025-01-10": 100.0, "2025-01-15": 105.0}

        ranges = PriceService._determine_fetch_ranges(cached, start, end, yesterday)
        assert len(ranges) == 1
        assert ranges[0][0] == start
        assert ranges[0][1].date() == self._d("2025-01-09")

    def test_gap_after_cached_before_yesterday(self):
        """When end_date extends past cached range but is before yesterday"""
        start = self._dt("2025-01-10")
        end = self._dt("2025-01-20")
        yesterday = self._d("2025-01-25")
        cached = {"2025-01-10": 100.0, "2025-01-15": 105.0}

        ranges = PriceService._determine_fetch_ranges(cached, start, end, yesterday)
        assert len(ranges) == 1
        assert ranges[0][0].date() == self._d("2025-01-16")

    def test_gap_after_cached_latest_is_yesterday(self):
        """When latest cached date is yesterday, no after-gap needed"""
        start = self._dt("2025-01-10")
        end = self._dt("2025-01-21")
        yesterday = self._d("2025-01-15")
        cached = {"2025-01-10": 100.0, "2025-01-15": 105.0}

        ranges = PriceService._determine_fetch_ranges(cached, start, end, yesterday)
        # latest_cached_date (Jan 15) >= yesterday (Jan 15) → no gap after
        assert ranges == []

    def test_gap_after_cached_extends_to_yesterday(self):
        """When end_date is past yesterday but cache doesn't reach yesterday"""
        start = self._dt("2025-01-10")
        end = self._dt("2025-01-25")
        yesterday = self._d("2025-01-20")
        cached = {"2025-01-10": 100.0, "2025-01-15": 105.0}

        ranges = PriceService._determine_fetch_ranges(cached, start, end, yesterday)
        assert len(ranges) == 1
        assert ranges[0][0].date() == self._d("2025-01-16")
        assert ranges[0][1].date() == yesterday


class TestFetchYahooRange:
    """Tests for _fetch_yahoo_range"""

    def test_successful_fetch(self):
        """Test parsing timestamps and close prices from Yahoo response"""
        from datetime import datetime

        ts1 = int(datetime(2025, 1, 10, tzinfo=UTC).timestamp())
        ts2 = int(datetime(2025, 1, 11, tzinfo=UTC).timestamp())

        mock_response = Mock()
        mock_response.json.return_value = {
            "chart": {
                "result": [
                    {
                        "timestamp": [ts1, ts2],
                        "indicators": {"quote": [{"close": [100.0, 105.5]}]},
                    }
                ]
            }
        }
        mock_response.raise_for_status = Mock()

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ):
            start = datetime(2025, 1, 10)
            end = datetime(2025, 1, 11)
            prices = PriceService._fetch_yahoo_range("AAPL", start, end)

        assert "2025-01-10" in prices
        assert "2025-01-11" in prices
        assert prices["2025-01-10"] == pytest.approx(100.0)
        assert prices["2025-01-11"] == pytest.approx(105.5)

    def test_empty_result(self):
        """Test when Yahoo returns empty result list"""
        from datetime import datetime

        mock_response = Mock()
        mock_response.json.return_value = {"chart": {"result": []}}
        mock_response.raise_for_status = Mock()

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ):
            prices = PriceService._fetch_yahoo_range(
                "AAPL", datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert prices == {}

    def test_none_close_values_skipped(self):
        """Test that None close values are skipped"""
        from datetime import datetime

        ts1 = int(datetime(2025, 1, 10, tzinfo=UTC).timestamp())
        ts2 = int(datetime(2025, 1, 11, tzinfo=UTC).timestamp())

        mock_response = Mock()
        mock_response.json.return_value = {
            "chart": {
                "result": [
                    {
                        "timestamp": [ts1, ts2],
                        "indicators": {"quote": [{"close": [100.0, None]}]},
                    }
                ]
            }
        }
        mock_response.raise_for_status = Mock()

        with patch(
            "app.services.price_service.requests.get", return_value=mock_response
        ):
            prices = PriceService._fetch_yahoo_range(
                "AAPL", datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert len(prices) == 1
        assert "2025-01-10" in prices


class TestFetchSingleRange:
    """Tests for _fetch_single_range"""

    def test_start_after_end_returns_empty(self):
        """Test that start > end returns empty dict"""
        from datetime import datetime

        prices = PriceService._fetch_single_range(
            "AAPL",
            datetime(2025, 1, 15),
            datetime(2025, 1, 10),
            datetime(2025, 1, 20).date(),
        )
        assert prices == {}

    def test_http_error_returns_empty(self):
        """Test that HTTP errors are handled gracefully"""
        from datetime import datetime

        resp_mock = Mock()
        resp_mock.status_code = 404
        http_err = requests.exceptions.HTTPError(response=resp_mock)

        with patch.object(PriceService, "_fetch_yahoo_range", side_effect=http_err):
            prices = PriceService._fetch_single_range(
                "AAPL",
                datetime(2025, 1, 10),
                datetime(2025, 1, 15),
                datetime(2025, 1, 20).date(),
            )

        assert prices == {}

    def test_generic_error_returns_empty(self):
        """Test that unexpected errors are handled gracefully"""
        from datetime import datetime

        with patch.object(
            PriceService, "_fetch_yahoo_range", side_effect=RuntimeError("boom")
        ):
            prices = PriceService._fetch_single_range(
                "AAPL",
                datetime(2025, 1, 10),
                datetime(2025, 1, 15),
                datetime(2025, 1, 20).date(),
            )

        assert prices == {}

    def test_saves_historical_prices(self):
        """Test that fetched prices before today are saved"""
        from datetime import date, datetime

        today = date(2025, 1, 20)
        fetched = {"2025-01-10": 100.0, "2025-01-20": 110.0}

        with (
            patch.object(PriceService, "_fetch_yahoo_range", return_value=fetched),
            patch.object(PriceService, "_save_historical_prices") as mock_save,
        ):
            prices = PriceService._fetch_single_range(
                "AAPL", datetime(2025, 1, 10), datetime(2025, 1, 15), today
            )

        assert prices == fetched
        # Only 2025-01-10 is before today (2025-01-20)
        mock_save.assert_called_once()
        saved = mock_save.call_args[0][1]
        assert "2025-01-10" in saved
        assert "2025-01-20" not in saved


class TestHistoricalCaching:
    """Tests for in-memory historical cache behavior"""

    def setup_method(self):
        PriceService._historical_cache.clear()

    def test_clear_session_cache(self):
        PriceService._historical_cache["key"] = {"2025-01-01": 100.0}
        PriceService.clear_session_cache()
        assert PriceService._historical_cache == {}

    def test_store_in_historical_cache(self):
        data = {"2025-01-01": 100.0}
        PriceService._store_in_historical_cache("key1", data)
        assert "key1" in PriceService._historical_cache
        assert PriceService._historical_cache["key1"] == data

    def test_store_in_historical_cache_fifo_eviction(self):
        """Test that oldest entry is evicted when cache is full"""
        original_max = PriceService._HISTORICAL_CACHE_MAX_SIZE
        PriceService._HISTORICAL_CACHE_MAX_SIZE = 3
        try:
            for i in range(3):
                PriceService._store_in_historical_cache(
                    f"key{i}", {f"date{i}": float(i)}
                )
            assert len(PriceService._historical_cache) == 3

            # Adding one more should evict key0
            PriceService._store_in_historical_cache("key3", {"date3": 3.0})
            assert len(PriceService._historical_cache) == 3
            assert "key0" not in PriceService._historical_cache
            assert "key3" in PriceService._historical_cache
        finally:
            PriceService._HISTORICAL_CACHE_MAX_SIZE = original_max

    def test_store_copies_data(self):
        """Test that stored data is a copy, not a reference"""
        data = {"2025-01-01": 100.0}
        PriceService._store_in_historical_cache("key1", data)
        data["2025-01-02"] = 200.0
        assert "2025-01-02" not in PriceService._historical_cache["key1"]


class TestGetHistoricalPrices:
    """Tests for get_historical_prices"""

    def setup_method(self):
        PriceService._historical_cache.clear()

    def test_start_date_after_end_date_raises(self):
        from datetime import datetime

        with pytest.raises(ValueError, match="start_date"):
            PriceService.get_historical_prices(
                "AAPL", datetime(2025, 2, 1), datetime(2025, 1, 1)
            )

    def test_in_memory_cache_hit(self):
        from datetime import datetime

        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 31)
        cache_key = f"AAPL:{start.date()}:{end.date()}"
        PriceService._historical_cache[cache_key] = {"2025-01-10": 100.0}

        with patch.object(PriceService, "_get_cached_historical_prices") as mock_db:
            result = PriceService.get_historical_prices("AAPL", start, end)

        mock_db.assert_not_called()
        assert result == {"2025-01-10": 100.0}

    def test_in_memory_cache_hit_returns_copy(self):
        """Ensure returned dict is a copy so caller mutations don't pollute cache"""
        from datetime import datetime

        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 31)
        cache_key = f"AAPL:{start.date()}:{end.date()}"
        PriceService._historical_cache[cache_key] = {"2025-01-10": 100.0}

        result = PriceService.get_historical_prices("AAPL", start, end)
        result["2025-01-11"] = 200.0
        assert "2025-01-11" not in PriceService._historical_cache[cache_key]

    def test_no_ranges_to_fetch(self):
        """When DB cache fully covers the range, no API call is made"""
        from datetime import datetime

        start = datetime(2025, 1, 10)
        end = datetime(2025, 1, 15)
        db_prices = {"2025-01-10": 100.0, "2025-01-15": 105.0}

        with (
            patch.object(
                PriceService, "_get_cached_historical_prices", return_value=db_prices
            ),
            patch.object(PriceService, "_determine_fetch_ranges", return_value=[]),
            patch.object(PriceService, "_fetch_single_range") as mock_fetch,
        ):
            result = PriceService.get_historical_prices("AAPL", start, end)

        mock_fetch.assert_not_called()
        assert result == db_prices

    def test_fetches_missing_ranges(self):
        """When there are ranges to fetch, _fetch_single_range is called"""
        from datetime import datetime

        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 31)

        with (
            patch.object(
                PriceService, "_get_cached_historical_prices", return_value={}
            ),
            patch.object(
                PriceService, "_determine_fetch_ranges", return_value=[(start, end)]
            ),
            patch.object(
                PriceService, "_fetch_single_range", return_value={"2025-01-10": 100.0}
            ),
        ):
            result = PriceService.get_historical_prices("AAPL", start, end)

        assert "2025-01-10" in result


class TestGetHistoricalUsdToEurRates:
    """Tests for get_historical_usd_to_eur_rates"""

    def setup_method(self):
        PriceService._historical_cache.clear()

    def test_converts_eur_usd_to_usd_eur(self):
        from datetime import datetime

        eur_usd = {"2025-01-10": 1.10, "2025-01-11": 1.05}

        with patch.object(PriceService, "get_historical_prices", return_value=eur_usd):
            rates = PriceService.get_historical_usd_to_eur_rates(
                datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert rates["2025-01-10"] == pytest.approx(1.0 / 1.10)
        assert rates["2025-01-11"] == pytest.approx(1.0 / 1.05)

    def test_skips_zero_rates(self):
        from datetime import datetime

        eur_usd = {"2025-01-10": 0.0, "2025-01-11": 1.05}

        with patch.object(PriceService, "get_historical_prices", return_value=eur_usd):
            rates = PriceService.get_historical_usd_to_eur_rates(
                datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert "2025-01-10" not in rates
        assert "2025-01-11" in rates

    def test_handles_decimal_values_from_db_cache(self):
        """After S1, HistoricalPrice.price is Decimal. The inversion must not
        crash with ``TypeError: unsupported operand type(s) for /: 'float' and
        'decimal.Decimal'`` when values come back as Decimal from the cache."""
        from datetime import datetime
        from decimal import Decimal

        eur_usd = {"2025-01-10": Decimal("1.10"), "2025-01-11": Decimal("1.05")}

        with patch.object(PriceService, "get_historical_prices", return_value=eur_usd):
            rates = PriceService.get_historical_usd_to_eur_rates(
                datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert rates["2025-01-10"] == pytest.approx(1.0 / 1.10)
        assert rates["2025-01-11"] == pytest.approx(1.0 / 1.05)


class TestGetHistoricalPricesForMultipleTickers:
    """Tests for get_historical_prices_for_multiple_tickers"""

    def setup_method(self):
        PriceService._historical_cache.clear()

    def test_empty_tickers(self):
        from datetime import datetime

        result = PriceService.get_historical_prices_for_multiple_tickers(
            [], datetime(2025, 1, 1), datetime(2025, 1, 31)
        )
        assert result == {}

    def test_multiple_tickers(self):
        from datetime import datetime

        def mock_hist(ticker, start, end):
            return {"2025-01-10": 100.0 if ticker == "AAPL" else 200.0}

        with patch.object(PriceService, "get_historical_prices", side_effect=mock_hist):
            result = PriceService.get_historical_prices_for_multiple_tickers(
                ["AAPL", "GOOGL"], datetime(2025, 1, 1), datetime(2025, 1, 31)
            )

        assert result["AAPL"] == {"2025-01-10": 100.0}
        assert result["GOOGL"] == {"2025-01-10": 200.0}

    def test_per_ticker_start_skips_when_after_end(self):
        """When per_ticker_start >= end_date, ticker gets empty dict without API call"""
        from datetime import datetime

        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 15)
        per_ticker = {"NEW_IPO": datetime(2025, 2, 1)}

        with patch.object(PriceService, "get_historical_prices") as mock_hist:
            result = PriceService.get_historical_prices_for_multiple_tickers(
                ["NEW_IPO"], start, end, per_ticker_start=per_ticker
            )

        mock_hist.assert_not_called()
        assert result["NEW_IPO"] == {}

    def test_per_ticker_start_uses_later_date(self):
        """Per-ticker start is used when it's after the default start"""
        from datetime import datetime

        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 31)
        per_ticker = {"AAPL": datetime(2025, 1, 15)}

        with patch.object(
            PriceService, "get_historical_prices", return_value={}
        ) as mock_hist:
            PriceService.get_historical_prices_for_multiple_tickers(
                ["AAPL"], start, end, per_ticker_start=per_ticker
            )

        mock_hist.assert_called_once_with("AAPL", datetime(2025, 1, 15), end)

    def test_exception_in_one_ticker_doesnt_break_others(self):
        from datetime import datetime

        def mock_hist(ticker, start, end):
            if ticker == "BAD":
                raise RuntimeError("fail")
            return {"2025-01-10": 100.0}

        with patch.object(PriceService, "get_historical_prices", side_effect=mock_hist):
            result = PriceService.get_historical_prices_for_multiple_tickers(
                ["AAPL", "BAD"], datetime(2025, 1, 1), datetime(2025, 1, 31)
            )

        assert result["AAPL"] == {"2025-01-10": 100.0}
        assert result["BAD"] == {}

    def test_ensures_all_tickers_in_result(self):
        """Every requested ticker must appear in the result dict"""
        from datetime import datetime

        with patch.object(PriceService, "get_historical_prices", return_value={}):
            result = PriceService.get_historical_prices_for_multiple_tickers(
                ["AAPL", "GOOGL", "MSFT"], datetime(2025, 1, 1), datetime(2025, 1, 31)
            )

        assert set(result.keys()) == {"AAPL", "GOOGL", "MSFT"}


class TestBulkUpsert:
    """Tests for _bulk_upsert error handling"""

    def test_empty_values_returns_immediately(self):
        """Empty values list should return without any DB call"""
        with patch("app.services.price_service.Session") as mock_session:
            PriceService._bulk_upsert(Mock(), [], ["id"], ["value"], "test")
        # Session should never be created
        mock_session.assert_not_called()


class TestCachedHistoricalPricesFloatCoercion:
    """Regression guard for the ``1.0 / Decimal`` TypeError that broke the
    performance chart: ``HistoricalPrice.price`` and ``FxRate.usd_to_eur_rate``
    are ``Decimal`` columns, but the service's public return type is
    ``dict[str, float]``. The cache-read helpers must coerce at the boundary
    so downstream ``float / rate`` and ``1.0 / rate`` arithmetic doesn't
    blow up. A second request after the cache populates would otherwise 500.
    """

    def test_get_cached_historical_prices_returns_float(self):
        from datetime import datetime as _dt
        from decimal import Decimal

        from sqlmodel import Session, SQLModel, create_engine
        from sqlmodel.pool import StaticPool

        from app.models import HistoricalPrice

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            session.add(
                HistoricalPrice(
                    ticker="AAPL",
                    date="2026-04-10",
                    price=Decimal("150.25"),
                    created_at=_dt.now(UTC),
                )
            )
            session.commit()
            result = PriceService._get_cached_historical_prices(
                "AAPL", _dt(2026, 4, 1), _dt(2026, 4, 30), session=session
            )

        assert "2026-04-10" in result
        assert isinstance(result["2026-04-10"], float)
        assert result["2026-04-10"] == pytest.approx(150.25)

    def test_get_cached_fx_rates_returns_float(self):
        from datetime import datetime as _dt
        from decimal import Decimal

        from sqlmodel import Session, SQLModel, create_engine
        from sqlmodel.pool import StaticPool

        from app.models.historical_price import FxRate

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            session.add(
                FxRate(
                    date="2026-04-10",
                    usd_to_eur_rate=Decimal("0.920000"),
                    created_at=_dt.now(UTC),
                )
            )
            session.commit()
            result = PriceService._get_cached_fx_rates(
                _dt(2026, 4, 1), _dt(2026, 4, 30), session=session
            )

        assert "2026-04-10" in result
        assert isinstance(result["2026-04-10"], float)
        assert result["2026-04-10"] == pytest.approx(0.92)

    def test_calculate_performance_survives_decimal_db_cache(self):
        """End-to-end guard: with only the DB cache populated (no fresh Yahoo
        fetch), ``calculate_performance`` must not raise on the EURUSD=X
        inversion at ``portfolio_perf.py::_prepare_perf_data``."""
        from datetime import datetime as _dt
        from decimal import Decimal

        from sqlmodel import Session, SQLModel, create_engine
        from sqlmodel.pool import StaticPool

        from app.models import HistoricalPrice, Transaction, TransactionType
        from app.services import price_service as ps_mod
        from app.services.portfolio_perf import calculate_performance

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            # Seed enough history to cover the window without any Yahoo fetch.
            for day in range(1, 20):
                session.add(
                    HistoricalPrice(
                        ticker="AAPL",
                        date=f"2026-04-{day:02d}",
                        price=Decimal("150.00"),
                        created_at=_dt.now(UTC),
                    )
                )
                session.add(
                    HistoricalPrice(
                        ticker="EURUSD=X",
                        date=f"2026-04-{day:02d}",
                        price=Decimal("1.100000"),
                        created_at=_dt.now(UTC),
                    )
                )
            session.commit()

        tx = [
            Transaction(
                id=1,
                portfolio_id=1,
                date=_dt(2026, 4, 2, 10, 0, 0),
                type=TransactionType.DEPOSIT,
                total_amount=Decimal("1000"),
            ),
            Transaction(
                id=2,
                portfolio_id=1,
                date=_dt(2026, 4, 3, 10, 0, 0),
                type=TransactionType.BUY,
                ticker="AAPL",
                quantity=Decimal("5"),
                price_per_share=Decimal("150"),
                total_amount=Decimal("-750"),
            ),
        ]

        PriceService.clear_session_cache()
        # Avoid any outgoing network call; the seeded cache covers the range.
        with (
            patch.object(ps_mod, "engine", engine),
            patch.object(
                PriceService,
                "_determine_fetch_ranges",
                return_value=[],
            ),
        ):
            data_points, _ = calculate_performance(
                tx,
                _dt(2026, 4, 2),
                _dt(2026, 4, 15),
                num_points=5,
            )

        assert len(data_points) == 5
        assert data_points[-1]["current_value"] is not None
        assert data_points[-1]["fx_rate"] == pytest.approx(1.0 / 1.10)


class TestGetLastKnownPriceWithDate:
    """Direct tests for get_last_known_price_with_date.

    The router's S4 path uses this to populate the last_known fallback on
    the live-prices endpoint — a silent None→crash here means every stale
    badge fails.
    """

    def test_returns_none_when_ticker_not_in_cache(self):
        from sqlmodel import Session, SQLModel, create_engine
        from sqlmodel.pool import StaticPool

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            result = PriceService.get_last_known_price_with_date("UNKNOWN", session)
        assert result is None

    def test_returns_most_recent_date_tuple(self):
        from datetime import datetime as _dt
        from decimal import Decimal

        from sqlmodel import Session, SQLModel, create_engine
        from sqlmodel.pool import StaticPool

        from app.models import HistoricalPrice

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            session.add(
                HistoricalPrice(
                    ticker="AAPL",
                    date="2026-04-10",
                    price=Decimal("150.25"),
                    created_at=_dt.now(UTC),
                )
            )
            session.add(
                HistoricalPrice(
                    ticker="AAPL",
                    date="2026-04-11",
                    price=Decimal("152.00"),
                    created_at=_dt.now(UTC),
                )
            )
            session.commit()
            result = PriceService.get_last_known_price_with_date("AAPL", session)
        assert result is not None
        price, date_str = result
        assert price == pytest.approx(152.00)
        assert date_str == "2026-04-11"
