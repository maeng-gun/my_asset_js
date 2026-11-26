'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import {
  addAlmCashflowSchedule,
  deleteAlmCashflowSchedule,
  getAlmCashflowSchedules,
  getAlmConfig,
  getLatestPortfolioSummary,
  saveAlmConfig,
  updateAlmCashflowSchedule,
} from '@/lib/actions/db'
import {
  AccountAllocationLike,
  AlmCadence,
  AlmCashflowScheduleRow,
  AlmConfigRow,
  AlmFlowType,
  AlmLiability,
} from '@/lib/engine/alm-tpa-types'
import {
  computeHouseholdBalanceSheet,
  computeMortgage2029Tracker,
  projectAlm30Years,
} from '@/lib/engine/alm-projection'
import { ALLOCATION_ACCOUNTS, LatestPortfolioSummary } from '@/lib/engine/types'
import { formatKRW } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CalendarClock,
  Check,
  Edit2,
  Landmark,
  PlusCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

const FLOW_TYPE_LABELS: Record<AlmFlowType, string> = {
  salary_saving: '월급 순저축',
  employer_pension: '회사 퇴직연금',
  personal_pension: '개인연금 납입',
  debt_interest: '차입 이자 유출',
  debt_principal: '원금 상환',
  child_handover: '자녀 승계 유출',
}

const CADENCE_LABELS: Record<AlmCadence, string> = {
  monthly: '매월',
  annual_jan: '매년 1월',
  annual_dec: '매년 12월',
  one_off: '일회성',
}

const DEFAULT_ALM_CONFIG: AlmConfigRow = {
  id: 'default',
  birth_year: 1984,
  accumulation_end_age: 60,
  pension_start_age: 67,
  max_tolerable_mdd_pct: -28.0,
  liabilities: [
    {
      id: 'parents_loan',
      title: '부모님 차입 투자자금',
      principal_krw: 120_000_000,
      annual_rate_pct: 3.25,
      rate_type: 'floating_deposit',
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
      rate_type: 'fixed',
      start_date: '2026-12-01',
      maturity_date: '2029-12-31',
      repay_at_maturity: true,
      non_pension_only: true,
    },
  ],
  glide_path: [
    {
      stage: '핵심 축적기',
      age_start: 42,
      age_end: 54,
      equity_ref_pct: 75,
      bond_ref_pct: 25,
      annual_step_pct: 0,
    },
    {
      stage: '소득 전환기 (Bond Tent)',
      age_start: 55,
      age_end: 62,
      equity_ref_pct: 60,
      bond_ref_pct: 40,
      annual_step_pct: -2,
    },
    {
      stage: '은퇴 인출기',
      age_start: 63,
      age_end: 90,
      equity_ref_pct: 57.5,
      bond_ref_pct: 42.5,
      annual_step_pct: 0,
    },
  ],
  tax_offsets: {
    spouse_external_pension_insurance_krw: 3_600_000,
    pension_tax_credit_limit_krw: 9_000_000,
  },
}

interface ScheduleFormState {
  id: number | null
  title: string
  account: string
  flow_type: AlmFlowType
  cadence: AlmCadence
  amount_krw: number
  growth_rate_pct: number
  start_date: string
  end_date: string
  is_active: boolean
  note: string
}

const EMPTY_SCHEDULE_FORM: ScheduleFormState = {
  id: null,
  title: '',
  account: '한투',
  flow_type: 'salary_saving',
  cadence: 'monthly',
  amount_krw: 0,
  growth_rate_pct: 0,
  start_date: '2026-12-01',
  end_date: '2044-12-31',
  is_active: true,
  note: '',
}

