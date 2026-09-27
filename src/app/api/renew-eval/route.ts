import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'

export async function POST() {
  try {
    const supabase = createAdminClient()
    const lastYear = new Date().getFullYear() - 1

    // 1. eval_profit에서 전년도 데이터 조회
    const { data: evalData, error: evalErr } = await supabase
      .from('eval_profit')
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

    // 2. assets 테이블 갱신
    const { data: assets } = await fetchAll(supabase, 'assets')
    if (assets) {
      for (const a of (assets as any[])) {
        const key = `${a.계좌}_${a.종목코드}`
        const newLastEval = evalMap.get(key) || 0
        promises.push(updateRow('assets', a.행번호, newLastEval))
      }
    }

    // 3. pension 테이블 갱신
    const { data: pension } = await fetchAll(supabase, 'pension')
    if (pension) {
      for (const p of (pension as any[])) {
        const key = `${p.계좌}_${p.종목코드}`
        const newLastEval = evalMap.get(key) || 0
        promises.push(updateRow('pension', p.행번호, newLastEval))
      }
    }
    
    await Promise.allSettled(promises)

    return NextResponse.json({ success: true, message: `전년도(${lastYear}년) 기초평가손익이 성공적으로 갱신되었습니다.` })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown renew-eval error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
