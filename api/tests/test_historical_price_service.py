"""Unit tests for HistoricalPriceService."""

from datetime import UTC, date, datetime
from unittest.mock import MagicMock, Mock, patch

import pytest
import requests

from app.services.prices.historical_price_service import HistoricalPriceService


def _dt(date_str: str) -> datetime:
    return datetime.strptime(date_str, "%Y-%m-%d")


def _d(date_str: str) -> date:
    return date.fromisoformat(date_str)


class TestSubtractIntervals:
    """Pure interval-math: target minus union(covered)."""

    def test_no_coverage_returns_full_target(self):
        target = (_d("2025-01-01"), _d("2025-01-15"))
        assert HistoricalPriceService._subtract_intervals(target, []) == [target]

    def test_full_coverage_returns_empty(self):
        target = (_d("2025-01-10"), _d("2025-01-20"))
        covered = [(_d("2025-01-01"), _d("2025-01-31"))]
        assert HistoricalPriceService._subtract_intervals(target, covered) == []

    def test_disjoint_inner_gap(self):
        # The reviewer's exact scenario.
        target = (_d("2025-01-01"), _d("2025-01-15"))
        covered = [
            (_d("2025-01-01"), _d("2025-01-05")),
            (_d("2025-01-10"), _d("2025-01-15")),
        ]
        assert HistoricalPriceService._subtract_intervals(target, covered) == [
            (_d("2025-01-06"), _d("2025-01-09"))
        ]

    def test_coverage_strictly_before_target(self):
        target = (_d("2025-02-01"), _d("2025-02-10"))
        covered = [(_d("2025-01-01"), _d("2025-01-15"))]
        assert HistoricalPriceService._subtract_intervals(target, covered) == [target]

    def test_coverage_extending_beyond_target(self):
        target = (_d("2025-01-05"), _d("2025-01-25"))
        covered = [(_d("2025-01-01"), _d("2025-01-10"))]
        assert HistoricalPriceService._subtract_intervals(target, covered) == [
            (_d("2025-01-11"), _d("2025-01-25"))
        ]

    def test_adjacent_coverage_treated_as_contiguous(self):
        # [1-5] + [6-10] should leave no gap between them.
        target = (_d("2025-01-01"), _d("2025-01-15"))
        covered = [
            (_d("2025-01-01"), _d("2025-01-05")),
            (_d("2025-01-06"), _d("2025-01-10")),
        ]
        assert HistoricalPriceService._subtract_intervals(target, covered) == [
            (_d("2025-01-11"), _d("2025-01-15"))
        ]

    def test_unsorted_input_handled(self):
        target = (_d("2025-01-01"), _d("2025-01-31"))
        covered = [
            (_d("2025-01-20"), _d("2025-01-25")),
            (_d("2025-01-05"), _d("2025-01-10")),
        ]
        gaps = HistoricalPriceService._subtract_intervals(target, covered)
        assert gaps == [
            (_d("2025-01-01"), _d("2025-01-04")),
            (_d("2025-01-11"), _d("2025-01-19")),
            (_d("2025-01-26"), _d("2025-01-31")),
        ]

    def test_overlapping_coverage_intervals(self):
        target = (_d("2025-01-01"), _d("2025-01-31"))
        covered = [
            (_d("2025-01-05"), _d("2025-01-15")),
            (_d("2025-01-10"), _d("2025-01-20")),
        ]
        gaps = HistoricalPriceService._subtract_intervals(target, covered)
        assert gaps == [
            (_d("2025-01-01"), _d("2025-01-04")),
            (_d("2025-01-21"), _d("2025-01-31")),
        ]

    def test_invalid_target_returns_empty(self):
        # start > end is treated as an empty target.
        target = (_d("2025-02-01"), _d("2025-01-01"))
        assert HistoricalPriceService._subtract_intervals(target, []) == []


