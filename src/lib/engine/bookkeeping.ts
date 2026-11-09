import { AssetMaster, DailyTradeRaw, DailyTradeProcessed, BalanceSheetRecord } from './types'
import { format, parseISO, getYear, eachDayOfInterval } from 'date-fns'

/**
 * 환율을 적용하여 원화 금액으로 환산하는 헬퍼 함수
 * - 엔화(JPY): 100엔당 원화 기준이므로 (금액 * 환율) / 100
 * - 달러(USD): 1달러당 원화 기준이므로 금액 * 환율
 */
export function convertToKRW(amount: number, currency: string, rate?: number | null, defaultRate = 1): number {
  if (!amount || currency === '원화') return Math.round(amount || 0)
  const r = rate && rate > 0 ? rate : defaultRate
  if (currency === '엔화') {
    return Math.round((amount * r) / 100)
  }
  return Math.round(amount * r)
}

/**
 * 통화별 환율 단위 배수 반환 (달러: 1, 엔화: 100)
 */
export function getFxRateMultiplier(currency: string): number {
  return currency === '엔화' ? 100 : 1
}

/**
 * 자산 마스터 정보와 거래내역을 날짜 그리드(2024-01-01 ~ 오늘)와 조인하여 일별 거래 매트릭스 생성
 */
export function getDailyTrading(
  astInfo: AssetMaster[],
  tradeRaw: DailyTradeRaw[],
  startDate = new Date(2024, 0, 1),
  endDate = new Date()
): DailyTradeProcessed[] {
  const days = eachDayOfInterval({ start: startDate, end: endDate }).map((d) => format(d, 'yyyy-MM-dd'))

  // unique 계좌 x 종목코드 조합
  const uniqueItems = new Map<string, AssetMaster>()
  for (const item of astInfo) {
    const key = `${item.계좌}_${item.종목코드}`
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, item)
    }
  }

  // 거래내역을 맵으로 구성 (계좌_종목코드_거래일자)
  const tradeMap = new Map<string, DailyTradeRaw>()
  for (const t of tradeRaw) {
    let dateStr = ''
    if (t.거래일자) {
      const dbDate = new Date(t.거래일자)
      const kstDate = new Date(dbDate.getTime() + 9 * 60 * 60 * 1000)
      dateStr = kstDate.toISOString().substring(0, 10)
    }
    const key = `${t.계좌}_${t.종목코드}_${dateStr}`
    if (tradeMap.has(key)) {
      const existing = tradeMap.get(key)!
      tradeMap.set(key, {
        ...existing,
        매입수량: (existing.매입수량 || 0) + (t.매입수량 || 0),
        매입액: (existing.매입액 || 0) + (t.매입액 || 0),
        현금지출: (existing.현금지출 || 0) + (t.현금지출 || 0),
        매도수량: (existing.매도수량 || 0) + (t.매도수량 || 0),
        매도원금: (existing.매도원금 || 0) + (t.매도원금 || 0),
        매도액: (existing.매도액 || 0) + (t.매도액 || 0),
        이자배당액: (existing.이자배당액 || 0) + (t.이자배당액 || 0),
        현금수입: (existing.현금수입 || 0) + (t.현금수입 || 0),
        입출금: (existing.입출금 || 0) + (t.입출금 || 0),
        환율: t.환율 || existing.환율 || null,
      })
    } else {
      tradeMap.set(key, { ...t, 거래일자: dateStr })
    }
  }

  const result: DailyTradeProcessed[] = []

  // 모든 종목 x 날짜에 대해 그리드 레코드 생성
  for (const item of uniqueItems.values()) {
    for (const day of days) {
      const key = `${item.계좌}_${item.종목코드}_${day}`
      const t = tradeMap.get(key)

      const buyQ = t?.매입수량 || 0
      const buyAmt = t?.매입액 || 0
      const buyCash = t?.현금지출 || 0
      const sellQ = t?.매도수량 || 0
      const sellPrincipal = t?.매도원금 || 0
      const sellAmt = t?.매도액 || 0
      const dividend = t?.이자배당액 || 0
      const cashIn = t?.현금수입 || 0
      const inOut = t?.입출금 || 0
      const rate = t?.환율 || null

      const netBuyQ = buyQ - sellQ
      const revenue = sellAmt - sellPrincipal + dividend
      const cost = buyCash - buyAmt + sellAmt + dividend - cashIn
      const realizedProfit = revenue - cost

      result.push({
        계좌: item.계좌,
        종목코드: item.종목코드,
        종목명: item.종목명,
        통화: item.통화,
        거래일자: day,
        순매입수량: netBuyQ,
        매입액: buyAmt,
        현금지출: buyCash,
        매도수량: sellQ,
        매도원금: sellPrincipal,
        매도액: sellAmt,
        수익: revenue,
        비용: cost,
        실현손익: realizedProfit,
        현금수입: cashIn,
        입출금: inOut,
        이자배당액: dividend,
        환율: rate,
      })
    }
  }

  // 정렬 (계좌, 종목코드, 거래일자)
  result.sort((a, b) => {
    if (a.계좌 !== b.계좌) return a.계좌.localeCompare(b.계좌)
    if (a.종목코드 !== b.종목코드) return a.종목코드.localeCompare(b.종목코드)
    return a.거래일자.localeCompare(b.거래일자)
  })

  return result
}

