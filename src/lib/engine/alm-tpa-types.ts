export const MAJOR_9_KEYS = [
  '선진국주식',
  '신흥국주식',
  '국내주식',
  '귀금속',
  '원자재',
  '인컴자산',
  '만기보유채권',
  '시장형채권',
  '현금성자산',
] as const

export type Major9Key = (typeof MAJOR_9_KEYS)[number]

export type Weights9 = Record<Major9Key, number>

export type Allo6ColKey =
  | '해외주식'
  | '국내주식'
  | '실물자산'
  | '인컴자산'
  | '만기보유채권'
  | '시장형채권'

export interface Allo6Input {
  국내주식: number
  해외주식: number
  만기보유채권: number
  시장형채권: number
  실물자산: number
  인컴자산: number
}

export interface LeafSubRowDef {
  자산군: string
  세부자산군: string
  세부자산군2: string
  name: string
}

export interface Major9AssetDef {
  key: Major9Key
  label: string
  shortLabel: string
  betaEq: number
  alloDbCol: Allo6ColKey | null
  color: string
  subRows: LeafSubRowDef[]
}

export const MAJOR_9_ASSETS: Major9AssetDef[] = [
  {
    key: '선진국주식',
    label: '1. 선진국주식',
    shortLabel: '선진국',
    betaEq: 1.0,
    alloDbCol: '해외주식',
    color: '#38bdf8',
    subRows: [
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', name: '선진국 인덱스' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '종목', name: '선진국 종목' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '테마', name: '선진국 테마' },
    ],
  },
  {
    key: '신흥국주식',
    label: '2. 신흥국주식',
    shortLabel: '신흥국',
    betaEq: 1.05,
    alloDbCol: '국내주식',
    color: '#10b981',
    subRows: [
      { 자산군: '주식', 세부자산군: '신흥국', 세부자산군2: '인덱스', name: '신흥국 인덱스' },
      { 자산군: '주식', 세부자산군: '신흥국', 세부자산군2: '테마', name: '신흥국 테마' },
      { 자산군: '주식', 세부자산군: '신흥국', 세부자산군2: '종목', name: '신흥국 종목' },
    ],
  },
  {
    key: '국내주식',
    label: '3. 국내주식',
    shortLabel: '국내주식',
    betaEq: 1.05,
    alloDbCol: '국내주식',
    color: '#34d399',
    subRows: [
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', name: '국내 인덱스' },
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '종목', name: '국내 종목' },
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '테마', name: '국내 테마' },
    ],
  },
  {
    key: '귀금속',
    label: '4. 귀금속 (금현물)',
    shortLabel: '귀금속',
    betaEq: 0.45,
    alloDbCol: '실물자산',
    color: '#fbbf24',
    subRows: [
      { 자산군: '대체자산', 세부자산군: '실물자산', 세부자산군2: '귀금속', name: '실물자산 귀금속' },
    ],
  },
  {
    key: '원자재',
    label: '5. 원자재',
    shortLabel: '원자재',
    betaEq: 0.6,
    alloDbCol: '실물자산',
    color: '#f97316',
    subRows: [
      { 자산군: '대체자산', 세부자산군: '실물자산', 세부자산군2: '원자재', name: '실물자산 원자재' },
    ],
  },
  {
    key: '인컴자산',
    label: '6. 인컴자산',
    shortLabel: '인컴자산',
    betaEq: 0.55,
    alloDbCol: '인컴자산',
    color: '#a78bfa',
    subRows: [
      { 자산군: '대체자산', 세부자산군: '인컴자산', 세부자산군2: '국내', name: '인컴자산 국내' },
      { 자산군: '대체자산', 세부자산군: '인컴자산', 세부자산군2: '해외', name: '인컴자산 해외' },
    ],
  },
  {
    key: '만기보유채권',
    label: '7. 만기보유채권',
    shortLabel: '만기채권',
    betaEq: 0.15,
    alloDbCol: '만기보유채권',
    color: '#818cf8',
    subRows: [
      { 자산군: '채권', 세부자산군: '만기보유', 세부자산군2: '안전자산', name: '만기보유 안전자산' },
      { 자산군: '채권', 세부자산군: '만기보유', 세부자산군2: '크레딧', name: '만기보유 크레딧' },
    ],
  },
  {
    key: '시장형채권',
    label: '8. 시장형채권',
    shortLabel: '시장채권',
    betaEq: 0.05,
    alloDbCol: '시장형채권',
    color: '#60a5fa',
    subRows: [
      { 자산군: '채권', 세부자산군: '시장형', 세부자산군2: '국내', name: '시장형 국내' },
      { 자산군: '채권', 세부자산군: '시장형', 세부자산군2: '해외', name: '시장형 해외' },
    ],
  },
  {
    key: '현금성자산',
    label: '9. 현금성자산',
    shortLabel: '현금성',
    betaEq: 0.0,
    alloDbCol: null,
    color: '#94a3b8',
    subRows: [
      { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '원화상품', name: '금융상품 원화상품' },
      { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '단기ETF', name: '금융상품 단기ETF' },
      { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '외화상품', name: '금융상품 외화상품' },
      { 자산군: '현금성', 세부자산군: '현금', 세부자산군2: '원화', name: '현금 원화' },
      { 자산군: '현금성', 세부자산군: '현금', 세부자산군2: '외환', name: '현금 외환' },
    ],
  },
]

