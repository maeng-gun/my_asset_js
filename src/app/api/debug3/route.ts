import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, 'assets_daily', '행번호')
  return NextResponse.json({
    count: data?.length,
    lastId: data && data.length > 0 ? data[data.length - 1].행번호 : null,
  })
}
