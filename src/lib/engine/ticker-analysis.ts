import yahooFinance from 'yahoo-finance2'
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
  return {
    ticker,
    benchmark,
    dates: [alignedDates[0], ...alignedDates.slice(1)], // 첫날도 포함
    tickerCumReturns: [0, ...tCumReturns], // 0%에서 시작
    benchmarkCumReturns: [0, ...bCumReturns], // 0%에서 시작
    stats: {
      target: targetStats,
      benchmark: bmStats,
    }
  }
}
