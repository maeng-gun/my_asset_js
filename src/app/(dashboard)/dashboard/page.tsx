'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import { formatKRW, formatPercent } from '@/lib/utils'
import { buildProfitTrendData } from '@/lib/engine/analytics'
import { getLatestPortfolioSummary, getReturnData, getInflowList } from '@/lib/actions/db'
import { format, addDays } from 'date-fns'
import {
  TrendingUp,
  Activity,
  Wallet,
  CalendarCheck,
  TrendingDown,
} from 'lucide-react'
import { LatestPortfolioSummary } from '@/lib/engine/types'

export default function DashboardPage() {
  const [scheduleTab, setScheduleTab] = useState<'all' | 'inflow' | 'maturity'>('all')

  // 1. 최신 포트폴리오 스냅샷
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['latest-portfolio-summary'],
    queryFn: async () => {
      const data = await getLatestPortfolioSummary()
      return data as LatestPortfolioSummary
    },
  })

  // 2. return 시계열 데이터
  const { data: returnDataRows } = useQuery({
    queryKey: ['profit-return-data'],
    queryFn: async () => {
      const data = await getReturnData()
      return data || []
    },
  })

  // 3. 유동성 분석 데이터
  const { data: analyticsData } = useQuery({
    queryKey: ['liquidity-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/analytics/liquidity')
      if (!res.ok) throw new Error('유동성 분석 데이터 조회 실패')
      return await res.json()
    },
  })

  // 4. 자금유출입 내역
  const { data: inflowList } = useQuery({
    queryKey: ['liquidity-inflow-list'],
    queryFn: async () => {
      const data = await getInflowList()
      return data as any[]
    },
  })

  // 데이터 가공: 요약 수치
  const totalProfits = summary?.total_profit || []
  const latestTotalProfit = totalProfits.length > 0 ? totalProfits[totalProfits.length - 1] : {
    평가금액: 0,
    총손익: 0,
    총수익률: 0,
  }

  const latestVariation = summary?.profit_variation?.find((v: any) => v.자산군 === '<합계>') || {
    '1d': 0,
    '1d_': 0,
  }

  // 데이터 가공: YTD 누적손익 라인 차트
  const startDate = `${new Date().getFullYear() - 1}-12-31`
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const endDate = todayStr
  const trendData = returnDataRows ? buildProfitTrendData(returnDataRows, startDate, endDate) : []

  const ytdChartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: '3%', right: '4%', bottom: '3%', top: '10%', containLabel: true },
    xAxis: {
      type: 'category',
      data: trendData.map((d) => d.기준일),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    series: [
      {
        name: '누적손익',
        type: 'line',
        data: trendData.map((d) => d.손익누계),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#38bdf8', width: 2.5 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: '#38bdf840' },
              { offset: 1, color: '#38bdf800' },
            ],
          },
        },
      },
    ],
  }

  // 데이터 가공: 자산군별 이중 도넛 차트
  const majorGroupsArray = (summary?.t_comm || []).filter((d: any) => !d.세부자산군 && !d.상품명 && d.자산군 !== '<합계>' && d.평가금액 > 0)
  const subGroupsArray = (summary?.t_comm || []).filter((d: any) => d.세부자산군 && !d.세부자산군2 && !d.상품명 && d.자산군 !== '<합계>' && d.평가금액 > 0)

  const innerPieData = majorGroupsArray.map((d: any) => ({ name: d.자산군, value: d.평가금액 }))
  const outerPieData = subGroupsArray.map((d: any) => ({ name: d.세부자산군, value: d.평가금액 }))

  const pieChartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const val = Math.round(params.value).toLocaleString('ko-KR')
        const pct = params.percent ? params.percent.toFixed(1) : 0
        return `${params.seriesName} <br/>${params.name}: ${val}원 (${pct}%)`
      }
    },
    series: [
      {
        name: '자산군',
        type: 'pie',
        selectedMode: 'single',
        radius: [0, '40%'],
        label: { 
          position: 'inner', 
          fontSize: 10, 
          color: '#fff', 
          formatter: (params: any) => {
            const pct = params.percent ? params.percent.toFixed(1) : 0
            return `${params.name}\n${pct}%`
          }
        },
        labelLine: { show: false },
        data: innerPieData,
        itemStyle: {
            borderColor: '#0f172a',
            borderWidth: 1
        }
      },
      {
        name: '세부자산군',
        type: 'pie',
        radius: ['50%', '70%'],
        label: {
          color: '#cbd5e1',
          fontSize: 10,
          formatter: (params: any) => {
            const pct = params.percent ? params.percent.toFixed(1) : 0
            return `${params.name} (${pct}%)`
          }
        },
        data: outerPieData,
        itemStyle: {
            borderColor: '#0f172a',
            borderWidth: 1
        }
      }
    ]
  }

  // 데이터 가공: 유동성 현황
  const liquidityTrends = analyticsData?.evalTrend || []
  const latestLiquidity = liquidityTrends.find((d: any) => d.기준일 === todayStr) 
    || liquidityTrends.filter((d: any) => d.기준일 <= todayStr).pop() 
    || { 투자가능자산: 0, 현금화가능자산: 0, 인출가능현금: 0 }

  // 데이터 가공: 30일 이내 스케줄
  const next30DaysStr = format(addDays(new Date(), 30), 'yyyy-MM-dd')

  const maturityList = analyticsData?.maturity || []

  const scheduleInflow = (inflowList || [])
    .filter((d: any) => {
      const dStr = d.거래일자?.substring(0, 10)
      return dStr >= todayStr && dStr <= next30DaysStr
    })
    .map((d: any) => ({
      id: `inflow_${d.행번호}`,
      type: 'inflow',
      date: d.거래일자.substring(0, 10),
      title: d.계좌,
      amount: d.자금유출입 ?? d.금액,
      isMinus: (d.자금유출입 ?? d.금액) < 0 || d.구분 === '출금'
    }))

  const scheduleMaturity = maturityList
    .filter((d: any) => d.만기일 >= todayStr && d.만기일 <= next30DaysStr)
    .map((d: any, i: number) => ({
      id: `maturity_${i}`,
      type: 'maturity',
      date: d.만기일,
      title: d.종목명,
      amount: d.평가금액,
      account: d.계좌
    }))

  const mergedSchedule = [...scheduleInflow, ...scheduleMaturity].sort((a, b) => a.date.localeCompare(b.date))
  
  const filteredSchedule = mergedSchedule.filter(item => {
    if (scheduleTab === 'all') return true
    return item.type === scheduleTab
  })

  return (
    <div className="space-y-6">
      {/* 1. 상단 핵심 숫자 (전체 너비) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 p-6 bg-slate-900/90 rounded-2xl border border-slate-800 flex flex-col justify-center shadow-md">
          <div className="text-slate-400 text-sm font-medium mb-2 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-slate-300" /> 총 평가금액
          </div>
          <div className="text-3xl sm:text-4xl font-bold font-mono text-slate-100 tracking-tight">
            {isSummaryLoading ? '...' : formatKRW(latestTotalProfit.평가금액)}
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="p-6 bg-slate-900/90 rounded-2xl border border-slate-800 flex flex-col justify-center shadow-md">
            <div className="text-slate-400 text-sm font-medium mb-2">당해연도 누적 총손익</div>
            <div className="flex items-baseline gap-3">
              <span className={`text-2xl font-bold font-mono ${latestTotalProfit.총손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {latestTotalProfit.총손익 > 0 ? '+' : ''}{isSummaryLoading ? '...' : formatKRW(latestTotalProfit.총손익)}
              </span>
              <span className={`text-lg font-bold font-mono ${latestTotalProfit.총수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ({isSummaryLoading ? '...' : formatPercent(latestTotalProfit.총수익률)})
              </span>
            </div>
          </div>
          
          <div className="p-6 bg-slate-900/90 rounded-2xl border border-slate-800 flex flex-col justify-center shadow-md">
            <div className="text-slate-400 text-sm font-medium mb-2">전일대비 변동</div>
            <div className="flex items-baseline gap-3">
              <span className={`text-2xl font-bold font-mono flex items-center gap-1 ${latestVariation['1d'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {latestVariation['1d'] >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                {latestVariation['1d'] > 0 ? '+' : ''}{isSummaryLoading ? '...' : formatKRW(Math.abs(latestVariation['1d']))}
              </span>
              <span className={`text-lg font-bold font-mono ${latestVariation['1d_'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ({isSummaryLoading ? '...' : formatPercent(latestVariation['1d_'])})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 2단 레이아웃 (좌: 차트 2개, 우: 유동성 & 스케줄) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* 좌측: 차트 영역 (lg: 7/12) */}
        <div className="lg:col-span-7 space-y-6">
          {/* YTD 라인 차트 */}
          <Card>
            <CardHeader title="당해연도 누적손익 추이" subtitle="전년말 대비 현재까지의 포트폴리오 성과" />
            <CardBody>
              <EChartsWrapper option={ytdChartOption} height="300px" />
            </CardBody>
          </Card>

          {/* 자산비중 도넛 차트 */}
          <Card>
            <CardHeader title="자산군별 보유비중" subtitle="자산군 및 세부자산군 비중" />
            <CardBody>
              <EChartsWrapper option={pieChartOption} height="360px" />
            </CardBody>
          </Card>
        </div>

        {/* 우측: 유동성 & 스케줄 영역 (lg: 5/12) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* 유동성 현황 */}
          <Card>
            <CardHeader title="가용 유동성 요약" subtitle="조회 시점 기준 현금화 가능 자산" />
            <CardBody className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 text-slate-300 font-medium">
                  <Activity className="w-4 h-4 text-emerald-400" /> 투자가능자산
                </div>
                <div className="font-mono font-bold text-emerald-400 text-lg">
                  {formatKRW(latestLiquidity.투자가능자산)}
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 text-slate-300 font-medium">
                  <Activity className="w-4 h-4 text-fuchsia-400" /> 현금화가능자산
                </div>
                <div className="font-mono font-bold text-slate-100 text-lg">
                  {formatKRW(latestLiquidity.현금화가능자산)}
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2 text-slate-300 font-medium">
                  <Activity className="w-4 h-4 text-rose-400" /> 인출가능현금
                </div>
                <div className="font-mono font-bold text-slate-100 text-lg">
                  {formatKRW(latestLiquidity.인출가능현금)}
                </div>
              </div>
            </CardBody>
          </Card>

          {/* 30일 이내 자금 일정 */}
          <Card className="flex flex-col h-[415px]">
            <CardHeader 
              title="30일 이내 자금 일정" 
              subtitle="다가오는 자금유출입 및 만기도래 내역" 
              action={
                <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                  <button 
                    onClick={() => setScheduleTab('all')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${scheduleTab === 'all' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >전체</button>
                  <button 
                    onClick={() => setScheduleTab('inflow')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${scheduleTab === 'inflow' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >유출입</button>
                  <button 
                    onClick={() => setScheduleTab('maturity')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${scheduleTab === 'maturity' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                  >만기</button>
                </div>
              }
            />
            <CardBody className="p-0 overflow-auto flex-1">
              {filteredSchedule.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2 p-6 pb-12">
                  <CalendarCheck className="w-8 h-8 opacity-50" />
                  <p className="text-sm">예정된 일정이 없습니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {filteredSchedule.map(item => (
                    <div key={item.id} className="p-4 hover:bg-slate-800/40 transition flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-center justify-center w-12 h-12 bg-slate-900 rounded-lg border border-slate-700 text-slate-300">
                          <span className="text-xs">{item.date.substring(5, 7)}월</span>
                          <span className="text-sm font-bold text-slate-100">{item.date.substring(8, 10)}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {item.type === 'inflow' ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${item.isMinus ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                                {item.isMinus ? '출금' : '입금'}
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-blue-500/20 text-blue-400">
                                만기
                              </span>
                            )}
                            <span className="text-sm font-medium text-slate-200 truncate max-w-[130px] inline-block">{item.title}</span>
                          </div>
                          {item.type === 'maturity' && (
                            <div className="text-xs text-slate-400">{item.account}</div>
                          )}
                        </div>
                      </div>
                      <div className={`font-mono font-bold text-right ${item.type === 'inflow' && item.isMinus ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {item.type === 'inflow' && item.isMinus ? '-' : '+'}
                        {formatKRW(Math.abs(item.amount))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
