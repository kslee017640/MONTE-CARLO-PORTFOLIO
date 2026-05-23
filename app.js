// app.js

// Default portfolio assets & weights requested by the user
const DEFAULT_PORTFOLIO = [
  { ticker: 'QQQ',    name: 'Invesco QQQ Trust',                          allocation: 5  },
  { ticker: 'QLD',    name: 'ProShares Ultra QQQ (2x)',                   allocation: 5  },
  { ticker: 'TQQQ',   name: 'ProShares UltraPro QQQ (3x)',                allocation: 35 },
  { ticker: 'SOXX',   name: 'iShares Semiconductor ETF',                  allocation: 3  },
  { ticker: 'USD',    name: 'ProShares Ultra Semiconductors (2x)',         allocation: 2  },
  { ticker: 'SOXL',   name: 'Direxion Daily Semiconductor Bull 3x',       allocation: 10 },
  { ticker: 'BTC-USD',name: 'Bitcoin USD',                                allocation: 15 },
  { ticker: 'TSLA',   name: 'Tesla Inc.',                                 allocation: 5  },
  { ticker: 'AAPL',   name: 'Apple Inc.',                                 allocation: 5  },
  { ticker: 'AAPU',   name: 'Direxion Daily AAPL Bull 1.5X Shares',       allocation: 0  },
  { ticker: 'TSLL',   name: 'Direxion Daily TSLA Bull 2X Shares',         allocation: 0  },
  { ticker: 'SCHD',   name: 'Schwab US Dividend Equity ETF',              allocation: 10 },
  { ticker: 'JEPQ',   name: 'JPMorgan Nasdaq Equity Premium ETF',         allocation: 5  },
];

// App State
let state = {
  portfolio: [...DEFAULT_PORTFOLIO],
  historicalPrices: {}, // ticker -> { dates: [], prices: [] }
  calibratedParams: {}, // ticker -> { cagr: num, vol: num, sharpe: num, startDate: str, endDate: str }
  correlationMatrix: [], // 2D array of correlation coefficients
  alignedDates: [],
  simulationResults: null,
  manualModeActive: false,
  worker: null
};

// Chart.js Instances
let allocationPieChart = null;
let projectionLineChart = null;

// DOM Elements
const elements = {
  portfolioType: document.getElementById('portfolioType'),
  initialAmount: document.getElementById('initialAmount'),
  cashflowType: document.getElementById('cashflowType'),
  cashflowAmount: document.getElementById('cashflowAmount'),
  cashflowFreq: document.getElementById('cashflowFreq'),
  cashflowAmountLabel: document.getElementById('cashflowAmountLabel'),
  inflationAdjusted: document.getElementById('inflationAdjusted'),
  inflationRate: document.getElementById('inflationRate'),
  simulationPeriod: document.getElementById('simulationPeriod'),
  rebalanceFreq: document.getElementById('rebalanceFreq'),
  historicalPeriod: document.getElementById('historicalPeriod'),
  riskFreeRate: document.getElementById('riskFreeRate'),
  percentileIntervals: document.getElementById('percentileIntervals'),
  simRunsCount: document.getElementById('simRunsCount'),
  simulationModel: document.getElementById('simulationModel'),
  
  tickerListContainer: document.getElementById('tickerListContainer'),
  newTickerInput: document.getElementById('newTickerInput'),
  btnAddTicker: document.getElementById('btnAddTicker'),
  allocationTotalVal: document.getElementById('allocationTotalVal'),
  allocationProgressFill: document.getElementById('allocationProgressFill'),
  allocationTotalBar: document.getElementById('allocationTotalBar'),
  
  btnReset: document.getElementById('btnReset'),
  btnLoadDefaults: document.getElementById('btnLoadDefaults'),
  btnCalibrate: document.getElementById('btnCalibrate'),
  btnRunSimulation: document.getElementById('btnRunSimulation'),
  
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  calibrationPeriodInfo: document.getElementById('calibrationPeriodInfo'),
  parametersTableBody: document.getElementById('parametersTableBody'),
  
  sectionCalibration: document.getElementById('sectionCalibration'),
  sectionResults: document.getElementById('sectionResults'),
  probabilitiesContainer: document.getElementById('probabilitiesContainer'),
  summaryTableHeaderRow: document.getElementById('summaryTableHeaderRow'),
  summaryTableBody: document.getElementById('summaryTableBody'),
  resultsDescriptionText: document.getElementById('resultsDescriptionText'),
  
  chkLogScale: document.getElementById('chkLogScale'),
  chkInflationAdjusted: document.getElementById('chkInflationAdjusted'),
  btnDownloadCSV: document.getElementById('btnDownloadCSV'),
  btnDownloadJSON: document.getElementById('btnDownloadJSON'),
  
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingText: document.getElementById('loadingText'),
  loadingSubtext: document.getElementById('loadingSubtext'),
  progressBarContainer: document.getElementById('progressBarContainer'),
  progressBarFill: document.getElementById('progressBarFill'),
  
  manualDataEditor: document.getElementById('manualDataEditor'),
  manualInputsContainer: document.getElementById('manualInputsContainer'),
  btnToggleManual: document.getElementById('btnToggleManual'),
  btnApplyManual: document.getElementById('btnApplyManual'),
  btnCancelManual: document.getElementById('btnCancelManual'),
  
  heatmapGrid: document.getElementById('heatmapGrid'),
  heatmapLabels: document.getElementById('heatmapLabels'),

  // Modal elements for Candlestick Charts
  chartModal: document.getElementById('chartModal'),
  modalChartTitle: document.getElementById('modalChartTitle'),
  modalChartContainer: document.getElementById('modalChartContainer'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  btnZoomOutModal: document.getElementById('btnZoomOutModal')
};

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  renderTickers();
  updateAllocationTotal();
  initAllocationPieChart();
  
  // Wire events
  elements.btnAddTicker.addEventListener('click', addTicker);
  elements.newTickerInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTicker();
  });
  elements.btnLoadDefaults.addEventListener('click', loadDefaults);
  elements.btnReset.addEventListener('click', resetPortfolio);
  elements.btnCalibrate.addEventListener('click', calibrateParameters);
  elements.btnRunSimulation.addEventListener('click', runMonteCarlo);
  
  elements.cashflowType.addEventListener('change', handleCashflowTypeChange);
  elements.btnToggleManual.addEventListener('click', toggleManualEditor);
  elements.btnCancelManual.addEventListener('click', toggleManualEditor);
  elements.btnApplyManual.addEventListener('click', applyManualParams);
  
  elements.chkLogScale.addEventListener('change', updateProjectionChart);
  elements.chkInflationAdjusted.addEventListener('change', updateProjectionChart);
  
  elements.btnDownloadCSV.addEventListener('click', downloadCSV);
  elements.btnDownloadJSON.addEventListener('click', downloadJSONState);
  
  // Modal handlers
  elements.btnCloseModal.addEventListener('click', closeModal);
  elements.chartModal.addEventListener('click', (e) => {
    if (e.target === elements.chartModal) closeModal();
  });
  elements.btnZoomOutModal.addEventListener('click', () => {
    if (modalLightweightChartInstance) {
      modalLightweightChartInstance.timeScale().fitContent();
    }
  });

  handleCashflowTypeChange();
});

