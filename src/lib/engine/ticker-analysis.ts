import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()
import {
  calculateReturns,
  calculateCumulativeReturns,
  calculateCAGR,
  calculateAnnualizedVolatility,
  calculateSharpeRatio,
  calculateMDD,
  calculateBeta,
  calculateAlpha,
  correlation,
} from './stats-helpers'
import { format, parseISO } from 'date-fns'

export interface TickerStats {
  cagr: number
  volatility: number
  sharpe: number
  mdd: number
  beta: number
  alpha: number
  correlation: number
}

export interface TickerAnalysisResult {
  ticker: string
  benchmark: string
  dates: string[]
  tickerCumReturns: number[]
  benchmarkCumReturns: number[]
  stats: {
    target: TickerStats
    benchmark: TickerStats
  }
  yearlyRet?: { year: number; ticker: number; bm: number }[]
  monthlyRet?: { year: number; month: number; ret: number }[]
  rollingVol?: { date: string; vol: number }[]
  rollingSharpe?: { date: string; sharpe: number }[]
}

function toYfSymbol(ticker: string): string {
  // 6자리 숫자인 경우 한국 주식으로 간주 (.KS 추가)
  if (/^\d{6}$/.test(ticker)) {
    return `${ticker}.KS`
  }
  return ticker
}

