import {
  AssetStrategyTagRow,
  DEFAULT_PENSION_SAFE_CODES,
  HoldingLike,
  MAJOR_9_BETA_EQ,
  MAJOR_9_KEYS,
  Major9Key,
  TpaRiskMetrics,
  Weights9,
  classifyLeafToMajor9,
  createZeroWeights9,
  isPensionSafeName,
} from './alm-tpa-types'
import {
  DEFAULT_LTCMA_INPUTS,
  DEFAULT_REF_WEIGHTS_9,
  evaluateTpaRiskMetrics,
} from './saa-taa-optimizer'

export const MAJOR_9_BM_TICKERS: Record<Major9Key, string> = {
  선진국주식: '360200.KS',
  신흥국주식: '245710.KS',
  국내주식: '305050.KS',
  귀금속: '411060.KS',
  원자재: '160580.KS',
  인컴자산: '329200.KS',
  만기보유채권: '114460.KS',
  시장형채권: '356540.KS',
  현금성자산: 'KRW_CASH',
}

export interface FiveStageAttributionInput {
  dates: string[]
  bmDailyReturns: Record<Major9Key, number[]>
  myPfDailyReturns: number[]
  actualDailyWeights: Weights9[]
  refWeights: Weights9
  saaWeights: Weights9
  taaWeights: Weights9
}

export interface FiveStageBreakdown {
  refReturnPct: number
  saaEffectPct: number
  taaEffectPct: number
  driftEffectPct: number
  selectionExecutionEffectPct: number
  saaReturnPct: number
  taaReturnPct: number
  actWbmReturnPct: number
  myPfReturnPct: number
  excessVsRefPct: number
}

export interface FiveStageSeriesPoint {
  date: string
  refCumPct: number
  saaCumPct: number
  taaCumPct: number
  actWbmCumPct: number
  myPfCumPct: number
}

export interface FiveStageAttributionResult {
  breakdown: FiveStageBreakdown
  series: FiveStageSeriesPoint[]
}

function dotWeightsReturn(
  weightsPct: Weights9,
  bmDailyReturns: Record<Major9Key, number[]>,
  idx: number
): number {
  let r = 0
  for (const k of MAJOR_9_KEYS) {
    const w = (Number(weightsPct[k]) || 0) / 100
    const ret = bmDailyReturns[k]?.[idx] ?? 0
    r += w * ret
  }
  return r
}

export function computeFiveStageAttribution(
  input: FiveStageAttributionInput
): FiveStageAttributionResult {
  const n = input.dates.length
  if (n === 0) {
    return {
      breakdown: {
        refReturnPct: 0,
        saaEffectPct: 0,
        taaEffectPct: 0,
        driftEffectPct: 0,
        selectionExecutionEffectPct: 0,
        saaReturnPct: 0,
        taaReturnPct: 0,
        actWbmReturnPct: 0,
        myPfReturnPct: 0,
        excessVsRefPct: 0,
      },
      series: [],
    }
  }

  let refWealth = 1
  let saaWealth = 1
  let taaWealth = 1
  let actWbmWealth = 1
  let myPfWealth = 1

  const series: FiveStageSeriesPoint[] = []

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      series.push({
        date: input.dates[i],
        refCumPct: 0,
        saaCumPct: 0,
        taaCumPct: 0,
        actWbmCumPct: 0,
        myPfCumPct: 0,
      })
      continue
    }

    const rRef = dotWeightsReturn(input.refWeights, input.bmDailyReturns, i)
    const rSaa = dotWeightsReturn(input.saaWeights, input.bmDailyReturns, i)
    const rTaa = dotWeightsReturn(input.taaWeights, input.bmDailyReturns, i)
    // Use lagged actual weight w_{t-1} for ActW x BM to eliminate look-ahead bias
    const laggedActW = input.actualDailyWeights[i - 1] ?? input.taaWeights
    const rActWbm = dotWeightsReturn(laggedActW, input.bmDailyReturns, i)
    const rMyPf = input.myPfDailyReturns[i] ?? 0

    refWealth *= 1 + rRef
    saaWealth *= 1 + rSaa
    taaWealth *= 1 + rTaa
    actWbmWealth *= 1 + rActWbm
    myPfWealth *= 1 + rMyPf

    series.push({
      date: input.dates[i],
      refCumPct: Number(((refWealth - 1) * 100).toFixed(2)),
      saaCumPct: Number(((saaWealth - 1) * 100).toFixed(2)),
      taaCumPct: Number(((taaWealth - 1) * 100).toFixed(2)),
      actWbmCumPct: Number(((actWbmWealth - 1) * 100).toFixed(2)),
      myPfCumPct: Number(((myPfWealth - 1) * 100).toFixed(2)),
    })
  }

  const refReturnPct = Number(((refWealth - 1) * 100).toFixed(2))
  const saaReturnPct = Number(((saaWealth - 1) * 100).toFixed(2))
  const taaReturnPct = Number(((taaWealth - 1) * 100).toFixed(2))
  const actWbmReturnPct = Number(((actWbmWealth - 1) * 100).toFixed(2))
  const myPfReturnPct = Number(((myPfWealth - 1) * 100).toFixed(2))

  const saaEffectPct = Number((saaReturnPct - refReturnPct).toFixed(2))
  const taaEffectPct = Number((taaReturnPct - saaReturnPct).toFixed(2))
  const driftEffectPct = Number((actWbmReturnPct - taaReturnPct).toFixed(2))
  // Compute residual so additive identity holds exactly even after 2-decimal rounding
  const selectionExecutionEffectPct = Number(
    (myPfReturnPct - (refReturnPct + saaEffectPct + taaEffectPct + driftEffectPct)).toFixed(2)
  )

  return {
    breakdown: {
      refReturnPct,
      saaEffectPct,
      taaEffectPct,
      driftEffectPct,
      selectionExecutionEffectPct,
      saaReturnPct,
      taaReturnPct,
      actWbmReturnPct,
      myPfReturnPct,
      excessVsRefPct: Number((myPfReturnPct - refReturnPct).toFixed(2)),
    },
    series,
  }
}