// Reset Portfolio
function resetPortfolio() {
  state.portfolio = [];
  renderTickers();
  updateAllocationTotal();
  updateAllocationPieChart();
  resetCalibrationState();
}

// Load default portfolio
function loadDefaults() {
  state.portfolio = [...DEFAULT_PORTFOLIO];
  renderTickers();
  updateAllocationTotal();
  updateAllocationPieChart();
  resetCalibrationState();
}

// Reset calibration and simulation state
function resetCalibrationState() {
  state.historicalPrices = {};
  state.calibratedParams = {};
  state.correlationMatrix = [];
  state.alignedDates = [];
  state.simulationResults = null;
  state.manualModeActive = false;
  elements.manualDataEditor.classList.remove('active');
  
  elements.statusDot.className = 'status-dot';
  elements.statusText.innerText = '설정 대기 중. 종목 비중을 입력하고 [1단계]를 실행해주세요.';
  elements.calibrationPeriodInfo.innerText = '차트 기준 기간: -';
  
  elements.parametersTableBody.innerHTML = `
    <tr>
      <td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">
        [1단계: 과거 상수값 추출] 버튼을 눌러 실제 과거 데이터를 로드해주세요.
      </td>
    </tr>
  `;
  
  elements.heatmapGrid.innerHTML = '';
  elements.heatmapGrid.style.gridTemplateColumns = 'none';
  elements.heatmapLabels.innerHTML = '';
  
  elements.btnRunSimulation.disabled = true;
  elements.sectionResults.style.opacity = '0.5';
  elements.sectionResults.style.pointerEvents = 'none';
  
  if (projectionLineChart) {
    projectionLineChart.destroy();
    projectionLineChart = null;
  }
}

// Handle cashflow inputs visibility
function handleCashflowTypeChange() {
  const type = elements.cashflowType.value;
  if (type === 'none') {
    elements.cashflowAmount.disabled = true;
    elements.cashflowFreq.disabled = true;
    elements.cashflowAmount.style.opacity = '0.5';
    elements.cashflowFreq.style.opacity = '0.5';
  } else {
    elements.cashflowAmount.disabled = false;
    elements.cashflowFreq.disabled = false;
    elements.cashflowAmount.style.opacity = '1';
    elements.cashflowFreq.style.opacity = '1';
    elements.cashflowAmountLabel.innerText = type === 'contribute' ? '추가 납입액' : '정기 인출액';
  }
}

// Render inputs list for tickers
function renderTickers() {
  elements.tickerListContainer.innerHTML = '';
  state.portfolio.forEach((asset, index) => {
    const item = document.createElement('div');
    item.className = 'ticker-item';
    
    // Display standard Ticker (stripping -USD for display clarity)
    const displaySymbol = asset.ticker.endsWith('-USD') ? asset.ticker.replace('-USD', '') : asset.ticker;
    
    item.innerHTML = `
      <div style="display:flex; flex-direction:column; min-width:0;">
        <span class="ticker-symbol">${displaySymbol}</span>
        <span style="font-size:0.75rem; color:var(--color-text-secondary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${asset.name}">${asset.name}</span>
      </div>
      <div class="input-container input-with-suffix">
        <input type="number" class="ticker-weight-input" data-index="${index}" value="${asset.allocation}" min="0" max="100" step="1">
        <span class="suffix">%</span>
      </div>
      <button type="button" class="remove-ticker-btn" data-index="${index}">✕</button>
    `;
    
    // Weight change event
    item.querySelector('.ticker-weight-input').addEventListener('input', (e) => {
      let val = parseFloat(e.target.value) || 0;
      if (val < 0) val = 0;
      if (val > 100) val = 100;
      state.portfolio[index].allocation = val;
      updateAllocationTotal();
      updateAllocationPieChart();
    });
    
    // Remove ticker event
    item.querySelector('.remove-ticker-btn').addEventListener('click', () => {
      state.portfolio.splice(index, 1);
      renderTickers();
      updateAllocationTotal();
      updateAllocationPieChart();
      resetCalibrationState();
    });
    
    elements.tickerListContainer.appendChild(item);
  });
}

// Add ticker to list
function addTicker() {
  let ticker = elements.newTickerInput.value.trim().toUpperCase();
  if (!ticker) return;
  
  // Known ticker name map
  const knownNames = {
    'QQQ':  'Invesco QQQ Trust',
    'QLD':  'ProShares Ultra QQQ (2x)',
    'TQQQ': 'ProShares UltraPro QQQ (3x)',
    'SOXX': 'iShares Semiconductor ETF',
    'USD':  'ProShares Ultra Semiconductors (2x)',
    'SOXL': 'Direxion Daily Semiconductor Bull 3x',
    'TSLA': 'Tesla Inc.',
    'AAPL': 'Apple Inc.',
    'AAPU': 'Direxion Daily AAPL Bull 1.5X Shares',
    'TSLL': 'Direxion Daily TSLA Bull 2X Shares',
    'SCHD': 'Schwab US Dividend Equity ETF',
    'JEPQ': 'JPMorgan Nasdaq Equity Premium ETF',
    'NVDA': 'NVIDIA Corporation',
    'MSFT': 'Microsoft Corporation',
    'AMZN': 'Amazon.com Inc.',
    'GOOGL':'Alphabet Inc.',
    'META': 'Meta Platforms Inc.',
    'SPY':  'SPDR S&P 500 ETF Trust',
    'VOO':  'Vanguard S&P 500 ETF',
    'VTI':  'Vanguard Total Stock Market ETF',
    'TLT':  'iShares 20+ Year Treasury Bond ETF',
    'GLD':  'SPDR Gold Shares',
  };

  // Format crypto tickers
  let apiTicker = ticker;
  const cryptos = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'ADA', 'AVAX', 'DOT', 'MATIC', 'LINK'];
  if (cryptos.includes(ticker)) {
    apiTicker = ticker + '-USD';
  }

  let tickerName = knownNames[ticker] || knownNames[apiTicker.replace('-USD', '')] || (ticker + ' Stock');
  if (cryptos.includes(ticker)) {
    tickerName = ticker + ' Cryptocurrency';
  }
  
  // Check duplicates
  if (state.portfolio.some(asset => asset.ticker === apiTicker)) {
    alert("이미 추가된 티커입니다.");
    return;
  }
  
  state.portfolio.push({
    ticker: apiTicker,
    name: tickerName,
    allocation: 0
  });
  
  elements.newTickerInput.value = '';
  renderTickers();
  updateAllocationTotal();
  updateAllocationPieChart();
  resetCalibrationState();
}

