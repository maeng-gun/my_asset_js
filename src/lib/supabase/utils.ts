import { SupabaseClient } from '@supabase/supabase-js'

export async function fetchAll<T = any>(
  supabase: SupabaseClient,
  table: string,
  orderCol?: string
): Promise<{ data: T[] | null; error: any }> {
  const result: T[] = []
  const limit = 1000
  let start = 0
  while (true) {
    let query = supabase.from(table).select('*')
    if (orderCol) {
      query = query.order(orderCol, { ascending: true })
    }
    const { data, error } = await query.range(start, start + limit - 1)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    result.push(...data)
    if (data.length < limit) break
    start += limit
  }
  return { data: result, error: null }
}
