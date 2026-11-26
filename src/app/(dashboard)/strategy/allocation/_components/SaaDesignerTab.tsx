'use client'

import { useState, useMemo } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import {
  AllocationPolicyRow,
  CorridorRule,
  LtcmaModelInputs,
  MAJOR_9_ASSETS,
  MAJOR_9_KEYS,
  Major9Key,
  Weights9,
  sumWeights9,
} from '@/lib/engine/alm-tpa-types'
import {
  DEFAULT_LTCMA_INPUTS,
  DEFAULT_REF_WEIGHTS_9,
  computeBlackLittermanSAA,
  computeProportionalCorridor,
  evaluateTpaRiskMetrics,
} from '@/lib/engine/saa-taa-optimizer'
import { formatPercent } from '@/lib/utils'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

interface SaaDesignerTabProps {
  currentTotalEval: number
  currentAmounts: Record<Major9Key, number>
  currentWeights: Weights9
  refWeights: Weights9
  saaWeights: Weights9
  setSaaWeights: (next: Weights9 | ((prev: Weights9) => Weights9)) => void
  ltcmaInputs: LtcmaModelInputs
  setLtcmaInputs: (next: LtcmaModelInputs) => void
  corridorRule: CorridorRule
  minNonPensionDebtFloorPct: number
  satelliteMetrics: {
    satelliteWeightPct: number
    maxSingleClusterPct: number
    totalIndividualStockPct: number
    maxSingleStockPct: number
  }
  allocationPolicies: AllocationPolicyRow[]
  alloRows: Array<Record<string, unknown>>
  unitMode: 'won' | 'man'
  onSavePolicies: () => Promise<void>
  isSaving: boolean
}

