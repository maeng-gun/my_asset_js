'use client'

import { useMemo } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import {
  AlmCashflowScheduleRow,
  CorridorRule,
  LtcmaModelInputs,
  MAJOR_9_ASSETS,
  MAJOR_9_KEYS,
  Major9Key,
  TaaScorecard4Axis,
  Weights9,
  computeEquityEqBeta,
  sumWeights9,
} from '@/lib/engine/alm-tpa-types'
import {
  DEFAULT_TAA_SCORECARD_26Q4,
  computeTaaFromScorecard,
  evaluateCorridors,
  evaluateTpaRiskMetrics,
} from '@/lib/engine/saa-taa-optimizer'
import { formatKRW, formatPercent } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Calculator,
  CalendarPlus,
  Coins,
  Copy,
  RotateCcw,
  Save,
  TrendingUp,
  Wallet,
} from 'lucide-react'

interface TaaScorecardTabProps {
  currentTotalEval: number
  expectedInflow: number
  setExpectedInflow: (next: number | ((prev: number) => number)) => void
  currentAmounts: Record<Major9Key, number>
  currentWeights: Weights9
  refWeights: Weights9
  saaWeights: Weights9
  taaWeights: Weights9
  setTaaWeights: (next: Weights9 | ((prev: Weights9) => Weights9)) => void
  scorecard: TaaScorecard4Axis
  setScorecard: (next: TaaScorecard4Axis | ((prev: TaaScorecard4Axis) => TaaScorecard4Axis)) => void
  corridorRule: CorridorRule
  ltcmaInputs: LtcmaModelInputs
  minNonPensionDebtFloorPct: number
  cashflowSchedules: AlmCashflowScheduleRow[]
  unitMode: 'won' | 'man'
  onSavePolicies: () => Promise<void>
  onResetFromDb: () => void
  isSaving: boolean
}

const AXIS_DEFS: Array<{
  key: 'cycle' | 'inflationRates' | 'valuationFx' | 'policyEvent'
  label: string
  hint: string
}> = [
  { key: 'cycle', label: '① 경기 사이클 (OECD CLI)', hint: '-2 침체 ~ +2 확장' },
  { key: 'inflationRates', label: '② 물가·금리 (TIPS·BEI)', hint: '-2 디플레/인하 ~ +2 고물가/인상' },
  { key: 'valuationFx', label: '③ 밸류에이션·환율', hint: '-2 고평가/방어 ~ +2 저평가/공격' },
  { key: 'policyEvent', label: '④ 정책·선거·수급 뷰', hint: '-2 긴축/규제 ~ +2 부양/완화' },
]

