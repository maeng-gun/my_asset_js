'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Tabs, TabItem } from '@/components/ui/tabs'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import { getInflowList, addInflowRecord, updateInflowRecord, deleteInflowRecord } from '@/lib/actions/db'
import { formatKRW } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  Activity,
  DollarSign,
  PieChart,
  PlusCircle,
  Edit2,
  Trash2,
} from 'lucide-react'
import { ALLOCATION_ACCOUNTS } from '@/lib/engine/types'

const TABS: TabItem[] = [
  { id: 'inflow', label: '자금유출입', icon: Activity },
  { id: 'total-assets', label: '총자산추이', icon: DollarSign },
  { id: 'available-funds', label: '가용자금추이', icon: PieChart },
]

export default function LiquidityPage() {
  const [activeTab, setActiveTab] = useState('inflow')
  const queryClient = useQueryClient()

  // 1. 유출입 폼 상태
  const [selectedInflowId, setSelectedInflowId] = useState<string>('new')
  const [inflowDate, setInflowDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [inflowAccount, setInflowAccount] = useState('한투')
  const [inflowType, setInflowType] = useState('입금')
  const [inflowAmt, setInflowAmt] = useState<number>(0)

  // 2. 유동성 분석 전용 API 쿼리
  const { data: analyticsData } = useQuery({
    queryKey: ['liquidity-analytics'],
    queryFn: async () => {
      const res = await fetch('/api/portfolio/analytics/liquidity')
      if (!res.ok) throw new Error('유동성 분석 데이터 조회 실패')
      const json = await res.json()
      return json
    },
  })

  // 3. inflow 테이블 (오늘 이후 유출입 내역)
  const { data: inflowList } = useQuery({
    queryKey: ['liquidity-inflow-list'],
    queryFn: async () => {
      const data = await getInflowList()
      return data as any[]
    },
  })

  // 신규/수정 선택 핸들러
  const handleSelectInflowRow = (val: string) => {
    setSelectedInflowId(val)
    if (val === 'new') {
      setInflowDate(format(new Date(), 'yyyy-MM-dd'))
      setInflowAccount('한투')
      setInflowType('입금')
      setInflowAmt(0)
    } else {
      const target = (inflowList || []).find((r) => String(r.행번호) === val)
      if (target) {
        setInflowDate(target.거래일자 ? target.거래일자.substring(0, 10) : format(new Date(), 'yyyy-MM-dd'))
        setInflowAccount(target.계좌 || '한투')
        setInflowType((target.자금유출입 ?? target.금액 ?? 0) >= 0 ? '입금' : '출금')
        setInflowAmt(Math.abs(target.자금유출입 ?? target.금액 ?? 0))
      }
    }
  }

  // 유출입 추가 Mutation
  const addInflowMutation = useMutation({
    mutationFn: async () => {
      const signedAmt = inflowType === '출금' ? -Math.abs(inflowAmt) : Math.abs(inflowAmt)

      await addInflowRecord({
        거래일자: inflowDate,
        계좌: inflowAccount,
        자금유출입: signedAmt,
      })
    },
    onSuccess: () => {
      toast.success('유출입 내역이 추가되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['liquidity-inflow-list'] })
      queryClient.invalidateQueries({ queryKey: ['liquidity-analytics'] })
      handleSelectInflowRow('new')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '추가 실패'
      toast.error(`추가 오류: ${msg}`)
    },
  })

  // 유출입 수정 Mutation
  const updateInflowMutation = useMutation({
    mutationFn: async () => {
      if (selectedInflowId === 'new') return
      const signedAmt = inflowType === '출금' ? -Math.abs(inflowAmt) : Math.abs(inflowAmt)

      await updateInflowRecord(Number(selectedInflowId), {
        거래일자: inflowDate,
        계좌: inflowAccount,
        자금유출입: signedAmt,
      })
    },
    onSuccess: () => {
      toast.success('유출입 내역이 수정되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['liquidity-inflow-list'] })
      queryClient.invalidateQueries({ queryKey: ['liquidity-analytics'] })
      handleSelectInflowRow('new')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '수정 실패'
      toast.error(`수정 오류: ${msg}`)
    },
  })

  // 유출입 삭제 Mutation
  const deleteInflowMutation = useMutation({
    mutationFn: async () => {
      if (selectedInflowId === 'new') return
      await deleteInflowRecord(Number(selectedInflowId))
    },
    onSuccess: () => {
      toast.success('유출입 내역이 삭제되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['liquidity-inflow-list'] })
      queryClient.invalidateQueries({ queryKey: ['liquidity-analytics'] })
      handleSelectInflowRow('new')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '삭제 실패'
      toast.error(`삭제 오류: ${msg}`)
    },
  })

  // 평가금액 5종 복합 추세선 ECharts 옵션
  const trendList = (analyticsData?.evalTrend || []) as any[]

  const trendChartOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['과거평가액', '예상평가액(점선)', '투자가능자산', '현금화가능자산', '인출가능현금'],
      textStyle: { color: '#94a3b8' },
      right: '2%',
      top: '5%',
    },
    grid: { left: '3%', right: '4%', bottom: '12%', top: '20%', containLabel: true },
    xAxis: {
      type: 'category',
      data: trendList.map((r) => r.기준일),
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 },
    },
    yAxis: [
    {
      position: "left",
      type: 'value',
      name: '금액(만원)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    {
      position: "right",
      type: 'value',
      name: '금액(만원)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    }
  ],
    series: [
      {
        name: '과거평가액',
        type: 'line',
        data: trendList.map((r) => r.과거평가액),
        smooth: true,
        symbol: 'none',
        itemStyle: { color: '#38bdf8' },
        lineStyle: { color: '#38bdf8', width: 2.5 },
      },
      {
        name: '예상평가액(점선)',
        type: 'line',
        data: trendList.map((r) => r.예상평가액),
        smooth: true,
        symbol: 'none',
        itemStyle: { color: '#60a5fa' },
        lineStyle: { color: '#60a5fa', width: 2, type: 'dashed' },
      },
      {
        name: '투자가능자산',
        type: 'line',
        data: trendList.map((r) => r.투자가능자산),
        smooth: true,
        symbol: 'none',
        itemStyle: { color: '#10b981' },
        lineStyle: { color: '#10b981', width: 2 },
      },
      {
        name: '현금화가능자산',
        type: 'line',
        data: trendList.map((r) => r.현금화가능자산),
        smooth: true,
        symbol: 'none',
        itemStyle: { color: '#f59e0b' },
        lineStyle: { color: '#f59e0b', width: 2 },
      },
      {
        name: '인출가능현금',
        type: 'line',
        data: trendList.map((r) => r.인출가능현금),
        smooth: true,
        symbol: 'none',
        itemStyle: { color: '#f43f5e' },
        lineStyle: { color: '#f43f5e', width: 2 },
      },
    ],
  }

  const liquidityData = analyticsData?.liquidityAnalysis
  const maturityList = (analyticsData?.maturity || []) as any[]

  return (
    <div className="space-y-6">
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* 탭 1: 자금유출입 */}
      {activeTab === 'inflow' && (
        <div className="space-y-6">
          {/* 상단 평가금액 5종 복합 추세선 차트 */}
          <Card>
            <CardHeader
              title="평가금액 및 가용자금 추이"
              subtitle="과거평가액(실선), 미래예상액(점선), 투자가능/현금화가능/인출가능 자금 시계열"
            />
            <CardBody>
              <EChartsWrapper option={trendChartOption} height="360px" />
            </CardBody>
          </Card>

          {/* 하단 3단 레이아웃 */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* 1. 입력사항 (CRUD) */}
            <Card className="md:col-span-3">
              <CardHeader title="유출입 입력" subtitle="추가 / 수정 / 삭제" />
              <CardBody className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">신규/수정 선택</label>
                  <select
                    value={selectedInflowId}
                    onChange={(e) => handleSelectInflowRow(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-medium"
                  >
                    <option value="new">✨ 신규 입력</option>
                    {(inflowList || []).map((r) => (
                      <option key={r.행번호} value={String(r.행번호)}>
                        No.{r.행번호} | {r.거래일자?.substring(0, 10)} | {r.계좌} | {formatKRW(r.자금유출입 ?? r.금액)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">거래일자</label>
                  <input
                    type="date"
                    value={inflowDate}
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker()
                      } catch (err) {
                        // ignore if showPicker is not supported
                      }
                    }}
                    onChange={(e) => setInflowDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 cursor-pointer [color-scheme:dark]"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">계좌</label>
                  <select
                    value={inflowAccount}
                    onChange={(e) => setInflowAccount(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    {ALLOCATION_ACCOUNTS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">구분</label>
                  <select
                    value={inflowType}
                    onChange={(e) => setInflowType(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    <option value="입금">입금 (+)</option>
                    <option value="출금">출금 (-)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">금액 (원)</label>
                  <input
                    type="number"
                    value={inflowAmt || ''}
                    onChange={(e) => setInflowAmt(parseFloat(e.target.value) || 0)}
                    placeholder="금액을 입력하세요"
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div className="pt-3 space-y-2">
                  <button
                    onClick={() => addInflowMutation.mutate()}
                    disabled={addInflowMutation.isPending || !inflowAmt}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-semibold text-white transition disabled:opacity-50"
                  >
                    <PlusCircle className="w-4 h-4" />
                    신규 추가
                  </button>

                  {selectedInflowId !== 'new' && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateInflowMutation.mutate()}
                        disabled={updateInflowMutation.isPending}
                        className="flex items-center justify-center gap-1 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-semibold text-white transition"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        수정
                      </button>
                      <button
                        onClick={() => deleteInflowMutation.mutate()}
                        disabled={deleteInflowMutation.isPending}
                        className="flex items-center justify-center gap-1 py-1.5 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-semibold text-white transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            {/* 2. 유출입 내역 목록 */}
            <Card className="md:col-span-4">
              <CardHeader title="유출입 내역" subtitle="등록된 자금 유출입 스케줄" />
              <CardBody className="p-0 overflow-auto max-h-96">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                      <th className="py-2.5 px-3">일자</th>
                      <th className="py-2.5 px-3">계좌</th>
                      <th className="py-2.5 px-3">구분</th>
                      <th className="py-2.5 px-3 text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {(inflowList || []).map((r: any, i: number) => {
                      const isMinus = (r.자금유출입 ?? r.금액 ?? 0) < 0 || r.구분 === '출금'
                      return (
                        <tr
                          key={i}
                          onClick={() => handleSelectInflowRow(String(r.행번호))}
                          className="hover:bg-slate-800/40 cursor-pointer transition"
                        >
                          <td className="py-2 px-3 text-slate-300 font-sans">{r.거래일자?.substring(0, 10)}</td>
                          <td className="py-2 px-3 text-slate-200 font-sans">{r.계좌}</td>
                          <td className="py-2 px-3 font-sans">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                !isMinus ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {!isMinus ? '입금' : '출금'}
                            </span>
                          </td>
                          <td className={`py-2 px-3 text-right font-medium ${!isMinus ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatKRW(r.자금유출입 ?? r.금액)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardBody>
            </Card>

            {/* 3. 만기도래 내역 실데이터 테이블 */}
            <Card className="md:col-span-5">
              <CardHeader title="만기도래 내역" subtitle="채권/ELS 만기 예정 자산" />
              <CardBody className="p-0 overflow-auto max-h-96">
                {maturityList.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    현재 등록된 만기도래 예정 상품이 없습니다.
                  </div>
                ) : (
                  <table className="w-full text-xs text-left border-collapse">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                        <th className="py-2.5 px-3">계좌</th>
                        <th className="py-2.5 px-3">종목명</th>
                        <th className="py-2.5 px-3 text-right">평가금액</th>
                        <th className="py-2.5 px-3 text-center">만기일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {maturityList.map((m: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/40 transition">
                          <td className="py-2 px-3 font-sans font-semibold text-slate-200">{m.계좌}</td>
                          <td className="py-2 px-3 font-sans text-slate-100 max-w-[150px] truncate" title={m.종목명}>
                            {m.종목명}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-emerald-400">{formatKRW(m.평가금액)}</td>
                          <td className="py-2 px-3 text-center font-sans text-slate-400">{m.만기일}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      {/* 탭 2: 총자산추이 */}
      {activeTab === 'total-assets' && (
        <div className="space-y-6">
          {/* 1. 총자산 현황 테이블 */}
          <Card>
            <CardHeader title="계좌별 총자산 및 현금성자산 현황" subtitle="현재 시점의 계좌별 총자산 잔액" />
            <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-3 px-4">구분</th>
                    {ALLOCATION_ACCOUNTS.map((a) => (
                      <th key={a} className="py-3 px-3 text-right">
                        {a}
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right font-bold text-slate-100 border-l border-slate-800 bg-slate-900/60">
                      합계
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(liquidityData?.currentStatus || []).map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-sans font-semibold text-slate-200">{r.구분}</td>
                      {ALLOCATION_ACCOUNTS.map((a) => {
                        const val = r[a] || 0
                        return (
                          <td key={a} className={`py-3 px-3 text-right ${val === 0 ? 'text-slate-600' : 'text-slate-200'}`}>
                            {val === 0 ? '-' : formatKRW(val)}
                          </td>
                        )
                      })}
                      <td className="py-3 px-4 text-right font-bold text-emerald-400 border-l border-slate-800 bg-slate-900/40">
                        {formatKRW(r.합계)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          {/* 2. 월별 총자산 시계열 투사 테이블 */}
          <Card>
            <CardHeader title="월별 총자산 시계열 투사 (Total Projection)" subtitle="유출입 누적을 반영한 미래 총자산 추이" />
            <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-3 px-4">거래월</th>
                    {ALLOCATION_ACCOUNTS.map((a) => (
                      <th key={a} className="py-3 px-3 text-right">
                        {a}
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right font-bold text-slate-100 border-l border-slate-800 bg-slate-900/60">
                      총자산 합계
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(liquidityData?.totalProjection || []).map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-4 font-sans font-semibold text-emerald-400">{r.거래월}</td>
                      {ALLOCATION_ACCOUNTS.map((a) => {
                        const val = r[a] || 0
                        return (
                          <td key={a} className={`py-2.5 px-3 text-right ${val === 0 ? 'text-slate-600' : 'text-slate-200'}`}>
                            {val === 0 ? '-' : formatKRW(val)}
                          </td>
                        )
                      })}
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-400 border-l border-slate-800 bg-slate-900/40">
                        {formatKRW(r.합계)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* 탭 3: 가용자금추이 */}
      {activeTab === 'available-funds' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="월별 가용자금 및 현금성자산 투사 (Cash Projection)"
              subtitle="유출입 및 만기도래 자금 유입을 반영한 계좌별 현금 유동성 추이"
            />
            <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-3 px-4">거래월</th>
                    {ALLOCATION_ACCOUNTS.map((a) => (
                      <th key={a} className="py-3 px-3 text-right">
                        {a}
                      </th>
                    ))}
                    <th className="py-3 px-4 text-right font-bold text-slate-100 border-l border-slate-800 bg-slate-900/60">
                      가용자금 합계
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(liquidityData?.cashProjection || []).map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-4 font-sans font-semibold text-emerald-400">{r.거래월}</td>
                      {ALLOCATION_ACCOUNTS.map((a) => {
                        const val = r[a] || 0
                        return (
                          <td key={a} className={`py-2.5 px-3 text-right ${val === 0 ? 'text-slate-600' : 'text-slate-200'}`}>
                            {val === 0 ? '-' : formatKRW(val)}
                          </td>
                        )
                      })}
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-400 border-l border-slate-800 bg-slate-900/40">
                        {formatKRW(r.합계)}
                      </td>
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
