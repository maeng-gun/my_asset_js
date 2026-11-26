'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import { format, subMonths, subYears } from 'date-fns'
import { FiveStageBreakdown, FiveStageSeriesPoint } from '@/lib/engine/attribution-engine'
import { Calendar, GitBranch, Layers } from 'lucide-react'

interface AttributionApiResponse {
  success: boolean
  startDate: string
  endDate: string
  tradingDays: number
  breakdown: FiveStageBreakdown
  series: FiveStageSeriesPoint[]
}

interface BacktestStrategyRow {
  전략명: string
  연환산수익률: number
  연환산변동성: number
  Sharpe: number
  MDD: number
}

interface AllocationBacktestResponse {
  success: boolean
  strategies: BacktestStrategyRow[]
}

export function FiveStageAttributionTab() {
  const [startDate, setStartDate] = useState(
    format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd')
  )
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const setQuickRange = (key: string) => {
    const end = new Date()
    setEndDate(format(end, 'yyyy-MM-dd'))
    if (key === 'YTD') setStartDate(format(new Date(end.getFullYear(), 0, 1), 'yyyy-MM-dd'))
    else if (key === '1m') setStartDate(format(subMonths(end, 1), 'yyyy-MM-dd'))
    else if (key === '3m') setStartDate(format(subMonths(end, 3), 'yyyy-MM-dd'))
    else if (key === '6m') setStartDate(format(subMonths(end, 6), 'yyyy-MM-dd'))
    else if (key === '1Y') setStartDate(format(subYears(end, 1), 'yyyy-MM-dd'))
    else if (key === '전체') setStartDate('2024-01-01')
  }

  const { data: attrData, isLoading: isAttrLoading } = useQuery({
    queryKey: ['investment-attribution', startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/portfolio/analytics/attribution?startDate=${startDate}&endDate=${endDate}`
      )
      if (!res.ok) throw new Error('5단 성과귀인 데이터 로드 실패')
      return (await res.json()) as AttributionApiResponse
    },
  })

  const { data: backtestData } = useQuery({
    queryKey: ['allocation-backtest-9'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/analytics/allocation')
      if (!res.ok) throw new Error('백테스트 로드 실패')
      return (await res.json()) as AllocationBacktestResponse
    },
  })

  const bd = attrData?.breakdown

  const waterfallOption = useMemo(() => {
    if (!bd) return {}
    const steps = [
      { name: '1층 Ref (75:25)', val: bd.refReturnPct, isTotal: true },
      { name: 'SAA 배분효과', val: bd.saaEffectPct, isTotal: false },
      { name: 'TAA 틸트효과', val: bd.taaEffectPct, isTotal: false },
      { name: '비중 드리프트', val: bd.driftEffectPct, isTotal: false },
      { name: '종목·실행 알파', val: bd.selectionExecutionEffectPct, isTotal: false },
      { name: '실제 MyPF', val: bd.myPfReturnPct, isTotal: true },
    ]

    const baseData: number[] = []
    const posData: Array<number | string> = []
    const negData: Array<number | string> = []
    const totalData: Array<number | string> = []

    let running = 0
    for (const st of steps) {
      if (st.isTotal) {
        baseData.push(0)
        posData.push('-')
        negData.push('-')
        totalData.push(Number(st.val.toFixed(2)))
        running = st.val
      } else {
        const nextRunning = Number((running + st.val).toFixed(2))
        if (st.val >= 0) {
          baseData.push(Number(running.toFixed(2)))
          posData.push(Number(st.val.toFixed(2)))
          negData.push('-')
        } else {
          baseData.push(nextRunning)
          posData.push('-')
          negData.push(Number(Math.abs(st.val).toFixed(2)))
        }
        totalData.push('-')
        running = nextRunning
      }
    }

    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: {
        data: ['누적 기준선', '플러스 기여(+)', '마이너스 기여(-)'],
        textStyle: { color: '#94a3b8' },
        top: '2%',
        right: '2%',
      },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        data: steps.map((s) => s.name),
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', fontSize: 11, interval: 0 },
      },
      yAxis: {
        type: 'value',
        name: '수익률 기여(%p)',
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
      },
      series: [
        {
          name: 'Helper',
          type: 'bar',
          stack: 'total',
          itemStyle: { borderColor: 'transparent', color: 'transparent' },
          emphasis: { itemStyle: { borderColor: 'transparent', color: 'transparent' } },
          data: baseData,
        },
        {
          name: '누적 기준선',
          type: 'bar',
          stack: 'total',
          data: totalData,
          itemStyle: { color: '#38bdf8', borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', color: '#e2e8f0', formatter: '{c}%' },
        },
        {
          name: '플러스 기여(+)',
          type: 'bar',
          stack: 'total',
          data: posData,
          itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', color: '#34d399', formatter: '+{c}%p' },
        },
        {
          name: '마이너스 기여(-)',
          type: 'bar',
          stack: 'total',
          data: negData,
          itemStyle: { color: '#f43f5e', borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'bottom', color: '#fb7185', formatter: '-{c}%p' },
        },
      ],
    }
  }, [bd])

  const lineOption = useMemo(() => {
    const s = attrData?.series || []
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['1층 Ref(75:25)', '2층-A SAA', '2층-B TAA', '실제비중×BM', '실제 MyPF'],
        textStyle: { color: '#94a3b8' },
        top: '2%',
        right: '2%',
      },
      grid: { left: '3%', right: '4%', bottom: '12%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        data: s.map((p) => p.date),
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: '누적 수익률(%)',
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
      },
      series: [
        {
          name: '1층 Ref(75:25)',
          type: 'line',
          symbol: 'none',
          smooth: true,
          data: s.map((p) => p.refCumPct),
          lineStyle: { color: '#64748b', width: 2, type: 'dashed' },
          itemStyle: { color: '#64748b' },
        },
        {
          name: '2층-A SAA',
          type: 'line',
          symbol: 'none',
          smooth: true,
          data: s.map((p) => p.saaCumPct),
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
        },
        {
          name: '2층-B TAA',
          type: 'line',
          symbol: 'none',
          smooth: true,
          data: s.map((p) => p.taaCumPct),
          lineStyle: { color: '#38bdf8', width: 2 },
          itemStyle: { color: '#38bdf8' },
        },
        {
          name: '실제비중×BM',
          type: 'line',
          symbol: 'none',
          smooth: true,
          data: s.map((p) => p.actWbmCumPct),
          lineStyle: { color: '#f59e0b', width: 2, type: 'dotted' },
          itemStyle: { color: '#f59e0b' },
        },
        {
          name: '실제 MyPF',
          type: 'line',
          symbol: 'none',
          smooth: true,
          data: s.map((p) => p.myPfCumPct),
          lineStyle: { color: '#10b981', width: 3 },
          itemStyle: { color: '#10b981' },
        },
      ],
    }
  }, [attrData])

  const fmtPct = (v: number | undefined, isDiff = false) => {
    if (v === undefined || isNaN(v)) return '-'
    const sign = v > 0 ? '+' : ''
    return `${sign}${v.toFixed(2)}${isDiff ? '%p' : '%'}`
  }

  return (
    <div className="space-y-6">
      {/* 기간 선택 바 */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-300 font-semibold">
          <GitBranch className="w-4 h-4 text-sky-400" />
          <span>5단 성과귀인 (Ref → SAA → TAA → 실제비중×BM → MyPF)</span>
          {attrData?.tradingDays ? (
            <span className="font-mono text-[11px] text-slate-400">
              ({attrData.startDate} ~ {attrData.endDate} · {attrData.tradingDays}영업일)
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5 mr-2">
            {['1m', '3m', '6m', 'YTD', '1Y', '전체'].map((k) => (
              <button
                key={k}
                onClick={() => setQuickRange(k)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
              >
                {k}
              </button>
            ))}
          </div>
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 [color-scheme:dark]"
          />
          <span className="text-slate-500">~</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 [color-scheme:dark]"
          />
        </div>
      </div>

      {/* 6개 성과귀인 KPI 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {[
          { label: '1층 Ref (75:25)', val: fmtPct(bd?.refReturnPct), color: 'text-slate-200' },
          {
            label: 'SAA 배분효과',
            val: fmtPct(bd?.saaEffectPct, true),
            color: (bd?.saaEffectPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400',
          },
          {
            label: 'TAA 틸트효과',
            val: fmtPct(bd?.taaEffectPct, true),
            color: (bd?.taaEffectPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400',
          },
          {
            label: '비중 드리프트',
            val: fmtPct(bd?.driftEffectPct, true),
            color: (bd?.driftEffectPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400',
          },
          {
            label: '종목·실행 알파',
            val: fmtPct(bd?.selectionExecutionEffectPct, true),
            color:
              (bd?.selectionExecutionEffectPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400',
          },
          {
            label: '실제 MyPF 누적',
            val: fmtPct(bd?.myPfReturnPct),
            color: (bd?.myPfReturnPct ?? 0) >= 0 ? 'text-sky-400' : 'text-rose-400',
          },
        ].map((item) => (
          <Card key={item.label}>
            <CardBody className="p-4">
              <div className="text-[11px] text-slate-400 mb-1">{item.label}</div>
              <div className={`text-lg font-bold font-mono ${item.color}`}>
                {isAttrLoading ? '...' : item.val}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* 워터폴 + 5곡선 비교 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="5단 성과귀인 워터폴 (Brinson-TPA Decomposition)"
            subtitle="레퍼런스(75:25) 대비 각 의사결정 계층의 초과수익 기여도"
          />
          <CardBody>
            <EChartsWrapper option={waterfallOption} height="340px" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="5단계 누적 수익률 궤적 비교"
            subtitle="Ref(75:25) · SAA · TAA · 실제비중×BM · 실제 MyPF 일별 기하 누적추이"
          />
          <CardBody>
            <EChartsWrapper option={lineOption} height="340px" />
          </CardBody>
        </Card>
      </div>

      {/* 5년 전략 백테스트 비교 테이블 (9대 자산군 기반) */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              9대 자산군 5년 전략 백테스트 비교 (1층 Ref vs 2층-A SAA vs 2층-B TAA)
            </span>
          }
          subtitle="Supabase allocation_policies 현행 정책(또는 최신 allo_table) 기준 최근 5년 과거 성과 시뮬레이션"
        />
        <CardBody className="p-0 overflow-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                <th className="py-3 px-4">전략 모델</th>
                <th className="py-3 px-4 text-right">연환산 수익률 (CAGR)</th>
                <th className="py-3 px-4 text-right">연환산 변동성</th>
                <th className="py-3 px-4 text-right">Sharpe Ratio</th>
                <th className="py-3 px-4 text-right">최대 낙폭 (MDD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {(backtestData?.strategies || []).map((st, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-sans font-semibold text-slate-100">{st.전략명}</td>
                  <td className="py-3 px-4 text-right text-emerald-400 font-bold">
                    {st.연환산수익률.toFixed(2)}%
                  </td>
                  <td className="py-3 px-4 text-right text-slate-300">{st.연환산변동성.toFixed(2)}%</td>
                  <td className="py-3 px-4 text-right text-sky-400 font-bold">{st.Sharpe.toFixed(2)}</td>
                  <td className="py-3 px-4 text-right text-rose-400">{st.MDD.toFixed(2)}%</td>
                </tr>
              ))}
              {(!backtestData || backtestData.strategies.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-500 font-sans">
                    백테스트 데이터를 불러오는 중입니다...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  )
}
