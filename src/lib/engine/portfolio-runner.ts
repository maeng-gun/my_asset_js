import { createAdminClient } from '@/lib/supabase/admin'
import { KISService } from '@/lib/services/kis'
import { MarketDataService } from '@/lib/services/market-crawler'
import { getDailyTrading, getBalanceSheet } from './bookkeeping'
import {
  evaluateBalanceSheet,
  computeCommodityHoldings,
  computeAccountAllocation,
  computeAssetProfit,
  computeDetailedCommodityProfit,
} from './valuation'
import { computeTotalProfit, computeProfitVariation } from './analytics'
import { AssetMaster, DailyTradeRaw, LatestPortfolioSummary } from './types'
import { format, subDays, subMonths, subYears } from 'date-fns'

import { fetchAll } from '@/lib/supabase/utils'

export async function runPortfolioValuation(): Promise<{
  success: boolean
  today: string
  exchangeRates: { USD: number; JPY: number }
  summary: LatestPortfolioSummary
}> {
  const supabase = createAdminClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const currentYear = new Date().getFullYear()

  // 1. DB에서 마스터 데이터 및 일별 거래내역 로드
  const [
    { data: assetsRaw, error: assetsErr },
    { data: pensionRaw, error: pensionErr },
    { data: assetsDailyRaw, error: assetsDailyErr },
    { data: pensionDailyRaw, error: pensionDailyErr },
    { data: groupsRaw, error: groupsErr },
  ] = await Promise.all([
    fetchAll(supabase, 'assets', '행번호'),
    fetchAll(supabase, 'pension', '행번호'),
    fetchAll(supabase, 'assets_daily', '행번호'),
    fetchAll(supabase, 'pension_daily', '행번호'),
    fetchAll(supabase, 'groups'),
  ])

  // Fail-fast 방어 로직: DB 접근 실패 시 스냅샷 빈 데이터 덮어쓰기 방지
  if (assetsErr || pensionErr || assetsDailyErr || pensionDailyErr || groupsErr) {
    console.error('[PortfolioRunner] DB Fetch Error:', {
      assetsErr, pensionErr, assetsDailyErr, pensionDailyErr, groupsErr
    })
    return {
      success: false,
      today: todayStr,
      exchangeRates: { USD: 1400, JPY: 9.3 },
      summary: {} as LatestPortfolioSummary // 빈 객체 대신 null을 던지거나 적절히 처리할 수 있으나 타입에 맞춰 반환
    }
  }

  const assets = (assetsRaw || []) as AssetMaster[]
  const pension = (pensionRaw || []) as AssetMaster[]
  const assetsDaily = (assetsDailyRaw || []) as DailyTradeRaw[]
  const pensionDaily = (pensionDailyRaw || []) as DailyTradeRaw[]
  const groups = (groupsRaw || []) as Array<{ 자산군: string; 세부자산군: string; 세부자산군2: string }>

  if (assets.length === 0 && pension.length === 0) {
    console.warn('[PortfolioRunner] Assets and Pension data are entirely empty. Aborting to prevent overriding snapshot with zeroes.')
    return {
      success: false,
      today: todayStr,
      exchangeRates: { USD: 1400, JPY: 9.3 },
      summary: {} as LatestPortfolioSummary
    }
  }

  // 2. 일별 거래 집계 & 장부금액/평잔 계산 (오늘 날짜 잔액 레코드 필터)
  const dailyAssets = getDailyTrading(assets, assetsDaily)
  const bsAssets = getBalanceSheet('assets', dailyAssets, assets)

  const dailyPension = getDailyTrading(pension, pensionDaily)
  const bsPension = getBalanceSheet('pension', dailyPension, pension)

  // 오늘 날짜 잔액 레코드 필터
  const todayBsAssets = bsAssets.filter((r) => r.거래일자 === todayStr)
  const todayBsPension = bsPension.filter((r) => r.거래일자 === todayStr)

  // 3. 환율, 금 시세, KIS 시세 수집
  let exchangeRates = { USD: 1400, JPY: 9.3 }
  let goldPrice: { 종목코드: string; 종가: number } | null = null
  let kisBoolioService: KISService | null = null
  let ovsBalances: Array<{ 종목코드: string; 평가금액: number }> = []

  try {
    const [ex, gp, kb] = await Promise.all([
      MarketDataService.getExchangeRates().catch(() => ({ USD: 1400, JPY: 9.3 })),
      MarketDataService.getGoldPrice().catch(() => null),
      KISService.create('boolio').catch(() => null),
    ])
    if (ex) exchangeRates = ex
    if (gp) goldPrice = gp
    if (kb) {
      kisBoolioService = kb
      ovsBalances = await kisBoolioService.getOverseasBalance('USD').catch(() => [])
    }
  } catch (err) {
    console.warn('Market price fetching warning:', err)
  }

  // 4. 보유수량 > 0인 종목코드 추출 (금현물, 불리오 해외주식, 고정평가 대상 제외)
  const allMasters = [...assets, ...pension]
  const masterMap = new Map<string, AssetMaster>()
  for (const m of allMasters) {
    const key = `${m.계좌}_${m.종목코드}`
    const existing = masterMap.get(key)
    if (existing && (existing.평가금액 || 0) > 0 && (!m.평가금액 || m.평가금액 === 0)) {
      masterMap.set(key, { ...m, 평가금액: existing.평가금액 || 0 })
    } else {
      masterMap.set(key, m)
    }
  }

  const ovsTickerSet = new Set(ovsBalances.map((o) => o.종목코드))
  const goldTicker = goldPrice?.종목코드

  const activeHoldings = [...todayBsAssets, ...todayBsPension].filter((r) => {
    if (r.보유수량 <= 0) return false
    if (goldTicker && r.종목코드 === goldTicker) return false
    if (r.계좌 === '불리오' && ovsTickerSet.has(r.종목코드)) return false
    const masterEvalAmt = masterMap.get(`${r.계좌}_${r.종목코드}`)?.평가금액 || 0
    if (masterEvalAmt > 0) return false
    return true
  })

  const targetCodes = Array.from(new Set(activeHoldings.map((r) => r.종목코드)))

  const stockCodes = targetCodes.filter((c) => /^\d[a-zA-Z0-9]{4}\d$/.test(c))
  const fundCodes = targetCodes.filter((c) => c.startsWith('K5'))

  const closingPricesMap = new Map<string, number>()

  if (goldPrice) {
    closingPricesMap.set(goldPrice.종목코드, goldPrice.종가)
  }

  // 펀드 시세 수집
  if (fundCodes.length > 0) {
    try {
      const fundPrices = await MarketDataService.getFundPrices(fundCodes)
      for (const fp of fundPrices) {
        closingPricesMap.set(fp.종목코드, fp.종가)
      }
    } catch (err) {
      console.warn('Fund prices error:', err)
    }
  }

  // 개별 주식 현재가 KIS 조회 (실보유 종목만 호출)
  if (kisBoolioService) {
    for (const ticker of stockCodes) {
      let success = false
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const price = await kisBoolioService.getCurrentPrice(ticker)
          if (price !== null && !isNaN(price)) {
            closingPricesMap.set(ticker, price)
            success = true
            break // 성공 시 재시도 루프 탈출
          }
        } catch (err) {
          console.warn(`Price fetch error for ${ticker} (attempt ${attempt}):`, err)
        }
        
        // 실패 시 재시도를 위해 500ms 길게 대기
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }

      if (!success) {
        console.warn(`[RateLimit] Failed to fetch price for ${ticker} after 3 attempts.`)
      }

      // 초당 API 호출 제한(Rate Limit)을 피하기 위해 평상시 기본 50ms 딜레이 부여
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  // 5. 시세 반영 평가
  const evaluatedAssets = evaluateBalanceSheet(
    'assets',
    todayBsAssets,
    assets,
    closingPricesMap,
    exchangeRates,
    ovsBalances
  )

  const evaluatedPension = evaluateBalanceSheet(
    'pension',
    todayBsPension,
    pension,
    closingPricesMap,
    exchangeRates
  )

  // 5. 상품별 보유현황 계산 (tComm, tComm2, tComm10, holdings)
  const { tComm, tComm2, tComm10, holdingsSnapshots } =
    computeCommodityHoldings(evaluatedAssets, evaluatedPension, exchangeRates)

  // 6. 11개 계좌 피벗 자산배분 매트릭스 계산 (accountAllocation)
  const accountAllocation = computeAccountAllocation(tComm2, groups)

  // 7. 자산군별/계좌별 손익 계산 (tComm3, tComm4) 및 asset_ratio 산출
  const { tComm3, tComm4, assetRatioSnapshots } = computeAssetProfit(evaluatedAssets, evaluatedPension)

  // 8. 상세 상품별 손익 계산 (commProfit, commProfit2)
  const { commProfit, commProfit2 } = computeDetailedCommodityProfit(evaluatedAssets, evaluatedPension)

  // 9. DB 스냅샷 갱신 (holdings, asset_ratio, return)
  try {
    if (holdingsSnapshots.length > 0) {
      const { error: insErr } = await supabase.from('holdings').upsert(holdingsSnapshots, { onConflict: '자산군, 세부자산군, 세부자산군2, 상품명' })
      if (insErr) console.error('[DB Error] holdings upsert:', insErr)
    }
    if (assetRatioSnapshots.length > 0) {
      const { error: insErr } = await supabase.from('asset_ratio').upsert(assetRatioSnapshots, { onConflict: '자산군, 세부자산군, 세부자산군2' })
      if (insErr) console.error('[DB Error] asset_ratio upsert:', insErr)
    }

    // return 테이블 오늘 스냅샷 upsert
    const returnSnapshots = tComm3.map((r) => ({
      기준일: todayStr,
      자산군: r.자산군,
      세부자산군: r.세부자산군,
      세부자산군2: r.세부자산군2,
      평가금액: r.평가금액,
      총손익: r.총손익,
      총수익률: r.총수익률,
    }))

    await supabase.from('return').delete().eq('기준일', todayStr)
    await supabase.from('return').insert(returnSnapshots)
  } catch (err) {
    console.warn('Holdings / AssetRatio / Return DB sync error:', err)
  }

  // 10. 종합손익 및 손익변동 계산
  const [{ data: evalProfitRows }] = await Promise.all([
    fetchAll(supabase, 'eval_profit'),
  ])

  // 2단계 안전 날짜 확정 패턴 (주말/공휴일 결함 방지)
  // 1단계: 1.5년치 기준일 목록 조회 -> findClosestDate로 5개 영업일 확정
  const oneAndHalfYearsAgo = format(subMonths(new Date(), 18), 'yyyy-MM-dd')
  const { data: dateRows } = (await supabase
    .from('return')
    .select('기준일')
    .eq('자산군', '<합계>')
    .gte('기준일', oneAndHalfYearsAgo)
    .order('기준일', { ascending: true })) as unknown as { data: Array<{ 기준일: string }> | null }

  const availableDates = Array.from(
    new Set(dateRows?.map((r) => r.기준일.substring(0, 10)) || [])
  ).sort()

  const findClosestDate = (targetDate: string): string | null => {
    const exact = availableDates.find((d) => d === targetDate)
    if (exact) return exact
    const beforeDates = availableDates.filter((d) => d <= targetDate)
    if (beforeDates.length > 0) return beforeDates[beforeDates.length - 1]
    return availableDates[0] || null
  }

  const todayDate = new Date()
  const targetD1 = format(subDays(todayDate, 1), 'yyyy-MM-dd')
  const targetDm = format(subMonths(todayDate, 1), 'yyyy-MM-dd')
  const targetD3m = format(subMonths(todayDate, 3), 'yyyy-MM-dd')
  const targetD6m = format(subMonths(todayDate, 6), 'yyyy-MM-dd')
  const targetDy = format(subYears(todayDate, 1), 'yyyy-MM-dd')

  const exact5Dates = Array.from(
    new Set(
      [
        findClosestDate(targetD1),
        findClosestDate(targetDm),
        findClosestDate(targetD3m),
        findClosestDate(targetD6m),
        findClosestDate(targetDy),
      ].filter((d): d is string => !!d)
    )
  )

  interface ReturnVariationRow {
    기준일: string
    자산군: string
    세부자산군: string
    세부자산군2: string
    평가금액: number
    총손익: number
    총수익률: number
  }

  interface ReturnSummaryRow {
    기준일: string
    자산군: string
    평가금액: number
    총손익: number
  }

  // 2단계: 5개 확정 영업일의 return 레코드 및 연간 손익용 과거 연도말 합계 조회
  const [
    variationRes,
    pastYearEndRes,
  ] = await Promise.all([
    exact5Dates.length > 0
      ? supabase
          .from('return')
          .select('기준일, 자산군, 세부자산군, 세부자산군2, 평가금액, 총손익, 총수익률')
          .in('기준일', exact5Dates)
      : Promise.resolve({ data: [] as ReturnVariationRow[] }),
    supabase
      .from('return')
      .select('기준일, 자산군, 평가금액, 총손익')
      .eq('자산군', '<합계>')
      .lt('기준일', `${currentYear}-01-01`)
      .order('기준일', { ascending: true }),
  ])

  const variationList = ((variationRes.data || []) as unknown) as ReturnVariationRow[]
  const pastYearEndList = ((pastYearEndRes.data || []) as unknown) as ReturnSummaryRow[]

  const combinedReturnRows: Array<{
    기준일: string
    자산군: string
    평가금액: number
    총손익: number
  }> = [
    ...variationList.map((r) => ({
      기준일: r.기준일,
      자산군: r.자산군,
      평가금액: r.평가금액,
      총손익: r.총손익,
    })),
    ...pastYearEndList,
  ]

  // 연도별 장부금액 및 평잔 요약
  const yearBookMap = new Map<number, { 장부금액: number; 평잔: number; 실현손익: number }>()
  const combinedYearTrades = [...bsAssets, ...bsPension].filter(
    (r) => (r.거래일자.endsWith('-12-31') || r.거래일자 === todayStr) && r.통화 === '원화'
  )
  for (const r of combinedYearTrades) {
    const y = Number(r.거래일자.substring(0, 4))
    const cur = yearBookMap.get(y) || { 장부금액: 0, 평잔: 0, 실현손익: 0 }
    cur.장부금액 += r.장부금액
    cur.평잔 += r.평잔
    cur.실현손익 += r.실현손익
    yearBookMap.set(y, cur)
  }

  const bookInfo = Array.from(yearBookMap.entries()).map(([k, v]) => ({
    연도: k,
    ...v,
  }))

  // t_comm3에서 현재 연도의 <합계> 평가금액 및 평가손익 추출
  const currentEvalRow = tComm3.find((r) => r.자산군 === '<합계>')
  const currentEvalAmt = currentEvalRow?.평가금액
  const currentEvalProfit = currentEvalRow?.평가손익

  const totalProfit = computeTotalProfit(
    bookInfo,
    evalProfitRows || [],
    combinedReturnRows,
    currentYear,
    currentEvalAmt,
    currentEvalProfit
  )

  const profitVariation = computeProfitVariation(
    tComm3,
    variationList,
    new Date()
  )

  // 11. 최종 포트폴리오 스냅샷 객체 조립
  const summary: LatestPortfolioSummary = {
    id: 'latest',
    updated_at: new Date().toISOString(),
    기준일: todayStr,
    total_profit: totalProfit,
    profit_variation: profitVariation,
    account_allocation: accountAllocation,
    t_comm: tComm,
    t_comm2: tComm2,
    t_comm3: tComm3,
    t_comm4: tComm4,
    t_comm10: tComm10,
    comm_profit: commProfit,
    comm_profit2: commProfit2,
  }

  // 12. DB latest_portfolio_summary 테이블에 단일 스냅샷 upsert
  try {
    const { error: snapErr } = await supabase
      .from('latest_portfolio_summary')
      .upsert(summary, { onConflict: 'id' })

    if (snapErr) {
      console.warn('latest_portfolio_summary upsert error:', snapErr)
    }
  } catch (err) {
    console.warn('latest_portfolio_summary upsert exception:', err)
  }

  return {
    success: true,
    today: todayStr,
    exchangeRates,
    summary,
  }
}
