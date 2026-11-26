'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { TABLES } from '@/lib/supabase/tables'
import { fetchAll } from '@/lib/supabase/utils'
import { fastRecalculatePortfolio } from '@/lib/engine/portfolio-runner'
import { convertToKRW } from '@/lib/engine/bookkeeping'
import {
  AllocationPolicyRow,
  AlmCashflowScheduleRow,
  AlmConfigRow,
  AssetStrategyTagRow,
  CorridorRule,
  LtcmaModelInputs,
  TaaScorecard4Axis,
  Weights9,
  aggregate9ToAllo6,
  computeEquityEqBeta,
} from '@/lib/engine/alm-tpa-types'

export async function getTickers(type?: '투자자산' | '연금자산') {
  const supabase = createAdminClient()
  // 통합 체계: 모든 종목 마스터는 TABLES.assets 에 저장됨
  const { data, error } = await fetchAll(supabase, TABLES.assets, '행번호')
  if (error) throw new Error(`[getTickers] ${error.message}`)
  
  return data || []
}

export async function getAllTickers() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, 'tickers', '티커')
  if (error) throw new Error(`[getAllTickers] ${error.message}`)
  
  return data || []
}

interface TradeHistoryItem {
  행번호?: number
  계좌: string
  통화: string
  거래일자: string
  종목명?: string
  종목코드: string
  환율?: number | null
  매입수량?: number
  매입액?: number
  현금지출?: number
  매입비용?: number
  매도수량?: number
  매도원금?: number
  매도액?: number
  매매수익?: number
  이자배당액?: number
  현금수입?: number
  매도비용?: number
  순수익?: number
  입출금?: number
  잔액?: number
  [key: string]: unknown
}

export async function getTradeHistory(type: '투자자산' | '연금자산', account: string, currency: string, limitCount: number = 30) {
  const supabase = createAdminClient()
  // 통합 체계: 모든 거래내역은 TABLES.assets_daily, 마스터는 TABLES.assets
  const dailyTable = TABLES.assets_daily
  const masterTable = TABLES.assets
  
  const { data: masterData } = await supabase.from(masterTable).select('*').eq('계좌', account)
  
  const { data: dailyData, error } = await supabase.from(dailyTable).select('*').eq('계좌', account)
  if (error) throw new Error(`[getTradeHistory] ${error.message}`)
  
  const rawList = (dailyData || []) as TradeHistoryItem[]
  
  // Join with master to get currency and itemName
  const masterMap = new Map<string, { name: string; cur: string }>()
  if (masterData) {
    for (const m of masterData) {
      masterMap.set(m['계좌'] + '_' + m['종목코드'], { name: m['종목명'], cur: m['통화'] })
    }
  }
  
  let filtered = rawList.map((d) => {
    const meta = masterMap.get(d['계좌'] + '_' + d['종목코드'])
    const cur = meta?.cur || d['통화'] || '원화'
    return {
      ...d,
      '종목명': meta?.name || d['종목코드'],
      '통화': cur,
      '환율': d['환율'] || (cur === '원화' ? 1 : null),
    }
  })
  
  if (currency && currency !== '전체') {
    const hasCur = filtered.some((d) => d['통화'] === currency)
    if (hasCur) {
      filtered = filtered.filter((d) => d['통화'] === currency)
    } else {
      const hasWon = filtered.some((d) => d['통화'] === '원화')
      if (hasWon) {
        filtered = filtered.filter((d) => d['통화'] === '원화')
      }
    }
  }
  
  // Sort ascending by date and row number to calculate cumsum
  filtered.sort((a, b) => {
    if (a['거래일자'] !== b['거래일자']) {
      return a['거래일자'] > b['거래일자'] ? 1 : -1
    }
    return (a['행번호'] || 0) - (b['행번호'] || 0)
  })
  
  let currentBalance = 0
  const computed = filtered.map((d) => {
    const buyPrincipal = (d['매입액'] as number) || 0
    const cashOut = (d['현금지출'] as number) || 0
    const buyCost = cashOut - buyPrincipal
    
    const sellPrincipal = (d['매도원금'] as number) || 0
    const sellAmt = (d['매도액'] as number) || 0
    const tradeProfit = sellAmt - sellPrincipal
    
    const dividend = (d['이자배당액'] as number) || 0
    const cashIn = (d['현금수입'] as number) || 0
    const sellCost = sellAmt + dividend - cashIn
    
    const netProfit = tradeProfit + dividend - sellCost - buyCost
    const inOut = (d['입출금'] as number) || 0
    const netCashIn = inOut + cashIn - cashOut
    
    currentBalance += netCashIn
    
    return {
      행번호: d['행번호'],
      계좌: d['계좌'],
      통화: d['통화'],
      환율: d['환율'],
      거래일자: d['거래일자'],
      종목명: d['종목명'],
      종목코드: d['종목코드'],
      매입수량: d['매입수량'],
      매입액: buyPrincipal,
      현금지출: cashOut,
      매입비용: buyCost,
      매도수량: d['매도수량'],
      매도원금: sellPrincipal,
      매도액: sellAmt,
      매매수익: tradeProfit,
      이자배당액: dividend,
      현금수입: cashIn,
      매도비용: sellCost,
      순수익: netProfit,
      입출금: inOut,
      잔액: currentBalance
    }
  })
  
  // Sort descending and limit
  computed.sort((a, b) => {
    if (a['거래일자'] !== b['거래일자']) {
      return a['거래일자'] < b['거래일자'] ? 1 : -1
    }
    return (b['행번호'] || 0) - (a['행번호'] || 0)
  })
  
  return computed.slice(0, limitCount)
}

