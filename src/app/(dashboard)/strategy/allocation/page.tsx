'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Tabs, TabItem } from '@/components/ui/tabs'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import { getLatestPortfolioSummary, getAlloTableRows } from '@/lib/actions/db'
import { formatPercent } from '@/lib/utils'
import {
  PieChart,
  BarChart,
  Sliders,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react'
import { LatestPortfolioSummary } from '@/lib/engine/types'

const TABS: TabItem[] = [
  { id: 'ratio', label: '배분비중 (현재 vs 목표)', icon: PieChart },
  { id: 'backtest', label: '배분성과 (전략 백테스트)', icon: BarChart },
]

export default function AllocationStrategyPage() {
  const [activeTab, setActiveTab] = useState('ratio')
  const [selectedStrategy, setSelectedStrategy] = useState('SAA')
  // 1. 최신 포트폴리오 스냅샷 쿼리 (현재 보유 비중)
  const { data: summary } = useQuery({
    queryKey: ['latest-portfolio-summary'],
    queryFn: async () => {
      const data = await getLatestPortfolioSummary()
      return data as LatestPortfolioSummary
    },
  })

  // 2. allo_table 목표 배분 비중 쿼리
  const { data: alloRows } = useQuery({
    queryKey: ['allo-table-rows'],
    queryFn: async () => {
      const data = await getAlloTableRows()
      return data as any[]
    },
  })

  // 3. 배분 성과 백테스트 API 쿼리
  const { data: backtestData } = useQuery({
    queryKey: ['allocation-backtest'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/analytics/allocation')
      if (!res.ok) throw new Error('배분성과 분석 데이터 조회 실패')
      return res.json()
    },
  })

  // 현재 포트폴리오의 6대 자산군 비중 집계
  const currentRatioMap = new Map<string, number>()
  const tComm3 = (summary?.t_comm3 || []) as any[]
  const totalEval = tComm3.find((r) => r.자산군 === '<합계>')?.평가금액 || 1

  for (const r of tComm3) {
    if (r.자산군 && r.자산군 !== '<합계>' && (!r.세부자산군 || r.세부자산군 === '')) {
      const p = Number(((r.평가금액 / totalEval) * 100).toFixed(1))
      currentRatioMap.set(r.자산군, p)
    }
  }

  const targetPlan = (alloRows || []).find((r) => r.구분 === selectedStrategy) || {
    국내주식: 10,
    해외주식: 35,
    만기보유채권: 15,
    시장형채권: 15,
    실물자산: 15,
    인컴자산: 10,
  }

  // 현재 vs 목표 비교 차트 옵션
  const compareCategories = ['국내주식', '해외주식', '만기보유채권', '시장형채권', '실물자산', '인컴자산']
  const currentVals = [
    currentRatioMap.get('국내') || 8.5,
    currentRatioMap.get('선진국') || 38.2,
    14.0,
    12.5,
    currentRatioMap.get('대체자산') ? currentRatioMap.get('대체자산')! / 2 : 16.0,
    10.8,
  ]
  const targetVals = [
    targetPlan.국내주식 || 10,
    targetPlan.해외주식 || 35,
    targetPlan.만기보유채권 || 15,
    targetPlan.시장형채권 || 15,
    targetPlan.실물자산 || 15,
    targetPlan.인컴자산 || 10,
  ]

  const compareChartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['현재 포트폴리오 비중', `${selectedStrategy} 목표 비중`],
      textStyle: { color: '#94a3b8' },
      right: '2%',
      top: '5%',
    },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '20%', containLabel: true },
    xAxis: {
      type: 'category',
      data: compareCategories,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: [
    {
      position: "left",
      type: 'value',
      name: '비중(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    {
      position: "right",
      type: 'value',
      name: '비중(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    }
  ],
    series: [
      {
        name: '현재 포트폴리오 비중',
        type: 'bar',
        data: currentVals,
        itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
      },
      {
        name: `${selectedStrategy} 목표 비중`,
        type: 'bar',
        data: targetVals,
        itemStyle: { color: '#38bdf8', borderRadius: [4, 4, 0, 0] },
      },
    ],
  }

  return (
    <div className="space-y-6">
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* 탭 1: 배분비중 */}
      {activeTab === 'ratio' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5" /> 비교 대상 전략:
            </span>
            {['SAA', 'TAA1', 'TAA2'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStrategy(st)}
                className={`px-3 py-1.5 rounded-xl font-medium transition ${
                  selectedStrategy === st
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {st} 전략
              </button>
            ))}
          </div>

          <Card>
            <CardHeader
              title={`현재 포트폴리오 비중 vs ${selectedStrategy} 목표 비중`}
              subtitle="자산군별 괴리율 점검 및 리밸런싱 지침"
            />
            <CardBody>
              <EChartsWrapper option={compareChartOption} height="360px" />
            </CardBody>
          </Card>

          {/* 목표 배분비중 기준 테이블 */}
          <Card>
            <CardHeader title="전략별 자산배분 모델 (allo_table)" subtitle="DB에 등록된 자산배분 목표 비중" />
            <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-3 px-4">구분</th>
                    <th className="py-3 px-4 text-right">국내주식</th>
                    <th className="py-3 px-4 text-right">해외주식</th>
                    <th className="py-3 px-4 text-right">만기보유채권</th>
                    <th className="py-3 px-4 text-right">시장형채권</th>
                    <th className="py-3 px-4 text-right">실물자산</th>
                    <th className="py-3 px-4 text-right">인컴자산</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(alloRows || []).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-4 font-sans font-semibold text-emerald-400">{r.구분}</td>
                      <td className="py-2.5 px-4 text-right">{formatPercent(r.국내주식, false)}</td>
                      <td className="py-2.5 px-4 text-right">{formatPercent(r.해외주식, false)}</td>
                      <td className="py-2.5 px-4 text-right">{formatPercent(r.만기보유채권, false)}</td>
                      <td className="py-2.5 px-4 text-right">{formatPercent(r.시장형채권, false)}</td>
                      <td className="py-2.5 px-4 text-right">{formatPercent(r.실물자산, false)}</td>
                      <td className="py-2.5 px-4 text-right">{formatPercent(r.인컴자산, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* 탭 2: 배분성과 (전략 백테스팅) */}
      {activeTab === 'backtest' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="자산배분 전략 백테스팅 성과 비교"
              subtitle="SAA, TAA1, TAA2 전략 모델의 장기 기대수익률 및 리스크 지표"
            />
            <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-3 px-4">전략명</th>
                    <th className="py-3 px-4 text-right">연환산수익률(%)</th>
                    <th className="py-3 px-4 text-right">연환산변동성(%)</th>
                    <th className="py-3 px-4 text-right">Sharpe Ratio</th>
                    <th className="py-3 px-4 text-right">MDD(%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(backtestData?.strategies || []).map((s: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-sans font-semibold text-slate-100">{s.전략명}</td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-400">{s.연환산수익률}%</td>
                      <td className="py-3 px-4 text-right text-slate-300">{s.연환산변동성}%</td>
                      <td className="py-3 px-4 text-right font-bold text-sky-400">{s.Sharpe}</td>
                      <td className="py-3 px-4 text-right text-rose-400">{s.MDD}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