// Update allocation total sum
function updateAllocationTotal() {
  const total = state.portfolio.reduce((sum, asset) => sum + asset.allocation, 0);
  elements.allocationTotalVal.innerText = `${total}%`;
  elements.allocationProgressFill.style.width = `${Math.min(total, 100)}%`;
  
  if (total === 100) {
    elements.allocationTotalBar.className = 'allocation-total-bar valid';
    elements.allocationProgressFill.className = 'allocation-progress-fill valid';
    elements.btnCalibrate.disabled = false;
  } else {
    elements.allocationTotalBar.className = 'allocation-total-bar invalid';
    elements.allocationProgressFill.className = 'allocation-progress-fill invalid';
    elements.btnCalibrate.disabled = false; // still allow calibration, but will restrict simulation run
  }
}

// Initialize Allocation Chart (Pie)
function initAllocationPieChart() {
  const ctx = document.getElementById('allocationPieChart').getContext('2d');
  allocationPieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [
          '#6366f1', '#06b6d4', '#10b981', '#a855f7', '#f43f5e',
          '#f59e0b', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6', '#f97316'
        ],
        borderWidth: 1,
        borderColor: '#1e293b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // We show details in tables
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.label}: ${context.raw}%`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

// Update Allocation Pie Chart
function updateAllocationPieChart() {
  if (!allocationPieChart) return;
  
  const labels = state.portfolio.map(a => a.ticker.replace('-USD', ''));
  const data = state.portfolio.map(a => a.allocation);
  
  allocationPieChart.data.labels = labels;
  allocationPieChart.data.datasets[0].data = data;
  allocationPieChart.update();
}

// Show/Hide Loading Overlay
function showLoading(show, title = '', subtitle = '', isProgress = false) {
  if (show) {
    elements.loadingOverlay.classList.add('active');
    elements.loadingText.innerText = title;
    elements.loadingSubtext.innerText = subtitle;
    if (isProgress) {
      elements.progressBarContainer.style.display = 'block';
      elements.progressBarFill.style.width = '0%';
    } else {
      elements.progressBarContainer.style.display = 'none';
    }
  } else {
    elements.loadingOverlay.classList.remove('active');
  }
}

// Fetch historical data for a ticker using CORS proxy (includes OHLC for candlestick charts)
async function fetchTickerHistoricalData(ticker, period) {
  // Translate ticker names
  let apiTicker = ticker.trim().toUpperCase();
  if (apiTicker === 'BTC' || apiTicker === '^BTC') {
    apiTicker = 'BTC-USD';
  }
  
  const proxies = [
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  ];
  
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${apiTicker}?range=${period}&interval=1d`;
  
  let lastError = null;
  for (let i = 0; i < proxies.length; i++) {
    try {
      const proxiedUrl = proxies[i](targetUrl);
      const response = await fetch(proxiedUrl);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const data = await response.json();
      
      const chart = data.chart?.result?.[0];
      if (!chart) throw new Error("No chart data in Yahoo response");
      
      const timestamps = chart.timestamp || [];
      const quotes = chart.indicators?.quote?.[0] || {};
      const adjClose = chart.indicators?.adjclose?.[0]?.adjclose || quotes.close || [];
      const opens = quotes.open || [];
      const highs = quotes.high || [];
      const lows = quotes.low || [];
      const closes = quotes.close || [];
      
      const dates = [];
      const prices = [];
      const ohlc = [];
      
      for (let j = 0; j < timestamps.length; j++) {
        if (adjClose[j] !== null && adjClose[j] !== undefined && !isNaN(adjClose[j])) {
          const dateStr = new Date(timestamps[j] * 1000).toISOString().split('T')[0];
          dates.push(dateStr);
          prices.push(adjClose[j]);
          
          // Verify and save OHLC for candlestick chart
          if (opens[j] !== null && highs[j] !== null && lows[j] !== null && closes[j] !== null &&
              opens[j] !== undefined && highs[j] !== undefined && lows[j] !== undefined && closes[j] !== undefined) {
            ohlc.push({
              time: dateStr,
              open: opens[j],
              high: highs[j],
              low: lows[j],
              close: closes[j]
            });
          }
        }
      }
      
      if (prices.length === 0) throw new Error("No valid closing prices found");
      
      // Get shortName from metadata
      const shortName = chart.meta?.shortName || ticker;
      
      return { ticker, dates, prices, ohlc, shortName };
    } catch (e) {
      console.warn(`Proxy ${i} failed for ${ticker}: ${e.message}`);
      lastError = e;
    }
  }
  
  throw new Error(`Failed to fetch ${ticker}: ${lastError ? lastError.message : 'Unknown network error'}`);
}

// Step 1: Calibrate Parameters from Historical Data
async function calibrateParameters() {
  if (state.portfolio.length === 0) {
    alert("포트폴리오에 자산이 없습니다.");
    return;
  }
  
  const total = state.portfolio.reduce((sum, asset) => sum + asset.allocation, 0);
  if (total !== 100) {
    alert(`포트폴리오 비중 합계가 100%이어야 시뮬레이션을 실행할 수 있습니다. (현재: ${total}%)`);
    // but we can still fetch parameters
  }
  
  const period = elements.historicalPeriod.value;
  showLoading(true, "차트 데이터 수집 중...", "각 자산별 실제 과거 종가를 다운로드 중입니다...");
  
  elements.statusDot.className = 'status-dot loading';
  elements.statusText.innerText = '야후 파이낸스 데이터 로딩 중...';
  
  try {
    const fetchedResults = [];
    for (const asset of state.portfolio) {
      elements.statusText.innerText = `${asset.ticker} 다운로드 중...`;
      const data = await fetchTickerHistoricalData(asset.ticker, period);
      fetchedResults.push(data);
      // update company name if generic
      if (asset.name.includes("Stock") || asset.name.includes("Cryptocurrency")) {
        asset.name = data.shortName;
      }
    }
    
    // Store in state
    state.historicalPrices = {};
    fetchedResults.forEach(res => {
      state.historicalPrices[res.ticker] = {
        dates: res.dates,
        prices: res.prices,
        ohlc: res.ohlc
      };
    });
    
    // Align price dates across all assets (Common Period)
    alignDatesAndPrices();
    
    // Calculate statistical returns, volatilities, and correlations
    calculateStatistics();
    
    // Populate GUI Table
    renderParametersTable();
    
    // Draw Correlation Heatmap
    renderCorrelationHeatmap();
    
    elements.statusDot.className = 'status-dot active';
    elements.statusText.innerText = '상수값 추출 완료. 모수가 정상적으로 세팅되었습니다.';
    
    // Enable simulation button if total weight is 100
    if (total === 100) {
      elements.btnRunSimulation.disabled = false;
      elements.statusText.innerText += ' [2단계: 가격 예측 실행] 버튼을 눌러 시뮬레이션을 실행하세요.';
    } else {
      elements.btnRunSimulation.disabled = true;
      elements.statusText.innerText += ' (시뮬레이션을 하려면 포트폴리오 비중 합계를 100%로 맞춰주세요.)';
    }
    
    renderTickers(); // update names in ticker list
    updateAllocationPieChart();
    
    showLoading(false);
  } catch (error) {
    console.error(error);
    showLoading(false);
    elements.statusDot.className = 'status-dot error';
    elements.statusText.innerText = `데이터 수집 실패: ${error.message}. 오른쪽 [수동] 입력창을 켜서 값을 직접 지정하거나 다시 시도해보세요.`;
    
    // Automatically toggle manual mode on fail
    state.manualModeActive = false;
    toggleManualEditor();
  }
}