export async function getCategories() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, TABLES.categories)
  
  if (error) throw new Error(`[getCategories] ${error.message}`)
  return data || []
}

export async function getGroups() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, TABLES.groups)

  if (error) throw new Error(`[getGroups] ${error.message}`)
  return (data || []) as Array<{ 자산군: string; 세부자산군: string; 세부자산군2: string }>
}

export async function addTrade(
  type: '투자자산' | '연금자산',
  record: Record<string, unknown>,
  options?: { autoLinkWonCash?: boolean }
) {
  const supabase = createAdminClient()
  const dailyTable = TABLES.assets_daily
  
  const { data: maxRow } = await supabase
    .from(dailyTable)
    .select('행번호')
    .order('행번호', { ascending: false })
    .limit(1)
    .single()

  const nextNum = ((maxRow as { 행번호?: number } | null)?.행번호 || 0) + 1
  const newRecord = { ...record, 행번호: nextNum }

  const { error } = await supabase.from(dailyTable).insert(newRecord)
  if (error) throw new Error(`[addTrade] ${error.message}`)

  // 외화예수금 환전 자동 연동 옵션 처리
  if (options?.autoLinkWonCash && record.입출금 && record.환율 && record.통화 !== '원화') {
    const inOutVal = Number(record.입출금)
    const rateVal = Number(record.환율)
    const cur = String(record.통화)
    const acct = String(record.계좌)
    
    // 원화 환산 상계 금액: 외화 입금(+inOut) 시 원화 차감(-wonAmt), 외화 출금(-inOut) 시 원화 증가(+wonAmt)
    const wonAmt = convertToKRW(inOutVal, cur, rateVal)
    const offsettingInOut = -wonAmt

    // 계좌별 원화예수금 종목코드 매핑
    let wonCashTicker = 'CASH_KOIN1'
    if (acct === '불리오') wonCashTicker = 'BOOL_WON'

    const linkedRecord = {
      행번호: nextNum + 1,
      계좌: acct,
      종목코드: wonCashTicker,
      거래일자: record.거래일자,
      매입수량: 0,
      매입액: 0,
      현금지출: 0,
      매도수량: 0,
      매도원금: 0,
      매도액: 0,
      이자배당액: 0,
      현금수입: 0,
      입출금: offsettingInOut,
      환율: 1,
    }

    await supabase.from(dailyTable).insert(linkedRecord)
  }
  
  await fastRecalculatePortfolio()
  return true
}

export async function deleteTrade(type: '투자자산' | '연금자산', id: number) {
  const supabase = createAdminClient()
  const dailyTable = TABLES.assets_daily
  
  const { error } = await supabase.from(dailyTable).delete().eq('행번호', id)
  if (error) throw new Error(`[deleteTrade] ${error.message}`)
  
  await fastRecalculatePortfolio()
  return true
}

export async function updateTrade(type: '투자자산' | '연금자산', id: number, record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const dailyTable = TABLES.assets_daily
  const { error } = await supabase
    .from(dailyTable)
    .update(record)
    .eq('행번호', id)
    
  if (error) throw new Error(`[updateTrade] ${error.message}`)
  
  await fastRecalculatePortfolio()
  return true
}

