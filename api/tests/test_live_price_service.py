"""Unit tests for LivePriceService."""

from concurrent.futures import Future
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from unittest.mock import MagicMock, Mock, patch

import pytest
import requests
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

import app.models  # noqa: F401
from app.services.prices.live_price_service import LivePriceService


def _ok_response(payload: dict) -> Mock:
    resp = Mock()
    resp.status_code = 200
    resp.json.return_value = payload
    resp.raise_for_status = Mock()
    return resp


@pytest.fixture(name="mem_session")
def mem_session_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


class TestGetCurrentPrice:
    """Test suite for LivePriceService.get_current_price."""

    def setup_method(self):
        LivePriceService._price_cache.clear()

    def test_get_current_price_success(self):
        with patch(
            "app.services.prices.yahoo_finance_client.requests.get",
            return_value=_ok_response(
                {"chart": {"result": [{"meta": {"regularMarketPrice": 150.25}}]}}
            ),
        ):
            price = LivePriceService.get_current_price("AAPL")

        assert price == pytest.approx(150.25)

    def test_get_current_price_missing_data(self):
        with patch(
            "app.services.prices.yahoo_finance_client.requests.get",
            return_value=_ok_response({"chart": {"result": [{"meta": {}}]}}),
        ):
            price = LivePriceService.get_current_price("INVALID")

        assert price is None

    def test_get_current_price_empty_result(self):
        with patch(
            "app.services.prices.yahoo_finance_client.requests.get",
            return_value=_ok_response({"chart": {"result": []}}),
        ):
            price = LivePriceService.get_current_price("INVALID")

        assert price is None

    def test_get_current_price_network_error(self):
        """A persistent network error (after retries) returns None."""
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=requests.exceptions.ConnectionError("network"),
            ),
            patch("app.services.prices.yahoo_finance_client.time.sleep"),
        ):
            price = LivePriceService.get_current_price("AAPL")

        assert price is None

    def test_get_current_price_timeout(self):
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=requests.exceptions.Timeout("timeout"),
            ),
            patch("app.services.prices.yahoo_finance_client.time.sleep"),
        ):
            price = LivePriceService.get_current_price("AAPL")

        assert price is None

    def test_get_current_price_http_error(self):
        """4xx error from Yahoo (e.g. unknown ticker) returns None."""
        resp = Mock()
        resp.status_code = 404
        resp.raise_for_status.side_effect = requests.exceptions.HTTPError(
            "404", response=resp
        )

        with patch(
            "app.services.prices.yahoo_finance_client.requests.get", return_value=resp
        ):
            price = LivePriceService.get_current_price("INVALID")

        assert price is None

    def test_get_current_price_json_decode_error(self):
        resp = Mock()
        resp.status_code = 200
        resp.json.side_effect = ValueError("Invalid JSON")
        resp.raise_for_status = Mock()

        with patch(
            "app.services.prices.yahoo_finance_client.requests.get", return_value=resp
        ):
            price = LivePriceService.get_current_price("AAPL")

        assert price is None

    def test_get_current_price_api_request_format(self):
        with patch(
            "app.services.prices.yahoo_finance_client.requests.get",
            return_value=_ok_response(
                {"chart": {"result": [{"meta": {"regularMarketPrice": 150.25}}]}}
            ),
        ) as mock_get:
            LivePriceService.get_current_price("AAPL")

            mock_get.assert_called_once()
            call_args = mock_get.call_args

            assert "AAPL" in call_args.args[0]
            assert "query1.finance.yahoo.com" in call_args.args[0]
            assert "User-Agent" in call_args.kwargs["headers"]
            assert call_args.kwargs["params"]["interval"] == "1d"
            assert call_args.kwargs["params"]["range"] == "1d"
            assert call_args.kwargs["timeout"] == 10


