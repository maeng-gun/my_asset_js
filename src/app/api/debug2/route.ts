import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data: assetsDaily, error } = await fetchAll(supabase, 'assets_daily', '행번호')
    if (error) throw error
    
    const kospi = assetsDaily.filter(t => t.종목코드 === '305050')
    const totalCount = assetsDaily.length
    
    return NextResponse.json({
      totalCount,
      kospiCount: kospi.length,
      kospiDates: kospi.map(t => t.거래일자)
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
