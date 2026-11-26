import {
  AssetCorridorStatus,
  CorridorRule,
  LtcmaModelInputs,
  MAJOR_9_BETA_EQ,
  MAJOR_9_KEYS,
  Major9Key,
  TaaGuardrails,
  TaaScorecard4Axis,
  TpaRiskAlert,
  TpaRiskMetrics,
  Weights9,
  computeEquityEqBeta,
  normalizeWeights9,
} from './alm-tpa-types'

export const DEFAULT_REF_WEIGHTS_9: Weights9 = {
  선진국주식: 67.5,
  신흥국주식: 7.5,
  국내주식: 0.0,
  귀금속: 0.0,
  원자재: 0.0,
  인컴자산: 0.0,
  만기보유채권: 0.0,
  시장형채권: 25.0,
  현금성자산: 0.0,
}

export const DEFAULT_SAA_WEIGHTS_9: Weights9 = {
  선진국주식: 45.0,
  신흥국주식: 3.0,
  국내주식: 16.0,
  귀금속: 7.0,
  원자재: 3.0,
  인컴자산: 5.0,
  만기보유채권: 13.0,
  시장형채권: 5.0,
  현금성자산: 3.0,
}

export const DEFAULT_TAA_WEIGHTS_9: Weights9 = {
  선진국주식: 42.0,
  신흥국주식: 2.5,
  국내주식: 15.0,
  귀금속: 8.0,
  원자재: 2.5,
  인컴자산: 4.5,
  만기보유채권: 15.0,
  시장형채권: 5.5,
  현금성자산: 5.0,
}

export const DEFAULT_CORRIDOR_RULE: CorridorRule = {
  max_abs_pct: 5.0,
  min_abs_pct: 1.5,
  relative_ratio: 0.25,
}

export const DEFAULT_LTCMA_INPUTS: LtcmaModelInputs = {
  horizonYears: 10,
  riskAversion: 2.45,
  tau: 0.05,
  shrinkageLambda: 0.25,
  assets: {
    선진국주식: {
      expectedReturnPct: 7.75,
      volatilityPct: 14.9,
      minWeightPct: 25,
      maxWeightPct: 60,
      blViewReturnPct: 7.9,
      viewConfidence: 0.7,
    },
    신흥국주식: {
      expectedReturnPct: 7.95,
      volatilityPct: 17.5,
      minWeightPct: 0,
      maxWeightPct: 12,
      blViewReturnPct: 7.4,
      viewConfidence: 0.55,
    },
    국내주식: {
      expectedReturnPct: 7.6,
      volatilityPct: 18.2,
      minWeightPct: 10,
      maxWeightPct: 24,
      blViewReturnPct: 8.0,
      viewConfidence: 0.65,
    },
    귀금속: {
      expectedReturnPct: 5.4,
      volatilityPct: 14.5,
      minWeightPct: 3,
      maxWeightPct: 12,
      blViewReturnPct: 5.8,
      viewConfidence: 0.6,
    },
    원자재: {
      expectedReturnPct: 4.9,
      volatilityPct: 16.5,
      minWeightPct: 0,
      maxWeightPct: 8,
      blViewReturnPct: 4.5,
      viewConfidence: 0.55,
    },
    인컴자산: {
      expectedReturnPct: 5.6,
      volatilityPct: 11.0,
      minWeightPct: 2,
      maxWeightPct: 10,
      blViewReturnPct: 5.6,
      viewConfidence: 0.6,
    },
    만기보유채권: {
      expectedReturnPct: 3.55,
      volatilityPct: 2.2,
      minWeightPct: 10,
      maxWeightPct: 25,
      blViewReturnPct: 3.7,
      viewConfidence: 0.85,
    },
    시장형채권: {
      expectedReturnPct: 3.85,
      volatilityPct: 5.4,
      minWeightPct: 2,
      maxWeightPct: 20,
      blViewReturnPct: 3.9,
      viewConfidence: 0.7,
    },
    현금성자산: {
      expectedReturnPct: 2.65,
      volatilityPct: 0.8,
      minWeightPct: 2,
      maxWeightPct: 12,
      blViewReturnPct: 2.65,
      viewConfidence: 0.8,
    },
  },
}

