import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'

import { runAllocationBacktest } from '@/lib/engine/backtest'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)
    const baseMonth = searchParams.get('baseMonth') || '2024-05'

    // allo_table 조회
    const { data: alloRows } = await fetchAll(supabase, 'allo_table', '행번호')

    // 백테스트 엔진 실행
    const strategies = await runAllocationBacktest(alloRows || [])

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
