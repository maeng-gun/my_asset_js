import {
  AssetMaster,
  BalanceSheetRecord,
  CommodityHoldingSummary,
  AccountAllocationItem,
  AssetClassProfitRecord,
  AccountProfitRecord,
  DetailedCommodityProfitRecord,
  DetailedCommodityProfit2Record,
  CommodityHolding3Record,
  ForeignHoldingRecord,
  ALLOCATION_ACCOUNTS,
  ACCOUNT_ORDER,
} from './types'
export { ACCOUNT_ORDER }
import { convertToKRW, getFxRateMultiplier } from './bookkeeping'

export const CURRENCY_ORDER = ['원화', '달러', '엔화']

export const CLASS_ORDER = [
  '<합계>',
  '',
  '주식',
  '대체자산',
  '채권',
  '현금성',
  '외화자산',
]

export const CLASS2_ORDER = [
  '',
  '선진국',
  '국내',
  '신흥국',
  '실물자산',
  '인컴자산',
  '상품',
  '부동산인프라',
  '만기보유',
  '시장형',
  '국채',
  '투자등급',
  '하이일드',
  '만기무위험',
  '만기회사채',
  '금융상품',
  '현금',
  '달러자산',
  '엔화자산',
]

export const CLASS3_ORDER = [
  '',
  '인덱스',
  '종목',
  '테마',
  '귀금속',
  '원자재',
  '에너지',
  '국내',
  '해외',
  '안전자산',
  '크레딧',
  '부동산',
  '인프라',
  '선진국',
  '신흥국',
  '단기채',
  '단기자금',
  '원화상품',
  '단기ETF',
  '외화상품',
  '원화',
  '외환',
  '외화',
  '달러',
  '엔화',
]

export const DETAIL_CLASS_ORDER = [
  '국내주식',
  '해외주식',
  '만기보유채권',
  '시장형채권',
  '실물자산',
  '인컴자산',
]

export const COMMODITY_GROUP_ORDER = [
  '해외주식',
  '선진국',
  '신흥국',
  '단기ETF',
  '원화상품',
  '외화상품',
  '외환',
  '원화',
]

/**
 * 당일 재무상태표 및 손익계산서 평가 (외화 시세 원화환산 통합 평가)
 */