class TestGetCurrentPrices:
    """Tests for the multi-ticker fetcher."""

    def setup_method(self):
        LivePriceService._price_cache.clear()

    def test_success_multiple(self):
        def fake(ticker):
            return {"AAPL": 150.25, "GOOGL": 2800.50, "MSFT": 320.00}.get(ticker)

        with patch.object(LivePriceService, "get_current_price", side_effect=fake):
            prices = LivePriceService.get_current_prices(["AAPL", "GOOGL", "MSFT"])

        assert prices == {"AAPL": 150.25, "GOOGL": 2800.50, "MSFT": 320.00}

    def test_empty_list(self):
        assert LivePriceService.get_current_prices([]) == {}

    def test_with_failures(self):
        def fake(ticker):
            if ticker == "AAPL":
                return 150.25
            if ticker == "INVALID":
                raise Exception("boom")
            return None

        with patch.object(LivePriceService, "get_current_price", side_effect=fake):
            prices = LivePriceService.get_current_prices(
                ["AAPL", "INVALID", "NOTFOUND"]
            )

        assert prices["AAPL"] == pytest.approx(150.25)
        assert prices["INVALID"] is None
        assert prices["NOTFOUND"] is None

    def test_parallel_execution(self):
        call_count = {"count": 0}

        def fake(ticker):
            call_count["count"] += 1
            return 100.0 + call_count["count"]

        with patch.object(LivePriceService, "get_current_price", side_effect=fake):
            prices = LivePriceService.get_current_prices(
                ["AAPL", "GOOGL", "MSFT", "TSLA", "AMZN"]
            )

        assert len(prices) == 5
        assert call_count["count"] == 5

    def test_custom_max_workers(self):
        with patch.object(LivePriceService, "get_current_price", return_value=100.0):
            prices = LivePriceService.get_current_prices(
                ["AAPL", "GOOGL"], max_workers=2
            )

        assert len(prices) == 2
        assert prices["AAPL"] == pytest.approx(100.0)


class TestCaching:
    """Tests for the TTL cache."""

    def setup_method(self):
        LivePriceService._price_cache.clear()

    def test_cache_hit_returns_cached_price(self):
        now = datetime.now(UTC)
        LivePriceService._price_cache["AAPL"] = (150.0, now)

        with patch("app.services.prices.yahoo_finance_client.requests.get") as mock_get:
            price = LivePriceService.get_current_price("AAPL")

        mock_get.assert_not_called()
        assert price == pytest.approx(150.0)

    def test_cache_expired_fetches_new_price(self):
        expired = datetime.now(UTC) - LivePriceService._cache_ttl - timedelta(seconds=1)
        LivePriceService._price_cache["AAPL"] = (100.0, expired)

        with patch(
            "app.services.prices.yahoo_finance_client.requests.get",
            return_value=_ok_response(
                {"chart": {"result": [{"meta": {"regularMarketPrice": 200.0}}]}}
            ),
        ):
            price = LivePriceService.get_current_price("AAPL")

        assert price == pytest.approx(200.0)

    def test_cache_hit_returns_none_price(self):
        """A previously-cached None remains a cache hit (no re-fetch)."""
        now = datetime.now(UTC)
        LivePriceService._price_cache["BAD"] = (None, now)

        with patch("app.services.prices.yahoo_finance_client.requests.get") as mock_get:
            price = LivePriceService.get_current_price("BAD")

        mock_get.assert_not_called()
        assert price is None


class TestGetLastKnownPriceWithDate:
    """The router's S4 path uses this for the stale-badge fallback. A
    silent regression here breaks every "last known" UI badge.
    """

    def test_returns_none_when_ticker_not_in_cache(self):

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            result = LivePriceService.get_last_known_price_with_date("UNKNOWN", session)
        assert result is None

    def test_returns_most_recent_date_tuple(self):
        from datetime import datetime as _dt

        from sqlmodel import Session, SQLModel, create_engine

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
            result = LivePriceService.get_last_known_price_with_date("AAPL", session)
        assert result is not None
        price, date_str = result
        assert price == pytest.approx(152.00)
        assert date_str == "2026-04-11"


class TestGetLastKnownPricesBatch:
    """Batch fallback used by the live-prices router. Single SQL roundtrip
    avoids fanning N missing-ticker lookups onto the event loop.
    """

    def test_returns_empty_dict_for_empty_input(self):
        assert LivePriceService.get_last_known_prices_batch([]) == {}

    def test_unknown_tickers_map_to_none(self):

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            result = LivePriceService.get_last_known_prices_batch(
                ["AAPL", "GOOGL"], session
            )
        assert result == {"AAPL": None, "GOOGL": None}

    def test_returns_latest_row_per_ticker(self):
        from datetime import datetime as _dt

        from sqlmodel import Session, SQLModel, create_engine

        from app.models import HistoricalPrice

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        SQLModel.metadata.create_all(engine)
        with Session(engine) as session:
            session.add_all(
                [
                    HistoricalPrice(
                        ticker="AAPL",
                        date="2026-04-10",
                        price=Decimal("150.25"),
                        created_at=_dt.now(UTC),
                    ),
                    HistoricalPrice(
                        ticker="AAPL",
                        date="2026-04-11",
                        price=Decimal("152.00"),
                        created_at=_dt.now(UTC),
                    ),
                    HistoricalPrice(
                        ticker="GOOGL",
                        date="2026-04-09",
                        price=Decimal("2800.50"),
                        created_at=_dt.now(UTC),
                    ),
                ]
            )
            session.commit()
            result = LivePriceService.get_last_known_prices_batch(
                ["AAPL", "GOOGL", "MISSING"], session
            )
        assert result["AAPL"] == (pytest.approx(152.00), "2026-04-11")
        assert result["GOOGL"] == (pytest.approx(2800.50), "2026-04-09")
        assert result["MISSING"] is None


