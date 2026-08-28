import { AssetMaster, DailyTradeRaw, DailyTradeProcessed, BalanceSheetRecord } from './types'
import { format, parseISO, getYear, eachDayOfInterval } from 'date-fns'

/**
 * R6 get_daily_trading 포팅
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
        매도원금: sellPrincipal,
        수익: revenue,
        비용: cost,
        실현손익: realizedProfit,
        현금수입: cashIn,
        입출금: inOut,
        현금지출: buyCash,
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
 * R6 get_bs_pl 포팅
 * 누적 보유수량, 누적 장부금액, 연도별 평잔 및 누적 실현손익 산출
 */
export function getBalanceSheet(
  mode: 'assets' | 'pension',
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

  // 종목별 시계열 누적 계산
  for (const [key, trades] of grouped.entries()) {
    // 날짜 오름차순 정렬 보장
    trades.sort((a, b) => a.거래일자.localeCompare(b.거래일자))

    let cumQuantity = 0
    let cumBookValue = 0

    let currentYear = -1
    let yearTradesCount = 0
    let yearBookValueSum = 0
    let cumRevenueYear = 0
    let cumCostYear = 0
    let cumRealizedYear = 0

    const itemMaster = masterMap.get(key)
    const assetClass = itemMaster?.자산군 || ''
    const assetClass1 = itemMaster?.세부자산군 || ''
    const assetClass2 = itemMaster?.세부자산군2 || ''

    for (const t of trades) {
      cumQuantity += t.순매입수량
      cumBookValue += t.매입액 - t.매도원금

      const tYear = getYear(parseISO(t.거래일자))
      if (tYear !== currentYear) {
        currentYear = tYear
        yearTradesCount = 0
        yearBookValueSum = 0
        cumRevenueYear = 0
        cumCostYear = 0
        cumRealizedYear = 0
      }

      yearTradesCount++
      yearBookValueSum += cumBookValue
      const cumMeanBookValue = yearTradesCount > 0 ? yearBookValueSum / yearTradesCount : 0

      cumRevenueYear += t.수익
      cumCostYear += t.비용
      cumRealizedYear += t.실현손익

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
        장부금액: cumBookValue,
        평잔: cumMeanBookValue,
        자산군: assetClass,
        세부자산군: assetClass1,
        세부자산군2: assetClass2,
      })
    }
  }

  // 현금성 예수금 잔액/평잔 맵핑 (mode == 'assets'인 경우)
  if (mode === 'assets') {
    const cashMappings: Record<string, Record<string, string>> = {
      원화: {
        엔투ISA예수금: '엔투ISA',
        한투예수금: '한투',
        한투ISA예수금: '한투ISA',
        금현물계좌현금: '금현물',
      },
      달러: {
        불리오달러: '불리오',
        직접운용달러: '한투',
      },
      엔화: {
        직접운용엔: '한투',
      },
    }

    // 각 통화별 일자/계좌별 순현금흐름 누적 계산
    for (const [cur, cmap] of Object.entries(cashMappings)) {
      const curTrades = dailyTrades.filter((d) => d.통화 === cur)
      if (curTrades.length === 0) continue

      // 일자 x 계좌별 현금 = sum(현금수입 + 입출금 - 현금지출)
      const cashByDateAcct = new Map<string, number>()
      for (const t of curTrades) {
        const dKey = `${t.거래일자}_${t.계좌}`
        const netCash = t.현금수입 + t.입출금 - t.현금지출
        cashByDateAcct.set(dKey, (cashByDateAcct.get(dKey) || 0) + netCash)
      }

      // 일자별 누적
      const dates = Array.from(new Set(curTrades.map((t) => t.거래일자))).sort()
      const accts = Array.from(new Set(curTrades.map((t) => t.계좌)))

      for (const [itemName, targetAcct] of Object.entries(cmap)) {
        if (!accts.includes(targetAcct)) continue

        let cumAcctCash = 0
        let currentY = -1
        let countY = 0
        let sumCashY = 0

        for (const d of dates) {
          const dKey = `${d}_${targetAcct}`
          const flow = cashByDateAcct.get(dKey) || 0
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

          // 해당 itemName 레코드 업데이트
          const rec = records.find((r) => r.종목명 === itemName && r.거래일자 === d)
          if (rec) {
            rec.장부금액 = cumAcctCash
            rec.평잔 = meanCash
          }
        }
      }
    }
  }

  return records
}