export function evaluateBalanceSheet(
  todayRecords: BalanceSheetRecord[],
  masterList: AssetMaster[],
  closingPricesMap: Map<string, number>,
  exchangeRates: { USD: number; JPY: number },
  ovsBalances: Array<{ 종목코드: string; 평가금액: number }> = [],
  prevUnitPriceMap?: Map<string, number>
): BalanceSheetRecord[] {
  const masterMap = new Map<string, AssetMaster>()
  for (const m of masterList) {
    const key = `${m.계좌}_${m.종목코드}`
    const existing = masterMap.get(key)
    if (existing && (existing.평가금액 || 0) > 0 && (!m.평가금액 || m.평가금액 === 0)) {
      masterMap.set(key, { ...m, 평가금액: existing.평가금액 || 0 })
    } else {
      masterMap.set(key, m)
    }
  }

  const ovsMap = new Map<string, number>()
  for (const o of ovsBalances) {
    ovsMap.set(`불리오_${o.종목코드}`, o.평가금액)
  }

  const result: BalanceSheetRecord[] = []

  for (const r of todayRecords) {
    // 평잔 > 0.02 필터
    if (r.평잔 <= 0.02) continue

    const master = masterMap.get(`${r.계좌}_${r.종목코드}`)
    const lastEvalProfit = master?.기초평가손익 || 0
    const masterEvalAmt = master?.평가금액 || 0
    const ovsEvalAmt = ovsMap.get(`${r.계좌}_${r.종목코드}`) || 0

    const closingPrice = closingPricesMap.get(r.종목코드)
    const prevPrice =
      prevUnitPriceMap?.get(`${r.계좌}_${r.종목코드}`) ??
      prevUnitPriceMap?.get(r.종목코드) ??
      (prevUnitPriceMap ? prevUnitPriceMap.get(r.종목명) : undefined)

    const isStockOrFund = /^\d[a-zA-Z0-9]{4}\d$/.test(r.종목코드) || r.종목코드.startsWith('K5')
    const isGold = r.계좌 === '금현물' || r.종목코드 === '04020000'
    const isOvsMarket = (r.계좌 === '불리오' || r.계좌 === '한투') && r.통화 !== '원화' && r.자산군 !== '현금성'
    const isMarketPriced = isStockOrFund || isGold || isOvsMarket

    const isForeign = r.통화 !== '원화'
    const currentFxRate = isForeign ? (r.통화 === '달러' ? exchangeRates.USD : exchangeRates.JPY) : 1

    let foreignEvalAmt = 0
    let wonEvalAmt = 0

    if (!isForeign) {
      // [원화 종목]
      const bookAmt = r.장부금액 < 1 ? 0 : r.장부금액
      wonEvalAmt = bookAmt

      if (masterEvalAmt > 0) {
        wonEvalAmt = masterEvalAmt
      } else if (isMarketPriced && closingPrice !== undefined && closingPrice !== null && !isNaN(closingPrice) && closingPrice > 0) {
        wonEvalAmt = closingPrice * r.보유수량
      } else if (isMarketPriced && r.보유수량 === 0) {
        wonEvalAmt = 0
      } else if (isMarketPriced && r.보유수량 > 0 && prevPrice !== undefined && prevPrice > 0) {
        wonEvalAmt = prevPrice * r.보유수량
      }
    } else {
      // [외화 종목]
      const foreignBook = r.외화장부금액 || 0
      foreignEvalAmt = foreignBook

      if (ovsEvalAmt > 0) {
        foreignEvalAmt = ovsEvalAmt
      } else if (masterEvalAmt > 0) {
        foreignEvalAmt = masterEvalAmt
      } else if (isMarketPriced && closingPrice !== undefined && closingPrice !== null && !isNaN(closingPrice) && closingPrice > 0) {
        foreignEvalAmt = closingPrice * r.보유수량
      } else if (isMarketPriced && r.보유수량 === 0) {
        foreignEvalAmt = 0
      } else if (isMarketPriced && r.보유수량 > 0 && prevPrice !== undefined && prevPrice > 0) {
        foreignEvalAmt = prevPrice * r.보유수량
      }

      // 외화평가금액 -> 원화 환산
      wonEvalAmt = convertToKRW(foreignEvalAmt, r.통화, currentFxRate)
    }

    const evalAmt = wonEvalAmt
    const evalProfit = evalAmt - r.장부금액
    const evalProfitChange = evalProfit - lastEvalProfit
    const totalProfit = r.실현손익 + evalProfitChange

    const foreignEvalProfit = isForeign ? foreignEvalAmt - (r.외화장부금액 || 0) : undefined

    result.push({
      ...r,
      장부금액: r.장부금액,
      기초평가손익: lastEvalProfit,
      평가금액: evalAmt,
      평가손익: evalProfit,
      평가손익증감: evalProfitChange,
      총손익: totalProfit,
      외화평가금액: isForeign ? foreignEvalAmt : undefined,
      외화평가손익: foreignEvalProfit,
      현재환율: isForeign ? currentFxRate : undefined,
    })
  }

  // 정렬 (-통화, -평가금액)
  result.sort((a, b) => {
    if (a.통화 !== b.통화) return b.통화.localeCompare(a.통화)
    return (b.평가금액 || 0) - (a.평가금액 || 0)
  })

  return result
}

/**
 * 상품별/자산군별 계층형 집계 (t_comm, t_comm2, t_comm10, holdings, asset_ratio)
 * 및 신규 외화기준 보유현황(t_ovs_comm) 산출
 */
