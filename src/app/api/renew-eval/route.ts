import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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

    // 2. assets 테이블 갱신
    const { data: assets } = await supabase.from('assets').select('*')
    if (assets) {
      for (const a of (assets as any[])) {
        const key = `${a.계좌}_${a.종목코드}`
        const newLastEval = evalMap.get(key) || 0
        await supabase
          .from('assets')
          .update({ 기초평가손익: newLastEval })
          .eq('행번호', a.행번호)
      }
    }

    // 3. pension 테이블 갱신
    const { data: pension } = await supabase.from('pension').select('*')
    if (pension) {
      for (const p of (pension as any[])) {
        const key = `${p.계좌}_${p.종목코드}`
        const newLastEval = evalMap.get(key) || 0
        await supabase
          .from('pension')
          .update({ 기초평가손익: newLastEval })
          .eq('행번호', p.행번호)
      }
    }

    return NextResponse.json({ success: true, message: `전년도(${lastYear}년) 기초평가손익이 성공적으로 갱신되었습니다.` })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown renew-eval error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
