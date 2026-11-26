import YahooFinance from 'yahoo-finance2'
const yahooFinance = new YahooFinance()

import { format, subYears } from 'date-fns'
import {
  calculateReturns,
  calculateCumulativeReturns,
  calculateCAGR,
  calculateAnnualizedVolatility,
  calculateSharpeRatio,
  calculateMDD,
} from './stats-helpers'
import {
  AllocationPolicyRow,
  MAJOR_9_KEYS,
  Major9Key,
  Weights9,
  createZeroWeights9,
  normalizeWeights9,
} from './alm-tpa-types'
import {
  DEFAULT_REF_WEIGHTS_9,
  DEFAULT_SAA_WEIGHTS_9,
  DEFAULT_TAA_WEIGHTS_9,
} from './saa-taa-optimizer'
import { MAJOR_9_BM_TICKERS } from './attribution-engine'

export interface AlloTableLikeRow {
  행번호?: number
  배분일자?: string
  구분?: string
  국내주식?: number
  해외주식?: number
  만기보유채권?: number
  시장형채권?: number
  실물자산?: number
  인컴자산?: number
}

export function selectLatestAlloRow(
  alloRows: AlloTableLikeRow[],
  strategyKeys: string[]
): AlloTableLikeRow | undefined {
  if (!alloRows || alloRows.length === 0) return undefined
  // Sort chronologically by 배분일자 then 행번호 ascending, then search from latest
  const sorted = [...alloRows].sort((a, b) => {
    const da = String(a.배분일자 || '')
    const db = String(b.배분일자 || '')
    if (da !== db) return da.localeCompare(db)
    return (Number(a.행번호) || 0) - (Number(b.행번호) || 0)
  })
  for (const key of strategyKeys) {
    const found = [...sorted].reverse().find((r) => r.구분 === key)
    if (found) return found
  }
  return undefined
}

export function allo6RowToWeights9(row?: AlloTableLikeRow): Weights9 {
  if (!row) return { ...DEFAULT_SAA_WEIGHTS_9 }
  const out = createZeroWeights9()
  out.선진국주식 = Number(row.해외주식) || 0
  // Legacy 6-col '국내주식' combined 국내+신흥국; approximate 85/15 split if converting legacy row
  const domAndEm = Number(row.국내주식) || 0
  out.국내주식 = Number((domAndEm * 0.85).toFixed(2))
  out.신흥국주식 = Number((domAndEm * 0.15).toFixed(2))
  // Legacy 6-col '실물자산' combined 귀금속+원자재
  const real = Number(row.실물자산) || 0
  out.귀금속 = Number((real * 0.7).toFixed(2))
  out.원자재 = Number((real * 0.3).toFixed(2))
  out.인컴자산 = Number(row.인컴자산) || 0
  out.만기보유채권 = Number(row.만기보유채권) || 0
  out.시장형채권 = Number(row.시장형채권) || 0
  const used =
    out.선진국주식 +
    out.국내주식 +
    out.신흥국주식 +
    out.귀금속 +
    out.원자재 +
    out.인컴자산 +
    out.만기보유채권 +
    out.시장형채권
  out.현금성자산 = Math.max(0, Number((100 - used).toFixed(2)))
  return out
}

