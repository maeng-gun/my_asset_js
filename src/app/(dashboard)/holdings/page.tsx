'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Tabs, TabItem } from '@/components/ui/tabs'
import { getLatestPortfolioSummary } from '@/lib/actions/db'
import { formatKRW, formatPercent } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Grid,
  Layers,
  Coins,
  Clipboard,
} from 'lucide-react'
import { LatestPortfolioSummary, ALLOCATION_ACCOUNTS } from '@/lib/engine/types'

const TABS: TabItem[] = [
  { id: 'allocation', label: '계좌별 자산배분', icon: Grid },
  { id: 'commodity1', label: '상품별 보유현황1', icon: Layers },
  { id: 'commodity2', label: '상품별 보유현황2', icon: Coins },
  { id: 'commodity3', label: '상품별 보유현황3', icon: Clipboard },
]

export default function HoldingsPage() {
  const [activeTab, setActiveTab] = useState('allocation')
  // 1. 최신 포트폴리오 스냅샷 쿼리 (0.01초 로드)
  const { data: summary, isLoading } = useQuery({
    queryKey: ['latest-portfolio-summary'],
    queryFn: async () => {
      const data = await getLatestPortfolioSummary()
      return data as LatestPortfolioSummary
    },
  })

  // TSV 클립보드 엑셀 복사 핸들러 (R Shiny fallbackCopyTextToClipboard 완벽 호환)
  const handleCopyExcel = () => {
    const data = summary?.t_comm10
    if (!data || data.length === 0) {
      toast.error('복사할 데이터가 없습니다.')
      return
    }

    const headers = ['자산군', '세부자산군', '세부자산군2', '상품명', '평가금액', '평가손익', '평가수익률', '계좌']
    const rows = data.map((r) => [
      r.자산군,
      r.세부자산군 || '',
      r.세부자산군2 || '',
      r.상품명,
      r.평가금액,
      r.평가손익,
      r.평가수익률,
      r.계좌,
    ])

    const tsvContent = [headers.join('\t'), ...rows.map((row) => row.join('\t'))].join('\n')

    navigator.clipboard
      .writeText(tsvContent)
      .then(() => {
        toast.success('표 내용이 클립보드에 복사되었습니다!\n엑셀에 바로 붙여넣기 하세요.')
      })
      .catch(() => {
        toast.error('클립보드 복사 중 오류가 발생했습니다.')
      })
  }

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* 탭 1: 계좌별 자산배분 (11개 계좌 피벗 매트릭스) */}
      {activeTab === 'allocation' && (
        <Card>
          <CardHeader
            title="계좌별 자산배분 현황"
            subtitle="각 계좌별 평가금액과 자산군별 비중 매트릭스"
          />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-3">자산군</th>
                  <th className="py-3 px-3">세부자산군</th>
                  <th className="py-3 px-3">세부자산군2</th>
                  {ALLOCATION_ACCOUNTS.map((acct) => (
                    <th key={acct} className="py-3 px-2 text-right">
                      {acct}
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right font-bold text-slate-100 border-l border-slate-800 bg-slate-900/60">
                    합계
                  </th>
                  <th className="py-3 px-3 text-right font-bold text-emerald-400">
                    비중
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(summary?.account_allocation || []).map((r, i) => (
                  <tr
                    key={i}
                    className={`hover:bg-slate-800/40 transition ${
                      r.자산군 === '합계' || r.자산군 === '<합계>' ? 'bg-slate-900/70 font-bold text-slate-100' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{r.자산군}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-400">{r.세부자산군 || '-'}</td>
                    <td className="py-2.5 px-3 font-sans text-slate-400">{r.세부자산군2 || '-'}</td>
                    {ALLOCATION_ACCOUNTS.map((acct) => {
                      const val = (r as any)[acct] || 0
                      return (
                        <td key={acct} className={`py-2.5 px-2 text-right ${val === 0 ? 'text-slate-600' : 'text-slate-200'}`}>
                          {val === 0 ? '-' : formatKRW(val)}
                        </td>
                      )
                    })}
                    <td className="py-2.5 px-3 text-right font-bold text-slate-100 border-l border-slate-800 bg-slate-900/40">
                      {formatKRW(r.합계)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                      {formatPercent(r.비중, false)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* 탭 2: 상품별 보유현황 1 (소계, 전체합계, 환차손익 롤업) */}
      {activeTab === 'commodity1' && (
        <Card>
          <CardHeader
            title="상품별 보유현황 1"
            subtitle="자산군별 소계, 전체 합계, 개별 종목 및 환차손익 계층 표"
          />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-3">자산군</th>
                  <th className="py-3 px-3">세부자산군</th>
                  <th className="py-3 px-3">세부자산군2</th>
                  <th className="py-3 px-3">상품명</th>
                  <th className="py-3 px-3 text-right">보유수량</th>
                  <th className="py-3 px-3 text-right">장부금액</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-200">평가금액</th>
                  <th className="py-3 px-3 text-right">평단가</th>
                  <th className="py-3 px-3 text-right">현재가</th>
                  <th className="py-3 px-3 text-right font-bold">평가손익</th>
                  <th className="py-3 px-3 text-right font-bold">수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(summary?.t_comm || []).map((h, i) => {
                  const isTotal = h.자산군 === '<합계>' || h.자산군 === '환차손익'
                  const isSubtotal = !h.상품명 || h.상품명 === ''
                  return (
                    <tr
                      key={i}
                      className={`hover:bg-slate-800/40 transition ${
                        isTotal
                          ? 'bg-slate-900/80 font-bold text-emerald-400'
                          : isSubtotal
                          ? 'bg-slate-900/30 font-semibold text-slate-300'
                          : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{h.자산군}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{h.세부자산군 || '-'}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{h.세부자산군2 || '-'}</td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-[200px] truncate" title={h.상품명}>
                        {h.상품명 || (isTotal ? h.자산군 : '<소계>')}
                      </td>
                      <td className="py-2.5 px-3 text-right">{h.보유수량 === 0 ? '-' : formatKRW(h.보유수량)}</td>
                      <td className="py-2.5 px-3 text-right">{formatKRW(h.장부금액)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-100">{formatKRW(h.평가금액)}</td>
                      <td className="py-2.5 px-3 text-right">{h.평단가 === 0 ? '-' : formatKRW(h.평단가)}</td>
                      <td className="py-2.5 px-3 text-right">{h.현재가 === 0 ? '-' : formatKRW(h.현재가)}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          (h.평가손익 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatKRW(h.평가손익)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          (h.평가수익률 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPercent(h.평가수익률)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* 탭 3: 상품별 보유현황 2 (계좌별 그룹화 및 계좌 소계) */}
      {activeTab === 'commodity2' && (
        <Card>
          <CardHeader
            title="상품별 보유현황 2"
            subtitle="계좌별 그룹화 및 계좌 소계가 포함된 보유현황"
          />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-3">계좌</th>
                  <th className="py-3 px-3">자산군</th>
                  <th className="py-3 px-3">세부자산군</th>
                  <th className="py-3 px-3">세부자산군2</th>
                  <th className="py-3 px-3">상품명</th>
                  <th className="py-3 px-3 text-right">보유수량</th>
                  <th className="py-3 px-3 text-right">장부금액</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-200">평가금액</th>
                  <th className="py-3 px-3 text-right font-bold">평가손익</th>
                  <th className="py-3 px-3 text-right font-bold">수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(summary?.t_comm2 || []).filter((h) => h.장부금액 !== 0 || !h.자산군 || h.자산군 === '').map((h, i) => {
                  const isAccountTotal = !h.자산군 || h.자산군 === ''
                  return (
                    <tr
                      key={i}
                      className={`hover:bg-slate-800/40 transition ${
                        isAccountTotal ? 'bg-slate-900/60 font-bold text-emerald-400' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{h.계좌}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{h.자산군 || '<계좌소계>'}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{h.세부자산군 || '-'}</td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">{h.세부자산군2 || '-'}</td>
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-[180px] truncate" title={h.상품명 || h.종목명}>
                        {h.상품명 || h.종목명 || (isAccountTotal ? '계좌 합계' : '-')}
                      </td>
                      <td className="py-2.5 px-3 text-right">{h.보유수량 === 0 ? '-' : formatKRW(h.보유수량)}</td>
                      <td className="py-2.5 px-3 text-right">{formatKRW(h.장부금액)}</td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-100">{formatKRW(h.평가금액 || 0)}</td>
                      <td
                        className={`py-2.5 px-3 text-right font-semibold ${
                          (h.평가손익 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatKRW(h.평가손익 || 0)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-bold ${
                          (h.평가수익률 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPercent(h.평가수익률 || 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* 탭 4: 상품별 보유현황 3 (엑셀 원클릭 복사용) */}
      {activeTab === 'commodity3' && (
        <Card>
          <CardHeader
            title="상품별 보유현황 3 (엑셀 복사용)"
            subtitle="버튼을 클릭하면 스프레드시트에 즉시 붙여넣을 수 있는 TSV 포맷으로 클립보드에 복사됩니다"
            action={
              <button
                onClick={handleCopyExcel}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition active:scale-95"
              >
                <Clipboard className="w-4 h-4" />
                엑셀 복사
              </button>
            }
          />
          <CardBody className="p-0 overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-4">자산군</th>
                  <th className="py-3 px-4">세부자산군</th>
                  <th className="py-3 px-4">세부자산군2</th>
                  <th className="py-3 px-4">상품명</th>
                  <th className="py-3 px-4 text-right font-bold text-slate-200">평가금액</th>
                  <th className="py-3 px-4 text-right font-bold">평가손익</th>
                  <th className="py-3 px-4 text-right font-bold">수익률</th>
                  <th className="py-3 px-4">계좌</th>
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

                  const sortedData = [...(summary?.t_comm10 || [])]
                    .filter((h) => h.장부금액 !== 0)
                    .sort((a, b) => {
                      const orderA = commodityOrder.get(a.상품명) ?? 999999
                    const orderB = commodityOrder.get(b.상품명) ?? 999999
                    if (orderA !== orderB) return orderA - orderB
                    return (a.계좌 || '').localeCompare(b.계좌 || '')
                  })

                  return sortedData.map((h, i) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-4 font-sans font-semibold text-slate-200">{h.자산군}</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">{h.세부자산군 || '-'}</td>
                      <td className="py-2.5 px-4 font-sans text-slate-400">{h.세부자산군2 || '-'}</td>
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-100 max-w-[200px] truncate" title={h.상품명}>
                        {h.상품명}
                      </td>
                      <td className="py-2.5 px-4 text-right font-semibold text-slate-100">{formatKRW(h.평가금액)}</td>
                      <td
                        className={`py-2.5 px-4 text-right font-semibold ${
                          (h.평가손익 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatKRW(h.평가손익)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-bold ${
                          (h.평가수익률 || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {formatPercent(h.평가수익률)}
                      </td>
                      <td className="py-2.5 px-4 font-sans text-slate-300">{h.계좌}</td>
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
