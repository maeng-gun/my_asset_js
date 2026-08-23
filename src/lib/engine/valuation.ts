import {
  AssetMaster,
  BalanceSheetRecord,
  CommodityHoldingSummary,
  AssetClassProfitRecord,
  AccountProfitRecord,
  DetailedCommodityProfitRecord,
  DetailedCommodityProfit2Record,
  CommodityHolding3Record,
  AccountAllocationItem,
} from './types'

export const ACCOUNT_ORDER = [
  '한투',
  '불리오',
  '엔투하영',
  '금현물',
  '한투ISA',
  '엔투ISA',
  '엔투저축연금',
  '한투연금저축',
  '미래DC',
  '농협IRP',
  '엔투IRP',
]

export const ALLOCATION_ACCOUNTS = [
  '한투연금저축',
  '엔투저축연금',
  '미래DC',
  '엔투IRP',
  '농협IRP',
  '엔투ISA',
  '한투ISA',
  '엔투하영',
  '불리오',
  '금현물',
  '한투',
]

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
  '단기ETF',
  '원화상품',
  '외화상품',
  '외환',
  '원화',
]

/**
 * R6 evaluate_bs_pl_assets / evaluate_bs_pl_pension 포팅
 */
export function evaluateBalanceSheet(
  mode: 'assets' | 'pension',
  todayRecords: BalanceSheetRecord[],
  masterList: AssetMaster[],
  closingPricesMap: Map<string, number>,
  exchangeRates: { USD: number; JPY: number },
  ovsBalances: Array<{ 종목코드: string; 평가금액: number }> = []
): BalanceSheetRecord[] {
  const masterMap = new Map<string, AssetMaster>()
  for (const m of masterList) {
    masterMap.set(`${m.계좌}_${m.종목코드}`, m)
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

    let bookAmt = r.장부금액 < 1 ? 0 : r.장부금액
    let evalAmt = bookAmt

    if (ovsEvalAmt > 0) {
      evalAmt = ovsEvalAmt
    } else if (masterEvalAmt > 0) {
      evalAmt = masterEvalAmt
    } else if (closingPrice !== undefined && closingPrice !== null && !isNaN(closingPrice)) {
      evalAmt = closingPrice * r.보유수량
    }

    result.push({
      ...r,
      장부금액: bookAmt,
      기초평가손익: lastEvalProfit,
      평가금액: evalAmt,
    })
  }

  // 달러자산 / 엔화자산 원화 환산 처리 (투자자산)
  if (mode === 'assets') {
    const dollarEvalSum = result
      .filter((r) => r.통화 === '달러')
      .reduce((acc, cur) => acc + (cur.평가금액 || 0), 0)
    const yenEvalSum = result
      .filter((r) => r.통화 === '엔화')
      .reduce((acc, cur) => acc + (cur.평가금액 || 0), 0)

    const dollarWon = Math.round(dollarEvalSum * exchangeRates.USD)
    const yenWon = Math.round(yenEvalSum * exchangeRates.JPY)

    for (const r of result) {
      if (r.종목명 === '달러자산') {
        r.평가금액 = dollarWon
      } else if (r.종목명 === '엔화자산') {
        r.평가금액 = yenWon
      }
    }
  }

  // 평가손익, 평가손익증감, 총손익 계산
  for (const r of result) {
    const evalAmt = r.평가금액 || 0
    const evalProfit = evalAmt - r.장부금액
    const lastEvalProfit = r.기초평가손익 || 0
    const evalProfitChange = evalProfit - lastEvalProfit
    const totalProfit = r.실현손익 + evalProfitChange

    r.평가손익 = evalProfit
    r.평가손익증감 = evalProfitChange
    r.총손익 = totalProfit
  }

  // 정렬 (-통화, -평가금액)
  result.sort((a, b) => {
    if (a.통화 !== b.통화) return b.통화.localeCompare(a.통화)
    return (b.평가금액 || 0) - (a.평가금액 || 0)
  })

  return result
}

/**
 * R6 compute_total 포팅
 * 상품별/자산군별 계층형 집계 (t_comm, t_comm2, t_comm10, holdings, asset_ratio)
 */