export function computeCommodityHoldings(
  evaluatedRecords: BalanceSheetRecord[],
  exchangeRates: { USD: number; JPY: number }
) {
  // 1. 종목코드별 합산 (df0) - 모든 종목이 이미 원화 환산 장부/평가금액을 가짐
  const byCode = new Map<string, {
    통화: string
    자산군: string
    세부자산군: string
    세부자산군2: string
    상품명: string
    보유수량: number
    장부금액: number
    평가금액: number
  }>()

  for (const r of evaluatedRecords) {
    if (r.장부금액 === 0 && (r.평가금액 || 0) === 0) continue
    const key = r.종목코드
    if (!byCode.has(key)) {
      byCode.set(key, {
        통화: r.통화,
        자산군: r.자산군,
        세부자산군: r.세부자산군,
        세부자산군2: r.세부자산군2,
        상품명: r.상품명 || r.종목명,
        보유수량: 0,
        장부금액: 0,
        평가금액: 0,
      })
    }
    const item = byCode.get(key)!
    item.보유수량 += r.보유수량
    item.장부금액 += r.장부금액
    item.평가금액 += r.평가금액 || 0
  }

  const df0 = Array.from(byCode.values())

  // 전체 합계 (<합계>)
  const totalBook = df0.reduce((acc, c) => acc + c.장부금액, 0)
  const totalEval = df0.reduce((acc, c) => acc + c.평가금액, 0)
  const df2 = {
    자산군: '<합계>',
    세부자산군: '',
    세부자산군2: '',
    상품명: '',
    보유수량: 0,
    장부금액: totalBook,
    평가금액: totalEval,
  }

  // 자산군별 소계 (df3)
  const df3Map = new Map<string, { 장부금액: number; 평가금액: number }>()
  for (const d of df0) {
    const current = df3Map.get(d.자산군) || { 장부금액: 0, 평가금액: 0 }
    df3Map.set(d.자산군, {
      장부금액: current.장부금액 + d.장부금액,
      평가금액: current.평가금액 + d.평가금액,
    })
  }
  const df3 = Array.from(df3Map.entries()).map(([k, v]) => ({
    자산군: k,
    세부자산군: '',
    세부자산군2: '',
    상품명: '',
    보유수량: 0,
    장부금액: v.장부금액,
    평가금액: v.평가금액,
  }))

  // 자산군 x 세부자산군 소계 (df4)
  const df4Map = new Map<string, { 자산군: string; 세부자산군: string; 장부금액: number; 평가금액: number }>()
  for (const d of df0) {
    const k = `${d.자산군}_${d.세부자산군}`
    const current = df4Map.get(k) || { 자산군: d.자산군, 세부자산군: d.세부자산군, 장부금액: 0, 평가금액: 0 }
    df4Map.set(k, {
      ...current,
      장부금액: current.장부금액 + d.장부금액,
      평가금액: current.평가금액 + d.평가금액,
    })
  }
  const df4 = Array.from(df4Map.values()).map((v) => ({
    자산군: v.자산군,
    세부자산군: v.세부자산군,
    세부자산군2: '',
    상품명: '',
    보유수량: 0,
    장부금액: v.장부금액,
    평가금액: v.평가금액,
  }))

  // 자산군 x 세부자산군 x 세부자산군2 소계 (df5)
  const df5Map = new Map<string, { 자산군: string; 세부자산군: string; 세부자산군2: string; 장부금액: number; 평가금액: number }>()
  for (const d of df0) {
    const k = `${d.자산군}_${d.세부자산군}_${d.세부자산군2}`
    const current = df5Map.get(k) || { 자산군: d.자산군, 세부자산군: d.세부자산군, 세부자산군2: d.세부자산군2, 장부금액: 0, 평가금액: 0 }
    df5Map.set(k, {
      ...current,
      장부금액: current.장부금액 + d.장부금액,
      평가금액: current.평가금액 + d.평가금액,
    })
  }
  const df5 = Array.from(df5Map.values()).map((v) => ({
    자산군: v.자산군,
    세부자산군: v.세부자산군,
    세부자산군2: v.세부자산군2,
    상품명: '',
    보유수량: 0,
    장부금액: v.장부금액,
    평가금액: v.평가금액,
  }))

  // 전체 t_comm 결합 (임시 '환차손익' 행은 개별 종목에 직접 반영되었으므로 완전 폐지)
  const combinedHoldings = [...df0, df2, ...df3, ...df4, ...df5]
  const tComm: CommodityHoldingSummary[] = combinedHoldings.map((h) => {
    const avgPrice = h.보유수량 > 0 ? Math.round(h.장부금액 / h.보유수량) : 0
    const curPrice = h.보유수량 > 0 ? Math.round(h.평가금액 / h.보유수량) : 0
    const evalProfit = Math.round(h.평가금액 - h.장부금액)
    const evalYield = h.장부금액 > 0 ? Number(((evalProfit / h.장부금액) * 100).toFixed(2)) : 0

    return {
      자산군: h.자산군,
      세부자산군: h.세부자산군,
      세부자산군2: h.세부자산군2,
      상품명: h.상품명,
      보유수량: h.보유수량,
      장부금액: h.장부금액,
      평가금액: h.평가금액,
      평단가: avgPrice,
      현재가: curPrice,
      평가손익: evalProfit,
      평가수익률: evalYield,
    }
  })

  tComm.sort((a, b) => {
    const cA = CLASS_ORDER.indexOf(a.자산군)
    const cB = CLASS_ORDER.indexOf(b.자산군)
    if (cA !== cB) return (cA === -1 ? 999 : cA) - (cB === -1 ? 999 : cB)

    const c2A = CLASS2_ORDER.indexOf(a.세부자산군)
    const c2B = CLASS2_ORDER.indexOf(b.세부자산군)
    if (c2A !== c2B) return (c2A === -1 ? 999 : c2A) - (c2B === -1 ? 999 : c2B)

    const c3A = CLASS3_ORDER.indexOf(a.세부자산군2)
    const c3B = CLASS3_ORDER.indexOf(b.세부자산군2)
    if (c3A !== c3B) return (c3A === -1 ? 999 : c3A) - (c3B === -1 ? 999 : c3B)

    if (b.평가금액 !== a.평가금액) return b.평가금액 - a.평가금액
    return a.상품명.localeCompare(b.상품명)
  })

  // holdings 스냅샷
  const holdingsRaw = tComm
    .filter((t) => t.상품명 && t.상품명 !== '' && t.자산군 !== '<합계>')
    .map((t) => ({
      ...t,
      세부자산군: t.세부자산군 || '',
      세부자산군2: t.세부자산군2 || '',
      상품명: t.상품명 || '',
    }))

  const holdingsMap = new Map<string, typeof holdingsRaw[0]>()
  for (const h of holdingsRaw) {
    const pk = `${h.자산군}|${h.세부자산군}|${h.세부자산군2}|${h.상품명}`
    const existing = holdingsMap.get(pk)
    if (existing) {
      existing.보유수량 += h.보유수량
      existing.장부금액 += h.장부금액
      existing.평가금액 += h.평가금액
      existing.평단가 = existing.보유수량 > 0 ? Math.round(existing.장부금액 / existing.보유수량) : 0
      existing.현재가 = existing.보유수량 > 0 ? Math.round(existing.평가금액 / existing.보유수량) : 0
      existing.평가손익 += h.평가손익
      existing.평가수익률 = existing.장부금액 > 0 ? Number(((existing.평가손익 / existing.장부금액) * 100).toFixed(2)) : 0
    } else {
      holdingsMap.set(pk, { ...h })
    }
  }
  const holdingsSnapshots = Array.from(holdingsMap.values())

  // t_comm2: 계좌별 그룹화 및 계좌 소계 행 포함
  const acctSubtotalsMap = new Map<string, { 장부금액: number; 평가금액: number }>()
  for (const r of evaluatedRecords) {
    const cur = acctSubtotalsMap.get(r.계좌) || { 장부금액: 0, 평가금액: 0 }
    cur.장부금액 += r.장부금액
    cur.평가금액 += r.평가금액 || 0
    acctSubtotalsMap.set(r.계좌, cur)
  }

  const acctSubtotals: Array<BalanceSheetRecord & { 평가수익률: number }> = Array.from(acctSubtotalsMap.entries()).map(
    ([acct, vals]) => {
      const evalProfit = vals.평가금액 - vals.장부금액
      const evalYield = vals.장부금액 > 0 ? Number(((evalProfit / vals.장부금액) * 100).toFixed(2)) : 0
      return {
        계좌: acct,
        종목코드: '',
        종목명: '',
        통화: '원화',
        거래일자: '',
        수익: 0,
        비용: 0,
        실현손익: 0,
        보유수량: 0,
        장부금액: vals.장부금액,
        평잔: 0,
        자산군: '',
        세부자산군: '',
        세부자산군2: '',
        평가금액: vals.평가금액,
        평가손익: evalProfit,
        평가수익률: evalYield,
      }
    }
  )

  const tComm2 = [
    ...evaluatedRecords.map((r) => {
      const evalAmt = r.평가금액 || 0
      const evalProfit = evalAmt - r.장부금액
      const evalYield = r.장부금액 > 0 ? Number(((evalProfit / r.장부금액) * 100).toFixed(2)) : 0
      return {
        ...r,
        장부금액: r.장부금액,
        평가금액: evalAmt,
        평가손익: evalProfit,
        평가수익률: evalYield,
      }
    }),
    ...acctSubtotals,
  ]

  tComm2.sort((a, b) => {
    const aIdx = ACCOUNT_ORDER.indexOf(a.계좌)
    const bIdx = ACCOUNT_ORDER.indexOf(b.계좌)
    if (aIdx !== bIdx) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)

    const cA = CLASS_ORDER.indexOf(a.자산군)
    const cB = CLASS_ORDER.indexOf(b.자산군)
    if (cA !== cB) return (cA === -1 ? 999 : cA) - (cB === -1 ? 999 : cB)

    const c2A = CLASS2_ORDER.indexOf(a.세부자산군)
    const c2B = CLASS2_ORDER.indexOf(b.세부자산군)
    if (c2A !== c2B) return (c2A === -1 ? 999 : c2A) - (c2B === -1 ? 999 : c2B)

    if (b.평가수익률 !== a.평가수익률) return b.평가수익률 - a.평가수익률
    return a.종목명.localeCompare(b.종목명)
  })

  // t_comm10 (엑셀 복사용)
  const tComm10: CommodityHolding3Record[] = evaluatedRecords
    .filter((r) => r.종목명 && r.장부금액 !== 0)
    .map((r) => {
      const evalAmt = r.평가금액 || 0
      const evalProfit = evalAmt - r.장부금액
      const evalYield = r.장부금액 > 0 ? Number(((evalProfit / r.장부금액) * 100).toFixed(2)) : 0
      return {
        자산군: r.자산군,
        세부자산군: r.세부자산군,
        세부자산군2: r.세부자산군2,
        상품명: r.상품명 || r.종목명,
        평가금액: evalAmt,
        평가손익: evalProfit,
        평가수익률: evalYield,
        계좌: r.계좌,
      }
    })

  tComm10.sort((a, b) => {
    const cA = CLASS_ORDER.indexOf(a.자산군)
    const cB = CLASS_ORDER.indexOf(b.자산군)
    if (cA !== cB) return (cA === -1 ? 999 : cA) - (cB === -1 ? 999 : cB)

    const c2A = CLASS2_ORDER.indexOf(a.세부자산군)
    const c2B = CLASS2_ORDER.indexOf(b.세부자산군)
    if (c2A !== c2B) return (c2A === -1 ? 999 : c2A) - (c2B === -1 ? 999 : c2B)

    const aIdx = ACCOUNT_ORDER.indexOf(a.계좌)
    const bIdx = ACCOUNT_ORDER.indexOf(b.계좌)
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
  })

  // 2. 신규: 외화기준 보유현황 산출 (t_ovs_comm)
  const tOvsComm: ForeignHoldingRecord[] = evaluatedRecords
    .filter((r) => r.통화 !== '원화' && ((r.외화장부금액 || 0) > 0 || (r.외화평가금액 || 0) > 0 || r.보유수량 > 0))
    .map((r) => {
      const fxBook = r.외화장부금액 || 0
      const fxEval = r.외화평가금액 || 0
      const fxProfit = r.외화평가손익 || (fxEval - fxBook)
      const fxYield = fxBook > 0 ? Number(((fxProfit / fxBook) * 100).toFixed(2)) : 0

      const wonBook = r.장부금액
      const wonEval = r.평가금액 || 0
      const wonProfit = r.평가손익 || (wonEval - wonBook)
      const wonYield = wonBook > 0 ? Number(((wonProfit / wonBook) * 100).toFixed(2)) : 0

      const buyUnitPrice = r.보유수량 > 0 && fxBook > 0 ? Number((fxBook / r.보유수량).toFixed(2)) : 0
      const curUnitPrice = r.보유수량 > 0 && fxEval > 0 ? Number((fxEval / r.보유수량).toFixed(2)) : 0

      const curRate = r.현재환율 || (r.통화 === '달러' ? exchangeRates.USD : exchangeRates.JPY)
      const bookRate = r.장부환율 || 0

      return {
        계좌: r.계좌,
        자산군: r.자산군,
        세부자산군: r.세부자산군,
        세부자산군2: r.세부자산군2,
        종목코드: r.종목코드,
        종목명: r.종목명,
        상품명: r.상품명 || r.종목명,
        통화: r.통화,
        보유수량: r.보유수량,
        외화매입단가: buyUnitPrice,
        외화현재가: curUnitPrice,
        외화장부금액: fxBook,
        외화평가금액: fxEval,
        외화평가손익: fxProfit,
        외화수익률: fxYield,
        원화환산장부금액: wonBook,
        원화환산평가금액: wonEval,
        원화환산평가손익: wonProfit,
        원화수익률: wonYield,
        장부환율: bookRate,
        현재환율: curRate,
      }
    })

  tOvsComm.sort((a, b) => {
    if (a.통화 !== b.통화) return a.통화.localeCompare(b.통화)
    return b.외화평가금액 - a.외화평가금액
  })

  return { tComm, tComm2, tComm10, tOvsComm, holdingsSnapshots }
}

