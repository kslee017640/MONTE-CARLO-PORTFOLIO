// app.js

// Default portfolio assets & weights requested by the user
const DEFAULT_PORTFOLIO = [
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', allocation: 5 },
  { ticker: 'QLD', name: 'ProShares Ultra QQQ (2x)', allocation: 5 },
  { ticker: 'TQQQ', name: 'ProShares UltraPro QQQ (3x)', allocation: 35 },
  { ticker: 'SOXX', name: 'iShares Semiconductor ETF', allocation: 3 },
  { ticker: 'USD', name: 'ProShares Ultra Semiconductors (2x)', allocation: 2 },
  { ticker: 'SOXL', name: 'Direxion Daily Semiconductor Bull 3x', allocation: 10 },
  { ticker: 'BTC-USD', name: 'Bitcoin USD', allocation: 15 },
  { ticker: 'AAPL', name: 'Apple Inc.', allocation: 5 },
  { ticker: 'AAPU', name: 'Direxion Daily AAPL Bull 2X Shares', allocation: 0 },
  { ticker: 'TSLA', name: 'Tesla Inc.', allocation: 5 },
  { ticker: 'TSLL', name: 'Direxion Daily TSLA Bull 2X Shares', allocation: 0 },
  { ticker: 'SCHD', name: 'Schwab US Dividend Equity ETF', allocation: 10 },
  { ticker: 'JEPQ', name: 'JPMorgan Nasdaq Equity Premium ETF', allocation: 5 }
];

// Approximate display-only FX rate for KRW summaries.
const USD_KRW_RATE = 1520;

// App State
let state = {
  portfolio: [...DEFAULT_PORTFOLIO],
  historicalPrices: {}, // ticker -> { dates: [], prices: [] }
  historicalCoverage: {}, // ticker -> { availableYears, requestedYears, insufficient }
  calibratedParams: {}, // ticker -> { cagr: num, vol: num, sharpe: num, startDate: str, endDate: str }
  correlationMatrix: [], // 2D array of correlation coefficients
  alignedDates: [],
  alignedPrices: {},
  historicalReturnRows: [], // daily simple returns aligned by date, preserving cross-asset movement for bootstrap
  simulationResults: null,
  manualModeActive: false,
  worker: null
};

// Chart.js Instances
let allocationPieChart = null;
let projectionLineChart = null;
let projectionYAxisChart = null;

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
  crashEnabled: document.getElementById('crashEnabled'),
  crashTicker: document.getElementById('crashTicker'),
  crashIntervalYears: document.getElementById('crashIntervalYears'),
  crashDropPct: document.getElementById('crashDropPct'),
  returnHaircut: document.getElementById('returnHaircut'),
  volatilityMultiplier: document.getElementById('volatilityMultiplier'),
  modelCalibrationPanel: document.getElementById('modelCalibrationPanel'),
  modelCalibrationSummary: document.getElementById('modelCalibrationSummary'),
  modelCalibrationStats: document.getElementById('modelCalibrationStats'),
  btnRecalibrateModel: document.getElementById('btnRecalibrateModel'),
  
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
  calibrationResultSlot: document.getElementById('calibrationResultSlot'),
  
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
  moveCalibrationSectionIntoStepOne();
  renderTickers();
  updateCrashTickerOptions();
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
  elements.crashEnabled?.addEventListener('change', updateCrashOptionState);
  elements.simulationModel?.addEventListener('change', () => {
    if (state.historicalReturnRows.length > 0) calibrateModelToHistoricalPeriod();
  });
  elements.btnRecalibrateModel?.addEventListener('click', calibrateModelToHistoricalPeriod);
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
  setupHelpToggles();

  handleCashflowTypeChange();
  updateCrashOptionState();
});

function moveCalibrationSectionIntoStepOne() {
  if (elements.calibrationResultSlot && elements.sectionCalibration) {
    elements.calibrationResultSlot.appendChild(elements.sectionCalibration);
  }
}

function setupHelpToggles() {
  document.querySelectorAll('.help-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.helpTarget);
      if (!target) return;
      const isPopover = target.classList.contains('help-popover');
      if (isPopover) {
        document.querySelectorAll('.help-popover.active').forEach(popover => {
          if (popover !== target) popover.classList.remove('active');
        });
      }
      const isOpen = target.classList.toggle('active');
      btn.setAttribute('aria-expanded', String(isOpen));
    });
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('.help-btn') || event.target.closest('.help-popover')) return;
    document.querySelectorAll('.help-popover.active').forEach(popover => popover.classList.remove('active'));
    document.querySelectorAll('.help-btn[aria-expanded="true"]').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
  });
}

