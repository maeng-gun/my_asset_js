'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAll } from '@/lib/supabase/utils'

export async function getTickers(type: '투자자산' | '연금자산') {
  const supabase = createAdminClient()
  const table = type === '투자자산' ? 'assets' : 'pension'
  
  const { data, error } = await fetchAll(supabase, table, '행번호')
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
  const dailyTable = type === '투자자산' ? 'assets_daily' : 'pension_daily'
  const masterTable = type === '투자자산' ? 'assets' : 'pension'
  
  const { data: masterData } = await supabase.from(masterTable).select('*').eq('계좌', account)
  
  const { data: dailyData, error } = await supabase.from(dailyTable).select('*').eq('계좌', account)
  if (error) throw new Error(`[getTradeHistory] ${error.message}`)
  
  // Calculate in JS
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
    return { ...d, '종목명': meta?.name || d['종목코드'], '통화': meta?.cur || '원화' }
  })
  
  if (currency && currency !== '전체') {
    filtered = filtered.filter((d) => d['통화'] === currency)
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
  const { data, error } = await fetchAll(supabase, 'categories')
  
  if (error) throw new Error(`[getCategories] ${error.message}`)
  return data || []
}

export async function addTrade(type: '투자자산' | '연금자산', record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const dailyTable = type === '투자자산' ? 'assets_daily' : 'pension_daily'
  
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
  
  return true
}

export async function deleteTrade(type: '투자자산' | '연금자산', id: number) {
  const supabase = createAdminClient()
  const dailyTable = type === '투자자산' ? 'assets_daily' : 'pension_daily'
  
  const { error } = await supabase.from(dailyTable).delete().eq('행번호', id)
  if (error) throw new Error(`[deleteTrade] ${error.message}`)
  
  return true
}

export async function getLatestPortfolioSummary() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('latest_portfolio_summary')
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
      .from('return')
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
    let query = supabase.from('return').select('*')
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
  const { data, error } = await fetchAll(supabase, 'inflow', '거래일자')

  if (error) throw new Error(`[getInflowList] ${error.message}`)
  return data || []
}

export async function addInflowRecord(record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const { data: maxRow } = await supabase
    .from('inflow')
    .select('행번호')
    .order('행번호', { ascending: false })
    .limit(1)
    .single()
    
  const nextNum = ((maxRow as { 행번호?: number } | null)?.행번호 || 0) + 1
  const newRecord = { ...record, 행번호: nextNum }

  const { error } = await supabase.from('inflow').insert(newRecord)
  if (error) throw new Error(`[addInflowRecord] ${error.message}`)
  return true
}

export async function updateInflowRecord(id: number, record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('inflow')
    .update(record)
    .eq('행번호', id)

  if (error) throw new Error(`[updateInflowRecord] ${error.message}`)
  return true
}

export async function deleteInflowRecord(id: number) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('inflow')
    .delete()
    .eq('행번호', id)

  if (error) throw new Error(`[deleteInflowRecord] ${error.message}`)
  return true
}

export async function getAlloTableRows() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, 'allo_table', '행번호')

  if (error) throw new Error(`[getAlloTableRows] ${error.message}`)
  return data || []
}

export async function addTicker(type: '투자자산' | '연금자산', record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const table = type === '투자자산' ? 'assets' : 'pension'
  
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
  
  return true
}

export async function updateTicker(type: '투자자산' | '연금자산', id: number, record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const table = type === '투자자산' ? 'assets' : 'pension'
  
  const { error } = await supabase.from(table).update(record).eq('행번호', id)
  if (error) throw new Error(`[updateTicker] ${error.message}`)
  
  return true
}

export async function deleteTicker(type: '투자자산' | '연금자산', id: number) {
  const supabase = createAdminClient()
  const table = type === '투자자산' ? 'assets' : 'pension'
  
  const { error } = await supabase.from(table).delete().eq('행번호', id)
  if (error) throw new Error(`[deleteTicker] ${error.message}`)
  
  return true
}

export async function addCategory(key: string, value: string) {
  const supabase = createAdminClient()
  await supabase.from('categories').delete().eq('key', key).eq('value', value)
  const { error } = await supabase.from('categories').insert({ key, value })
  if (error) throw new Error(`[addCategory] ${error.message}`)
  return true
}

export async function deleteCategory(key: string, value: string) {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('key', key)
    .eq('value', value)
  if (error) throw new Error(`[deleteCategory] ${error.message}`)
  return true
}

export async function updateTrade(type: '투자자산' | '연금자산', id: number, record: Record<string, unknown>) {
  const supabase = createAdminClient()
  const dailyTable = type === '투자자산' ? 'assets_daily' : 'pension_daily'
  const { error } = await supabase
    .from(dailyTable)
    .update(record)
    .eq('행번호', id)
    
  if (error) throw new Error(`[updateTrade] ${error.message}`)
}