// Align dates of historical datasets using intersection
function alignDatesAndPrices() {
  const tickers = Object.keys(state.historicalPrices);
  if (tickers.length === 0) return;
  
  // Find intersection of all date arrays
  let commonDates = [...state.historicalPrices[tickers[0]].dates];
  
  for (let i = 1; i < tickers.length; i++) {
    const tickerDates = new Set(state.historicalPrices[tickers[i]].dates);
    commonDates = commonDates.filter(d => tickerDates.has(d));
  }
  
  if (commonDates.length < 10) {
    // If intersection is too small, fall back to union with forward-filling
    console.warn("Intersection of dates too small. Using union calendar with forward-fill.");
    const allDatesSet = new Set();
    tickers.forEach(t => {
      state.historicalPrices[t].dates.forEach(d => allDatesSet.add(d));
    });
    commonDates = Array.from(allDatesSet).sort();
  }
  
  state.alignedDates = commonDates;
  
  // Create aligned price arrays
  state.alignedPrices = {};
  tickers.forEach(ticker => {
    const origDates = state.historicalPrices[ticker].dates;
    const origPrices = state.historicalPrices[ticker].prices;
    
    // Date to Price map
    const dateMap = {};
    for (let i = 0; i < origDates.length; i++) {
      dateMap[origDates[i]] = origPrices[i];
    }
    
    const alignedPricesArr = new Float64Array(commonDates.length);
    let lastPrice = origPrices[0];
    
    // Forward fill missing prices
    for (let i = 0; i < commonDates.length; i++) {
      const d = commonDates[i];
      if (dateMap[d] !== undefined) {
        alignedPricesArr[i] = dateMap[d];
        lastPrice = dateMap[d];
      } else {
        alignedPricesArr[i] = lastPrice;
      }
    }
    
    state.alignedPrices[ticker] = alignedPricesArr;
  });
  
  const startD = commonDates[0];
  const endD = commonDates[commonDates.length - 1];
  elements.calibrationPeriodInfo.innerText = `차트 기준 기간: ${startD} ~ ${endD} (${tickers.length}개 종목 정렬됨)`;
}

// Calculate parameters (Returns, Volatilities, Correlation matrix)
function calculateStatistics() {
  const tickers = state.portfolio.map(a => a.ticker);
  const N = state.alignedDates.length;
  if (N <= 1) return;
  
  const returns = {};
  const means = {};
  const stdDevs = {};
  const cagrVals = {};
  
  // 1. Calculate Daily Log Returns
  tickers.forEach(ticker => {
    const prices = state.alignedPrices[ticker];
    const logRets = new Float64Array(N - 1);
    let sum = 0;
    
    for (let t = 1; t < N; t++) {
      logRets[t - 1] = Math.log(prices[t] / prices[t - 1]);
      sum += logRets[t - 1];
    }
    
    returns[ticker] = logRets;
    const mean = sum / (N - 1);
    means[ticker] = mean;
    
    let sqSum = 0;
    for (let t = 0; t < N - 1; t++) {
      const diff = logRets[t] - mean;
      sqSum += diff * diff;
    }
    const variance = sqSum / (N - 2);
    stdDevs[ticker] = Math.sqrt(variance);
    
    // CAGR calculation from start to end price
    const startPrice = prices[0];
    const endPrice = prices[N - 1];
    const startDateObj = new Date(state.alignedDates[0]);
    const endDateObj = new Date(state.alignedDates[N - 1]);
    const diffYears = (endDateObj - startDateObj) / (1000 * 60 * 60 * 24 * 365.25);
    
    cagrVals[ticker] = diffYears > 0.05 ? Math.pow(endPrice / startPrice, 1 / diffYears) - 1 : mean * 252;
  });
  
  // 2. Correlation Matrix
  const M = tickers.length;
  const corrMatrix = Array.from({ length: M }, () => new Float64Array(M));
  
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      if (i === j) {
        corrMatrix[i][j] = 1.0;
        continue;
      }
      
      const t1 = tickers[i];
      const t2 = tickers[j];
      const ret1 = returns[t1];
      const ret2 = returns[t2];
      const mean1 = means[t1];
      const mean2 = means[t2];
      
      let covSum = 0;
      let varSum1 = 0;
      let varSum2 = 0;
      
      for (let t = 0; t < N - 1; t++) {
        const d1 = ret1[t] - mean1;
        const d2 = ret2[t] - mean2;
        covSum += d1 * d2;
        varSum1 += d1 * d1;
        varSum2 += d2 * d2;
      }
      
      corrMatrix[i][j] = varSum1 > 0 && varSum2 > 0 ? covSum / Math.sqrt(varSum1 * varSum2) : 0;
    }
  }
  
  state.correlationMatrix = corrMatrix;
  
  // 3. Store calibrated parameters
  const riskFreeRateVal = parseFloat(elements.riskFreeRate.value) / 100;
  
  state.portfolio.forEach(asset => {
    const t = asset.ticker;
    const annualVol = stdDevs[t] * Math.sqrt(252);
    const cagr = cagrVals[t];
    const sharpe = annualVol > 0 ? (cagr - riskFreeRateVal) / annualVol : 0;
    
    state.calibratedParams[t] = {
      cagr: cagr,
      volatility: annualVol,
      sharpe: sharpe,
      startDate: state.alignedDates[0],
      endDate: state.alignedDates[N - 1]
    };
  });
}

