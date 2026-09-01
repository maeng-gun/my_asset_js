import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()
import {
  calculateReturns,
  calculateCumulativeReturns,
  calculateCAGR,
  calculateAnnualizedVolatility,
  calculateSharpeRatio,
  calculateMDD,
} from './stats-helpers'
import { format, subYears } from 'date-fns'

// 포트폴리오 자산군 벤치마크 매핑
export const ASSET_CLASS_BENCHMARKS: Record<string, string> = {
  '선진국': '360200.KS',
  '국내': '305050.KS',
  '실물자산': '411060.KS',
  '인컴자산': '329200.KS',
  '채권': '114460.KS',
}

export interface AssetClassPerformance {
  assetClass: string
  benchmarkTicker: string
  dates: string[]
  benchmarkCumReturns: number[]
  stats: {
    cagr: number
    volatility: number
    sharpe: number
    mdd: number
  }
}

export async function buildAssetPerformanceData(
  assetClasses: string[] = ['주식', '채권', '대체자산', '현금성', '외화자산'],
  startDate: string = format(subYears(new Date(), 3), 'yyyy-MM-dd'),
  endDate: string = format(new Date(), 'yyyy-MM-dd')
): Promise<Record<string, AssetClassPerformance>> {
  
  const queryOptions = {
    period1: startDate,
    period2: endDate,
    interval: '1d' as const,
  }

  const results: Record<string, AssetClassPerformance> = {}

  await Promise.all(
    assetClasses.map(async (ac) => {
      const bmTicker = ASSET_CLASS_BENCHMARKS[ac]
      if (!bmTicker) return

      try {
        const data = (await yahooFinance.historical(bmTicker, queryOptions)) as any[]
        
        if (data.length < 2) return

        const dates = data.map((d) => format(d.date, 'yyyy-MM-dd'))
        const prices = data.map((d) => d.adjClose)

        const returns = calculateReturns(prices)
        const cumReturns = calculateCumulativeReturns(returns)

        const cagr = calculateCAGR(cumReturns[cumReturns.length - 1], dates.length)
        const volatility = calculateAnnualizedVolatility(returns)
        const sharpe = calculateSharpeRatio(returns)
        const mdd = calculateMDD(cumReturns, false)

        results[ac] = {
          assetClass: ac,
          benchmarkTicker: bmTicker,
          dates: [dates[0], ...dates.slice(1)], // align with cumReturns (0 at start)
          benchmarkCumReturns: [0, ...cumReturns],
          stats: {
            cagr,
            volatility,
            sharpe,
            mdd,
          }
        }
      } catch (err) {
        console.warn(`[AssetPerformance] Failed to fetch benchmark ${bmTicker} for ${ac}:`, err)
      }
    })
  )

  return results
}

// 전체 포트폴리오 벤치마크 (S&P 500 / 60:40 등)
export async function buildPortfolioBenchmark(
  benchmarks: string[] = ['SPY', 'AOR'], // AOR: iShares Core Growth Allocation ETF (roughly 60/40)
  startDate: string,
  endDate: string
): Promise<Record<string, AssetClassPerformance>> {
  const queryOptions = {
    period1: startDate,
    period2: endDate,
    interval: '1d' as const,
  }

  const results: Record<string, AssetClassPerformance> = {}

  await Promise.all(
    benchmarks.map(async (bm) => {
      try {
        const data = (await yahooFinance.historical(bm, queryOptions)) as any[]
        if (data.length < 2) return

        const dates = data.map((d) => format(d.date, 'yyyy-MM-dd'))
        const prices = data.map((d) => d.adjClose)
        const returns = calculateReturns(prices)
        const cumReturns = calculateCumulativeReturns(returns)

        const cagr = calculateCAGR(cumReturns[cumReturns.length - 1], dates.length)
        const volatility = calculateAnnualizedVolatility(returns)
        const sharpe = calculateSharpeRatio(returns)
        const mdd = calculateMDD(cumReturns, false)

        results[bm] = {
          assetClass: 'Portfolio Benchmark',
          benchmarkTicker: bm,
          dates: [dates[0], ...dates.slice(1)],
          benchmarkCumReturns: [0, ...cumReturns],
          stats: {
            cagr,
            volatility,
            sharpe,
            mdd,
          }
        }
      } catch (err) {
        console.warn(`[AssetPerformance] Failed to fetch portfolio benchmark ${bm}:`, err)
      }
    })
  )

  return results
}