// 9x9 correlation matrix in MAJOR_9_KEYS order:
// [선진국, 신흥국, 국내, 귀금속, 원자재, 인컴, 만기채, 시장채, 현금]
export const DEFAULT_CORR_MATRIX_9: number[][] = [
  [1.0, 0.78, 0.65, 0.15, 0.42, 0.55, 0.05, 0.12, 0.0],
  [0.78, 1.0, 0.72, 0.2, 0.48, 0.48, 0.04, 0.1, 0.0],
  [0.65, 0.72, 1.0, 0.12, 0.38, 0.45, 0.06, 0.14, 0.0],
  [0.15, 0.2, 0.12, 1.0, 0.45, 0.18, 0.1, 0.22, 0.0],
  [0.42, 0.48, 0.38, 0.45, 1.0, 0.32, 0.02, -0.05, 0.0],
  [0.55, 0.48, 0.45, 0.18, 0.32, 1.0, 0.15, 0.35, 0.0],
  [0.05, 0.04, 0.06, 0.1, 0.02, 0.15, 1.0, 0.55, 0.2],
  [0.12, 0.1, 0.14, 0.22, -0.05, 0.35, 0.55, 1.0, 0.15],
  [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.2, 0.15, 1.0],
]

export const DEFAULT_TAA_SCORECARD_26Q4: TaaScorecard4Axis = {
  regimeLabel: '26Q4~27H1 방어적 품질·부채매칭 틸트',
  cycle: -0.5,
  inflationRates: -0.5,
  valuationFx: -1.0,
  policyEvent: 0.0,
  manualTilts: {
    선진국주식: -3.0,
    신흥국주식: -0.5,
    국내주식: -1.0,
    귀금속: 1.0,
    원자재: -0.5,
    인컴자산: -0.5,
    만기보유채권: 2.0,
    시장형채권: 0.5,
    현금성자산: 2.0,
  },
  notes:
    '고밸류에이션 선진국·과열 원자재 축소, 2029.12 주담대 7,000만 매칭 만기보유채권·현금 및 금 보험 비중 보강',
}

// ---------------------------------------------------------------------------
// Pure TypeScript Linear Algebra Utilities (9x9)
// ---------------------------------------------------------------------------

export function buildCovarianceMatrix9(
  ltcma: LtcmaModelInputs = DEFAULT_LTCMA_INPUTS,
  corrMatrix: number[][] = DEFAULT_CORR_MATRIX_9
): number[][] {
  const n = MAJOR_9_KEYS.length
  const vols = MAJOR_9_KEYS.map((k) => (ltcma.assets[k]?.volatilityPct ?? 10) / 100)
  const rawCov: number[][] = Array.from({ length: n }, () => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const c = i === j ? 1.0 : corrMatrix[i]?.[j] ?? 0
      rawCov[i][j] = vols[i] * vols[j] * c
    }
  }

  // Constant-correlation / diagonal shrinkage toward diagonal target
  const lambda = Math.max(0, Math.min(1, ltcma.shrinkageLambda ?? 0.25))
  const shrunk: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const diagTarget = i === j ? rawCov[i][i] : 0
      shrunk[i][j] = (1 - lambda) * rawCov[i][j] + lambda * diagTarget
    }
  }
  return shrunk
}

export function matVecMul(A: number[][], x: number[]): number[] {
  return A.map((row) => row.reduce((sum, val, j) => sum + val * x[j], 0))
}

export function matMul(A: number[][], B: number[][]): number[][] {
  const rows = A.length
  const cols = B[0].length
  const inner = B.length
  const out: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      const aik = A[i][k]
      if (aik === 0) continue
      for (let j = 0; j < cols; j++) {
        out[i][j] += aik * B[k][j]
      }
    }
  }
  return out
}

export function matTranspose(A: number[][]): number[][] {
  const rows = A.length
  const cols = A[0].length
  const out: number[][] = Array.from({ length: cols }, () => Array(rows).fill(0))
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      out[j][i] = A[i][j]
    }
  }
  return out
}

export function matInvert(M: number[][]): number[][] {
  const n = M.length
  const aug: number[][] = M.map((row, i) => [
    ...row.map((v) => v),
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ])

  for (let col = 0; col < n; col++) {
    let pivotRow = col
    let maxAbs = Math.abs(aug[col][col])
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(aug[r][col])
      if (val > maxAbs) {
        maxAbs = val
        pivotRow = r
      }
    }
    if (maxAbs < 1e-12) {
      // Regularize tiny diagonal to preserve numerical stability
      aug[col][col] += 1e-9
    } else if (pivotRow !== col) {
      const tmp = aug[col]
      aug[col] = aug[pivotRow]
      aug[pivotRow] = tmp
    }

    const pivot = aug[col][col]
    for (let j = 0; j < 2 * n; j++) {
      aug[col][j] /= pivot
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const factor = aug[r][col]
      if (factor === 0) continue
      for (let j = 0; j < 2 * n; j++) {
        aug[r][j] -= factor * aug[col][j]
      }
    }
  }

  return aug.map((row) => row.slice(n))
}

