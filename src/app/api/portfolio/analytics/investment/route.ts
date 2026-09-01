import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'
import { subDays, parseISO, format } from 'date-fns'
import { buildAssetPerformanceData } from '@/lib/engine/asset-performance'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)

    const startDate = searchParams.get('startDate') || ''
    const endDate = searchParams.get('endDate') || ''

    // 2. 5대 자산군 투자성과 분석
    const { data: returnRows, error } = await fetchAll(supabase, 'return', '기준일')

    if (error) throw error

    let base = (returnRows || []).map((r) => ({
      ...r,
      기준일: r.기준일.substring(0, 10),
    }))

    if (startDate) base = base.filter((r) => r.기준일 >= startDate)
    if (endDate) base = base.filter((r) => r.기준일 <= endDate)

    const uniqueDates = Array.from(new Set(base.map((r) => r.기준일))).sort()

    // BM 데이터를 가져옵니다.
    const activeStartDate = uniqueDates.length > 0 ? uniqueDates[0] : startDate || '2020-01-01'
    const activeEndDate = uniqueDates.length > 0 ? uniqueDates[uniqueDates.length - 1] : endDate || format(new Date(), 'yyyy-MM-dd')
    const bmData = await buildAssetPerformanceData(['선진국', '국내', '실물자산', '인컴자산', '채권'], activeStartDate, activeEndDate)

    // 헬퍼: 자산군별 MyPF 일별 수익률 산출 및 BM 병합
    const calcMyPfAssetSeries = (bmKey: string, filterFn: (r: any) => boolean) => {
      const filtered = base.filter(filterFn).sort((a, b) => a.기준일.localeCompare(b.기준일))
      const dateMap = new Map<string, { 총손익: number; 평가금액: number }>()
      for (const f of filtered) {
        dateMap.set(f.기준일, {
          총손익: (dateMap.get(f.기준일)?.총손익 || 0) + (f.총손익 || 0),
          평가금액: (dateMap.get(f.기준일)?.평가금액 || 0) + (f.평가금액 || 0),
        })
      }

      let prevProfit = 0
      let prevEval = 0
      let cumReturn = 0
      let maxCum = 0

      const series: Array<{ 기준일: string; MyPF: number; BM: number; DD: number }> = []
      
      const bmAssetData = bmData[bmKey]
      const bmDateMap = new Map<string, number>()
      if (bmAssetData) {
        for (let i = 0; i < bmAssetData.dates.length; i++) {
          bmDateMap.set(bmAssetData.dates[i], bmAssetData.benchmarkCumReturns[i])
        }
      }

      for (let i = 0; i < uniqueDates.length; i++) {
        const d = uniqueDates[i]
        const cur = dateMap.get(d) || { 총손익: prevProfit, 평가금액: prevEval }

        if (i === 0) {
          prevProfit = cur.총손익
          prevEval = cur.평가금액
          series.push({ 기준일: d, MyPF: 0, BM: 0, DD: 0 })
          continue
        }

        const prevDate = uniqueDates[i - 1]
        const isNewYear = d.substring(0, 4) !== prevDate.substring(0, 4)
        const dailyProfit = isNewYear ? cur.총손익 : cur.총손익 - prevProfit
        const dailyReturn = prevEval > 0 ? (dailyProfit / prevEval) * 100 : 0
        cumReturn = (1 + cumReturn) * (1 + dailyReturn / 100) - 1
        const cumPercent = Number((cumReturn * 100).toFixed(2))

        if (cumPercent > maxCum) maxCum = cumPercent
        const dd = maxCum > 0 ? Number((((cumPercent - maxCum) / (100 + maxCum)) * 100).toFixed(2)) : cumPercent < 0 ? cumPercent : 0

        // BM 누적수익률 
        const bmCumFloat = bmDateMap.get(d) || (series.length > 0 ? series[series.length - 1].BM / 100 : 0)
        const bmCum = Number((bmCumFloat * 100).toFixed(2))

        series.push({
          기준일: d,
          MyPF: cumPercent,
          BM: bmCum,
          DD: dd,
        })

        prevProfit = cur.총손익
        prevEval = cur.평가금액
      }

      return series
    }

    const performance = {
      선진국: calcMyPfAssetSeries('선진국', (r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && (!r.세부자산군2 || r.세부자산군2 === '')),
      국내: calcMyPfAssetSeries('국내', (r) => r.자산군 === '주식' && ['국내', '신흥국'].includes(r.세부자산군) && (!r.세부자산군2 || r.세부자산군2 === '')),
      실물자산: calcMyPfAssetSeries('실물자산', (r) => r.자산군 === '대체자산' && r.세부자산군 === '실물자산' && (!r.세부자산군2 || r.세부자산군2 === '')),
      인컴자산: calcMyPfAssetSeries('인컴자산', (r) => r.자산군 === '대체자산' && r.세부자산군 === '인컴자산' && (!r.세부자산군2 || r.세부자산군2 === '')),
      채권: calcMyPfAssetSeries('채권', (r) => r.자산군 === '채권' && (!r.세부자산군 || r.세부자산군 === '') && (!r.세부자산군2 || r.세부자산군2 === '')),
    }

    return NextResponse.json({
      success: true,
      performance,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Investment analytics error'
    console.error('[API /api/portfolio/analytics/investment] Error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