/**
 * 계좌별 자산배분 피벗 집계 (compute_allo)
 */
export function computeAccountAllocation(
  tComm2Records: Array<BalanceSheetRecord & { 평가수익률: number }>,
  groupsMaster: Array<{ 자산군: string; 세부자산군: string; 세부자산군2: string }>
): AccountAllocationItem[] {
  const normalRecords = tComm2Records.filter(
    (r) => r.종목코드 && r.종목코드 !== '' && r.자산군 && r.자산군 !== ''
  )

  const pivotedMap = new Map<string, Record<string, number>>()

  for (const r of normalRecords) {
    const astClass = r.자산군
    const k = `${astClass}_${r.세부자산군 || ''}_${r.세부자산군2 || ''}`
    const cur = pivotedMap.get(k) || {}
    cur[r.계좌] = (cur[r.계좌] || 0) + (r.평가금액 || 0)
    pivotedMap.set(k, cur)
  }

  const result: AccountAllocationItem[] = []

  // Exclude any pre-existing summary/total row from groupsMaster
  const validGroups = groupsMaster.filter(
    (g) => g.자산군 !== '합계' && g.자산군 !== '<합계>'
  )

  for (const g of validGroups) {
    const k = `${g.자산군}_${g.세부자산군 || ''}_${g.세부자산군2 || ''}`
    const acctVals = pivotedMap.get(k) || {}

    let rowSum = 0
    const rowItem: AccountAllocationItem = {
      자산군: g.자산군,
      세부자산군: g.세부자산군 || '',
      세부자산군2: g.세부자산군2 || '',
      합계: 0,
      비중: 0,
    }

    for (const a of ALLOCATION_ACCOUNTS) {
      const v = acctVals[a] || 0
      ;(rowItem as unknown as Record<string, string | number>)[a] = v
      rowSum += v
    }
    rowItem.합계 = rowSum
    rowItem.비중 = 0
    result.push(rowItem)
  }

  const grandTotal = result.reduce((acc, r) => acc + (r.합계 || 0), 0)

  for (const r of result) {
    r.비중 = grandTotal > 0 ? Number(((r.합계 / grandTotal) * 100).toFixed(2)) : 0
  }

  // <합계> 종합 행 추가
  const totalRow: AccountAllocationItem = {
    자산군: '<합계>',
    세부자산군: '',
    세부자산군2: '',
    합계: grandTotal,
    비중: 100.0,
  }

  for (const a of ALLOCATION_ACCOUNTS) {
    const colSum = result.reduce(
      (acc, r) => acc + (Number((r as unknown as Record<string, number>)[a]) || 0),
      0
    )
    ;(totalRow as unknown as Record<string, number>)[a] = colSum
  }

  result.push(totalRow)

  return result
}