// Render Parameters summary table
function renderParametersTable() {
  elements.parametersTableBody.innerHTML = '';
  
  state.portfolio.forEach(asset => {
    const params = state.calibratedParams[asset.ticker];
    if (!params) return;
    
    const row = document.createElement('tr');
    
    const displaySymbol = asset.ticker.replace('-USD', '');
    const cagrFormatted = (params.cagr * 100).toFixed(2) + '%';
    const volFormatted = (params.volatility * 100).toFixed(2) + '%';
    const sharpeFormatted = params.sharpe.toFixed(2);
    
    row.innerHTML = `
      <td class="ticker-symbol" style="color:var(--accent-cyan); cursor:pointer; text-decoration:underline;" title="클릭하여 실제 캔들 차트 조회">${displaySymbol}</td>
      <td style="font-size:0.8rem; color:var(--color-text-secondary); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${asset.name}">${asset.name}</td>
      <td style="text-align: right; font-weight:600; color:var(--accent-emerald);">${cagrFormatted}</td>
      <td style="text-align: right; color:var(--color-text-secondary);">${volFormatted}</td>
      <td style="text-align: right; font-weight:500;">${sharpeFormatted}</td>
      <td style="text-align: right; font-weight:600; color:var(--accent-indigo);">${asset.allocation}%</td>
    `;
    
    // Add click handler to ticker cell for Candlestick Modal
    row.querySelector('.ticker-symbol').addEventListener('click', () => {
      showCandlestickChart(asset.ticker);
    });
    
    elements.parametersTableBody.appendChild(row);
  });
}

// Render Correlation Heatmap Grid
function renderCorrelationHeatmap() {
  const M = state.portfolio.length;
  elements.heatmapGrid.innerHTML = '';
  elements.heatmapLabels.innerHTML = '';
  
  if (M === 0) return;
  
  // Setup grid columns
  elements.heatmapGrid.style.gridTemplateColumns = `repeat(${M}, 1fr)`;
  
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const coef = state.correlationMatrix[i][j];
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell';
      cell.innerText = coef.toFixed(2);
      
      // Compute color
      // positive -> Cyan/Blue, negative -> Rose, neutral -> transparent
      let bgColor = 'rgba(30, 41, 59, 0.45)';
      if (coef > 0) {
        // interpolate cyan
        bgColor = `rgba(6, 182, 212, ${coef.toFixed(2) * 0.85})`;
      } else if (coef < 0) {
        // interpolate rose
        bgColor = `rgba(244, 63, 94, ${Math.abs(coef).toFixed(2) * 0.85})`;
      }
      
      cell.style.background = bgColor;
      
      const t1 = state.portfolio[i].ticker.replace('-USD', '');
      const t2 = state.portfolio[j].ticker.replace('-USD', '');
      cell.title = `${t1} & ${t2}: ${coef.toFixed(4)}`;
      
      elements.heatmapGrid.appendChild(cell);
    }
  }
  
  // Render Labels
  state.portfolio.forEach((asset, idx) => {
    const lbl = document.createElement('span');
    lbl.innerHTML = `<strong style="color:var(--accent-cyan);">${idx + 1}</strong>: ${asset.ticker.replace('-USD', '')}`;
    elements.heatmapLabels.appendChild(lbl);
  });
}

// Toggle Manual Parameter Override Panel
function toggleManualEditor() {
  state.manualModeActive = !state.manualModeActive;
  
  if (state.manualModeActive) {
    elements.manualDataEditor.classList.add('active');
    elements.btnToggleManual.innerText = '✕ 수동 끄기';
    
    // Populate manual inputs
    elements.manualInputsContainer.innerHTML = '';
    state.portfolio.forEach((asset, index) => {
      const p = state.calibratedParams[asset.ticker] || { cagr: 0.1, volatility: 0.2 };
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1.2fr 1fr 1fr';
      row.style.gap = '0.75rem';
      row.style.alignItems = 'center';
      row.style.background = 'rgba(255,255,255,0.02)';
      row.style.padding = '0.5rem';
      row.style.borderRadius = '6px';
      
      row.innerHTML = `
        <div style="font-weight:700; color:var(--accent-cyan);">${asset.ticker.replace('-USD', '')} (${asset.allocation}%)</div>
        <div class="input-container input-with-suffix">
          <input type="number" class="manual-cagr-input" data-ticker="${asset.ticker}" value="${(p.cagr * 100).toFixed(2)}" step="0.1">
          <span class="suffix">%</span>
        </div>
        <div class="input-container input-with-suffix">
          <input type="number" class="manual-vol-input" data-ticker="${asset.ticker}" value="${(p.volatility * 100).toFixed(2)}" step="0.1">
          <span class="suffix">%</span>
        </div>
      `;
      elements.manualInputsContainer.appendChild(row);
    });
  } else {
    elements.manualDataEditor.classList.remove('active');
    elements.btnToggleManual.innerText = '✏️ 값 직접 수정 (수동)';
  }
}

// Apply Manual Overrides
function applyManualParams() {
  const cagrInputs = elements.manualInputsContainer.querySelectorAll('.manual-cagr-input');
  const volInputs = elements.manualInputsContainer.querySelectorAll('.manual-vol-input');
  const riskFreeRateVal = parseFloat(elements.riskFreeRate.value) / 100;
  
  cagrInputs.forEach((input, index) => {
    const ticker = input.getAttribute('data-ticker');
    const customCAGR = parseFloat(input.value) / 100;
    const customVol = parseFloat(volInputs[index].value) / 100;
    
    if (!state.calibratedParams[ticker]) {
      state.calibratedParams[ticker] = {
        startDate: '수동입력',
        endDate: '수동입력'
      };
    }
    
    state.calibratedParams[ticker].cagr = customCAGR;
    state.calibratedParams[ticker].volatility = customVol;
    state.calibratedParams[ticker].sharpe = customVol > 0 ? (customCAGR - riskFreeRateVal) / customVol : 0;
  });
  
  // Set correlation matrix to diagonal identity if not populated
  if (state.correlationMatrix.length === 0) {
    const M = state.portfolio.length;
    state.correlationMatrix = Array.from({ length: M }, () => new Float64Array(M));
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < M; j++) {
        state.correlationMatrix[i][j] = i === j ? 1.0 : 0.0;
      }
    }
  }
  
  // Re-render parameters UI
  renderParametersTable();
  renderCorrelationHeatmap();
  
  elements.statusDot.className = 'status-dot active';
  elements.statusText.innerText = '수동 설정 모수가 반영되었습니다. 시뮬레이션을 실행해주세요.';
  elements.btnRunSimulation.disabled = false;
  
  toggleManualEditor();
}

// Cholesky factor matrix generation (Safe, checks positive-definiteness)
function getCholeskyFactor(matrix) {
  const n = matrix.length;
  const L = Array.from({ length: n }, () => new Float64Array(n));
  
  // Add a tiny regularization to diagonal for numerical stability
  const regMatrix = Array.from({ length: n }, (_, i) => {
    const row = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      row[j] = matrix[i][j];
    }
    row[i] += 1e-5; // add diagonal load
    return row;
  });
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      
      if (i === j) {
        const val = regMatrix[i][i] - sum;
        if (val <= 0) {
          console.warn("Cholesky failed due to non-positive definite matrix. Using independent assets.");
          return null; // indicates failure, fallback to Independent returns
        }
        L[i][j] = Math.sqrt(val);
      } else {
        L[i][j] = (regMatrix[i][j] - sum) / L[j][j];
      }
    }
  }
  return L;
}

