import { TotalProfitRecord, ProfitVariationRecord, BalanceSheetRecord } from './types'
import {
  subDays,
  subMonths,
  subYears,
  addYears,
  format,
  parseISO,
  eachDayOfInterval,
  startOfMonth,
} from 'date-fns'

/**
 * R6 compute_total_profit 포팅
 * 연도별 종합손익 집계
 */
export function computeTotalProfit(
  bookInfoRows: Array<{ 연도: number; 장부금액: number; 평잔: number; 실현손익: number }>,
  evalProfitRows: Array<{ 연도: number; 평가손익: number }>,
  returnRows: Array<{ 기준일: string; 자산군: string; 평가금액: number; 총손익: number }>,
  currentYear = new Date().getFullYear(),
  currentEvalAmt?: number, // t_comm3 <합계> 평가금액 — 현재 연도에 직접 사용
  currentEvalProfit?: number // t_comm3 <합계> 평가손익
): TotalProfitRecord[] {
  const base2023: TotalProfitRecord = {
    연도: '2023',
    장부금액: 77986913,
    평잔: 63019405,
    평가금액: 78916405,
    평가손익: 929492,
    실현손익: 2376343,
    평가손익증감: 929492,
    총손익: 3305835,
    실현수익률: Number(((2376343 / 63019405) * 100).toFixed(2)),
    평가증감률: Number(((929492 / 63019405) * 100).toFixed(2)),
    총수익률: Number((((2376343 + 929492) / 63019405) * 100).toFixed(2)),
  }

  const evalMap = new Map<number, number>()
  for (const ep of evalProfitRows) {
    evalMap.set(Number(ep.연도), (evalMap.get(Number(ep.연도)) || 0) + (ep.평가손익 || 0))
  }

  // return 테이블에서 연도별 <합계> 평가금액 매핑
  // 같은 연도에 여러 날짜가 있을 경우, 가장 최신(마지막) 날짜의 값을 사용
  const returnDateMap = new Map<number, { date: string; amt: number }>()
  for (const r of returnRows) {
    if (r.자산군 === '<합계>') {
      const y = Number(r.기준일.substring(0, 4))
      const dateStr = r.기준일.substring(0, 10)
      const existing = returnDateMap.get(y)
      if (!existing || dateStr >= existing.date) {
        returnDateMap.set(y, { date: dateStr, amt: r.평가금액 || 0 })
      }
    }
  }
  const returnMap = new Map<number, number>()
  for (const [y, v] of returnDateMap) {
    returnMap.set(y, v.amt)
  }

  const result: TotalProfitRecord[] = [base2023]
  let prevEvalProfit = base2023.평가손익

  const sortedBook = [...bookInfoRows]
    .filter((b) => b.연도 > 2023)
    .sort((a, b) => a.연도 - b.연도)

  for (const b of sortedBook) {
    const curYear = Number(b.연도)
    // 현재 연도는 t_comm3 합계 평가손익을 우선 사용 (가장 정확한 실시간 값)
    const evalProfit = (curYear === currentYear && currentEvalProfit != null)
      ? currentEvalProfit
      : (evalMap.get(curYear) || 0)
      
    // 현재 연도는 t_comm3 합계 평가금액을 우선 사용 (가장 정확한 실시간 값)
    const evalAmt = (curYear === currentYear && currentEvalAmt != null)
      ? currentEvalAmt
      : (returnMap.get(curYear) || 0)
    const evalChange = evalProfit - prevEvalProfit
    const totalProfit = b.실현손익 + evalChange

    const realizedYield = b.평잔 > 0 ? Number(((b.실현손익 / b.평잔) * 100).toFixed(2)) : 0
    const evalChangeYield = b.평잔 > 0 ? Number(((evalChange / b.평잔) * 100).toFixed(2)) : 0
    const totalYield = Number((realizedYield + evalChangeYield).toFixed(2))

    result.push({
      연도: String(curYear),
      장부금액: b.장부금액,
      평잔: b.평잔,
      평가금액: evalAmt,
      평가손익: evalProfit,
      실현손익: b.실현손익,
      평가손익증감: evalChange,
      총손익: totalProfit,
      실현수익률: realizedYield,
      평가증감률: evalChangeYield,
      총수익률: totalYield,
    })

    prevEvalProfit = evalProfit
  }

  return result
}