export interface CoreSatelliteHoldingItem {
  account: string
  tickerCode: string
  name: string
  major9: Major9Key
  strategyRole: 'core' | 'satellite' | 'cash'
  isUntagged: boolean
  factorCluster: string
  economicCurrency: string
  isIndividualStock: boolean
  isPensionSafeOverride: boolean
  effectiveBetaEq: number
  evalKrw: number
  weightPct: number
  returnPct: number
}

export interface ClusterExposureItem {
  cluster: string
  evalKrw: number
  weightPct: number
  breachesCap: boolean
}

export interface CurrencyExposureItem {
  currency: string
  evalKrw: number
  weightPct: number
}

export interface CoreSatelliteXRayResult {
  totalEvalKrw: number
  coreKrw: number
  satelliteKrw: number
  cashKrw: number
  corePct: number
  satellitePct: number
  cashPct: number
  untaggedCount: number
  individualStockTotalPct: number
  maxSingleStockName: string
  maxSingleStockPct: number
  maxClusterName: string
  maxClusterPct: number
  holdings: CoreSatelliteHoldingItem[]
  clusters: ClusterExposureItem[]
  currencies: CurrencyExposureItem[]
  currentWeights9: Weights9
  riskComparison: {
    current: TpaRiskMetrics
    ref: TpaRiskMetrics
    saa: TpaRiskMetrics
    taa: TpaRiskMetrics
  }
}

