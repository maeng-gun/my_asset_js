/**
 * Oracle Mathematical Implementations & Canonical Specifications
 * Derived authoritatively from ORIGINAL_REQUEST.md & PROJECT.md
 */

export const CLASS_ORDER = [
  '현금성자산',
  '주식',
  '채권',
  '대체자산',
]

export const CLASS2_ORDER = [
  '원화',
  '달러',
  '엔화',
  '국내',
  '선진국',
  '신흥국',
  '글로벌',
  '국채',
  '투자등급',
  '하이일드',
  '원자재',
  '실물자산',
  '인컴자산',
  '부동산인프라',
  '만기보유',
  '시장형',
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

export const ACCOUNT_ORDER = [
  '한투',
  '한투ISA',
  '엔투ISA',
  '불리오',
  '금현물',
  '퇴직연금',
  '개인연금',
  'IRP',
  '연금저축',
  '외화보통예금',
]

/**
 * F1 Mathematical Oracle:
 * '전체' 자산군 시계열 계산 (기하 누적수익률 및 DD 산출)
 * @param {Array<{ 기준일: string, 자산군?: string, 총손익: number, 평가금액: number }>} returnRows 
 */
export function calculateOverallPerformanceSeries(returnRows) {
  // 기준일 순으로 정렬
  const sorted = [...returnRows].sort((a, b) => a.기준일.localeCompare(b.기준일))
  if (sorted.length === 0) return []

  const series = []
  let prevProfit = 0
  let prevEval = 0
  let cumReturn = 0
  let maxCum = 0

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]
    const d = cur.기준일

    if (i === 0) {
      prevProfit = cur.총손익
      prevEval = cur.평가금액
      series.push({ 기준일: d, MyPF: 0, BM: 0, DD: 0 })
      continue
    }

    const prevDate = sorted[i - 1].기준일
    const isNewYear = d.substring(0, 4) !== prevDate.substring(0, 4)
    const dailyProfit = isNewYear ? cur.총손익 : cur.총손익 - prevProfit
    const dailyReturn = prevEval > 0 ? (dailyProfit / prevEval) * 100 : 0

    // 기하 누적곱: (1 + cum) * (1 + r) - 1
    cumReturn = (1 + cumReturn) * (1 + dailyReturn / 100) - 1
    const cumPercent = Number((cumReturn * 100).toFixed(2))

    if (cumPercent > maxCum) maxCum = cumPercent
    const dd = maxCum > 0
      ? Number((((cumPercent - maxCum) / (100 + maxCum)) * 100).toFixed(2))
      : cumPercent < 0
      ? cumPercent
      : 0

    series.push({
      기준일: d,
      MyPF: cumPercent,
      BM: 0, // '전체'는 BM이 항상 0 (벤치마크 없음)
      DD: dd,
    })

    prevProfit = cur.총손익
    prevEval = cur.평가금액
  }

  return series
}

/**
 * F2 Sorting Canonical Comparator Oracle
 * R2 요구사항: CLASS_ORDER -> CLASS2_ORDER -> CLASS3_ORDER -> 평가금액 DESC -> ACCOUNT_ORDER -> 상품명
 */
export function canonicalSortComparator(a, b) {
  // 1. 자산군 (CLASS_ORDER)
  const cA = CLASS_ORDER.indexOf(a.자산군 ?? '')
  const cB = CLASS_ORDER.indexOf(b.자산군 ?? '')
  const cAOrder = cA === -1 ? 999 : cA
  const cBOrder = cB === -1 ? 999 : cB
  if (cAOrder !== cBOrder) return cAOrder - cBOrder

  // 2. 세부자산군 (CLASS2_ORDER)
  const c2A = CLASS2_ORDER.indexOf(a.세부자산군 ?? '')
  const c2B = CLASS2_ORDER.indexOf(b.세부자산군 ?? '')
  const c2AOrder = c2A === -1 ? 999 : c2A
  const c2BOrder = c2B === -1 ? 999 : c2B
  if (c2AOrder !== c2BOrder) return c2AOrder - c2BOrder

  // 3. 세부자산군2 (CLASS3_ORDER)
  const c3A = CLASS3_ORDER.indexOf(a.세부자산군2 ?? '')
  const c3B = CLASS3_ORDER.indexOf(b.세부자산군2 ?? '')
  const c3AOrder = c3A === -1 ? 999 : c3A
  const c3BOrder = c3B === -1 ? 999 : c3B
  if (c3AOrder !== c3BOrder) return c3AOrder - c3BOrder

  // 4. 평가금액 내림차순 (DESC)
  const evalA = Number(a.평가금액) || 0
  const evalB = Number(b.평가금액) || 0
  if (evalB !== evalA) return evalB - evalA

  // 5. 계좌 순서 (ACCOUNT_ORDER)
  const acA = ACCOUNT_ORDER.indexOf(a.계좌 ?? '')
  const acB = ACCOUNT_ORDER.indexOf(b.계좌 ?? '')
  const acAOrder = acA === -1 ? 999 : acA
  const acBOrder = acB === -1 ? 999 : acB
  if (acAOrder !== acBOrder) return acAOrder - acBOrder

  // 6. 상품명 오름차순
  return (a.상품명 || '').localeCompare(b.상품명 || '')
}