export function quadForm(x: number[], M: number[][]): number {
  const Mx = matVecMul(M, x)
  return x.reduce((sum, xi, i) => sum + xi * Mx[i], 0)
}

function weightsToArray(w: Weights9): number[] {
  return MAJOR_9_KEYS.map((k) => (Number(w[k]) || 0) / 100)
}

function arrayToWeights(arr: number[]): Weights9 {
  const out = normalizeWeights9({})
  MAJOR_9_KEYS.forEach((k, idx) => {
    out[k] = Number((arr[idx] * 100).toFixed(2))
  })
  return out
}

// ---------------------------------------------------------------------------
// Proportional Corridor Band
// ---------------------------------------------------------------------------

export function computeProportionalCorridor(
  targetWeightPct: number,
  rule: CorridorRule = DEFAULT_CORRIDOR_RULE
): number {
  const w = Math.max(0, Number(targetWeightPct) || 0)
  const rel = w * (rule.relative_ratio ?? 0.25)
  const bounded = Math.max(rule.min_abs_pct ?? 1.5, rel)
  return Number(Math.min(rule.max_abs_pct ?? 5.0, bounded).toFixed(2))
}

export function evaluateCorridors(
  currentWeights: Weights9,
  targetWeights: Weights9,
  rule: CorridorRule = DEFAULT_CORRIDOR_RULE
): AssetCorridorStatus[] {
  return MAJOR_9_KEYS.map((key) => {
    const currentPct = Number((currentWeights[key] ?? 0).toFixed(2))
    const targetPct = Number((targetWeights[key] ?? 0).toFixed(2))
    const diffPct = Number((currentPct - targetPct).toFixed(2))
    const bandPct = computeProportionalCorridor(targetPct, rule)
    const lowerBoundPct = Number(Math.max(0, targetPct - bandPct).toFixed(2))
    const upperBoundPct = Number(Math.min(100, targetPct + bandPct).toFixed(2))
    const absDiff = Math.abs(diffPct)
    const status: AssetCorridorStatus['status'] =
      absDiff > bandPct * 1.25 ? 'CRITICAL' : absDiff > bandPct ? 'WARNING' : 'OK'

    return {
      key,
      currentPct,
      targetPct,
      diffPct,
      bandPct,
      lowerBoundPct,
      upperBoundPct,
      status,
    }
  })
}

// ---------------------------------------------------------------------------
// 1st-Layer TPA Hybrid C-1 Risk & Attribution Metrics
// ---------------------------------------------------------------------------

export interface TpaEvalOptions {
  riskFreeRatePct?: number
  targetBetaEqPct?: number
  betaTolerancePct?: number
  teWarnPct?: number
  rcRatioWarn?: number
  satelliteWeightPct?: number
  maxSingleClusterPct?: number
  totalIndividualStockPct?: number
  maxSingleStockPct?: number
}

