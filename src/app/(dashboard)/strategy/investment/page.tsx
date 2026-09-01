'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Tabs, TabItem } from '@/components/ui/tabs'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import { formatPercent } from '@/lib/utils'
import { subMonths, format } from 'date-fns'
import {
  TrendingUp,
  Search,
  Calendar,
  Layers,
  ArrowUpRight,
  Shield,
  Zap,
} from 'lucide-react'

const TABS: TabItem[] = [
  { id: 'performance', label: '투자성과 (자산군별 BM 대비)', icon: TrendingUp },
  { id: 'search', label: '종목탐색 (10년 정밀분석)', icon: Search },
]

const ASSET_CLASSES = ['선진국', '국내', '실물자산', '인컴자산', '채권'] as const
type AssetClassType = (typeof ASSET_CLASSES)[number]

export default function InvestmentStrategyPage() {
  const [activeTab, setActiveTab] = useState('performance')
  const [selectedAsset, setSelectedAsset] = useState<AssetClassType>('선진국')
  const [startDate, setStartDate] = useState(`${new Date().getFullYear() - 2}-12-31`)
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const setQuickDate = (type: string) => {
    const end = new Date()
    setEndDate(format(end, 'yyyy-MM-dd'))
    if (type === 'YTD') {
      setStartDate(format(new Date(end.getFullYear(), 0, 1), 'yyyy-MM-dd'))
    } else if (type === '1m') {
      setStartDate(format(subMonths(end, 1), 'yyyy-MM-dd'))
    } else if (type === '3m') {
      setStartDate(format(subMonths(end, 3), 'yyyy-MM-dd'))
    } else if (type === '6m') {
      setStartDate(format(subMonths(end, 6), 'yyyy-MM-dd'))
    } else if (type === '1Y') {
      setStartDate(format(subMonths(end, 12), 'yyyy-MM-dd'))
    }
  }

  // 종목 탐색 상태
  const [searchTicker, setSearchTicker] = useState('360200.KS')
  const [searchBm, setSearchBm] = useState('226490.KS')
  const [activeSearchTicker, setActiveSearchTicker] = useState('360200.KS')

  // 1. 5대 자산군 투자성과 API 쿼리
  const { data: perfData, isLoading: isPerfLoading } = useQuery({
    queryKey: ['investment-analytics', startDate, endDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/portfolio/analytics/investment?startDate=${startDate}&endDate=${endDate}`
      )
      if (!res.ok) throw new Error('투자성과 분석 데이터 로드 실패')
      const json = await res.json()
      return json
    },
  })

  // 2. 종목 탐색 정밀 분석 API 쿼리 (외부 API 연동)
  const { data: tickerData, isLoading: isTickerLoading, refetch: refetchTicker } = useQuery({
    queryKey: ['ticker-analysis', activeSearchTicker, searchBm],
    queryFn: async () => {
      const res = await fetch(
        `/api/ticker?ticker=${activeSearchTicker}&benchmark=${searchBm}`
      )
      if (!res.ok) throw new Error('종목 분석 데이터 로드 실패')
      const json = await res.json()
      return json?.data
    },
    enabled: !!activeSearchTicker,
  })

  const currentSeries = (perfData?.performance?.[selectedAsset] || []) as Array<{
    기준일: string
    MyPF: number
    BM: number
    DD: number
  }>

  // 1. 자산군 누적수익률 ECharts 옵션
  const perfChartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['MyPF 누적수익률', 'BM 누적수익률'],
      textStyle: { color: '#94a3b8' },
      right: '2%',
      top: '5%',
    },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: currentSeries.map((d) => d.기준일),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: [
    {
      position: "left",
      type: 'value',
      name: '수익률(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    {
      position: "right",
      type: 'value',
      name: '수익률(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    }
  ],
    series: [
      {
        name: 'MyPF 누적수익률',
        type: 'line',
        data: currentSeries.map((d) => d.MyPF),
        smooth: true,
        symbol: 'none',
        color: '#10b981',
        lineStyle: { width: 2.5 },
      },
      {
        name: 'BM 누적수익률',
        type: 'line',
        data: currentSeries.map((d) => d.BM),
        smooth: true,
        symbol: 'none',
        color: '#94a3b8',
        lineStyle: { width: 2, type: 'dashed' },
      },
    ],
  }

  // 2. Drawdown (낙폭) ECharts 옵션
  const ddChartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['Drawdown (DD)'],
      textStyle: { color: '#94a3b8' },
      right: '2%',
      top: '5%',
    },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '20%', containLabel: true },
    xAxis: {
      type: 'category',
      data: currentSeries.map((d) => d.기준일),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: [
    {
      position: "left",
      type: 'value',
      name: '낙폭(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    {
      position: "right",
      type: 'value',
      name: '낙폭(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    }
  ],
    series: [
      {
        name: 'Drawdown (DD)',
        type: 'line',
        data: currentSeries.map((d) => d.DD),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#f43f5e', width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(244, 63, 94, 0.4)' },
              { offset: 1, color: 'rgba(244, 63, 94, 0.05)' },
            ],
          },
        },
      },
    ],
  }

  // 3. 종목 탐색 누적수익률 ECharts 옵션
  const tickerDates = tickerData?.dates || []
  const tickerCumList = tickerData?.tickerCumReturns || []
  const bmCumList = tickerData?.benchmarkCumReturns || []

  const tickerCumChartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: [`${activeSearchTicker} 누적수익률`, `${searchBm} 벤치마크`],
      textStyle: { color: '#94a3b8' },
      right: '2%',
      top: '5%',
    },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: tickerDates,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: [
    {
      position: "left",
      type: 'value',
      name: '수익률(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    {
      position: "right",
      type: 'value',
      name: '수익률(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    }
  ],
    series: [
      {
        name: `${activeSearchTicker} 누적수익률`,
        type: 'line',
        data: tickerCumList.map((val: number) => Number((val * 100).toFixed(2))),
        smooth: true,
        symbol: 'none',
        color: '#38bdf8',
        lineStyle: { width: 2.5 },
      },
      {
        name: `${searchBm} 벤치마크`,
        type: 'line',
        data: bmCumList.map((val: number) => Number((val * 100).toFixed(2))),
        smooth: true,
        symbol: 'none',
        color: '#94a3b8',
        lineStyle: { width: 2, type: 'dashed' },
      },
    ],
  }

  const tickerDDChartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['Drawdown (DD)'],
      textStyle: { color: '#94a3b8' },
      right: '2%',
      top: '5%',
    },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '20%', containLabel: true },
    xAxis: {
      type: 'category',
      data: tickerDates,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: [
    {
      position: "left",
      type: 'value',
      name: '낙폭(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    {
      position: "right",
      type: 'value',
      name: '낙폭(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    }
  ],
    series: [
      {
        name: 'Drawdown (DD)',
        type: 'line',
        // calculate MDD array inline for chart
        data: (() => {
          let peak = 1
          return tickerCumList.map((cumRet: number) => {
            const wealth = 1 + cumRet
            if (wealth > peak) peak = wealth
            return peak > 1 ? Number((((wealth - peak) / peak) * 100).toFixed(2)) : (cumRet < 0 ? Number((cumRet * 100).toFixed(2)) : 0)
          })
        })(),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#f43f5e', width: 1.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(244, 63, 94, 0.4)' },
              { offset: 1, color: 'rgba(244, 63, 94, 0.05)' },
            ],
          },
        },
      },
    ],
  }

  return (
    <div className="space-y-6">
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* 탭 1: 투자성과 */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          {/* 기간 필터 및 자산군 선택 버튼 */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5" /> 자산군:
              </span>
              {ASSET_CLASSES.map((ac) => (
                <button
                  key={ac}
                  onClick={() => setSelectedAsset(ac)}
                  className={`px-3 py-1.5 rounded-xl font-medium transition ${
                    selectedAsset === ac
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {ac}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 mr-2">
                {['YTD', '1m', '3m', '6m', '1Y'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setQuickDate(t)}
                    className="px-2 py-1 text-xs font-medium rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition"
                  >
                    {t}
                  </button>
                ))}
              </div>
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                onClick={(e) => 'showPicker' in HTMLInputElement.prototype && (e.target as HTMLInputElement).showPicker()}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-slate-500">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                onClick={(e) => 'showPicker' in HTMLInputElement.prototype && (e.target as HTMLInputElement).showPicker()}
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* 누적 수익률 차트 */}
          <Card>
            <CardHeader
              title={(() => {
                if (selectedAsset === '선진국') return '선진국 주식 (BM: ACE 미국S&P500, 360200)'
                if (selectedAsset === '국내') return '국내 주식 (BM: ACE 코스피, 305050)'
                if (selectedAsset === '실물자산') return '실물자산 (BM: ACE KRX금현물, 411060)'
                if (selectedAsset === '인컴자산') return '인컴자산 (BM: TIGER 리츠부동산인프라, 329200)'
                if (selectedAsset === '채권') return '채권 (BM: KODEX 국고채3년, 114460)'
                return `${selectedAsset} (BM 대비 누적수익률)`
              })()}
              subtitle="내 포트폴리오의 해당 자산군 수익률과 대표 벤치마크 지수의 누적 성과 비교"
            />
            <CardBody>
              <EChartsWrapper option={perfChartOption} height="360px" />
            </CardBody>
          </Card>

          {/* Drawdown (낙폭) 차트 */}
          <Card>
            <CardHeader
              title={`${selectedAsset} 자산군 고점 대비 낙폭 (Drawdown)`}
              subtitle="과거 최고점 대비 최대 하락폭 및 변동성 리스크 추이"
            />
            <CardBody>
              <EChartsWrapper option={ddChartOption} height="260px" />
            </CardBody>
          </Card>
        </div>
      )}

      {/* 탭 2: 종목탐색 */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* 종목 및 BM 검색 바 */}
          <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300 font-medium">분석 종목코드:</span>
              <input
                type="text"
                value={searchTicker}
                onChange={(e) => setSearchTicker(e.target.value)}
                placeholder="예: 360200.KS, SPY"
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-emerald-500 uppercase"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">비교 벤치마크:</span>
              <input
                type="text"
                value={searchBm}
                onChange={(e) => setSearchBm(e.target.value)}
                placeholder="예: 226490.KS, SPY"
                className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-emerald-500 uppercase"
              />
            </div>

            <button
              onClick={() => setActiveSearchTicker(searchTicker.trim())}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-semibold shadow-lg shadow-emerald-950/40 transition active:scale-95 ml-auto"
            >
              정밀 분석 실행
            </button>
          </div>

          {/* 11개 핵심 금융 통계 지표 카드 & 테이블 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <Card className="md:col-span-4">
              <CardHeader title="핵심 성과 요약" subtitle="최근 5~10년 시뮬레이션 지표" />
              <CardBody className="p-0 overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                      <th className="py-2.5 px-3">지표</th>
                      <th className="py-2.5 px-3 text-right text-emerald-400">{activeSearchTicker}</th>
                      <th className="py-2.5 px-3 text-right text-slate-400">{searchBm}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {[
                      { label: '연환산수익률 (CAGR)', key: 'cagr', format: true },
                      { label: '연환산변동성', key: 'volatility', format: true },
                      { label: 'Sharpe Ratio', key: 'sharpe', format: false },
                      { label: 'Max Drawdown (MDD)', key: 'mdd', format: true },
                      { label: 'Beta (시장민감도)', key: 'beta', format: false },
                      { label: 'Alpha (초과수익)', key: 'alpha', format: true },
                      { label: 'Correlation (상관성)', key: 'correlation', format: false },
                    ].map((s, i) => (
                      <tr key={i} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-3 font-sans text-slate-300 font-medium">{s.label}</td>
                        <td className="py-2 px-3 text-right font-bold text-slate-100">
                          {tickerData?.stats?.target
                            ? (s.format ? formatPercent(tickerData.stats.target[s.key as keyof typeof tickerData.stats.target]) : (tickerData.stats.target[s.key as keyof typeof tickerData.stats.target] as number)?.toFixed(2))
                            : '-'}
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400">
                          {tickerData?.stats?.benchmark
                            ? (s.format ? formatPercent(tickerData.stats.benchmark[s.key as keyof typeof tickerData.stats.benchmark]) : (tickerData.stats.benchmark[s.key as keyof typeof tickerData.stats.benchmark] as number)?.toFixed(2))
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>

            <div className="md:col-span-8 space-y-6">
              <Card>
                <CardHeader
                  title={`${activeSearchTicker} vs ${searchBm} 누적수익률 비교`}
                  subtitle="장기 시계열 성과 추세 비교"
                />
                <CardBody>
                  <EChartsWrapper option={tickerCumChartOption} height="300px" />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title={`${activeSearchTicker} 고점 대비 낙폭 (Drawdown)`}
                  subtitle="MDD 및 리스크 관리 분석"
                />
                <CardBody>
                  <EChartsWrapper option={tickerDDChartOption} height="220px" />
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
