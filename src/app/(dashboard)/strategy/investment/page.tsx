'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Tabs, TabItem } from '@/components/ui/tabs'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import { formatPercent } from '@/lib/utils'
import { subMonths, subYears, format } from 'date-fns'
import { getAllTickers } from '@/lib/actions/db'
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
  { id: 'search', label: '종목탐색 (장기 정밀분석)', icon: Search },
]

const ASSET_CLASSES = ['선진국', '국내', '실물자산', '인컴자산', '채권'] as const
type AssetClassType = (typeof ASSET_CLASSES)[number]

export default function InvestmentStrategyPage() {
  const [activeTab, setActiveTab] = useState('performance')
  const [selectedAsset, setSelectedAsset] = useState<AssetClassType>('선진국')
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'))
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
      setStartDate(format(subYears(end, 1), 'yyyy-MM-dd'))
    } else if (type === '2Y') {
      setStartDate(format(subYears(end, 2), 'yyyy-MM-dd'))
    } else if (type === '3Y') {
      setStartDate(format(subYears(end, 3), 'yyyy-MM-dd'))
    } else if (type === '5Y') {
      setStartDate(format(subYears(end, 5), 'yyyy-MM-dd'))
    } else if (type === '10Y') {
      setStartDate(format(subYears(end, 10), 'yyyy-MM-dd'))
    }
  }

  // 종목 탐색 상태
  const [searchTicker, setSearchTicker] = useState('')
  const [searchBm, setSearchBm] = useState('226490.KS')
  const [activeSearchTicker, setActiveSearchTicker] = useState('')
  const [searchStartDate, setSearchStartDate] = useState(format(new Date(new Date().getFullYear() - 5, 0, 1), 'yyyy-MM-dd'))
  const [searchEndDate, setSearchEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [activeSearchStartDate, setActiveSearchStartDate] = useState(format(new Date(new Date().getFullYear() - 5, 0, 1), 'yyyy-MM-dd'))
  const [activeSearchEndDate, setActiveSearchEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // 전체 종목 목록 로드
  const { data: tickersData } = useQuery({
    queryKey: ['all-tickers'],
    queryFn: async () => {
      const data = await getAllTickers()
      return data as { 티커: string; 종목명: string }[]
    },
  })

  const getDisplayName = (ticker: string) => {
    if (!ticker) return '종목을 선택해주세요'
    const cleanTicker = ticker.replace(/\.KS$/, '')
    const found = tickersData?.find((t) => t.티커 === ticker)
    return found ? `${found.종목명}(${cleanTicker})` : cleanTicker
  }
  const activeTickerDisplay = getDisplayName(activeSearchTicker)
  const bmDisplay = searchBm === '226490.KS' ? 'KODEX 코스피(226490)' : searchBm === '360750.KS' ? 'TIGER 미국S&P500(360750)' : getDisplayName(searchBm)

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
    queryKey: ['ticker-analysis', activeSearchTicker, searchBm, activeSearchStartDate, activeSearchEndDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/ticker?ticker=${activeSearchTicker}&benchmark=${searchBm}&startDate=${activeSearchStartDate}&endDate=${activeSearchEndDate}`
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
      data: [`${activeTickerDisplay} 누적수익률`, `${bmDisplay} 벤치마크`],
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
        name: `${activeTickerDisplay} 누적수익률`,
        type: 'line',
        data: tickerCumList.map((val: number) => Number((val * 100).toFixed(2))),
        smooth: true,
        symbol: 'none',
        color: '#38bdf8',
        lineStyle: { width: 2.5 },
      },
      {
        name: `${bmDisplay} 벤치마크`,
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

  // 4. 연도별 수익률 막대 차트
  const yearlyRetList = tickerData?.yearlyRet || []
  const yearlyChartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: {
      data: [`${activeTickerDisplay}`, `${bmDisplay}`],
      textStyle: { color: '#94a3b8' },
      right: '2%',
      top: '5%',
    },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: yearlyRetList.map((d: any) => d.year),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8' },
    },
    yAxis: {
      type: 'value',
      name: '수익률(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    series: [
      {
        name: `${activeTickerDisplay}`,
        type: 'bar',
        data: yearlyRetList.map((d: any) => d.ticker),
        itemStyle: { color: '#38bdf8' },
      },
      {
        name: `${bmDisplay}`,
        type: 'bar',
        data: yearlyRetList.map((d: any) => d.bm),
        itemStyle: { color: '#94a3b8' },
      },
    ],
  }

  // 5. 월별 수익률 히트맵 차트
  const monthlyRetList = tickerData?.monthlyRet || []
  const years = Array.from(new Set(monthlyRetList.map((d: any) => d.year)))
  const months = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  
  const heatmapData = monthlyRetList.map((d: any) => [
    months.indexOf(`${d.month}월`),
    years.indexOf(d.year),
    d.ret
  ])

  const heatmapChartOption = {
    backgroundColor: 'transparent',
    tooltip: { position: 'top', formatter: (p: any) => `${years[p.data[1]]}년 ${months[p.data[0]]}: ${p.data[2].toFixed(2)}%` },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '5%', containLabel: true },
    xAxis: {
      type: 'category',
      data: months,
      splitArea: { show: true },
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8' },
    },
    yAxis: {
      type: 'category',
      data: years,
      splitArea: { show: true },
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8' },
    },
    visualMap: {
      min: -15,
      max: 15,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      inRange: { color: ['#f43f5e', '#1e293b', '#10b981'] },
      textStyle: { color: '#94a3b8' }
    },
    series: [{
      name: '월별 수익률',
      type: 'heatmap',
      data: heatmapData,
      label: { show: true, formatter: (p: any) => p.data[2].toFixed(1), color: '#ffffff', fontSize: 10 },
      itemStyle: { borderColor: '#0f172a', borderWidth: 2 }
    }]
  }

  // 6. 롤링 변동성
  const rollingVolList = tickerData?.rollingVol || []
  const rollingVolOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: rollingVolList.map((d: any) => d.date),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: '연환산 변동성(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    series: [{
      name: '롤링 변동성(3Y)',
      type: 'line',
      data: rollingVolList.map((d: any) => d.vol),
      smooth: true,
      symbol: 'none',
      color: '#f59e0b',
      lineStyle: { width: 1.5 }
    }]
  }

  // 7. 롤링 샤프지수
  const rollingSharpeList = tickerData?.rollingSharpe || []
  const rollingSharpeOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: rollingSharpeList.map((d: any) => d.date),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      name: '샤프지수',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    series: [{
      name: '롤링 샤프지수(3Y)',
      type: 'line',
      data: rollingSharpeList.map((d: any) => d.sharpe),
      smooth: true,
      symbol: 'none',
      color: '#8b5cf6',
      lineStyle: { width: 1.5 }
    }]
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
                {['YTD', '1m', '3m', '6m', '1Y', '2Y', '3Y', '5Y'].map((t) => (
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
          <div className="flex flex-col gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-300 font-medium">분석 종목:</span>
                <input
                  type="text"
                  list="tickers-list"
                  value={searchTicker}
                  onChange={(e) => setSearchTicker(e.target.value)}
                  placeholder="예: 360200.KS, 삼성전자"
                  className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 min-w-[200px]"
                />
                <datalist id="tickers-list">
                  {tickersData?.map((t) => (
                    <option key={t.티커} value={`${t.종목명} (${t.티커.replace(/\.KS$/, '')})`} />
                  ))}
                </datalist>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium">비교 벤치마크:</span>
                <div className="flex gap-3 items-center">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="searchBm"
                      value="226490.KS"
                      checked={searchBm === '226490.KS'}
                      onChange={(e) => setSearchBm(e.target.value)}
                      className="accent-emerald-500"
                    />
                    <span className="text-slate-300">코스피</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="searchBm"
                      value="360750.KS"
                      checked={searchBm === '360750.KS'}
                      onChange={(e) => setSearchBm(e.target.value)}
                      className="accent-emerald-500"
                    />
                    <span className="text-slate-300">S&P500</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 justify-between border-t border-slate-800/50 pt-4">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> 시뮬레이션 기간:
                </span>
                <div className="flex gap-1.5 mr-2">
                  {['YTD', '3Y', '5Y', '10Y'].map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        const end = new Date();
                        setSearchEndDate(format(end, 'yyyy-MM-dd'));
                        if (t === 'YTD') setSearchStartDate(format(new Date(end.getFullYear(), 0, 1), 'yyyy-MM-dd'));
                        else if (t === '3Y') setSearchStartDate(format(new Date(end.getFullYear() - 3, 0, 1), 'yyyy-MM-dd'));
                        else if (t === '5Y') setSearchStartDate(format(new Date(end.getFullYear() - 5, 0, 1), 'yyyy-MM-dd'));
                        else if (t === '10Y') setSearchStartDate(format(new Date(end.getFullYear() - 10, 0, 1), 'yyyy-MM-dd'));
                      }}
                      className="px-2 py-1 text-xs font-medium rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition"
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  value={searchStartDate}
                  onChange={(e) => setSearchStartDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-slate-500">~</span>
                <input
                  type="date"
                  value={searchEndDate}
                  onChange={(e) => setSearchEndDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={() => {
                  const match = searchTicker.match(/\(([^)]+)\)$/);
                  let parsedTicker = match ? match[1] : searchTicker.trim();
                  if (/^\d{6}$/.test(parsedTicker)) {
                    parsedTicker += '.KS';
                  }
                  setActiveSearchTicker(parsedTicker);
                  setActiveSearchStartDate(searchStartDate);
                  setActiveSearchEndDate(searchEndDate);
                }}
                className="px-6 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-semibold shadow-lg shadow-emerald-950/40 transition active:scale-95"
              >
                정밀 분석 실행
              </button>
            </div>
          </div>

          {/* 11개 핵심 금융 통계 지표 카드 & 테이블 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <Card className="md:col-span-4">
              <CardHeader title="핵심 성과 요약" subtitle="최근 5~10년 시뮬레이션 지표" />
              <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                      <th className="py-2.5 px-3">지표</th>
                      <th className="py-2.5 px-3 text-right text-emerald-400">{activeTickerDisplay}</th>
                      <th className="py-2.5 px-3 text-right text-slate-400">{bmDisplay}</th>
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
                  title={`${activeTickerDisplay} vs ${bmDisplay} 누적수익률 비교`}
                  subtitle="장기 시계열 성과 추세 비교"
                />
                <CardBody>
                  <EChartsWrapper option={tickerCumChartOption} height="300px" />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  title={`${activeTickerDisplay} 고점 대비 낙폭 (Drawdown)`}
                  subtitle="MDD 및 리스크 관리 분석"
                />
                <CardBody>
                  <EChartsWrapper option={tickerDDChartOption} height="220px" />
                </CardBody>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader
                    title="연도별 수익률 비교"
                    subtitle="최근 연도별 성과(Calendar Year)"
                  />
                  <CardBody>
                    <EChartsWrapper option={yearlyChartOption} height="300px" />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="월별 수익률 히트맵"
                    subtitle="계절성 및 월간 수익률 분포"
                  />
                  <CardBody>
                    <EChartsWrapper option={heatmapChartOption} height="300px" />
                  </CardBody>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader
                    title="롤링 변동성 (3Y)"
                    subtitle="시간 흐름에 따른 리스크 변동"
                  />
                  <CardBody>
                    <EChartsWrapper option={rollingVolOption} height="220px" />
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="롤링 샤프지수 (3Y)"
                    subtitle="위험 대비 수익률 추세"
                  />
                  <CardBody>
                    <EChartsWrapper option={rollingSharpeOption} height="220px" />
                  </CardBody>
                </Card>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