export async function runAllocationBacktest(
  alloRows: AlloTableLikeRow[],
  policies: AllocationPolicyRow[] = []
) {
  const refPol = policies.find((p) => p.policy_type === 'REF' && p.is_current)
  const saaPol = policies.find((p) => p.policy_type === 'SAA' && p.is_current)
  const taaPol = policies.find((p) => p.policy_type === 'TAA' && p.is_current)

  const latestSaaRow = selectLatestAlloRow(alloRows, ['SAA'])
  const latestTaaRow = selectLatestAlloRow(alloRows, ['TAA', 'TAA2', 'TAA1'])

  const refWeights: Weights9 = refPol?.weights_9
    ? normalizeWeights9(refPol.weights_9)
    : DEFAULT_REF_WEIGHTS_9
  const saaWeights: Weights9 = saaPol?.weights_9
    ? normalizeWeights9(saaPol.weights_9)
    : latestSaaRow
    ? allo6RowToWeights9(latestSaaRow)
    : DEFAULT_SAA_WEIGHTS_9
  const taaWeights: Weights9 = taaPol?.weights_9
    ? normalizeWeights9(taaPol.weights_9)
    : latestTaaRow
    ? allo6RowToWeights9(latestTaaRow)
    : DEFAULT_TAA_WEIGHTS_9

  const today = new Date()
  const startDate = format(subYears(today, 5), 'yyyy-MM-dd')
  const endDate = format(today, 'yyyy-MM-dd')

  const queryOptions = {
    period1: startDate,
    period2: endDate,
    interval: '1d' as const,
  }

  const tickerEntries = MAJOR_9_KEYS.filter((k) => k !== '현금성자산')
  const fetched = await Promise.all(
    tickerEntries.map(async (k) => {
      const sym = MAJOR_9_BM_TICKERS[k]
      const rows = await (
        yahooFinance.historical(sym, queryOptions) as Promise<
          Array<{ date?: Date; adjClose?: number; close?: number }>
        >
      ).catch(() => [])
      const map = new Map<string, number>()
      for (const r of rows) {
        const px = r.adjClose ?? r.close
        if (r.date && px && px > 0) {
          map.set(format(r.date, 'yyyy-MM-dd'), px)
        }
      }
      return [k, map] as const
    })
  )

  const priceMaps = new Map<Major9Key, Map<string, number>>(fetched)
  const coreBackboneDates = Array.from(
    new Set([
      ...(priceMaps.get('국내주식')?.keys() ?? []),
      ...(priceMaps.get('선진국주식')?.keys() ?? []),
    ])
  ).sort()

  const alignedDates = coreBackboneDates.filter(
    (d) => priceMaps.get('국내주식')?.has(d) && priceMaps.get('선진국주식')?.has(d)
  )

  if (alignedDates.length < 2) {
    throw new Error('Not enough overlapping data points for backtesting.')
  }

  // Build aligned price series with nearest-prior forward-fill and bond/equity proxy fallback for late-listed ETFs
  const dailyReturnsByAsset = {} as Record<Major9Key, number[]>
  for (const k of tickerEntries) {
    const map = priceMaps.get(k) ?? new Map<string, number>()
    const prices: number[] = []
    let lastPx = 0

    for (const d of alignedDates) {
      const exact = map.get(d)
      if (exact && exact > 0) {
        lastPx = exact
        prices.push(exact)
      } else if (lastPx > 0) {
        prices.push(lastPx)
      } else {
        // Pre-listing fallback proxy: use 시장형채권->만기보유채권, else 국내주식/선진국주식
        const fallbackMap =
          k === '시장형채권'
            ? priceMaps.get('만기보유채권')
            : k === '신흥국주식'
            ? priceMaps.get('선진국주식')
            : priceMaps.get('만기보유채권')
        const fb = fallbackMap?.get(d) ?? 100
        prices.push(fb)
      }
    }
    dailyReturnsByAsset[k] = calculateReturns(prices)
  }

  const cashDailyRet = 0.0265 / 252
  dailyReturnsByAsset.현금성자산 = Array.from(
    { length: dailyReturnsByAsset.국내주식.length },
    () => cashDailyRet
  )

  const generateStrategyStats = (weights: Weights9, name: string) => {
    const len = dailyReturnsByAsset.국내주식.length
    const pfReturns: number[] = []
    for (let i = 0; i < len; i++) {
      let r = 0
      for (const k of MAJOR_9_KEYS) {
        r += ((weights[k] || 0) / 100) * (dailyReturnsByAsset[k][i] ?? 0)
      }
      pfReturns.push(r)
    }

    const pfCumReturns = calculateCumulativeReturns(pfReturns)
    const cagr = calculateCAGR(pfCumReturns[pfCumReturns.length - 1], alignedDates.length) * 100
    const vol = calculateAnnualizedVolatility(pfReturns) * 100
    const sharpe = calculateSharpeRatio(pfReturns)
    const mdd = calculateMDD(pfCumReturns, false) * 100

    return {
      전략명: name,
      가중치: weights,
      연환산수익률: Number(cagr.toFixed(2)),
      연환산변동성: Number(vol.toFixed(2)),
      Sharpe: Number(sharpe.toFixed(2)),
      MDD: Number(mdd.toFixed(2)),
    }
  }

  return [
    generateStrategyStats(refWeights, '1층 Ref (75:25 레퍼런스)'),
    generateStrategyStats(saaWeights, '2층-A SAA (장기 전략적 배분)'),
    generateStrategyStats(taaWeights, '2층-B TAA (현행 전술적 배분)'),
  ]
}
