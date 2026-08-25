import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'
import {
  calcEvalTrendData,
  calcMaturityAnalysis,
  calcLiquidityAnalysis,
} from '@/lib/engine/analytics'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()

    // 1. 필요한 DB 데이터 조회
    const [
      { data: returnRows },
      { data: inflowRows },
      { data: summaryRow },
      { data: assetsMaster },
      { data: pensionMaster },
    ] = await Promise.all([
      fetchAll(supabase, 'return', '기준일'),
      fetchAll(supabase, 'inflow', '거래일자'),
      supabase.from('latest_portfolio_summary').select('*').eq('id', 'latest').single(),
      fetchAll(supabase, 'assets'),
      fetchAll(supabase, 'pension'),
    ])

    const tComm2 = (summaryRow?.t_comm2 || []) as any[]
    const today = new Date()

    // 2. 5개 추세선 차트 데이터 계산
    const evalTrend = calcEvalTrendData(returnRows || [], inflowRows || [], tComm2, today)

    // 3. 만기도래 분석 데이터 계산
    const maturity = calcMaturityAnalysis(
      tComm2,
      [],
      assetsMaster || [],
      pensionMaster || []
    )

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
