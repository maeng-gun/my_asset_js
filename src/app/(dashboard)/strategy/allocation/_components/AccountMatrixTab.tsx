'use client'

import { Fragment, useMemo, useState } from 'react'
import { Card, CardBody } from '@/components/ui/card'
import {
  ACCOUNT_IPS_RULES,
  AccountAllocationLike,
  AccountLocationResult,
  MAJOR_9_ASSETS,
  Major9Key,
  NON_PENSION_MORTGAGE_ACCOUNTS,
  Weights9,
} from '@/lib/engine/alm-tpa-types'
import { ALLOCATION_ACCOUNTS } from '@/lib/engine/types'
import { formatKRW } from '@/lib/utils'
import { toast } from 'sonner'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Wand2,
  X,
} from 'lucide-react'

interface AccountMatrixTabProps {
  accountAllo: AccountAllocationLike[]
  currentTotalEval: number
  targetTotalEval: number
  expectedInflow: number
  currentAmounts: Record<Major9Key, number>
  saaWeights: Weights9
  taaWeights: Weights9
  matrixStrategy: 'TAA' | 'SAA'
  setMatrixStrategy: (s: 'TAA' | 'SAA') => void
  matrixOverrides: Record<string, number>
  updateMatrixOverride: (key: string, val: number, currentVal: number) => void
  onResetMatrix: () => void
  solverMode: 'no_sell' | 'tax_min_full'
  setSolverMode: (m: 'no_sell' | 'tax_min_full') => void
  onRunAutoSolve: () => void
  lastSolverResult: AccountLocationResult | null
  executionCount: number
  onGoExecution: () => void
  unitMode: 'won' | 'man'
}