export function AlmDashboardTab() {
  const queryClient = useQueryClient()

  const { data: summary } = useQuery({
    queryKey: ['latest-portfolio-summary'],
    queryFn: async () => (await getLatestPortfolioSummary()) as LatestPortfolioSummary,
  })

  const { data: dbAlmConfig = null } = useQuery({
    queryKey: ['alm-config'],
    queryFn: async () => (await getAlmConfig()) as AlmConfigRow | null,
  })

  const { data: schedules = [] } = useQuery({
    queryKey: ['alm-cashflow-schedules'],
    queryFn: async () => (await getAlmCashflowSchedules()) as AlmCashflowScheduleRow[],
  })

  const [configDraft, setConfigDraft] = useState<AlmConfigRow | null>(null)
  const activeConfig = configDraft ?? dbAlmConfig ?? DEFAULT_ALM_CONFIG

  const [schedForm, setSchedForm] = useState<ScheduleFormState>(EMPTY_SCHEDULE_FORM)
  const [annualDividendEstimate, setAnnualDividendEstimate] = useState<number>(8_790_000)

  const accountAllo = useMemo(
    () => ((summary?.account_allocation || []) as unknown) as AccountAllocationLike[],
    [summary]
  )

  const currentTotalAssetsKrw = useMemo(() => {
    const totalRow = accountAllo.find((r) => r.자산군 === '<합계>')
    return Number(totalRow?.합계) || 506_046_857
  }, [accountAllo])

  const balanceSheet = useMemo(
    () =>
      computeHouseholdBalanceSheet(
        currentTotalAssetsKrw,
        activeConfig,
        annualDividendEstimate,
        2026
      ),
    [currentTotalAssetsKrw, activeConfig, annualDividendEstimate]
  )

  const mortgageTracker = useMemo(
    () => computeMortgage2029Tracker(accountAllo, activeConfig, schedules, summary?.기준일 || '2026-11-26'),
    [accountAllo, activeConfig, schedules, summary?.기준일]
  )

  const projection30Y = useMemo(
    () =>
      projectAlm30Years({
        currentTotalAssetsKrw,
        almConfig: activeConfig,
        schedules,
        startYear: 2026,
        horizonYears: 30,
      }),
    [currentTotalAssetsKrw, activeConfig, schedules]
  )

  // Mutations
  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      await saveAlmConfig(activeConfig)
    },
    onSuccess: () => {
      toast.success('가계 ALM 마스터 설정(alm_config)이 저장되었습니다.')
      setConfigDraft(null)
      queryClient.invalidateQueries({ queryKey: ['alm-config'] })
    },
    onError: (err: Error) => toast.error(`ALM 설정 저장 오류: ${err.message}`),
  })

  const saveScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!schedForm.title.trim()) throw new Error('스케줄 제목을 입력하세요.')
      const payload = {
        title: schedForm.title,
        account: schedForm.account,
        flow_type: schedForm.flow_type,
        cadence: schedForm.cadence,
        amount_krw: schedForm.amount_krw,
        growth_rate_pct: schedForm.growth_rate_pct,
        start_date: schedForm.start_date,
        end_date: schedForm.end_date || null,
        is_active: schedForm.is_active,
        note: schedForm.note || null,
      }
      if (schedForm.id !== null) {
        await updateAlmCashflowSchedule(schedForm.id, payload)
      } else {
        await addAlmCashflowSchedule(payload)
      }
    },
    onSuccess: () => {
      toast.success(
        schedForm.id !== null ? '현금흐름 스케줄이 수정되었습니다.' : '새 현금흐름 스케줄이 추가되었습니다.'
      )
      setSchedForm(EMPTY_SCHEDULE_FORM)
      queryClient.invalidateQueries({ queryKey: ['alm-cashflow-schedules'] })
    },
    onError: (err: Error) => toast.error(`스케줄 저장 오류: ${err.message}`),
  })

  const toggleScheduleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await updateAlmCashflowSchedule(id, { is_active })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alm-cashflow-schedules'] })
    },
  })

  const deleteScheduleMutation = useMutation({
    mutationFn: async (id: number) => {
      await deleteAlmCashflowSchedule(id)
    },
    onSuccess: () => {
      toast.success('현금흐름 스케줄이 삭제되었습니다.')
      if (schedForm.id !== null) setSchedForm(EMPTY_SCHEDULE_FORM)
      queryClient.invalidateQueries({ queryKey: ['alm-cashflow-schedules'] })
    },
    onError: (err: Error) => toast.error(`삭제 오류: ${err.message}`),
  })

  // Charts
  const mortgageChartOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['비연금 만기채+현금 예상경로', '2029.12 주담대 상환 하한'],
        textStyle: { color: '#94a3b8' },
        top: '2%',
        right: '2%',
      },
      grid: { left: '3%', right: '4%', bottom: '12%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        data: mortgageTracker.trajectory.map((t) => t.month),
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: '금액(만원)',
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8' },
      },
      series: [
        {
          name: '비연금 만기채+현금 예상경로',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: mortgageTracker.trajectory.map((t) => Math.round(t.projectedBufferKrw / 10_000)),
          itemStyle: { color: '#10b981' },
          lineStyle: { color: '#10b981', width: 2.5 },
        },
        {
          name: '2029.12 주담대 상환 하한',
          type: 'line',
          symbol: 'none',
          data: mortgageTracker.trajectory.map((t) => Math.round(t.targetFloorKrw / 10_000)),
          itemStyle: { color: '#f59e0b' },
          lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' },
        },
      ],
    }),
    [mortgageTracker]
  )

  const fanChartOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['보수적 순자산(4.0%)', '기본 순자산(6.5%)', '낙관적 순자산(8.5%)', '글라이드패스 주식(%)'],
        textStyle: { color: '#94a3b8' },
        top: '2%',
        right: '2%',
      },
      grid: { left: '3%', right: '5%', bottom: '12%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        data: projection30Y.map((p) => `${p.year}(${p.age}세)`),
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      yAxis: [
        {
          type: 'value',
          name: '순자산 (억원)',
          nameTextStyle: { color: '#94a3b8' },
          axisLine: { lineStyle: { color: '#334155' } },
          splitLine: { lineStyle: { color: '#1e293b' } },
          axisLabel: { color: '#94a3b8' },
        },
        {
          type: 'value',
          name: '목표 주식비중(%)',
          min: 40,
          max: 90,
          nameTextStyle: { color: '#38bdf8' },
          axisLine: { lineStyle: { color: '#334155' } },
          splitLine: { show: false },
          axisLabel: { color: '#38bdf8', formatter: '{value}%' },
        },
      ],
      series: [
        {
          name: '보수적 순자산(4.0%)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: projection30Y.map((p) => Number((p.pessimisticNetKrw / 100_000_000).toFixed(2))),
          itemStyle: { color: '#94a3b8' },
          lineStyle: { color: '#94a3b8', width: 1.5, type: 'dashed' },
        },
        {
          name: '기본 순자산(6.5%)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: projection30Y.map((p) => Number((p.baseNetKrw / 100_000_000).toFixed(2))),
          itemStyle: { color: '#10b981' },
          lineStyle: { color: '#10b981', width: 3 },
        },
        {
          name: '낙관적 순자산(8.5%)',
          type: 'line',
          smooth: true,
          symbol: 'none',
          data: projection30Y.map((p) => Number((p.optimisticNetKrw / 100_000_000).toFixed(2))),
          itemStyle: { color: '#34d399' },
          lineStyle: { color: '#34d399', width: 1.5, type: 'dotted' },
        },
        {
          name: '글라이드패스 주식(%)',
          type: 'line',
          yAxisIndex: 1,
          smooth: false,
          symbol: 'none',
          data: projection30Y.map((p) => p.targetEquityPct),
          itemStyle: { color: '#38bdf8' },
          lineStyle: { color: '#38bdf8', width: 2 },
        },
      ],
    }),
    [projection30Y]
  )

  const updateConfigField = <K extends keyof AlmConfigRow>(key: K, val: AlmConfigRow[K]) => {
    setConfigDraft((prev) => ({ ...(prev ?? activeConfig), [key]: val }))
  }

  const updateLiability = (idx: number, patch: Partial<AlmLiability>) => {
    const next = activeConfig.liabilities.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    updateConfigField('liabilities', next)
  }

  return (
    <div className="space-y-6">
      {/* 1. 가계 경제적 대차대조표 KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 mb-1">총 금융자산 (A)</div>
            <div className="text-xl font-bold font-mono text-slate-100">
              {formatKRW(balanceSheet.totalAssetsKrw)}원
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              만 {balanceSheet.currentAge}세 (축적기 ~{activeConfig.accumulation_end_age}세)
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 mb-1">총 차입 부채 (D)</div>
            <div className="text-xl font-bold font-mono text-rose-400">
              {formatKRW(balanceSheet.totalDebtKrw)}원
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              예수부채 {Math.round(balanceSheet.investmentDebtKrw / 10_000).toLocaleString()}만 + 주담대{' '}
              {Math.round(balanceSheet.maturityDebtKrw / 10_000).toLocaleString()}만
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 mb-1">순투자자본 (E = A - D_inv)</div>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {formatKRW(balanceSheet.netInvestmentCapitalKrw)}원
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              순금융자산(주담대 차감): {Math.round(balanceSheet.netFinancialWorthKrw / 10_000).toLocaleString()}만
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 mb-1">레버리지 배수 (L = A / E)</div>
            <div className="text-xl font-bold font-mono text-sky-400">
              {balanceSheet.leverageRatio.toFixed(2)}x
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              감내 MDD: {activeConfig.max_tolerable_mdd_pct}%
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 mb-1">이자보상배율 (ICR)</div>
            <div className="text-xl font-bold font-mono text-amber-300">
              {balanceSheet.icr.toFixed(2)}x
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              세후배당/이자 vs 연이자 {Math.round(balanceSheet.annualInterestOutflowKrw / 10_000).toLocaleString()}만
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 2. 2029.12 주담대 7,000만 매칭 트래커 + 30년 팬차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-5 border-amber-500/20">
          <CardHeader
            title="2029.12 주담대 7,000만 부채매칭 트래커"
            subtitle="연금(인출잠금) 제외 비연금 인출가능 계좌(한투·한투ISA·불리오) 만기채+현금 실측"
          />
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">
                만기일 {mortgageTracker.maturityDate} ({mortgageTracker.monthsRemaining}개월 남음)
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-semibold ${
                  mortgageTracker.shortfallKrw === 0
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                충족률 {mortgageTracker.coveragePct}%
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full ${
                  mortgageTracker.shortfallKrw === 0 ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, mortgageTracker.coveragePct)}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-500 font-sans">현재 버퍼</div>
                <div className="font-bold text-slate-100">
                  {Math.round(mortgageTracker.currentBufferKrw / 10_000).toLocaleString()}만
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-500 font-sans">부족분</div>
                <div className="font-bold text-amber-300">
                  {Math.round(mortgageTracker.shortfallKrw / 10_000).toLocaleString()}만
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[10px] text-slate-500 font-sans">월 필요적립</div>
                <div className="font-bold text-sky-300">
                  {Math.round(mortgageTracker.requiredMonthlyPaceKrw / 10_000).toLocaleString()}만/월
                </div>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              {mortgageTracker.accountBreakdown.map((b) => (
                <div
                  key={b.account}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-950/50 border border-slate-800/80 font-mono"
                >
                  <span className="font-sans font-semibold text-slate-200">{b.account}</span>
                  <span className="text-slate-400">
                    만기채 {Math.round(b.htmBondKrw / 10_000).toLocaleString()}만 + 현금{' '}
                    {Math.round(b.cashKrw / 10_000).toLocaleString()}만
                  </span>
                  <span className="text-emerald-400 font-bold">
                    {Math.round(b.totalBufferKrw / 10_000).toLocaleString()}만
                  </span>
                </div>
              ))}
            </div>

            <EChartsWrapper option={mortgageChartOption} height="200px" />
          </CardBody>
        </Card>

        <Card className="lg:col-span-7 border-emerald-500/20">
          <CardHeader
            title="30년 가계 순자산 투사 & 생애주기 글라이드패스 팬차트"
            subtitle="인적자본 저축·부부 연금·2029 주담대 상환·2046 자녀 승계 이벤트를 통합 반영한 장기 경로"
          />
          <CardBody className="space-y-4">
            <EChartsWrapper option={fanChartOption} height="330px" />
            <div className="grid grid-cols-3 gap-3 text-xs font-mono text-center">
              {[5, 14, 30].map((yrOffset) => {
                const pt = projection30Y[yrOffset]
                if (!pt) return null
                return (
                  <div
                    key={yrOffset}
                    className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800"
                  >
                    <div className="text-[11px] text-slate-400 font-sans">
                      {pt.year}년 (만 {pt.age}세) · 주식 {pt.targetEquityPct}%
                    </div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                      기본 {(pt.baseNetKrw / 100_000_000).toFixed(1)}억 원
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {(pt.pessimisticNetKrw / 100_000_000).toFixed(1)}억 ~{' '}
                      {(pt.optimisticNetKrw / 100_000_000).toFixed(1)}억
                    </div>
                  </div>
                )
              })}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 3. ALM 마스터 설정 편집기 (alm_config CRUD) */}
      <Card className="border-sky-500/20">
        <CardHeader
          title={
            <span className="flex items-center gap-2 text-sky-300">
              <Landmark className="w-4 h-4" />
              0층 가계 ALM 마스터 설정 (부채 · 생애주기 · 글라이드패스 · 세무 오프셋)
            </span>
          }
          subtitle="인터뷰 기준 초기값을 언제든 실제 조건에 맞게 수정하고 DB에 저장할 수 있습니다"
          action={
            <div className="flex items-center gap-2">
              {configDraft && (
                <button
                  onClick={() => setConfigDraft(null)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 되돌리기
                </button>
              )}
              <button
                onClick={() => saveConfigMutation.mutate()}
                disabled={saveConfigMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" /> ALM 설정 DB 저장
              </button>
            </div>
          }
        />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">출생연도</label>
              <input
                type="number"
                value={activeConfig.birth_year}
                onChange={(e) => updateConfigField('birth_year', parseInt(e.target.value, 10) || 1984)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">근로축적 종료(세)</label>
              <input
                type="number"
                value={activeConfig.accumulation_end_age}
                onChange={(e) =>
                  updateConfigField('accumulation_end_age', parseInt(e.target.value, 10) || 60)
                }
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">연금개시(세)</label>
              <input
                type="number"
                value={activeConfig.pension_start_age}
                onChange={(e) =>
                  updateConfigField('pension_start_age', parseInt(e.target.value, 10) || 67)
                }
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">최대 감내 MDD(%)</label>
              <input
                type="number"
                step={1}
                value={activeConfig.max_tolerable_mdd_pct}
                onChange={(e) =>
                  updateConfigField('max_tolerable_mdd_pct', parseFloat(e.target.value) || -28)
                }
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-rose-300"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">배우자 외부연금(원/년)</label>
              <input
                type="number"
                step={100_000}
                value={activeConfig.tax_offsets?.spouse_external_pension_insurance_krw ?? 3_600_000}
                onChange={(e) =>
                  updateConfigField('tax_offsets', {
                    ...activeConfig.tax_offsets,
                    spouse_external_pension_insurance_krw: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">연간 배당·이자 추정(ICR용)</label>
              <input
                type="number"
                step={100_000}
                value={annualDividendEstimate}
                onChange={(e) => setAnnualDividendEstimate(parseInt(e.target.value, 10) || 0)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg font-mono text-emerald-300"
              />
            </div>
          </div>

          {/* 차입 부채 목록 편집 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                가계 차입 부채 내역 (liabilities)
              </span>
              <button
                onClick={() =>
                  updateConfigField('liabilities', [
                    ...activeConfig.liabilities,
                    {
                      id: `debt_${Date.now()}`,
                      title: '신규 차입금',
                      principal_krw: 0,
                      annual_rate_pct: 3.0,
                      rate_type: 'fixed',
                      start_date: '2026-12-01',
                      maturity_date: null,
                      repay_at_maturity: false,
                      non_pension_only: false,
                    },
                  ])
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-semibold"
              >
                + 부채 추가
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                    <th className="py-2 px-2">부채명</th>
                    <th className="py-2 px-2 text-right">원금(원)</th>
                    <th className="py-2 px-2 text-right">연이율(%)</th>
                    <th className="py-2 px-2">만기일</th>
                    <th className="py-2 px-2 text-center">만기상환</th>
                    <th className="py-2 px-2 text-center">비연금하한</th>
                    <th className="py-2 px-2 text-center">삭제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {activeConfig.liabilities.map((l, idx) => (
                    <tr key={l.id}>
                      <td className="py-1.5 px-2">
                        <input
                          type="text"
                          value={l.title}
                          onChange={(e) => updateLiability(idx, { title: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-100"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          step={1_000_000}
                          value={l.principal_krw}
                          onChange={(e) =>
                            updateLiability(idx, { principal_krw: parseInt(e.target.value, 10) || 0 })
                          }
                          className="w-32 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right font-mono text-rose-300"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          step={0.05}
                          value={l.annual_rate_pct}
                          onChange={(e) =>
                            updateLiability(idx, {
                              annual_rate_pct: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-20 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-right font-mono text-slate-100"
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="date"
                          value={l.maturity_date || ''}
                          onChange={(e) =>
                            updateLiability(idx, { maturity_date: e.target.value || null })
                          }
                          className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 [color-scheme:dark]"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={l.repay_at_maturity}
                          onChange={(e) =>
                            updateLiability(idx, { repay_at_maturity: e.target.checked })
                          }
                          className="accent-emerald-500"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={l.non_pension_only}
                          onChange={(e) =>
                            updateLiability(idx, { non_pension_only: e.target.checked })
                          }
                          className="accent-emerald-500"
                        />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          onClick={() =>
                            updateConfigField(
                              'liabilities',
                              activeConfig.liabilities.filter((_, i) => i !== idx)
                            )
                          }
                          className="p-1 text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 4. 생애주기 현금흐름 스케줄 편집기 (alm_cashflow_schedules CRUD) */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2 text-emerald-300">
              <CalendarClock className="w-4 h-4" />
              생애주기 정기 현금흐름 스케줄러 (월급·연금·이자·상환·승계)
            </span>
          }
          subtitle="등록된 스케줄은 [배분전략] TAA 정기유입 및 30년 순자산 투사에 실시간 반영됩니다"
        />
        <CardBody className="space-y-4">
          {/* 입력/수정 폼 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">항목명</label>
              <input
                type="text"
                value={schedForm.title}
                onChange={(e) => setSchedForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="예: 한투 월급 순저축"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">계좌</label>
              <select
                value={schedForm.account}
                onChange={(e) => setSchedForm((p) => ({ ...p, account: e.target.value }))}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
              >
                {ALLOCATION_ACCOUNTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">유형</label>
              <select
                value={schedForm.flow_type}
                onChange={(e) =>
                  setSchedForm((p) => ({ ...p, flow_type: e.target.value as AlmFlowType }))
                }
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
              >
                {(Object.keys(FLOW_TYPE_LABELS) as AlmFlowType[]).map((ft) => (
                  <option key={ft} value={ft}>
                    {FLOW_TYPE_LABELS[ft]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">주기</label>
              <select
                value={schedForm.cadence}
                onChange={(e) =>
                  setSchedForm((p) => ({ ...p, cadence: e.target.value as AlmCadence }))
                }
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
              >
                {(Object.keys(CADENCE_LABELS) as AlmCadence[]).map((cd) => (
                  <option key={cd} value={cd}>
                    {CADENCE_LABELS[cd]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-slate-400 block mb-1">금액 (원 · 유출은 음수)</label>
              <input
                type="number"
                step={100_000}
                value={schedForm.amount_krw}
                onChange={(e) =>
                  setSchedForm((p) => ({ ...p, amount_krw: parseInt(e.target.value, 10) || 0 }))
                }
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg font-mono text-slate-100"
              />
            </div>

            <div>
              <label className="text-slate-400 block mb-1">연 증가율(%)</label>
              <input
                type="number"
                step={0.5}
                value={schedForm.growth_rate_pct}
                onChange={(e) =>
                  setSchedForm((p) => ({
                    ...p,
                    growth_rate_pct: parseFloat(e.target.value) || 0,
                  }))
                }
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg font-mono text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">시작일</label>
              <input
                type="date"
                value={schedForm.start_date}
                onChange={(e) => setSchedForm((p) => ({ ...p, start_date: e.target.value }))}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">종료일</label>
              <input
                type="date"
                value={schedForm.end_date}
                onChange={(e) => setSchedForm((p) => ({ ...p, end_date: e.target.value }))}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">비고</label>
              <input
                type="text"
                value={schedForm.note}
                onChange={(e) => setSchedForm((p) => ({ ...p, note: e.target.value }))}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={() => saveScheduleMutation.mutate()}
                disabled={saveScheduleMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 px-3 rounded-lg font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {schedForm.id !== null ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> 수정
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" /> 추가
                  </>
                )}
              </button>
              {schedForm.id !== null && (
                <button
                  onClick={() => setSchedForm(EMPTY_SCHEDULE_FORM)}
                  className="py-1.5 px-2.5 rounded-lg bg-slate-800 text-slate-300"
                >
                  취소
                </button>
              )}
            </div>
          </div>

          {/* 스케줄 테이블 */}
          <div className="overflow-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 whitespace-nowrap">
                  <th className="py-2.5 px-3 text-center">활성</th>
                  <th className="py-2.5 px-3">항목명</th>
                  <th className="py-2.5 px-3">계좌</th>
                  <th className="py-2.5 px-3">유형</th>
                  <th className="py-2.5 px-3">주기</th>
                  <th className="py-2.5 px-3 text-right">금액</th>
                  <th className="py-2.5 px-3 text-right">성장률</th>
                  <th className="py-2.5 px-3">기간</th>
                  <th className="py-2.5 px-3 text-center">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {schedules.map((s) => (
                  <tr
                    key={s.id}
                    className={`hover:bg-slate-800/40 transition ${
                      schedForm.id === s.id ? 'bg-emerald-950/30' : ''
                    }`}
                  >
                    <td className="py-2 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={s.is_active}
                        onChange={(e) =>
                          s.id && toggleScheduleMutation.mutate({ id: s.id, is_active: e.target.checked })
                        }
                        className="accent-emerald-500"
                      />
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-100">{s.title}</td>
                    <td className="py-2 px-3 text-slate-300">{s.account}</td>
                    <td className="py-2 px-3 text-slate-400">
                      {FLOW_TYPE_LABELS[s.flow_type] || s.flow_type}
                    </td>
                    <td className="py-2 px-3 text-slate-400">
                      {CADENCE_LABELS[s.cadence] || s.cadence}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono font-bold ${
                        s.amount_krw >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {s.amount_krw >= 0 ? '+' : ''}
                      {formatKRW(s.amount_krw)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-slate-400">
                      {Number(s.growth_rate_pct || 0).toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">
                      {s.start_date} ~ {s.end_date || '계속'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            setSchedForm({
                              id: s.id ?? null,
                              title: s.title,
                              account: s.account,
                              flow_type: s.flow_type,
                              cadence: s.cadence,
                              amount_krw: s.amount_krw,
                              growth_rate_pct: Number(s.growth_rate_pct) || 0,
                              start_date: s.start_date,
                              end_date: s.end_date || '',
                              is_active: s.is_active,
                              note: s.note || '',
                            })
                          }
                          className="p-1 rounded hover:bg-slate-700 text-sky-400"
                          title="편집"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (s.id && confirm(`'${s.title}' 스케줄을 삭제하시겠습니까?`)) {
                              deleteScheduleMutation.mutate(s.id)
                            }
                          }}
                          className="p-1 rounded hover:bg-slate-700 text-rose-400"
                          title="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