/**
 * F4 Price Fallback Chain Simulator Oracle
 * @param {Object} params
 * @param {string} params.ticker
 * @param {number} params.holdingQty
 * @param {number} params.bookValue
 * @param {number|null} [params.multiPrice]
 * @param {number|null} [params.singlePrice]
 * @param {{ evalAmt: number, qty: number }|null} [params.prevSnapshot]
 */
export function resolveValuationPriceOracle({
  ticker,
  holdingQty,
  bookValue,
  multiPrice = null,
  singlePrice = null,
  prevSnapshot = null,
}) {
  // 1. 복수시세가 유효한 경우
  if (multiPrice !== null && !isNaN(multiPrice) && multiPrice > 0) {
    return {
      priceSource: 'kis_multi',
      unitPrice: multiPrice,
      evalAmt: Math.round(multiPrice * holdingQty),
      evalProfit: Math.round(multiPrice * holdingQty) - bookValue,
    }
  }

  // 2. 단건 재시도 시세가 유효한 경우
  if (singlePrice !== null && !isNaN(singlePrice) && singlePrice > 0) {
    return {
      priceSource: 'kis_single_fallback',
      unitPrice: singlePrice,
      evalAmt: Math.round(singlePrice * holdingQty),
      evalProfit: Math.round(singlePrice * holdingQty) - bookValue,
    }
  }

  // 3. 최종 안전망: 직전 스냅샷 유효 단가 (기존 평가금액 ÷ 기존 보유수량)
  if (prevSnapshot && prevSnapshot.qty > 0 && prevSnapshot.evalAmt > 0) {
    const prevUnitPrice = prevSnapshot.evalAmt / prevSnapshot.qty
    return {
      priceSource: 'prev_snapshot_fallback',
      unitPrice: prevUnitPrice,
      evalAmt: Math.round(prevUnitPrice * holdingQty),
      evalProfit: Math.round(prevUnitPrice * holdingQty) - bookValue,
    }
  }

  // 4. 신규 매수 종목이면서 시세를 전혀 얻지 못한 경우에만 장부금액(평가손익 0)
  return {
    priceSource: 'book_value_fallback',
    unitPrice: holdingQty > 0 ? bookValue / holdingQty : 0,
    evalAmt: bookValue,
    evalProfit: 0,
  }
}

/**
 * F5 Zero-API Fast Recalculation Oracle
 * 기존 스냅샷 단가를 기반으로 신규 거래 반영 즉시 재계산
 */
export function fastRecalculateHoldingsOracle(holdings, prevSummary) {
  // 이전 단가 매핑
  const prevPriceMap = new Map()
  if (prevSummary?.comm_profit2) {
    for (const item of prevSummary.comm_profit2) {
      if (item.보유수량 > 0 && item.평가금액 > 0) {
        prevPriceMap.set(`${item.계좌}_${item.종목명}`, item.평가금액 / item.보유수량)
      }
    }
  }

  return holdings.map((h) => {
    const key = `${h.계좌}_${h.종목명}`
    const prevPrice = prevPriceMap.get(key)
    const book = h.장부금액 || 0
    const qty = h.보유수량 || 0

    let evalAmt = book
    let evalProfit = 0

    if (qty === 0) {
      evalAmt = 0
      evalProfit = 0
    } else if (prevPrice !== undefined && prevPrice > 0) {
      evalAmt = Math.round(prevPrice * qty)
      evalProfit = evalAmt - book
    }

    return {
      ...h,
      평가금액: evalAmt,
      평가손익: evalProfit,
      평가수익률: book > 0 ? Number(((evalProfit / book) * 100).toFixed(2)) : 0,
    }
  })
}
