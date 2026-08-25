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

export async function getTradeHistory(type: '투자자산' | '연금자산', account: string, currency: string, limitCount: number = 30) {
  const supabase = createAdminClient()
  const dailyTable = type === '투자자산' ? 'assets_daily' : 'pension_daily'
  
  let query = supabase
    .from(dailyTable)
    .select('*')
    .eq('계좌', account)
    
  if (currency && currency !== '전체') {
    // If you need currency filtering, you might need a join or if '통화' is in dailyTable. 
    // Usually dailyTable only has 종목코드, we'll just filter by account for now as per original code.
  }

  const { data, error } = await query
    .order('거래일자', { ascending: false })
    .order('행번호', { ascending: false })
    .limit(limitCount)

  if (error) throw new Error(`[getTradeHistory] ${error.message}`)
  return data || []
}

export async function getCategories() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, 'categories')
  
  if (error) throw new Error(`[getCategories] ${error.message}`)
  return data || []
}

export async function addTrade(type: '투자자산' | '연금자산', record: any) {
  const supabase = createAdminClient()
  const dailyTable = type === '투자자산' ? 'assets_daily' : 'pension_daily'
  
  const { data: maxRow } = await supabase
    .from(dailyTable)
    .select('*')
    .order('행번호', { ascending: false })
    .limit(1)
    .single()

  const nextNum = ((maxRow as any)?.행번호 || 0) + 1
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

export async function getReturnData() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, 'return', '기준일')

  if (error) throw new Error(`[getReturnData] ${error.message}`)
  return data || []
}

export async function getInflowList() {
  const supabase = createAdminClient()
  const { data, error } = await fetchAll(supabase, 'inflow', '거래일자')

  if (error) throw new Error(`[getInflowList] ${error.message}`)
  return data || []
}

export async function addInflowRecord(record: any) {
  const supabase = createAdminClient()
  const { data: maxRow } = await supabase
    .from('inflow')
    .select('행번호')
    .order('행번호', { ascending: false })
    .limit(1)
    .single()
    
  const nextNum = ((maxRow as any)?.행번호 || 0) + 1
  const newRecord = { ...record, 행번호: nextNum }

  const { error } = await supabase.from('inflow').insert(newRecord)
  if (error) throw new Error(`[addInflowRecord] ${error.message}`)
  return true
}

export async function updateInflowRecord(id: number, record: any) {
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

export async function addTicker(type: '투자자산' | '연금자산', record: any) {
  const supabase = createAdminClient()
  const table = type === '투자자산' ? 'assets' : 'pension'
  
  const { data: maxRow } = await supabase
    .from(table)
    .select('행번호')
    .order('행번호', { ascending: false })
    .limit(1)
    .single()

  const nextNum = ((maxRow as any)?.행번호 || 0) + 1
  const newRecord = { ...record, 행번호: nextNum }

  const { error } = await supabase.from(table).insert(newRecord)
  if (error) throw new Error(`[addTicker] ${error.message}`)
  
  return true
}

export async function updateTicker(type: '투자자산' | '연금자산', id: number, record: any) {
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
  const { error } = await supabase.from('categories').delete().eq('key', key).eq('value', value)
  if (error) throw new Error(`[deleteCategory] ${error.message}`)
  return true
}