# ── Extra coverage paths ─────────────────────────────────────────


class TestLivePriceServiceExtraPaths:
    """Cover live_price_service.py lines 102, 111-114, 153-160, 167-168, 192-193, 235-236."""

    def setup_method(self):
        LivePriceService.clear_cache()

    def test_in_flight_deduplication(self):
        """Second caller for same ticker shares the in-flight Future (lines 101-102, 111-112)."""
        f: Future[float | None] = Future()
        f.set_result(99.5)
        LivePriceService._in_flight["DEDUP"] = f

        price = LivePriceService.get_current_price("DEDUP")
        assert price == pytest.approx(99.5)

    def test_in_flight_deduplication_exception_returns_none(self):
        """If the shared Future raised, the waiter returns None (lines 111-114)."""
        f: Future[float | None] = Future()
        f.set_exception(RuntimeError("fetch failed"))
        LivePriceService._in_flight["ERRDUP"] = f

        price = LivePriceService.get_current_price("ERRDUP")
        assert price is None

    def test_fetch_from_yahoo_unexpected_exception_returns_none(self):
        """An unexpected exception in _fetch_from_yahoo returns None (lines 153-160)."""
        with patch(
            "app.services.prices.live_price_service.YahooFinanceClient.fetch_chart",
            side_effect=RuntimeError("unexpected boom"),
        ):
            result = LivePriceService._fetch_from_yahoo("BOOM")
        assert result is None

    def test_get_last_known_price_returns_none_when_no_data(self, mem_session: Session):
        """get_last_known_price returns None when no data exists (lines 167-168)."""
        result = LivePriceService.get_last_known_price("NOTEXISTS", mem_session)
        assert result is None

    def test_get_last_known_price_returns_price_when_data_exists(
        self, mem_session: Session
    ):
        """get_last_known_price returns the float price (exercises the return result[0] branch)."""
        from app.models.historical_price import HistoricalPrice

        mem_session.add(
            HistoricalPrice(
                ticker="LPRICE",
                date="2024-06-01",
                price=Decimal("123.45"),
                created_at=datetime.now(UTC),
            )
        )
        mem_session.commit()

        result = LivePriceService.get_last_known_price("LPRICE", mem_session)
        assert result == pytest.approx(123.45)

    def test_get_last_known_prices_batch_uses_own_session_when_none(self):
        """get_last_known_prices_batch with session=None uses its own session (lines 235-236)."""
        from sqlmodel import Session as SqSession

        mock_session = MagicMock(spec=SqSession)
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.exec.return_value.all.return_value = []

        with patch(
            "app.services.prices.live_price_service.Session",
            return_value=mock_session,
        ):
            result = LivePriceService.get_last_known_prices_batch(["AAPL"])
        assert result == {"AAPL": None}

    def test_get_last_known_price_with_date_uses_own_session_when_none(self):
        """get_last_known_price_with_date with session=None uses its own session (lines 192-193)."""
        from sqlmodel import Session as SqSession

        mock_session = MagicMock(spec=SqSession)
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.exec.return_value.first.return_value = None

        with patch(
            "app.services.prices.live_price_service.Session",
            return_value=mock_session,
        ):
            result = LivePriceService.get_last_known_price_with_date("AAPL")
        assert result is None


class TestBulkUpsertWithSession:
    """Cover _db_helpers.py line 51: _execute(session) when session is provided."""

    def test_bulk_upsert_uses_provided_session(self, mem_session: Session):
        """When a session is passed, bulk_upsert executes within that session (line 51)."""
        from app.models.historical_price import FxRate
        from app.services.prices._db_helpers import bulk_upsert

        values = [
            {
                "date": "2024-01-01",
                "usd_to_eur_rate": Decimal("0.9200"),
                "created_at": datetime.now(UTC),
            }
        ]

        result = bulk_upsert(
            FxRate,
            values,
            index_elements=["date"],
            update_fields=["usd_to_eur_rate", "created_at"],
            label="FxRate",
            session=mem_session,
        )
        assert result is True
