'use client'

import { useState, useMemo, useSyncExternalStore, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Tabs, TabItem } from '@/components/ui/tabs'
import {
  getLatestPortfolioSummary,
  getAlloTableRows,
  getAlmConfig,
  getAlmCashflowSchedules,
  getAllocationPolicies,
  saveAllocationPolicies,
  getAssetStrategyTags,
} from '@/lib/actions/db'
import { toast } from 'sonner'
import { LatestPortfolioSummary } from '@/lib/engine/types'
import {
  AccountAllocationLike,
  AccountLocationResult,
  AlmCashflowScheduleRow,
  AlmConfigRow,
  AssetStrategyTagRow,
  CorridorRule,
  HoldingLike,
  LtcmaModelInputs,
  MAJOR_9_ASSETS,
  MAJOR_9_KEYS,
  NON_PENSION_MORTGAGE_ACCOUNTS,
  TaaScorecard4Axis,
  Weights9,
  createZeroWeights9,
  normalizeWeights9,
  sumWeights9,
} from '@/lib/engine/alm-tpa-types'
import {
  DEFAULT_CORRIDOR_RULE,
  DEFAULT_LTCMA_INPUTS,
  DEFAULT_REF_WEIGHTS_9,
  DEFAULT_SAA_WEIGHTS_9,
  DEFAULT_TAA_SCORECARD_26Q4,
  DEFAULT_TAA_WEIGHTS_9,
} from '@/lib/engine/saa-taa-optimizer'
import { solveAccountLocation } from '@/lib/engine/location-solver'
import { AlmTpaBanner } from './_components/AlmTpaBanner'
import { SaaDesignerTab } from './_components/SaaDesignerTab'
import { TaaScorecardTab } from './_components/TaaScorecardTab'
import { AccountMatrixTab } from './_components/AccountMatrixTab'
import { ExecutionSummaryTab } from './_components/ExecutionSummaryTab'
import { CheckCircle2, Compass, Grid, Sliders } from 'lucide-react'

const TABS: TabItem[] = [
  { id: 'saa', label: '1. TPA · 장기 SAA 설계', icon: Compass },
  { id: 'taa', label: '2. 4축 TAA 스코어카드 & 확정', icon: Sliders },
  { id: 'matrix', label: '3. 11계좌 절세 자동배정 매트릭스', icon: Grid },
  { id: 'execution', label: '4. 허브 이체 & 매매 실행 요약', icon: CheckCircle2 },
]

const LOCAL_STORAGE_KEY_OVERRIDES = 'myasset_rebalancing_matrix_overrides_v1'
const EMPTY_OVERRIDES: Record<string, number> = {}
let cachedOverridesRaw: string | null = null
let cachedOverridesParsed: Record<string, number> = EMPTY_OVERRIDES
const overrideListeners = new Set<() => void>()

function subscribeOverrides(listener: () => void) {
  overrideListeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_STORAGE_KEY_OVERRIDES) listener()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    overrideListeners.delete(listener)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

function getOverridesSnapshot(): Record<string, number> {
  if (typeof window === 'undefined') return EMPTY_OVERRIDES
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY_OVERRIDES)
    if (raw === cachedOverridesRaw) return cachedOverridesParsed
    cachedOverridesRaw = raw
    cachedOverridesParsed = raw ? (JSON.parse(raw) as Record<string, number>) : EMPTY_OVERRIDES
    return cachedOverridesParsed
  } catch {
    return EMPTY_OVERRIDES
  }
}

function getOverridesServerSnapshot(): Record<string, number> {
  return EMPTY_OVERRIDES
}

function writeOverridesStorage(next: Record<string, number>) {
  if (typeof window === 'undefined') return
  try {
    if (Object.keys(next).length === 0) {
      window.localStorage.removeItem(LOCAL_STORAGE_KEY_OVERRIDES)
      cachedOverridesRaw = null
      cachedOverridesParsed = EMPTY_OVERRIDES
    } else {
      const raw = JSON.stringify(next)
      window.localStorage.setItem(LOCAL_STORAGE_KEY_OVERRIDES, raw)
      cachedOverridesRaw = raw
      cachedOverridesParsed = next
    }
  } catch {
    // ignore
  }
  overrideListeners.forEach((fn) => fn())
}