export async function getLatestPortfolioSummary() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from(TABLES.latest_portfolio_summary)
    .select('*')
    .eq('id', 'latest')
    .single()

  if (error) throw new Error(`[getLatestPortfolioSummary] ${error.message}`)
  return data
}

export interface SummaryReturnTrendRow {
  기준일: string
  자산군: string
  평가금액: number
  총손익: number
}

export interface ReturnDataRow {
  기준일: string
  자산군: string
  세부자산군: string
  세부자산군2: string
  평가금액: number
  총손익: number
  총수익률: number
}

export async function getSummaryReturnTrend(startDate?: string): Promise<SummaryReturnTrendRow[]> {
  const supabase = createAdminClient()
  const result: SummaryReturnTrendRow[] = []
  const limit = 1000
  let start = 0
  while (true) {
    let query = supabase
      .from(TABLES.return)
      .select('기준일, 자산군, 평가금액, 총손익')
      .eq('자산군', '<합계>')

    if (startDate) {
      query = query.gte('기준일', startDate)
    }
    query = query.order('기준일', { ascending: true })

    const { data, error } = (await query.range(start, start + limit - 1)) as unknown as {
      data: SummaryReturnTrendRow[] | null
      error: Error | null
    }
    if (error) throw new Error(`[getSummaryReturnTrend] ${error.message}`)
    if (!data || data.length === 0) break
    result.push(...data)
    if (data.length < limit) break
    start += limit
  }
  return result
}

export async function getReturnData(params?: { startDate?: string; endDate?: string }): Promise<ReturnDataRow[]> {
  const supabase = createAdminClient()
  const result: ReturnDataRow[] = []
  const limit = 1000
  let start = 0
  while (true) {
    let query = supabase.from(TABLES.return).select('*')
    if (params?.startDate) {
      query = query.gte('기준일', params.startDate)
    }
    if (params?.endDate) {
      query = query.lte('기준일', params.endDate)
    }
    query = query.order('기준일', { ascending: true })

    const { data, error } = (await query.range(start, start + limit - 1)) as unknown as {
      data: Array<{
        기준일: string
        자산군: string
        세부자산군?: string
        세부자산군2?: string
        평가금액?: number
        총손익?: number
        총수익률?: number
      }> | null
      error: Error | null
    }
    if (error) throw new Error(`[getReturnData] ${error.message}`)
    if (!data || data.length === 0) break
    for (const r of data) {
      result.push({
        기준일: r.기준일,
        자산군: r.자산군,
        세부자산군: r.세부자산군 || '',
        세부자산군2: r.세부자산군2 || '',
        평가금액: r.평가금액 || 0,
        총손익: r.총손익 || 0,
        총수익률: r.총수익률 || 0,
      })
    }
    if (data.length < limit) break
    start += limit
  }
  return result
}

export async function getInflowList() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, TABLES.inflow, '거래일자')

  if (error) throw new Error(`[getInflowList] ${error.message}`)
  return data || []
}

export async function addInflowRecord(record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const { data: maxRow } = await supabase
    .from(TABLES.inflow)
    .select('행번호')
    .order('행번호', { ascending: false })
    .limit(1)
    .single()
    
  const nextNum = ((maxRow as { 행번호?: number } | null)?.행번호 || 0) + 1
  const newRecord = { ...record, 행번호: nextNum }

  const { error } = await supabase.from(TABLES.inflow).insert(newRecord)
  if (error) throw new Error(`[addInflowRecord] ${error.message}`)
  return true
}

export async function updateInflowRecord(id: number, record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from(TABLES.inflow)
    .update(record)
    .eq('행번호', id)

  if (error) throw new Error(`[updateInflowRecord] ${error.message}`)
  return true
}

export async function deleteInflowRecord(id: number) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from(TABLES.inflow)
    .delete()
    .eq('행번호', id)

  if (error) throw new Error(`[deleteInflowRecord] ${error.message}`)
  return true
}

export async function getAlloTableRows() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, TABLES.allo_table, '행번호')

  if (error) throw new Error(`[getAlloTableRows] ${error.message}`)
  return data || []
}

export interface AlloStrategyInput {
  국내주식: number
  해외주식: number
  만기보유채권: number
  시장형채권: number
  실물자산: number
  인컴자산: number
}