export async function buildTickerAnalysisData(
  ticker: string,
  benchmark: string = 'SPY',
  startDate: string,
  endDate: string
): Promise<TickerAnalysisResult> {
  const yfTicker = toYfSymbol(ticker)
  const yfBenchmark = toYfSymbol(benchmark)

  const queryOptions = {
    period1: startDate,
    period2: endDate,
    interval: '1d' as const,
  }

  // 병렬로 Yahoo Finance 데이터 가져오기
  const [tickerData, bmData] = await Promise.all([
    (yahooFinance.historical(yfTicker, queryOptions) as Promise<any[]>).catch(() => [] as any[]),
    (yahooFinance.historical(yfBenchmark, queryOptions) as Promise<any[]>).catch(() => [] as any[]),
  ])

  if (tickerData.length === 0) {
    throw new Error(`Data not found for ticker: ${ticker}`)
  }

  // 날짜를 기준으로 Map 생성 (Inner Join을 위함)
  const bmMap = new Map<string, number>()
  for (const row of bmData) {
    if (row.date && row.adjClose) {
      bmMap.set(format(row.date, 'yyyy-MM-dd'), row.adjClose)
    }
  }

  const alignedDates: string[] = []
  const tickerPrices: number[] = []
  const bmPrices: number[] = []

  // Inner Join
  for (const row of tickerData) {
    if (!row.date || !row.adjClose) continue
    const dateStr = format(row.date, 'yyyy-MM-dd')
    
    if (bmMap.has(dateStr)) {
      alignedDates.push(dateStr)
      tickerPrices.push(row.adjClose)
      bmPrices.push(bmMap.get(dateStr)!)
    }
  }

  if (alignedDates.length < 2) {
    throw new Error('Not enough overlapping data points to perform analysis.')
  }

  // 1. 일별 수익률 계산
  const tReturns = calculateReturns(tickerPrices)
  const bReturns = calculateReturns(bmPrices)

  // 2. 누적 수익률 계산
  const tCumReturns = calculateCumulativeReturns(tReturns)
  const bCumReturns = calculateCumulativeReturns(bReturns)

  // 3. 통계 계산
  const tCagr = calculateCAGR(tCumReturns[tCumReturns.length - 1], alignedDates.length)
  const bCagr = calculateCAGR(bCumReturns[bCumReturns.length - 1], alignedDates.length)

  const tVol = calculateAnnualizedVolatility(tReturns)
  const bVol = calculateAnnualizedVolatility(bReturns)

  const tSharpe = calculateSharpeRatio(tReturns)
  const bSharpe = calculateSharpeRatio(bReturns)

  const tMdd = calculateMDD(tCumReturns, false)
  const bMdd = calculateMDD(bCumReturns, false)

  const beta = calculateBeta(tReturns, bReturns)
  const alpha = calculateAlpha(tCagr, bCagr, beta)
  const corr = correlation(tReturns, bReturns)

  const targetStats: TickerStats = {
    cagr: tCagr,
    volatility: tVol,
    sharpe: tSharpe,
    mdd: tMdd,
    beta,
    alpha,
    correlation: corr,
  }

  const bmStats: TickerStats = {
    cagr: bCagr,
    volatility: bVol,
    sharpe: bSharpe,
    mdd: bMdd,
    beta: 1, // Benchmark beta to itself is 1
    alpha: 0,
    correlation: 1,
  }

  // 배열 길이를 맞추기 위해 누적수익률 앞에 0 추가 (시작점)
  const fullDates = [alignedDates[0], ...alignedDates.slice(1)]
  const fullTCumReturns = [0, ...tCumReturns]
  const fullBCumReturns = [0, ...bCumReturns]

  // 4. 연도별 수익률, 월별 수익률 히트맵 데이터 계산
  const yearlyRetMap = new Map<number, { tRet: number, bRet: number }>()
  const monthlyRetMap = new Map<string, number>()

  // 일별 수익률을 통해 연도/월별 누적 수익률 계산
  let currentYear = parseISO(alignedDates[1]).getFullYear()
  let currentMonth = parseISO(alignedDates[1]).getMonth() + 1
  let tMonthProd = 1
  let tYearProd = 1
  let bYearProd = 1

  for (let i = 0; i < tReturns.length; i++) {
    const d = parseISO(alignedDates[i + 1])
    const year = d.getFullYear()
    const month = d.getMonth() + 1

    if (year !== currentYear) {
      yearlyRetMap.set(currentYear, { tRet: (tYearProd - 1) * 100, bRet: (bYearProd - 1) * 100 })
      tYearProd = 1
      bYearProd = 1
      currentYear = year
    }
    
    if (month !== currentMonth || year !== parseISO(alignedDates[i]).getFullYear()) {
      monthlyRetMap.set(`${parseISO(alignedDates[i]).getFullYear()}-${String(currentMonth).padStart(2, '0')}`, (tMonthProd - 1) * 100)
      tMonthProd = 1
      currentMonth = month
    }

    tMonthProd *= (1 + tReturns[i])
    tYearProd *= (1 + tReturns[i])
    bYearProd *= (1 + bReturns[i])
  }
  // 마지막 구간 처리
  yearlyRetMap.set(currentYear, { tRet: (tYearProd - 1) * 100, bRet: (bYearProd - 1) * 100 })
  monthlyRetMap.set(`${currentYear}-${String(currentMonth).padStart(2, '0')}`, (tMonthProd - 1) * 100)

  const yearlyRet = Array.from(yearlyRetMap.entries()).map(([year, rets]) => ({
    year,
    ticker: rets.tRet,
    bm: rets.bRet
  }))

  const monthlyRet = Array.from(monthlyRetMap.entries()).map(([ym, ret]) => {
    const [year, month] = ym.split('-')
    return { year: parseInt(year), month: parseInt(month), ret }
  })

  // 5. 롤링 변동성 및 샤프 지수 계산 (윈도우 756일 = 약 3년)
  const windowSize = 756
  const rollingVol: { date: string, vol: number }[] = []
  const rollingSharpe: { date: string, sharpe: number }[] = []

  for (let i = windowSize; i < tReturns.length; i++) {
    const windowReturns = tReturns.slice(i - windowSize, i)
    const vol = calculateAnnualizedVolatility(windowReturns)
    const sharpe = calculateSharpeRatio(windowReturns)
    
    rollingVol.push({ date: alignedDates[i + 1], vol: vol * 100 })
    rollingSharpe.push({ date: alignedDates[i + 1], sharpe })
  }

  return {
    ticker,
    benchmark,
    dates: fullDates,
    tickerCumReturns: fullTCumReturns,
    benchmarkCumReturns: fullBCumReturns,
    stats: {
      target: targetStats,
      benchmark: bmStats,
    },
    yearlyRet,
    monthlyRet,
    rollingVol,
    rollingSharpe
  }
}