export function computeCommodityHoldings(
  evaluatedAssets: BalanceSheetRecord[],
  evaluatedPension: BalanceSheetRecord[],
  exchangeRates: { USD: number; JPY: number }
) {
  // 원화 환산 통합 레코드 생성
  const combinedRaw: Array<BalanceSheetRecord & { 통화원화환산장부금액: number; 통화원화환산평가금액: number }> = []

  for (const a of evaluatedAssets) {
    let bookWon = a.장부금액
    let evalWon = a.평가금액 || 0
    if (a.통화 === '달러') {
      bookWon = Math.round(a.장부금액 * exchangeRates.USD)
      evalWon = Math.round((a.평가금액 || 0) * exchangeRates.USD)
    } else if (a.통화 === '엔화') {
      bookWon = Math.round(a.장부금액 * exchangeRates.JPY)
      evalWon = Math.round((a.평가금액 || 0) * exchangeRates.JPY)
    }
    combinedRaw.push({
      ...a,
      통화원화환산장부금액: bookWon,
      통화원화환산평가금액: evalWon,
    })
  }

  for (const p of evaluatedPension) {
    combinedRaw.push({
      ...p,
      통화원화환산장부금액: p.장부금액,
      통화원화환산평가금액: p.평가금액 || 0,
    })
  }

  // 종목코드별 합산 (df0)
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

  for (const r of combinedRaw) {
    if (r.통화원화환산장부금액 === 0 && r.통화원화환산평가금액 === 0) continue
    const key = r.종목코드
    if (!byCode.has(key)) {
      byCode.set(key, {
        통화: r.통화,
        자산군: r.자산군,
        세부자산군: r.세부자산군,
        세부자산군2: r.세부자산군2,
        상품명: r.종목명,
        보유수량: 0,
        장부금액: 0,
        평가금액: 0,
      })
    }
    const item = byCode.get(key)!
    item.보유수량 += r.보유수량
    item.장부금액 += r.통화원화환산장부금액
    item.평가금액 += r.통화원화환산평가금액
  }

  const df0 = Array.from(byCode.values())

  // df1: 외화자산 제외
  const df1 = df0.filter((d) => d.자산군 !== '외화자산')

  // df2: 전체 합계 (<합계>)
  const totalBook = df0.filter((d) => d.통화 === '원화').reduce((acc, c) => acc + c.장부금액, 0)
  const totalEval = df0.filter((d) => d.통화 === '원화').reduce((acc, c) => acc + c.평가금액, 0)
  const df2 = {
    자산군: '<합계>',
    세부자산군: '',
    세부자산군2: '',
    상품명: '',
    보유수량: 0,
    장부금액: totalBook,
    평가금액: totalEval,
  }

  // df3: 자산군별 소계
  const df3Map = new Map<string, { 장부금액: number; 평가금액: number }>()
  for (const d of df1) {
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

  // df4: 자산군 x 세부자산군 소계
  const df4Map = new Map<string, { 자산군: string; 세부자산군: string; 장부금액: number; 평가금액: number }>()
  for (const d of df1) {
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

  // df5: 자산군 x 세부자산군 x 세부자산군2 소계
  const df5Map = new Map<string, { 자산군: string; 세부자산군: string; 세부자산군2: string; 장부금액: number; 평가금액: number }>()
  for (const d of df1) {
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

  // df6: 환차손익 행
  const df3BookSum = df3.reduce((acc, c) => acc + c.장부금액, 0)
  const fxProfit = df3BookSum - df2.장부금액
  const fxReturn = df2.장부금액 > 0 ? Number(((fxProfit / df2.장부금액) * 100).toFixed(2)) : 0
  const df6: CommodityHoldingSummary = {
    자산군: '환차손익',
    세부자산군: '',
    세부자산군2: '',
    상품명: '',
    보유수량: 0,
    장부금액: 0,
    평가금액: 0,
    평단가: 0,
    현재가: 0,
    평가손익: fxProfit,
    평가수익률: fxReturn,
  }

  // 전체 t_comm 결합 및 정렬
  const combinedHoldings = [...df1, df2, ...df3, ...df4, ...df5]
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

  // CLASS_ORDER, CLASS2_ORDER, CLASS3_ORDER 순서에 따른 정렬
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
  tComm.push(df6)

  // DB holdings 스냅샷
  const holdingsSnapshots = tComm
    .filter((t) => t.상품명 && t.상품명 !== '' && t.자산군 !== '환차손익' && t.자산군 !== '<합계>')
    .map((t) => ({ ...t }))

  // DB asset_ratio 스냅샷
  const totalEvalHoldings = holdingsSnapshots.reduce((acc, c) => acc + c.평가금액, 0)
  const ratioGrouped = new Map<string, { 자산군: string; 세부자산군: string; 세부자산군2: string; 평가금액: number }>()
  for (const h of holdingsSnapshots) {
    const k = `${h.자산군}_${h.세부자산군}_${h.세부자산군2}`
    const cur = ratioGrouped.get(k) || { 자산군: h.자산군, 세부자산군: h.세부자산군, 세부자산군2: h.세부자산군2, 평가금액: 0 }
    cur.평가금액 += h.평가금액
    ratioGrouped.set(k, cur)
  }
  const assetRatioSnapshots = Array.from(ratioGrouped.values()).map((r) => ({
    ...r,
    비중: totalEvalHoldings > 0 ? Number(((r.평가금액 / totalEvalHoldings) * 100).toFixed(2)) : 0,
  }))

  // t_comm2: 계좌별 그룹화 및 계좌 소계 행 포함
  const acctSubtotalsMap = new Map<string, { 장부금액: number; 평가금액: number }>()
  for (const r of combinedRaw.filter((r) => r.자산군 !== '외화자산')) {
    const cur = acctSubtotalsMap.get(r.계좌) || { 장부금액: 0, 평가금액: 0 }
    cur.장부금액 += r.통화원화환산장부금액
    cur.평가금액 += r.통화원화환산평가금액
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
    ...combinedRaw.filter((r) => r.자산군 !== '외화자산').map((r) => {
      const evalAmt = r.통화원화환산평가금액
      const evalProfit = evalAmt - r.통화원화환산장부금액
      const evalYield = r.통화원화환산장부금액 > 0 ? Number(((evalProfit / r.통화원화환산장부금액) * 100).toFixed(2)) : 0
      return {
        ...r,
        장부금액: r.통화원화환산장부금액,
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
  const tComm10: CommodityHolding3Record[] = combinedRaw
    .filter((r) => r.자산군 !== '외화자산' && r.종목명)
    .map((r) => {
      const evalAmt = r.통화원화환산평가금액
      const evalProfit = evalAmt - r.통화원화환산장부금액
      const evalYield = r.통화원화환산장부금액 > 0 ? Number(((evalProfit / r.통화원화환산장부금액) * 100).toFixed(2)) : 0
      return {
        자산군: r.자산군,
        세부자산군: r.세부자산군,
        세부자산군2: r.세부자산군2,
        상품명: r.종목명,
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

  return {
    tComm,
    tComm2,
    tComm10,
    holdingsSnapshots,
    assetRatioSnapshots,
  }
}

/**
 * R6 compute_total_allocation 포팅
 * 11개 계좌 피벗 매트릭스 생성 (groups 마스터와 조인)
 */
export function computeAccountAllocation(
  tComm2: Array<BalanceSheetRecord & { 평가수익률: number }>,
  groupsMaster: Array<{ 자산군: string; 세부자산군: string; 세부자산군2: string }>
): AccountAllocationItem[] {
  // 계좌 x 자산군 x 세부자산군 x 세부자산군2 별 평가금액 집계
  const pivotedMap = new Map<string, Record<string, number>>()

  for (const r of tComm2) {
    const astClass = !r.자산군 || r.자산군 === '' ? '합계' : r.자산군
    const k = `${astClass}_${r.세부자산군 || ''}_${r.세부자산군2 || ''}`
    const cur = pivotedMap.get(k) || {}
    cur[r.계좌] = (cur[r.계좌] || 0) + (r.평가금액 || 0)
    pivotedMap.set(k, cur)
  }

  // groups 마스터 순서대로 행 구성
  const result: AccountAllocationItem[] = []

  for (const g of groupsMaster) {
    const k = `${g.자산군}_${g.세부자산군 || ''}_${g.세부자산군2 || ''}`
    const acctVals = pivotedMap.get(k) || {}

    let rowSum = 0
    const rowItem: any = {
      자산군: g.자산군,
      세부자산군: g.세부자산군 || '',
      세부자산군2: g.세부자산군2 || '',
    }

    for (const a of ALLOCATION_ACCOUNTS) {
      const v = acctVals[a] || 0
      rowItem[a] = v
      rowSum += v
    }
    rowItem.합계 = rowSum
    rowItem.비중 = 0
    result.push(rowItem)
  }

  // 합계 행 비중 계산
  const totalRow = result[result.length - 1]
  const grandTotal = totalRow ? totalRow.합계 : 0

  for (const r of result) {
    r.비중 = grandTotal > 0 ? Number(((r.합계 / grandTotal) * 100).toFixed(2)) : 0
  }

  return result
}

/**
 * R6 compute_asset_profit 포팅
 * t_comm3 (자산군별 손익) 및 t_comm4 (계좌별 손익) 산출
 */
export function computeAssetProfit(
  evaluatedAssets: BalanceSheetRecord[],
  evaluatedPension: BalanceSheetRecord[]
): {
  tComm3: AssetClassProfitRecord[]
  tComm4: AccountProfitRecord[]
} {
  // 통화 == '원화'인 투자자산 + 연금자산 결합
  const baseWon = evaluatedAssets
    .filter((r) => r.통화 === '원화')
    .concat(evaluatedPension)
    .map((r) => {
      let astClass = r.자산군
      let astClass1 = r.세부자산군
      let astClass2 = r.세부자산군2
      if (r.자산군 === '외화자산' && r.세부자산군 === '달러자산') {
        astClass = '주식'
        astClass1 = '선진국'
        astClass2 = '종목'
      }
      return {
        ...r,
        자산군: astClass,
        세부자산군: astClass1,
        세부자산군2: astClass2,
      }
    })

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

  for (const r of baseWon) {
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

  for (const r of baseWon) {
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

  return { tComm3, tComm4 }
}

/**
 * R6 compute_comm_profit 포팅
 * comm_profit (계좌별 상품 손익) & comm_profit2 (자산군별 상품 손익)
 */
export function computeDetailedCommodityProfit(
  evaluatedAssets: BalanceSheetRecord[],
  evaluatedPension: BalanceSheetRecord[]
): {
  commProfit: DetailedCommodityProfitRecord[]
  commProfit2: DetailedCommodityProfit2Record[]
} {
  const combined = [...evaluatedAssets, ...evaluatedPension]

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
  const commProfit: DetailedCommodityProfitRecord[] = combined.map(buildRow)
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

  // 2. comm_profit2 (자산군, 세부자산군, 세부자산군2, 통화, 종목명, 계좌, desc(평가금액))
  const commProfit2: DetailedCommodityProfit2Record[] = combined.map(buildRow)
  commProfit2.sort((a, b) => {
    const cA = CLASS_ORDER.indexOf(a.자산군)
    const cB = CLASS_ORDER.indexOf(b.자산군)
    if (cA !== cB) return (cA === -1 ? 999 : cA) - (cB === -1 ? 999 : cB)

    const c2A = CLASS2_ORDER.indexOf(a.세부자산군)
    const c2B = CLASS2_ORDER.indexOf(b.세부자산군)
    if (c2A !== c2B) return (c2A === -1 ? 999 : c2A) - (c2B === -1 ? 999 : c2B)

    const curA = CURRENCY_ORDER.indexOf(a.통화)
    const curB = CURRENCY_ORDER.indexOf(b.통화)
    if (curA !== curB) return (curA === -1 ? 999 : curA) - (curB === -1 ? 999 : curB)

    if (a.종목명 !== b.종목명) return a.종목명.localeCompare(b.종목명)

    const aIdx = ACCOUNT_ORDER.indexOf(a.계좌)
    const bIdx = ACCOUNT_ORDER.indexOf(b.계좌)
    if (aIdx !== bIdx) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)

    return b.평가금액 - a.평가금액
  })

  return { commProfit, commProfit2 }
}
