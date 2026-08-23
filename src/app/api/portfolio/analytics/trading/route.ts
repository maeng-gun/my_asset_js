import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcTotalTrading } from '@/lib/engine/analytics'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)

    const startDate = searchParams.get('startDate') || '2024-01-01'
    const endDate = searchParams.get('endDate') || new Date().toISOString().substring(0, 10)

    const [
      { data: assetsMaster },
      { data: pensionMaster },
      { data: assetsDaily },
      { data: pensionDaily },
    ] = await Promise.all([
      supabase.from('assets').select('*'),
      supabase.from('pension').select('*'),
      supabase.from('assets_daily').select('*'),
      supabase.from('pension_daily').select('*'),
    ])

    const totalTrades = calcTotalTrading(
      assetsMaster || [],
      pensionMaster || [],
      assetsDaily || [],
      pensionDaily || [],
      startDate,
      endDate
    )

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
