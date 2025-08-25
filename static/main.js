// static/main.js
class StockAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://www.alphavantage.co/query';
        this.cache = new Map();
        this.cacheDuration = 5 * 60 * 1000; // 5 minutes cache
    }

    async makeRequest(params) {
        // Check cache first
        const cacheKey = JSON.stringify(params);
        const cached = this.cache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheDuration) {
            return cached.data;
        }

        try {
            // Add API key to params
            params.apikey = this.apiKey;
            
            // Convert params to query string
            const queryString = new URLSearchParams(params).toString();
            const url = `${this.baseUrl}?${queryString}`;
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Check for API error messages
            if (data['Error Message']) {
                throw new Error(data['Error Message']);
            }
            
            if (data['Note']) {
                console.warn('API rate limit note:', data['Note']);
            }
            
            // Cache the response
            this.cache.set(cacheKey, {
                data: data,
                timestamp: Date.now()
            });
            
            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // Get real-time quote for a symbol
    async getGlobalQuote(symbol) {
        const params = {
            function: 'GLOBAL_QUOTE',
            symbol: symbol
        };
        
        const data = await this.makeRequest(params);
        return data['Global Quote'] ? this.parseGlobalQuote(data['Global Quote']) : null;
    }

    parseGlobalQuote(quoteData) {
        return {
            symbol: quoteData['01. symbol'],
            open: parseFloat(quoteData['02. open']),
            high: parseFloat(quoteData['03. high']),
            low: parseFloat(quoteData['04. low']),
            price: parseFloat(quoteData['05. price']),
            volume: parseInt(quoteData['06. volume']),
            latestTradingDay: quoteData['07. latest trading day'],
            previousClose: parseFloat(quoteData['08. previous close']),
            change: parseFloat(quoteData['09. change']),
            changePercent: quoteData['10. change percent']
        };
    }

    // Get daily time series data
    async getTimeSeriesDaily(symbol, outputsize = 'compact') {
        const params = {
            function: 'TIME_SERIES_DAILY',
            symbol: symbol,
            outputsize: outputsize
        };
        
        const data = await this.makeRequest(params);
        return data['Time Series (Daily)'] ? this.parseTimeSeries(data['Time Series (Daily)']) : null;
    }

    parseTimeSeries(timeSeriesData) {
        const series = [];
        for (const [date, values] of Object.entries(timeSeriesData)) {
            series.push({
                date: date,
                open: parseFloat(values['1. open']),
                high: parseFloat(values['2. high']),
                low: parseFloat(values['3. low']),
                close: parseFloat(values['4. close']),
                volume: parseInt(values['5. volume'])
            });
        }
        return series.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    // Get daily adjusted time series (includes dividends and splits)
    async getTimeSeriesDailyAdjusted(symbol, outputsize = 'compact') {
        const params = {
            function: 'TIME_SERIES_DAILY_ADJUSTED',
            symbol: symbol,
            outputsize: outputsize
        };
        
        const data = await this.makeRequest(params);
        return data['Time Series (Daily)'] ? this.parseTimeSeriesAdjusted(data['Time Series (Daily)']) : null;
    }

    parseTimeSeriesAdjusted(timeSeriesData) {
        const series = [];
        for (const [date, values] of Object.entries(timeSeriesData)) {
            series.push({
                date: date,
                open: parseFloat(values['1. open']),
                high: parseFloat(values['2. high']),
                low: parseFloat(values['3. low']),
                close: parseFloat(values['4. close']),
                adjustedClose: parseFloat(values['5. adjusted close']),
                volume: parseInt(values['6. volume']),
                dividendAmount: parseFloat(values['7. dividend amount']),
                splitCoefficient: parseFloat(values['8. split coefficient'])
            });
        }
        return series.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    // Search for symbols
    async symbolSearch(keywords) {
        const params = {
            function: 'SYMBOL_SEARCH',
            keywords: keywords
        };
        
        const data = await this.makeRequest(params);
        return data['bestMatches'] ? this.parseSymbolSearch(data['bestMatches']) : [];
    }

    parseSymbolSearch(matches) {
        return matches.map(match => ({
            symbol: match['1. symbol'],
            name: match['2. name'],
            type: match['3. type'],
            region: match['4. region'],
            marketOpen: match['5. marketOpen'],
            marketClose: match['6. marketClose'],
            timezone: match['7. timezone'],
            currency: match['8. currency'],
            matchScore: parseFloat(match['9. matchScore'])
        }));
    }

    // Get company overview
    async getCompanyOverview(symbol) {
        const params = {
            function: 'OVERVIEW',
            symbol: symbol
        };
        
        const data = await this.makeRequest(params);
        return Object.keys(data).length > 0 ? data : null;
    }

    // Get current market status
    async getMarketStatus() {
        const params = {
            function: 'MARKET_STATUS'
        };
        
        const data = await this.makeRequest(params);
        return data['markets'] || [];
    }

    // Get top gainers, losers, and most active
    async getMarketMovers(listType = 'active') {
        let functionName;
        switch(listType) {
            case 'gainers':
                functionName = 'TOP_GAINERS_LOSERS';
                break;
            case 'losers':
                functionName = 'TOP_GAINERS_LOSERS';
                break;
            case 'active':
            default:
                functionName = 'TOP_GAINERS_LOSERS';
        }
        
        const params = {
            function: functionName
        };
        
        const data = await this.makeRequest(params);
        
        if (listType === 'gainers') {
            return data['top_gainers'] || [];
        } else if (listType === 'losers') {
            return data['top_losers'] || [];
        } else {
            return data['most_actively_traded'] || [];
        }
    }

    // Get exchange rates
    async getExchangeRate(fromCurrency, toCurrency) {
        const params = {
            function: 'CURRENCY_EXCHANGE_RATE',
            from_currency: fromCurrency,
            to_currency: toCurrency
        };
        
        const data = await this.makeRequest(params);
        return data['Realtime Currency Exchange Rate'] ? this.parseExchangeRate(data['Realtime Currency Exchange Rate']) : null;
    }

    parseExchangeRate(rateData) {
        return {
            fromCurrency: rateData['1. From_Currency Code'],
            fromName: rateData['2. From_Currency Name'],
            toCurrency: rateData['3. To_Currency Code'],
            toName: rateData['4. To_Currency Name'],
            exchangeRate: parseFloat(rateData['5. Exchange Rate']),
            lastRefreshed: rateData['6. Last Refreshed'],
            timeZone: rateData['7. Time Zone'],
            bidPrice: parseFloat(rateData['8. Bid Price']),
            askPrice: parseFloat(rateData['9. Ask Price'])
        };
    }

    // Get SMA (Simple Moving Average)
    async getSMA(symbol, interval = 'daily', timePeriod = 20, seriesType = 'close') {
        const params = {
            function: 'SMA',
            symbol: symbol,
            interval: interval,
            time_period: timePeriod,
            series_type: seriesType
        };
        
        const data = await this.makeRequest(params);
        return data['Technical Analysis: SMA'] || {};
    }

    // Get RSI (Relative Strength Index)
    async getRSI(symbol, interval = 'daily', timePeriod = 14, seriesType = 'close') {
        const params = {
            function: 'RSI',
            symbol: symbol,
            interval: interval,
            time_period: timePeriod,
            series_type: seriesType
        };
        
        const data = await this.makeRequest(params);
        return data['Technical Analysis: RSI'] || {};
    }

    // Get MACD (Moving Average Convergence Divergence)
    async getMACD(symbol, interval = 'daily', seriesType = 'close') {
        const params = {
            function: 'MACD',
            symbol: symbol,
            interval: interval,
            series_type: seriesType
        };
        
        const data = await this.makeRequest(params);
        return data['Technical Analysis: MACD'] || {};
    }

    // Clear cache
    clearCache() {
        this.cache.clear();
    }

    // Set cache duration (in milliseconds)
    setCacheDuration(duration) {
        this.cacheDuration = duration;
    }
}

// Initialize the API with your key
const stockAPI = new StockAPI('ZFGYFKSFVIVE7WGT');

// Utility functions for the frontend
class StockApp {
    constructor() {
        this.api = stockAPI;
        this.initEventListeners();
    }

    initEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('stockSearch');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(this.handleSearch.bind(this), 300));
        }

        // Buy/Sell form submissions
        const buyForm = document.getElementById('buyForm');
        if (buyForm) {
            buyForm.addEventListener('submit', this.handleBuy.bind(this));
        }

        const sellForm = document.getElementById('sellForm');
        if (sellForm) {
            sellForm.addEventListener('submit', this.handleSell.bind(this));
        }

        // Portfolio refresh
        const refreshBtn = document.getElementById('refreshPortfolio');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', this.refreshPortfolio.bind(this));
        }
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    async handleSearch(event) {
        const query = event.target.value.trim();
        if (query.length < 2) return;

        try {
            const results = await this.api.symbolSearch(query);
            this.displaySearchResults(results);
        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    displaySearchResults(results) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;

        if (results.length === 0) {
            resultsContainer.innerHTML = '<div class="p-2 text-muted">No results found</div>';
            return;
        }

        resultsContainer.innerHTML = results.slice(0, 5).map(result => `
            <div class="search-result-item p-2 border-bottom" 
                 data-symbol="${result.symbol}"
                 style="cursor: pointer;">
                <strong>${result.symbol}</strong> - ${result.name}<br>
                <small class="text-muted">${result.region} · ${result.currency}</small>
            </div>
        `).join('');

        // Add click event to results
        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const symbol = item.getAttribute('data-symbol');
                document.getElementById('stockSearch').value = symbol;
                resultsContainer.innerHTML = '';
                this.getStockDetails(symbol);
            });
        });
    }

    async getStockDetails(symbol) {
        try {
            // Get multiple data points in parallel
            const [quote, overview, dailyData] = await Promise.all([
                this.api.getGlobalQuote(symbol),
                this.api.getCompanyOverview(symbol),
                this.api.getTimeSeriesDaily(symbol, 'compact')
            ]);

            this.displayStockDetails(symbol, quote, overview, dailyData);
        } catch (error) {
            console.error('Failed to get stock details:', error);
            this.showError('Failed to load stock details. Please try again.');
        }
    }

    displayStockDetails(symbol, quote, overview, dailyData) {
        // This would update the UI with stock details
        console.log('Stock details:', {symbol, quote, overview, dailyData});
        
        // Update price in buy/sell forms
        const priceInputs = document.querySelectorAll('.current-price');
        priceInputs.forEach(input => {
            if (quote && quote.price) {
                input.value = quote.price.toFixed(2);
                input.setAttribute('data-symbol', symbol);
            }
        });

        // Update stock info display
        const infoDiv = document.getElementById('stockInfo');
        if (infoDiv && overview) {
            infoDiv.innerHTML = `
                <h4>${overview.Name} (${symbol})</h4>
                <p>${overview.Description?.substring(0, 200)}...</p>
                <div class="row">
                    <div class="col-md-6">
                        <strong>Sector:</strong> ${overview.Sector}<br>
                        <strong>Industry:</strong> ${overview.Industry}<br>
                        <strong>Market Cap:</strong> ${this.formatMarketCap(overview.MarketCapitalization)}
                    </div>
                    <div class="col-md-6">
                        <strong>PE Ratio:</strong> ${overview.PERatio}<br>
                        <strong>Dividend Yield:</strong> ${overview.DividendYield || 'N/A'}<br>
                        <strong>52W High/Low:</strong> ${overview['52WeekHigh']}/${overview['52WeekLow']}
                    </div>
                </div>
            `;
        }
    }

    formatMarketCap(marketCap) {
        if (!marketCap) return 'N/A';
        
        const num = parseFloat(marketCap);
        if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toFixed(2)}`;
    }

    async handleBuy(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        const symbol = formData.get('symbol');
        const quantity = parseInt(formData.get('quantity'));
        
        try {
            const quote = await this.api.getGlobalQuote(symbol);
            if (!quote) {
                throw new Error('Could not get current price');
            }

            // Here you would typically send this to your backend
            console.log('Buy order:', {symbol, quantity, price: quote.price});
            
            // Show success message
            this.showSuccess(`Buy order placed for ${quantity} shares of ${symbol} at $${quote.price.toFixed(2)}`);
            
            // Refresh portfolio
            this.refreshPortfolio();
            
        } catch (error) {
            console.error('Buy failed:', error);
            this.showError('Failed to place buy order. Please try again.');
        }
    }

    async handleSell(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        const symbol = formData.get('symbol');
        const quantity = parseInt(formData.get('quantity'));
        
        try {
            const quote = await this.api.getGlobalQuote(symbol);
            if (!quote) {
                throw new Error('Could not get current price');
            }

            // Here you would typically send this to your backend
            console.log('Sell order:', {symbol, quantity, price: quote.price});
            
            // Show success message
            this.showSuccess(`Sell order placed for ${quantity} shares of ${symbol} at $${quote.price.toFixed(2)}`);
            
            // Refresh portfolio
            this.refreshPortfolio();
            
        } catch (error) {
            console.error('Sell failed:', error);
            this.showError('Failed to place sell order. Please try again.');
        }
    }

    async refreshPortfolio() {
        try {
            // This would fetch updated portfolio data from your backend
            // and update prices using the API
            console.log('Refreshing portfolio...');
            
            // Show loading state
            this.showLoading('Updating portfolio...');
            
            // Simulate API call delay
            setTimeout(() => {
                this.hideLoading();
                this.showSuccess('Portfolio updated successfully');
            }, 1000);
            
        } catch (error) {
            console.error('Portfolio refresh failed:', error);
            this.showError('Failed to refresh portfolio. Please try again.');
        }
    }

    showError(message) {
        // Implement error toast/notification
        console.error('Error:', message);
        alert('Error: ' + message); // Replace with better UI
    }

    showSuccess(message) {
        // Implement success toast/notification
        console.log('Success:', message);
        alert('Success: ' + message); // Replace with better UI
    }

    showLoading(message) {
        // Implement loading indicator
        console.log('Loading:', message);
    }

    hideLoading() {
        // Hide loading indicator
        console.log('Loading complete');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.stockApp = new StockApp();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StockAPI, StockApp };
}