/**
 * R6 compute_profit_variation 포팅
 * 1일, 1개월, 3개월, 6개월, 1년 전 대비 손익 및 수익률 변동 매트릭스 산출
 */
export function computeProfitVariation(
  tComm3: Array<{
    자산군: string
    세부자산군: string
    세부자산군2: string
    평가금액: number
    평잔: number
    총손익: number
    총수익률: number
  }>,
  returnHistory: Array<{
    기준일: string
    자산군: string
    세부자산군: string
    세부자산군2: string
    평가금액: number
    총손익: number
    총수익률: number
  }>,
  today = new Date()
): ProfitVariationRecord[] {
  const d1 = format(subDays(today, 1), 'yyyy-MM-dd')
  const dm = format(subMonths(today, 1), 'yyyy-MM-dd')
  const d3m = format(subMonths(today, 3), 'yyyy-MM-dd')
  const d6m = format(subMonths(today, 6), 'yyyy-MM-dd')
  const dy = format(subYears(today, 1), 'yyyy-MM-dd')

  const availableDates = Array.from(new Set(returnHistory.map((r) => r.기준일.substring(0, 10)))).sort()

  const findClosestDate = (targetDate: string): string | null => {
    const exact = availableDates.find((d) => d === targetDate)
    if (exact) return exact
    const beforeDates = availableDates.filter((d) => d <= targetDate)
    if (beforeDates.length > 0) return beforeDates[beforeDates.length - 1]
    return availableDates[0] || null
  }

  const dateMap: Record<string, string | null> = {
    '1d': findClosestDate(d1),
    '1m': findClosestDate(dm),
    '3m': findClosestDate(d3m),
    '6m': findClosestDate(d6m),
    '1y': findClosestDate(dy),
  }

  const pastProfitMap = new Map<string, { 손익: number; 수익률: number }>()

  for (const [period, pDate] of Object.entries(dateMap)) {
    if (!pDate) continue
    const matched = returnHistory.filter((r) => r.기준일.substring(0, 10) === pDate)
    for (const m of matched) {
      const k = `${m.자산군}_${m.세부자산군 || ''}_${m.세부자산군2 || ''}_${period}`
      pastProfitMap.set(k, {
        손익: m.총손익 || 0,
        수익률: m.총수익률 || 0,
      })
    }
  }

  return tComm3.map((cur) => {
    const keyPrefix = `${cur.자산군}_${cur.세부자산군 || ''}_${cur.세부자산군2 || ''}`

    const getDiff = (period: string) => {
      const past = pastProfitMap.get(`${keyPrefix}_${period}`)
      if (!past) return { diffProfit: 0, diffYield: 0 }
      return {
        diffProfit: Math.round(cur.총손익 - past.손익),
        diffYield: Number((cur.총수익률 - past.수익률).toFixed(2)),
      }
    }

    const p1d = getDiff('1d')
    const p1m = getDiff('1m')
    const p3m = getDiff('3m')
    const p6m = getDiff('6m')
    const p1y = getDiff('1y')

    return {
      자산군: cur.자산군,
      세부자산군: cur.세부자산군,
      세부자산군2: cur.세부자산군2,
      평가금액: cur.평가금액,
      평잔: cur.평잔,
      총손익: cur.총손익,
      총수익률: cur.총수익률,
      '1d': p1d.diffProfit,
      '1d_': p1d.diffYield,
      '1m': p1m.diffProfit,
      '1m_': p1m.diffYield,
      '3m': p3m.diffProfit,
      '3m_': p3m.diffYield,
      '6m': p6m.diffProfit,
      '6m_': p6m.diffYield,
      '1y': p1y.diffProfit,
      '1y_': p1y.diffYield,
    }
  })
}

/**
 * utils_analytics.R: build_profit_trend_data 포팅
 * 전체 종합손익의 일간손익 및 손익누계 시계열
 */