// Step 2: Dispatch and Run Monte Carlo Simulation
function runMonteCarlo() {
  const total = state.portfolio.reduce((sum, asset) => sum + asset.allocation, 0);
  if (total !== 100) {
    alert(`포트폴리오 비중 합계가 100%이어야 시뮬레이션을 실행할 수 있습니다. (현재: ${total}%)`);
    return;
  }
  
  const years = parseInt(elements.simulationPeriod.value);
  const numPaths = parseInt(elements.simRunsCount.value);
  const initialAmountVal = parseFloat(elements.initialAmount.value);
  const cashflowTypeVal = elements.cashflowType.value;
  const cashflowAmountVal = parseFloat(elements.cashflowAmount.value) || 0;
  const cashflowFreqVal = elements.cashflowFreq.value;
  const inflationAdjustedVal = elements.inflationAdjusted.value === 'yes';
  const inflationRateVal = parseFloat(elements.inflationRate.value) / 100;
  const rebalanceFreqVal = elements.rebalanceFreq.value;
  const riskFreeRateVal = parseFloat(elements.riskFreeRate.value) / 100;
  
  showLoading(true, "예측 시뮬레이션 수행 중...", `몬테카를로 모델을 바탕으로 ${numPaths.toLocaleString()}회 시나리오를 예측 중입니다.`, true);
  
  // Prepare parameters for Web Worker
  const allocations = state.portfolio.map(a => a.allocation / 100);
  
  // Scale annual returns and volatility to monthly returns (Log drift scale)
  const means = [];
  const volatilities = [];
  
  state.portfolio.forEach(asset => {
    const params = state.calibratedParams[asset.ticker];
    
    // Scale returns: annual CAGR → annual log return → monthly log drift
    // Math.log(1 + cagr) converts simple return to log return
    means.push(Math.log(1 + params.cagr) / 12);
    
    // Scale volatility: annual vol / sqrt(12)
    volatilities.push(params.volatility / Math.sqrt(12));
  });
  
  // Calculate Cholesky Decomposition Matrix L
  let L = getCholeskyFactor(state.correlationMatrix);
  if (!L) {
    // If Cholesky factor fails, use Identity matrix (independent assets correlation = 0)
    const n = allocations.length;
    L = Array.from({ length: n }, () => new Float64Array(n));
    for (let i = 0; i < n; i++) L[i][i] = 1.0;
  }
  
  // Terminate active worker if exists
  if (state.worker) {
    state.worker.terminate();
  }
  
  // Spawn Web Worker
  state.worker = new Worker('simulation-worker.js');
  
  // Send data to worker
  state.worker.postMessage({
    numPaths,
    years,
    initialAmount: initialAmountVal,
    allocations,
    means,
    volatilities,
    choleskyL: L,
    cashflowType: cashflowTypeVal,
    cashflowAmount: cashflowAmountVal,
    cashflowFreq: cashflowFreqVal,
    inflationAdjusted: inflationAdjustedVal,
    inflationRate: inflationRateVal,
    rebalanceFreq: rebalanceFreqVal,
    riskFreeRate: riskFreeRateVal
  });
  
  // Handle worker messages
  state.worker.onmessage = function(e) {
    const msg = e.data;
    if (msg.type === 'progress') {
      elements.progressBarFill.style.width = `${msg.progress}%`;
    } else if (msg.type === 'results') {
      state.simulationResults = msg.results;
      
      // Update UI panels
      displaySimulationResults();
      showLoading(false);
      
      // Scroll to results
      elements.sectionResults.style.opacity = '1';
      elements.sectionResults.style.pointerEvents = 'all';
      elements.sectionResults.scrollIntoView({ behavior: 'smooth' });
    }
  };
}

// Display simulation outputs
function displaySimulationResults() {
  const results = state.simulationResults;
  const numPaths = parseInt(elements.simRunsCount.value);
  const years = parseInt(elements.simulationPeriod.value);
  const initialVal = parseFloat(elements.initialAmount.value);
  const cashflowTypeVal = elements.cashflowType.value;
  const cashflowAmt = parseFloat(elements.cashflowAmount.value) || 0;
  
  // Update description text
  let cashflowText = "현금 흐름 없음";
  if (cashflowTypeVal === 'contribute') {
    cashflowText = `매월 ${cashflowAmt.toLocaleString()}$ 추가 납입`;
  } else if (cashflowTypeVal === 'withdraw') {
    cashflowText = `매월 ${cashflowAmt.toLocaleString()}$ 자금 분할 인출`;
  }
  
  elements.resultsDescriptionText.innerHTML = `
    수행기간: <strong>${years}년</strong> | 초기자본: <strong>${initialVal.toLocaleString()}$</strong> | 
    현금흐름: <strong>${cashflowText}</strong> | 
    예측 시나리오: <strong>${numPaths.toLocaleString()}개 조합</strong>
  `;
  
  // Render Summary Percentiles Table
  renderSummaryTable();
  
  // Update Projection chart
  updateProjectionChart();
  
  // Update final asset probability milestones
  renderProbabilities();
}

// Helper to format table cells
function fmtPct(val) {
  return (val * 100).toFixed(2) + '%';
}
function fmtCurr(val) {
  return '$' + Math.round(val).toLocaleString();
}
function fmtNum(val) {
  return val.toFixed(2);
}

