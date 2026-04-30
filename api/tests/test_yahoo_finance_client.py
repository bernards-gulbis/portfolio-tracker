"""Unit tests for YahooFinanceClient — retry policy and HTTP behavior."""

from unittest.mock import Mock, patch

import pytest
import requests

from app.services.prices.yahoo_finance_client import YahooFinanceClient


def _ok_response(payload: dict | None = None) -> Mock:
    resp = Mock()
    resp.status_code = 200
    resp.json.return_value = payload or {"chart": {"result": []}}
    resp.raise_for_status = Mock()
    return resp


def _http_response(status: int) -> Mock:
    resp = Mock()
    resp.status_code = status
    resp.raise_for_status.side_effect = requests.exceptions.HTTPError(
        f"{status} error", response=resp
    )
    return resp


class TestSuccess:
    def test_returns_response_on_first_attempt(self):
        with patch(
            "app.services.prices.yahoo_finance_client.requests.get",
            return_value=_ok_response(),
        ) as mock_get:
            resp = YahooFinanceClient.fetch_chart("AAPL", {"interval": "1d"})

        assert resp.status_code == 200
        mock_get.assert_called_once()


class TestNoRetryOn4xx:
    def test_404_raises_immediately_no_retry(self):
        """4xx errors are permanent (unknown ticker, bad params). Don't retry."""
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                return_value=_http_response(404),
            ) as mock_get,
            patch("app.services.prices.yahoo_finance_client.time.sleep") as mock_sleep,
            pytest.raises(requests.exceptions.HTTPError),
        ):
            YahooFinanceClient.fetch_chart("UNKNOWN", {})

        mock_get.assert_called_once()
        mock_sleep.assert_not_called()

    def test_400_raises_immediately_no_retry(self):
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                return_value=_http_response(400),
            ) as mock_get,
            patch("app.services.prices.yahoo_finance_client.time.sleep"),
            pytest.raises(requests.exceptions.HTTPError),
        ):
            YahooFinanceClient.fetch_chart("BAD", {})

        mock_get.assert_called_once()


class TestRetryOn5xx:
    def test_503_then_200_succeeds(self):
        responses = [_http_response(503), _ok_response()]
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=responses,
            ) as mock_get,
            patch("app.services.prices.yahoo_finance_client.time.sleep") as mock_sleep,
        ):
            resp = YahooFinanceClient.fetch_chart("AAPL", {})

        assert resp.status_code == 200
        assert mock_get.call_count == 2
        # One backoff sleep between the two attempts
        assert mock_sleep.call_count == 1

    def test_three_5xx_responses_raise_http_error(self):
        responses = [
            _http_response(500),
            _http_response(502),
            _http_response(504),
        ]
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=responses,
            ) as mock_get,
            patch("app.services.prices.yahoo_finance_client.time.sleep") as mock_sleep,
            pytest.raises(requests.exceptions.HTTPError),
        ):
            YahooFinanceClient.fetch_chart("AAPL", {})

        assert mock_get.call_count == 3
        # Two sleeps between three attempts; no sleep after the last
        assert mock_sleep.call_count == 2


class TestRetryOnTransient4xx:
    """Transient 4xx codes (429, 408) should be retried like 5xx."""

    def test_429_then_200_succeeds(self):
        responses = [_http_response(429), _ok_response()]
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=responses,
            ) as mock_get,
            patch("app.services.prices.yahoo_finance_client.time.sleep") as mock_sleep,
        ):
            resp = YahooFinanceClient.fetch_chart("AAPL", {})

        assert resp.status_code == 200
        assert mock_get.call_count == 2
        assert mock_sleep.call_count == 1

    def test_408_then_200_succeeds(self):
        responses = [_http_response(408), _ok_response()]
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=responses,
            ) as mock_get,
            patch("app.services.prices.yahoo_finance_client.time.sleep") as mock_sleep,
        ):
            resp = YahooFinanceClient.fetch_chart("AAPL", {})

        assert resp.status_code == 200
        assert mock_get.call_count == 2
        assert mock_sleep.call_count == 1


class TestRetryOnRequestException:
    def test_connection_error_then_success(self):
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=[
                    requests.exceptions.ConnectionError("dns fail"),
                    _ok_response(),
                ],
            ) as mock_get,
            patch("app.services.prices.yahoo_finance_client.time.sleep") as mock_sleep,
        ):
            resp = YahooFinanceClient.fetch_chart("AAPL", {})

        assert resp.status_code == 200
        assert mock_get.call_count == 2
        assert mock_sleep.call_count == 1

    def test_timeout_then_success(self):
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=[
                    requests.exceptions.Timeout("slow"),
                    _ok_response(),
                ],
            ) as mock_get,
            patch("app.services.prices.yahoo_finance_client.time.sleep"),
        ):
            resp = YahooFinanceClient.fetch_chart("AAPL", {})

        assert resp.status_code == 200
        assert mock_get.call_count == 2

    def test_three_connection_errors_raise(self):
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=requests.exceptions.ConnectionError("fail"),
            ) as mock_get,
            patch("app.services.prices.yahoo_finance_client.time.sleep"),
            pytest.raises(requests.exceptions.ConnectionError),
        ):
            YahooFinanceClient.fetch_chart("AAPL", {})

        assert mock_get.call_count == 3


class TestBackoffTiming:
    def test_exponential_backoff_1s_then_2s(self):
        """Sleeps should be 1s and 2s between three attempts (no sleep after the last)."""
        responses = [
            _http_response(503),
            _http_response(503),
            _ok_response(),
        ]
        with (
            patch(
                "app.services.prices.yahoo_finance_client.requests.get",
                side_effect=responses,
            ),
            patch("app.services.prices.yahoo_finance_client.time.sleep") as mock_sleep,
        ):
            YahooFinanceClient.fetch_chart("AAPL", {})

        # First retry waits 1s, second waits 2s
        assert [c.args[0] for c in mock_sleep.call_args_list] == [1.0, 2.0]


class TestRequestParameters:
    def test_url_and_headers_and_timeout(self):
        with patch(
            "app.services.prices.yahoo_finance_client.requests.get",
            return_value=_ok_response(),
        ) as mock_get:
            YahooFinanceClient.fetch_chart("AAPL", {"interval": "1d"})

        call = mock_get.call_args
        assert "AAPL" in call.args[0]
        assert "query1.finance.yahoo.com" in call.args[0]
        assert "User-Agent" in call.kwargs["headers"]
        assert call.kwargs["timeout"] == 10
        assert call.kwargs["params"] == {"interval": "1d"}
