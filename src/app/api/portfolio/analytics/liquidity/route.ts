import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'
import { format, subYears } from 'date-fns'
import {
  calcEvalTrendData,
  calcMaturityAnalysis,
  calcLiquidityAnalysis,
} from '@/lib/engine/analytics'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const oneYearAgo = format(subYears(new Date(), 1), 'yyyy-MM-dd')

    // 1. 필요한 DB 데이터 조회
    const [
      { data: returnRows },
      { data: inflowRows },
      { data: summaryRow },
      { data: assetsMaster },
      { data: pensionMaster },
    ] = await Promise.all([
      supabase
        .from('return')
        .select('기준일, 자산군, 평가금액')
        .eq('자산군', '<합계>')
        .gte('기준일', oneYearAgo)
        .order('기준일', { ascending: true }),
      fetchAll(supabase, 'inflow', '거래일자'),
      supabase.from('latest_portfolio_summary').select('*').eq('id', 'latest').single(),
      fetchAll(supabase, 'assets'),
      fetchAll(supabase, 'pension'),
    ])

    const tComm2 = (summaryRow?.t_comm2 || []) as unknown as Parameters<typeof calcEvalTrendData>[2]
    const today = new Date()

    // 2. 만기도래 분석 데이터 계산
    const maturity = calcMaturityAnalysis(
      tComm2,
      [],
      assetsMaster || [],
      pensionMaster || []
    )

    const returnList = ((returnRows || []) as unknown) as Array<{ 기준일: string; 자산군: string; 평가금액: number }>

    // 3. 5개 추세선 차트 데이터 계산 (만기 반영)
    const evalTrend = calcEvalTrendData(returnList, inflowRows || [], tComm2, today, maturity)

    // 4. 총자산 및 가용자금 시계열 투사 데이터 계산
    const liquidityAnalysis = calcLiquidityAnalysis(
      tComm2,
      inflowRows || [],
      maturity,
      today
    )

    return NextResponse.json({
      success: true,
      evalTrend,
      maturity,
      liquidityAnalysis,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Liquidity analytics error'
    console.error('[API /api/portfolio/analytics/liquidity] Error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