export function evaluateTpaRiskMetrics(
  weights: Weights9,
  refWeights: Weights9 = DEFAULT_REF_WEIGHTS_9,
  ltcma: LtcmaModelInputs = DEFAULT_LTCMA_INPUTS,
  options: TpaEvalOptions = {}
): TpaRiskMetrics {
  const cov = buildCovarianceMatrix9(ltcma)
  const w = weightsToArray(weights)
  const wRef = weightsToArray(refWeights)
  const diff = w.map((wi, i) => wi - wRef[i])

  const expReturns = MAJOR_9_KEYS.map((k) => (ltcma.assets[k]?.expectedReturnPct ?? 5) / 100)
  const expectedReturn = w.reduce((acc, wi, i) => acc + wi * expReturns[i], 0)
  const variance = Math.max(0, quadForm(w, cov))
  const volatility = Math.sqrt(variance)
  const teVar = Math.max(0, quadForm(diff, cov))
  const trackingError = Math.sqrt(teVar)

  const rf = (options.riskFreeRatePct ?? 2.65) / 100
  const sharpeEstimate = volatility > 1e-6 ? (expectedReturn - rf) / volatility : 0

  const sigmaW = matVecMul(cov, w)
  const riskContributionsPct = {} as Record<Major9Key, number>
  const rcToWeightRatio = {} as Record<Major9Key, number>

  MAJOR_9_KEYS.forEach((k, i) => {
    const rc = variance > 1e-10 ? (w[i] * sigmaW[i]) / variance : 0
    const rcPct = Number((rc * 100).toFixed(2))
    riskContributionsPct[k] = rcPct
    const capPct = w[i] * 100
    rcToWeightRatio[k] = capPct >= 1.0 ? Number((rcPct / capPct).toFixed(2)) : 0
  })

  const equityEqBetaPct = computeEquityEqBeta(weights)
  const alerts: TpaRiskAlert[] = []

  const targetBeta = options.targetBetaEqPct ?? 75.0
  const betaTol = options.betaTolerancePct ?? 7.5
  if (Math.abs(equityEqBetaPct - targetBeta) > betaTol) {
    alerts.push({
      level: 'critical',
      code: 'BETA_EQ_BAND_BREACH',
      message: `주식등가 펀딩비율(${equityEqBetaPct.toFixed(2)}%)이 목표 범위(${(
        targetBeta - betaTol
      ).toFixed(1)}% ~ ${(targetBeta + betaTol).toFixed(1)}%)를 이탈했습니다.`,
    })
  }

  const teWarn = options.teWarnPct ?? 6.0
  const tePct = Number((trackingError * 100).toFixed(2))
  if (tePct > teWarn) {
    alerts.push({
      level: 'warning',
      code: 'TRACKING_ERROR_HIGH',
      message: `레퍼런스(75:25) 대비 사전 추적오차 TE(${tePct.toFixed(2)}%)가 경보 상한(${teWarn.toFixed(1)}%)을 초과했습니다.`,
    })
  }

  const rcWarn = options.rcRatioWarn ?? 1.6
  for (const k of MAJOR_9_KEYS) {
    const ratio = rcToWeightRatio[k]
    if (ratio > rcWarn && (weights[k] ?? 0) >= 2.0) {
      alerts.push({
        level: 'warning',
        code: `RC_CONCENTRATION_${k}`,
        message: `${k}의 리스크 기여도/자본비중 비율(${ratio.toFixed(2)}배)이 경보 기준(${rcWarn}배)을 초과했습니다.`,
      })
    }
  }

  if (options.satelliteWeightPct !== undefined && options.satelliteWeightPct > 20.0) {
    alerts.push({
      level: 'critical',
      code: 'SATELLITE_HARDCAP_BREACH',
      message: `실질 Satellite 비중(${options.satelliteWeightPct.toFixed(2)}%)이 하드캡 상한(20.0%)을 초과했습니다.`,
    })
  }
  if (options.maxSingleClusterPct !== undefined && options.maxSingleClusterPct > 25.0) {
    alerts.push({
      level: 'warning',
      code: 'SINGLE_CLUSTER_HARDCAP_BREACH',
      message: `단일 팩터/테마 클러스터 비중(${options.maxSingleClusterPct.toFixed(2)}%)이 상한(25.0%)을 초과했습니다.`,
    })
  }
  if (options.totalIndividualStockPct !== undefined && options.totalIndividualStockPct > 10.0) {
    alerts.push({
      level: 'warning',
      code: 'INDIVIDUAL_STOCK_TOTAL_CAP',
      message: `개별 주식 합산 비중(${options.totalIndividualStockPct.toFixed(2)}%)이 상한(10.0%)을 초과했습니다.`,
    })
  }
  if (options.maxSingleStockPct !== undefined && options.maxSingleStockPct > 4.0) {
    alerts.push({
      level: 'warning',
      code: 'SINGLE_STOCK_HARDCAP',
      message: `단일 개별 종목 비중(${options.maxSingleStockPct.toFixed(2)}%)이 상한(4.0%)을 초과했습니다.`,
    })
  }

  return {
    expectedReturnPct: Number((expectedReturn * 100).toFixed(2)),
    volatilityPct: Number((volatility * 100).toFixed(2)),
    equityEqBetaPct,
    trackingErrorPct: tePct,
    sharpeEstimate: Number(sharpeEstimate.toFixed(3)),
    riskContributionsPct,
    rcToWeightRatio,
    alerts,
  }
}

// ---------------------------------------------------------------------------
// 2nd-Layer A: Constrained Black-Litterman SAA Optimizer
// ---------------------------------------------------------------------------

export interface BlackLittermanParams {
  ltcma?: LtcmaModelInputs
  refWeights?: Weights9
  minNonPensionDebtFloorPct?: number
  targetBetaEqPct?: number
  betaTolerancePct?: number
  maxIterations?: number
}

export interface BlackLittermanResult {
  rawOptimalWeights9: Weights9
  roundedWeights9: Weights9
  impliedReturnsPct: Record<Major9Key, number>
  posteriorReturnsPct: Record<Major9Key, number>
  riskMetrics: TpaRiskMetrics
  converged: boolean
}