export function buildProfitTrendData(
  returnRows: Array<{ 기준일: string; 자산군: string; 평가금액: number; 총손익: number }>,
  startDate?: string,
  endDate?: string
): Array<{ 기준일: string; 평가금액: number; 일간손익: number; 손익누계: number; 일간수익률: number }> {
  let filtered = returnRows
    .filter((r) => r.자산군 === '<합계>')
    .map((r) => ({
      기준일: r.기준일.substring(0, 10),
      평가금액: r.평가금액 || 0,
      총손익: r.총손익 || 0,
    }))
    .sort((a, b) => a.기준일.localeCompare(b.기준일))

  if (startDate) {
    filtered = filtered.filter((r) => r.기준일 >= startDate)
  }
  if (endDate) {
    filtered = filtered.filter((r) => r.기준일 <= endDate)
  }

  const result: Array<{ 기준일: string; 평가금액: number; 일간손익: number; 손익누계: number; 일간수익률: number }> = []

  let cumProfit = 0
  for (let i = 1; i < filtered.length; i++) {
    const prev = filtered[i - 1]
    const cur = filtered[i]

    const prevYear = prev.기준일.substring(0, 4)
    const curYear = cur.기준일.substring(0, 4)

    const dailyProfit = curYear !== prevYear ? Math.round(cur.총손익 / 10000) : Math.round((cur.총손익 - prev.총손익) / 10000)
    cumProfit += dailyProfit

    const dailyYield = prev.평가금액 > 0 ? Number((((dailyProfit * 10000) / prev.평가금액) * 100).toFixed(2)) : 0

    result.push({
      기준일: cur.기준일,
      평가금액: cur.평가금액,
      일간손익: dailyProfit,
      손익누계: cumProfit,
      일간수익률: dailyYield,
    })
  }

  return result
}

/**
 * utils_analytics.R: build_asset_profit_data 포팅
 * 6대 자산군(선진국, 신흥국, 실물자산, 인컴자산, 채권, 현금성)별 손익누계 시계열
 */
export function buildAssetProfitData(
  returnRows: Array<{
    기준일: string
    자산군: string
    세부자산군: string
    세부자산군2: string
    총손익: number
  }>,
  startDate?: string,
  endDate?: string
): Record<string, Array<{ 기준일: string; 손익누계: number }>> {
  const calcCumProfit = (
    items: Array<{ 기준일: string; 총손익: number }>
  ): Array<{ 기준일: string; 손익누계: number }> => {
    items.sort((a, b) => a.기준일.localeCompare(b.기준일))
    const res: Array<{ 기준일: string; 손익누계: number }> = []
    let cum = 0
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1]
      const cur = items[i]
      
      const prevYear = prev.기준일.substring(0, 4)
      const curYear = cur.기준일.substring(0, 4)
      
      const daily = curYear !== prevYear ? Math.round(cur.총손익 / 10000) : Math.round((cur.총손익 - prev.총손익) / 10000)
      cum += daily
      res.push({
        기준일: cur.기준일,
        손익누계: cum,
      })
    }
    return res
  }

  let base = returnRows.map((r) => ({
    ...r,
    기준일: r.기준일.substring(0, 10),
  }))

  if (startDate) base = base.filter((r) => r.기준일 >= startDate)
  if (endDate) base = base.filter((r) => r.기준일 <= endDate)

  const 선진국 = calcCumProfit(
    base
      .filter((r) => r.자산군 === '주식' && r.세부자산군 === '선진국' && (!r.세부자산군2 || r.세부자산군2 === ''))
      .map((r) => ({ 기준일: r.기준일, 총손익: r.총손익 || 0 }))
  )

  const emergingMap = new Map<string, number>()
  for (const r of base) {
    if (r.자산군 === '주식' && ['국내', '신흥국'].includes(r.세부자산군) && (!r.세부자산군2 || r.세부자산군2 === '')) {
      emergingMap.set(r.기준일, (emergingMap.get(r.기준일) || 0) + (r.총손익 || 0))
    }
  }
  const 신흥국 = calcCumProfit(
    Array.from(emergingMap.entries()).map(([k, v]) => ({ 기준일: k, 총손익: v }))
  )

  const 실물자산 = calcCumProfit(
    base
      .filter((r) => r.자산군 === '대체자산' && r.세부자산군 === '실물자산' && (!r.세부자산군2 || r.세부자산군2 === ''))
      .map((r) => ({ 기준일: r.기준일, 총손익: r.총손익 || 0 }))
  )

  const 인컴자산 = calcCumProfit(
    base
      .filter((r) => r.자산군 === '대체자산' && r.세부자산군 === '인컴자산' && (!r.세부자산군2 || r.세부자산군2 === ''))
      .map((r) => ({ 기준일: r.기준일, 총손익: r.총손익 || 0 }))
  )

  const 채권 = calcCumProfit(
    base
      .filter((r) => r.자산군 === '채권' && (!r.세부자산군 || r.세부자산군 === '') && (!r.세부자산군2 || r.세부자산군2 === ''))
      .map((r) => ({ 기준일: r.기준일, 총손익: r.총손익 || 0 }))
  )

  const 현금성 = calcCumProfit(
    base
      .filter((r) => r.자산군 === '현금성' && (!r.세부자산군 || r.세부자산군 === '') && (!r.세부자산군2 || r.세부자산군2 === ''))
      .map((r) => ({ 기준일: r.기준일, 총손익: r.총손익 || 0 }))
  )

  return {
    선진국,
    신흥국,
    실물자산,
    인컴자산,
    채권,
    현금성,
  }
}