export const MAJOR_9_BETA_EQ: Record<Major9Key, number> = {
  선진국주식: 1.0,
  신흥국주식: 1.05,
  국내주식: 1.05,
  귀금속: 0.45,
  원자재: 0.6,
  인컴자산: 0.55,
  만기보유채권: 0.15,
  시장형채권: 0.05,
  현금성자산: 0.0,
}

export type TaxWrapperType =
  | 'general'
  | 'gold_tax_free'
  | 'isa'
  | 'pension_savings'
  | 'dc'
  | 'irp'
  | 'child_general'

export interface AccountIpsRule {
  account: string
  owner: '본인' | '배우자' | '자녀'
  taxWrapper: TaxWrapperType
  isHub: boolean
  withdrawalAllowed: boolean
  allowNewContribution: boolean
  fundedFromHub?: string
  annualContributionCapKrw?: number | null
  remainingTotalContributionCapKrw?: number | null
  inflowHorizonYears?: number | null
  maturityYear?: number | null
  fxOnly: boolean
  allowForeignCurrency: boolean
  allowIndividualStock: boolean
  riskyAssetLimit: number | null
  allowedMajor9: Major9Key[]
  exclusiveMajor9?: Major9Key
  sellTaxPenalty: number
  priorityForHtm: number | null
  role: string
}