/**
 * t_comm3 (자산군별 손익) 및 t_comm4 (계좌별 손익) 산출
 */
export function computeAssetProfit(
  evaluatedRecords: BalanceSheetRecord[]
): {
  tComm3: AssetClassProfitRecord[]
  tComm4: AccountProfitRecord[]
  assetRatioSnapshots: Array<{ 자산군: string; 세부자산군: string; 세부자산군2: string; 평가금액: number; 비중: number }>
} {
  interface SumAccumulator {
    장부금액: number
    평잔: number
    비용: number
    평가금액: number
    평가손익: number
    실현손익: number
    평가손익증감: number
    총손익: number
  }

  const initAcc = (): SumAccumulator => ({
    장부금액: 0,
    평잔: 0,
    비용: 0,
    평가금액: 0,
    평가손익: 0,
    실현손익: 0,
    평가손익증감: 0,
    총손익: 0,
  })

  const addAcc = (acc: SumAccumulator, cur: BalanceSheetRecord) => {
    acc.장부금액 += cur.장부금액
    acc.평잔 += cur.평잔
    acc.비용 += cur.비용
    acc.평가금액 += cur.평가금액 || 0
    acc.평가손익 += cur.평가손익 || 0
    acc.실현손익 += cur.실현손익
    acc.평가손익증감 += cur.평가손익증감 || 0
    acc.총손익 += cur.총손익 || 0
  }

  // 1. tComm3 (자산군/세부자산군/세부자산군2별 소계 및 합계)
  const df2Map = new Map<string, { 자산군: string; 세부자산군: string; 세부자산군2: string; acc: SumAccumulator }>()
  const df3Map = new Map<string, { 자산군: string; 세부자산군: string; acc: SumAccumulator }>()
  const df4Map = new Map<string, { 자산군: string; acc: SumAccumulator }>()
  const df5Acc = initAcc()

  for (const r of evaluatedRecords) {
    addAcc(df5Acc, r)

    // df4 (자산군)
    const k4 = r.자산군
    const c4 = df4Map.get(k4) || { 자산군: r.자산군, acc: initAcc() }
    addAcc(c4.acc, r)
    df4Map.set(k4, c4)

    // df3 (자산군_세부자산군)
    const k3 = `${r.자산군}_${r.세부자산군}`
    const c3 = df3Map.get(k3) || { 자산군: r.자산군, 세부자산군: r.세부자산군, acc: initAcc() }
    addAcc(c3.acc, r)
    df3Map.set(k3, c3)

    // df2 (자산군_세부자산군_세부자산군2)
    const k2 = `${r.자산군}_${r.세부자산군}_${r.세부자산군2}`
    const c2 = df2Map.get(k2) || { 자산군: r.자산군, 세부자산군: r.세부자산군, 세부자산군2: r.세부자산군2, acc: initAcc() }
    addAcc(c2.acc, r)
    df2Map.set(k2, c2)
  }

  const buildProfitRow = (
    자산군: string,
    세부자산군: string,
    세부자산군2: string,
    acc: SumAccumulator
  ): AssetClassProfitRecord => {
    const costRate = acc.평잔 > 0 ? Number(((acc.비용 / acc.평잔) * 100).toFixed(2)) : 0
    const realYield = acc.평잔 > 0 ? Number(((acc.실현손익 / acc.평잔) * 100).toFixed(2)) : 0
    const evalYield = acc.평잔 > 0 ? Number(((acc.평가손익증감 / acc.평잔) * 100).toFixed(2)) : 0
    const totalYield = Number((realYield + evalYield).toFixed(2))

    return {
      자산군,
      세부자산군,
      세부자산군2,
      장부금액: acc.장부금액,
      평잔: acc.평잔,
      평가금액: acc.평가금액,
      평가손익: acc.평가손익,
      실현손익: acc.실현손익,
      평가손익증감: acc.평가손익증감,
      총손익: acc.총손익,
      비용률: costRate,
      실현수익률: realYield,
      평가증감률: evalYield,
      총수익률: totalYield,
    }
  }

  const tComm3: AssetClassProfitRecord[] = [
    buildProfitRow('<합계>', '', '', df5Acc),
    ...Array.from(df4Map.values()).map((v) => buildProfitRow(v.자산군, '', '', v.acc)),
    ...Array.from(df3Map.values()).map((v) => buildProfitRow(v.자산군, v.세부자산군, '', v.acc)),
    ...Array.from(df2Map.values()).map((v) => buildProfitRow(v.자산군, v.세부자산군, v.세부자산군2, v.acc)),
  ]

  tComm3.sort((a, b) => {
    const cA = CLASS_ORDER.indexOf(a.자산군)
    const cB = CLASS_ORDER.indexOf(b.자산군)
    if (cA !== cB) return (cA === -1 ? 999 : cA) - (cB === -1 ? 999 : cB)

    const c2A = CLASS2_ORDER.indexOf(a.세부자산군)
    const c2B = CLASS2_ORDER.indexOf(b.세부자산군)
    if (c2A !== c2B) return (c2A === -1 ? 999 : c2A) - (c2B === -1 ? 999 : c2B)

    const c3A = CLASS3_ORDER.indexOf(a.세부자산군2)
    const c3B = CLASS3_ORDER.indexOf(b.세부자산군2)
    return (c3A === -1 ? 999 : c3A) - (c3B === -1 ? 999 : c3B)
  })

  // 2. tComm4 (계좌별 및 계좌 x 자산군별 손익)
  const df7Map = new Map<string, { 계좌: string; 자산군: string; acc: SumAccumulator }>()
  const df8Map = new Map<string, { 계좌: string; acc: SumAccumulator }>()

  for (const r of evaluatedRecords) {
    const k8 = r.계좌
    const c8 = df8Map.get(k8) || { 계좌: r.계좌, acc: initAcc() }
    addAcc(c8.acc, r)
    df8Map.set(k8, c8)

    const k7 = `${r.계좌}_${r.자산군}`
    const c7 = df7Map.get(k7) || { 계좌: r.계좌, 자산군: r.자산군, acc: initAcc() }
    addAcc(c7.acc, r)
    df7Map.set(k7, c7)
  }

  const buildAccountProfitRow = (계좌: string, 자산군: string, acc: SumAccumulator): AccountProfitRecord => {
    const costRate = acc.평잔 > 0 ? Number(((acc.비용 / acc.평잔) * 100).toFixed(2)) : 0
    const realYield = acc.평잔 > 0 ? Number(((acc.실현손익 / acc.평잔) * 100).toFixed(2)) : 0
    const evalYield = acc.평잔 > 0 ? Number(((acc.평가손익증감 / acc.평잔) * 100).toFixed(2)) : 0
    const totalYield = Number((realYield + evalYield).toFixed(2))

    return {
      계좌,
      자산군,
      장부금액: acc.장부금액,
      평잔: acc.평잔,
      평가금액: acc.평가금액,
      평가손익: acc.평가손익,
      실현손익: acc.실현손익,
      평가손익증감: acc.평가손익증감,
      총손익: acc.총손익,
      비용률: costRate,
      실현수익률: realYield,
      평가증감률: evalYield,
      총수익률: totalYield,
    }
  }

  const tComm4: AccountProfitRecord[] = [
    ...Array.from(df8Map.values()).map((v) => buildAccountProfitRow(v.계좌, '', v.acc)),
    ...Array.from(df7Map.values()).map((v) => buildAccountProfitRow(v.계좌, v.자산군, v.acc)),
  ]

  tComm4.sort((a, b) => {
    const aIdx = ACCOUNT_ORDER.indexOf(a.계좌)
    const bIdx = ACCOUNT_ORDER.indexOf(b.계좌)
    if (aIdx !== bIdx) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)

    const cA = CLASS_ORDER.indexOf(a.자산군)
    const cB = CLASS_ORDER.indexOf(b.자산군)
    return (cA === -1 ? 999 : cA) - (cB === -1 ? 999 : cB)
  })

  // DB asset_ratio 테이블 적재
  const totalEvalAssetRatio = df5Acc.평가금액
  const assetRatioSnapshots = Array.from(df2Map.values()).map((v) => ({
    자산군: v.자산군,
    세부자산군: v.세부자산군 || '',
    세부자산군2: v.세부자산군2 || '',
    평가금액: v.acc.평가금액,
    비중: totalEvalAssetRatio > 0 ? Number(((v.acc.평가금액 / totalEvalAssetRatio) * 100).toFixed(2)) : 0,
  }))

  return { tComm3, tComm4, assetRatioSnapshots }
}

