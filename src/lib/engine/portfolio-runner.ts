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

interface SnapshotSummarySlice {
  t_comm?: Array<{ 종목코드?: string; 상품명?: string; 보유수량?: number; 현재가?: number; 평가금액?: number }>
  t_comm2?: Array<{
    계좌?: string
    통화?: string
    자산군?: string
    종목코드?: string
    종목명?: string
    상품명?: string
    보유수량?: number
    장부금액?: number
    평가금액?: number
  }>
  comm_profit?: Array<{
    계좌?: string
    통화?: string
    자산군?: string
    종목명?: string
    상품명?: string
    보유수량?: number
    장부금액?: number
    평가금액?: number
  }>
}

/**
 * 직전 latest_portfolio_summary 스냅샷에서 통화별 고유 단가(원화 종목은 KRW, 외화 종목은 USD/JPY)와
 * 직전 적용 환율을 왜곡 없이 복원하는 헬퍼 함수
 */
function extractSnapshotPricesAndRates(latestSummaryRaw: SnapshotSummarySlice | null): {
  prevUnitPriceMap: Map<string, number>
  derivedExchangeRates: { USD: number; JPY: number }
} {
  const prevUnitPriceMap = new Map<string, number>()
  const derivedExchangeRates = { USD: 1400, JPY: 9.3 }

  if (!latestSummaryRaw) {
    return { prevUnitPriceMap, derivedExchangeRates }
  }

  const commProfitList = latestSummaryRaw.comm_profit || []
  const tComm2List = latestSummaryRaw.t_comm2 || []

  // 1. 직전 스냅샷 환율 복원 (장부금액 원화환산 비율 및 달러자산/엔화자산 평가금액 비율 활용)
  const commProfitByKey = new Map<string, NonNullable<SnapshotSummarySlice['comm_profit']>[number]>()
  let cleanDollarEvalSum = 0
  let cleanDollarCount = 0
  let dollarAssetWonEval = 0

  for (const c of commProfitList) {
    if (c.계좌 && c.종목명) {
      commProfitByKey.set(`${c.계좌}_${c.종목명}`, c)
    }
    if (c.종목명 === '달러자산' && c.평가금액 && c.평가금액 > 0) {
      dollarAssetWonEval = c.평가금액
    }
    if (c.통화 === '달러' && c.평가금액 && c.평가금액 > 0) {
      // 원화 환율이 중복 곱해지지 않은 정상 달러 평가금액인지 검증 (장부금액 대비 100배 미만)
      if (!c.장부금액 || c.장부금액 <= 0 || c.평가금액 / c.장부금액 < 100) {
        cleanDollarEvalSum += c.평가금액
        cleanDollarCount++
      }
    }
  }

  if (cleanDollarCount > 0 && cleanDollarEvalSum > 0 && dollarAssetWonEval > 0) {
    const ratio = dollarAssetWonEval / cleanDollarEvalSum
    if (ratio >= 800 && ratio <= 2500) {
      derivedExchangeRates.USD = Number(ratio.toFixed(4))
    }
  } else {
    // 장부금액 비율로 USD 환율 역산
    for (const r of tComm2List) {
      if (r.통화 === '달러' && r.장부금액 && r.장부금액 > 0 && r.계좌 && r.종목명) {
        const cp = commProfitByKey.get(`${r.계좌}_${r.종목명}`)
        if (cp?.장부금액 && cp.장부금액 > 0) {
          const ratio = r.장부금액 / cp.장부금액
          if (ratio >= 800 && ratio <= 2500) {
            derivedExchangeRates.USD = Number(ratio.toFixed(2))
            break
          }
        }
      }
    }
  }

  // 2. 시장가 평가 대상 종목(주식/ETF/펀드/금현물/불리오 해외주식)의 고유 통화 단가 추출
  for (const r of tComm2List) {
    if (!r.종목코드 || !r.보유수량 || r.보유수량 <= 0 || !r.평가금액 || r.평가금액 <= 0) continue

    const isStockOrFund = /^\d[a-zA-Z0-9]{4}\d$/.test(r.종목코드) || r.종목코드.startsWith('K5')
    const isGold = r.계좌 === '금현물' || r.종목코드 === '04020000'
    const isOvsMarket = r.계좌 === '불리오' && r.통화 !== '원화' && r.자산군 !== '현금성'

    if (!isStockOrFund && !isGold && !isOvsMarket) continue

    if (r.통화 === '원화' || !r.통화) {
      const unitPrice = r.평가금액 / r.보유수량
      if (unitPrice > 0) {
        if (r.계좌) prevUnitPriceMap.set(`${r.계좌}_${r.종목코드}`, unitPrice)
        if (!prevUnitPriceMap.has(r.종목코드)) prevUnitPriceMap.set(r.종목코드, unitPrice)
      }
    } else if (isOvsMarket && r.계좌 && r.종목명) {
      const cp = commProfitByKey.get(`${r.계좌}_${r.종목명}`)
      let nativeEval = cp?.평가금액 || 0
      const nativeBook = cp?.장부금액 || 0
      const rate = r.통화 === '달러' ? derivedExchangeRates.USD : derivedExchangeRates.JPY

      // 만약 직전 스냅샷에 원화 환산 금액이 잘못 들어있었다면 환율로 나누어 외화 원단위로 복원
      if (nativeEval > 0 && nativeBook > 0 && nativeEval / nativeBook > 100) {
        nativeEval = nativeEval / rate
      } else if (nativeEval <= 0 && r.평가금액 > 0) {
        nativeEval = r.평가금액 / rate
      }

      const unitPrice = nativeEval / r.보유수량
      if (unitPrice > 0) {
        prevUnitPriceMap.set(`${r.계좌}_${r.종목코드}`, unitPrice)
        prevUnitPriceMap.set(r.종목코드, unitPrice)
      }
    }
  }

  return { prevUnitPriceMap, derivedExchangeRates }
}