export const ACCOUNT_IPS_RULES: Record<string, AccountIpsRule> = {
  한투: {
    account: '한투',
    owner: '본인',
    taxWrapper: 'general',
    isHub: true,
    withdrawalAllowed: true,
    allowNewContribution: true,
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: true,
    riskyAssetLimit: null,
    allowedMajor9: ['국내주식', '만기보유채권', '현금성자산'],
    sellTaxPenalty: 0.15,
    priorityForHtm: 1,
    role: '중앙 자금 허브 · 국내주식형 · 만기보유채권 · 현금성 전용',
  },
  금현물: {
    account: '금현물',
    owner: '본인',
    taxWrapper: 'gold_tax_free',
    isHub: false,
    withdrawalAllowed: true,
    allowNewContribution: true,
    fundedFromHub: '한투',
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: false,
    riskyAssetLimit: null,
    allowedMajor9: ['귀금속', '현금성자산'],
    exclusiveMajor9: '귀금속',
    sellTaxPenalty: 0.0,
    priorityForHtm: null,
    role: 'KRX 금현물 비과세 귀금속 독점 계좌 (한투 허브 이체)',
  },
  불리오: {
    account: '불리오',
    owner: '본인',
    taxWrapper: 'general',
    isHub: false,
    withdrawalAllowed: true,
    allowNewContribution: true,
    fundedFromHub: '한투',
    fxOnly: true,
    allowForeignCurrency: true,
    allowIndividualStock: true,
    riskyAssetLimit: null,
    allowedMajor9: ['선진국주식', '신흥국주식', '원자재', '인컴자산', '시장형채권', '현금성자산'],
    sellTaxPenalty: 0.22,
    priorityForHtm: null,
    role: '외화(USD·JPY) 직접투자 전용 · 원화는 일시적 현금성만 보유',
  },
  한투ISA: {
    account: '한투ISA',
    owner: '본인',
    taxWrapper: 'isa',
    isHub: false,
    withdrawalAllowed: false,
    allowNewContribution: false,
    maturityYear: 2029,
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: false,
    riskyAssetLimit: null,
    allowedMajor9: [
      '선진국주식',
      '신흥국주식',
      '국내주식',
      '원자재',
      '인컴자산',
      '만기보유채권',
      '시장형채권',
      '현금성자산',
    ],
    sellTaxPenalty: 0.0,
    priorityForHtm: 2,
    role: '중개형 ISA (추가납입 불가 폐쇄풀 · 외화/금 제외 전 자산 · 만기채 허용)',
  },
  엔투ISA: {
    account: '엔투ISA',
    owner: '배우자',
    taxWrapper: 'isa',
    isHub: false,
    withdrawalAllowed: false,
    allowNewContribution: true,
    fundedFromHub: '한투',
    annualContributionCapKrw: 20_000_000,
    remainingTotalContributionCapKrw: 60_000_000,
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: false,
    riskyAssetLimit: null,
    allowedMajor9: [
      '선진국주식',
      '신흥국주식',
      '국내주식',
      '원자재',
      '인컴자산',
      '시장형채권',
      '현금성자산',
    ],
    sellTaxPenalty: 0.0,
    priorityForHtm: null,
    role: '배우자 중개형 ISA (연 2,000만/총 6,000만 추가납입 가능 · 외화/금/만기채 제외)',
  },
  한투연금저축: {
    account: '한투연금저축',
    owner: '본인',
    taxWrapper: 'pension_savings',
    isHub: false,
    withdrawalAllowed: false,
    allowNewContribution: false,
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: false,
    riskyAssetLimit: null,
    allowedMajor9: ['선진국주식', '신흥국주식', '원자재', '인컴자산', '시장형채권', '현금성자산'],
    sellTaxPenalty: 0.0,
    priorityForHtm: null,
    role: '개인연금저축 (추가납입 없음 · 인출잠금 · 국내주식/금/개별주/만기채/외화 불가)',
  },
  엔투저축연금: {
    account: '엔투저축연금',
    owner: '배우자',
    taxWrapper: 'pension_savings',
    isHub: false,
    withdrawalAllowed: false,
    allowNewContribution: true,
    inflowHorizonYears: 13,
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: false,
    riskyAssetLimit: null,
    allowedMajor9: ['선진국주식', '신흥국주식', '원자재', '인컴자산', '시장형채권', '현금성자산'],
    sellTaxPenalty: 0.0,
    priorityForHtm: null,
    role: '배우자 연금저축 (13년 납입 · 인출잠금 · 국내주식/금/개별주/만기채/외화 불가)',
  },
  미래DC: {
    account: '미래DC',
    owner: '본인',
    taxWrapper: 'dc',
    isHub: false,
    withdrawalAllowed: false,
    allowNewContribution: true,
    inflowHorizonYears: 13,
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: false,
    riskyAssetLimit: 0.7,
    allowedMajor9: ['선진국주식', '신흥국주식', '원자재', '인컴자산', '시장형채권', '현금성자산'],
    sellTaxPenalty: 0.0,
    priorityForHtm: null,
    role: '퇴직연금 DC (13년 매년초 적립 · 위험자산 70% 한도 · 국내주식/금/개별주/만기채 불가)',
  },
  농협IRP: {
    account: '농협IRP',
    owner: '본인',
    taxWrapper: 'irp',
    isHub: false,
    withdrawalAllowed: false,
    allowNewContribution: true,
    inflowHorizonYears: 18,
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: false,
    riskyAssetLimit: 0.7,
    allowedMajor9: ['선진국주식', '신흥국주식', '원자재', '인컴자산', '시장형채권', '현금성자산'],
    sellTaxPenalty: 0.0,
    priorityForHtm: null,
    role: '개인형 퇴직연금 IRP (18년 매월 납입 · 위험자산 70% 한도 · 국내주식/금/개별주/만기채 불가)',
  },
  엔투IRP: {
    account: '엔투IRP',
    owner: '배우자',
    taxWrapper: 'irp',
    isHub: false,
    withdrawalAllowed: false,
    allowNewContribution: true,
    inflowHorizonYears: 13,
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: false,
    riskyAssetLimit: 0.7,
    allowedMajor9: ['선진국주식', '신흥국주식', '원자재', '인컴자산', '시장형채권', '현금성자산'],
    sellTaxPenalty: 0.0,
    priorityForHtm: null,
    role: '배우자 IRP (13년 매년초 납입 · 위험자산 70% 한도 · 국내주식/금/개별주/만기채 불가)',
  },
  엔투하영: {
    account: '엔투하영',
    owner: '자녀',
    taxWrapper: 'child_general',
    isHub: false,
    withdrawalAllowed: false,
    allowNewContribution: true,
    fundedFromHub: '한투',
    remainingTotalContributionCapKrw: 50_000_000,
    fxOnly: false,
    allowForeignCurrency: false,
    allowIndividualStock: true,
    riskyAssetLimit: null,
    allowedMajor9: ['국내주식', '현금성자산'],
    sellTaxPenalty: 0.15,
    priorityForHtm: null,
    role: '자녀 계좌 (국내주식 ETF·종목 전용 초장기 · 10년 내 5,000만 증여 한도 · 한투 허브 이체)',
  },
}