export function TaaScorecardTab({
  currentTotalEval,
  expectedInflow,
  setExpectedInflow,
  currentAmounts,
  currentWeights,
  refWeights,
  saaWeights,
  taaWeights,
  setTaaWeights,
  scorecard,
  setScorecard,
  corridorRule,
  ltcmaInputs,
  minNonPensionDebtFloorPct,
  cashflowSchedules,
  unitMode,
  onSavePolicies,
  onResetFromDb,
  isSaving,
}: TaaScorecardTabProps) {
  const targetTotalEval = currentTotalEval + expectedInflow

  const fmtMoney = (val: number, withUnit = false) => {
    if (unitMode === 'man') {
      return Math.round(val / 10_000).toLocaleString('ko-KR') + (withUnit ? ' 만원' : '')
    }
    return Math.round(val).toLocaleString('ko-KR') + (withUnit ? ' 원' : '')
  }

  const fmtDelta = (val: number, withUnit = false) => {
    const sign = val > 0 ? '+' : ''
    return `${sign}${fmtMoney(val, withUnit)}`
  }

  const taaSum = useMemo(() => Number(sumWeights9(taaWeights).toFixed(2)), [taaWeights])
  const taaBeta = useMemo(() => computeEquityEqBeta(taaWeights), [taaWeights])
  const taaRisk = useMemo(
    () =>
      evaluateTpaRiskMetrics(taaWeights, refWeights, ltcmaInputs, {
        targetBetaEqPct: 75.0,
        betaTolerancePct: 7.5,
      }),
    [taaWeights, refWeights, ltcmaInputs]
  )

  const corridors = useMemo(
    () => evaluateCorridors(currentWeights, taaWeights, corridorRule),
    [currentWeights, taaWeights, corridorRule]
  )

  const handleLoadScheduledMonthlyInflow = () => {
    const monthlyPositive = cashflowSchedules
      .filter((s) => s.is_active && s.cadence === 'monthly' && s.amount_krw > 0)
      .reduce((acc, s) => acc + Number(s.amount_krw), 0)
    const fallback = monthlyPositive > 0 ? monthlyPositive : 4_400_000
    setExpectedInflow(fallback)
    toast.success(`정기 월간 유입 합계(+${Math.round(fallback / 10_000).toLocaleString()}만 원)를 반영했습니다.`)
  }

  const handleComputeFromScorecard = (useManual = false) => {
    const sc: TaaScorecard4Axis = useManual
      ? scorecard
      : { ...scorecard, manualTilts: undefined }
    const res = computeTaaFromScorecard(saaWeights, sc, {
      maxAssetTiltPct: 5.0,
      refBetaPct: 75.0,
      maxBetaDeviationPct: 7.5,
      minNonPensionDebtFloorPct,
    })
    setTaaWeights(res.weights9)
    toast.success(
      `4축 스코어카드 기반 TAA 산출 완료 (β_eq ${res.riskMetrics.equityEqBetaPct}%, E[R] ${res.riskMetrics.expectedReturnPct}%)`
    )
  }

  // Charts
  const compareChartOption = useMemo(() => {
    const categories = MAJOR_9_ASSETS.map((m) => m.shortLabel)
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['현재 비중', '1층 Ref', '2층-A SAA', '2층-B TAA'],
        textStyle: { color: '#94a3b8' },
        right: '2%',
        top: '2%',
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
        name: '비중(%)',
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
      },
      series: [
        {
          name: '현재 비중',
          type: 'bar',
          data: MAJOR_9_KEYS.map((k) => Number((currentWeights[k] || 0).toFixed(2))),
          itemStyle: { color: '#10b981', borderRadius: [3, 3, 0, 0] },
        },
        {
          name: '1층 Ref',
          type: 'bar',
          data: MAJOR_9_KEYS.map((k) => Number((refWeights[k] || 0).toFixed(2))),
          itemStyle: { color: '#64748b', borderRadius: [3, 3, 0, 0] },
        },
        {
          name: '2층-A SAA',
          type: 'bar',
          data: MAJOR_9_KEYS.map((k) => Number((saaWeights[k] || 0).toFixed(2))),
          itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] },
        },
        {
          name: '2층-B TAA',
          type: 'bar',
          data: MAJOR_9_KEYS.map((k) => Number((taaWeights[k] || 0).toFixed(2))),
          itemStyle: { color: '#38bdf8', borderRadius: [3, 3, 0, 0] },
        },
      ],
    }
  }, [currentWeights, refWeights, saaWeights, taaWeights])

  const tradeChartOption = useMemo(() => {
    const categories = MAJOR_9_ASSETS.map((m) => m.shortLabel)
    const saaTrades = MAJOR_9_KEYS.map((k) =>
      Math.round((targetTotalEval * ((saaWeights[k] || 0) / 100) - (currentAmounts[k] || 0)) / 10_000)
    )
    const taaTrades = MAJOR_9_KEYS.map((k) =>
      Math.round((targetTotalEval * ((taaWeights[k] || 0) / 100) - (currentAmounts[k] || 0)) / 10_000)
    )

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['SAA 필요 매매액', 'TAA 필요 매매액'],
        textStyle: { color: '#94a3b8' },
        right: '2%',
        top: '2%',
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
        name: '금액 (만원)',
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          name: 'SAA 필요 매매액',
          type: 'bar',
          data: saaTrades,
          itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] },
        },
        {
          name: 'TAA 필요 매매액',
          type: 'bar',
          data: taaTrades,
          itemStyle: { color: '#06b6d4', borderRadius: [3, 3, 0, 0] },
        },
      ],
    }
  }, [targetTotalEval, currentAmounts, saaWeights, taaWeights])

  return (
    <div className="space-y-6">
      {/* 총자산 목표금액 & 자금 유출입 컨트롤 바 */}
      <Card className="border-emerald-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-900/90 shadow-lg">
        <CardBody className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            <div className="space-y-1 border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 pr-0 md:pr-4">
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                <Wallet className="w-4 h-4 text-emerald-400" />
                현재 포트폴리오 총평가금액
              </div>
              <div className="text-2xl font-bold font-mono text-slate-100">
                {formatKRW(currentTotalEval)} 원
              </div>
              <div className="text-xs text-slate-500">
                약 {Math.round(currentTotalEval / 10_000).toLocaleString()} 만원 (100.0%)
              </div>
            </div>

            <div className="space-y-2 border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 pr-0 md:pr-4">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-slate-300 flex items-center gap-1">
                  <Coins className="w-4 h-4 text-sky-400" />
                  예상 자금 유출입 (+입금 / -출금)
                </span>
                <span
                  className={`font-mono font-bold ${
                    expectedInflow > 0
                      ? 'text-emerald-400'
                      : expectedInflow < 0
                      ? 'text-rose-400'
                      : 'text-slate-400'
                  }`}
                >
                  {fmtDelta(expectedInflow, true)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step={1_000_000}
                  value={expectedInflow}
                  onChange={(e) => setExpectedInflow(Number(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleLoadScheduledMonthlyInflow}
                  title="ALM 스케줄의 월간 정기 유입(한투+농협IRP) 불러오기"
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold bg-sky-950/60 hover:bg-sky-900/60 text-sky-300 border border-sky-700/40"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                  정기유입
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[-10_000_000, -5_000_000, -1_000_000, 0, 1_000_000, 5_000_000, 10_000_000].map(
                  (step) => (
                    <button
                      key={step}
                      onClick={() => {
                        if (step === 0) setExpectedInflow(0)
                        else setExpectedInflow((prev) => prev + step)
                      }}
                      className={`text-[11px] px-2 py-0.5 rounded-lg font-mono transition ${
                        step === 0
                          ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          : step > 0
                          ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-900/40'
                          : 'bg-rose-950/40 text-rose-400 border border-rose-500/20 hover:bg-rose-900/40'
                      }`}
                    >
                      {step === 0 ? '0' : step > 0 ? `+${step / 10_000}만` : `${step / 10_000}만`}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-slate-300 flex items-center gap-1">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  총자산 목표금액 (현재 + 유출입)
                </span>
                <span className="text-xs text-emerald-400 font-mono">
                  ({expectedInflow >= 0 ? '+' : ''}
                  {((expectedInflow / Math.max(1, currentTotalEval)) * 100).toFixed(1)}%)
                </span>
              </div>
              <input
                type="number"
                step={1_000_000}
                value={targetTotalEval}
                onChange={(e) => {
                  const nextTarget = Number(e.target.value) || currentTotalEval
                  setExpectedInflow(nextTarget - currentTotalEval)
                }}
                className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-base font-bold font-mono text-emerald-400"
              />
              <div className="text-xs text-slate-500 flex items-center justify-between">
                <span>약 {Math.round(targetTotalEval / 10_000).toLocaleString()} 만원</span>
                <span className="text-slate-400 font-mono">TAA 기대수익 {taaRisk.expectedReturnPct}% / Vol {taaRisk.volatilityPct}%</span>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 4축 TAA 스코어카드 */}
      <Card className="border-sky-500/20">
        <CardHeader
          title="2층-B 4축 매크로 TAA 스코어카드"
          subtitle="개별 자산군 SAA ±5.0%p · 총 주식등가 위험 75±7.5%p 한도 내 자동 틸트 산출"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setScorecard(DEFAULT_TAA_SCORECARD_26Q4)
                  toast.success('26Q4~27H1 기본 스코어카드 프리셋을 불러왔습니다.')
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                26Q4~27H1 프리셋
              </button>
              <button
                onClick={() => {
                  setScorecard({
                    regimeLabel: '중립 (Neutral = SAA)',
                    cycle: 0,
                    inflationRates: 0,
                    valuationFx: 0,
                    policyEvent: 0,
                    manualTilts: undefined,
                  })
                  setTaaWeights({ ...saaWeights })
                  toast.success('스코어카드를 중립(0)으로 초기화했습니다.')
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                중립 초기화
              </button>
              <button
                onClick={() => handleComputeFromScorecard(false)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white"
              >
                <Calculator className="w-3.5 h-3.5" /> 스코어카드 → TAA 자동 계산
              </button>
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {AXIS_DEFS.map((axis) => {
              const val = scorecard[axis.key] ?? 0
              return (
                <div
                  key={axis.key}
                  className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">{axis.label}</span>
                    <span
                      className={`font-mono font-bold ${
                        val > 0 ? 'text-emerald-400' : val < 0 ? 'text-rose-400' : 'text-slate-400'
                      }`}
                    >
                      {val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-2}
                    max={2}
                    step={0.5}
                    value={val}
                    onChange={(e) =>
                      setScorecard((prev) => ({
                        ...prev,
                        [axis.key]: parseFloat(e.target.value),
                        manualTilts: undefined,
                      }))
                    }
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{axis.hint}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-950/50 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">레짐 메모:</span>
              <input
                type="text"
                value={scorecard.regimeLabel || ''}
                onChange={(e) => setScorecard((prev) => ({ ...prev, regimeLabel: e.target.value }))}
                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 w-64 sm:w-80"
              />
            </div>
            <div className="flex items-center gap-3 font-mono">
              <span
                className={`px-2.5 py-1 rounded-lg border ${
                  Math.abs(taaBeta - 75) <= 7.5
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/40'
                    : 'bg-rose-950/40 text-rose-300 border-rose-700/40'
                }`}
              >
                β_eq: {taaBeta.toFixed(2)}% (허용 67.5%~82.5%)
              </span>
              <span
                className={`px-2.5 py-1 rounded-lg border ${
                  Math.abs(taaSum - 100) < 0.05
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-700/40'
                    : 'bg-rose-950/40 text-rose-300 border-rose-700/40'
                }`}
              >
                합계: {taaSum.toFixed(2)}%
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 9대 자산군 통합 목표 비교 및 확정 테이블 */}
      <Card>
        <CardHeader
          title="9대 자산군 현재 · SAA · TAA 확정표 & 비례밴드 이탈 판정"
          subtitle="비례밴드 min(±5%p, max(±1.5%p, 0.25×목표비중)) 기준으로 리밸런싱 시급도를 자동 판정합니다"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setTaaWeights({ ...saaWeights })
                  toast.success('SAA 비중을 TAA에 그대로 복사했습니다.')
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <Copy className="w-3.5 h-3.5" /> SAA 복사
              </button>
              <button
                onClick={onResetFromDb}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <RotateCcw className="w-3.5 h-3.5" /> DB 복원
              </button>
              <button
                onClick={onSavePolicies}
                disabled={isSaving || Math.abs(taaSum - 100) > 0.05}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> 정책 DB 저장 (9대 + allo_table)
              </button>
            </div>
          }
        />
        <CardBody className="p-0 overflow-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 whitespace-nowrap">
                <th className="py-3 px-4">9대 전략자산군</th>
                <th className="py-3 px-3 text-right">현재 금액</th>
                <th className="py-3 px-3 text-right">현재 비중</th>
                <th className="py-3 px-3 text-right text-sky-300">SAA 목표</th>
                <th className="py-3 px-3 text-center bg-emerald-950/20 text-emerald-300">
                  TAA 목표(%)
                </th>
                <th className="py-3 px-3 text-right">TAA 틸트</th>
                <th className="py-3 px-3 text-right">비례밴드</th>
                <th className="py-3 px-3 text-right">괴리 (%p)</th>
                <th className="py-3 px-3 text-center">밴드 판정</th>
                <th className="py-3 px-3 text-right">TAA 목표액</th>
                <th className="py-3 px-4 text-right bg-emerald-950/20 text-emerald-300 font-bold">
                  TAA 필요 매매액
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono whitespace-nowrap">
              {MAJOR_9_ASSETS.map((asset, idx) => {
                const curAmt = currentAmounts[asset.key] || 0
                const curPct = currentWeights[asset.key] || 0
                const saaPct = saaWeights[asset.key] || 0
                const taaPct = taaWeights[asset.key] || 0
                const tilt = taaPct - saaPct
                const corr = corridors[idx]
                const targetAmt = targetTotalEval * (taaPct / 100)
                const tradeAmt = targetAmt - curAmt

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
                    <td className="py-2.5 px-3 text-right text-sky-400">{saaPct.toFixed(2)}%</td>
                    <td className="py-2 px-3 bg-emerald-950/10">
                      <div className="flex items-center justify-center gap-1 font-sans">
                        <button
                          onClick={() =>
                            setTaaWeights((prev) => ({
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
                          value={taaPct}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0))
                            setTaaWeights((prev) => ({ ...prev, [asset.key]: v }))
                          }}
                          className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-xs font-mono text-emerald-300 font-bold"
                        />
                        <button
                          onClick={() =>
                            setTaaWeights((prev) => ({
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
                    <td
                      className={`py-2.5 px-3 text-right ${
                        Math.abs(tilt) > 5.01
                          ? 'text-rose-400 font-bold'
                          : tilt > 0
                          ? 'text-emerald-400'
                          : tilt < 0
                          ? 'text-amber-300'
                          : 'text-slate-500'
                      }`}
                    >
                      {tilt > 0 ? '+' : ''}
                      {tilt.toFixed(2)}%p
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-400">
                      ±{corr.bandPct.toFixed(2)}%p
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        corr.diffPct > 0
                          ? 'text-amber-300'
                          : corr.diffPct < 0
                          ? 'text-sky-300'
                          : 'text-slate-400'
                      }`}
                    >
                      {corr.diffPct > 0 ? '+' : ''}
                      {corr.diffPct.toFixed(2)}%p
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      {corr.status === 'OK' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          정상
                        </span>
                      ) : corr.status === 'WARNING' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          경계 이탈
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                          심각 이탈
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{fmtMoney(targetAmt)}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-bold text-sm bg-emerald-950/20 ${
                        tradeAmt > 0
                          ? 'text-emerald-400'
                          : tradeAmt < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {fmtDelta(tradeAmt)}
                      <span className="text-[10px] ml-1 font-normal font-sans">
                        {tradeAmt > 0 ? '(매수)' : tradeAmt < 0 ? '(매도)' : '-'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* 비교 차트 2종 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="9대 자산군 비중 비교"
            subtitle="현재 비중 vs 1층 Ref vs 2층-A SAA vs 2층-B TAA"
          />
          <CardBody>
            <EChartsWrapper option={compareChartOption} height="350px" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="9대 자산군 필요 매매금액"
            subtitle="(+) 추가 매수 필요 / (-) 비중 축소 및 매도 금액"
          />
          <CardBody>
            <EChartsWrapper option={tradeChartOption} height="350px" />
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
