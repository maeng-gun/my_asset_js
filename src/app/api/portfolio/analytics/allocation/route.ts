import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TABLES } from '@/lib/supabase/tables'
import { fetchAll } from '@/lib/supabase/utils'
import { AlloTableLikeRow, runAllocationBacktest } from '@/lib/engine/backtest'
import { AllocationPolicyRow } from '@/lib/engine/alm-tpa-types'

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(req.url)
    const baseMonth = searchParams.get('baseMonth') || '2024-05'

    const [{ data: alloRows }, { data: policyRows }] = await Promise.all([
      fetchAll(supabase, TABLES.allo_table, '행번호'),
      supabase
        .from(TABLES.allocation_policies)
        .select('*')
        .eq('is_current', true),
    ])

    const strategies = await runAllocationBacktest(
      (alloRows || []) as AlloTableLikeRow[],
      (policyRows || []) as AllocationPolicyRow[]
    )

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