export function SaaDesignerTab({
  currentTotalEval,
  currentAmounts,
  currentWeights,
  refWeights,
  saaWeights,
  setSaaWeights,
  ltcmaInputs,
  setLtcmaInputs,
  corridorRule,
  minNonPensionDebtFloorPct,
  satelliteMetrics,
  allocationPolicies,
  alloRows,
  unitMode,
  onSavePolicies,
  isSaving,
}: SaaDesignerTabProps) {
  const [showLtcmaEditor, setShowLtcmaEditor] = useState(false)
  const [blResult, setBlResult] = useState(() =>
    computeBlackLittermanSAA({
      ltcma: ltcmaInputs,
      refWeights,
      minNonPensionDebtFloorPct,
      targetBetaEqPct: 75.0,
      betaTolerancePct: 2.0,
    })
  )

  const fmtMoney = (val: number) => {
    if (unitMode === 'man') return Math.round(val / 10_000).toLocaleString('ko-KR')
    return Math.round(val).toLocaleString('ko-KR')
  }

  const fmtDelta = (val: number) => {
    const sign = val > 0 ? '+' : ''
    return `${sign}${fmtMoney(val)}`
  }

  const saaSum = useMemo(() => Number(sumWeights9(saaWeights).toFixed(2)), [saaWeights])

  const refRisk = useMemo(
    () => evaluateTpaRiskMetrics(refWeights, refWeights, ltcmaInputs),
    [refWeights, ltcmaInputs]
  )

  const saaRisk = useMemo(
    () =>
      evaluateTpaRiskMetrics(saaWeights, refWeights, ltcmaInputs, {
        targetBetaEqPct: 75.0,
        betaTolerancePct: 2.0,
        teWarnPct: 6.0,
        rcRatioWarn: 1.6,
        ...satelliteMetrics,
      }),
    [saaWeights, refWeights, ltcmaInputs, satelliteMetrics]
  )

  const handleRunBlackLitterman = () => {
    const res = computeBlackLittermanSAA({
      ltcma: ltcmaInputs,
      refWeights,
      minNonPensionDebtFloorPct,
      targetBetaEqPct: 75.0,
      betaTolerancePct: 2.0,
    })
    setBlResult(res)
    toast.success(
      `블랙-리터만 SAA 최적화 완료 (E[R] ${res.riskMetrics.expectedReturnPct}%, Vol ${res.riskMetrics.volatilityPct}%, β_eq ${res.riskMetrics.equityEqBetaPct}%)`
    )
  }

  const handleApplyBlToSaa = () => {
    setSaaWeights({ ...blResult.roundedWeights9 })
    toast.success('BL 최적화 비중(0.5%p 라운딩)을 SAA 편집표에 반영했습니다.')
  }

  const rcChartOption = useMemo(() => {
    const categories = MAJOR_9_ASSETS.map((a) => a.shortLabel)
    const capData = MAJOR_9_KEYS.map((k) => Number((saaWeights[k] || 0).toFixed(2)))
    const rcData = MAJOR_9_KEYS.map((k) => Number((saaRisk.riskContributionsPct[k] || 0).toFixed(2)))

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['자본 비중 (W%)', '리스크 기여도 (RC%)'],
        textStyle: { color: '#94a3b8' },
        top: '2%',
        right: '2%',
      },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', fontSize: 11, interval: 0 },
      },
      yAxis: {
        type: 'value',
        name: '비중 (%)',
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
      },
      series: [
        {
          name: '자본 비중 (W%)',
          type: 'bar',
          data: capData,
          itemStyle: { color: '#38bdf8', borderRadius: [3, 3, 0, 0] },
        },
        {
          name: '리스크 기여도 (RC%)',
          type: 'bar',
          data: rcData,
          itemStyle: { color: '#f59e0b', borderRadius: [3, 3, 0, 0] },
        },
      ],
    }
  }, [saaWeights, saaRisk])

  return (
    <div className="space-y-6">
      {/* 1층 TPA 레퍼런스 & 하이브리드 C-1 리스크 경보판 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-sky-500/20">
          <CardHeader
            title="1층 TPA 레퍼런스 포트폴리오 (75:25 기준선)"
            subtitle="글로벌 올컨트리 주식(환노출 원화환산) 75% + 국내 종합채권 25%"
          />
          <CardBody className="space-y-3">
            <div className="grid grid-cols-4 gap-2 text-center font-mono">
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-sans">기대수익률</div>
                <div className="text-sm font-bold text-slate-100">{refRisk.expectedReturnPct}%</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-sans">예상 변동성</div>
                <div className="text-sm font-bold text-slate-100">{refRisk.volatilityPct}%</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-sans">주식등가 β_eq</div>
                <div className="text-sm font-bold text-sky-400">{refRisk.equityEqBetaPct}%</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-sans">구성 (선/신/채)</div>
                <div className="text-xs font-bold text-slate-300">
                  {DEFAULT_REF_WEIGHTS_9.선진국주식}/{DEFAULT_REF_WEIGHTS_9.신흥국주식}/
                  {DEFAULT_REF_WEIGHTS_9.시장형채권}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center font-mono">
              <div className="p-2.5 rounded-xl bg-sky-950/20 border border-sky-700/30">
                <div className="text-[10px] text-sky-300 font-sans">SAA 기대수익</div>
                <div className="text-sm font-bold text-sky-300">{saaRisk.expectedReturnPct}%</div>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-950/20 border border-sky-700/30">
                <div className="text-[10px] text-sky-300 font-sans">SAA 변동성</div>
                <div className="text-sm font-bold text-sky-300">{saaRisk.volatilityPct}%</div>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-950/20 border border-sky-700/30">
                <div className="text-[10px] text-sky-300 font-sans">추적오차 TE(≤6%)</div>
                <div
                  className={`text-sm font-bold ${
                    saaRisk.trackingErrorPct > 6 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {saaRisk.trackingErrorPct}%
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-950/20 border border-sky-700/30">
                <div className="text-[10px] text-sky-300 font-sans">Sharpe 추정</div>
                <div className="text-sm font-bold text-slate-100">{saaRisk.sharpeEstimate}</div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="border-amber-500/20">
          <CardHeader
            title="하이브리드 C-1 리스크 경보판"
            subtitle="주식등가 β_eq(75±2%p) · 위성/클러스터 하드캡 · 공분산 TE/RC 편중 점검"
          />
          <CardBody className="space-y-2 max-h-[195px] overflow-auto">
            {saaRisk.alerts.length === 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-950/30 border border-emerald-600/30 text-xs text-emerald-300">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>
                  SAA 목표안이 레퍼런스 β_eq 밴드, 추적오차(TE ≤ 6%), 리스크 편중(RC/W ≤ 1.6x) 및 모든 하드캡 기준을 충족합니다.
                </span>
              </div>
            ) : (
              saaRisk.alerts.map((al) => (
                <div
                  key={al.code}
                  className={`flex items-start gap-2 p-2.5 rounded-xl text-xs border ${
                    al.level === 'critical'
                      ? 'bg-rose-950/40 border-rose-600/40 text-rose-200'
                      : 'bg-amber-950/40 border-amber-600/40 text-amber-200'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{al.message}</span>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {/* 세후 LTCMA & 블랙-리터만 최적화 컨트롤 */}
      <Card>
        <CardHeader
          title="2층-A 세후 LTCMA & 제약조건부 블랙-리터만(BL) SAA 최적화"
          subtitle="역최적화 균형수익률(Π) + LTCMA 뷰(Q) 베이즈 결합 · 비연금 7,000만 부채하한 & β_eq 75±2%p 제약"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowLtcmaEditor((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
              >
                {showLtcmaEditor ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" /> LTCMA 파라미터 접기
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" /> LTCMA 파라미터 편집
                  </>
                )}
              </button>
              <button
                onClick={handleRunBlackLitterman}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white transition"
              >
                <Cpu className="w-3.5 h-3.5" /> 블랙-리터만 SAA 최적화 실행
              </button>
              <button
                onClick={handleApplyBlToSaa}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition"
              >
                <Sparkles className="w-3.5 h-3.5" /> BL 원값 → SAA 적용
              </button>
            </div>
          }
        />

        {showLtcmaEditor && (
          <CardBody className="border-b border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-slate-300">
                  <span>위험회피계수(λ):</span>
                  <input
                    type="number"
                    step={0.05}
                    value={ltcmaInputs.riskAversion}
                    onChange={(e) =>
                      setLtcmaInputs({
                        ...ltcmaInputs,
                        riskAversion: parseFloat(e.target.value) || 2.45,
                      })
                    }
                    className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-sky-300"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-slate-300">
                  <span>불확실성(τ):</span>
                  <input
                    type="number"
                    step={0.01}
                    value={ltcmaInputs.tau}
                    onChange={(e) =>
                      setLtcmaInputs({
                        ...ltcmaInputs,
                        tau: parseFloat(e.target.value) || 0.05,
                      })
                    }
                    className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-sky-300"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-slate-300">
                  <span>공분산 축소(Shrinkage):</span>
                  <input
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={ltcmaInputs.shrinkageLambda}
                    onChange={(e) =>
                      setLtcmaInputs({
                        ...ltcmaInputs,
                        shrinkageLambda: parseFloat(e.target.value) || 0.25,
                      })
                    }
                    className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-sky-300"
                  />
                </label>
              </div>
              <button
                onClick={() => {
                  setLtcmaInputs(DEFAULT_LTCMA_INPUTS)
                  toast.success('세후 LTCMA 입력값을 기본값으로 복원했습니다.')
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <RotateCcw className="w-3 h-3" /> LTCMA 기본값
              </button>
            </div>

            <div className="overflow-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <th className="py-2 px-3">자산군</th>
                    <th className="py-2 px-2 text-right">세후 기대수익(%)</th>
                    <th className="py-2 px-2 text-right">연 변동성(%)</th>
                    <th className="py-2 px-2 text-right">BL 뷰 수익(%)</th>
                    <th className="py-2 px-2 text-right">뷰 신뢰도</th>
                    <th className="py-2 px-2 text-right">하한(%)</th>
                    <th className="py-2 px-2 text-right">상한(%)</th>
                    <th className="py-2 px-2 text-right text-sky-400">균형 Π(%)</th>
                    <th className="py-2 px-2 text-right text-emerald-400">사후 μ_BL(%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {MAJOR_9_KEYS.map((k) => {
                    const row = ltcmaInputs.assets[k]
                    const updateField = (field: keyof typeof row, val: number) => {
                      setLtcmaInputs({
                        ...ltcmaInputs,
                        assets: {
                          ...ltcmaInputs.assets,
                          [k]: { ...row, [field]: val },
                        },
                      })
                    }
                    return (
                      <tr key={k}>
                        <td className="py-1.5 px-3 font-sans text-slate-200 font-medium">{k}</td>
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            step={0.1}
                            value={row.expectedReturnPct}
                            onChange={(e) =>
                              updateField('expectedReturnPct', parseFloat(e.target.value) || 0)
                            }
                            className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            step={0.1}
                            value={row.volatilityPct}
                            onChange={(e) =>
                              updateField('volatilityPct', parseFloat(e.target.value) || 0)
                            }
                            className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            step={0.1}
                            value={row.blViewReturnPct}
                            onChange={(e) =>
                              updateField('blViewReturnPct', parseFloat(e.target.value) || 0)
                            }
                            className="w-16 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right text-sky-300"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            step={0.05}
                            min={0.1}
                            max={0.95}
                            value={row.viewConfidence}
                            onChange={(e) =>
                              updateField('viewConfidence', parseFloat(e.target.value) || 0.5)
                            }
                            className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            step={1}
                            value={row.minWeightPct}
                            onChange={(e) =>
                              updateField('minWeightPct', parseFloat(e.target.value) || 0)
                            }
                            className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            step={1}
                            value={row.maxWeightPct}
                            onChange={(e) =>
                              updateField('maxWeightPct', parseFloat(e.target.value) || 100)
                            }
                            className="w-14 bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-right"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right text-sky-400">
                          {blResult.impliedReturnsPct[k]?.toFixed(2)}%
                        </td>
                        <td className="py-1.5 px-2 text-right text-emerald-400 font-bold">
                          {blResult.posteriorReturnsPct[k]?.toFixed(2)}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        )}

        {/* 9대 자산군 SAA 편집 테이블 */}
        <CardBody className="p-0 overflow-auto">
          <div className="px-4 py-2.5 bg-slate-900/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-400">
              비례 리밸런싱 밴드 공식:{' '}
              <code className="text-sky-300 font-mono">min(±5.0%p, max(±1.5%p, 0.25 × w*))</code>
            </span>
            <div className="flex items-center gap-2">
              <span
                className={`font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                  Math.abs(saaSum - 100) < 0.05
                    ? 'bg-emerald-950/50 text-emerald-300 border-emerald-600/40'
                    : 'bg-rose-950/50 text-rose-300 border-rose-600/40'
                }`}
              >
                SAA 비중 합계: {saaSum.toFixed(2)}%
              </span>
              <button
                onClick={onSavePolicies}
                disabled={isSaving || Math.abs(saaSum - 100) > 0.05}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-50"
              >
                SAA/TAA 정책 저장
              </button>
            </div>
          </div>

          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                <th className="py-3 px-4">9대 전략자산군</th>
                <th className="py-3 px-3 text-right">현재 금액</th>
                <th className="py-3 px-3 text-right">현재 비중</th>
                <th className="py-3 px-2 text-right">β_eq</th>
                <th className="py-3 px-3 text-right text-purple-300">BL 수리원값</th>
                <th className="py-3 px-3 text-center bg-sky-950/20 text-sky-300">SAA 목표(%)</th>
                <th className="py-3 px-3 text-right">비례밴드</th>
                <th className="py-3 px-3 text-right">SAA 목표액</th>
                <th className="py-3 px-3 text-right">필요 매매액</th>
                <th className="py-3 px-3 text-right">RC% (RC/W)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono whitespace-nowrap">
              {MAJOR_9_ASSETS.map((asset) => {
                const curAmt = currentAmounts[asset.key] || 0
                const curPct = currentWeights[asset.key] || 0
                const blRaw = blResult.rawOptimalWeights9[asset.key] || 0
                const saaPct = saaWeights[asset.key] || 0
                const band = computeProportionalCorridor(saaPct, corridorRule)
                const targetAmt = currentTotalEval * (saaPct / 100)
                const tradeAmt = targetAmt - curAmt
                const rc = saaRisk.riskContributionsPct[asset.key] || 0
                const rcRatio = saaRisk.rcToWeightRatio[asset.key] || 0

                return (
                  <tr key={asset.key} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-200">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: asset.color }}
                        />
                        <span>{asset.label}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{fmtMoney(curAmt)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      {formatPercent(curPct, false)}
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-400">
                      {asset.betaEq.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-purple-300">{blRaw.toFixed(2)}%</td>
                    <td className="py-2 px-3 bg-sky-950/10">
                      <div className="flex items-center justify-center gap-1 font-sans">
                        <button
                          onClick={() =>
                            setSaaWeights((prev) => ({
                              ...prev,
                              [asset.key]: Math.max(0, Number(((prev[asset.key] || 0) - 0.5).toFixed(2))),
                            }))
                          }
                          className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          step={0.5}
                          min={0}
                          max={100}
                          value={saaPct}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                            setSaaWeights((prev) => ({ ...prev, [asset.key]: v }))
                          }}
                          className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-xs font-mono text-sky-300 font-bold"
                        />
                        <button
                          onClick={() =>
                            setSaaWeights((prev) => ({
                              ...prev,
                              [asset.key]: Math.min(100, Number(((prev[asset.key] || 0) + 0.5).toFixed(2))),
                            }))
                          }
                          className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">±{band.toFixed(2)}%p</td>
                    <td className="py-2.5 px-3 text-right text-slate-200">{fmtMoney(targetAmt)}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        tradeAmt > 0
                          ? 'text-emerald-400'
                          : tradeAmt < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {fmtDelta(tradeAmt)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={rcRatio > 1.6 ? 'text-amber-400 font-bold' : 'text-slate-300'}
                      >
                        {rc.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-slate-500 ml-1">({rcRatio.toFixed(2)}x)</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* 자본비중 vs 리스크기여도 차트 & 정책 이력 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="SAA 자본비중(W%) vs 리스크기여도(RC%)"
            subtitle="리스크 기여 편중(RC/W > 1.6x) 여부 시각화"
          />
          <CardBody>
            <EChartsWrapper option={rcChartOption} height="320px" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="정책 버전 이력 (allocation_policies & allo_table)"
            subtitle="저장된 9대 자산군 정책 및 레거시 6컬럼 스냅샷 불러오기"
          />
          <CardBody className="p-0 overflow-auto max-h-[340px]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 bg-slate-900 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2 px-3">기준일</th>
                  <th className="py-2 px-2">구분</th>
                  <th className="py-2 px-2 text-right">β_eq</th>
                  <th className="py-2 px-3">근거 요약</th>
                  <th className="py-2 px-2 text-center">상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {allocationPolicies.map((pol, idx) => (
                  <tr key={pol.id ?? idx} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 font-mono text-slate-300">{pol.effective_date}</td>
                    <td className="py-2 px-2 font-semibold text-sky-400">{pol.policy_type}</td>
                    <td className="py-2 px-2 text-right font-mono text-slate-300">
                      {pol.equity_eq_beta_pct ? `${Number(pol.equity_eq_beta_pct).toFixed(2)}%` : '-'}
                    </td>
                    <td className="py-2 px-3 text-slate-400 max-w-[220px] truncate" title={pol.rationale || ''}>
                      {pol.rationale || '-'}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {pol.is_current ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          현행
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">이력</span>
                      )}
                    </td>
                  </tr>
                ))}
                {allocationPolicies.length === 0 &&
                  alloRows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3 font-mono text-slate-300">{String(r.배분일자 || '')}</td>
                      <td className="py-2 px-2 text-emerald-400">{String(r.구분 || '')}</td>
                      <td className="py-2 px-2 text-right">-</td>
                      <td className="py-2 px-3 text-slate-400">레거시 allo_table 행</td>
                      <td className="py-2 px-2 text-center">-</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
