import { NextRequest, NextResponse } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import { format, subDays } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'
import { TABLES } from '@/lib/supabase/tables'
import {
  AllocationPolicyRow,
  MAJOR_9_KEYS,
  Major9Key,
  Weights9,
  classifyLeafToMajor9,
  createZeroWeights9,
  normalizeWeights9,
} from '@/lib/engine/alm-tpa-types'
import {
  DEFAULT_REF_WEIGHTS_9,
  DEFAULT_SAA_WEIGHTS_9,
  DEFAULT_TAA_WEIGHTS_9,
} from '@/lib/engine/saa-taa-optimizer'
import {
  MAJOR_9_BM_TICKERS,
  computeFiveStageAttribution,
} from '@/lib/engine/attribution-engine'

const yahooFinance = new YahooFinance()

interface ReturnRow {
  기준일: string
  자산군: string
  세부자산군: string
  세부자산군2: string
  총손익: number
  평가금액: number
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)

    const todayStr = format(new Date(), 'yyyy-MM-dd')
    const defaultStart = `${todayStr.slice(0, 4)}-01-01`
    const startDate = searchParams.get('startDate') || defaultStart
    const endDate = searchParams.get('endDate') || todayStr

    // 1. Fetch current policies + return rows in [startDate, endDate]
    const [{ data: policyRows }, returnRows] = await Promise.all([
      supabase
        .from(TABLES.allocation_policies)
        .select('*')
        .eq('is_current', true),
      (async () => {
        const all: ReturnRow[] = []
        const limit = 1000
        let start = 0
        while (true) {
          const { data, error } = (await supabase
            .from(TABLES.return)
            .select('기준일, 자산군, 세부자산군, 세부자산군2, 총손익, 평가금액')
            .gte('기준일', startDate)
            .lte('기준일', endDate)
            .order('기준일', { ascending: true })
            .range(start, start + limit - 1)) as unknown as {
            data: ReturnRow[] | null
            error: Error | null
          }
          if (error) throw error
          if (!data || data.length === 0) break
          all.push(...data)
          if (data.length < limit) break
          start += limit
        }
        return all
      })(),
    ])

    const policies = (policyRows || []) as AllocationPolicyRow[]
    const refWeights = policies.find((p) => p.policy_type === 'REF')?.weights_9
      ? normalizeWeights9(policies.find((p) => p.policy_type === 'REF')!.weights_9)
      : DEFAULT_REF_WEIGHTS_9
    const saaWeights = policies.find((p) => p.policy_type === 'SAA')?.weights_9
      ? normalizeWeights9(policies.find((p) => p.policy_type === 'SAA')!.weights_9)
      : DEFAULT_SAA_WEIGHTS_9
    const taaWeights = policies.find((p) => p.policy_type === 'TAA')?.weights_9
      ? normalizeWeights9(policies.find((p) => p.policy_type === 'TAA')!.weights_9)
      : DEFAULT_TAA_WEIGHTS_9

    const normalized = returnRows.map((r) => ({
      ...r,
      기준일: String(r.기준일).slice(0, 10),
    }))
    const uniqueDates = Array.from(new Set(normalized.map((r) => r.기준일))).sort()

    if (uniqueDates.length < 2) {
      const empty = computeFiveStageAttribution({
        dates: uniqueDates,
        bmDailyReturns: {} as Record<Major9Key, number[]>,
        myPfDailyReturns: [],
        actualDailyWeights: [],
        refWeights,
        saaWeights,
        taaWeights,
      })
      return NextResponse.json({
        success: true,
        startDate,
        endDate,
        tradingDays: uniqueDates.length,
        ...empty,
        policiesUsed: { refWeights, saaWeights, taaWeights },
        bmTickers: MAJOR_9_BM_TICKERS,
      })
    }

    // 2. Build MyPF daily returns & actual daily 9-asset weights
    const totalByDate = new Map<string, { 총손익: number; 평가금액: number }>()
    const leafAmountsByDate = new Map<string, Weights9>()

    for (const r of normalized) {
      if (r.자산군 === '<합계>') {
        totalByDate.set(r.기준일, {
          총손익: Number(r.총손익) || 0,
          평가금액: Number(r.평가금액) || 0,
        })
      } else if (r.세부자산군2 && r.세부자산군2 !== '') {
        let w = leafAmountsByDate.get(r.기준일)
        if (!w) {
          w = createZeroWeights9()
          leafAmountsByDate.set(r.기준일, w)
        }
        const m9 = classifyLeafToMajor9(r.자산군, r.세부자산군, r.세부자산군2)
        w[m9] += Math.max(0, Number(r.평가금액) || 0)
      }
    }

    const myPfDailyReturns: number[] = []
    const actualDailyWeights: Weights9[] = []
    let prevProfit = 0
    let prevEval = 0

    for (let i = 0; i < uniqueDates.length; i++) {
      const d = uniqueDates[i]
      const tot = totalByDate.get(d) ?? { 총손익: prevProfit, 평가금액: prevEval }

      if (i === 0) {
        prevProfit = tot.총손익
        prevEval = tot.평가금액
        myPfDailyReturns.push(0)
      } else {
        const prevDate = uniqueDates[i - 1]
        const isNewYear = d.slice(0, 4) !== prevDate.slice(0, 4)
        const dailyProfit = isNewYear ? tot.총손익 : tot.총손익 - prevProfit
        const rDaily = prevEval > 0 ? dailyProfit / prevEval : 0
        myPfDailyReturns.push(rDaily)
        prevProfit = tot.총손익
        prevEval = tot.평가금액
      }

      const rawLeaf = leafAmountsByDate.get(d)
      const leafSum = rawLeaf
        ? MAJOR_9_KEYS.reduce((acc, k) => acc + (rawLeaf[k] || 0), 0)
        : 0
      if (rawLeaf && leafSum > 0) {
        const wPct = createZeroWeights9()
        for (const k of MAJOR_9_KEYS) {
          wPct[k] = Number(((rawLeaf[k] / leafSum) * 100).toFixed(2))
        }
        actualDailyWeights.push(wPct)
      } else {
        actualDailyWeights.push({ ...saaWeights })
      }
    }

    // 3. Fetch benchmark prices for 8 ETFs over [startDate - 10d, endDate]
    const fetchStart = format(subDays(new Date(uniqueDates[0]), 10), 'yyyy-MM-dd')
    const queryOptions = {
      period1: fetchStart,
      period2: endDate,
      interval: '1d' as const,
    }

    const etfKeys = MAJOR_9_KEYS.filter((k) => k !== '현금성자산')
    const bmPriceMaps = new Map<Major9Key, Array<{ date: string; px: number }>>()

    await Promise.all(
      etfKeys.map(async (k) => {
        const ticker = MAJOR_9_BM_TICKERS[k]
        const rows = await (
          yahooFinance.historical(ticker, queryOptions) as Promise<
            Array<{ date?: Date; adjClose?: number; close?: number }>
          >
        ).catch(() => [])
        const sorted = rows
          .filter((r) => r.date && (r.adjClose ?? r.close))
          .map((r) => ({
            date: format(r.date!, 'yyyy-MM-dd'),
            px: Number(r.adjClose ?? r.close),
          }))
          .sort((a, b) => a.date.localeCompare(b.date))
        bmPriceMaps.set(k, sorted)
      })
    )

    const bmDailyReturns = {} as Record<Major9Key, number[]>
    for (const k of etfKeys) {
      let series = bmPriceMaps.get(k) ?? []
      // Fallback for 시장형채권 if Yahoo data is empty
      if (series.length < 2 && k === '시장형채권') {
        series = bmPriceMaps.get('만기보유채권') ?? []
      }

      const alignedPx: number[] = []
      let ptr = 0
      let lastPx = series[0]?.px ?? 0

      for (const d of uniqueDates) {
        while (ptr < series.length && series[ptr].date <= d) {
          lastPx = series[ptr].px
          ptr++
        }
        alignedPx.push(lastPx)
      }

      const rets: number[] = [0]
      for (let i = 1; i < alignedPx.length; i++) {
        const p0 = alignedPx[i - 1]
        const p1 = alignedPx[i]
        rets.push(p0 > 0 && p1 > 0 ? (p1 - p0) / p0 : 0)
      }
      bmDailyReturns[k] = rets
    }
    bmDailyReturns.현금성자산 = uniqueDates.map((_, idx) => (idx === 0 ? 0 : 0.0265 / 252))

    const result = computeFiveStageAttribution({
      dates: uniqueDates,
      bmDailyReturns,
      myPfDailyReturns,
      actualDailyWeights,
      refWeights,
      saaWeights,
      taaWeights,
    })

    return NextResponse.json({
      success: true,
      startDate: uniqueDates[0],
      endDate: uniqueDates[uniqueDates.length - 1],
      tradingDays: uniqueDates.length,
      ...result,
      policiesUsed: { refWeights, saaWeights, taaWeights },
      bmTickers: MAJOR_9_BM_TICKERS,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Attribution analytics error'
    console.error('[API /api/portfolio/analytics/attribution] Error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