function projectToFeasibleSet(
  wRaw: number[],
  lower: number[],
  upper: number[],
  betas: number[],
  minDebtFloor: number,
  targetBeta: number,
  betaTol: number
): number[] {
  const n = wRaw.length
  const w = [...wRaw]
  const htmIdx = MAJOR_9_KEYS.indexOf('만기보유채권')
  const cashIdx = MAJOR_9_KEYS.indexOf('현금성자산')

  // Alternating projections onto:
  // 1) Box [lower, upper]
  // 2) Debt floor: w[htm] + w[cash] >= minDebtFloor
  // 3) Beta band: targetBeta - betaTol <= sum(beta_i * w_i) <= targetBeta + betaTol
  // 4) Simplex sum(w_i) = 1
  for (let iter = 0; iter < 40; iter++) {
    // 1. Box bounds
    for (let i = 0; i < n; i++) {
      w[i] = Math.min(upper[i], Math.max(lower[i], w[i]))
    }

    // 2. Debt floor (HTM + Cash >= minDebtFloor)
    const debtSum = w[htmIdx] + w[cashIdx]
    if (debtSum < minDebtFloor) {
      const deficit = minDebtFloor - debtSum
      const addHtm = Math.min(upper[htmIdx] - w[htmIdx], deficit * 0.8)
      w[htmIdx] += addHtm
      const rem = deficit - addHtm
      const addCash = Math.min(upper[cashIdx] - w[cashIdx], rem)
      w[cashIdx] += addCash
    }

    // 3. Equity-equivalent beta band projection
    const curBeta = w.reduce((acc, wi, i) => acc + wi * betas[i], 0)
    const minBeta = targetBeta - betaTol
    const maxBeta = targetBeta + betaTol
    if (curBeta < minBeta || curBeta > maxBeta) {
      const desiredBeta = curBeta < minBeta ? minBeta : maxBeta
      const betaDiff = desiredBeta - curBeta
      const normSq = betas.reduce((acc, b) => acc + b * b, 0)
      if (normSq > 1e-8) {
        const step = betaDiff / normSq
        for (let i = 0; i < n; i++) {
          w[i] = Math.min(upper[i], Math.max(lower[i], w[i] + step * betas[i]))
        }
      }
    }

    // 4. Sum = 1 via bounded water-filling
    for (let s = 0; s < 12; s++) {
      const sum = w.reduce((a, b) => a + b, 0)
      const gap = 1.0 - sum
      if (Math.abs(gap) < 1e-7) break
      const adjustable = w
        .map((_, idx) => idx)
        .filter((idx) => (gap > 0 ? w[idx] < upper[idx] - 1e-9 : w[idx] > lower[idx] + 1e-9))
      if (adjustable.length === 0) break
      const delta = gap / adjustable.length
      for (const idx of adjustable) {
        w[idx] = Math.min(upper[idx], Math.max(lower[idx], w[idx] + delta))
      }
    }
  }

  // Final strict normalization
  const finalSum = w.reduce((a, b) => a + b, 0)
  if (finalSum > 0 && Math.abs(finalSum - 1.0) > 1e-6) {
    for (let i = 0; i < n; i++) w[i] /= finalSum
  }
  return w
}

function roundWeightsToHalfPct(
  rawWeights: Weights9,
  lowerPct: number[],
  upperPct: number[]
): Weights9 {
  const vals = MAJOR_9_KEYS.map((k, idx) => {
    const rounded = Math.round((rawWeights[k] ?? 0) * 2) / 2
    return Math.min(upperPct[idx], Math.max(lowerPct[idx], rounded))
  })

  // Adjust 0.5%p steps so total equals exactly 100.0%
  for (let iter = 0; iter < 100; iter++) {
    const sum = Number(vals.reduce((a, b) => a + b, 0).toFixed(2))
    const gap = Number((100.0 - sum).toFixed(2))
    if (Math.abs(gap) < 0.01) break

    const step = gap > 0 ? 0.5 : -0.5
    let bestIdx = -1
    let bestErr = -1

    for (let i = 0; i < vals.length; i++) {
      const cand = vals[i] + step
      if (cand < lowerPct[i] - 1e-6 || cand > upperPct[i] + 1e-6) continue
      const orig = rawWeights[MAJOR_9_KEYS[i]] ?? 0
      const improvement = Math.abs(vals[i] - orig) - Math.abs(cand - orig)
      if (bestIdx === -1 || improvement > bestErr) {
        bestErr = improvement
        bestIdx = i
      }
    }
    if (bestIdx === -1) break
    vals[bestIdx] = Number((vals[bestIdx] + step).toFixed(2))
  }

  const out = normalizeWeights9({})
  MAJOR_9_KEYS.forEach((k, idx) => {
    out[k] = Number(vals[idx].toFixed(2))
  })
  return out
}