export function AccountMatrixTab({
  accountAllo,
  currentTotalEval,
  targetTotalEval,
  expectedInflow,
  currentAmounts,
  saaWeights,
  taaWeights,
  matrixStrategy,
  setMatrixStrategy,
  matrixOverrides,
  updateMatrixOverride,
  onResetMatrix,
  solverMode,
  setSolverMode,
  onRunAutoSolve,
  lastSolverResult,
  executionCount,
  onGoExecution,
  unitMode,
}: AccountMatrixTabProps) {
  const [matrixViewMode, setMatrixViewMode] = useState<'combined' | 'deltaOnly'>('combined')
  const [editingCell, setEditingCell] = useState<{
    rowKey: string
    rowLabel: string
    account: string
    majorKey: Major9Key
    currentVal: number
    targetVal: number
  } | null>(null)
  const [editInputVal, setEditInputVal] = useState('')
  const [editDeltaInputVal, setEditDeltaInputVal] = useState('')

  const fmtMoney = (val: number | null | undefined, withUnit = false): string => {
    if (val === null || val === undefined || isNaN(val)) return '0'
    if (unitMode === 'man') {
      return Math.round(val / 10_000).toLocaleString('ko-KR') + (withUnit ? ' 만원' : '')
    }
    return Math.round(val).toLocaleString('ko-KR') + (withUnit ? ' 원' : '')
  }

  const fmtDelta = (val: number | null | undefined, withUnit = false): string => {
    if (val === null || val === undefined || isNaN(val)) return '0'
    const sign = val > 0 ? '+' : ''
    return `${sign}${fmtMoney(val, withUnit)}`
  }

  // Target trade amounts per 9 major assets
  const targetTradeByMajor9 = useMemo(() => {
    const out = {} as Record<Major9Key, number>
    const activeWeights = matrixStrategy === 'TAA' ? taaWeights : saaWeights
    for (const m of MAJOR_9_ASSETS) {
      const targetAmt = targetTotalEval * ((activeWeights[m.key] || 0) / 100)
      out[m.key] = targetAmt - (currentAmounts[m.key] || 0)
    }
    return out
  }, [matrixStrategy, taaWeights, saaWeights, targetTotalEval, currentAmounts])

  // Allocated deltas per 9 major assets
  const majorAllocatedDeltas = useMemo(() => {
    const allocated = {} as Record<Major9Key, number>
    for (const major of MAJOR_9_ASSETS) {
      allocated[major.key] = 0
      for (const sub of major.subRows) {
        const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
        const found = accountAllo.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        for (const acct of ALLOCATION_ACCOUNTS) {
          const curVal = Number(found?.[acct] ?? 0) || 0
          const cellKey = `${rowKey}_${acct}`
          const targetVal =
            matrixOverrides[cellKey] !== undefined ? matrixOverrides[cellKey] : curVal
          allocated[major.key] += targetVal - curVal
        }
      }
    }
    return allocated
  }, [accountAllo, matrixOverrides])

  // Account totals and net deltas
  const accountDeltas = useMemo(() => {
    const curMap: Record<string, number> = {}
    const targetMap: Record<string, number> = {}
    const deltaMap: Record<string, number> = {}
    for (const acct of ALLOCATION_ACCOUNTS) {
      curMap[acct] = 0
      targetMap[acct] = 0
      deltaMap[acct] = 0
    }

    for (const major of MAJOR_9_ASSETS) {
      for (const sub of major.subRows) {
        const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
        const found = accountAllo.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        for (const acct of ALLOCATION_ACCOUNTS) {
          const curVal = Number(found?.[acct] ?? 0) || 0
          const cellKey = `${rowKey}_${acct}`
          const targetVal =
            matrixOverrides[cellKey] !== undefined ? matrixOverrides[cellKey] : curVal
          curMap[acct] += curVal
          targetMap[acct] += targetVal
          deltaMap[acct] += targetVal - curVal
        }
      }
    }
    return { curMap, targetMap, deltaMap }
  }, [accountAllo, matrixOverrides])

  // Live non-pension mortgage buffer after matrix edits
  const nonPensionBufferAfter = useMemo(() => {
    let total = 0
    for (const major of MAJOR_9_ASSETS) {
      if (major.key !== '만기보유채권' && major.key !== '현금성자산') continue
      for (const sub of major.subRows) {
        const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
        const found = accountAllo.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        for (const acct of NON_PENSION_MORTGAGE_ACCOUNTS) {
          const curVal = Number(found?.[acct] ?? 0) || 0
          const cellKey = `${rowKey}_${acct}`
          const targetVal =
            matrixOverrides[cellKey] !== undefined ? matrixOverrides[cellKey] : curVal
          total += targetVal
        }
      }
    }
    return total
  }, [accountAllo, matrixOverrides])

  const handleAutoBalanceAccountCash = (acct: string) => {
    const cashRowKey = '현금성_현금_원화'
    let otherDeltas = 0
    for (const major of MAJOR_9_ASSETS) {
      for (const sub of major.subRows) {
        const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
        if (rowKey === cashRowKey) continue
        const found = accountAllo.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        const curVal = Number(found?.[acct] ?? 0) || 0
        const cellKey = `${rowKey}_${acct}`
        const targetVal =
          matrixOverrides[cellKey] !== undefined ? matrixOverrides[cellKey] : curVal
        otherDeltas += targetVal - curVal
      }
    }

    const cashFound = accountAllo.find(
      (r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && r.세부자산군2 === '원화'
    )
    const currentCashVal = Number(cashFound?.[acct] ?? 0) || 0
    const newCashTarget = currentCashVal - otherDeltas
    if (newCashTarget < 0) {
      toast.warning(
        `[${acct}] 매수 금액이 계좌 내 현금보다 많아 잔고가 음수(${fmtMoney(newCashTarget, true)})가 됩니다.`
      )
    }
    updateMatrixOverride(`${cashRowKey}_${acct}`, newCashTarget, currentCashVal)
    toast.success(`[${acct}] 계좌 내 현금(원화)으로 상계 정산되었습니다.`)
  }

  const openCellEditor = (
    rowKey: string,
    rowLabel: string,
    account: string,
    majorKey: Major9Key,
    currentVal: number,
    targetVal: number
  ) => {
    setEditingCell({ rowKey, rowLabel, account, majorKey, currentVal, targetVal })
    setEditInputVal(String(Math.round(targetVal)))
    setEditDeltaInputVal(String(Math.round(targetVal - currentVal)))
  }

  return (
    <div className="space-y-4">
      {/* 11계좌 절세 자동배정 솔버 바 */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <span className="text-slate-400 px-2 font-medium">솔버 모드:</span>
            <button
              onClick={() => setSolverMode('no_sell')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                solverMode === 'no_sell'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              무매도 단방향 (no_sell)
            </button>
            <button
              onClick={() => setSolverMode('tax_min_full')}
              className={`px-3 py-1 rounded-lg font-semibold transition ${
                solverMode === 'tax_min_full'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              절세 우선 리밸런싱 (tax_min)
            </button>
          </div>

          <button
            onClick={onRunAutoSolve}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white shadow-lg"
          >
            <Wand2 className="w-3.5 h-3.5" />
            11계좌 자동배정 초안 생성
          </button>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setMatrixStrategy('TAA')}
              className={`px-2.5 py-1 rounded-lg font-semibold ${
                matrixStrategy === 'TAA' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              TAA 기준
            </button>
            <button
              onClick={() => setMatrixStrategy('SAA')}
              className={`px-2.5 py-1 rounded-lg font-semibold ${
                matrixStrategy === 'SAA' ? 'bg-sky-600 text-white' : 'text-slate-400'
              }`}
            >
              SAA 기준
            </button>
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setMatrixViewMode('combined')}
              className={`px-2.5 py-1 rounded-lg ${
                matrixViewMode === 'combined' ? 'bg-slate-800 text-slate-100 font-semibold' : 'text-slate-400'
              }`}
            >
              목표+Δ
            </button>
            <button
              onClick={() => setMatrixViewMode('deltaOnly')}
              className={`px-2.5 py-1 rounded-lg ${
                matrixViewMode === 'deltaOnly' ? 'bg-slate-800 text-slate-100 font-semibold' : 'text-slate-400'
              }`}
            >
              Δ만 보기
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onResetMatrix}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40"
          >
            <RotateCcw className="w-3.5 h-3.5" /> 초기화
          </button>
          <button
            onClick={onGoExecution}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <CheckCircle2 className="w-4 h-4" /> 허브 이체 & 실행 요약 ({executionCount}개 계좌)
          </button>
        </div>
      </div>

      {/* 실시간 IPS 제약 검증 칩 */}
      <div className="p-3 bg-slate-900/70 border border-slate-800 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-mono ${
              nonPensionBufferAfter >= 70_000_000
                ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/40'
                : 'bg-amber-950/40 text-amber-300 border-amber-700/40'
            }`}
          >
            {nonPensionBufferAfter >= 70_000_000 ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5" />
            )}
            2029.12 비연금 만기채+현금: {fmtMoney(nonPensionBufferAfter, true)} / 7,000만
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
            폐쇄풀(추가납입 0): 한투ISA({fmtDelta(accountDeltas.deltaMap['한투ISA'] || 0)}) · 한투연금저축(
            {fmtDelta(accountDeltas.deltaMap['한투연금저축'] || 0)})
          </span>
          {lastSolverResult?.accountSummaries
            .filter((s) => s.dcIrpRiskyRatioPct !== undefined)
            .map((s) => (
              <span
                key={s.account}
                className={`px-2 py-1 rounded-lg font-mono border ${
                  (s.dcIrpRiskyRatioPct ?? 0) > 70
                    ? 'bg-rose-950/40 text-rose-300 border-rose-700/40'
                    : 'bg-slate-950 text-slate-300 border-slate-800'
                }`}
              >
                {s.account} 위험비중 {s.dcIrpRiskyRatioPct}%/70%
              </span>
            ))}
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <Sliders className="w-3.5 h-3.5 text-emerald-400" />
          <span>셀 클릭 시 금액 수동 미세조정 가능</span>
        </div>
      </div>

      {/* 9대 자산군 × 22 세부행 × 11 계좌 매트릭스 */}
      <Card>
        <CardBody className="p-0 overflow-auto max-h-[calc(100vh-300px)]">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                <th className="py-3 px-3 min-w-[165px] sticky left-0 z-30 bg-slate-900 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                  9대 자산군 / 세부자산군
                </th>
                {ALLOCATION_ACCOUNTS.map((acct) => (
                  <th
                    key={acct}
                    title={ACCOUNT_IPS_RULES[acct]?.role || acct}
                    className="py-3 px-2 text-right min-w-[85px]"
                  >
                    <div>{acct}</div>
                    <div className="text-[9px] text-slate-500 font-normal">
                      {ACCOUNT_IPS_RULES[acct]?.isHub
                        ? '중앙허브'
                        : ACCOUNT_IPS_RULES[acct]?.allowNewContribution === false
                        ? '폐쇄풀'
                        : ACCOUNT_IPS_RULES[acct]?.withdrawalAllowed === false
                        ? '인출잠금'
                        : '자유'}
                    </div>
                  </th>
                ))}
                <th className="py-3 px-3 text-right font-bold text-slate-100 border-l border-slate-800 bg-slate-900 min-w-[90px]">
                  합계
                </th>
                <th className="py-3 px-3 text-right font-bold text-sky-400 min-w-[85px]">목표 증감</th>
                <th className="py-3 px-3 text-right font-bold text-emerald-400 min-w-[85px]">
                  배분 증감
                </th>
                <th className="py-3 px-3 text-right font-bold text-amber-400 min-w-[95px]">
                  미배분 잔액
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60 font-mono whitespace-nowrap">
              {MAJOR_9_ASSETS.map((major) => {
                const targetTradeAmt = targetTradeByMajor9[major.key] || 0
                const allocatedDelta = majorAllocatedDeltas[major.key] || 0
                const unallocatedRemaining = targetTradeAmt - allocatedDelta
                const isCompleted = Math.abs(unallocatedRemaining) < 50_000

                return (
                  <Fragment key={major.key}>
                    <tr className="bg-slate-900/90 font-semibold text-slate-200 border-t-2 border-slate-700/80">
                      <td className="py-2.5 px-3 font-sans sticky left-0 z-10 bg-slate-900 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: major.color }}
                          />
                          <span className="font-bold text-slate-100">{major.label}</span>
                        </div>
                      </td>

                      {ALLOCATION_ACCOUNTS.map((acct) => {
                        let acctSubTotal = 0
                        let acctSubDelta = 0
                        for (const sub of major.subRows) {
                          const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
                          const found = accountAllo.find(
                            (r) =>
                              r.자산군 === sub.자산군 &&
                              r.세부자산군 === sub.세부자산군 &&
                              r.세부자산군2 === sub.세부자산군2
                          )
                          const cur = Number(found?.[acct] ?? 0) || 0
                          const target =
                            matrixOverrides[`${rowKey}_${acct}`] !== undefined
                              ? matrixOverrides[`${rowKey}_${acct}`]
                              : cur
                          acctSubTotal += target
                          acctSubDelta += target - cur
                        }
                        return (
                          <td
                            key={acct}
                            className={`py-2 px-2 text-right ${
                              acctSubTotal === 0 ? 'text-slate-600' : 'text-slate-300'
                            }`}
                          >
                            {matrixViewMode === 'deltaOnly' ? (
                              acctSubDelta !== 0 ? (
                                <span
                                  className={acctSubDelta > 0 ? 'text-emerald-400' : 'text-rose-400'}
                                >
                                  {fmtDelta(acctSubDelta)}
                                </span>
                              ) : (
                                '-'
                              )
                            ) : acctSubTotal === 0 ? (
                              '-'
                            ) : (
                              fmtMoney(acctSubTotal)
                            )}
                          </td>
                        )
                      })}

                      <td className="py-2 px-3 text-right font-bold border-l border-slate-800 text-slate-100">
                        {fmtMoney((currentAmounts[major.key] || 0) + allocatedDelta)}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-sky-400">
                        {fmtDelta(targetTradeAmt)}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-bold ${
                          allocatedDelta > 0
                            ? 'text-emerald-400'
                            : allocatedDelta < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {fmtDelta(allocatedDelta)}
                      </td>
                      <td className="py-2 px-3 text-right font-bold">
                        {isCompleted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] border border-emerald-500/30">
                            <Check className="w-3 h-3" /> 완료
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
                              unallocatedRemaining > 0
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {unallocatedRemaining > 0 ? '부족 ' : '초과 '}
                            {fmtDelta(unallocatedRemaining)}
                          </span>
                        )}
                      </td>
                    </tr>

                    {major.subRows.map((sub) => {
                      const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
                      const found = accountAllo.find(
                        (r) =>
                          r.자산군 === sub.자산군 &&
                          r.세부자산군 === sub.세부자산군 &&
                          r.세부자산군2 === sub.세부자산군2
                      )

                      let rowTotal = 0
                      let rowDelta = 0
                      for (const acct of ALLOCATION_ACCOUNTS) {
                        const cur = Number(found?.[acct] ?? 0) || 0
                        const target =
                          matrixOverrides[`${rowKey}_${acct}`] !== undefined
                            ? matrixOverrides[`${rowKey}_${acct}`]
                            : cur
                        rowTotal += target
                        rowDelta += target - cur
                      }

                      return (
                        <tr key={rowKey} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3 font-sans text-slate-300 pl-6 sticky left-0 z-10 bg-slate-950 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.5)] truncate max-w-[180px]">
                            {sub.name}
                          </td>
                          {ALLOCATION_ACCOUNTS.map((acct) => {
                            const curVal = Number(found?.[acct] ?? 0) || 0
                            const cellKey = `${rowKey}_${acct}`
                            const isOverridden = matrixOverrides[cellKey] !== undefined
                            const targetVal = isOverridden ? matrixOverrides[cellKey] : curVal
                            const delta = targetVal - curVal
                            const ipsAllowed =
                              ACCOUNT_IPS_RULES[acct]?.allowedMajor9.includes(major.key) ?? true

                            return (
                              <td
                                key={acct}
                                onClick={() =>
                                  openCellEditor(
                                    rowKey,
                                    `${acct} > ${sub.name}`,
                                    acct,
                                    major.key,
                                    curVal,
                                    targetVal
                                  )
                                }
                                title={`${ipsAllowed ? 'IPS 허용' : '⚠️ IPS 비허용 자산군'} | 현재: ${fmtMoney(
                                  curVal,
                                  true
                                )}, 목표: ${fmtMoney(targetVal, true)}`}
                                className={`py-2 px-2 text-right cursor-pointer transition select-none ${
                                  isOverridden
                                    ? delta > 0
                                      ? 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 font-semibold'
                                      : 'bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 font-semibold'
                                    : curVal === 0
                                    ? ipsAllowed
                                      ? 'text-slate-600 hover:bg-slate-800/50'
                                      : 'text-slate-700/60 bg-slate-950/40 hover:bg-slate-800/50'
                                    : 'text-slate-300 hover:bg-slate-800/60'
                                }`}
                              >
                                {matrixViewMode === 'deltaOnly' ? (
                                  delta !== 0 ? (
                                    <span className={delta > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                      {fmtDelta(delta)}
                                    </span>
                                  ) : (
                                    '-'
                                  )
                                ) : (
                                  <div>
                                    <div>{targetVal === 0 ? '-' : fmtMoney(targetVal)}</div>
                                    {isOverridden && delta !== 0 && (
                                      <div
                                        className={`text-[9px] font-mono leading-none ${
                                          delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                                        }`}
                                      >
                                        {fmtDelta(delta)}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                          <td className="py-2 px-3 text-right font-semibold border-l border-slate-800 text-slate-200 bg-slate-900/40">
                            {fmtMoney(rowTotal)}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600">-</td>
                          <td
                            className={`py-2 px-3 text-right ${
                              rowDelta > 0
                                ? 'text-emerald-400'
                                : rowDelta < 0
                                ? 'text-rose-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {rowDelta !== 0 ? fmtDelta(rowDelta) : '-'}
                          </td>
                          <td className="py-2 px-3 text-right text-slate-600">-</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                )
              })}
            </tbody>

            <tfoot className="border-t-2 border-slate-600 bg-slate-900 text-slate-200">
              <tr className="whitespace-nowrap">
                <td className="py-2.5 px-3 font-sans font-semibold sticky left-0 z-10 bg-slate-900 border-r border-slate-800 text-slate-400">
                  현재 계좌 합계
                </td>
                {ALLOCATION_ACCOUNTS.map((acct) => (
                  <td key={acct} className="py-2 px-2 text-right text-slate-400">
                    {fmtMoney(accountDeltas.curMap[acct])}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right font-bold border-l border-slate-800 text-slate-300">
                  {fmtMoney(currentTotalEval)}
                </td>
                <td colSpan={3} className="text-slate-600 px-3 text-center">
                  (현재 총자산)
                </td>
              </tr>

              <tr className="whitespace-nowrap bg-slate-900/80 font-semibold">
                <td className="py-2.5 px-3 font-sans sticky left-0 z-10 bg-slate-900 border-r border-slate-800 text-emerald-400">
                  배분 후 계좌 합계
                </td>
                {ALLOCATION_ACCOUNTS.map((acct) => (
                  <td key={acct} className="py-2 px-2 text-right text-slate-100">
                    {fmtMoney(accountDeltas.targetMap[acct])}
                  </td>
                ))}
                <td className="py-2.5 px-3 text-right font-bold border-l border-slate-800 text-emerald-400">
                  {fmtMoney(Object.values(accountDeltas.targetMap).reduce((a, b) => a + b, 0))}
                </td>
                <td colSpan={3} className="text-slate-400 px-3 text-right font-mono text-xs">
                  목표 총자산: {fmtMoney(targetTotalEval)}
                </td>
              </tr>

              <tr className="whitespace-nowrap bg-slate-950/90 font-bold border-t border-slate-800">
                <td className="py-3 px-3 font-sans sticky left-0 z-10 bg-slate-950 border-r border-slate-800 text-sky-400">
                  <div>계좌 순증감 (입출금)</div>
                  <div className="text-[10px] text-slate-500 font-normal">0원 = 자체 리밸런싱</div>
                </td>
                {ALLOCATION_ACCOUNTS.map((acct) => {
                  const netDelta = accountDeltas.deltaMap[acct] || 0
                  const isZero = Math.abs(netDelta) < 1000
                  return (
                    <td key={acct} className="py-2.5 px-2 text-right">
                      <div
                        className={
                          isZero
                            ? 'text-slate-400'
                            : netDelta > 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }
                      >
                        {isZero ? '0' : fmtDelta(netDelta)}
                      </div>
                      {!isZero && (
                        <button
                          onClick={() => handleAutoBalanceAccountCash(acct)}
                          className="mt-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-sans font-normal border border-slate-700"
                        >
                          현금정산
                        </button>
                      )}
                    </td>
                  )
                })}
                <td className="py-3 px-3 text-right font-bold border-l border-slate-800 text-sky-400">
                  {fmtDelta(Object.values(accountDeltas.deltaMap).reduce((a, b) => a + b, 0))}
                </td>
                <td colSpan={3} className="px-3 text-right text-xs font-mono">
                  {Math.abs(
                    Object.values(accountDeltas.deltaMap).reduce((a, b) => a + b, 0) - expectedInflow
                  ) < 50_000 ? (
                    <span className="text-emerald-400 font-semibold flex items-center justify-end gap-1">
                      <Check className="w-4 h-4" /> 목표 유출입과 일치
                    </span>
                  ) : (
                    <span className="text-amber-400 flex items-center justify-end gap-1">
                      <AlertCircle className="w-4 h-4" /> 유출입 목표({fmtMoney(expectedInflow)})와
                      격차
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardBody>
      </Card>

      {/* 셀 편집 모달 */}
      {editingCell && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">{editingCell.rowLabel}</h3>
                <p className="text-xs text-slate-400 font-medium">
                  9대 자산군: {editingCell.majorKey} • 계좌: {editingCell.account}
                </p>
              </div>
              <button
                onClick={() => setEditingCell(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!ACCOUNT_IPS_RULES[editingCell.account]?.allowedMajor9.includes(
              editingCell.majorKey
            ) && (
              <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-600/40 text-xs text-amber-300 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>
                  [{editingCell.account}] IPS 규정상 {editingCell.majorKey} 신규 편입이 제한되어
                  있습니다.
                </span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-slate-400">현재 보유 평가금액:</span>
                <span className="font-mono font-bold text-slate-200 text-sm">
                  {formatKRW(editingCell.currentVal)} 원
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium flex items-center justify-between">
                  <span>변경 후 목표금액 (원)</span>
                  <span className="text-slate-500 font-mono">
                    약 {Math.round(Number(editInputVal || 0) / 10_000).toLocaleString()} 만원
                  </span>
                </label>
                <input
                  type="number"
                  step={100_000}
                  value={editInputVal}
                  onChange={(e) => {
                    const val = e.target.value
                    setEditInputVal(val)
                    setEditDeltaInputVal(String((Number(val) || 0) - editingCell.currentVal))
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-medium flex items-center justify-between">
                  <span>매수(+)/매도(-) 증감액 (Δ)</span>
                  <span
                    className={`font-mono font-bold ${
                      Number(editDeltaInputVal || 0) > 0
                        ? 'text-emerald-400'
                        : Number(editDeltaInputVal || 0) < 0
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {Number(editDeltaInputVal || 0) > 0 ? '+' : ''}
                    {Math.round(Number(editDeltaInputVal || 0) / 10_000).toLocaleString()} 만원
                  </span>
                </label>
                <input
                  type="number"
                  step={100_000}
                  value={editDeltaInputVal}
                  onChange={(e) => {
                    const delta = e.target.value
                    setEditDeltaInputVal(delta)
                    setEditInputVal(String(editingCell.currentVal + (Number(delta) || 0)))
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-100"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[-5_000_000, -1_000_000, -500_000, 500_000, 1_000_000, 5_000_000].map((step) => (
                  <button
                    key={step}
                    onClick={() => {
                      const curTarget = Number(editInputVal) || editingCell.currentVal
                      const nextTarget = Math.max(0, curTarget + step)
                      setEditInputVal(String(nextTarget))
                      setEditDeltaInputVal(String(nextTarget - editingCell.currentVal))
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono ${
                      step > 0
                        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-950/40 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {step > 0 ? `+${step / 10_000}만` : `${step / 10_000}만`}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setEditInputVal('0')
                    setEditDeltaInputVal(String(-editingCell.currentVal))
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 text-rose-300"
                >
                  전액 매도
                </button>
                <button
                  onClick={() => {
                    setEditInputVal(String(editingCell.currentVal))
                    setEditDeltaInputVal('0')
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 text-slate-300"
                >
                  원래대로
                </button>
              </div>

              {(() => {
                const targetTradeAmt = targetTradeByMajor9[editingCell.majorKey] || 0
                const allocatedDelta = majorAllocatedDeltas[editingCell.majorKey] || 0
                const currentCellDelta = editingCell.targetVal - editingCell.currentVal
                const remainingForOthers = targetTradeAmt - (allocatedDelta - currentCellDelta)
                return (
                  <button
                    onClick={() => {
                      const newTarget = Math.max(0, editingCell.currentVal + remainingForOthers)
                      setEditInputVal(String(newTarget))
                      setEditDeltaInputVal(String(newTarget - editingCell.currentVal))
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-sky-950/40 hover:bg-sky-900/50 text-sky-300 border border-sky-600/30 flex items-center justify-between font-semibold"
                  >
                    <span>⭐ [{editingCell.majorKey}] 미배분 잔액 전액 반영</span>
                    <span className="font-mono text-sky-400">
                      {fmtDelta(remainingForOthers, true)}
                    </span>
                  </button>
                )
              })()}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setEditingCell(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300"
              >
                취소
              </button>
              <button
                onClick={() => {
                  const finalTarget = Number(editInputVal) || 0
                  updateMatrixOverride(
                    `${editingCell.rowKey}_${editingCell.account}`,
                    finalTarget,
                    editingCell.currentVal
                  )
                  setEditingCell(null)
                  toast.success(`${editingCell.rowLabel} 목표금액이 반영되었습니다.`)
                }}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                적용하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