// Reset Portfolio
function resetPortfolio() {
  state.portfolio = [];
  renderTickers();
  updateCrashTickerOptions();
  updateAllocationTotal();
  updateAllocationPieChart();
  resetCalibrationState();
}

// Load default portfolio
function loadDefaults() {
  state.portfolio = [...DEFAULT_PORTFOLIO];
  renderTickers();
  updateCrashTickerOptions();
  updateAllocationTotal();
  updateAllocationPieChart();
  resetCalibrationState();
}

// Reset calibration and simulation state
function resetCalibrationState() {
  state.historicalPrices = {};
  state.historicalCoverage = {};
  state.calibratedParams = {};
  state.correlationMatrix = [];
  state.alignedDates = [];
  state.alignedPrices = {};
  state.historicalReturnRows = [];
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
  if (elements.modelCalibrationSummary) {
    elements.modelCalibrationSummary.innerText = '1단계 실행 후 과거 실제 결과와 시뮬레이션 결과를 비교해 보수 보정값을 자동 계산합니다.';
  }
  if (elements.modelCalibrationStats) {
    elements.modelCalibrationStats.innerHTML = '';
  }
  
  elements.btnRunSimulation.disabled = true;
  elements.sectionResults.style.opacity = '0.5';
  elements.sectionResults.style.pointerEvents = 'none';
  
  if (projectionLineChart) {
    projectionLineChart.destroy();
    projectionLineChart = null;
  }
  if (projectionYAxisChart) {
    projectionYAxisChart.destroy();
    projectionYAxisChart = null;
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

function updateCrashOptionState() {
  const enabled = elements.crashEnabled?.value === 'yes';
  [elements.crashTicker, elements.crashIntervalYears, elements.crashDropPct].forEach(control => {
    if (!control) return;
    control.disabled = !enabled;
    control.style.opacity = enabled ? '1' : '0.55';
  });
}

// Render inputs list for tickers
function renderTickers() {
  elements.tickerListContainer.innerHTML = '';
  state.portfolio.forEach((asset, index) => {
    const item = document.createElement('div');
    item.className = 'ticker-item';
    
    // Display standard Ticker (stripping -USD for display clarity)
    const coverage = state.historicalCoverage[asset.ticker];
    const displaySymbolBase = asset.ticker.endsWith('-USD') ? asset.ticker.replace('-USD', '') : asset.ticker;
    const displaySymbol = displaySymbolBase + (coverage?.insufficient ? '*' : '');
    const coverageTitle = coverage?.insufficient ? ` / 요청 기간보다 짧음: 최대 ${coverage.availableYears.toFixed(1)}년 데이터` : '';
    
    item.innerHTML = `
      <div style="display:flex; flex-direction:column; min-width:0;">
        <span class="ticker-symbol">${displaySymbol}</span>
        <span style="font-size:0.75rem; color:var(--color-text-secondary); overflow:hidden; line-height:1.35;" title="${asset.name}${coverageTitle}">${asset.name}${coverage?.insufficient ? `<span class="coverage-note">최대 ${coverage.availableYears.toFixed(1)}년 데이터</span>` : ''}</span>
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
  updateCrashTickerOptions();
}

function updateCrashTickerOptions() {
  if (!elements.crashTicker) return;
  const previous = elements.crashTicker.value || 'QQQ';
  elements.crashTicker.innerHTML = '';
  state.portfolio.forEach(asset => {
    const option = document.createElement('option');
    option.value = asset.ticker;
    option.textContent = asset.ticker.replace('-USD', '');
    elements.crashTicker.appendChild(option);
  });
  if (state.portfolio.some(asset => asset.ticker === previous)) {
    elements.crashTicker.value = previous;
  } else if (state.portfolio.some(asset => asset.ticker === 'QQQ')) {
    elements.crashTicker.value = 'QQQ';
  }
}

// Add ticker to list
function addTicker() {
  let ticker = elements.newTickerInput.value.trim().toUpperCase();
  if (!ticker) return;
  
  // Format crypto tickers
  let apiTicker = ticker;
  let tickerName = ticker + " Stock";
  if (ticker === 'BTC' || ticker === 'ETH' || ticker === 'SOL') {
    apiTicker = ticker + '-USD';
    tickerName = ticker + " Cryptocurrency";
  } else if (ticker === 'USD') {
    tickerName = "ProShares Ultra Semiconductors (2x)";
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
  
  const requestedYears = period.endsWith('y') ? parseInt(period, 10) : null;
  const requestRange = requestedYears && requestedYears > 10 ? 'max' : period;
  const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${apiTicker}?range=${requestRange}&interval=1d`;
  
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
      
      const rawRows = [];
      
      for (let j = 0; j < timestamps.length; j++) {
        if (adjClose[j] !== null && adjClose[j] !== undefined && !isNaN(adjClose[j])) {
          const dateStr = new Date(timestamps[j] * 1000).toISOString().split('T')[0];
          const row = { date: dateStr, price: adjClose[j], ohlc: null };
          
          // Verify and save OHLC for candlestick chart
          if (opens[j] !== null && highs[j] !== null && lows[j] !== null && closes[j] !== null &&
              opens[j] !== undefined && highs[j] !== undefined && lows[j] !== undefined && closes[j] !== undefined) {
            row.ohlc = {
              time: dateStr,
              open: opens[j],
              high: highs[j],
              low: lows[j],
              close: closes[j]
            };
          }
          rawRows.push(row);
        }
      }
      
      if (rawRows.length === 0) throw new Error("No valid closing prices found");

      rawRows.sort((a, b) => a.date.localeCompare(b.date));
      const firstDate = rawRows[0].date;
      const lastDate = rawRows[rawRows.length - 1].date;
      const availableYears = Math.max(0, (new Date(lastDate) - new Date(firstDate)) / (1000 * 60 * 60 * 24 * 365.25));
      const insufficient = requestedYears !== null && availableYears + 0.05 < requestedYears;
      const cutoffDate = requestedYears && !insufficient
        ? new Date(new Date(lastDate).setFullYear(new Date(lastDate).getFullYear() - requestedYears)).toISOString().split('T')[0]
        : null;
      const filteredRows = cutoffDate ? rawRows.filter(row => row.date >= cutoffDate) : rawRows;

      const dates = filteredRows.map(row => row.date);
      const prices = filteredRows.map(row => row.price);
      const ohlc = filteredRows.filter(row => row.ohlc).map(row => row.ohlc);
      
      // Get shortName from metadata
      const shortName = chart.meta?.shortName || ticker;
      
      return {
        ticker,
        dates,
        prices,
        ohlc,
        shortName,
        coverage: {
          availableYears,
          requestedYears,
          insufficient,
          firstDate,
          lastDate
        }
      };
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
    state.historicalCoverage = {};
    fetchedResults.forEach(res => {
      state.historicalPrices[res.ticker] = {
        dates: res.dates,
        prices: res.prices,
        ohlc: res.ohlc
      };
      state.historicalCoverage[res.ticker] = res.coverage;
    });
    
    // Align price dates across all assets (Common Period)
    alignDatesAndPrices();
    
    // Calculate statistical returns, volatilities, and correlations
    calculateStatistics();
    
    // Populate GUI Table
    renderParametersTable();
    
    // Draw Correlation Heatmap
    renderCorrelationHeatmap();
    calibrateModelToHistoricalPeriod();
    
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
  state.historicalReturnRows = [];
  for (let t = 0; t < N - 1; t++) {
    state.historicalReturnRows.push(tickers.map(ticker => Math.exp(returns[ticker][t]) - 1));
  }
  
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

function randomNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function calculatePathMetrics(values, years) {
  if (!values || values.length < 2 || years <= 0) return { cagr: 0, volatility: 0, maxDrawdown: 0 };

  const returns = [];
  let peak = values[0];
  let maxDrawdown = 0;

  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const current = values[i];
    if (prev > 0) returns.push((current / prev) - 1);
    if (current > peak) peak = current;
    const drawdown = peak > 0 ? (current - peak) / peak : 0;
    if (drawdown < maxDrawdown) maxDrawdown = drawdown;
  }

  const cagr = values[0] > 0 && values[values.length - 1] > 0
    ? Math.pow(values[values.length - 1] / values[0], 1 / years) - 1
    : -1;
  const mean = returns.reduce((sum, value) => sum + value, 0) / Math.max(1, returns.length);
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (returns.length - 1)
    : 0;

  return { cagr, volatility: Math.sqrt(variance) * Math.sqrt(252), maxDrawdown };
}

function getHistoricalPortfolioMetrics() {
  if (state.historicalReturnRows.length < 30 || state.alignedDates.length < 2) return null;

  const allocations = state.portfolio.map(asset => asset.allocation / 100);
  const values = [1];
  let value = 1;

  state.historicalReturnRows.forEach(row => {
    const portfolioReturn = row.reduce((sum, assetReturn, index) => sum + allocations[index] * (assetReturn || 0), 0);
    value *= Math.max(0.0001, 1 + portfolioReturn);
    values.push(value);
  });

  const years = (new Date(state.alignedDates[state.alignedDates.length - 1]) - new Date(state.alignedDates[0])) / (1000 * 60 * 60 * 24 * 365.25);
  return { ...calculatePathMetrics(values, years), years };
}

function getPercentileFromArray(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * (percentile / 100);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function simulateHistoricalCalibrationPaths(model, years, numPaths = 300) {
  const allocations = state.portfolio.map(asset => asset.allocation / 100);
  const numAssets = allocations.length;
  const numMonths = Math.max(1, Math.round(years * 12));
  const tradingDaysPerMonth = 21;
  const useBootstrap = model === 'bootstrap' && state.historicalReturnRows.length >= tradingDaysPerMonth;
  const means = [];
  const volatilities = [];

  state.portfolio.forEach(asset => {
    const params = state.calibratedParams[asset.ticker];
    const safeCagr = Math.max(-0.95, params?.cagr || 0);
    means.push(Math.log(1 + safeCagr) / 12);
    volatilities.push((params?.volatility || 0) / Math.sqrt(12));
  });

  let L = getCholeskyFactor(state.correlationMatrix);
  if (!L) {
    L = Array.from({ length: numAssets }, () => new Float64Array(numAssets));
    for (let i = 0; i < numAssets; i++) L[i][i] = 1;
  }

  const cagrValues = [];
  const volatilityValues = [];
  const drawdownValues = [];

  for (let path = 0; path < numPaths; path++) {
    const values = [1];
    let value = 1;

    for (let m = 0; m < numMonths; m++) {
      const returnFactors = new Float64Array(numAssets);
      if (useBootstrap) {
        const maxStart = Math.max(0, state.historicalReturnRows.length - tradingDaysPerMonth);
        const start = Math.floor(Math.random() * (maxStart + 1));
        for (let i = 0; i < numAssets; i++) returnFactors[i] = 1;
        for (let d = 0; d < tradingDaysPerMonth; d++) {
          const row = state.historicalReturnRows[start + d] || state.historicalReturnRows[state.historicalReturnRows.length - 1];
          for (let i = 0; i < numAssets; i++) {
            returnFactors[i] *= Math.max(0.0001, 1 + (row[i] || 0));
          }
        }
      } else {
        const randNormalVec = new Float64Array(numAssets);
        for (let i = 0; i < numAssets; i++) randNormalVec[i] = randomNormal();
        for (let i = 0; i < numAssets; i++) {
          let z = 0;
          for (let j = 0; j <= i; j++) z += L[i][j] * randNormalVec[j];
          returnFactors[i] = Math.exp(means[i] + volatilities[i] * z);
        }
      }

      const portfolioFactor = returnFactors.reduce((sum, factor, index) => sum + allocations[index] * factor, 0);
      value *= Math.max(0.0001, portfolioFactor);
      values.push(value);
    }

    const metrics = calculatePathMetrics(values, years);
    cagrValues.push(metrics.cagr);
    volatilityValues.push(metrics.volatility);
    drawdownValues.push(metrics.maxDrawdown);
  }

  return {
    cagr: getPercentileFromArray(cagrValues, 50),
    volatility: getPercentileFromArray(volatilityValues, 50),
    maxDrawdown: getPercentileFromArray(drawdownValues, 50)
  };
}

function recommendConservativeAdjustments(actual, simulated) {
  let returnHaircut = 0;
  if (simulated.cagr > 0) {
    returnHaircut = actual.cagr > 0 ? 1 - (actual.cagr / simulated.cagr) : 0.65;
  }
  const highReturnFloor = actual.cagr > 0.15 ? 0.35 : actual.cagr > 0.08 ? 0.2 : 0;
  returnHaircut = Math.max(returnHaircut, highReturnFloor);
  returnHaircut = Math.max(0, Math.min(0.85, returnHaircut));

  const volRatio = simulated.volatility > 0 ? actual.volatility / simulated.volatility : 1;
  const mddRatio = Math.abs(simulated.maxDrawdown) > 0.001
    ? Math.abs(actual.maxDrawdown) / Math.abs(simulated.maxDrawdown)
    : 1;
  const volatilityMultiplier = Math.max(1, Math.min(2.5, Math.max(volRatio, mddRatio) * 1.05));

  return { returnHaircut, volatilityMultiplier };
}

function calibrateModelToHistoricalPeriod() {
  if (!elements.modelCalibrationPanel || state.historicalReturnRows.length < 30) return;

  const actual = getHistoricalPortfolioMetrics();
  if (!actual) return;

  const model = elements.simulationModel.value;
  const simulated = simulateHistoricalCalibrationPaths(model, actual.years);
  const recommended = recommendConservativeAdjustments(actual, simulated);

  elements.returnHaircut.value = Math.round(recommended.returnHaircut * 100 / 5) * 5;
  elements.volatilityMultiplier.value = recommended.volatilityMultiplier.toFixed(2);

  const modelName = model === 'bootstrap' ? '역사적 복원 추출' : '통계 기반 GBM';
  elements.modelCalibrationSummary.innerHTML = `
    <strong>${modelName}</strong>을 과거 ${actual.years.toFixed(1)}년 구간에 먼저 돌려본 뒤,
    실제 과거 포트폴리오와 중앙값을 비교해 보수 보정값을 자동 적용했습니다.
  `;

  const statItems = [
    { label: '실제 과거 CAGR', value: fmtPct(actual.cagr) },
    { label: '시뮬 중앙 CAGR', value: fmtPct(simulated.cagr) },
    { label: '실제 변동성', value: fmtPct(actual.volatility) },
    { label: '시뮬 변동성', value: fmtPct(simulated.volatility) },
    { label: '실제 최대낙폭', value: fmtPct(actual.maxDrawdown) },
    { label: '시뮬 최대낙폭', value: fmtPct(simulated.maxDrawdown) },
    { label: '적용 수익 할인', value: `${elements.returnHaircut.value}%` },
    { label: '적용 변동성 배율', value: `${elements.volatilityMultiplier.value}x` }
  ];

  elements.modelCalibrationStats.innerHTML = statItems.map(item => `
    <div class="calibration-stat-card">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join('');
}

// Render Parameters summary table
function renderParametersTable() {
  elements.parametersTableBody.innerHTML = '';
  
  state.portfolio.forEach(asset => {
    const params = state.calibratedParams[asset.ticker];
    if (!params) return;
    
    const row = document.createElement('tr');
    
    const coverage = state.historicalCoverage[asset.ticker];
    const coverageNote = coverage?.insufficient ? ` * 최대 ${coverage.availableYears.toFixed(1)}년 데이터` : '';
    const displaySymbol = asset.ticker.replace('-USD', '') + (coverage?.insufficient ? '*' : '');
    const cagrFormatted = (params.cagr * 100).toFixed(2) + '%';
    const volFormatted = (params.volatility * 100).toFixed(2) + '%';
    const sharpeFormatted = params.sharpe.toFixed(2);
    
    row.innerHTML = `
      <td class="ticker-symbol" style="color:var(--accent-cyan); cursor:pointer; text-decoration:underline;" title="클릭하여 실제 캔들 차트 조회">${displaySymbol}</td>
      <td style="font-size:0.8rem; color:var(--color-text-secondary); max-width:220px; overflow:hidden; line-height:1.35;" title="${asset.name}${coverageNote}">${asset.name}${coverageNote ? `<span class="coverage-note">${coverageNote.trim()}</span>` : ''}</td>
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

  const visiblePortfolio = state.portfolio.filter(asset => state.calibratedParams[asset.ticker]);
  const labels = visiblePortfolio.map(asset => asset.ticker.replace('-USD', ''));
  const matrix = visiblePortfolio.map(asset => {
    const sourceIndex = state.portfolio.findIndex(item => item.ticker === asset.ticker);
    return visiblePortfolio.map(other => {
      const targetIndex = state.portfolio.findIndex(item => item.ticker === other.ticker);
      return state.correlationMatrix[sourceIndex]?.[targetIndex] ?? 0;
    });
  });
  const N = labels.length;
  if (N === 0) return;
  
  // Setup grid columns
  elements.heatmapGrid.style.gridTemplateColumns = `minmax(56px, 0.8fr) repeat(${N}, minmax(46px, 1fr))`;
  elements.heatmapGrid.classList.add('with-axis-labels');

  const corner = document.createElement('div');
  corner.className = 'heatmap-axis-corner';
  elements.heatmapGrid.appendChild(corner);

  labels.forEach(ticker => {
    const label = document.createElement('div');
    label.className = 'heatmap-axis-label heatmap-axis-top';
    label.innerText = ticker;
    label.title = ticker;
    elements.heatmapGrid.appendChild(label);
  });
  
  for (let i = 0; i < N; i++) {
    const rowLabel = document.createElement('div');
    rowLabel.className = 'heatmap-axis-label heatmap-axis-left';
    rowLabel.innerText = labels[i];
    rowLabel.title = labels[i];
    elements.heatmapGrid.appendChild(rowLabel);

    for (let j = 0; j < N; j++) {
      const coef = matrix[i][j];
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
      
      const t1 = labels[i];
      const t2 = labels[j];
      cell.title = `${t1} & ${t2}: ${coef.toFixed(4)}`;
      
      elements.heatmapGrid.appendChild(cell);
    }
  }
  
  elements.heatmapLabels.innerHTML = '<span>가로/세로 축은 티커이며, 각 칸은 두 자산의 과거 수익률 상관계수입니다.</span>';
}

// Toggle Manual Parameter Override Panel
function toggleManualEditor() {
  state.manualModeActive = !state.manualModeActive;
  
  if (state.manualModeActive) {
    elements.manualDataEditor.classList.add('active');
    elements.btnToggleManual.innerText = '수동 끄기';
    
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
    elements.btnToggleManual.innerText = '값 직접 수정 (수동)';
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

function calculateTotalInvested() {
  const years = parseInt(elements.simulationPeriod.value, 10) || 0;
  const initialAmountVal = parseFloat(elements.initialAmount.value) || 0;
  const cashflowTypeVal = elements.cashflowType.value;
  const cashflowAmountVal = parseFloat(elements.cashflowAmount.value) || 0;
  const cashflowFreqVal = elements.cashflowFreq.value;
  const inflationAdjustedVal = elements.inflationAdjusted.value === 'yes';
  const inflationRateVal = (parseFloat(elements.inflationRate.value) || 0) / 100;
  const monthlyInflation = Math.pow(1 + inflationRateVal, 1 / 12) - 1;
  const numMonths = years * 12;

  let totalInvested = initialAmountVal;
  if (cashflowTypeVal !== 'contribute' || cashflowAmountVal <= 0) {
    return totalInvested;
  }

  for (let m = 1; m <= numMonths; m++) {
    const isCashflowMonth = cashflowFreqVal === 'monthly' || (cashflowFreqVal === 'annually' && m % 12 === 0);
    if (!isCashflowMonth) continue;
    const inflationMultiplier = inflationAdjustedVal ? Math.pow(1 + monthlyInflation, m) : 1.0;
    totalInvested += cashflowAmountVal * inflationMultiplier;
  }

  return totalInvested;
}

function buildCrashSettings() {
  const enabled = elements.crashEnabled?.value === 'yes';
  const ticker = elements.crashTicker?.value || 'QQQ';
  const tickerIndex = state.portfolio.findIndex(asset => asset.ticker === ticker);
  const intervalYears = Math.max(1, parseFloat(elements.crashIntervalYears?.value) || 7);
  const dropPct = Math.max(0, Math.min(0.95, (parseFloat(elements.crashDropPct?.value) || 0) / 100));
  const impacts = state.correlationMatrix.map(row => {
    const corr = tickerIndex >= 0 ? row[tickerIndex] : 0;
    return Math.max(0, Math.min(1, Number.isFinite(corr) ? corr : 0));
  });
  if (tickerIndex >= 0) impacts[tickerIndex] = 1;

  return { enabled, ticker, tickerIndex, intervalYears, dropPct, impacts };
}

function getConservativeAdjustments() {
  const returnHaircut = Math.max(0, Math.min(0.9, (parseFloat(elements.returnHaircut?.value) || 0) / 100));
  const volatilityMultiplier = Math.max(0.5, Math.min(3, parseFloat(elements.volatilityMultiplier?.value) || 1));
  return { returnHaircut, volatilityMultiplier };
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
  const simulationModelVal = elements.simulationModel.value;
  const outputPercentiles = parseOutputPercentiles();
  const totalInvestedVal = calculateTotalInvested();
  const crashSettings = buildCrashSettings();
  const conservativeAdjustments = getConservativeAdjustments();
  
  showLoading(true, "예측 시뮬레이션 수행 중...", `몬테카를로 모델을 바탕으로 ${numPaths.toLocaleString()}회 시나리오를 예측 중입니다.`, true);
  
  const modelName = simulationModelVal === 'bootstrap' ? 'Bootstrap' : 'GBM';
  showLoading(true, "시뮬레이션 실행 중...", `${modelName} 모델로 ${numPaths.toLocaleString()}개 시나리오를 계산 중입니다.`, true);
  
  // Prepare parameters for Web Worker
  const allocations = state.portfolio.map(a => a.allocation / 100);
  
  // Scale annual returns and volatility to monthly returns (Log drift scale)
  const means = [];
  const volatilities = [];
  
  state.portfolio.forEach(asset => {
    const params = state.calibratedParams[asset.ticker];
    
    // Scale returns: annual CAGR → annual log return → monthly log drift
    // Math.log(1 + cagr) converts simple return to log return
    const safeCagr = Math.max(-0.95, params.cagr);
    const annualLogReturn = Math.log(1 + safeCagr);
    const adjustedAnnualLogReturn = annualLogReturn >= 0
      ? annualLogReturn * (1 - conservativeAdjustments.returnHaircut)
      : annualLogReturn * conservativeAdjustments.volatilityMultiplier;
    means.push(adjustedAnnualLogReturn / 12);
    
    // Scale volatility: annual vol / sqrt(12)
    volatilities.push((params.volatility * conservativeAdjustments.volatilityMultiplier) / Math.sqrt(12));
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
    model: simulationModelVal,
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
    riskFreeRate: riskFreeRateVal,
    outputPercentiles,
    historicalReturnRows: state.historicalReturnRows,
    probabilityBaseAmount: totalInvestedVal,
    totalInvested: totalInvestedVal,
    crashSettings,
    conservativeAdjustments
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

  state.worker.onerror = function(error) {
    showLoading(false);
    elements.statusDot.className = 'status-dot error';
    elements.statusText.innerText = `시뮬레이션 실패: ${error.message || '알 수 없는 워커 오류'}`;
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
  const cashflowFreqText = elements.cashflowFreq.value === 'annually' ? '매년' : '매월';
  const totalInvested = results.totalInvested || calculateTotalInvested();
  const crashSettings = results.crashSettings || buildCrashSettings();
  const conservativeAdjustments = results.conservativeAdjustments || getConservativeAdjustments();
  
  // Update description text
  let cashflowText = "현금 흐름 없음";
  if (cashflowTypeVal === 'contribute') {
    cashflowText = `${cashflowFreqText} ${cashflowAmt.toLocaleString()}$ 추가 납입`;
  } else if (cashflowTypeVal === 'withdraw') {
    cashflowText = `${cashflowFreqText} ${cashflowAmt.toLocaleString()}$ 자금 분할 인출`;
  }

  const crashText = crashSettings.enabled
    ? `${crashSettings.ticker.replace('-USD', '')} ${Math.round(crashSettings.dropPct * 100)}% 폭락 / ${crashSettings.intervalYears}년마다`
    : '반영 안 함';
  
  elements.resultsDescriptionText.innerHTML = `
    수행기간: <strong>${years}년</strong> | 초기자본: <strong>${initialVal.toLocaleString()}$</strong> | 
    총투자금: <strong>${fmtCurrWithKrw(totalInvested)}</strong> |
    현금흐름: <strong>${cashflowText}</strong> | 
    폭락장: <strong>${crashText}</strong> |
    보수보정: <strong>수익 ${Math.round(conservativeAdjustments.returnHaircut * 100)}% 할인 / 변동성 ${conservativeAdjustments.volatilityMultiplier.toFixed(2)}x</strong> |
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
function fmtCurrWithKrw(val) {
  const usd = fmtCurr(val);
  const krw = formatKrwShort(val * USD_KRW_RATE);
  return `${usd} (${krw})`;
}
function fmtAxisCompact(val) {
  if (!Number.isFinite(val) || val === 0) return '$0';
  const sign = val < 0 ? '-' : '';
  const absVal = Math.abs(val);
  const units = [
    { value: 1e12, suffix: 'T' },
    { value: 1e9, suffix: 'B' },
    { value: 1e6, suffix: 'M' },
    { value: 1e3, suffix: 'K' }
  ];

  const unit = units.find(item => absVal >= item.value);
  if (!unit) return `${sign}$${Math.round(absVal)}`;

  const scaled = absVal / unit.value;
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${sign}$${scaled.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1')}${unit.suffix}`;
}
function formatKrwShort(krwValue) {
  const value = Math.round(Math.abs(krwValue));
  const sign = krwValue < 0 ? '-' : '';
  const eok = Math.floor(value / 100000000);
  const cheonman = Math.floor((value % 100000000) / 10000000);
  if (eok > 0) {
    return `${sign}₩${eok.toLocaleString('ko-KR')}억${cheonman > 0 ? ` ${cheonman}천만` : ''}`;
  }
  const man = Math.round(value / 10000);
  return `${sign}₩${man.toLocaleString('ko-KR')}만`;
}
function fmtNum(val) {
  return val.toFixed(2);
}

function parseOutputPercentiles() {
  const values = elements.percentileIntervals.value
    .split(',')
    .map(v => Math.round(parseFloat(v.trim())))
    .filter(v => Number.isFinite(v) && v >= 0 && v <= 100);
  const unique = [...new Set(values)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [5, 10, 25, 50, 75, 90, 95];
}

function getPlotPercentiles(results) {
  const preferred = [5, 10, 25, 50, 75, 90, 95];
  const available = Object.keys(results.percentileTrajectoriesNominal || {}).map(Number);
  const plotList = preferred.filter(p => available.includes(p));
  return plotList.length > 0 ? plotList : available.sort((a, b) => a - b).slice(0, 7);
}

function getProjectionYBounds(trajectoryData, percentilesToPlot, logScale) {
  const values = [];
  percentilesToPlot.forEach(p => {
    (trajectoryData[p] || []).forEach(val => {
      if (Number.isFinite(val)) values.push(logScale && val <= 10 ? 10 : val);
    });
  });
  if (values.length === 0) return {};
  const min = Math.min(...values);
  const max = Math.max(...values);
  return logScale ? { min: Math.max(10, min), max } : { min: Math.min(0, min), max };
}

// Render performance summary table (percentiles)
function renderSummaryTable() {
  const results = state.simulationResults;
  const pList = parseOutputPercentiles().filter(p => results.summaryPercentiles.finalBalanceNominal[p] !== undefined);
  
  // Setup header
  elements.summaryTableHeaderRow.innerHTML = `<th>성과 통계지표 (Metrics)</th>`;
  pList.forEach(p => {
    const th = document.createElement('th');
    th.style.textAlign = 'right';
    th.innerText = `${p}th Percentile`;
    elements.summaryTableHeaderRow.appendChild(th);
  });
  
  const metricsMap = [
    { label: "총투자금 (Total Invested)", key: "totalInvested", fmt: fmtCurrWithKrw, value: results.totalInvested || calculateTotalInvested() },
    { label: "연평균 수익률 (TWRR nominal)", key: "twrrNominal", fmt: fmtPct },
    { label: "연평균 실질수익률 (TWRR real)", key: "twrrReal", fmt: fmtPct },
    { label: "최종 명목 자산액 (Portfolio End nominal)", key: "finalBalanceNominal", fmt: fmtCurrWithKrw },
    { label: "최종 실질 자산액 (Portfolio End real)", key: "finalBalanceReal", fmt: fmtCurrWithKrw },
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
      const val = m.value !== undefined ? m.value : results.summaryPercentiles[m.key][p];
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

// Accurate probability rendering from worker-calculated final balances.
function renderProbabilities() {
  const results = state.simulationResults;
  elements.probabilitiesContainer.innerHTML = '';

  (results.probabilities || []).forEach(m => {
    const prob = Math.max(0, Math.min(100, m.probability));
    const bar = document.createElement('div');
    bar.className = 'probability-row';
    bar.innerHTML = `
      <div class="probability-row-head">
        <span>${m.label}</span>
        <strong>${prob.toFixed(1)}%</strong>
      </div>
      <div class="allocation-progress-wrapper probability-track">
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
  
  const percentilesToPlot = getPlotPercentiles(results);
  const yBounds = getProjectionYBounds(trajectoryData, percentilesToPlot, logScale);
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
      borderColor: colors[p] || 'rgba(148, 163, 184, 0.85)',
      backgroundColor: 'transparent',
      borderWidth: p === 50 ? 3 : 1.5,
      pointRadius: 3,
      tension: 0.1
    };
  });
  
  if (projectionLineChart) {
    projectionLineChart.destroy();
  }
  if (projectionYAxisChart) {
    projectionYAxisChart.destroy();
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
          min: yBounds.min,
          max: yBounds.max,
          title: {
            display: true,
            text: inflationAdjusted ? '실질 자산 가치 (Inflation Adjusted, $)' : '명목 자산 가치 (Nominal Portfolio Value, $)',
            color: '#94a3b8'
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            display: false,
            callback: function(value) {
              return fmtAxisCompact(value);
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

  const yAxisCanvas = document.getElementById('projectionYAxisChart');
  if (!yAxisCanvas) return;
  projectionYAxisChart = new Chart(yAxisCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: trajectoryData[percentilesToPlot[0]] || [],
        borderColor: 'transparent',
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      events: [],
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      scales: {
        y: {
          type: logScale ? 'logarithmic' : 'linear',
          min: yBounds.min,
          max: yBounds.max,
          title: {
            display: false,
            text: '',
            color: '#94a3b8'
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            color: '#94a3b8',
            callback: value => fmtAxisCompact(value)
          }
        },
        x: {
          display: false,
          grid: { display: false }
        }
      }
    }
  });
}

// Generate Excel-compatible CSV string and initiate browser download
function downloadCSV() {
  const results = state.simulationResults;
  if (!results) return;
  
  const pList = parseOutputPercentiles().filter(p => results.summaryPercentiles.finalBalanceNominal[p] !== undefined);
  
  let csv = '\uFEFF'; // Excel UTF-8 BOM
  csv += 'Monte Carlo Simulation Results Summary\n';
  csv += `Created: ${new Date().toLocaleString()}\n`;
  csv += `Initial Amount: $${elements.initialAmount.value}\n`;
  csv += `Total Invested: ${state.simulationResults.totalInvested || calculateTotalInvested()}\n\n`;
  
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