export async function saveAlloStrategy(
  strategy: 'SAA' | 'TAA',
  ratios: AlloStrategyInput,
  dateStr?: string
) {
  const supabase = createAdminClient()
  const todayStr = dateStr || new Date().toISOString().slice(0, 10)

  const sum =
    (ratios.국내주식 || 0) +
    (ratios.해외주식 || 0) +
    (ratios.만기보유채권 || 0) +
    (ratios.시장형채권 || 0) +
    (ratios.실물자산 || 0) +
    (ratios.인컴자산 || 0)

  if (sum > 100.01) {
    throw new Error(`자산군 비중 합계(${sum.toFixed(2)}%)가 100%를 초과할 수 없습니다.`)
  }

  const { data: existingRows } = (await supabase
    .from(TABLES.allo_table)
    .select('행번호')
    .eq('배분일자', todayStr)
    .eq('구분', strategy)
    .limit(1)) as { data: Array<{ 행번호: number }> | null }

  if (existingRows && existingRows.length > 0) {
    const targetRow = existingRows[0]
    const { error: updateErr } = await supabase
      .from(TABLES.allo_table)
      .update({
        국내주식: Number(ratios.국내주식.toFixed(2)),
        해외주식: Number(ratios.해외주식.toFixed(2)),
        만기보유채권: Number(ratios.만기보유채권.toFixed(2)),
        시장형채권: Number(ratios.시장형채권.toFixed(2)),
        실물자산: Number(ratios.실물자산.toFixed(2)),
        인컴자산: Number(ratios.인컴자산.toFixed(2)),
      })
      .eq('행번호', targetRow.행번호)

    if (updateErr) throw new Error(`[saveAlloStrategy:update] ${updateErr.message}`)
  } else {
    const { data: maxRow } = (await supabase
      .from(TABLES.allo_table)
      .select('행번호')
      .order('행번호', { ascending: false })
      .limit(1)
      .single()) as { data: { 행번호?: number } | null }

    const nextNum = ((maxRow as { 행번호?: number } | null)?.행번호 || 0) + 1
    const newRecord = {
      행번호: nextNum,
      배분일자: todayStr,
      구분: strategy,
      국내주식: Number(ratios.국내주식.toFixed(2)),
      해외주식: Number(ratios.해외주식.toFixed(2)),
      만기보유채권: Number(ratios.만기보유채권.toFixed(2)),
      시장형채권: Number(ratios.시장형채권.toFixed(2)),
      실물자산: Number(ratios.실물자산.toFixed(2)),
      인컴자산: Number(ratios.인컴자산.toFixed(2)),
    }

    const { error: insertErr } = await supabase.from(TABLES.allo_table).insert(newRecord)
    if (insertErr) throw new Error(`[saveAlloStrategy:insert] ${insertErr.message}`)
  }

  return true
}

export async function saveBothAlloStrategies(
  saaRatios: AlloStrategyInput,
  taaRatios: AlloStrategyInput,
  dateStr?: string
) {
  await saveAlloStrategy('SAA', saaRatios, dateStr)
  await saveAlloStrategy('TAA', taaRatios, dateStr)
  return true
}

export async function addTicker(type: '투자자산' | '연금자산', record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const table = TABLES.assets
  
  const { data: maxRow } = await supabase
    .from(table)
    .select('행번호')
    .order('행번호', { ascending: false })
    .limit(1)
    .single()

  const nextNum = ((maxRow as { 행번호?: number } | null)?.행번호 || 0) + 1
  const newRecord = { ...record, 행번호: nextNum }

  const { error } = await supabase.from(table).insert(newRecord)
  if (error) throw new Error(`[addTicker] ${error.message}`)
  
  await fastRecalculatePortfolio()
  return true
}

export async function updateTicker(type: '투자자산' | '연금자산', id: number, record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const table = TABLES.assets
  
  const { error } = await supabase.from(table).update(record).eq('행번호', id)
  if (error) throw new Error(`[updateTicker] ${error.message}`)
  
  await fastRecalculatePortfolio()
  return true
}

export async function deleteTicker(type: '투자자산' | '연금자산', id: number) {
  const supabase = createAdminClient()
  const table = TABLES.assets
  
  const { error } = await supabase.from(table).delete().eq('행번호', id)
  if (error) throw new Error(`[deleteTicker] ${error.message}`)
  
  await fastRecalculatePortfolio()
  return true
}

export async function addCategory(key: string, value: string) {
  const supabase = createAdminClient()
  await supabase.from(TABLES.categories).delete().eq('key', key).eq('value', value)
  const { error } = await supabase.from(TABLES.categories).insert({ key, value })
  if (error) throw new Error(`[addCategory] ${error.message}`)
  return true
}