export function computeCoreSatelliteXRay(params: {
  holdings: HoldingLike[]
  strategyTags: AssetStrategyTagRow[]
  refWeights?: Weights9
  saaWeights?: Weights9
  taaWeights?: Weights9
}): CoreSatelliteXRayResult {
  const tagMap = new Map<string, AssetStrategyTagRow>()
  for (const t of params.strategyTags) tagMap.set(t.ticker_code, t)

  const validHoldings = params.holdings.filter(
    (h) => h.종목코드 && h.종목코드 !== '' && (Number(h.평가금액) || 0) > 0
  )
  const totalEvalKrw = validHoldings.reduce((acc, h) => acc + (Number(h.평가금액) || 0), 0)
  const denom = Math.max(1, totalEvalKrw)

  const currentWeights9 = createZeroWeights9()
  let coreKrw = 0
  let satelliteKrw = 0
  let cashKrw = 0
  let untaggedCount = 0
  let individualStockKrw = 0
  let maxSingleStockKrw = 0
  let maxSingleStockName = ''

  const clusterSums: Record<string, number> = {}
  const currencySums: Record<string, number> = {}
  const items: CoreSatelliteHoldingItem[] = []

  for (const h of validHoldings) {
    const evalKrw = Number(h.평가금액) || 0
    const weightPct = Number(((evalKrw / denom) * 100).toFixed(2))
    const major9 = classifyLeafToMajor9(h.자산군, h.세부자산군, h.세부자산군2)
    currentWeights9[major9] += (evalKrw / denom) * 100

    const tag = tagMap.get(h.종목코드)
    if (!tag) untaggedCount++

    const inferredRole: 'core' | 'satellite' | 'cash' =
      tag?.strategy_role ??
      (h.자산군 === '현금성'
        ? 'cash'
        : h.세부자산군2 === '테마' || h.세부자산군2 === '종목' || h.세부자산군2 === '원자재'
        ? 'satellite'
        : 'core')

    if (inferredRole === 'core') coreKrw += evalKrw
    else if (inferredRole === 'satellite') satelliteKrw += evalKrw
    else cashKrw += evalKrw

    const isIndividualStock = h.자산군 === '주식' && h.세부자산군2 === '종목'
    if (isIndividualStock) {
      individualStockKrw += evalKrw
      if (evalKrw > maxSingleStockKrw) {
        maxSingleStockKrw = evalKrw
        maxSingleStockName = h.상품명 || h.종목명 || h.종목코드
      }
    }

    const factorCluster = tag?.factor_cluster || (inferredRole === 'cash' ? '현금/RP' : major9)
    if (factorCluster !== '현금/RP') {
      clusterSums[factorCluster] = (clusterSums[factorCluster] || 0) + evalKrw
    }

    const economicCurrency =
      tag?.economic_currency ||
      (h.통화 === '달러' ? 'USD' : h.통화 === '엔화' ? 'JPY' : 'KRW')
    currencySums[economicCurrency] = (currencySums[economicCurrency] || 0) + evalKrw

    const isPensionSafeOverride =
      Boolean(tag?.is_pension_safe_override) ||
      DEFAULT_PENSION_SAFE_CODES.has(h.종목코드) ||
      isPensionSafeName(h.상품명 || h.종목명 || '')

    const effectiveBetaEq =
      tag?.equity_beta_override !== null && tag?.equity_beta_override !== undefined
        ? Number(tag.equity_beta_override)
        : MAJOR_9_BETA_EQ[major9]

    items.push({
      account: h.계좌,
      tickerCode: h.종목코드,
      name: h.상품명 || h.종목명 || h.종목코드,
      major9,
      strategyRole: inferredRole,
      isUntagged: !tag,
      factorCluster,
      economicCurrency,
      isIndividualStock,
      isPensionSafeOverride,
      effectiveBetaEq,
      evalKrw: Math.round(evalKrw),
      weightPct,
      returnPct: Number((Number(h.평가수익률) || 0).toFixed(2)),
    })
  }

  for (const k of MAJOR_9_KEYS) {
    currentWeights9[k] = Number(currentWeights9[k].toFixed(2))
  }
  items.sort((a, b) => b.evalKrw - a.evalKrw)

  const clusters: ClusterExposureItem[] = Object.entries(clusterSums)
    .map(([cluster, evalKrw]) => {
      const weightPct = Number(((evalKrw / denom) * 100).toFixed(2))
      return {
        cluster,
        evalKrw: Math.round(evalKrw),
        weightPct,
        breachesCap: weightPct > 25.0,
      }
    })
    .sort((a, b) => b.evalKrw - a.evalKrw)

  const currencies: CurrencyExposureItem[] = Object.entries(currencySums)
    .map(([currency, evalKrw]) => ({
      currency,
      evalKrw: Math.round(evalKrw),
      weightPct: Number(((evalKrw / denom) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.evalKrw - a.evalKrw)

  const corePct = Number(((coreKrw / denom) * 100).toFixed(2))
  const satellitePct = Number(((satelliteKrw / denom) * 100).toFixed(2))
  const cashPct = Number(((cashKrw / denom) * 100).toFixed(2))
  const individualStockTotalPct = Number(((individualStockKrw / denom) * 100).toFixed(2))
  const maxSingleStockPct = Number(((maxSingleStockKrw / denom) * 100).toFixed(2))
  const maxClusterName = clusters[0]?.cluster || '-'
  const maxClusterPct = clusters[0]?.weightPct ?? 0

  const refW = params.refWeights ?? DEFAULT_REF_WEIGHTS_9
  const saaW = params.saaWeights ?? currentWeights9
  const taaW = params.taaWeights ?? currentWeights9

  return {
    totalEvalKrw: Math.round(totalEvalKrw),
    coreKrw: Math.round(coreKrw),
    satelliteKrw: Math.round(satelliteKrw),
    cashKrw: Math.round(cashKrw),
    corePct,
    satellitePct,
    cashPct,
    untaggedCount,
    individualStockTotalPct,
    maxSingleStockName,
    maxSingleStockPct,
    maxClusterName,
    maxClusterPct,
    holdings: items,
    clusters,
    currencies,
    currentWeights9,
    riskComparison: {
      current: evaluateTpaRiskMetrics(currentWeights9, refW, DEFAULT_LTCMA_INPUTS, {
        satelliteWeightPct: satellitePct,
        maxSingleClusterPct: maxClusterPct,
        totalIndividualStockPct: individualStockTotalPct,
        maxSingleStockPct,
      }),
      ref: evaluateTpaRiskMetrics(refW, refW, DEFAULT_LTCMA_INPUTS),
      saa: evaluateTpaRiskMetrics(saaW, refW, DEFAULT_LTCMA_INPUTS, {
        targetBetaEqPct: 75.0,
        betaTolerancePct: 2.0,
      }),
      taa: evaluateTpaRiskMetrics(taaW, refW, DEFAULT_LTCMA_INPUTS, {
        targetBetaEqPct: 75.0,
        betaTolerancePct: 7.5,
      }),
    },
  }
}
