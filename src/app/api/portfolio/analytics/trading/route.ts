import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'
import { calcTotalTrading } from '@/lib/engine/analytics'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)

    const startDate = searchParams.get('startDate') || '2024-01-01'
    const endDate = searchParams.get('endDate') || new Date().toISOString().substring(0, 10)
    // We fetch everything here.

    const [
      { data: assetsMaster },
      { data: pensionMaster },
      { data: assetsDaily },
      { data: pensionDaily },
    ] = await Promise.all([
      fetchAll(supabase, 'assets'),
      fetchAll(supabase, 'pension'),
      fetchAll(supabase, 'assets_daily'),
      fetchAll(supabase, 'pension_daily'),
    ])

    let totalTrades = calcTotalTrading(
      assetsMaster || [],
      pensionMaster || [],
      assetsDaily || [],
      pensionDaily || [],
      startDate,
      endDate
    )
    
    // API should return the full set of raw trades without the "합계" row, so client can aggregate.
    // Note: calcTotalTrading adds "합계" row, so we filter it out to prevent double counting.
    totalTrades = totalTrades.filter((t: any) => t['상품명'] !== '합계')

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      totalTrades,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Total trading analytics error'
    console.error('[API /api/portfolio/analytics/trading] Error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