export async function deleteCategory(key: string, value: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from(TABLES.categories)
    .delete()
    .eq('key', key)
    .eq('value', value)
  if (error) throw new Error(`[deleteCategory] ${error.message}`)
  return true
}

// ==============================================================================
// ALM · TPA · SAA · TAA Integrated Asset Allocation Actions
// ==============================================================================

export async function getAlmConfig(): Promise<AlmConfigRow | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from(TABLES.alm_config)
    .select('*')
    .eq('id', 'default')
    .maybeSingle()

  if (error) throw new Error(`[getAlmConfig] ${error.message}`)
  return (data as AlmConfigRow | null) ?? null
}

export async function saveAlmConfig(payload: Partial<AlmConfigRow>) {
  const supabase = createAdminClient()
  const record = {
    ...payload,
    id: payload.id || 'default',
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from(TABLES.alm_config)
    .upsert(record, { onConflict: 'id' })
  if (error) throw new Error(`[saveAlmConfig] ${error.message}`)
  return true
}

export async function getAlmCashflowSchedules(): Promise<AlmCashflowScheduleRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from(TABLES.alm_cashflow_schedules)
    .select('*')
    .order('id', { ascending: true })

  if (error) throw new Error(`[getAlmCashflowSchedules] ${error.message}`)
  return (data || []) as AlmCashflowScheduleRow[]
}

export async function getAllocationPolicies(): Promise<AllocationPolicyRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from(TABLES.allocation_policies)
    .select('*')
    .order('effective_date', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw new Error(`[getAllocationPolicies] ${error.message}`)
  return (data || []) as AllocationPolicyRow[]
}

export interface SaveAllocationPoliciesInput {
  effectiveDate?: string
  refWeights?: Weights9
  saaWeights: Weights9
  taaWeights: Weights9
  corridorRule?: CorridorRule
  ltcmaInputs?: LtcmaModelInputs | null
  taaScorecard?: TaaScorecard4Axis | null
  rationaleRef?: string
  rationaleSaa?: string
  rationaleTaa?: string
}

export async function saveAllocationPolicies(input: SaveAllocationPoliciesInput) {
  const supabase = createAdminClient()
  const effectiveDate = input.effectiveDate || new Date().toISOString().slice(0, 10)
  const corridorRule: CorridorRule = input.corridorRule || {
    max_abs_pct: 5.0,
    min_abs_pct: 1.5,
    relative_ratio: 0.25,
  }
  const nowIso = new Date().toISOString()

  const policiesToSave: Array<{
    policy_type: 'REF' | 'SAA' | 'TAA'
    weights_9: Weights9
    ltcma_inputs: LtcmaModelInputs | null
    taa_scorecard: TaaScorecard4Axis | null
    rationale: string | null
  }> = []

  if (input.refWeights) {
    policiesToSave.push({
      policy_type: 'REF',
      weights_9: input.refWeights,
      ltcma_inputs: null,
      taa_scorecard: null,
      rationale:
        input.rationaleRef ||
        '1층 TPA 레퍼런스: 글로벌 올컨트리 주식(환노출 원화환산) + 국내 종합채권',
    })
  }

  policiesToSave.push({
    policy_type: 'SAA',
    weights_9: input.saaWeights,
    ltcma_inputs: input.ltcmaInputs ?? null,
    taa_scorecard: null,
    rationale: input.rationaleSaa || '2층-A 9대 자산군 장기 SAA 목표비중',
  })

  policiesToSave.push({
    policy_type: 'TAA',
    weights_9: input.taaWeights,
    ltcma_inputs: null,
    taa_scorecard: input.taaScorecard ?? null,
    rationale: input.rationaleTaa || '2층-B 4축 스코어카드 기반 TAA 목표비중',
  })

  for (const item of policiesToSave) {
    const { error: deactivateErr } = await supabase
      .from(TABLES.allocation_policies)
      .update({ is_current: false, updated_at: nowIso })
      .eq('policy_type', item.policy_type)
      .eq('is_current', true)

    if (deactivateErr) {
      throw new Error(`[saveAllocationPolicies:deactivate:${item.policy_type}] ${deactivateErr.message}`)
    }

    const { error: insertErr } = await supabase.from(TABLES.allocation_policies).insert({
      effective_date: effectiveDate,
      policy_type: item.policy_type,
      weights_9: item.weights_9,
      corridor_rule: corridorRule,
      ltcma_inputs: item.ltcma_inputs,
      taa_scorecard: item.taa_scorecard,
      equity_eq_beta_pct: computeEquityEqBeta(item.weights_9),
      rationale: item.rationale,
      is_current: true,
      created_at: nowIso,
      updated_at: nowIso,
    })

    if (insertErr) {
      throw new Error(`[saveAllocationPolicies:insert:${item.policy_type}] ${insertErr.message}`)
    }
  }

  // Backward-compatible mirroring to 6-column legacy allo_table
  await saveBothAlloStrategies(
    aggregate9ToAllo6(input.saaWeights),
    aggregate9ToAllo6(input.taaWeights),
    effectiveDate
  )

  return true
}