export const PENSION_ACCOUNTS = [
  '한투연금저축',
  '엔투저축연금',
  '미래DC',
  '농협IRP',
  '엔투IRP',
] as const

export const NON_PENSION_WITHDRAWABLE_ACCOUNTS = ['한투', '한투ISA', '불리오', '금현물'] as const

export const NON_PENSION_MORTGAGE_ACCOUNTS = ['한투', '한투ISA', '불리오'] as const

export const DEFAULT_PENSION_SAFE_CODES = new Set<string>([
  '0025N0',
  '0082V0',
  'K55210CO3828',
  '0019K0',
])

export function isPensionSafeName(name: string): boolean {
  return /(TDF|채권혼합|TRF)/i.test(name)
}

export function createZeroWeights9(): Weights9 {
  return {
    선진국주식: 0,
    신흥국주식: 0,
    국내주식: 0,
    귀금속: 0,
    원자재: 0,
    인컴자산: 0,
    만기보유채권: 0,
    시장형채권: 0,
    현금성자산: 0,
  }
}

export function normalizeWeights9(raw: Partial<Record<string, number>>): Weights9 {
  const out = createZeroWeights9()
  for (const key of MAJOR_9_KEYS) {
    const val = Number(raw[key] ?? 0)
    out[key] = Number.isFinite(val) ? val : 0
  }
  return out
}

export function sumWeights9(weights: Weights9): number {
  return MAJOR_9_KEYS.reduce((acc, k) => acc + (Number(weights[k]) || 0), 0)
}

export function computeEquityEqBeta(weights: Weights9): number {
  let beta = 0
  for (const k of MAJOR_9_KEYS) {
    beta += (Number(weights[k]) || 0) * MAJOR_9_BETA_EQ[k]
  }
  return Number((Math.round((beta + 1e-9) * 100) / 100).toFixed(2))
}