// Render performance summary table (percentiles)
function renderSummaryTable() {
  const results = state.simulationResults;
  const pList = elements.percentileIntervals.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
  pList.sort((a,b) => a - b);
  
  // Setup header
  elements.summaryTableHeaderRow.innerHTML = `<th>성과 통계지표 (Metrics)</th>`;
  pList.forEach(p => {
    const th = document.createElement('th');
    th.style.textAlign = 'right';
    th.innerText = `${p}th Percentile`;
    elements.summaryTableHeaderRow.appendChild(th);
  });
  
  const metricsMap = [
    { label: "연평균 수익률 (TWRR nominal)", key: "twrrNominal", fmt: fmtPct },
    { label: "연평균 실질수익률 (TWRR real)", key: "twrrReal", fmt: fmtPct },
    { label: "최종 명목 자산액 (Portfolio End nominal)", key: "finalBalanceNominal", fmt: fmtCurr },
    { label: "최종 실질 자산액 (Portfolio End real)", key: "finalBalanceReal", fmt: fmtCurr },
    { label: "연평균 단리수익률 (Nominal Mean)", key: "annualMeanReturn", fmt: fmtPct },
    { label: "연평균 변동성 (Annualized Volatility)", key: "annualVolatility", fmt: fmtPct },
    { label: "포트폴리오 샤프지수 (Sharpe Ratio)", key: "sharpe", fmt: fmtNum },
    { label: "포트폴리오 소르티노지수 (Sortino Ratio)", key: "sortino", fmt: fmtNum },
    { label: "최대 낙폭 (Maximum Drawdown nominal)", key: "maxDrawdownNominal", fmt: fmtPct },
    { label: "최대 낙폭 (MDD excluding Cashflows)", key: "maxDrawdownExCash", fmt: fmtPct },
    { label: "안전 은퇴인출률 (Safe Withdrawal Rate SWR)", key: "swr", fmt: fmtPct },
    { label: "영구 은퇴인출률 (Perpetual Withdrawal SWR)", key: "pwr", fmt: fmtPct }
  ];
  
  elements.summaryTableBody.innerHTML = '';
  
  metricsMap.forEach(m => {
    const row = document.createElement('tr');
    
    // Highlight specific key rows
    if (m.key.includes("finalBalance") || m.key.includes("twrr")) {
      row.style.fontWeight = '700';
    }
    
    row.innerHTML = `<td>${m.label}</td>`;
    
    pList.forEach(p => {
      const val = results.summaryPercentiles[m.key][p];
      let tdClass = '';
      if (m.key.includes("twrr") || m.key === "finalBalanceNominal" || m.key === "finalBalanceReal") {
        tdClass = val > 0 ? 'text-accent-green' : 'text-accent-rose';
      }
      
      const valFormatted = m.fmt(val);
      row.innerHTML += `<td style="text-align: right;" class="${tdClass}">${valFormatted}</td>`;
    });
    
    elements.summaryTableBody.appendChild(row);
  });
}

// Render final balance probability targets
function renderProbabilities() {
  const results = state.simulationResults;
  const initialVal = parseFloat(elements.initialAmount.value);
  const finalNominals = Object.values(results.percentileTrajectoriesNominal).map(arr => arr[arr.length - 1]);
  
  // Target multipliers
  const milestones = [
    { label: "원금 이상 보존 (1.0x)", target: initialVal },
    { label: "원금의 1.5배 돌파 (1.5x)", target: initialVal * 1.5 },
    { label: "원금의 2.0배 돌파 (2.0x)", target: initialVal * 2.0 },
    { label: "원금의 3.0배 돌파 (3.0x)", target: initialVal * 3.0 },
    { label: "원금의 5.0배 돌파 (5.0x)", target: initialVal * 5.0 },
    { label: "포트폴리오 고갈 실패 (0$ 도달)", target: 0.1 }
  ];
  
  elements.probabilitiesContainer.innerHTML = '';
  
  // Calculate success probability using sorted raw values
  // We can approximate from percentiles or pass them from worker.
  // Actually, to get highly accurate probabilities, we can calculate them in the worker,
  // or do a quick estimate here. To keep it accurate, let's estimate from summaryPercentiles.
  // Wait! A robust way is to query where the target falls in our final balances.
  // We can estimate the probability by finding the rank of target in the 9 tracked percentiles [5, 10, 15, 20, 25, 50, 75, 90, 95]
  // Let's write an interpolation function:
  const percentiles = [5, 10, 15, 20, 25, 50, 75, 90, 95];
  const finalBalances = percentiles.map(p => results.summaryPercentiles.finalBalanceNominal[p]);
  
  milestones.forEach(m => {
    let prob = 0;
    if (m.target === 0.1) {
      // probability of bankruptcy (balance <= 0)
      const pZero = results.summaryPercentiles.finalBalanceNominal[5];
      prob = pZero <= 0 ? 5 : 0; // rough check (under 5th percentile)
    } else {
      // Find probability that final balance is >= target
      // Linear interpolation between percentile points
      if (m.target < finalBalances[0]) {
        prob = 98; // greater than 95% probability
      } else if (m.target > finalBalances[finalBalances.length - 1]) {
        prob = 2;  // less than 5% probability
      } else {
        // Interpolate
        for (let i = 0; i < finalBalances.length - 1; i++) {
          if (m.target >= finalBalances[i] && m.target <= finalBalances[i+1]) {
            const lowP = percentiles[i];
            const highP = percentiles[i+1];
            const lowVal = finalBalances[i];
            const highVal = finalBalances[i+1];
            const weight = (m.target - lowVal) / (highVal - lowVal);
            const targetP = lowP + weight * (highP - lowP);
            prob = 100 - targetP; // probability of being >= target
            break;
          }
        }
      }
    }
    
    // Render progress bar
    const bar = document.createElement('div');
    bar.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:0.2rem;">
        <span>${m.label}</span>
        <strong>${prob.toFixed(1)}%</strong>
      </div>
      <div class="allocation-progress-wrapper" style="height:6px; margin:0;">
        <div class="allocation-progress-fill" style="width:${prob}%; background: var(--accent-cyan);"></div>
      </div>
    `;
    elements.probabilitiesContainer.appendChild(bar);
  });
}

// Update Results Line Chart
function updateProjectionChart() {
  const results = state.simulationResults;
  if (!results) return;
  
  const logScale = elements.chkLogScale.checked;
  const inflationAdjusted = elements.chkInflationAdjusted.checked;
  const years = parseInt(elements.simulationPeriod.value);
  
  // Pick dataset based on toggle
  const trajectoryData = inflationAdjusted ? results.percentileTrajectoriesReal : results.percentileTrajectoriesNominal;
  
  const labels = Array.from({ length: years + 1 }, (_, y) => `Year ${y}`);
  
  const percentilesToPlot = [5, 10, 25, 50, 75, 90, 95];
  const colors = {
    5: 'rgba(244, 63, 94, 0.85)',   // Rose
    10: 'rgba(245, 158, 11, 0.85)',  // Amber
    25: 'rgba(99, 102, 241, 0.85)',  // Indigo
    50: 'rgba(6, 182, 212, 0.95)',   // Cyan (50th - median)
    75: 'rgba(16, 185, 129, 0.85)',  // Emerald
    90: 'rgba(168, 85, 247, 0.85)',  // Purple
    95: 'rgba(236, 72, 153, 0.85)'   // Pink
  };
  
  const datasets = percentilesToPlot.map(p => {
    // For Log scale, values <= 0 must be clipped (e.g. at 10$) to prevent chart crashes
    const pathValues = trajectoryData[p].map(val => logScale && val <= 10 ? 10 : val);
    
    return {
      label: `${p}th Percentile`,
      data: pathValues,
      borderColor: colors[p],
      backgroundColor: 'transparent',
      borderWidth: p === 50 ? 3 : 1.5,
      pointRadius: 3,
      tension: 0.1
    };
  });
  
  if (projectionLineChart) {
    projectionLineChart.destroy();
  }
  
  const ctx = document.getElementById('projectionLineChart').getContext('2d');
  projectionLineChart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          type: logScale ? 'logarithmic' : 'linear',
          title: {
            display: true,
            text: inflationAdjusted ? '실질 자산 가치 (Inflation Adjusted, $)' : '명목 자산 가치 (Nominal Portfolio Value, $)',
            color: '#94a3b8'
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            callback: function(value) {
              return '$' + Math.round(value).toLocaleString();
            }
          }
        },
        x: {
          title: {
            display: true,
            text: '경과 년수 (Years)',
            color: '#94a3b8'
          },
          grid: { display: false },
          ticks: { color: '#94a3b8' }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#f8fafc', font: { family: 'Plus Jakarta Sans' } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: $${Math.round(context.raw).toLocaleString()}`;
            }
          }
        }
      }
    }
  });
}