class TestDetermineFetchRanges:
    """Tests for the coverage-table-driven _determine_fetch_ranges."""

    def test_no_coverage_returns_full_range(self):
        start = _dt("2025-01-01")
        end = _dt("2025-01-31")
        yesterday = _d("2025-02-01")

        with patch.object(HistoricalPriceService, "_load_coverage", return_value=[]):
            ranges = HistoricalPriceService._determine_fetch_ranges(
                "AAPL", start, end, yesterday
            )

        assert len(ranges) == 1
        assert ranges[0][0].date() == _d("2025-01-01")
        assert ranges[0][1].date() == _d("2025-01-31")

    def test_full_coverage_returns_empty(self):
        start = _dt("2025-01-10")
        end = _dt("2025-01-20")
        yesterday = _d("2025-01-25")

        with patch.object(
            HistoricalPriceService,
            "_load_coverage",
            return_value=[(_d("2025-01-01"), _d("2025-01-31"))],
        ):
            ranges = HistoricalPriceService._determine_fetch_ranges(
                "AAPL", start, end, yesterday
            )

        assert ranges == []

    def test_disjoint_coverage_fetches_inner_gap(self):
        # Reviewer's scenario: prior fetches left a hole in the middle.
        start = _dt("2025-01-01")
        end = _dt("2025-01-15")
        yesterday = _d("2025-01-31")
        coverage = [
            (_d("2025-01-01"), _d("2025-01-05")),
            (_d("2025-01-10"), _d("2025-01-15")),
        ]

        with patch.object(
            HistoricalPriceService, "_load_coverage", return_value=coverage
        ):
            ranges = HistoricalPriceService._determine_fetch_ranges(
                "AAPL", start, end, yesterday
            )

        assert len(ranges) == 1
        assert ranges[0][0].date() == _d("2025-01-06")
        assert ranges[0][1].date() == _d("2025-01-09")

    def test_end_date_after_yesterday_capped(self):
        start = _dt("2025-01-10")
        end = _dt("2025-01-25")
        yesterday = _d("2025-01-20")

        with patch.object(HistoricalPriceService, "_load_coverage", return_value=[]):
            ranges = HistoricalPriceService._determine_fetch_ranges(
                "AAPL", start, end, yesterday
            )

        assert len(ranges) == 1
        assert ranges[0][1].date() == yesterday

    def test_start_after_yesterday_returns_empty(self):
        # Whole window is in the future relative to historical-data cutoff.
        start = _dt("2025-01-25")
        end = _dt("2025-01-30")
        yesterday = _d("2025-01-20")

        ranges = HistoricalPriceService._determine_fetch_ranges(
            "AAPL", start, end, yesterday
        )
        assert ranges == []

    def test_gap_before_partial_coverage(self):
        start = _dt("2025-01-01")
        end = _dt("2025-01-15")
        yesterday = _d("2025-01-31")
        coverage = [(_d("2025-01-10"), _d("2025-01-15"))]

        with patch.object(
            HistoricalPriceService, "_load_coverage", return_value=coverage
        ):
            ranges = HistoricalPriceService._determine_fetch_ranges(
                "AAPL", start, end, yesterday
            )

        assert len(ranges) == 1
        assert ranges[0][0].date() == _d("2025-01-01")
        assert ranges[0][1].date() == _d("2025-01-09")