/**
 * utils_analytics.R: calc_eval_trend_data 포팅
 * 과거 1년 실선 + 미래 1년 점선 5종 추세선 데이터
 */
export function calcEvalTrendData(
  returnRows: Array<{ 기준일: string; 자산군: string; 평가금액: number }>,
  inflowRows: Array<{ 거래일자: string; 계좌: string; 금액?: number; 자금유출입?: number }>,
  tComm2: Array<BalanceSheetRecord & { 평가수익률: number }>,
  today = new Date(),
  maturityRows: Array<{ 계좌: string; 평가금액: number; 만기일: string }> = []
) {
  const oneYearAgo = format(subYears(today, 1), 'yyyy-MM-dd')
  const todayStr = format(today, 'yyyy-MM-dd')
  const oneYearLater = format(addYears(today, 1), 'yyyy-MM-dd')

  // 1. 과거 1년 평가금액
  const pastRows = returnRows
    .filter((r) => r.자산군 === '<합계>' && r.기준일.substring(0, 10) >= oneYearAgo)
    .sort((a, b) => a.기준일.localeCompare(b.기준일))
    .map((r) => ({
      기준일: r.기준일.substring(0, 10),
      과거평가액: Math.round((r.평가금액 || 0) / 10000),
      구분: '과거평가액',
    }))

  const lastEval = pastRows.length > 0 ? pastRows[pastRows.length - 1].과거평가액 : 0

  // 2. 초기 자산 가용금액 (만원 단위)
  let initInvestable = 0
  let initWithdrawable = 0
  let initLiquidatable = 0

  if (tComm2 && tComm2.length > 0) {
    initInvestable = Math.round(
      tComm2
        .filter((t) => t.자산군 === '현금성')
        .reduce((acc, c) => acc + (c.평가금액 || 0), 0) / 10000
    )
    initWithdrawable = Math.round(
      tComm2
        .filter((t) => t.자산군 === '현금성' && t.계좌 === '한투')
        .reduce((acc, c) => acc + (c.평가금액 || 0), 0) / 10000
    )
    initLiquidatable = Math.round(
      tComm2
        .filter((t) => (!t.자산군 || t.자산군 === '') && ['한투', '금현물'].includes(t.계좌))
        .reduce((acc, c) => acc + (c.평가금액 || 0), 0) / 10000
    )
  }

  // 3. 미래 유출입 및 만기도래 집계
  const inflowAllMap = new Map<string, number>()
  const inflowHantuMap = new Map<string, number>()

  for (const row of inflowRows) {
    const d = row.거래일자 ? row.거래일자.substring(0, 10) : ''
    if (!d) continue
    const amt = Math.round((row.자금유출입 ?? row.금액 ?? 0) / 10000)
    inflowAllMap.set(d, (inflowAllMap.get(d) || 0) + amt)
    if (row.계좌 === '한투') {
      inflowHantuMap.set(d, (inflowHantuMap.get(d) || 0) + amt)
    }
  }

  const maturityAllMap = new Map<string, number>()
  const maturityHantuMap = new Map<string, number>()

  for (const mat of maturityRows) {
    const d = mat.만기일 ? mat.만기일.substring(0, 10) : ''
    if (!d) continue
    const amt = Math.round((mat.평가금액 || 0) / 10000)
    maturityAllMap.set(d, (maturityAllMap.get(d) || 0) + amt)
    if (mat.계좌 === '한투') {
      maturityHantuMap.set(d, (maturityHantuMap.get(d) || 0) + amt)
    }
  }

  // 4. 미래 1년 일별 시계열 생성
  const futureDays = eachDayOfInterval({
    start: parseISO(todayStr),
    end: parseISO(oneYearLater),
  }).map((d) => format(d, 'yyyy-MM-dd'))

  let cumTotalInflow = 0
  let cumHantuInflow = 0
  let cumTotalMaturity = 0
  let cumHantuMaturity = 0

  const futureRows = futureDays.map((day) => {
    const diffTotalInflow = day === todayStr ? 0 : inflowAllMap.get(day) || 0
    const diffHantuInflow = day === todayStr ? 0 : inflowHantuMap.get(day) || 0
    const diffTotalMaturity = day === todayStr ? 0 : maturityAllMap.get(day) || 0
    const diffHantuMaturity = day === todayStr ? 0 : maturityHantuMap.get(day) || 0

    cumTotalInflow += diffTotalInflow
    cumHantuInflow += diffHantuInflow
    cumTotalMaturity += diffTotalMaturity
    cumHantuMaturity += diffHantuMaturity

    return {
      기준일: day,
      예상평가액: Math.round(lastEval + cumTotalInflow),
      투자가능자산: Math.round(initInvestable + cumTotalInflow + cumTotalMaturity),
      현금화가능자산: Math.round(initLiquidatable + cumHantuInflow),
      인출가능현금: Math.round(initWithdrawable + cumHantuInflow + cumHantuMaturity),
      구분: '예상평가액(점선)',
    }
  })

  // 통합 반환
  const combinedMap = new Map<string, any>()
  for (const p of pastRows) {
    combinedMap.set(p.기준일, {
      기준일: p.기준일,
      과거평가액: p.과거평가액,
    })
  }
  for (const f of futureRows) {
    const existing = combinedMap.get(f.기준일) || { 기준일: f.기준일 }
    combinedMap.set(f.기준일, {
      ...existing,
      예상평가액: f.예상평가액,
      투자가능자산: f.투자가능자산,
      현금화가능자산: f.현금화가능자산,
      인출가능현금: f.인출가능현금,
    })
  }

  return Array.from(combinedMap.values()).sort((a, b) => a.기준일.localeCompare(b.기준일))
}