// Generate Excel-compatible CSV string and initiate browser download
function downloadCSV() {
  const results = state.simulationResults;
  if (!results) return;
  
  const pList = elements.percentileIntervals.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
  pList.sort((a,b) => a - b);
  
  let csv = '\uFEFF'; // Excel UTF-8 BOM
  csv += 'Monte Carlo Simulation Results Summary\n';
  csv += `Created: ${new Date().toLocaleString()}\n`;
  csv += `Initial Amount: $${elements.initialAmount.value}\n\n`;
  
  // Headers
  csv += 'Metric,' + pList.map(p => `${p}th Percentile`).join(',') + '\n';
  
  const metrics = [
    { label: "Nominal TWRR", key: "twrrNominal" },
    { label: "Real TWRR", key: "twrrReal" },
    { label: "Nominal Portfolio End Value", key: "finalBalanceNominal" },
    { label: "Real Portfolio End Value", key: "finalBalanceReal" },
    { label: "Annualized Mean Return", key: "annualMeanReturn" },
    { label: "Annualized Volatility", key: "annualVolatility" },
    { label: "Sharpe Ratio", key: "sharpe" },
    { label: "Sortino Ratio", key: "sortino" },
    { label: "Maximum Drawdown nominal", key: "maxDrawdownNominal" },
    { label: "MDD excluding Cashflows", key: "maxDrawdownExCash" },
    { label: "Safe Withdrawal Rate (SWR)", key: "swr" },
    { label: "Perpetual Withdrawal Rate (PWR)", key: "pwr" }
  ];
  
  metrics.forEach(m => {
    csv += `"${m.label}",` + pList.map(p => {
      const val = results.summaryPercentiles[m.key][p];
      return val;
    }).join(',') + '\n';
  });
  
  // Downsampled Trajectories
  csv += '\n\nPercentile Growth Trajectories (Nominal)\n';
  csv += 'Year,' + pList.map(p => `${p}th Percentile`).join(',') + '\n';
  const yearsCount = parseInt(elements.simulationPeriod.value);
  
  for (let y = 0; y <= yearsCount; y++) {
    csv += `Year ${y},` + pList.map(p => {
      return results.percentileTrajectoriesNominal[p][y];
    }).join(',') + '\n';
  }
  
  // Download trigger
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `monte_carlo_results_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Download JSON State Backup for offline imports
function downloadJSONState() {
  if (!state.simulationResults) return;
  
  const backup = {
    portfolio: state.portfolio,
    calibratedParams: state.calibratedParams,
    correlationMatrix: Array.from(state.correlationMatrix).map(row => Array.from(row)),
    results: state.simulationResults,
    timestamp: new Date().toISOString()
  };
  
  const str = JSON.stringify(backup, null, 2);
  const blob = new Blob([str], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `portfolio_simulation_backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Modal Candlestick Chart Variables
let modalLightweightChartInstance = null;
let modalCandleSeriesInstance = null;

// Display Interactive TradingView Candlestick Chart Popup
function showCandlestickChart(ticker) {
  const data = state.historicalPrices[ticker];
  if (!data || !data.ohlc || data.ohlc.length === 0) {
    alert(`[${ticker.replace('-USD', '')}] 해당 분석 기간의 실제 캔들 데이터가 존재하지 않거나 수동 입력 모드입니다.`);
    return;
  }
  
  const asset = state.portfolio.find(a => a.ticker === ticker);
  const displayName = asset ? asset.name : ticker;
  elements.modalChartTitle.innerText = `${ticker.replace('-USD', '')} 과거 캔들 차트 (${displayName})`;
  
  // Clear previous contents
  elements.modalChartContainer.innerHTML = '';
  
  // Display Modal
  elements.chartModal.style.display = 'flex';
  
  // Wait for the modal display to apply in browser layout so clientWidth is non-zero
  setTimeout(() => {
    elements.chartModal.classList.add('active');
    
    const container = elements.modalChartContainer;
    
    // Create chart canvas inside container (autoSize handles responsive width)
    modalLightweightChartInstance = LightweightCharts.createChart(container, {
      autoSize: true,
      height: 400,
      layout: {
        background: { type: 'solid', color: '#0f172a' },
        textColor: '#cbd5e1',
        fontSize: 12,
        fontFamily: 'Plus Jakarta Sans, sans-serif'
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.05)' }
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.12)',
        textColor: '#cbd5e1',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.12)',
        textColor: '#cbd5e1',
        timeVisible: true,
        secondsVisible: false
      }
    });
    
    // Add candle series
    modalCandleSeriesInstance = modalLightweightChartInstance.addCandlestickSeries({
      upColor: '#10b981',     // Green
      downColor: '#f43f5e',   // Red
      borderDownColor: '#f43f5e',
      borderUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      wickUpColor: '#10b981'
    });
    
    // Safe-guard data sorting and deduplication (critical for Lightweight Charts)
    const seenDates = new Set();
    const uniqueOhlc = [];
    data.ohlc.forEach(item => {
      if (!seenDates.has(item.time)) {
        seenDates.add(item.time);
        uniqueOhlc.push(item);
      }
    });
    uniqueOhlc.sort((a, b) => a.time.localeCompare(b.time));
    
    modalCandleSeriesInstance.setData(uniqueOhlc);
    
    // Automatically fit content
    modalLightweightChartInstance.timeScale().fitContent();
    
    // autoSize:true already handles resize — no manual ResizeObserver needed
  }, 100);
}

// Close and Clean Up Modal
function closeModal() {
  elements.chartModal.classList.remove('active');
  setTimeout(() => {
    elements.chartModal.style.display = 'none';
    
    // Clean up ResizeObserver
    if (elements.modalChartContainer.resizeObserver) {
      elements.modalChartContainer.resizeObserver.disconnect();
      elements.modalChartContainer.resizeObserver = null;
    }
    
    // Properly destroy chart instance to prevent memory leak
    if (modalLightweightChartInstance) {
      modalLightweightChartInstance.remove();  // ← 메모리 해제
      modalLightweightChartInstance = null;
      modalCandleSeriesInstance = null;
    }
    elements.modalChartContainer.innerHTML = '';
  }, 300);
}