export function computeBlackLittermanSAA(
  params: BlackLittermanParams = {}
): BlackLittermanResult {
  const ltcma = params.ltcma ?? DEFAULT_LTCMA_INPUTS
  const refWeights = params.refWeights ?? DEFAULT_REF_WEIGHTS_9
  const minDebtFloor = (params.minNonPensionDebtFloorPct ?? 13.83) / 100
  const targetBeta = (params.targetBetaEqPct ?? 75.0) / 100
  const betaTol = (params.betaTolerancePct ?? 2.0) / 100
  const maxIter = params.maxIterations ?? 400

  const n = MAJOR_9_KEYS.length
  const cov = buildCovarianceMatrix9(ltcma)
  const wRef = weightsToArray(refWeights)
  const lambda = ltcma.riskAversion || 2.45
  const tau = ltcma.tau || 0.05

  // 1. Implied equilibrium returns: Pi = lambda * Sigma * w_ref
  const pi = matVecMul(cov, wRef).map((v) => lambda * v)

  // Blend prior Pi with LTCMA view vector Q using diagonal Omega proportional to view uncertainty
  const tauSigma = cov.map((row) => row.map((v) => tau * v))
  const tauSigmaInv = matInvert(tauSigma)

  // P = Identity (9 absolute asset views)
  const omegaInv: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  const qVec: number[] = MAJOR_9_KEYS.map((k, idx) => {
    const asset = ltcma.assets[k]
    const viewRet = (asset?.blViewReturnPct ?? asset?.expectedReturnPct ?? 5) / 100
    const conf = Math.max(0.1, Math.min(0.95, asset?.viewConfidence ?? 0.6))
    // Higher confidence -> smaller Omega -> larger Omega^-1
    const baseVar = Math.max(1e-5, tau * cov[idx][idx])
    const omegaVar = baseVar * ((1 - conf) / conf)
    omegaInv[idx][idx] = 1 / omegaVar
    return viewRet
  })

  // Posterior covariance & mean:
  // mu_BL = (tauSigma^-1 + Omega^-1)^-1 * (tauSigma^-1 * Pi + Omega^-1 * Q)
  const precisionSum = tauSigmaInv.map((row, i) =>
    row.map((val, j) => val + omegaInv[i][j])
  )
  const posteriorCovPart = matInvert(precisionSum)
  const rhsPrior = matVecMul(tauSigmaInv, pi)
  const rhsView = matVecMul(omegaInv, qVec)
  const rhsTotal = rhsPrior.map((v, i) => v + rhsView[i])
  const muBL = matVecMul(posteriorCovPart, rhsTotal)

  // 2. Constrained utility maximization: max_w (muBL^T w - 0.5 * lambda * w^T Sigma w)
  const lowerPct = MAJOR_9_KEYS.map((k) => ltcma.assets[k]?.minWeightPct ?? 0)
  const upperPct = MAJOR_9_KEYS.map((k) => ltcma.assets[k]?.maxWeightPct ?? 100)
  const lower = lowerPct.map((v) => v / 100)
  const upper = upperPct.map((v) => v / 100)
  const betas = MAJOR_9_KEYS.map((k) => MAJOR_9_BETA_EQ[k])

  let w = projectToFeasibleSet(
    weightsToArray(DEFAULT_SAA_WEIGHTS_9),
    lower,
    upper,
    betas,
    minDebtFloor,
    targetBeta,
    betaTol
  )

  let converged = false
  const stepSize = 0.08
  for (let iter = 0; iter < maxIter; iter++) {
    const gradSigma = matVecMul(cov, w)
    const grad = muBL.map((mu, i) => mu - lambda * gradSigma[i])
    const candidate = w.map((wi, i) => wi + stepSize * grad[i])
    const next = projectToFeasibleSet(
      candidate,
      lower,
      upper,
      betas,
      minDebtFloor,
      targetBeta,
      betaTol
    )

    const maxChange = next.reduce((mx, val, i) => Math.max(mx, Math.abs(val - w[i])), 0)
    w = next
    if (maxChange < 1e-6) {
      converged = true
      break
    }
  }

  const rawOptimalWeights9 = arrayToWeights(w)
  const roundedWeights9 = roundWeightsToHalfPct(rawOptimalWeights9, lowerPct, upperPct)
  const riskMetrics = evaluateTpaRiskMetrics(roundedWeights9, refWeights, ltcma, {
    targetBetaEqPct: params.targetBetaEqPct ?? 75.0,
    betaTolerancePct: params.betaTolerancePct ?? 2.0,
  })

  const impliedReturnsPct = {} as Record<Major9Key, number>
  const posteriorReturnsPct = {} as Record<Major9Key, number>
  MAJOR_9_KEYS.forEach((k, idx) => {
    impliedReturnsPct[k] = Number((pi[idx] * 100).toFixed(2))
    posteriorReturnsPct[k] = Number((muBL[idx] * 100).toFixed(2))
  })

  return {
    rawOptimalWeights9,
    roundedWeights9,
    impliedReturnsPct,
    posteriorReturnsPct,
    riskMetrics,
    converged,
  }
}