/**
 * utils_analytics.R: calc_maturity_analysis 포팅
 * 만기도래 채권/ELS 분석
 */
export function calcMaturityAnalysis(
  evaluatedAssets: BalanceSheetRecord[],
  evaluatedPension: BalanceSheetRecord[],
  assetsMaster: Array<{ 종목코드: string; 만기일?: string }>,
  pensionMaster: Array<{ 종목코드: string; 만기일?: string }>,
  todayStr = format(new Date(), 'yyyy-MM-dd')
) {
  const masterMap = new Map<string, string>()
  for (const m of [...assetsMaster, ...pensionMaster]) {
    if (m.만기일) masterMap.set(m.종목코드, m.만기일.substring(0, 10))
  }

  const combined = [...evaluatedAssets, ...evaluatedPension]
  const maturities: Array<{ 계좌: string; 종목명: string; 종목코드: string; 평가금액: number; 만기일: string }> = []

  for (const r of combined) {
    if (r.자산군 === '채권' && r.세부자산군 === '만기보유' && r.통화 === '원화' && (r.평가금액 || 0) > 0) {
      const matDate = masterMap.get(r.종목코드)
      if (matDate && matDate > todayStr) {
        maturities.push({
          계좌: r.계좌,
          종목명: r.종목명,
          종목코드: r.종목코드,
          평가금액: r.평가금액 || 0,
          만기일: matDate,
        })
      }
    }
  }

  maturities.sort((a, b) => a.만기일.localeCompare(b.만기일))
  return maturities
}