class TestFetchYahooRange:
    """Tests for _fetch_yahoo_range (parses Yahoo's chart-range payload)."""

    def test_successful_fetch(self):
        ts1 = int(datetime(2025, 1, 10, tzinfo=UTC).timestamp())
        ts2 = int(datetime(2025, 1, 11, tzinfo=UTC).timestamp())

        resp = Mock()
        resp.status_code = 200
        resp.json.return_value = {
            "chart": {
                "result": [
                    {
                        "timestamp": [ts1, ts2],
                        "indicators": {"quote": [{"close": [100.0, 105.5]}]},
                    }
                ]
            }
        }
        resp.raise_for_status = Mock()

        with patch(
            "app.services.prices.yahoo_finance_client.requests.get", return_value=resp
        ):
            prices = HistoricalPriceService._fetch_yahoo_range(
                "AAPL", datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert prices["2025-01-10"] == pytest.approx(100.0)
        assert prices["2025-01-11"] == pytest.approx(105.5)

    def test_empty_result(self):
        resp = Mock()
        resp.status_code = 200
        resp.json.return_value = {"chart": {"result": []}}
        resp.raise_for_status = Mock()

        with patch(
            "app.services.prices.yahoo_finance_client.requests.get", return_value=resp
        ):
            prices = HistoricalPriceService._fetch_yahoo_range(
                "AAPL", datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert prices == {}

    def test_none_close_values_skipped(self):
        ts1 = int(datetime(2025, 1, 10, tzinfo=UTC).timestamp())
        ts2 = int(datetime(2025, 1, 11, tzinfo=UTC).timestamp())

        resp = Mock()
        resp.status_code = 200
        resp.json.return_value = {
            "chart": {
                "result": [
                    {
                        "timestamp": [ts1, ts2],
                        "indicators": {"quote": [{"close": [100.0, None]}]},
                    }
                ]
            }
        }
        resp.raise_for_status = Mock()

        with patch(
            "app.services.prices.yahoo_finance_client.requests.get", return_value=resp
        ):
            prices = HistoricalPriceService._fetch_yahoo_range(
                "AAPL", datetime(2025, 1, 10), datetime(2025, 1, 11)
            )

        assert len(prices) == 1
        assert "2025-01-10" in prices


class TestFetchSingleRange:
    """Tests for _fetch_single_range (fetch + persist + error handling)."""

    def test_start_after_end_returns_empty(self):
        prices = HistoricalPriceService._fetch_single_range(
            "AAPL",
            datetime(2025, 1, 15),
            datetime(2025, 1, 10),
            datetime(2025, 1, 20).date(),
        )
        assert prices == {}

    def test_http_error_returns_empty(self):
        resp_mock = Mock()
        resp_mock.status_code = 404
        http_err = requests.exceptions.HTTPError(response=resp_mock)

        with (
            patch.object(
                HistoricalPriceService, "_fetch_yahoo_range", side_effect=http_err
            ),
            patch.object(HistoricalPriceService, "_record_coverage") as mock_cov,
        ):
            prices = HistoricalPriceService._fetch_single_range(
                "AAPL",
                datetime(2025, 1, 10),
                datetime(2025, 1, 15),
                datetime(2025, 1, 20).date(),
            )

        assert prices == {}
        mock_cov.assert_not_called()

    def test_generic_error_returns_empty(self):
        with (
            patch.object(
                HistoricalPriceService,
                "_fetch_yahoo_range",
                side_effect=RuntimeError("boom"),
            ),
            patch.object(HistoricalPriceService, "_record_coverage") as mock_cov,
        ):
            prices = HistoricalPriceService._fetch_single_range(
                "AAPL",
                datetime(2025, 1, 10),
                datetime(2025, 1, 15),
                datetime(2025, 1, 20).date(),
            )

        assert prices == {}
        mock_cov.assert_not_called()

    def test_saves_historical_prices(self):
        today = _d("2025-01-20")
        fetched = {"2025-01-10": 100.0, "2025-01-20": 110.0}

        with (
            patch.object(
                HistoricalPriceService, "_fetch_yahoo_range", return_value=fetched
            ),
            patch.object(
                HistoricalPriceService,
                "_save_historical_prices",
                return_value=True,
            ) as mock_save,
            patch.object(HistoricalPriceService, "_record_coverage") as mock_cov,
        ):
            prices = HistoricalPriceService._fetch_single_range(
                "AAPL", datetime(2025, 1, 10), datetime(2025, 1, 15), today
            )

        assert prices == fetched
        mock_save.assert_called_once()
        saved = mock_save.call_args.args[1]
        assert "2025-01-10" in saved
        assert "2025-01-20" not in saved
        # Coverage is recorded for the fetch range, capped at yesterday.
        mock_cov.assert_called_once_with("AAPL", _d("2025-01-10"), _d("2025-01-15"))

    def test_skips_coverage_when_save_fails(self):
        # If the price upsert silently fails, we must NOT record coverage —
        # otherwise the next request trusts a "covered" range that has no
        # rows and never refetches.
        today = _d("2025-01-20")
        fetched = {"2025-01-10": 100.0}

        with (
            patch.object(
                HistoricalPriceService, "_fetch_yahoo_range", return_value=fetched
            ),
            patch.object(
                HistoricalPriceService,
                "_save_historical_prices",
                return_value=False,
            ),
            patch.object(HistoricalPriceService, "_record_coverage") as mock_cov,
        ):
            HistoricalPriceService._fetch_single_range(
                "AAPL", datetime(2025, 1, 10), datetime(2025, 1, 15), today
            )

        mock_cov.assert_not_called()

    def test_records_coverage_even_when_yahoo_returns_empty(self):
        # A successful fetch with zero rows (e.g. a weekend-only range) is
        # still proof of coverage — without recording it, we'd refetch
        # forever.
        today = _d("2025-01-20")
        with (
            patch.object(HistoricalPriceService, "_fetch_yahoo_range", return_value={}),
            patch.object(HistoricalPriceService, "_record_coverage") as mock_cov,
        ):
            prices = HistoricalPriceService._fetch_single_range(
                "AAPL", datetime(2025, 1, 11), datetime(2025, 1, 12), today
            )

        assert prices == {}
        mock_cov.assert_called_once_with("AAPL", _d("2025-01-11"), _d("2025-01-12"))

    def test_coverage_capped_at_yesterday(self):
        # Fetch range ends today, but coverage stops at yesterday because
        # today's price isn't final.
        today = _d("2025-01-20")
        fetched = {"2025-01-19": 100.0}

        with (
            patch.object(
                HistoricalPriceService, "_fetch_yahoo_range", return_value=fetched
            ),
            patch.object(
                HistoricalPriceService,
                "_save_historical_prices",
                return_value=True,
            ),
            patch.object(HistoricalPriceService, "_record_coverage") as mock_cov,
        ):
            HistoricalPriceService._fetch_single_range(
                "AAPL", datetime(2025, 1, 18), datetime(2025, 1, 20), today
            )

        mock_cov.assert_called_once_with("AAPL", _d("2025-01-18"), _d("2025-01-19"))


class TestHistoricalCaching:
    """Tests for the in-memory historical cache."""

    def setup_method(self):
        HistoricalPriceService._historical_cache.clear()

    def test_clear_session_cache(self):
        HistoricalPriceService._historical_cache["key"] = {"2025-01-01": 100.0}
        HistoricalPriceService.clear_session_cache()
        assert HistoricalPriceService._historical_cache == {}

    def test_store_in_historical_cache(self):
        data = {"2025-01-01": 100.0}
        HistoricalPriceService._store_in_historical_cache("key1", data)
        assert HistoricalPriceService._historical_cache["key1"] == data

    def test_store_in_historical_cache_fifo_eviction(self):
        original_max = HistoricalPriceService._HISTORICAL_CACHE_MAX_SIZE
        HistoricalPriceService._HISTORICAL_CACHE_MAX_SIZE = 3
        try:
            for i in range(3):
                HistoricalPriceService._store_in_historical_cache(
                    f"key{i}", {f"date{i}": float(i)}
                )
            assert len(HistoricalPriceService._historical_cache) == 3

            HistoricalPriceService._store_in_historical_cache("key3", {"date3": 3.0})
            assert len(HistoricalPriceService._historical_cache) == 3
            assert "key0" not in HistoricalPriceService._historical_cache
            assert "key3" in HistoricalPriceService._historical_cache
        finally:
            HistoricalPriceService._HISTORICAL_CACHE_MAX_SIZE = original_max

    def test_store_copies_data(self):
        data = {"2025-01-01": 100.0}
        HistoricalPriceService._store_in_historical_cache("key1", data)
        data["2025-01-02"] = 200.0
        assert "2025-01-02" not in HistoricalPriceService._historical_cache["key1"]


class TestGetHistoricalPrices:
    """Tests for the public get_historical_prices entry point."""

    def setup_method(self):
        HistoricalPriceService._historical_cache.clear()

    def test_start_date_after_end_date_raises(self):
        with pytest.raises(ValueError, match="start_date"):
            HistoricalPriceService.get_historical_prices(
                "AAPL", datetime(2025, 2, 1), datetime(2025, 1, 1)
            )

    def test_in_memory_cache_hit(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 31)
        cache_key = f"AAPL:{start.date()}:{end.date()}"
        HistoricalPriceService._historical_cache[cache_key] = {"2025-01-10": 100.0}

        with patch.object(
            HistoricalPriceService, "_get_cached_historical_prices"
        ) as mock_db:
            result = HistoricalPriceService.get_historical_prices("AAPL", start, end)

        mock_db.assert_not_called()
        assert result == {"2025-01-10": 100.0}

    def test_in_memory_cache_hit_returns_copy(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 31)
        cache_key = f"AAPL:{start.date()}:{end.date()}"
        HistoricalPriceService._historical_cache[cache_key] = {"2025-01-10": 100.0}

        result = HistoricalPriceService.get_historical_prices("AAPL", start, end)
        result["2025-01-11"] = 200.0
        assert "2025-01-11" not in HistoricalPriceService._historical_cache[cache_key]

    def test_no_ranges_to_fetch(self):
        start = datetime(2025, 1, 10)
        end = datetime(2025, 1, 15)
        db_prices = {"2025-01-10": 100.0, "2025-01-15": 105.0}

        with (
            patch.object(
                HistoricalPriceService,
                "_get_cached_historical_prices",
                return_value=db_prices,
            ),
            patch.object(
                HistoricalPriceService, "_determine_fetch_ranges", return_value=[]
            ),
            patch.object(HistoricalPriceService, "_fetch_single_range") as mock_fetch,
        ):
            result = HistoricalPriceService.get_historical_prices("AAPL", start, end)

        mock_fetch.assert_not_called()
        assert result == db_prices

    def test_fetches_missing_ranges(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 31)

        with (
            patch.object(
                HistoricalPriceService,
                "_get_cached_historical_prices",
                return_value={},
            ),
            patch.object(
                HistoricalPriceService,
                "_determine_fetch_ranges",
                return_value=[(start, end)],
            ),
            patch.object(
                HistoricalPriceService,
                "_fetch_single_range",
                return_value={"2025-01-10": 100.0},
            ),
        ):
            result = HistoricalPriceService.get_historical_prices("AAPL", start, end)

        assert "2025-01-10" in result


class TestDisjointCoverageEndToEnd:
    """End-to-end guard for the bug the coverage table fixes.

    Two prior disjoint fetches must not let a wider follow-up request skip
    the gap between them. Uses a real SQLite DB so the coverage write/read
    path is exercised.
    """

    def setup_method(self):
        HistoricalPriceService._historical_cache.clear()

    def test_wide_request_after_two_disjoint_fetches_fills_gap(self, tmp_path):
        from decimal import Decimal

        from sqlmodel import Session, SQLModel, create_engine, select

        from app.models import HistoricalPrice, HistoricalPriceCoverage
        from app.services.prices import _db_helpers as db_helpers
        from app.services.prices import (
            historical_price_service as hp_mod,
        )

        engine = create_engine(
            f"sqlite:///{tmp_path / 'coverage.db'}",
            connect_args={"check_same_thread": False},
        )
        SQLModel.metadata.create_all(engine)

        # Seed two disjoint cached windows for AAPL: prior narrow fetches
        # left a hole in the middle. Each prior fetch also recorded its
        # interval in the coverage table.
        with Session(engine) as s:
            for d in ("2025-01-02", "2025-01-03"):
                s.add(
                    HistoricalPrice(
                        ticker="AAPL",
                        date=d,
                        price=Decimal("100.00"),
                        created_at=datetime.now(UTC),
                    )
                )
            for d in ("2025-01-13", "2025-01-14"):
                s.add(
                    HistoricalPrice(
                        ticker="AAPL",
                        date=d,
                        price=Decimal("110.00"),
                        created_at=datetime.now(UTC),
                    )
                )
            s.add(
                HistoricalPriceCoverage(
                    ticker="AAPL",
                    period_start="2025-01-01",
                    period_end="2025-01-05",
                    created_at=datetime.now(UTC),
                )
            )
            s.add(
                HistoricalPriceCoverage(
                    ticker="AAPL",
                    period_start="2025-01-10",
                    period_end="2025-01-15",
                    created_at=datetime.now(UTC),
                )
            )
            s.commit()

        # The wide request spans both prior caches plus the gap. The dates
        # are far in the past so today/yesterday capping doesn't apply.
        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 15)
        gap_prices = {"2025-01-07": 105.0, "2025-01-08": 106.0}

        with (
            patch.object(hp_mod, "engine", engine),
            patch.object(db_helpers, "engine", engine),
            patch.object(
                HistoricalPriceService, "_fetch_yahoo_range", return_value=gap_prices
            ) as mock_yahoo,
        ):
            result = HistoricalPriceService.get_historical_prices("AAPL", start, end)

        # Yahoo was called exactly once, for the inner gap [2025-01-06,
        # 2025-01-09]. Without the coverage fix, the old logic would have
        # treated min..max as fully cached and skipped Yahoo entirely.
        assert mock_yahoo.call_count == 1
        gap_start, gap_end = mock_yahoo.call_args.args[1:3]
        assert gap_start.date() == _d("2025-01-06")
        assert gap_end.date() == _d("2025-01-09")

        # Result merges both prior caches with the new gap rows.
        assert "2025-01-02" in result
        assert "2025-01-13" in result
        assert "2025-01-07" in result

        # A third coverage row was written for the gap fetch.
        with Session(engine) as s:
            cov_rows = s.exec(
                select(HistoricalPriceCoverage).where(
                    HistoricalPriceCoverage.ticker == "AAPL"
                )
            ).all()
        period_starts = {r.period_start for r in cov_rows}
        assert "2025-01-06" in period_starts


class TestGetHistoricalPricesForMultipleTickers:
    def setup_method(self):
        HistoricalPriceService._historical_cache.clear()

    def test_empty_tickers(self):
        result = HistoricalPriceService.get_historical_prices_for_multiple_tickers(
            [], datetime(2025, 1, 1), datetime(2025, 1, 31)
        )
        assert result == {}

    def test_multiple_tickers(self):
        def fake(ticker, start, end):
            return {"2025-01-10": 100.0 if ticker == "AAPL" else 200.0}

        with patch.object(
            HistoricalPriceService, "get_historical_prices", side_effect=fake
        ):
            result = HistoricalPriceService.get_historical_prices_for_multiple_tickers(
                ["AAPL", "GOOGL"], datetime(2025, 1, 1), datetime(2025, 1, 31)
            )

        assert result["AAPL"] == {"2025-01-10": 100.0}
        assert result["GOOGL"] == {"2025-01-10": 200.0}

    def test_per_ticker_start_skips_when_after_end(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 15)
        per_ticker = {"NEW_IPO": datetime(2025, 2, 1)}

        with patch.object(HistoricalPriceService, "get_historical_prices") as mock_hist:
            result = HistoricalPriceService.get_historical_prices_for_multiple_tickers(
                ["NEW_IPO"], start, end, per_ticker_start=per_ticker
            )

        mock_hist.assert_not_called()
        assert result["NEW_IPO"] == {}

    def test_per_ticker_start_uses_later_date(self):
        start = datetime(2025, 1, 1)
        end = datetime(2025, 1, 31)
        per_ticker = {"AAPL": datetime(2025, 1, 15)}

        with patch.object(
            HistoricalPriceService, "get_historical_prices", return_value={}
        ) as mock_hist:
            HistoricalPriceService.get_historical_prices_for_multiple_tickers(
                ["AAPL"], start, end, per_ticker_start=per_ticker
            )

        mock_hist.assert_called_once_with("AAPL", datetime(2025, 1, 15), end)

    def test_exception_in_one_ticker_doesnt_break_others(self):
        def fake(ticker, start, end):
            if ticker == "BAD":
                raise RuntimeError("fail")
            return {"2025-01-10": 100.0}

        with patch.object(
            HistoricalPriceService, "get_historical_prices", side_effect=fake
        ):
            result = HistoricalPriceService.get_historical_prices_for_multiple_tickers(
                ["AAPL", "BAD"], datetime(2025, 1, 1), datetime(2025, 1, 31)
            )

        assert result["AAPL"] == {"2025-01-10": 100.0}
        assert result["BAD"] == {}

    def test_ensures_all_tickers_in_result(self):
        with patch.object(
            HistoricalPriceService, "get_historical_prices", return_value={}
        ):
            result = HistoricalPriceService.get_historical_prices_for_multiple_tickers(
                ["AAPL", "GOOGL", "MSFT"],
                datetime(2025, 1, 1),
                datetime(2025, 1, 31),
            )

        assert set(result.keys()) == {"AAPL", "GOOGL", "MSFT"}


class TestBulkUpsertNoOp:
    """Empty values must short-circuit without opening a session."""

    def test_empty_values_returns_immediately(self):
        from app.services.prices import _db_helpers

        with patch.object(_db_helpers, "Session") as mock_session:
            result = _db_helpers.bulk_upsert(Mock(), [], ["id"], ["value"], "test")
        mock_session.assert_not_called()
        # No-op is "success" — callers should treat an empty write as
        # safe to follow with dependent state writes.
        assert result is True


class TestBulkUpsertReturnValue:
    """``bulk_upsert`` must signal success/failure so callers can gate
    dependent writes (e.g. coverage rows that follow a price upsert)."""

    def test_returns_true_on_success(self):
        from app.services.prices import _db_helpers

        with (
            patch.object(_db_helpers, "Session") as mock_session_cls,
            patch.object(_db_helpers, "sqlite_insert"),
            patch.object(_db_helpers, "pg_insert"),
        ):
            mock_session = MagicMock()
            mock_session_cls.return_value.__enter__.return_value = mock_session
            result = _db_helpers.bulk_upsert(
                Mock(), [{"id": 1, "value": "x"}], ["id"], ["value"], "test"
            )
        assert result is True

    def test_returns_false_on_error(self):
        from app.services.prices import _db_helpers

        with (
            patch.object(_db_helpers, "Session") as mock_session_cls,
            patch.object(_db_helpers, "sqlite_insert"),
            patch.object(_db_helpers, "pg_insert"),
        ):
            mock_session = MagicMock()
            mock_session.execute.side_effect = RuntimeError("db down")
            mock_session_cls.return_value.__enter__.return_value = mock_session
            result = _db_helpers.bulk_upsert(
                Mock(), [{"id": 1, "value": "x"}], ["id"], ["value"], "test"
            )
        assert result is False


class TestCachedHistoricalPricesFloatCoercion:
    """Regression guard for the ``1.0 / Decimal`` TypeError. The cache
    columns are Decimal but the public return type is ``dict[str, float]``;
    leaking Decimal through breaks plain arithmetic downstream.
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
            result = HistoricalPriceService._get_cached_historical_prices(
                "AAPL", _dt(2026, 4, 1), _dt(2026, 4, 30), session=session
            )

        assert "2026-04-10" in result
        assert isinstance(result["2026-04-10"], float)
        assert result["2026-04-10"] == pytest.approx(150.25)

    def test_calculate_performance_survives_decimal_db_cache(self, tmp_path):
        """End-to-end guard: with only the DB cache populated, performance
        must not raise on the EURUSD=X inversion. Uses file-backed SQLite
        because the perf code fans out cache reads across threads.
        """
        from datetime import datetime as _dt
        from decimal import Decimal

        from sqlmodel import Session, SQLModel, create_engine

        from app.models import HistoricalPrice, Transaction, TransactionType
        from app.services import portfolio_perf as pp_mod
        from app.services.portfolio_perf import calculate_performance
        from app.services.prices import historical_price_service as hp_mod

        engine = create_engine(
            f"sqlite:///{tmp_path / 'perf_decimal_cache.db'}",
            connect_args={"check_same_thread": False},
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
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

        HistoricalPriceService.clear_session_cache()
        with (
            patch.object(hp_mod, "engine", engine),
            patch.object(pp_mod, "engine", engine, create=True),
            patch.object(
                HistoricalPriceService,
                "_determine_fetch_ranges",
                return_value=[],
            ),
        ):
            data_points, _, _ = calculate_performance(
                tx,
                _dt(2026, 4, 2),
                _dt(2026, 4, 15),
                num_points=5,
            )

        assert len(data_points) == 5
        assert data_points[-1]["current_value"] is not None
        assert data_points[-1]["fx_rate"] == pytest.approx(1.0 / 1.10)


class TestRecordCoverageEdgeCases:
    """Cover the early-return guard in _record_coverage (line 194)."""

    def test_record_coverage_start_after_end_is_no_op(self):
        """When start > end the method must return without writing anything."""
        from app.services.prices import _db_helpers

        with patch.object(_db_helpers, "bulk_upsert") as mock_upsert:
            HistoricalPriceService._record_coverage(
                "AAPL", _d("2025-01-15"), _d("2025-01-10")
            )
        mock_upsert.assert_not_called()


class TestLogHttpErrorBranches:
    """Cover the non-400/404 branch of _log_http_error (line 321)."""

    def test_non_standard_http_error_uses_error_level(self):
        """A 500-status HTTPError must be logged at ERROR level, not WARNING."""

        resp_mock = Mock()
        resp_mock.status_code = 500
        http_err = requests.exceptions.HTTPError(response=resp_mock)

        with (
            patch.object(
                HistoricalPriceService,
                "_fetch_yahoo_range",
                side_effect=http_err,
            ),
            patch("app.services.prices.historical_price_service.logger") as mock_logger,
        ):
            HistoricalPriceService._fetch_single_range(
                "AAPL",
                datetime(2025, 1, 10),
                datetime(2025, 1, 15),
                datetime(2025, 1, 20).date(),
            )

        mock_logger.error.assert_called_once()
        mock_logger.warning.assert_not_called()

    def test_none_response_http_error_uses_error_level(self):
        """An HTTPError with no response object (status=None) also goes to ERROR."""
        http_err = requests.exceptions.HTTPError(response=None)

        with (
            patch.object(
                HistoricalPriceService,
                "_fetch_yahoo_range",
                side_effect=http_err,
            ),
            patch("app.services.prices.historical_price_service.logger") as mock_logger,
        ):
            HistoricalPriceService._fetch_single_range(
                "AAPL",
                datetime(2025, 1, 10),
                datetime(2025, 1, 15),
                datetime(2025, 1, 20).date(),
            )

        mock_logger.error.assert_called_once()
        mock_logger.warning.assert_not_called()
