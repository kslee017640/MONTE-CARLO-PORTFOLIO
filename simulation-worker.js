// simulation-worker.js

self.onmessage = function(e) {
  const {
    model = 'statistical',
    numPaths,
    years,
    initialAmount,
    allocations, // Array of weights (0 to 1)
    means,       // Monthly mean log returns for each asset
    volatilities,// Monthly volatilities for each asset
    choleskyL,   // Lower triangular Cholesky matrix
    cashflowType,// 'none', 'contribute', 'withdraw'
    cashflowAmount,
    cashflowFreq,// 'monthly', 'annually'
    inflationAdjusted,
    inflationRate, // Annual inflation rate (e.g. 0.025)
    rebalanceFreq, // 'none', 'monthly', 'quarterly', 'annually'
    riskFreeRate,  // Annual risk free rate (e.g. 0.0)
    outputPercentiles = [5, 10, 15, 20, 25, 50, 75, 90, 95],
    historicalReturnRows = [],
    probabilityBaseAmount = initialAmount,
    totalInvested = initialAmount,
    crashSettings = { enabled: false },
    conservativeAdjustments = { returnHaircut: 0, volatilityMultiplier: 1 }
  } = e.data;

  const numAssets = allocations.length;
  const numMonths = years * 12;
  const rF = riskFreeRate / 12; // Monthly risk free rate
  const monthlyInflation = Math.pow(1 + inflationRate, 1 / 12) - 1;
  const tradingDaysPerMonth = 21;
  const useBootstrap = model === 'bootstrap' && historicalReturnRows.length > 0;
  const returnHaircut = Math.max(0, Math.min(0.9, conservativeAdjustments.returnHaircut || 0));
  const volatilityMultiplier = Math.max(0.5, Math.min(3, conservativeAdjustments.volatilityMultiplier || 1));
  const crashEnabled = Boolean(crashSettings.enabled && crashSettings.dropPct > 0 && crashSettings.intervalYears > 0);
  const crashMonthInterval = crashEnabled ? Math.max(1, Math.round(crashSettings.intervalYears * 12)) : 0;

  function applyCrashShock(returnFactors, monthIndex) {
    if (!crashEnabled || monthIndex % crashMonthInterval !== 0) return;
    const dropPct = Math.max(0, Math.min(0.95, crashSettings.dropPct || 0));
    const impacts = Array.isArray(crashSettings.impacts) ? crashSettings.impacts : [];
    for (let i = 0; i < numAssets; i++) {
      const impact = Math.max(0, Math.min(1, Number.isFinite(impacts[i]) ? impacts[i] : 0));
      returnFactors[i] *= Math.max(0.0001, 1 - dropPct * impact);
    }
  }

  // Helper: Standard Normal Generator (Box-Muller)
  function randomNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // Pre-allocate arrays for statistics
  const allFinalBalancesNominal = new Float64Array(numPaths);
  const allFinalBalancesReal = new Float64Array(numPaths);
  const allTWRRNominal = new Float64Array(numPaths);
  const allTWRRReal = new Float64Array(numPaths);
  const allAnnualMeanReturns = new Float64Array(numPaths);
  const allAnnualVolatilities = new Float64Array(numPaths);
  const allSharpeRatios = new Float64Array(numPaths);
  const allSortinoRatios = new Float64Array(numPaths);
  const allMaxDrawdownsNominal = new Float64Array(numPaths);
  const allMaxDrawdownsExCashflows = new Float64Array(numPaths);
  const allSWR = new Float64Array(numPaths);
  const allPWR = new Float64Array(numPaths);

  // Store annual balances for ALL paths to calculate percentile trajectories
  // Size: (years + 1) arrays of length numPaths
  const annualBalancesAllPaths = Array.from({ length: years + 1 }, () => new Float64Array(numPaths));

  // Set initial balance (Year 0) for all paths
  for (let pathIdx = 0; pathIdx < numPaths; pathIdx++) {
    annualBalancesAllPaths[0][pathIdx] = initialAmount;
  }

  // Loop through each simulation path
  for (let pathIdx = 0; pathIdx < numPaths; pathIdx++) {
    // Initialize portfolio asset values
    let assetValues = new Float64Array(numAssets);
    for (let i = 0; i < numAssets; i++) {
      assetValues[i] = initialAmount * allocations[i];
    }

    let portfolioValue = initialAmount;

    // For TWRR and statistical calculations
    const monthlyReturns = new Float64Array(numMonths);
    
    // For Drawdown calculations
    let maxDrawdownNominal = 0;
    let peakNominal = initialAmount;
    
    let maxDrawdownExCash = 0;
    let peakExCash = 1.0;
    let fValueExCash = 1.0;

    // For SWR & PWR closed-form calculation
    let x_t = 1.0;
    let y_t = 0.0;

    // Simulate month-by-month
    for (let m = 1; m <= numMonths; m++) {
      // 1. Compute asset return factors.
      const returnFactors = new Float64Array(numAssets);
      if (useBootstrap) {
        for (let i = 0; i < numAssets; i++) {
          returnFactors[i] = 1.0;
        }
        const maxStartIndex = Math.max(0, historicalReturnRows.length - tradingDaysPerMonth);
        const blockStartIndex = Math.floor(Math.random() * (maxStartIndex + 1));
        for (let d = 0; d < tradingDaysPerMonth; d++) {
          const row = historicalReturnRows[blockStartIndex + d] || historicalReturnRows[historicalReturnRows.length - 1];
          for (let i = 0; i < numAssets; i++) {
            returnFactors[i] *= Math.max(0.0001, 1 + (row[i] || 0));
          }
        }
        for (let i = 0; i < numAssets; i++) {
          const monthlyLogReturn = Math.log(Math.max(0.0001, returnFactors[i]));
          const adjustedLogReturn = monthlyLogReturn >= 0
            ? monthlyLogReturn * (1 - returnHaircut)
            : monthlyLogReturn * volatilityMultiplier;
          returnFactors[i] = Math.exp(adjustedLogReturn);
        }
      } else {
        const randNormalVec = new Float64Array(numAssets);
        for (let i = 0; i < numAssets; i++) {
          randNormalVec[i] = randomNormal();
        }

        const Z = new Float64Array(numAssets);
        for (let i = 0; i < numAssets; i++) {
          let sum = 0;
          for (let j = 0; j <= i; j++) {
            sum += choleskyL[i][j] * randNormalVec[j];
          }
          Z[i] = sum;
        }

        for (let i = 0; i < numAssets; i++) {
          returnFactors[i] = Math.exp(means[i] + volatilities[i] * Z[i]);
        }
      }
      applyCrashShock(returnFactors, m);

      // 2. Update asset values
      let sumAssetValuesPre = 0;
      const assetValuesPre = new Float64Array(numAssets);
      for (let i = 0; i < numAssets; i++) {
        assetValuesPre[i] = assetValues[i] * returnFactors[i];
        sumAssetValuesPre += assetValuesPre[i];
      }

      // Calculate portfolio market return before cashflows
      const prevPortfolioValue = portfolioValue;
      // Safeguard against division by zero
      const portfolioReturn = prevPortfolioValue > 0 ? (sumAssetValuesPre - prevPortfolioValue) / prevPortfolioValue : 0;
      monthlyReturns[m - 1] = portfolioReturn;

      // Update fictitious ex-cashflow portfolio
      fValueExCash *= (1 + portfolioReturn);
      if (fValueExCash > peakExCash) {
        peakExCash = fValueExCash;
      }
      const ddExCash = peakExCash > 0 ? (fValueExCash - peakExCash) / peakExCash : 0;
      if (ddExCash < maxDrawdownExCash) {
        maxDrawdownExCash = ddExCash;
      }

      // Update SWR/PWR factors from market returns only. This remains meaningful even
      // when the scenario also has contributions, because it answers "what withdrawal
      // rate would this return path have supported?"
      const prev_x_t = x_t;
      const prev_y_t = y_t;
      x_t = prev_x_t * (1 + portfolioReturn);
      const inflationFactor = inflationAdjusted ? Math.pow(1 + monthlyInflation, m - 1) : 1.0;
      y_t = (prev_y_t - inflationFactor) * (1 + portfolioReturn);

      // Copy pre-cashflow values to active array
      for (let i = 0; i < numAssets; i++) {
        assetValues[i] = assetValuesPre[i];
      }
      portfolioValue = sumAssetValuesPre;

      // 4. Apply Cashflows (at month-end)
      let cashflowThisMonth = 0;
      const isCashflowMonth = (cashflowFreq === 'monthly') || (cashflowFreq === 'annually' && m % 12 === 0);

      if (cashflowType !== 'none' && isCashflowMonth) {
        // Escalate for inflation if specified
        const inflationMultiplier = inflationAdjusted ? Math.pow(1 + monthlyInflation, m) : 1.0;
        const currentCashflowAmount = cashflowAmount * inflationMultiplier;

        if (cashflowType === 'contribute') {
          cashflowThisMonth = currentCashflowAmount;
          // Contributions are distributed based on target weight allocation
          for (let i = 0; i < numAssets; i++) {
            assetValues[i] += cashflowThisMonth * allocations[i];
          }
          portfolioValue += cashflowThisMonth;
        } else if (cashflowType === 'withdraw') {
          cashflowThisMonth = Math.min(currentCashflowAmount, portfolioValue);
          // Withdrawals are deducted proportionally from current assets
          if (portfolioValue > 0) {
            const factor = 1 - (cashflowThisMonth / portfolioValue);
            for (let i = 0; i < numAssets; i++) {
              assetValues[i] *= factor;
            }
            portfolioValue -= cashflowThisMonth;
          }
        }
      }

      // 5. Apply Rebalancing
      const isRebalanceMonth = (rebalanceFreq === 'monthly') || 
                               (rebalanceFreq === 'quarterly' && m % 3 === 0) || 
                               (rebalanceFreq === 'annually' && m % 12 === 0);
      if (isRebalanceMonth && portfolioValue > 0) {
        for (let i = 0; i < numAssets; i++) {
          assetValues[i] = portfolioValue * allocations[i];
        }
      }

      // Update peak and nominal drawdown
      if (portfolioValue > peakNominal) {
        peakNominal = portfolioValue;
      }
      const ddNominal = peakNominal > 0 ? (portfolioValue - peakNominal) / peakNominal : 0;
      if (ddNominal < maxDrawdownNominal) {
        maxDrawdownNominal = ddNominal;
      }

      // Save annual balance at the end of each year
      if (m % 12 === 0) {
        const yearIndex = m / 12;
        annualBalancesAllPaths[yearIndex][pathIdx] = portfolioValue;
      }
    }

    // End of path calculations
    const finalBalanceNominal = portfolioValue;
    const finalBalanceReal = finalBalanceNominal / Math.pow(1 + inflationRate, years);

    // Compute TWRR (nominal)
    let prodNominal = 1.0;
    for (let i = 0; i < numMonths; i++) {
      prodNominal *= (1 + monthlyReturns[i]);
    }
    const twrrNominal = Math.pow(prodNominal, 12 / numMonths) - 1;
    const twrrReal = (1 + twrrNominal) / (1 + inflationRate) - 1;

    // Annual mean return & volatility from monthly returns
    let sumRet = 0;
    for (let i = 0; i < numMonths; i++) {
      sumRet += monthlyReturns[i];
    }
    const meanMonthlyReturn = sumRet / numMonths;
    const annualMeanReturn = meanMonthlyReturn * 12;

    let sumSqDiff = 0;
    for (let i = 0; i < numMonths; i++) {
      const diff = monthlyReturns[i] - meanMonthlyReturn;
      sumSqDiff += diff * diff;
    }
    const monthlyVol = numMonths > 1 ? Math.sqrt(sumSqDiff / (numMonths - 1)) : 0;
    const annualVol = monthlyVol * Math.sqrt(12);

    // Sharpe Ratio
    const annualRiskFree = riskFreeRate;
    const sharpe = annualVol > 0 ? (twrrNominal - annualRiskFree) / annualVol : 0;

    // Sortino Ratio
    let sumSqDownside = 0;
    for (let i = 0; i < numMonths; i++) {
      const diff = monthlyReturns[i] - rF;
      if (diff < 0) {
        sumSqDownside += diff * diff;
      }
    }
    const monthlyDownsideDeviation = Math.sqrt(sumSqDownside / numMonths);
    const annualDownsideDeviation = monthlyDownsideDeviation * Math.sqrt(12);
    const sortino = annualDownsideDeviation > 0 ? (twrrNominal - annualRiskFree) / annualDownsideDeviation : 0;

    // SWR and PWR calculation (closed-form, annual rate)
    const swrVal = Math.abs(y_t) > 1e-8 ? -12 * (x_t / y_t) : 0;
    const endRealTargetFactor = Math.pow(1 + monthlyInflation, numMonths);
    const pwrVal = Math.abs(y_t) > 1e-8 ? 12 * ((endRealTargetFactor - x_t) / y_t) : 0;

    // Save outputs
    allFinalBalancesNominal[pathIdx] = finalBalanceNominal;
    allFinalBalancesReal[pathIdx] = finalBalanceReal;
    allTWRRNominal[pathIdx] = twrrNominal;
    allTWRRReal[pathIdx] = twrrReal;
    allAnnualMeanReturns[pathIdx] = annualMeanReturn;
    allAnnualVolatilities[pathIdx] = annualVol;
    allSharpeRatios[pathIdx] = sharpe;
    allSortinoRatios[pathIdx] = sortino;
    allMaxDrawdownsNominal[pathIdx] = maxDrawdownNominal;
    allMaxDrawdownsExCashflows[pathIdx] = maxDrawdownExCash;
    allSWR[pathIdx] = swrVal;
    allPWR[pathIdx] = pwrVal;

    // Periodically post progress back to main thread
    if ((pathIdx + 1) % Math.ceil(numPaths / 10) === 0 || pathIdx === numPaths - 1) {
      self.postMessage({
        type: 'progress',
        progress: Math.round(((pathIdx + 1) / numPaths) * 100)
      });
    }
  }

  // Helper to calculate percentiles of an array
  function getPercentile(arr, p) {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = (sorted.length - 1) * (p / 100);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  // Calculate the trajectory for each percentile over the years
  const percentilesToTrack = [...new Set([...outputPercentiles, 5, 10, 25, 50, 75, 90, 95])]
    .filter(p => Number.isFinite(p) && p >= 0 && p <= 100)
    .sort((a, b) => a - b);
  const percentileTrajectoriesNominal = {};
  const percentileTrajectoriesReal = {};

  for (const p of percentilesToTrack) {
    percentileTrajectoriesNominal[p] = [];
    percentileTrajectoriesReal[p] = [];
    for (let y = 0; y <= years; y++) {
      const nominalBalances = annualBalancesAllPaths[y];
      
      // Calculate nominal percentile
      percentileTrajectoriesNominal[p].push(getPercentile(nominalBalances, p));
      
      // Calculate real percentile
      const realFactor = Math.pow(1 + inflationRate, y);
      const realBalances = new Float64Array(numPaths);
      for (let i = 0; i < numPaths; i++) {
        realBalances[i] = nominalBalances[i] / realFactor;
      }
      percentileTrajectoriesReal[p].push(getPercentile(realBalances, p));
    }
  }

  // Calculate percentiles for each metric
  const summaryPercentiles = {};
  const metrics = {
    twrrNominal: allTWRRNominal,
    twrrReal: allTWRRReal,
    finalBalanceNominal: allFinalBalancesNominal,
    finalBalanceReal: allFinalBalancesReal,
    annualMeanReturn: allAnnualMeanReturns,
    annualVolatility: allAnnualVolatilities,
    sharpe: allSharpeRatios,
    sortino: allSortinoRatios,
    maxDrawdownNominal: allMaxDrawdownsNominal,
    maxDrawdownExCash: allMaxDrawdownsExCashflows,
    swr: allSWR,
    pwr: allPWR
  };

  for (const metricKey in metrics) {
    summaryPercentiles[metricKey] = {};
    for (const p of outputPercentiles) {
      summaryPercentiles[metricKey][p] = getPercentile(metrics[metricKey], p);
    }
  }

  function probabilityAtOrAbove(target) {
    let count = 0;
    for (let i = 0; i < allFinalBalancesNominal.length; i++) {
      if (allFinalBalancesNominal[i] >= target) count++;
    }
    return (count / allFinalBalancesNominal.length) * 100;
  }

  const probabilityBase = Math.max(1, probabilityBaseAmount || initialAmount);
  const probabilities = [
    { label: "총투자금의 1배 이상 (1x)", probability: probabilityAtOrAbove(probabilityBase * 1) },
    { label: "총투자금의 2배 이상 (2x)", probability: probabilityAtOrAbove(probabilityBase * 2) },
    { label: "총투자금의 5배 이상 (5x)", probability: probabilityAtOrAbove(probabilityBase * 5) },
    { label: "총투자금의 10배 이상 (10x)", probability: probabilityAtOrAbove(probabilityBase * 10) },
    { label: "총투자금의 100배 이상 (100x)", probability: probabilityAtOrAbove(probabilityBase * 100) }
  ];

  // Post final results
  self.postMessage({
    type: 'results',
    results: {
      percentileTrajectoriesNominal,
      percentileTrajectoriesReal,
      summaryPercentiles,
      probabilities,
      totalInvested,
      crashSettings,
      conservativeAdjustments,
      modelUsed: useBootstrap ? 'bootstrap' : 'statistical'
    }
  });
};