/**
 * comm_profit (계좌별 상품 손익) & comm_profit2 (자산군별 상품 손익)
 */
export function computeDetailedCommodityProfit(
  evaluatedRecords: BalanceSheetRecord[]
): {
  commProfit: DetailedCommodityProfitRecord[]
  commProfit2: DetailedCommodityProfit2Record[]
} {
  const buildRow = (r: BalanceSheetRecord) => {
    const costRate = r.평잔 > 0 ? Number(((r.비용 / r.평잔) * 100).toFixed(2)) : 0
    const realYield = r.평잔 > 0 ? Number(((r.실현손익 / r.평잔) * 100).toFixed(2)) : 0
    const evalYield = r.평잔 > 0 ? Number((((r.평가손익증감 || 0) / r.평잔) * 100).toFixed(2)) : 0
    const totalYield = Number((realYield + evalYield).toFixed(2))

    return {
      계좌: r.계좌,
      통화: r.통화,
      자산군: r.자산군,
      세부자산군: r.세부자산군,
      세부자산군2: r.세부자산군2,
      종목명: r.종목명,
      상품명: r.상품명 || r.종목명,
      보유수량: r.보유수량,
      장부금액: r.장부금액,
      평잔: r.평잔,
      평가금액: r.평가금액 || 0,
      평가손익: r.평가손익 || 0,
      실현손익: r.실현손익,
      평가손익증감: r.평가손익증감 || 0,
      총손익: r.총손익 || 0,
      비용률: costRate,
      실현수익률: realYield,
      평가증감률: evalYield,
      총수익률: totalYield,
    }
  }

  // 1. comm_profit (계좌, 통화, 자산군, 세부자산군, 세부자산군2, desc(평가금액))
  const commProfit: DetailedCommodityProfitRecord[] = evaluatedRecords.map(buildRow)
  commProfit.sort((a, b) => {
    const aIdx = ACCOUNT_ORDER.indexOf(a.계좌)
    const bIdx = ACCOUNT_ORDER.indexOf(b.계좌)
    if (aIdx !== bIdx) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)

    const curA = CURRENCY_ORDER.indexOf(a.통화)
    const curB = CURRENCY_ORDER.indexOf(b.통화)
    if (curA !== curB) return (curA === -1 ? 999 : curA) - (curB === -1 ? 999 : curB)

    const cA = CLASS_ORDER.indexOf(a.자산군)
    const cB = CLASS_ORDER.indexOf(b.자산군)
    if (cA !== cB) return (cA === -1 ? 999 : cA) - (cB === -1 ? 999 : cB)

    const c2A = CLASS2_ORDER.indexOf(a.세부자산군)
    const c2B = CLASS2_ORDER.indexOf(b.세부자산군)
    if (c2A !== c2B) return (c2A === -1 ? 999 : c2A) - (c2B === -1 ? 999 : c2B)

    return b.평가금액 - a.평가금액
  })

  // 2. comm_profit2 (자산군, 세부자산군, 세부자산군2, desc(평가금액), 계좌, 상품명)
  const commProfit2: DetailedCommodityProfit2Record[] = evaluatedRecords.map(buildRow)
  commProfit2.sort((a, b) => {
    const cA = CLASS_ORDER.indexOf(a.자산군)
    const cB = CLASS_ORDER.indexOf(b.자산군)
    if (cA !== cB) return (cA === -1 ? 999 : cA) - (cB === -1 ? 999 : cB)

    const c2A = CLASS2_ORDER.indexOf(a.세부자산군 || '')
    const c2B = CLASS2_ORDER.indexOf(b.세부자산군 || '')
    if (c2A !== c2B) return (c2A === -1 ? 999 : c2A) - (c2B === -1 ? 999 : c2B)

    const c3A = CLASS3_ORDER.indexOf(a.세부자산군2 || '')
    const c3B = CLASS3_ORDER.indexOf(b.세부자산군2 || '')
    if (c3A !== c3B) return (c3A === -1 ? 999 : c3A) - (c3B === -1 ? 999 : c3B)

    const evalDiff = (b.평가금액 || 0) - (a.평가금액 || 0)
    if (evalDiff !== 0) return evalDiff

    const aIdx = ACCOUNT_ORDER.indexOf(a.계좌 || '')
    const bIdx = ACCOUNT_ORDER.indexOf(b.계좌 || '')
    if (aIdx !== bIdx) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)

    return (a.상품명 || a.종목명 || '').localeCompare(b.상품명 || b.종목명 || '')
  })

  return { commProfit, commProfit2 }
}