export async function getAssetStrategyTags(): Promise<AssetStrategyTagRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from(TABLES.asset_strategy_tags)
    .select('*')
    .order('ticker_code', { ascending: true })

  if (error) throw new Error(`[getAssetStrategyTags] ${error.message}`)
  return (data || []) as AssetStrategyTagRow[]
}

export async function upsertAssetStrategyTag(tag: AssetStrategyTagRow) {
  const supabase = createAdminClient()
  const record = {
    ticker_code: tag.ticker_code.trim(),
    asset_name: tag.asset_name.trim(),
    strategy_role: tag.strategy_role,
    factor_cluster: tag.factor_cluster ? tag.factor_cluster.trim() : null,
    economic_currency: tag.economic_currency ? tag.economic_currency.trim() : null,
    is_pension_safe_override: Boolean(tag.is_pension_safe_override),
    equity_beta_override:
      tag.equity_beta_override !== null && tag.equity_beta_override !== undefined
        ? Number(tag.equity_beta_override)
        : null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from(TABLES.asset_strategy_tags)
    .upsert(record, { onConflict: 'ticker_code' })

  if (error) throw new Error(`[upsertAssetStrategyTag] ${error.message}`)
  return true
}

export async function deleteAssetStrategyTag(tickerCode: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from(TABLES.asset_strategy_tags)
    .delete()
    .eq('ticker_code', tickerCode)

  if (error) throw new Error(`[deleteAssetStrategyTag] ${error.message}`)
  return true
}

export async function addAlmCashflowSchedule(
  record: Omit<AlmCashflowScheduleRow, 'id' | 'created_at' | 'updated_at'>
) {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()
  const payload = {
    title: record.title.trim(),
    account: record.account,
    flow_type: record.flow_type,
    cadence: record.cadence,
    amount_krw: Math.round(Number(record.amount_krw) || 0),
    growth_rate_pct: Number(record.growth_rate_pct) || 0,
    start_date: record.start_date,
    end_date: record.end_date || null,
    is_active: record.is_active ?? true,
    note: record.note ? record.note.trim() : null,
    created_at: nowIso,
    updated_at: nowIso,
  }
  const { error } = await supabase.from(TABLES.alm_cashflow_schedules).insert(payload)
  if (error) throw new Error(`[addAlmCashflowSchedule] ${error.message}`)
  return true
}

export async function updateAlmCashflowSchedule(
  id: number,
  record: Partial<AlmCashflowScheduleRow>
) {
  const supabase = createAdminClient()
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  if (record.title !== undefined) payload.title = record.title.trim()
  if (record.account !== undefined) payload.account = record.account
  if (record.flow_type !== undefined) payload.flow_type = record.flow_type
  if (record.cadence !== undefined) payload.cadence = record.cadence
  if (record.amount_krw !== undefined) payload.amount_krw = Math.round(Number(record.amount_krw) || 0)
  if (record.growth_rate_pct !== undefined)
    payload.growth_rate_pct = Number(record.growth_rate_pct) || 0
  if (record.start_date !== undefined) payload.start_date = record.start_date
  if (record.end_date !== undefined) payload.end_date = record.end_date || null
  if (record.is_active !== undefined) payload.is_active = Boolean(record.is_active)
  if (record.note !== undefined) payload.note = record.note ? record.note.trim() : null

  const { error } = await supabase
    .from(TABLES.alm_cashflow_schedules)
    .update(payload)
    .eq('id', id)

  if (error) throw new Error(`[updateAlmCashflowSchedule] ${error.message}`)
  return true
}

export async function deleteAlmCashflowSchedule(id: number) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from(TABLES.alm_cashflow_schedules)
    .delete()
    .eq('id', id)

  if (error) throw new Error(`[deleteAlmCashflowSchedule] ${error.message}`)
  return true
}