// ---------------------------------------------------------------------------
// 2nd-Layer B: 4-Axis Scorecard TAA Engine
// ---------------------------------------------------------------------------

// Sensitivity of each asset class to the 4 macro scorecard axes:
// [cycle, inflationRates, valuationFx, policyEvent]
// Positive score (+1/+2) tilts pro-risk/inflation-hedge up when axis > 0
const TAA_AXIS_SENSITIVITY: Record<Major9Key, [number, number, number, number]> = {
  선진국주식: [1.8, -0.6, 1.8, 0.8],
  신흥국주식: [0.8, -0.4, 0.4, 0.3],
  국내주식: [0.9, -0.3, 0.6, 0.5],
  귀금속: [-0.8, -0.8, -0.6, -0.4],
  원자재: [0.6, 1.0, 0.4, 0.2],
  인컴자산: [0.4, -0.4, 0.5, 0.2],
  만기보유채권: [-1.4, 0.4, -1.2, -0.6],
  시장형채권: [-0.9, 1.0, -0.4, -0.3],
  현금성자산: [-1.4, 1.1, -1.1, -0.7],
}

const AXIS_WEIGHTS: [number, number, number, number] = [0.3, 0.3, 0.25, 0.15]

export interface TaaScorecardResult {
  weights9: Weights9
  tilts9: Weights9
  clippedAssets: Major9Key[]
  betaClipped: boolean
  riskMetrics: TpaRiskMetrics
}

