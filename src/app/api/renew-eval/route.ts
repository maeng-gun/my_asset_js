import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TABLES } from '@/lib/supabase/tables'
import { fetchAll } from '@/lib/supabase/utils'

export async function POST() {
  try {
    const supabase = createAdminClient()
    const lastYear = new Date().getFullYear() - 1

    // 1. eval_profit에서 전년도 데이터 조회
    const { data: evalData, error: evalErr } = await supabase
      .from(TABLES.eval_profit)
      .select('*')
      .eq('연도', lastYear)

    if (evalErr) throw evalErr

    const evalMap = new Map<string, number>()
    for (const item of (evalData || []) as any[]) {
      evalMap.set(`${item.계좌}_${item.종목코드}`, item.평가손익)
    }

    const updateRow = async (table: string, id: number, value: number, retries = 2): Promise<void> => {
      const { error } = await supabase.from(table).update({ 기초평가손익: value }).eq('행번호', id)
      if (error) {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 1000))
          return updateRow(table, id, value, retries - 1)
        }
        throw error
      }
    }

    const promises = []

    // 2. 통합 assets 테이블 갱신
    const { data: assets } = await fetchAll(supabase, TABLES.assets)
    if (assets) {
      for (const a of (assets as any[])) {
        const key = `${a.계좌}_${a.종목코드}`
        const newLastEval = evalMap.get(key) || 0
        promises.push(updateRow(TABLES.assets, a.행번호, newLastEval))
      }
    }

    await Promise.all(promises)

    return NextResponse.json({ success: true, updatedCount: promises.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Renew eval error'
    console.error('[API /api/renew-eval] Error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