export function aggregate9ToAllo6(weights: Weights9): Allo6Input {
  return {
    해외주식: Number((weights.선진국주식 || 0).toFixed(2)),
    국내주식: Number(((weights.국내주식 || 0) + (weights.신흥국주식 || 0)).toFixed(2)),
    실물자산: Number(((weights.귀금속 || 0) + (weights.원자재 || 0)).toFixed(2)),
    인컴자산: Number((weights.인컴자산 || 0).toFixed(2)),
    만기보유채권: Number((weights.만기보유채권 || 0).toFixed(2)),
    시장형채권: Number((weights.시장형채권 || 0).toFixed(2)),
  }
}

export function classifyLeafToMajor9(
  assetClass: string,
  subClass1: string,
  subClass2: string
): Major9Key {
  if (assetClass === '주식') {
    if (subClass1 === '선진국') return '선진국주식'
    if (subClass1 === '신흥국') return '신흥국주식'
    if (subClass1 === '국내') return '국내주식'
  }
  if (assetClass === '대체자산') {
    if (subClass1 === '실물자산') {
      return subClass2 === '귀금속' ? '귀금속' : '원자재'
    }
    if (subClass1 === '인컴자산') return '인컴자산'
  }
  if (assetClass === '채권') {
    if (subClass1 === '만기보유') return '만기보유채권'
    if (subClass1 === '시장형') return '시장형채권'
  }
  return '현금성자산'
}

export interface CorridorRule {
  max_abs_pct: number
  min_abs_pct: number
  relative_ratio: number
}

export interface AssetCorridorStatus {
  key: Major9Key
  currentPct: number
  targetPct: number
  diffPct: number
  bandPct: number
  lowerBoundPct: number
  upperBoundPct: number
  status: 'OK' | 'WARNING' | 'CRITICAL'
}

export interface LtcmaAssetInput {
  expectedReturnPct: number
  volatilityPct: number
  minWeightPct: number
  maxWeightPct: number
  blViewReturnPct: number
  viewConfidence: number
}

export interface LtcmaModelInputs {
  horizonYears: number
  riskAversion: number
  tau: number
  shrinkageLambda: number
  assets: Record<Major9Key, LtcmaAssetInput>
}

export interface TaaScorecard4Axis {
  regimeLabel?: string
  cycle: number
  inflationRates: number
  valuationFx: number
  policyEvent: number
  manualTilts?: Partial<Record<Major9Key, number>>
  notes?: string
}

export interface TaaGuardrails {
  maxAssetTiltPct?: number
  refBetaPct?: number
  maxBetaDeviationPct?: number
  minNonPensionDebtFloorPct?: number
}

export interface TpaRiskAlert {
  level: 'info' | 'warning' | 'critical'
  code: string
  message: string
}

export interface TpaRiskMetrics {
  expectedReturnPct: number
  volatilityPct: number
  equityEqBetaPct: number
  trackingErrorPct: number
  sharpeEstimate: number
  riskContributionsPct: Record<Major9Key, number>
  rcToWeightRatio: Record<Major9Key, number>
  alerts: TpaRiskAlert[]
}

export interface AlmLiability {
  id: string
  title: string
  principal_krw: number
  annual_rate_pct: number
  rate_type: 'fixed' | 'floating_deposit'
  start_date: string
  maturity_date: string | null
  repay_at_maturity: boolean
  non_pension_only: boolean
  note?: string
}

export interface AlmGlidePathStage {
  stage: string
  age_start: number
  age_end: number
  equity_ref_pct: number
  bond_ref_pct: number
  annual_step_pct: number
  note?: string
}

export interface AlmTaxOffsets {
  spouse_external_pension_insurance_krw?: number
  pension_tax_credit_limit_krw?: number
  note?: string
}