export function computeTaaFromScorecard(
  saaWeights: Weights9,
  scorecard: TaaScorecard4Axis,
  guardrails: TaaGuardrails = {}
): TaaScorecardResult {
  const maxTilt = guardrails.maxAssetTiltPct ?? 5.0
  const refBeta = guardrails.refBetaPct ?? 75.0
  const maxBetaDev = guardrails.maxBetaDeviationPct ?? 7.5
  const minDebtFloor = guardrails.minNonPensionDebtFloorPct ?? 0

  const axes: [number, number, number, number] = [
    Math.max(-2, Math.min(2, Number(scorecard.cycle) || 0)),
    Math.max(-2, Math.min(2, Number(scorecard.inflationRates) || 0)),
    Math.max(-2, Math.min(2, Number(scorecard.valuationFx) || 0)),
    Math.max(-2, Math.min(2, Number(scorecard.policyEvent) || 0)),
  ]

  const isAllAxesZero = axes.every((v) => Math.abs(v) < 1e-9)
  const hasManual =
    scorecard.manualTilts &&
    Object.values(scorecard.manualTilts).some((v) => Math.abs(Number(v) || 0) > 1e-9)

  // Raw tilt computation
  const rawTilts = {} as Weights9
  const clippedAssets: Major9Key[] = []

  for (const k of MAJOR_9_KEYS) {
    const sens = TAA_AXIS_SENSITIVITY[k]
    const scoreTilt =
      (sens[0] * axes[0] * AXIS_WEIGHTS[0] +
        sens[1] * axes[1] * AXIS_WEIGHTS[1] +
        sens[2] * axes[2] * AXIS_WEIGHTS[2] +
        sens[3] * axes[3] * AXIS_WEIGHTS[3]) *
      2.0

    const manual = Number(scorecard.manualTilts?.[k] ?? 0)
    const combined = isAllAxesZero && !hasManual ? 0 : hasManual ? manual : scoreTilt

    // Enforce individual ±5%p guardrail and non-negativity
    const maxNeg = -(saaWeights[k] ?? 0)
    const clamped = Math.max(Math.max(-maxTilt, maxNeg), Math.min(maxTilt, combined))
    if (Math.abs(clamped - combined) > 0.05) {
      clippedAssets.push(k)
    }
    rawTilts[k] = Number(clamped.toFixed(2))
  }

  // Zero-sum rebalance tilts while respecting [max(-maxTilt, -saa), +maxTilt]
  const working = normalizeWeights9({})
  for (const k of MAJOR_9_KEYS) {
    working[k] = Math.max(0, (saaWeights[k] ?? 0) + rawTilts[k])
  }

  // Adjust sum to exactly 100.0%
  for (let iter = 0; iter < 30; iter++) {
    const sum = MAJOR_9_KEYS.reduce((a, k) => a + working[k], 0)
    const gap = 100.0 - sum
    if (Math.abs(gap) < 0.005) break

    const eligible = MAJOR_9_KEYS.filter((k) => {
      const upper = (saaWeights[k] ?? 0) + maxTilt
      const lower = Math.max(0, (saaWeights[k] ?? 0) - maxTilt)
      return gap > 0 ? working[k] < upper - 1e-4 : working[k] > lower + 1e-4
    })
    if (eligible.length === 0) break
    const step = gap / eligible.length
    for (const k of eligible) {
      const upper = (saaWeights[k] ?? 0) + maxTilt
      const lower = Math.max(0, (saaWeights[k] ?? 0) - maxTilt)
      working[k] = Math.min(upper, Math.max(lower, working[k] + step))
    }
  }

  // Enforce total equity-equivalent beta within [refBeta - maxBetaDev, refBeta + maxBetaDev]
  let betaClipped = false
  const minAllowedBeta = refBeta - maxBetaDev
  const maxAllowedBeta = refBeta + maxBetaDev

  for (let iter = 0; iter < 25; iter++) {
    const curBeta = computeEquityEqBeta(working)
    if (curBeta >= minAllowedBeta - 0.01 && curBeta <= maxAllowedBeta + 0.01) break
    betaClipped = true

    const needLowerBeta = curBeta > maxAllowedBeta
    // Shift 0.5%p between high-beta equities and low-beta bonds/cash within ±maxTilt
    const eqOrder: Major9Key[] = ['선진국주식', '국내주식', '신흥국주식', '원자재']
    const bondOrder: Major9Key[] = ['만기보유채권', '현금성자산', '시장형채권']
    const donors = needLowerBeta ? eqOrder : bondOrder
    const receivers = needLowerBeta ? bondOrder : eqOrder

    let moved = false
    for (const d of donors) {
      const dLower = Math.max(0, (saaWeights[d] ?? 0) - maxTilt)
      if (working[d] - 0.5 < dLower - 1e-6) continue
      for (const r of receivers) {
        const rUpper = (saaWeights[r] ?? 0) + maxTilt
        if (working[r] + 0.5 > rUpper + 1e-6) continue
        working[d] -= 0.5
        working[r] += 0.5
        moved = true
        break
      }
      if (moved) break
    }
    if (!moved) break
  }

  // Enforce optional non-pension debt floor (만기보유채권 + 현금성자산 >= minDebtFloor)
  if (minDebtFloor > 0) {
    const debtSum = working.만기보유채권 + working.현금성자산
    if (debtSum < minDebtFloor) {
      const need = minDebtFloor - debtSum
      const addHtm = Math.min(
        (saaWeights.만기보유채권 ?? 0) + maxTilt - working.만기보유채권,
        need
      )
      if (addHtm > 0) {
        working.만기보유채권 += addHtm
        // Deduct from 선진국주식 or 현금성자산
        const donorKey: Major9Key = working.선진국주식 >= addHtm ? '선진국주식' : '국내주식'
        working[donorKey] = Math.max(0, working[donorKey] - addHtm)
      }
    }
  }

  // Clean rounding to 0.5%p or 0.1%p
  const finalWeights = normalizeWeights9({})
  for (const k of MAJOR_9_KEYS) {
    finalWeights[k] = Number(working[k].toFixed(2))
  }
  const finalSum = MAJOR_9_KEYS.reduce((a, k) => a + finalWeights[k], 0)
  if (Math.abs(finalSum - 100.0) > 1e-4) {
    finalWeights.현금성자산 = Number((finalWeights.현금성자산 + (100.0 - finalSum)).toFixed(2))
  }

  const finalTilts = normalizeWeights9({})
  for (const k of MAJOR_9_KEYS) {
    finalTilts[k] = Number((finalWeights[k] - (saaWeights[k] ?? 0)).toFixed(2))
  }

  const riskMetrics = evaluateTpaRiskMetrics(finalWeights, DEFAULT_REF_WEIGHTS_9, DEFAULT_LTCMA_INPUTS, {
    targetBetaEqPct: refBeta,
    betaTolerancePct: maxBetaDev,
  })

  return {
    weights9: finalWeights,
    tilts9: finalTilts,
    clippedAssets,
    betaClipped,
    riskMetrics,
  }
}