/**
 * utils_analytics.R: calc_liquidity_analysis 포팅
 * 가용자금 및 총자산/현금성자산 시계열 투사
 */
export function calcLiquidityAnalysis(
  tComm2: Array<BalanceSheetRecord & { 평가수익률: number }>,
  inflowRows: Array<{ 거래일자: string; 계좌: string; 금액?: number; 자금유출입?: number }>,
  maturityRows: Array<{ 계좌: string; 평가금액: number; 만기일: string }>,
  today = new Date(),
  acctOrder = [
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
) {
  const currentMonth = format(today, 'yyyy-MM')

  // 1. 현재 계좌별 총자산 & 현금성자산 현황
  const totalByAcct = new Map<string, number>()
  const cashByAcct = new Map<string, number>()

  for (const t of tComm2) {
    if (!t.자산군 || t.자산군 === '') {
      totalByAcct.set(t.계좌, t.평가금액 || 0)
    }
    if (t.자산군 === '현금성') {
      cashByAcct.set(t.계좌, (cashByAcct.get(t.계좌) || 0) + (t.평가금액 || 0))
    }
  }

  const currentStatus: Array<{ 구분: string; [key: string]: any; 합계: number }> = []

  const totalRow: any = { 구분: '총자산' }
  let sumTotal = 0
  for (const a of acctOrder) {
    const v = totalByAcct.get(a) || 0
    totalRow[a] = v
    sumTotal += v
  }
  totalRow.합계 = sumTotal
  currentStatus.push(totalRow)

  const cashRow: any = { 구분: '현금성자산' }
  let sumCash = 0
  for (const a of acctOrder) {
    const v = cashByAcct.get(a) || 0
    cashRow[a] = v
    sumCash += v
  }
  cashRow.합계 = sumCash
  currentStatus.push(cashRow)

  const todayStr = format(today, 'yyyy-MM-dd')

  // 2. 월별 유출입 및 만기도래 집계 (미래 스케줄만 반영)
  const monthlyInflowMap = new Map<string, Map<string, number>>()
  for (const inf of inflowRows) {
    if (!inf.거래일자 || inf.거래일자 <= todayStr) continue
    const d = inf.거래일자.substring(0, 7)
    const amt = inf.자금유출입 ?? inf.금액 ?? 0
    if (!monthlyInflowMap.has(d)) monthlyInflowMap.set(d, new Map())
    const curAcctMap = monthlyInflowMap.get(d)!
    curAcctMap.set(inf.계좌, (curAcctMap.get(inf.계좌) || 0) + amt)
  }

  const monthlyMaturityMap = new Map<string, Map<string, number>>()
  for (const mat of maturityRows) {
    if (!mat.만기일 || mat.만기일 <= todayStr) continue
    const d = mat.만기일.substring(0, 7)
    if (!monthlyMaturityMap.has(d)) monthlyMaturityMap.set(d, new Map())
    const curAcctMap = monthlyMaturityMap.get(d)!
    curAcctMap.set(mat.계좌, (curAcctMap.get(mat.계좌) || 0) + mat.평가금액)
  }

  // 미래 월 목록 추출
  const futureMonths = Array.from(
    new Set([currentMonth, ...monthlyInflowMap.keys(), ...monthlyMaturityMap.keys()])
  ).sort()

  // 3. 총자산 누적 투사 (totalProjection)
  const totalProjection: Array<{ 거래월: string; [key: string]: any; 합계: number }> = []
  const runningTotalMap = new Map<string, number>(totalByAcct)

  for (const m of futureMonths) {
    const monthFlows = monthlyInflowMap.get(m)
    if (monthFlows) {
      for (const [acct, flow] of monthFlows.entries()) {
        runningTotalMap.set(acct, (runningTotalMap.get(acct) || 0) + flow)
      }
    }

    const row: any = { 거래월: m }
    let rSum = 0
    for (const a of acctOrder) {
      const v = runningTotalMap.get(a) || 0
      row[a] = v
      rSum += v
    }
    row.합계 = rSum
    totalProjection.push(row)
  }

  // 4. 가용자금/현금성자산 누적 투사 (cashProjection)
  const cashProjection: Array<{ 거래월: string; [key: string]: any; 합계: number }> = []
  const runningCashMap = new Map<string, number>(cashByAcct)

  for (const m of futureMonths) {
    const monthFlows = monthlyInflowMap.get(m)
    const monthMats = monthlyMaturityMap.get(m)

    if (monthFlows) {
      for (const [acct, flow] of monthFlows.entries()) {
        runningCashMap.set(acct, (runningCashMap.get(acct) || 0) + flow)
      }
    }
    if (monthMats) {
      for (const [acct, matAmt] of monthMats.entries()) {
        runningCashMap.set(acct, (runningCashMap.get(acct) || 0) + matAmt)
      }
    }

    const row: any = { 거래월: m }
    let rSum = 0
    for (const a of acctOrder) {
      const v = runningCashMap.get(a) || 0
      row[a] = v
      rSum += v
    }
    row.합계 = rSum
    cashProjection.push(row)
  }

  return {
    currentStatus,
    totalProjection,
    cashProjection,
    acctOrder,
  }
}

/**
 * utils_analytics.R: calc_total_trading 포팅
 * 기간별 종합거래내역 및 단가 계산
 */
export function calcTotalTrading(
  assetsMaster: Array<{ 계좌: string; 종목코드: string; 자산군: string; 세부자산군: string; 세부자산군2: string; 상품명: string; 통화: string }>,
  pensionMaster: Array<{ 계좌: string; 종목코드: string; 자산군: string; 세부자산군: string; 세부자산군2: string; 상품명: string; 통화: string }>,
  assetsDaily: Array<any>,
  pensionDaily: Array<any>,
  startDate: string,
  endDate: string
) {
  const masterMap = new Map<string, any>()
  for (const m of [...assetsMaster, ...pensionMaster]) {
    masterMap.set(`${m.계좌}_${m.종목코드}`, m)
  }

  const allTrades = [...assetsDaily, ...pensionDaily]
    .filter((t) => {
      const d = t.거래일자 ? t.거래일자.substring(0, 10) : ''
      return d >= startDate && d <= endDate && ((t.매입액 || 0) !== 0 || (t.매도액 || 0) !== 0)
    })
    .map((t) => {
      const m = masterMap.get(`${t.계좌}_${t.종목코드}`) || {}
      const buyQ = t.매입수량 || 0
      const buyAmt = t.매입액 || 0
      const sellQ = t.매도수량 || 0
      const sellAmt = t.매도액 || 0

      return {
        자산군: m.자산군 || '',
        세부자산군: m.세부자산군 || '',
        세부자산군2: m.세부자산군2 || '',
        통화: m.통화 || '원화',
        거래일자: t.거래일자 ? t.거래일자.substring(0, 10) : '',
        계좌: t.계좌,
        상품명: m.상품명 || m.종목명 || t.종목코드,
        매입수량: buyQ,
        매입액: buyAmt,
        매입단가: buyQ > 0 ? Math.round(buyAmt / buyQ) : 0,
        매도수량: sellQ,
        매도액: sellAmt,
        매도단가: sellQ > 0 ? Math.round(sellAmt / sellQ) : 0,
      }
    })
    .filter((t) => t.자산군 !== '현금성')

  allTrades.sort((a, b) => {
    if (a.자산군 !== b.자산군) return a.자산군.localeCompare(b.자산군)
    if (a.세부자산군 !== b.세부자산군) return a.세부자산군.localeCompare(b.세부자산군)
    if (a.거래일자 !== b.거래일자) return b.거래일자.localeCompare(a.거래일자)
    return b.매입액 - a.매입액
  })

  // 합계 행 추가
  const totalBuyAmt = allTrades.reduce((acc, c) => acc + c.매입액, 0)
  const totalSellAmt = allTrades.reduce((acc, c) => acc + c.매도액, 0)

  const summaryRow = {
    자산군: '',
    세부자산군: '',
    세부자산군2: '',
    통화: '',
    거래일자: '',
    계좌: '',
    상품명: '합계',
    매입수량: 0,
    매입액: totalBuyAmt,
    매입단가: 0,
    매도수량: 0,
    매도액: totalSellAmt,
    매도단가: 0,
  }

  return [...allTrades, summaryRow]
}
