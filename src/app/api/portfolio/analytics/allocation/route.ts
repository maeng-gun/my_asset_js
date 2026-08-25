import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)
    const baseMonth = searchParams.get('baseMonth') || '2024-05'

    // allo_table 조회
    const { data: alloRows } = await fetchAll(supabase, 'allo_table', '행번호')

    const saaRow = (alloRows || []).find((r) => r.구분 === 'SAA') || {
      국내주식: 0.1,
      해외주식: 0.35,
      만기보유채권: 0.15,
      시장형채권: 0.15,
      실물자산: 0.15,
      인컴자산: 0.1,
    }

    const taa1Row = (alloRows || []).find((r) => r.구분 === 'TAA1') || {
      국내주식: 0.15,
      해외주식: 0.4,
      만기보유채권: 0.1,
      시장형채권: 0.1,
      실물자산: 0.15,
      인컴자산: 0.1,
    }

    const taa2Row = (alloRows || []).find((r) => r.구분 === 'TAA2') || {
      국내주식: 0.05,
      해외주식: 0.45,
      만기보유채권: 0.1,
      시장형채권: 0.15,
      실물자산: 0.15,
      인컴자산: 0.1,
    }

    // 모의 월별 백테스팅 지표 생성 (수익률, 샤프, 변동성, MDD)
    const generateStrategyStats = (weights: any, name: string) => {
      const equitySum = (weights.국내주식 || 0) + (weights.해외주식 || 0)
      const expectedReturn = Number((equitySum * 14.5 + (weights.실물자산 || 0) * 12.0 + (weights.만기보유채권 || 0) * 4.2).toFixed(2))
      const vol = Number((equitySum * 12.0 + (weights.실물자산 || 0) * 8.5).toFixed(2))
      const sharpe = vol > 0 ? Number(((expectedReturn - 3.5) / vol).toFixed(2)) : 0
      const mdd = Number((-(vol * 0.85)).toFixed(2))

      return {
        전략명: name,
        가중치: weights,
        연환산수익률: expectedReturn,
        연환산변동성: vol,
        Sharpe: sharpe,
        MDD: mdd,
      }
    }

    const strategies = [
      generateStrategyStats(saaRow, 'SAA (전략적 자산배분)'),
      generateStrategyStats(taa1Row, 'TAA1 (전술적 자산배분 1)'),
      generateStrategyStats(taa2Row, 'TAA2 (전술적 자산배분 2)'),
    ]

    return NextResponse.json({
      success: true,
      baseMonth,
      strategies,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Allocation analytics error'
    console.error('[API /api/portfolio/analytics/allocation] Error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
