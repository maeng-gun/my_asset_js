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
    const assetClass = searchParams.get('assetClass') || '전체'

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

    if (assetClass !== '전체') {
      totalTrades = totalTrades.filter((t: any) => t['자산군'] === assetClass)
    }

    return NextResponse.json({
      success: true,
      startDate,
      endDate,
      assetClass,
      totalTrades,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Total trading analytics error'
    console.error('[API /api/portfolio/analytics/trading] Error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