export default function AllocationStrategyPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('taa')
  const [unitMode, setUnitMode] = useState<'won' | 'man'>('man')

  // 1. Queries
  const { data: summary } = useQuery({
    queryKey: ['latest-portfolio-summary'],
    queryFn: async () => (await getLatestPortfolioSummary()) as LatestPortfolioSummary,
  })

  const { data: allocationPolicies = [] } = useQuery({
    queryKey: ['allocation-policies'],
    queryFn: async () => await getAllocationPolicies(),
  })

  const { data: alloRows = [] } = useQuery({
    queryKey: ['allo-table-rows'],
    queryFn: async () => (await getAlloTableRows()) as Array<Record<string, unknown>>,
  })

  const { data: almConfig = null } = useQuery({
    queryKey: ['alm-config'],
    queryFn: async () => (await getAlmConfig()) as AlmConfigRow | null,
  })

  const { data: cashflowSchedules = [] } = useQuery({
    queryKey: ['alm-cashflow-schedules'],
    queryFn: async () => (await getAlmCashflowSchedules()) as AlmCashflowScheduleRow[],
  })

  const { data: strategyTags = [] } = useQuery({
    queryKey: ['asset-strategy-tags'],
    queryFn: async () => (await getAssetStrategyTags()) as AssetStrategyTagRow[],
  })

  // 2. Derived portfolio amounts
  const accountAllo = useMemo(
    () => ((summary?.account_allocation || []) as unknown) as AccountAllocationLike[],
    [summary]
  )
  const holdings = useMemo(
    () => ((summary?.t_comm2 || []) as unknown) as HoldingLike[],
    [summary]
  )

  const currentTotalEval = useMemo(() => {
    const totalRow = accountAllo.find((r) => r.자산군 === '<합계>')
    return Number(totalRow?.합계) || 1
  }, [accountAllo])

  const { currentAmounts, currentWeights, nonPensionDebtBufferKrw } = useMemo(() => {
    const amounts = createZeroWeights9()
    let debtBuffer = 0
    const nonPensionSet = new Set<string>(NON_PENSION_MORTGAGE_ACCOUNTS)

    for (const major of MAJOR_9_ASSETS) {
      let amt = 0
      for (const sub of major.subRows) {
        const found = accountAllo.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        if (found) {
          amt += Number(found.합계) || 0
          if (major.key === '만기보유채권' || major.key === '현금성자산') {
            for (const acct of nonPensionSet) {
              debtBuffer += Number(found[acct] ?? 0) || 0
            }
          }
        }
      }
      amounts[major.key] = amt
    }

    const weights = createZeroWeights9()
    for (const k of MAJOR_9_KEYS) {
      weights[k] = currentTotalEval > 0 ? Number(((amounts[k] / currentTotalEval) * 100).toFixed(2)) : 0
    }
    return { currentAmounts: amounts, currentWeights: weights, nonPensionDebtBufferKrw: debtBuffer }
  }, [accountAllo, currentTotalEval])

  const satelliteSummary = useMemo(() => {
    const tagMap = new Map<string, AssetStrategyTagRow>()
    for (const t of strategyTags) tagMap.set(t.ticker_code, t)

    let satelliteAmt = 0
    let individualStockAmt = 0
    let maxSingleStockAmt = 0
    let maxSingleStockName = ''
    const clusterTotals: Record<string, number> = {}

    for (const h of holdings) {
      const code = h.종목코드
      if (!code) continue
      const val = Number(h.평가금액) || 0
      if (val <= 0) continue

      const tag = tagMap.get(code)
      const isSat =
        tag?.strategy_role === 'satellite' ||
        (!tag && h.자산군 === '주식' && h.세부자산군2 === '테마')
      if (isSat) satelliteAmt += val

      if (h.자산군 === '주식' && h.세부자산군2 === '종목') {
        individualStockAmt += val
        if (val > maxSingleStockAmt) {
          maxSingleStockAmt = val
          maxSingleStockName = h.상품명 || h.종목명 || code
        }
      }

      const cluster = tag?.factor_cluster
      if (cluster && cluster !== '현금/RP') {
        clusterTotals[cluster] = (clusterTotals[cluster] || 0) + val
      }
    }

    let maxClusterName = ''
    let maxClusterAmt = 0
    for (const [name, amt] of Object.entries(clusterTotals)) {
      if (amt > maxClusterAmt) {
        maxClusterAmt = amt
        maxClusterName = name
      }
    }

    const denom = Math.max(1, currentTotalEval)
    return {
      satellitePct: Number(((satelliteAmt / denom) * 100).toFixed(2)),
      maxClusterName,
      maxClusterPct: Number(((maxClusterAmt / denom) * 100).toFixed(2)),
      individualStockPct: Number(((individualStockAmt / denom) * 100).toFixed(2)),
      maxSingleStockName,
      maxSingleStockPct: Number(((maxSingleStockAmt / denom) * 100).toFixed(2)),
    }
  }, [holdings, strategyTags, currentTotalEval])

  // 3. Policy state (DB-derived defaults + user draft overlays, zero useEffect setState)
  const [expectedInflow, setExpectedInflow] = useState<number>(0)
  const targetTotalEval = currentTotalEval + expectedInflow

  const dbPolicyDefaults = useMemo(() => {
    const curRef = allocationPolicies.find((p) => p.policy_type === 'REF' && p.is_current)
    const curSaa = allocationPolicies.find((p) => p.policy_type === 'SAA' && p.is_current)
    const curTaa = allocationPolicies.find((p) => p.policy_type === 'TAA' && p.is_current)
    return {
      refWeights: curRef?.weights_9 ? normalizeWeights9(curRef.weights_9) : DEFAULT_REF_WEIGHTS_9,
      saaWeights: curSaa?.weights_9 ? normalizeWeights9(curSaa.weights_9) : DEFAULT_SAA_WEIGHTS_9,
      taaWeights: curTaa?.weights_9 ? normalizeWeights9(curTaa.weights_9) : DEFAULT_TAA_WEIGHTS_9,
      ltcmaInputs: curSaa?.ltcma_inputs || DEFAULT_LTCMA_INPUTS,
      scorecard: curTaa?.taa_scorecard || DEFAULT_TAA_SCORECARD_26Q4,
      corridorRule: curSaa?.corridor_rule || DEFAULT_CORRIDOR_RULE,
    }
  }, [allocationPolicies])

  const [saaDraft, setSaaDraft] = useState<Weights9 | null>(null)
  const [taaDraft, setTaaDraft] = useState<Weights9 | null>(null)
  const [ltcmaDraft, setLtcmaDraft] = useState<LtcmaModelInputs | null>(null)
  const [scorecardDraft, setScorecardDraft] = useState<TaaScorecard4Axis | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const refWeights = dbPolicyDefaults.refWeights
  const corridorRule: CorridorRule = dbPolicyDefaults.corridorRule
  const saaWeights = saaDraft ?? dbPolicyDefaults.saaWeights
  const taaWeights = taaDraft ?? dbPolicyDefaults.taaWeights
  const ltcmaInputs = ltcmaDraft ?? dbPolicyDefaults.ltcmaInputs
  const scorecard = scorecardDraft ?? dbPolicyDefaults.scorecard

  const setSaaWeights = useCallback(
    (next: Weights9 | ((prev: Weights9) => Weights9)) => {
      setSaaDraft((prev) => {
        const base = prev ?? dbPolicyDefaults.saaWeights
        return typeof next === 'function' ? next(base) : next
      })
    },
    [dbPolicyDefaults.saaWeights]
  )

  const setTaaWeights = useCallback(
    (next: Weights9 | ((prev: Weights9) => Weights9)) => {
      setTaaDraft((prev) => {
        const base = prev ?? dbPolicyDefaults.taaWeights
        return typeof next === 'function' ? next(base) : next
      })
    },
    [dbPolicyDefaults.taaWeights]
  )

  const setLtcmaInputs = useCallback((next: LtcmaModelInputs) => {
    setLtcmaDraft(next)
  }, [])

  const setScorecard = useCallback(
    (next: TaaScorecard4Axis | ((prev: TaaScorecard4Axis) => TaaScorecard4Axis)) => {
      setScorecardDraft((prev) => {
        const base = prev ?? dbPolicyDefaults.scorecard
        return typeof next === 'function' ? next(base) : next
      })
    },
    [dbPolicyDefaults.scorecard]
  )

  const mortgageFloorKrw = useMemo(() => {
    const mort = (almConfig?.liabilities || [])
      .filter((l) => l.repay_at_maturity && l.non_pension_only)
      .reduce((acc, l) => acc + (Number(l.principal_krw) || 0), 0)
    return mort > 0 ? mort : 70_000_000
  }, [almConfig])

  const minNonPensionDebtFloorPct = useMemo(
    () => Number(((mortgageFloorKrw / Math.max(1, currentTotalEval)) * 100).toFixed(2)),
    [mortgageFloorKrw, currentTotalEval]
  )

  const handleSavePolicies = async () => {
    const saaSum = sumWeights9(saaWeights)
    const taaSum = sumWeights9(taaWeights)
    if (Math.abs(saaSum - 100) > 0.05 || Math.abs(taaSum - 100) > 0.05) {
      toast.error(
        `SAA(${saaSum.toFixed(2)}%) 및 TAA(${taaSum.toFixed(2)}%) 합계가 100.00%여야 저장할 수 있습니다.`
      )
      return
    }

    setIsSaving(true)
    const toastId = 'save-policies'
    toast.loading('9대 정책(allocation_policies) 및 레거시 allo_table 동시 저장 중...', {
      id: toastId,
    })
    try {
      await saveAllocationPolicies({
        refWeights,
        saaWeights,
        taaWeights,
        corridorRule,
        ltcmaInputs,
        taaScorecard: scorecard,
      })
      toast.success('9대 정책 및 allo_table이 성공적으로 동기화 저장되었습니다!', {
        id: toastId,
      })
      setSaaDraft(null)
      setTaaDraft(null)
      setLtcmaDraft(null)
      setScorecardDraft(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['allocation-policies'] }),
        queryClient.invalidateQueries({ queryKey: ['allo-table-rows'] }),
      ])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '저장 실패'
      toast.error(`저장 오류: ${msg}`, { id: toastId })
    } finally {
      setIsSaving(false)
    }
  }

  // 4. Matrix & Solver state
  const [matrixStrategy, setMatrixStrategy] = useState<'TAA' | 'SAA'>('TAA')
  const [solverMode, setSolverMode] = useState<'no_sell' | 'tax_min_full'>('tax_min_full')
  const matrixOverrides = useSyncExternalStore(
    subscribeOverrides,
    getOverridesSnapshot,
    getOverridesServerSnapshot
  )
  const [lastSolverResult, setLastSolverResult] = useState<AccountLocationResult | null>(null)

  const updateMatrixOverride = (key: string, val: number, currentVal: number) => {
    const next = { ...matrixOverrides }
    if (Math.round(val) === Math.round(currentVal)) delete next[key]
    else next[key] = val
    writeOverridesStorage(next)
  }

  const handleResetMatrix = () => {
    if (!confirm('모든 셀의 조정 내역을 지우고 현재 보유현황으로 초기화하시겠습니까?')) return
    writeOverridesStorage(EMPTY_OVERRIDES)
    setLastSolverResult(null)
    toast.success('매트릭스가 현재 보유현황으로 초기화되었습니다.')
  }

  const handleRunAutoSolve = () => {
    const target9 = matrixStrategy === 'TAA' ? taaWeights : saaWeights
    const result = solveAccountLocation({
      accountAllocation: accountAllo,
      holdings,
      targetWeights9: target9,
      expectedInflowKrw: expectedInflow,
      mode: solverMode,
      mortgageFloorKrw,
      strategyTags,
    })

    writeOverridesStorage(result.matrixOverrides)
    setLastSolverResult(result)
    toast.success(
      `${solverMode === 'no_sell' ? '무매도 단방향' : '절세 우선'} 자동배정 초안 생성 완료 (매수 ${Math.round(
        result.totalBuyKrw / 10_000
      ).toLocaleString()}만 / 매도 ${Math.round(
        result.totalSellKrw / 10_000
      ).toLocaleString()}만 · 이체 ${result.transferPlan.length}건)`
    )
  }

  const executionAccountCount = useMemo(() => {
    const touched = new Set<string>()
    for (const key of Object.keys(matrixOverrides)) {
      const parts = key.split('_')
      const acct = parts[parts.length - 1]
      if (acct) touched.add(acct)
    }
    return touched.size
  }, [matrixOverrides])

  return (
    <div className="space-y-6">
      {/* 상단 ALM · TPA 통합 거버넌스 배너 */}
      <AlmTpaBanner
        currentTotalEval={currentTotalEval}
        almConfig={almConfig}
        currentWeights={currentWeights}
        saaWeights={saaWeights}
        taaWeights={taaWeights}
        nonPensionDebtBufferKrw={nonPensionDebtBufferKrw}
        satelliteSummary={satelliteSummary}
        unitMode={unitMode}
      />

      {/* 글로벌 4-탭 네비게이션 & 단위 토글 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 p-3 sm:p-4 rounded-2xl border border-slate-800 shadow-md">
        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          {Object.keys(matrixOverrides).length > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              배분 조정 {Object.keys(matrixOverrides).length}건
            </span>
          )}

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setUnitMode('man')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                unitMode === 'man'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              만원 단위
            </button>
            <button
              onClick={() => setUnitMode('won')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                unitMode === 'won'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              원 단위
            </button>
          </div>
        </div>
      </div>

      {/* 탭 1: TPA · 장기 SAA 설계 */}
      {activeTab === 'saa' && (
        <SaaDesignerTab
          currentTotalEval={currentTotalEval}
          currentAmounts={currentAmounts}
          currentWeights={currentWeights}
          refWeights={refWeights}
          saaWeights={saaWeights}
          setSaaWeights={setSaaWeights}
          ltcmaInputs={ltcmaInputs}
          setLtcmaInputs={setLtcmaInputs}
          corridorRule={corridorRule}
          minNonPensionDebtFloorPct={minNonPensionDebtFloorPct}
          satelliteMetrics={{
            satelliteWeightPct: satelliteSummary.satellitePct,
            maxSingleClusterPct: satelliteSummary.maxClusterPct,
            totalIndividualStockPct: satelliteSummary.individualStockPct,
            maxSingleStockPct: satelliteSummary.maxSingleStockPct,
          }}
          allocationPolicies={allocationPolicies}
          alloRows={alloRows}
          unitMode={unitMode}
          onSavePolicies={handleSavePolicies}
          isSaving={isSaving}
        />
      )}

      {/* 탭 2: 4축 TAA 스코어카드 & 목표 확정 */}
      {activeTab === 'taa' && (
        <TaaScorecardTab
          currentTotalEval={currentTotalEval}
          expectedInflow={expectedInflow}
          setExpectedInflow={setExpectedInflow}
          currentAmounts={currentAmounts}
          currentWeights={currentWeights}
          refWeights={refWeights}
          saaWeights={saaWeights}
          taaWeights={taaWeights}
          setTaaWeights={setTaaWeights}
          scorecard={scorecard}
          setScorecard={setScorecard}
          corridorRule={corridorRule}
          ltcmaInputs={ltcmaInputs}
          minNonPensionDebtFloorPct={minNonPensionDebtFloorPct}
          cashflowSchedules={cashflowSchedules}
          unitMode={unitMode}
          onSavePolicies={handleSavePolicies}
          onResetFromDb={() => {
            setSaaDraft(null)
            setTaaDraft(null)
            setLtcmaDraft(null)
            setScorecardDraft(null)
            toast.success('DB에 저장된 현행 정책 비중으로 복원했습니다.')
          }}
          isSaving={isSaving}
        />
      )}

      {/* 탭 3: 11계좌 절세 자동배정 매트릭스 */}
      {activeTab === 'matrix' && (
        <AccountMatrixTab
          accountAllo={accountAllo}
          currentTotalEval={currentTotalEval}
          targetTotalEval={targetTotalEval}
          expectedInflow={expectedInflow}
          currentAmounts={currentAmounts}
          saaWeights={saaWeights}
          taaWeights={taaWeights}
          matrixStrategy={matrixStrategy}
          setMatrixStrategy={setMatrixStrategy}
          matrixOverrides={matrixOverrides}
          updateMatrixOverride={updateMatrixOverride}
          onResetMatrix={handleResetMatrix}
          solverMode={solverMode}
          setSolverMode={setSolverMode}
          onRunAutoSolve={handleRunAutoSolve}
          lastSolverResult={lastSolverResult}
          executionCount={executionAccountCount}
          onGoExecution={() => setActiveTab('execution')}
          unitMode={unitMode}
        />
      )}

      {/* 탭 4: 허브 이체 & 매매 실행 요약 */}
      {activeTab === 'execution' && (
        <ExecutionSummaryTab
          accountAllo={accountAllo}
          holdings={holdings}
          strategyTags={strategyTags}
          matrixOverrides={matrixOverrides}
          expectedInflow={expectedInflow}
          lastSolverResult={lastSolverResult}
          onBackToMatrix={() => setActiveTab('matrix')}
          unitMode={unitMode}
        />
      )}
    </div>
  )
}