export interface AlmConfigRow {
  id: string
  birth_year: number
  accumulation_end_age: number
  pension_start_age: number
  max_tolerable_mdd_pct: number
  liabilities: AlmLiability[]
  glide_path: AlmGlidePathStage[]
  tax_offsets: AlmTaxOffsets
  updated_at?: string
}

export type AlmFlowType =
  | 'salary_saving'
  | 'employer_pension'
  | 'personal_pension'
  | 'debt_interest'
  | 'debt_principal'
  | 'child_handover'

export type AlmCadence = 'monthly' | 'annual_jan' | 'annual_dec' | 'one_off'

export interface AlmCashflowScheduleRow {
  id?: number
  title: string
  account: string
  flow_type: AlmFlowType
  cadence: AlmCadence
  amount_krw: number
  growth_rate_pct: number
  start_date: string
  end_date: string | null
  is_active: boolean
  note?: string | null
  created_at?: string
  updated_at?: string
}

export interface AllocationPolicyRow {
  id?: number
  effective_date: string
  policy_type: 'REF' | 'SAA' | 'TAA'
  weights_9: Weights9
  corridor_rule: CorridorRule
  ltcma_inputs: LtcmaModelInputs | null
  taa_scorecard: TaaScorecard4Axis | null
  equity_eq_beta_pct: number | null
  rationale: string | null
  is_current: boolean
  created_at?: string
  updated_at?: string
}

export type StrategyRole = 'core' | 'satellite' | 'cash'

export interface AssetStrategyTagRow {
  ticker_code: string
  asset_name: string
  strategy_role: StrategyRole
  factor_cluster: string | null
  economic_currency: string | null
  is_pension_safe_override: boolean
  equity_beta_override: number | null
  updated_at?: string
}

export interface AccountAllocationLike {
  자산군: string
  세부자산군: string
  세부자산군2: string
  합계?: number
  비중?: number
  [account: string]: string | number | undefined
}

export interface HoldingLike {
  계좌: string
  종목코드: string
  종목명?: string
  상품명?: string
  자산군: string
  세부자산군: string
  세부자산군2: string
  통화?: string
  보유수량?: number
  장부금액?: number
  현재가?: number
  평가금액?: number
  평가수익률?: number
}

export interface TransferInstruction {
  fromAccount: string
  toAccount: string
  amountKrw: number
  reason: string
}

export interface AccountOrderHint {
  account: string
  major9: Major9Key
  rowKey: string
  rowLabel: string
  deltaKrw: number
  direction: 'BUY' | 'SELL'
  suggestedTicker?: string
  suggestedName?: string
  currentPriceKrw?: number
  estimatedShares?: number
  taxNote: string
}

export interface ConstraintViolation {
  severity: 'error' | 'warning' | 'info'
  account?: string
  code: string
  message: string
}

export interface AccountLocationSummary {
  account: string
  currentTotalKrw: number
  targetTotalKrw: number
  netFlowKrw: number
  internalBuyKrw: number
  internalSellKrw: number
  dcIrpRiskyRatioPct?: number
}

export interface AccountLocationRequest {
  accountAllocation: AccountAllocationLike[]
  holdings?: HoldingLike[]
  targetWeights9: Weights9
  expectedInflowKrw: number
  mode: 'no_sell' | 'tax_min_full'
  mortgageFloorKrw?: number
  strategyTags?: AssetStrategyTagRow[]
}

export interface AccountLocationResult {
  mode: 'no_sell' | 'tax_min_full'
  matrixOverrides: Record<string, number>
  accountDeltas9: Record<string, Weights9>
  transferPlan: TransferInstruction[]
  orderHints: AccountOrderHint[]
  accountSummaries: AccountLocationSummary[]
  violations: ConstraintViolation[]
  nonPensionDebtBufferBeforeKrw: number
  nonPensionDebtBufferAfterKrw: number
  totalBuyKrw: number
  totalSellKrw: number
  unallocatedGapByMajor9: Weights9
}
