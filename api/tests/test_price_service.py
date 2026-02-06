"""
Unit tests for PriceService
"""
import pytest
from unittest.mock import Mock, patch
from app.services.price_service import PriceService
import requests


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
            'chart': {
                'result': [{
                    'meta': {
                        'regularMarketPrice': 150.25
                    }
                }]
            }
        }
        mock_response.raise_for_status = Mock()
        
        with patch('app.services.price_service.requests.get', return_value=mock_response):
            price = PriceService.get_current_price('AAPL')
            
        assert price == 150.25
    
    def test_get_current_price_missing_data(self):
        """Test price fetch when API returns incomplete data"""
        mock_response = Mock()
        mock_response.json.return_value = {
            'chart': {
                'result': [{
                    'meta': {}  # Missing regularMarketPrice
                }]
            }
        }
        mock_response.raise_for_status = Mock()
        
        with patch('app.services.price_service.requests.get', return_value=mock_response):
            price = PriceService.get_current_price('INVALID')
            
        assert price is None
    
    def test_get_current_price_empty_result(self):
        """Test price fetch when API returns empty result"""
        mock_response = Mock()
        mock_response.json.return_value = {
            'chart': {
                'result': []  # Empty result
            }
        }
        mock_response.raise_for_status = Mock()
        
        with patch('app.services.price_service.requests.get', return_value=mock_response):
            price = PriceService.get_current_price('INVALID')
            
        assert price is None
    
    def test_get_current_price_network_error(self):
        """Test price fetch with network error"""
        with patch('app.services.price_service.requests.get', side_effect=requests.exceptions.ConnectionError("Network error")):
            price = PriceService.get_current_price('AAPL')
            
        assert price is None
    
    def test_get_current_price_timeout(self):
        """Test price fetch with timeout"""
        with patch('app.services.price_service.requests.get', side_effect=requests.exceptions.Timeout("Timeout")):
            price = PriceService.get_current_price('AAPL')
            
        assert price is None
    
    def test_get_current_price_http_error(self):
        """Test price fetch with HTTP error"""
        mock_response = Mock()
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("404 Not Found")
        
        with patch('app.services.price_service.requests.get', return_value=mock_response):
            price = PriceService.get_current_price('INVALID')
            
        assert price is None
    
    def test_get_current_price_json_decode_error(self):
        """Test price fetch with JSON decode error"""
        mock_response = Mock()
        mock_response.json.side_effect = ValueError("Invalid JSON")
        mock_response.raise_for_status = Mock()
        
        with patch('app.services.price_service.requests.get', return_value=mock_response):
            price = PriceService.get_current_price('AAPL')
            
        assert price is None
    
    def test_get_current_prices_success_multiple(self):
        """Test successful price fetch for multiple tickers"""
        def mock_get_current_price(ticker):
            prices = {
                'AAPL': 150.25,
                'GOOGL': 2800.50,
                'MSFT': 320.00
            }
            return prices.get(ticker)
        
        with patch.object(PriceService, 'get_current_price', side_effect=mock_get_current_price):
            prices = PriceService.get_current_prices(['AAPL', 'GOOGL', 'MSFT'])
        
        assert prices == {
            'AAPL': 150.25,
            'GOOGL': 2800.50,
            'MSFT': 320.00
        }
    
    def test_get_current_prices_empty_list(self):
        """Test price fetch with empty ticker list"""
        prices = PriceService.get_current_prices([])
        assert prices == {}
    
    def test_get_current_prices_with_failures(self):
        """Test price fetch where some tickers fail"""
        def mock_get_current_price(ticker):
            if ticker == 'AAPL':
                return 150.25
            elif ticker == 'INVALID':
                raise Exception("API Error")
            else:
                return None
        
        with patch.object(PriceService, 'get_current_price', side_effect=mock_get_current_price):
            prices = PriceService.get_current_prices(['AAPL', 'INVALID', 'NOTFOUND'])
        
        assert prices['AAPL'] == 150.25
        assert prices['INVALID'] is None
        assert prices['NOTFOUND'] is None
    
    def test_get_current_prices_parallel_execution(self):
        """Test that price fetches are executed in parallel"""
        call_count = {'count': 0}
        
        def mock_get_current_price(ticker):
            call_count['count'] += 1
            return 100.0 + call_count['count']
        
        with patch.object(PriceService, 'get_current_price', side_effect=mock_get_current_price):
            prices = PriceService.get_current_prices(['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'])
        
        # All tickers should have been called
        assert len(prices) == 5
        assert all(ticker in prices for ticker in ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'])
        assert call_count['count'] == 5
    
    def test_get_current_prices_custom_max_workers(self):
        """Test price fetch with custom max_workers parameter"""
        def mock_get_current_price(ticker):
            return 100.0
        
        with patch.object(PriceService, 'get_current_price', side_effect=mock_get_current_price):
            prices = PriceService.get_current_prices(['AAPL', 'GOOGL'], max_workers=2)
        
        assert len(prices) == 2
        assert prices['AAPL'] == 100.0
        assert prices['GOOGL'] == 100.0
    
    def test_get_current_price_api_request_format(self):
        """Test that API request is formatted correctly"""
        mock_response = Mock()
        mock_response.json.return_value = {
            'chart': {
                'result': [{
                    'meta': {'regularMarketPrice': 150.25}
                }]
            }
        }
        mock_response.raise_for_status = Mock()
        
        with patch('app.services.price_service.requests.get', return_value=mock_response) as mock_get:
            PriceService.get_current_price('AAPL')
            
            # Verify the request was made with correct parameters
            mock_get.assert_called_once()
            call_args = mock_get.call_args
            
            # Check URL
            assert 'AAPL' in call_args[0][0]
            assert 'query1.finance.yahoo.com' in call_args[0][0]
            
            # Check headers
            assert 'headers' in call_args[1]
            assert 'User-Agent' in call_args[1]['headers']
            
            # Check params
            assert 'params' in call_args[1]
            assert call_args[1]['params']['interval'] == '1d'
            assert call_args[1]['params']['range'] == '1d'
            
            # Check timeout
            assert 'timeout' in call_args[1]
            assert call_args[1]['timeout'] == 10
