'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Tabs, TabItem } from '@/components/ui/tabs'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import { formatKRW, formatPercent } from '@/lib/utils'
import { buildProfitTrendData, buildAssetProfitData } from '@/lib/engine/analytics'
import { getLatestPortfolioSummary, getReturnData } from '@/lib/actions/db'
import { subMonths, format } from 'date-fns'
import {
  TrendingUp,
  BarChart3,
  Layers,
  Wallet,
  Coins,
  Receipt,
  Calendar,
} from 'lucide-react'
import { LatestPortfolioSummary } from '@/lib/engine/types'

const TABS: TabItem[] = [
  { id: 'total', label: '종합손익', icon: TrendingUp },
  { id: 'trend', label: '손익변동', icon: BarChart3 },
  { id: 'by-asset', label: '자산군별', icon: Layers },
  { id: 'by-account', label: '계좌별', icon: Wallet },
  { id: 'by-account-item', label: '계좌별상품', icon: Coins },
  { id: 'by-asset-item', label: '자산군별상품', icon: Receipt },
]

export default function ProfitPage() {
  const [activeTab, setActiveTab] = useState('total')
  const [startDate, setStartDate] = useState(
    `${new Date().getFullYear() - 1}-12-31`
  )
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  // 1. 최신 포트폴리오 스냅샷 쿼리 (0.01초 로딩)
  const { data: summary, isLoading: isSummaryLoading } = useQuery({
    queryKey: ['latest-portfolio-summary'],
    queryFn: async () => {
      const data = await getLatestPortfolioSummary()
      return data as LatestPortfolioSummary
    },
  })

  // 2. return 시계열 데이터 쿼리 (손익변동 차트용)
  const { data: returnDataRows } = useQuery({
    queryKey: ['profit-return-data'],
    queryFn: async () => {
      const data = await getReturnData()
      return data || []
    },
  })

  // 차트 데이터 계산
  const trendData = returnDataRows ? buildProfitTrendData(returnDataRows, startDate, endDate) : []
  const assetTrendData = returnDataRows ? buildAssetProfitData(returnDataRows, startDate, endDate) : {}

  // 종합 차트 ECharts 옵션
  const totalChartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['일간손익', '손익누계'],
      textStyle: { color: '#94a3b8' },
      right: '2%',
    },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: trendData.map((d) => d.기준일),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 11 },
    },
    yAxis: [
      {
        type: 'value',
        name: '손익(만원)',
        nameTextStyle: { color: '#94a3b8' },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8' },
      },
    ],
    series: [
      {
        name: '일간손익',
        type: 'bar',
        data: trendData.map((d) => d.일간손익),
        itemStyle: {
          color: (params: { value: number }) => (params.value >= 0 ? '#10b981' : '#f43f5e'),
          borderRadius: [4, 4, 0, 0],
        },
      },
      {
        name: '손익누계',
        type: 'line',
        data: trendData.map((d) => d.손익누계),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#38bdf8', width: 2.5 },
      },
    ],
  }

  const makeSubChartOption = (title: string, data: Array<{ 기준일: string; 손익누계: number }>, color: string) => ({
    backgroundColor: 'transparent',
    title: { text: title, left: 'center', textStyle: { color: '#cbd5e1', fontSize: 13, fontWeight: 'normal' } },
    tooltip: { trigger: 'axis' },
    grid: { left: '5%', right: '5%', bottom: '15%', top: '25%', containLabel: true },
    xAxis: {
      type: 'category',
      data: (data || []).map((d) => d.기준일),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: [
    {
      position: "left",
      type: 'value',
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    {
      position: "right",
      type: 'value',
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    }
  ],
    series: [
      {
        name: '손익누계',
        type: 'line',
        data: (data || []).map((d) => d.손익누계),
        smooth: true,
        symbol: 'none',
        lineStyle: { color, width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}40` },
              { offset: 1, color: `${color}00` },
            ],
          },
        },
      },
    ],
  })

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* 탭 1: 종합손익 */}
      {activeTab === 'total' && (
        <div className="space-y-6">
          {/* 1.1 연도별 종합손익 */}
          <Card>
            <CardHeader
              title="연도별 종합손익"
              subtitle="장부금액, 평잔, 평가금액, 실현손익, 평가손익증감 및 총수익률"
            />
            <CardBody className="p-0 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-3 px-4">연도</th>
                    <th className="py-3 px-4 text-right">장부금액</th>
                    <th className="py-3 px-4 text-right">평잔</th>
                    <th className="py-3 px-4 text-right">평가금액</th>
                    <th className="py-3 px-4 text-right">평가손익</th>
                    <th className="py-3 px-4 text-right">실현손익</th>
                    <th className="py-3 px-4 text-right">평가손익증감</th>
                    <th className="py-3 px-4 text-right font-bold text-slate-200 border-x border-slate-800 bg-slate-900/50">
                      총손익
                    </th>
                    <th className="py-3 px-4 text-right">실현수익률</th>
                    <th className="py-3 px-4 text-right">평가증감률</th>
                    <th className="py-3 px-4 text-right font-bold text-slate-200">총수익률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {(summary?.total_profit || []).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-semibold text-emerald-400">{r.연도}</td>
                      <td className="py-3 px-4 text-right font-mono">{formatKRW(r.장부금액)}</td>
                      <td className="py-3 px-4 text-right font-mono">{formatKRW(r.평잔)}</td>
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-100">{formatKRW(r.평가금액)}</td>
                      <td
                        className={`py-3 px-4 text-right font-mono ${
                          r.평가손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatKRW(r.평가손익)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono ${
                          r.실현손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatKRW(r.실현손익)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono ${
                          r.평가손익증감 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatKRW(r.평가손익증감)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold border-x border-slate-800 bg-slate-900/30 ${
                          r.총손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatKRW(r.총손익)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono ${
                          r.실현수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPercent(r.실현수익률)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono ${
                          r.평가증감률 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPercent(r.평가증감률)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono font-bold ${
                          r.총수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPercent(r.총수익률)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* 1.2 손익변동 (1d, 1m, 3m, 6m, 1y) */}
          <Card>
            <CardHeader
              title="손익변동 (기간별 비교)"
              subtitle="자산군별 1일, 1개월, 3개월, 6개월, 1년 전 대비 손익 및 수익률 변동"
            />
            <CardBody className="p-0 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-3 px-3">자산군</th>
                    <th className="py-3 px-3">세부자산군</th>
                    <th className="py-3 px-3">세부자산군2</th>
                    <th className="py-3 px-3 text-right">평가금액</th>
                    <th className="py-3 px-3 text-right">총손익</th>
                    <th className="py-3 px-3 text-right font-bold text-slate-200">총수익률</th>
                    <th className="py-3 px-3 text-right bg-slate-950/40">1D 손익</th>
                    <th className="py-3 px-3 text-right bg-slate-950/40">1D 수익률</th>
                    <th className="py-3 px-3 text-right">1M 손익</th>
                    <th className="py-3 px-3 text-right">1M 수익률</th>
                    <th className="py-3 px-3 text-right bg-slate-950/40">3M 손익</th>
                    <th className="py-3 px-3 text-right bg-slate-950/40">3M 수익률</th>
                    <th className="py-3 px-3 text-right">6M 손익</th>
                    <th className="py-3 px-3 text-right">6M 수익률</th>
                    <th className="py-3 px-3 text-right bg-slate-950/40">1Y 손익</th>
                    <th className="py-3 px-3 text-right bg-slate-950/40">1Y 수익률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(summary?.profit_variation || []).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{r.자산군}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{r.세부자산군 || '-'}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{r.세부자산군2 || '-'}</td>
                      <td className="py-2.5 px-3 text-right">{formatKRW(r.평가금액)}</td>
                      <td className={`py-2.5 px-3 text-right font-medium ${r.총손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKRW(r.총손익)}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-bold ${r.총수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(r.총수익률)}
                      </td>
                      <td className={`py-2.5 px-3 text-right bg-slate-950/40 ${r['1d'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKRW(r['1d'])}
                      </td>
                      <td className={`py-2.5 px-3 text-right bg-slate-950/40 ${r['1d_'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(r['1d_'])}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${r['1m'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKRW(r['1m'])}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${r['1m_'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(r['1m_'])}
                      </td>
                      <td className={`py-2.5 px-3 text-right bg-slate-950/40 ${r['3m'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKRW(r['3m'])}
                      </td>
                      <td className={`py-2.5 px-3 text-right bg-slate-950/40 ${r['3m_'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(r['3m_'])}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${r['6m'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKRW(r['6m'])}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${r['6m_'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(r['6m_'])}
                      </td>
                      <td className={`py-2.5 px-3 text-right bg-slate-950/40 ${r['1y'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKRW(r['1y'])}
                      </td>
                      <td className={`py-2.5 px-3 text-right bg-slate-950/40 ${r['1y_'] >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(r['1y_'])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* 탭 2: 손익변동 (차트) */}
      {activeTab === 'trend' && (
        <div className="space-y-6">
          {/* 기간 필터 */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-slate-300 font-medium">조회 기간:</span>
            </div>
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
            <div className="flex gap-1.5 ml-auto">
              <button
                onClick={() => setStartDate(`${new Date().getFullYear() - 1}-12-31`)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300"
              >
                YTD
              </button>
              <button
                onClick={() => setStartDate(format(subMonths(new Date(), 1), 'yyyy-MM-dd'))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300"
              >
                1M
              </button>
              <button
                onClick={() => setStartDate(format(subMonths(new Date(), 3), 'yyyy-MM-dd'))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300"
              >
                3M
              </button>
              <button
                onClick={() => setStartDate(format(subMonths(new Date(), 6), 'yyyy-MM-dd'))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300"
              >
                6M
              </button>
              <button
                onClick={() => setStartDate(format(subMonths(new Date(), 12), 'yyyy-MM-dd'))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300"
              >
                1Y
              </button>
            </div>
          </div>

          {/* 메인 종합 손익 바-라인 차트 */}
          <Card>
            <CardHeader title="전체 일간손익 및 누적손익 추이" subtitle="일간손익(막대) 및 누적손익(선 그래프)" />
            <CardBody>
              <EChartsWrapper option={totalChartOption} height="380px" />
            </CardBody>
          </Card>

          {/* 6대 자산군 차트 2x3 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardBody>
                <EChartsWrapper
                  option={makeSubChartOption('선진국 주식', (assetTrendData as any).선진국, '#38bdf8')}
                  height="260px"
                />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <EChartsWrapper
                  option={makeSubChartOption('신흥국(한국 포함) 주식', (assetTrendData as any).신흥국, '#f59e0b')}
                  height="260px"
                />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <EChartsWrapper
                  option={makeSubChartOption('실물자산 (금/원자재)', (assetTrendData as any).실물자산, '#eab308')}
                  height="260px"
                />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <EChartsWrapper
                  option={makeSubChartOption('인컴자산 (리츠/인프라)', (assetTrendData as any).인컴자산, '#10b981')}
                  height="260px"
                />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <EChartsWrapper
                  option={makeSubChartOption('채권', (assetTrendData as any).채권, '#a855f7')}
                  height="260px"
                />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <EChartsWrapper
                  option={makeSubChartOption('현금성', (assetTrendData as any).현금성, '#94a3b8')}
                  height="260px"
                />
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* 탭 3: 자산군별 */}
      {activeTab === 'by-asset' && (
        <Card>
          <CardHeader title="자산군별 손익현황" subtitle="자산군 > 세부자산군 > 세부자산군2 계층별 손익 명세" />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-4">자산군</th>
                  <th className="py-3 px-4">세부자산군</th>
                  <th className="py-3 px-4">세부자산군2</th>
                  <th className="py-3 px-4 text-right">장부금액</th>
                  <th className="py-3 px-4 text-right">평잔</th>
                  <th className="py-3 px-4 text-right">평가금액</th>
                  <th className="py-3 px-4 text-right">평가손익</th>
                  <th className="py-3 px-4 text-right">실현손익</th>
                  <th className="py-3 px-4 text-right">평가증감</th>
                  <th className="py-3 px-4 text-right font-bold text-slate-200 border-x border-slate-800 bg-slate-900/50">총손익</th>
                  <th className="py-3 px-4 text-right">비용률</th>
                  <th className="py-3 px-4 text-right">실현수익률</th>
                  <th className="py-3 px-4 text-right">평가증감률</th>
                  <th className="py-3 px-4 text-right font-bold text-slate-200">총수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(summary?.t_comm3 || []).map((r, i) => (
                  <tr key={i} className={`hover:bg-slate-800/40 transition ${r.자산군 === '<합계>' ? 'bg-slate-900/60 font-bold' : ''}`}>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-200">{r.자산군}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-400">{r.세부자산군 || '-'}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-400">{r.세부자산군2 || '-'}</td>
                    <td className="py-2.5 px-4 text-right">{formatKRW(r.장부금액)}</td>
                    <td className="py-2.5 px-4 text-right">{formatKRW(r.평잔)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-100 font-medium">{formatKRW(r.평가금액)}</td>
                    <td className={`py-2.5 px-4 text-right ${r.평가손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatKRW(r.평가손익)}
                    </td>
                    <td className={`py-2.5 px-4 text-right ${r.실현손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatKRW(r.실현손익)}
                    </td>
                    <td className={`py-2.5 px-4 text-right ${r.평가손익증감 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatKRW(r.평가손익증감)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-bold border-x border-slate-800 bg-slate-900/30 ${
                        r.총손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatKRW(r.총손익)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400">{formatPercent(r.비용률)}</td>
                    <td className={`py-2.5 px-4 text-right ${r.실현수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(r.실현수익률)}
                    </td>
                    <td className={`py-2.5 px-4 text-right ${r.평가증감률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(r.평가증감률)}
                    </td>
                    <td className={`py-2.5 px-4 text-right font-bold ${r.총수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(r.총수익률)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* 탭 4: 계좌별 */}
      {activeTab === 'by-account' && (
        <Card>
          <CardHeader title="계좌별 손익현황" subtitle="계좌별 및 계좌 x 자산군별 손익 요약" />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-4">계좌</th>
                  <th className="py-3 px-4">자산군</th>
                  <th className="py-3 px-4 text-right">장부금액</th>
                  <th className="py-3 px-4 text-right">평잔</th>
                  <th className="py-3 px-4 text-right">평가금액</th>
                  <th className="py-3 px-4 text-right">평가손익</th>
                  <th className="py-3 px-4 text-right">실현손익</th>
                  <th className="py-3 px-4 text-right">평가증감</th>
                  <th className="py-3 px-4 text-right font-bold text-slate-200 border-x border-slate-800 bg-slate-900/50">총손익</th>
                  <th className="py-3 px-4 text-right">비용률</th>
                  <th className="py-3 px-4 text-right">실현수익률</th>
                  <th className="py-3 px-4 text-right">평가증감률</th>
                  <th className="py-3 px-4 text-right font-bold text-slate-200">총수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(summary?.t_comm4 || []).map((r, i) => (
                  <tr key={i} className={`hover:bg-slate-800/40 transition ${!r.자산군 || r.자산군 === '' ? 'bg-slate-900/40 font-semibold' : ''}`}>
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-200">{r.계좌}</td>
                    <td className="py-2.5 px-4 font-sans text-slate-400">{r.자산군 || '<소계>'}</td>
                    <td className="py-2.5 px-4 text-right">{formatKRW(r.장부금액)}</td>
                    <td className="py-2.5 px-4 text-right">{formatKRW(r.평잔)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-100 font-medium">{formatKRW(r.평가금액)}</td>
                    <td className={`py-2.5 px-4 text-right ${r.평가손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatKRW(r.평가손익)}
                    </td>
                    <td className={`py-2.5 px-4 text-right ${r.실현손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatKRW(r.실현손익)}
                    </td>
                    <td className={`py-2.5 px-4 text-right ${r.평가손익증감 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatKRW(r.평가손익증감)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-bold border-x border-slate-800 bg-slate-900/30 ${
                        r.총손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatKRW(r.총손익)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-400">{formatPercent(r.비용률)}</td>
                    <td className={`py-2.5 px-4 text-right ${r.실현수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(r.실현수익률)}
                    </td>
                    <td className={`py-2.5 px-4 text-right ${r.평가증감률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(r.평가증감률)}
                    </td>
                    <td className={`py-2.5 px-4 text-right font-bold ${r.총수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(r.총수익률)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* 탭 5: 계좌별상품 */}
      {activeTab === 'by-account-item' && (
        <Card>
          <CardHeader title="계좌별 상품 손익 상세" subtitle="계좌 x 통화 x 자산군 x 상품명 기준 손익" />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-3">계좌</th>
                  <th className="py-3 px-3">통화</th>
                  <th className="py-3 px-3">자산군</th>
                  <th className="py-3 px-3">세부자산군</th>
                  <th className="py-3 px-3">상품명</th>
                  <th className="py-3 px-3 text-right">보유수량</th>
                  <th className="py-3 px-3 text-right">장부금액</th>
                  <th className="py-3 px-3 text-right">평가금액</th>
                  <th className="py-3 px-3 text-right">평가손익</th>
                  <th className="py-3 px-3 text-right">실현손익</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-200 border-x border-slate-800 bg-slate-900/50">총손익</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-200">총수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(summary?.comm_profit || []).map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{r.계좌}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-400">{r.통화}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-300">{r.자산군}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-400">{r.세부자산군 || '-'}</td>
                    <td className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-[180px] truncate" title={r.종목명}>
                      {r.종목명}
                    </td>
                    <td className="py-2.5 px-3 text-right">{formatKRW(r.보유수량)}</td>
                    <td className="py-2.5 px-3 text-right">{formatKRW(r.장부금액)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-100 font-medium">{formatKRW(r.평가금액)}</td>
                    <td className={`py-2.5 px-3 text-right ${r.평가손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatKRW(r.평가손익)}
                    </td>
                    <td className={`py-2.5 px-3 text-right ${r.실현손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatKRW(r.실현손익)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold border-x border-slate-800 bg-slate-900/30 ${
                        r.총손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {formatKRW(r.총손익)}
                    </td>
                    <td className={`py-2.5 px-3 text-right font-bold ${r.총수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatPercent(r.총수익률)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* 탭 6: 자산군별상품 */}
      {activeTab === 'by-asset-item' && (
        <Card>
          <CardHeader title="자산군별 상품 손익 상세" subtitle="자산군 x 세부자산군 x 상품명 x 계좌 기준 손익" />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-3">자산군</th>
                  <th className="py-3 px-3">세부자산군</th>
                  <th className="py-3 px-3">세부자산군2</th>
                  <th className="py-3 px-3">상품명</th>
                  <th className="py-3 px-3">계좌</th>
                  <th className="py-3 px-3">통화</th>
                  <th className="py-3 px-3 text-right">보유수량</th>
                  <th className="py-3 px-3 text-right">장부금액</th>
                  <th className="py-3 px-3 text-right">평잔</th>
                  <th className="py-3 px-3 text-right">평가금액</th>
                  <th className="py-3 px-3 text-right">평가손익</th>
                  <th className="py-3 px-3 text-right">실현손익</th>
                  <th className="py-3 px-3 text-right">평가손익증감</th>
                  <th className="py-3 px-3 text-right">비용률</th>
                  <th className="py-3 px-3 text-right">실현수익률</th>
                  <th className="py-3 px-3 text-right">평가증감률</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-200 border-x border-slate-800 bg-slate-900/50">총손익</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-200">총수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(() => {
                  const commodityOrder = new Map()
                  ;(summary?.t_comm || []).forEach((h, i) => {
                    if (h.상품명 && !commodityOrder.has(h.상품명)) {
                      commodityOrder.set(h.상품명, i)
                    }
                  })

                  const sortedData = [...(summary?.comm_profit2 || [])].sort((a, b) => {
                    const orderA = commodityOrder.get(a.상품명) ?? 999999
                    const orderB = commodityOrder.get(b.상품명) ?? 999999
                    if (orderA !== orderB) return orderA - orderB
                    return (a.계좌 || '').localeCompare(b.계좌 || '')
                  })

                  return sortedData.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{r.자산군}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{r.세부자산군 || '-'}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{r.세부자산군2 || '-'}</td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-[180px] truncate" title={r.상품명}>
                        {r.상품명}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-300">{r.계좌}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{r.통화}</td>
                      <td className="py-2.5 px-3 text-right">{formatKRW(r.보유수량)}</td>
                      <td className="py-2.5 px-3 text-right">{formatKRW(r.장부금액)}</td>
                      <td className="py-2.5 px-3 text-right">{formatKRW(r.평잔 || 0)}</td>
                      <td className="py-2.5 px-3 text-right text-slate-100 font-medium">{formatKRW(r.평가금액)}</td>
                      <td className={`py-2.5 px-3 text-right ${r.평가손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKRW(r.평가손익)}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${r.실현손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKRW(r.실현손익)}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${r.평가손익증감 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatKRW(r.평가손익증감 || 0)}
                      </td>
                      <td className="py-2.5 px-3 text-right">{formatPercent(r.비용률 || 0)}</td>
                      <td className={`py-2.5 px-3 text-right ${(r.실현수익률 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(r.실현수익률 || 0)}
                      </td>
                      <td className={`py-2.5 px-3 text-right ${(r.평가증감률 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(r.평가증감률 || 0)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold border-x border-slate-800 bg-slate-900/30 ${
                          r.총손익 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatKRW(r.총손익)}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-bold ${r.총수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPercent(r.총수익률)}
                      </td>
                    </tr>
                  ))
                })()}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