/**
 * 누적 보유수량, 누적 장부금액, 연도별 평잔 및 누적 실현손익 산출
 * - 외화표시자산은 거래시점 환율 기반으로 외화 원단위 장부와 원화 환산 장부를 동시 추적
 * - 외화 종목 매도 시 이동평균 원화장부 비례 차감 (원화매도원금 자동 계산)
 * - 원화예수금 10개 종목(투자 5개 + 연금 5개) 및 외화예수금 3개 종목 자동 통합 산출
 */
export function getBalanceSheet(
  dailyTrades: DailyTradeProcessed[],
  astMasters: AssetMaster[]
): BalanceSheetRecord[] {
  const masterMap = new Map<string, AssetMaster>()
  for (const m of astMasters) {
    masterMap.set(`${m.계좌}_${m.종목코드}`, m)
  }

  // 종목별(계좌_종목코드) 그룹화
  const grouped = new Map<string, DailyTradeProcessed[]>()
  for (const dt of dailyTrades) {
    const key = `${dt.계좌}_${dt.종목코드}`
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(dt)
  }

  const records: BalanceSheetRecord[] = []

  // 직전 유효 환율 추적용 (비환전일 환율 미입력 시 임시 적용)
  const lastKnownRates: Record<string, number> = {
    달러: 1350,
    엔화: 900,
  }

  // 1단계: 종목별 기본 시계열 누적 계산
  for (const [key, trades] of grouped.entries()) {
    trades.sort((a, b) => a.거래일자.localeCompare(b.거래일자))

    let cumQuantity = 0
    let cumForeignBookValue = 0 // 외화 원단위 장부금액
    let cumWonBookValue = 0     // 원화 환산 장부금액

    let currentYear = -1
    let yearTradesCount = 0
    let yearWonBookSum = 0
    let cumRevenueYear = 0
    let cumCostYear = 0
    let cumRealizedYear = 0
    let cumForeignRealizedYear = 0

    const itemMaster = masterMap.get(key)
    const currency = itemMaster?.통화 || '원화'
    const isForeign = currency !== '원화'
    const assetClass = itemMaster?.자산군 || ''
    const assetClass1 = itemMaster?.세부자산군 || ''
    const assetClass2 = itemMaster?.세부자산군2 || ''

    for (const t of trades) {
      // 환율 추적 (정상 환율 범위 검증: 달러 900~2500, 엔화 500~2000)
      if (t.환율 && t.환율 > 0) {
        if (currency === '달러' && t.환율 >= 900 && t.환율 <= 2500) {
          lastKnownRates['달러'] = t.환율
        } else if (currency === '엔화' && t.환율 >= 500 && t.환율 <= 2000) {
          lastKnownRates['엔화'] = t.환율
        }
      }
      let activeRate = t.환율 && t.환율 > 0 ? t.환율 : lastKnownRates[currency] || (currency === '엔화' ? 900 : 1350)
      if (currency === '달러' && (activeRate < 900 || activeRate > 2500)) {
        activeRate = lastKnownRates['달러'] || 1350
      } else if (currency === '엔화' && (activeRate < 500 || activeRate > 2000)) {
        activeRate = lastKnownRates['엔화'] || 900
      }

      if (!isForeign) {
        // [원화 종목]
        cumQuantity += t.순매입수량
        cumWonBookValue += t.매입액 - t.매도원금

        cumRevenueYear += t.수익
        cumCostYear += t.비용
        cumRealizedYear += t.실현손익
      } else {
        // [외화 종목]
        const prevForeignBook = cumForeignBookValue
        const prevWonBook = cumWonBookValue

        cumQuantity += t.순매입수량
        cumForeignBookValue += t.매입액 - t.매도원금

        // 원화 매입액 환산
        const wonBuyAmt = convertToKRW(t.매입액, currency, activeRate)

        // 원화 매도원금 비례 차감 (이동평균 원화 장부환율 적용)
        let wonSellPrincipal = 0
        if (t.매도원금 > 0) {
          if (prevForeignBook > 0) {
            const ratio = Math.min(1, t.매도원금 / prevForeignBook)
            wonSellPrincipal = Math.round(prevWonBook * ratio)
          } else {
            wonSellPrincipal = convertToKRW(t.매도원금, currency, activeRate)
          }
        }

        cumWonBookValue += wonBuyAmt - wonSellPrincipal

        // 전량 매도 시 잔여 원화장부 전액 털기 (외화잔고가 0이거나, 수량 보유 종목이 전량 매도된 경우)
        const isClosedOut = cumForeignBookValue <= 0.0001 || (cumQuantity <= 0 && t.매도수량 > 0)
        if (isClosedOut) {
          if (t.매도수량 > 0 && prevWonBook > 0 && wonSellPrincipal < prevWonBook) {
            wonSellPrincipal = prevWonBook
          }
          cumForeignBookValue = 0
          cumWonBookValue = 0
        }

        // 원화 실현손익 = 원화매도액 - 원화매도원금 + 원화이자배당액 - 원화매매비용
        const wonSellAmt = convertToKRW(t.매도액, currency, activeRate)
        const wonDividend = convertToKRW(t.이자배당액 || 0, currency, activeRate)
        const wonBuyCash = convertToKRW(t.현금지출, currency, activeRate)
        const wonCashIn = convertToKRW(t.현금수입, currency, activeRate)

        const wonRevenue = wonSellAmt - wonSellPrincipal + wonDividend
        const wonCost = (wonBuyCash - wonBuyAmt) + (wonSellAmt + wonDividend - wonCashIn)
        const wonRealized = wonRevenue - wonCost

        cumRevenueYear += wonRevenue
        cumCostYear += wonCost
        cumRealizedYear += wonRealized
        cumForeignRealizedYear += t.실현손익
      }

      // 연도별 평잔 계산
      const tYear = getYear(parseISO(t.거래일자))
      if (tYear !== currentYear) {
        currentYear = tYear
        yearTradesCount = 0
        yearWonBookSum = 0
        cumRevenueYear = 0
        cumCostYear = 0
        cumRealizedYear = 0
        cumForeignRealizedYear = 0
      }

      yearTradesCount++
      yearWonBookSum += cumWonBookValue
      const cumMeanBookValue = yearTradesCount > 0 ? yearWonBookSum / yearTradesCount : 0

      // 장부환율 (원화장부 / 외화장부)
      let bookFxRate: number | undefined
      if (isForeign && cumForeignBookValue > 0) {
        const mult = getFxRateMultiplier(currency)
        bookFxRate = Number(((cumWonBookValue / cumForeignBookValue) * mult).toFixed(4))
      }

      records.push({
        계좌: t.계좌,
        종목코드: t.종목코드,
        종목명: t.종목명,
        상품명: masterMap.get(`${t.계좌}_${t.종목코드}`)?.상품명 || t.종목명,
        통화: t.통화,
        거래일자: t.거래일자,
        수익: cumRevenueYear,
        비용: cumCostYear,
        실현손익: cumRealizedYear,
        보유수량: cumQuantity,
        장부금액: cumWonBookValue,
        평잔: cumMeanBookValue,
        자산군: assetClass,
        세부자산군: assetClass1,
        세부자산군2: assetClass2,
        외화장부금액: isForeign ? cumForeignBookValue : undefined,
        외화실현손익: isForeign ? cumForeignRealizedYear : undefined,
        외화매입단가: isForeign && cumQuantity > 0 ? cumForeignBookValue / cumQuantity : undefined,
        장부환율: bookFxRate,
      })
    }
  }

  // 2단계: 현금성 예수금 자동 누적 집계 (원화 10개 계좌 + 외화 3개 계좌)
  const recordMap = new Map<string, BalanceSheetRecord>()
  for (const r of records) {
    recordMap.set(`${r.계좌}_${r.종목코드}_${r.거래일자}`, r)
  }

  // 2-1. 원화예수금 10개 종목 통합 맵핑
  const wonCashMappings: Record<string, string> = {
    한투: '한투예수금',
    불리오: '불리오원화예수금',
    한투ISA: '한투ISA예수금',
    엔투ISA: '엔투ISA예수금',
    금현물: '금현물계좌현금',
    농협IRP: '농협IRP현금',
    미래DC: '미래DC현금',
    엔투저축연금: '엔투지영현금',
    한투연금저축: '한투연금현금',
    엔투IRP: '엔투IRP현금',
  }

  const wonTrades = dailyTrades.filter((d) => d.통화 === '원화')
  const wonCashByDateAcct = new Map<string, number>()
  for (const t of wonTrades) {
    const dKey = `${t.거래일자}_${t.계좌}`
    const netCash = (t.현금수입 || 0) + (t.입출금 || 0) - (t.현금지출 || 0)
    wonCashByDateAcct.set(dKey, (wonCashByDateAcct.get(dKey) || 0) + netCash)
  }

  const allDates = Array.from(new Set(dailyTrades.map((t) => t.거래일자))).sort()

  for (const [targetAcct, itemName] of Object.entries(wonCashMappings)) {
    // 해당 계좌_종목코드 찾기
    const targetMaster = astMasters.find((m) => m.계좌 === targetAcct && (m.종목명 === itemName || m.상품명 === itemName))
    if (!targetMaster) continue

    let cumAcctCash = 0
    let currentY = -1
    let countY = 0
    let sumCashY = 0

    for (const d of allDates) {
      const dKey = `${d}_${targetAcct}`
      const flow = wonCashByDateAcct.get(dKey) || 0
      cumAcctCash += flow

      const y = getYear(parseISO(d))
      if (y !== currentY) {
        currentY = y
        countY = 0
        sumCashY = 0
      }
      countY++
      sumCashY += cumAcctCash
      const meanCash = countY > 0 ? sumCashY / countY : 0

      const rec = recordMap.get(`${targetAcct}_${targetMaster.종목코드}_${d}`)
      if (rec) {
        rec.장부금액 = cumAcctCash
        rec.평잔 = meanCash
      }
    }
  }

  // 2-2. 외화예수금 3개 종목 의제 매입/매도 및 실현 환차손익 자동 계산
  const foreignCashMappings: Array<{ 계좌: string; 종목명: string; 통화: string }> = [
    { 계좌: '불리오', 종목명: '불리오달러', 통화: '달러' },
    { 계좌: '한투', 종목명: '직접운용달러', 통화: '달러' },
    { 계좌: '한투', 종목명: '직접운용엔', 통화: '엔화' },
  ]

  for (const fc of foreignCashMappings) {
    const targetMaster = astMasters.find((m) => m.계좌 === fc.계좌 && (m.종목명 === fc.종목명 || m.상품명 === fc.종목명))
    if (!targetMaster) continue

    // 해당 계좌 & 통화 거래만 필터 (외화예수금 자체의 단순 거래는 제외하고 타 종목의 현금흐름으로 집계)
    const acctFxTrades = dailyTrades.filter((d) => d.계좌 === fc.계좌 && d.통화 === fc.통화)
    if (acctFxTrades.length === 0) continue

    let cumFxCash = 0         // 외화 원단위 잔액
    let cumWonCashBook = 0     // 원화 환산 장부금액
    let cumRealizedFxGain = 0  // 누적 실현 환차손익

    let currentY = -1
    let countY = 0
    let sumCashY = 0

    // 일자별 순회 (당일 외화 순유출입 Netting 적용 후 일자별 반영하여 일중 순서에 의한 음수 왜곡 방지)
    for (const d of allDates) {
      const dayTrades = acctFxTrades.filter((t) => t.거래일자 === d)

      let netFxFlow = 0
      let activeRate = lastKnownRates[fc.통화] || 1

      for (const t of dayTrades) {
        const flow = (t.현금수입 || 0) + (t.입출금 || 0) - (t.현금지출 || 0)
        netFxFlow += flow
        if (t.환율 && t.환율 > 0) {
          activeRate = t.환율
        }
      }

      if (netFxFlow !== 0) {
        if (netFxFlow > 0) {
          // 외화 유입: 당일 환율로 외화예수금 자동 매입
          const wonIn = convertToKRW(netFxFlow, fc.통화, activeRate)
          cumFxCash += netFxFlow
          cumWonCashBook += wonIn
        } else {
          // 외화 유출 (netFxFlow < 0): 이동평균 장부환율로 원가 차감 및 환차손익 실현
          const outFx = Math.abs(netFxFlow)
          const mult = getFxRateMultiplier(fc.통화)
          const avgRate = cumFxCash > 0 ? (cumWonCashBook / cumFxCash) * mult : activeRate
          const wonCost = Math.round((outFx * avgRate) / mult)
          const wonActualValue = convertToKRW(outFx, fc.통화, activeRate)
          const realizedFx = wonActualValue - wonCost // 처분 환율 차이

          cumFxCash += netFxFlow
          if (cumFxCash <= 0.0001) {
            cumWonCashBook = 0
            cumFxCash = 0
          } else {
            cumWonCashBook = Math.max(0, cumWonCashBook - wonCost)
          }
          cumRealizedFxGain += realizedFx
        }
      }

      const y = getYear(parseISO(d))
      if (y !== currentY) {
        currentY = y
        countY = 0
        sumCashY = 0
        cumRealizedFxGain = 0
      }
      countY++
      sumCashY += cumWonCashBook
      const meanCash = countY > 0 ? sumCashY / countY : 0

      const rec = recordMap.get(`${fc.계좌}_${targetMaster.종목코드}_${d}`)
      if (rec) {
        rec.장부금액 = cumWonCashBook
        rec.평잔 = meanCash
        rec.실현손익 = cumRealizedFxGain
        rec.외화장부금액 = cumFxCash
        const mult = getFxRateMultiplier(fc.통화)
        rec.장부환율 = cumFxCash > 0 ? Number(((cumWonCashBook / cumFxCash) * mult).toFixed(4)) : undefined
      }
    }
  }

  return records
}
