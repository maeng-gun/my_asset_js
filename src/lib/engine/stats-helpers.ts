/**
 * stats-helpers.ts
 * R의 PerformanceAnalytics 등에서 사용하던 금융 통계 함수들을 JS로 구현한 유틸리티.
 */

// 1. 평균 계산
export function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((sum, val) => sum + val, 0) / arr.length
}

// 2. 표준편차 (Sample Standard Deviation) 계산
export function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0
  const m = mean(arr)
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - m, 2), 0) / (arr.length - 1)
  return Math.sqrt(variance)
}

// 3. 일별 수익률 계산 (Prices -> Returns)
export function calculateReturns(prices: number[]): number[] {
  if (prices.length < 2) return []
  const returns: number[] = []
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]
    const curr = prices[i]
    if (prev === 0) returns.push(0)
    else returns.push((curr - prev) / prev)
  }
  return returns
}

// 4. 누적 수익률 배열 계산 (Cumulative Returns)
// 반환값의 첫 항목은 1.0 (또는 0%) 이 아님, 각 시점의 1+R 누적곱 - 1
export function calculateCumulativeReturns(returns: number[]): number[] {
  const cum: number[] = []
  let current = 1.0
  for (const r of returns) {
    current *= (1 + r)
    cum.push(current - 1)
  }
  return cum
}

// 5. 연환산 수익률 (CAGR) 계산
// cumulativeReturn: 마지막 시점의 누적수익률 (예: 0.5 = 50%)
// periods: 경과 일수
export function calculateCAGR(cumulativeReturn: number, days: number): number {
  if (days <= 0) return 0
  return Math.pow(1 + cumulativeReturn, 365 / days) - 1
}

// 6. 연환산 변동성 계산 (Annualized Volatility)
export function calculateAnnualizedVolatility(returns: number[]): number {
  const sd = stdDev(returns)
  return sd * Math.sqrt(252) // 영업일 기준 252일
}

// 7. 샤프 지수 (Sharpe Ratio)
export function calculateSharpeRatio(returns: number[], riskFreeRateAnnual = 0.035): number {
  if (returns.length < 2) return 0
  const annRet = calculateCAGR(calculateCumulativeReturns(returns).pop() || 0, returns.length)
  const annVol = calculateAnnualizedVolatility(returns)
  if (annVol === 0) return 0
  return (annRet - riskFreeRateAnnual) / annVol
}

// 8. 하방 편차 (Downside Deviation) - 소르티노 지수용
export function calculateDownsideDeviation(returns: number[], targetReturnDaily = 0): number {
  if (returns.length === 0) return 0
  const downsideSquared = returns.reduce((sum, r) => {
    if (r < targetReturnDaily) {
      return sum + Math.pow(r - targetReturnDaily, 2)
    }
    return sum
  }, 0)
  return Math.sqrt(downsideSquared / returns.length) * Math.sqrt(252)
}

// 9. 소르티노 지수 (Sortino Ratio)
export function calculateSortinoRatio(returns: number[], riskFreeRateAnnual = 0.035): number {
  if (returns.length < 2) return 0
  const annRet = calculateCAGR(calculateCumulativeReturns(returns).pop() || 0, returns.length)
  const riskFreeDaily = Math.pow(1 + riskFreeRateAnnual, 1 / 252) - 1
  const dd = calculateDownsideDeviation(returns, riskFreeDaily)
  if (dd === 0) return 0
  return (annRet - riskFreeRateAnnual) / dd
}

// 10. Max Drawdown (MDD) 계산
export function calculateMDD(pricesOrCumReturns: number[], isPrices = false): number {
  if (pricesOrCumReturns.length === 0) return 0
  let maxPeak = isPrices ? pricesOrCumReturns[0] : (1 + pricesOrCumReturns[0])
  let maxDrawdown = 0

  for (const val of pricesOrCumReturns) {
    const current = isPrices ? val : (1 + val)
    if (current > maxPeak) {
      maxPeak = current
    }
    const drawdown = (maxPeak - current) / maxPeak
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown
    }
  }
  return -maxDrawdown // 음수로 반환 (-0.2 = -20%)
}

// 11. 공분산 (Covariance)
export function covariance(arr1: number[], arr2: number[]): number {
  if (arr1.length !== arr2.length || arr1.length === 0) return 0
  const m1 = mean(arr1)
  const m2 = mean(arr2)
  let sum = 0
  for (let i = 0; i < arr1.length; i++) {
    sum += (arr1[i] - m1) * (arr2[i] - m2)
  }
  return sum / (arr1.length - 1)
}

// 12. 상관계수 (Correlation)
export function correlation(arr1: number[], arr2: number[]): number {
  const cov = covariance(arr1, arr2)
  const sd1 = stdDev(arr1)
  const sd2 = stdDev(arr2)
  if (sd1 === 0 || sd2 === 0) return 0
  return cov / (sd1 * sd2)
}

// 13. 베타 (Beta)
export function calculateBeta(assetReturns: number[], benchmarkReturns: number[]): number {
  const cov = covariance(assetReturns, benchmarkReturns)
  const varBm = Math.pow(stdDev(benchmarkReturns), 2)
  if (varBm === 0) return 0
  return cov / varBm
}

// 14. 젠센의 알파 (Jensen's Alpha) - 연환산 기준
export function calculateAlpha(
  assetAnnReturn: number,
  benchmarkAnnReturn: number,
  beta: number,
  riskFreeRateAnnual = 0.035
): number {
  return assetAnnReturn - (riskFreeRateAnnual + beta * (benchmarkAnnReturn - riskFreeRateAnnual))
}
