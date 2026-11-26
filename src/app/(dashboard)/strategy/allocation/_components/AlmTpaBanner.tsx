'use client'

import {
  AlmConfigRow,
  MAJOR_9_KEYS,
  Weights9,
  computeEquityEqBeta,
} from '@/lib/engine/alm-tpa-types'
import { ShieldAlert, ShieldCheck, Landmark, Activity, Layers } from 'lucide-react'

interface SatelliteSummary {
  satellitePct: number
  maxClusterName: string
  maxClusterPct: number
  individualStockPct: number
  maxSingleStockName: string
  maxSingleStockPct: number
}

interface AlmTpaBannerProps {
  currentTotalEval: number
  almConfig: AlmConfigRow | null
  currentWeights: Weights9
  saaWeights: Weights9
  taaWeights: Weights9
  nonPensionDebtBufferKrw: number
  satelliteSummary: SatelliteSummary
  unitMode: 'won' | 'man'
}

export function AlmTpaBanner({
  currentTotalEval,
  almConfig,
  currentWeights,
  saaWeights,
  taaWeights,
  nonPensionDebtBufferKrw,
  satelliteSummary,
  unitMode,
}: AlmTpaBannerProps) {
  const fmtMoney = (val: number) => {
    if (unitMode === 'man') {
      return `${Math.round(val / 10_000).toLocaleString('ko-KR')}만`
    }
    return `${Math.round(val).toLocaleString('ko-KR')}원`
  }

  const liabilities = almConfig?.liabilities ?? [
    {
      id: 'parents_loan',
      title: '부모님 차입 투자자금',
      principal_krw: 120_000_000,
      annual_rate_pct: 3.25,
      rate_type: 'floating_deposit' as const,
      start_date: '2024-01-01',
      maturity_date: null,
      repay_at_maturity: false,
      non_pension_only: false,
    },
    {
      id: 'company_mortgage_2029',
      title: '주택담보대출 (회사 지원)',
      principal_krw: 70_000_000,
      annual_rate_pct: 0.6,
      rate_type: 'fixed' as const,
      start_date: '2026-12-01',
      maturity_date: '2029-12-31',
      repay_at_maturity: true,
      non_pension_only: true,
    },
  ]

  const parentsLoan = liabilities
    .filter((l) => !l.repay_at_maturity)
    .reduce((acc, l) => acc + (Number(l.principal_krw) || 0), 0)
  const mortgageLoan = liabilities
    .filter((l) => l.repay_at_maturity && l.non_pension_only)
    .reduce((acc, l) => acc + (Number(l.principal_krw) || 0), 0)

  const netEquity = Math.max(1, currentTotalEval - parentsLoan)
  const leverageRatio = currentTotalEval / netEquity

  const mortgageTarget = mortgageLoan > 0 ? mortgageLoan : 70_000_000
  const bufferRatioPct = Math.min(100, (nonPensionDebtBufferKrw / mortgageTarget) * 100)
  const bufferGapKrw = nonPensionDebtBufferKrw - mortgageTarget

  const curBeta = computeEquityEqBeta(currentWeights)
  const saaBeta = computeEquityEqBeta(saaWeights)
  const taaBeta = computeEquityEqBeta(taaWeights)

  const satOver = satelliteSummary.satellitePct > 20.0
  const clusterOver = satelliteSummary.maxClusterPct > 25.0

  // Verify 9-asset sum
  const taaSum = MAJOR_9_KEYS.reduce((a, k) => a + (taaWeights[k] || 0), 0)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {/* 1. 0층 가계 ALM 대차대조표 */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-medium text-sky-300">
            <Landmark className="w-3.5 h-3.5" />
            0층 가계 ALM 대차대조표
          </span>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-700/40">
            레버리지 {leverageRatio.toFixed(2)}x
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <div className="text-lg font-bold font-mono text-slate-100">
            순자본 {fmtMoney(netEquity)}
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            총자산 {fmtMoney(currentTotalEval)}
          </div>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between">
          <span>부모님 차입 {fmtMoney(parentsLoan)}</span>
          <span>주담대 {fmtMoney(mortgageTarget)} (29.12)</span>
        </div>
      </div>

      {/* 2. 2029.12 주담대 7,000만 매칭 하한 */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-slate-300">비연금 2029.12 부채매칭 버퍼</span>
          {bufferGapKrw >= 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> 하한 충족
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400">
              <ShieldAlert className="w-3.5 h-3.5" /> {fmtMoney(bufferGapKrw)} 부족
            </span>
          )}
        </div>
        <div className="flex items-baseline justify-between font-mono">
          <span className="text-lg font-bold text-slate-100">
            {fmtMoney(nonPensionDebtBufferKrw)}
          </span>
          <span className="text-[11px] text-slate-400">
            목표 하한 {fmtMoney(mortgageTarget)} ({bufferRatioPct.toFixed(1)}%)
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full transition-all ${
              bufferGapKrw >= 0 ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${Math.max(4, bufferRatioPct)}%` }}
          />
        </div>
      </div>

      {/* 3. 1층 TPA 주식등가 펀딩비율 */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-emerald-300">
            <Activity className="w-3.5 h-3.5" />
            1층 TPA 주식등가 펀딩비율 (β_eq)
          </span>
          <span className="text-[11px] text-slate-400 font-mono">기준 75.0%</span>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-0.5 font-mono text-center">
          <div className="bg-slate-950/70 rounded-lg p-1.5 border border-slate-800">
            <div className="text-[10px] text-slate-500 font-sans">현재</div>
            <div
              className={`text-xs font-bold ${
                Math.abs(curBeta - 75) > 7.5 ? 'text-amber-400' : 'text-slate-200'
              }`}
            >
              {curBeta.toFixed(2)}%
            </div>
          </div>
          <div className="bg-slate-950/70 rounded-lg p-1.5 border border-slate-800">
            <div className="text-[10px] text-slate-500 font-sans">SAA (75±2)</div>
            <div
              className={`text-xs font-bold ${
                Math.abs(saaBeta - 75) > 2.0 ? 'text-amber-400' : 'text-sky-400'
              }`}
            >
              {saaBeta.toFixed(2)}%
            </div>
          </div>
          <div className="bg-slate-950/70 rounded-lg p-1.5 border border-slate-800">
            <div className="text-[10px] text-slate-500 font-sans">TAA (75±7.5)</div>
            <div
              className={`text-xs font-bold ${
                Math.abs(taaBeta - 75) > 7.5 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {taaBeta.toFixed(2)}%
            </div>
          </div>
        </div>
        <div className="text-[10px] text-slate-500 text-right font-mono">
          TAA 합계 {taaSum.toFixed(2)}%
        </div>
      </div>

      {/* 4. 하이브리드 C-1 위성/팩터 하드캡 */}
      <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-purple-300">
            <Layers className="w-3.5 h-3.5" />
            하이브리드 C-1 위성·테마 캡
          </span>
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
              satOver || clusterOver
                ? 'bg-rose-950/60 text-rose-300 border border-rose-700/40'
                : 'bg-emerald-950/60 text-emerald-300 border border-emerald-700/40'
            }`}
          >
            {satOver ? '위성 초과' : '캡 정상'}
          </span>
        </div>
        <div className="flex items-baseline justify-between font-mono">
          <span className={`text-lg font-bold ${satOver ? 'text-rose-400' : 'text-emerald-400'}`}>
            Satellite {satelliteSummary.satellitePct.toFixed(1)}%
          </span>
          <span className="text-[11px] text-slate-400">상한 ≤ 20.0%</span>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center justify-between truncate gap-2">
          <span className="truncate" title={satelliteSummary.maxClusterName}>
            최대테마: {satelliteSummary.maxClusterName || '-'} (
            {satelliteSummary.maxClusterPct.toFixed(1)}% / 25%)
          </span>
          <span className="shrink-0 font-mono">
            개별주 {satelliteSummary.individualStockPct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