export async function runPortfolioValuation(): Promise<{
  success: boolean
  today: string
  exchangeRates: { USD: number; JPY: number }
  summary: LatestPortfolioSummary
}> {
  const supabase = createAdminClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const currentYear = new Date().getFullYear()
  const oneAndHalfYearsAgo = format(subMonths(new Date(), 18), 'yyyy-MM-dd')

  // 1. [DB & Network 병렬화] 독립적인 마스터 데이터, 거래내역, 과거 기준일, 외부 환율/금시세/해외잔고 동시 로드
  const [
    { data: assetsRaw, error: assetsErr },
    { data: pensionRaw, error: pensionErr },
    { data: assetsDailyRaw, error: assetsDailyErr },
    { data: pensionDailyRaw, error: pensionDailyErr },
    { data: groupsRaw, error: groupsErr },
    { data: evalProfitRows, error: evalProfitErr },
    latestSummaryRes,
    dateRowsRes,
    pastYearEndRes,
    exRes,
    gpRes,
    kbInitRes,
  ] = await Promise.all([
    fetchAll(supabase, 'assets', '행번호'),
    fetchAll(supabase, 'pension', '행번호'),
    fetchAll(supabase, 'assets_daily', '행번호'),
    fetchAll(supabase, 'pension_daily', '행번호'),
    fetchAll(supabase, 'groups'),
    fetchAll(supabase, 'eval_profit'),
    supabase.from('latest_portfolio_summary').select('t_comm, t_comm2, comm_profit').eq('id', 'latest').maybeSingle(),
    supabase.from('return').select('기준일').eq('자산군', '<합계>').gte('기준일', oneAndHalfYearsAgo).order('기준일', { ascending: true }),
    supabase.from('return').select('기준일, 자산군, 평가금액, 총손익').eq('자산군', '<합계>').lt('기준일', `${currentYear}-01-01`).order('기준일', { ascending: true }),
    MarketDataService.getExchangeRates().catch(() => ({ USD: 1400, JPY: 9.3 })),
    MarketDataService.getGoldPrice().catch(() => null),
    KISService.create('boolio').then(async (kb) => {
      if (!kb) return { service: null, ovsBalances: [] }
      const ovs = await kb.getOverseasBalance('USD').catch(() => [])
      return { service: kb, ovsBalances: ovs }
    }).catch(() => ({ service: null, ovsBalances: [] })),
  ])

  // Fail-fast 방어 로직: DB 접근 실패 시 스냅샷 빈 데이터 덮어쓰기 방지
  if (assetsErr || pensionErr || assetsDailyErr || pensionDailyErr || groupsErr || evalProfitErr) {
    console.error('[PortfolioRunner] DB Fetch Error:', {
      assetsErr, pensionErr, assetsDailyErr, pensionDailyErr, groupsErr, evalProfitErr
    })
    return {
      success: false,
      today: todayStr,
      exchangeRates: { USD: 1400, JPY: 9.3 },
      summary: {} as LatestPortfolioSummary
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

  // 2. 일별 거래 집계 & 장부금액/평잔 계산 (Map 기반 O(1) 인덱싱 적용으로 초고속 계산)
  const dailyAssets = getDailyTrading(assets, assetsDaily)
  const bsAssets = getBalanceSheet('assets', dailyAssets, assets)

  const dailyPension = getDailyTrading(pension, pensionDaily)
  const bsPension = getBalanceSheet('pension', dailyPension, pension)

  // 오늘 날짜 잔액 레코드 필터
  const todayBsAssets = bsAssets.filter((r) => r.거래일자 === todayStr)
  const todayBsPension = bsPension.filter((r) => r.거래일자 === todayStr)

  // 3. 외부 환율, 금 시세, KIS 해외주식 잔고 바인딩
  const exchangeRates = exRes || { USD: 1400, JPY: 9.3 }
  const goldPrice = gpRes
  const kisBoolioService: KISService | null = kbInitRes?.service || null
  const ovsBalances: Array<{ 종목코드: string; 평가금액: number }> = kbInitRes?.ovsBalances || []

  // 4. 보유수량 > 0 및 장부금액 >= 1인 실보유 종목만 엄격히 추출 (금현물, 불리오 해외주식, 고정평가 대상 제외)
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
    if (r.보유수량 <= 0 || (r.장부금액 !== undefined && r.장부금액 < 1)) return false
    if (goldTicker && r.종목코드 === goldTicker) return false
    if (r.계좌 === '불리오' && ovsTickerSet.has(r.종목코드)) return false
    const masterEvalAmt = masterMap.get(`${r.계좌}_${r.종목코드}`)?.평가금액 || 0
    if (masterEvalAmt > 0) return false
    return true
  })

  const targetCodes = Array.from(new Set(activeHoldings.map((r) => r.종목코드)))
  const stockCodes = targetCodes.filter((c) => /^\d[a-zA-Z0-9]{4}\d$/.test(c))
  const fundCodes = targetCodes.filter((c) => c.startsWith('K5'))

  // 5. 손익변동용 5개 과거 영업일 확정
  const availableDates = Array.from(
    new Set((dateRowsRes?.data as Array<{ 기준일: string }> | null)?.map((r) => r.기준일.substring(0, 10)) || [])
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

  // 6. [시세 조회 병렬 실행]: 펀드 크롤링, KIS 복수종목 시세(30개 단위 일괄배치), 5개 영업일 return 조회를 동시 발주
  const [fundPrices, multiPricesMap, variationRes] = await Promise.all([
    fundCodes.length > 0 ? MarketDataService.getFundPrices(fundCodes).catch(() => []) : Promise.resolve([]),
    kisBoolioService && stockCodes.length > 0
      ? kisBoolioService.getMultipleCurrentPrices(stockCodes).catch(() => new Map<string, number>())
      : Promise.resolve(new Map<string, number>()),
    exact5Dates.length > 0
      ? supabase
          .from('return')
          .select('기준일, 자산군, 세부자산군, 세부자산군2, 평가금액, 총손익, 총수익률')
          .in('기준일', exact5Dates)
      : Promise.resolve({ data: [] as ReturnVariationRow[] }),
  ])

  const closingPricesMap = new Map<string, number>()
  if (goldPrice) {
    closingPricesMap.set(goldPrice.종목코드, goldPrice.종가)
  }
  for (const fp of fundPrices) {
    if (fp.종가 && !isNaN(fp.종가) && fp.종가 > 0) {
      closingPricesMap.set(fp.종목코드, fp.종가)
    }
  }
  for (const [code, price] of multiPricesMap.entries()) {
    if (price && !isNaN(price) && price > 0) {
      closingPricesMap.set(code, price)
    }
  }

  // 7. [단건 정밀 재시도]: 복수 시세 응답에서 누락되었거나 비양수(<= 0 또는 NaN)인 종목만 개별 getCurrentPrice 조회
  const missingStockCodes = stockCodes.filter((c) => !closingPricesMap.has(c) || (closingPricesMap.get(c) || 0) <= 0)
  if (missingStockCodes.length > 0 && kisBoolioService) {
    console.warn(`[PortfolioRunner] ${missingStockCodes.length} stock tickers missing or invalid from multi-price response. Querying individually:`, missingStockCodes)
    for (const ticker of missingStockCodes) {
      try {
        const singlePrice = await kisBoolioService.getCurrentPrice(ticker, 3)
        if (singlePrice !== null && !isNaN(singlePrice) && singlePrice > 0) {
          closingPricesMap.set(ticker, singlePrice)
        }
      } catch (err) {
        console.warn(`[PortfolioRunner] Single price query error for ${ticker}:`, err)
      }
      // 안전 딜레이 유지
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
  }

  // 8. [최종 안전망(Fallback to Previous Price)]: 직전 스냅샷 단가 추출 및 미수신 종목 보완
  const latestSummaryRaw = latestSummaryRes?.data as SnapshotSummarySlice | null
  const { prevUnitPriceMap } = extractSnapshotPricesAndRates(latestSummaryRaw)

  for (const ticker of [...stockCodes, ...fundCodes]) {
    const price = closingPricesMap.get(ticker)
    if (price === undefined || price === null || isNaN(price) || price <= 0) {
      const fallbackPrice = prevUnitPriceMap.get(ticker)
      if (fallbackPrice && fallbackPrice > 0) {
        closingPricesMap.set(ticker, fallbackPrice)
        console.warn(`[PortfolioRunner Fallback] ${ticker} 시세 수신 실패 -> 직전 스냅샷 단가(${fallbackPrice})로 폴백 적용`)
      } else {
        console.warn(`[PortfolioRunner] ${ticker} 시세 수신 실패 및 직전 단가 없음 -> 장부금액 원가 적용`)
      }
    }
  }

  // 9. 시세 반영 평가 (폴백 맵을 함께 전달하여 0원/장부금액 왜곡 완전 차단)
  const evaluatedAssets = evaluateBalanceSheet(
    'assets',
    todayBsAssets,
    assets,
    closingPricesMap,
    exchangeRates,
    ovsBalances,
    prevUnitPriceMap
  )

  const evaluatedPension = evaluateBalanceSheet(
    'pension',
    todayBsPension,
    pension,
    closingPricesMap,
    exchangeRates,
    [],
    prevUnitPriceMap
  )

  // 10. 상품별 보유현황, 자산배분 피벗, 자산군/계좌별 손익, 상세 상품별 손익 계산
  const { tComm, tComm2, tComm10, holdingsSnapshots } =
    computeCommodityHoldings(evaluatedAssets, evaluatedPension, exchangeRates)

  const accountAllocation = computeAccountAllocation(tComm2, groups)
  const { tComm3, tComm4, assetRatioSnapshots } = computeAssetProfit(evaluatedAssets, evaluatedPension)
  const { commProfit, commProfit2 } = computeDetailedCommodityProfit(evaluatedAssets, evaluatedPension)

  // 11. DB 스냅샷 갱신 (holdings, asset_ratio, return 병렬 저장)
  const returnSnapshots = tComm3.map((r) => ({
    기준일: todayStr,
    자산군: r.자산군,
    세부자산군: r.세부자산군,
    세부자산군2: r.세부자산군2,
    평가금액: r.평가금액,
    총손익: r.총손익,
    총수익률: r.총수익률,
  }))

  try {
    await Promise.all([
      holdingsSnapshots.length > 0
        ? supabase.from('holdings').upsert(holdingsSnapshots, { onConflict: '자산군, 세부자산군, 세부자산군2, 상품명' })
        : Promise.resolve({ error: null }),
      assetRatioSnapshots.length > 0
        ? supabase.from('asset_ratio').upsert(assetRatioSnapshots, { onConflict: '자산군, 세부자산군, 세부자산군2' })
        : Promise.resolve({ error: null }),
      supabase.from('return').delete().eq('기준일', todayStr).then(() => {
        return supabase.from('return').insert(returnSnapshots)
      }),
    ])
  } catch (err) {
    console.warn('Holdings / AssetRatio / Return DB sync error:', err)
  }

  // 12. 종합손익 및 손익변동 계산
  const variationList = ((variationRes.data || []) as unknown) as ReturnVariationRow[]
  const pastYearEndList = ((pastYearEndRes?.data || []) as unknown) as ReturnSummaryRow[]

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

  // 13. 최종 포트폴리오 스냅샷 객체 조립 및 저장
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

/**
 * R5 외부 시세 API 호출 없는 고속 포트폴리오 재계산 함수
 * 기존 latest_portfolio_summary 스냅샷의 종목별 단가 및 환율을 재사용하여 즉시 동기화
 */
export async function fastRecalculatePortfolio(): Promise<{
  success: boolean
  today: string
  exchangeRates: { USD: number; JPY: number }
  summary: LatestPortfolioSummary
}> {
  const supabase = createAdminClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const currentYear = new Date().getFullYear()
  const oneAndHalfYearsAgo = format(subMonths(new Date(), 18), 'yyyy-MM-dd')

  const [
    { data: assetsRaw },
    { data: pensionRaw },
    { data: assetsDailyRaw },
    { data: pensionDailyRaw },
    { data: groupsRaw },
    { data: evalProfitRows },
    latestSummaryRes,
    dateRowsRes,
    pastYearEndRes,
  ] = await Promise.all([
    fetchAll(supabase, 'assets', '행번호'),
    fetchAll(supabase, 'pension', '행번호'),
    fetchAll(supabase, 'assets_daily', '행번호'),
    fetchAll(supabase, 'pension_daily', '행번호'),
    fetchAll(supabase, 'groups'),
    fetchAll(supabase, 'eval_profit'),
    supabase.from('latest_portfolio_summary').select('t_comm, t_comm2, comm_profit').eq('id', 'latest').maybeSingle(),
    supabase.from('return').select('기준일').eq('자산군', '<합계>').gte('기준일', oneAndHalfYearsAgo).order('기준일', { ascending: true }),
    supabase.from('return').select('기준일, 자산군, 평가금액, 총손익').eq('자산군', '<합계>').lt('기준일', `${currentYear}-01-01`).order('기준일', { ascending: true }),
  ])

  const assets = (assetsRaw || []) as AssetMaster[]
  const pension = (pensionRaw || []) as AssetMaster[]
  const assetsDaily = (assetsDailyRaw || []) as DailyTradeRaw[]
  const pensionDaily = (pensionDailyRaw || []) as DailyTradeRaw[]
  const groups = (groupsRaw || []) as Array<{ 자산군: string; 세부자산군: string; 세부자산군2: string }>

  const dailyAssets = getDailyTrading(assets, assetsDaily)
  const bsAssets = getBalanceSheet('assets', dailyAssets, assets)
  const dailyPension = getDailyTrading(pension, pensionDaily)
  const bsPension = getBalanceSheet('pension', dailyPension, pension)

  const todayBsAssets = bsAssets.filter((r) => r.거래일자 === todayStr)
  const todayBsPension = bsPension.filter((r) => r.거래일자 === todayStr)

  const latestSummaryRaw = latestSummaryRes?.data as SnapshotSummarySlice | null
  const { prevUnitPriceMap, derivedExchangeRates: exchangeRates } = extractSnapshotPricesAndRates(latestSummaryRaw)
  const closingPricesMap = new Map<string, number>()

  const evaluatedAssets = evaluateBalanceSheet(
    'assets',
    todayBsAssets,
    assets,
    closingPricesMap,
    exchangeRates,
    [],
    prevUnitPriceMap
  )

  const evaluatedPension = evaluateBalanceSheet(
    'pension',
    todayBsPension,
    pension,
    closingPricesMap,
    exchangeRates,
    [],
    prevUnitPriceMap
  )

  const { tComm, tComm2, tComm10, holdingsSnapshots } =
    computeCommodityHoldings(evaluatedAssets, evaluatedPension, exchangeRates)
  const accountAllocation = computeAccountAllocation(tComm2, groups)
  const { tComm3, tComm4, assetRatioSnapshots } = computeAssetProfit(evaluatedAssets, evaluatedPension)
  const { commProfit, commProfit2 } = computeDetailedCommodityProfit(evaluatedAssets, evaluatedPension)

  const returnSnapshots = tComm3.map((r) => ({
    기준일: todayStr,
    자산군: r.자산군,
    세부자산군: r.세부자산군,
    세부자산군2: r.세부자산군2,
    평가금액: r.평가금액,
    총손익: r.총손익,
    총수익률: r.총수익률,
  }))

  const availableDates = Array.from(
    new Set((dateRowsRes?.data as Array<{ 기준일: string }> | null)?.map((r) => r.기준일.substring(0, 10)) || [])
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

  const [variationRes] = await Promise.all([
    exact5Dates.length > 0
      ? supabase
          .from('return')
          .select('기준일, 자산군, 세부자산군, 세부자산군2, 평가금액, 총손익, 총수익률')
          .in('기준일', exact5Dates)
      : Promise.resolve({ data: [] as ReturnVariationRow[] }),
    holdingsSnapshots.length > 0
      ? supabase.from('holdings').upsert(holdingsSnapshots, { onConflict: '자산군, 세부자산군, 세부자산군2, 상품명' })
      : Promise.resolve({ error: null }),
    assetRatioSnapshots.length > 0
      ? supabase.from('asset_ratio').upsert(assetRatioSnapshots, { onConflict: '자산군, 세부자산군, 세부자산군2' })
      : Promise.resolve({ error: null }),
    supabase.from('return').delete().eq('기준일', todayStr).then(() => {
      return supabase.from('return').insert(returnSnapshots)
    }),
  ])

  const variationList = ((variationRes.data || []) as unknown) as ReturnVariationRow[]
  const pastYearEndList = ((pastYearEndRes?.data || []) as unknown) as ReturnSummaryRow[]

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

  try {
    await supabase.from('latest_portfolio_summary').upsert(summary, { onConflict: 'id' })
  } catch (err) {
    console.warn('fastRecalculatePortfolio upsert error:', err)
  }

  return {
    success: true,
    today: todayStr,
    exchangeRates,
    summary,
  }
}
