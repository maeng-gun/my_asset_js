'use client'

import { useHoldingsTabStore } from '@/lib/stores/navigation-state'
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
  Globe,
} from 'lucide-react'
import { LatestPortfolioSummary, ALLOCATION_ACCOUNTS } from '@/lib/engine/types'

const TABS: TabItem[] = [
  { id: 'allocation', label: '계좌별 자산배분', icon: Grid },
  { id: 'commodity1', label: '상품별 보유현황1', icon: Layers },
  { id: 'commodity2', label: '상품별 보유현황2', icon: Coins },
  { id: 'commodity3', label: '상품별 보유현황3', icon: Clipboard },
  { id: 'foreign', label: '외화자산 (외화기준)', icon: Globe },
]

export default function HoldingsPage() {
  const [activeTab, setActiveTab] = useHoldingsTabStore()
  // 1. 최신 포트폴리오 스냅샷 쿼리 (0.01초 로드)
  const { data: summary } = useQuery({
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
          <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
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
                {(summary?.account_allocation || []).map((row, i) => {
                  const isTotal = row.자산군 === '<합계>'
                  const isSubtotal = !isTotal && (!row.세부자산군 || row.세부자산군 === '')

                  return (
                    <tr
                      key={i}
                      className={`hover:bg-slate-800/40 transition ${
                        isTotal
                          ? 'bg-slate-900/80 font-bold border-t-2 border-slate-700 text-slate-100'
                          : isSubtotal
                          ? 'bg-slate-900/40 font-semibold text-slate-200'
                          : 'text-slate-300'
                      }`}
                    >
                      <td className="py-2 px-3 font-sans font-semibold text-slate-200">
                        {row.자산군}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-400">
                        {row.세부자산군 || '-'}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-400">
                        {row.세부자산군2 || '-'}
                      </td>

                      {ALLOCATION_ACCOUNTS.map((acct) => {
                        const val = (row as unknown as Record<string, number>)[acct] || 0
                        return (
                          <td
                            key={acct}
                            className={`py-2 px-2 text-right ${
                              val === 0 ? 'text-slate-600' : ''
                            }`}
                          >
                            {val === 0 ? '-' : formatKRW(val)}
                          </td>
                        )
                      })}

                      <td
                        className={`py-2 px-3 text-right font-bold border-l border-slate-800 ${
                          isTotal ? 'text-emerald-400' : 'text-slate-100 bg-slate-900/30'
                        }`}
                      >
                        {formatKRW(row.합계)}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-bold ${
                          isTotal ? 'text-emerald-400' : 'text-emerald-400/80'
                        }`}
                      >
                        {formatPercent(row.비중)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      {/* 탭 2: 상품별 보유현황 1 (전체 통합 계층형) */}
      {activeTab === 'commodity1' && (
        <Card>
          <CardHeader
            title="상품별 보유현황 1"
            subtitle="자산군 및 상품별 수량, 장부금액, 평가금액 및 손익 집계"
          />
          <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-3">자산군</th>
                  <th className="py-3 px-3">세부자산군</th>
                  <th className="py-3 px-3">세부자산군2</th>
                  <th className="py-3 px-3">상품명</th>
                  <th className="py-3 px-3 text-right">보유수량</th>
                  <th className="py-3 px-3 text-right">평단가</th>
                  <th className="py-3 px-3 text-right">현재가</th>
                  <th className="py-3 px-3 text-right">장부금액</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-200">
                    평가금액
                  </th>
                  <th className="py-3 px-3 text-right font-bold">평가손익</th>
                  <th className="py-3 px-3 text-right font-bold">수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(summary?.t_comm || []).map((h, i) => {
                  const isTotal = h.자산군 === '<합계>'
                  const isSubtotal =
                    !isTotal && (!h.상품명 || h.상품명 === '')

                  return (
                    <tr
                      key={i}
                      className={`hover:bg-slate-800/40 transition ${
                        isTotal
                          ? 'bg-slate-900/80 font-bold border-t-2 border-slate-700 text-slate-100'
                          : isSubtotal
                          ? 'bg-slate-900/40 font-semibold text-slate-200'
                          : 'text-slate-300'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">
                        {h.자산군}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">
                        {h.세부자산군 || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">
                        {h.세부자산군2 || '-'}
                      </td>
                      <td
                        className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-[200px] truncate"
                        title={h.상품명}
                      >
                        {h.상품명 || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {h.보유수량 ? formatKRW(h.보유수량) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {h.평단가 ? formatKRW(h.평단가) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {h.현재가 ? formatKRW(h.현재가) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatKRW(h.장부금액)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-100">
                        {formatKRW(h.평가금액)}
                      </td>
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

      {/* 탭 3: 상품별 보유현황 2 (계좌별 그룹화 및 계좌 소계 행 포함) */}
      {activeTab === 'commodity2' && (
        <Card>
          <CardHeader
            title="상품별 보유현황 2 (계좌별 상세)"
            subtitle="각 계좌별 보유 종목의 단가, 장부금액 및 손익 집계"
          />
          <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                  <th className="py-3 px-3">계좌</th>
                  <th className="py-3 px-3">통화</th>
                  <th className="py-3 px-3">자산군</th>
                  <th className="py-3 px-3">종목코드</th>
                  <th className="py-3 px-3">종목명</th>
                  <th className="py-3 px-3 text-right">보유수량</th>
                  <th className="py-3 px-3 text-right">평단가</th>
                  <th className="py-3 px-3 text-right">현재가</th>
                  <th className="py-3 px-3 text-right">장부금액</th>
                  <th className="py-3 px-3 text-right font-bold text-slate-200">
                    평가금액
                  </th>
                  <th className="py-3 px-3 text-right font-bold">평가손익</th>
                  <th className="py-3 px-3 text-right font-bold">수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {(summary?.t_comm2 || []).map((h, i) => {
                  const isAccountSubtotal = !h.종목코드 || h.종목코드 === ''
                  const avgPrice = h.보유수량 > 0 ? Math.round(h.장부금액 / h.보유수량) : 0
                  const curPrice = h.보유수량 > 0 ? Math.round((h.평가금액 || 0) / h.보유수량) : 0

                  return (
                    <tr
                      key={i}
                      className={`hover:bg-slate-800/40 transition ${
                        isAccountSubtotal
                          ? 'bg-slate-900/60 font-bold text-slate-100 border-t border-slate-700/80'
                          : 'text-slate-300'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">
                        {h.계좌}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">
                        {h.통화 || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-400">
                        {h.자산군 || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        {h.종목코드 || '-'}
                      </td>
                      <td
                        className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-[200px] truncate"
                        title={h.상품명 || h.종목명}
                      >
                        {h.상품명 || h.종목명 || (isAccountSubtotal ? `<${h.계좌} 소계>` : '-')}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {h.보유수량 ? formatKRW(h.보유수량) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {avgPrice ? formatKRW(avgPrice) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {curPrice ? formatKRW(curPrice) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {formatKRW(h.장부금액)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-100">
                        {formatKRW(h.평가금액 || 0)}
                      </td>
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
          <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
            <table className="w-full text-xs sm:text-sm text-left border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
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

      {/* 탭 5: 외화자산 보유현황 (외화기준) */}
      {activeTab === 'foreign' && (
        <div className="space-y-6">
          {/* 통화별 서머리 카드 */}
          {(() => {
            const list = summary?.t_ovs_comm || []
            const usdList = list.filter((r) => r.통화 === '달러')
            const jpyList = list.filter((r) => r.통화 === '엔화')

            const usdBook = usdList.reduce((acc, r) => acc + (r.외화장부금액 || 0), 0)
            const usdEval = usdList.reduce((acc, r) => acc + (r.외화평가금액 || 0), 0)
            const usdProfit = usdEval - usdBook
            const usdYield = usdBook > 0 ? Number(((usdProfit / usdBook) * 100).toFixed(2)) : 0

            const jpyBook = jpyList.reduce((acc, r) => acc + (r.외화장부금액 || 0), 0)
            const jpyEval = jpyList.reduce((acc, r) => acc + (r.외화평가금액 || 0), 0)
            const jpyProfit = jpyEval - jpyBook
            const jpyYield = jpyBook > 0 ? Number(((jpyProfit / jpyBook) * 100).toFixed(2)) : 0

            const wonBook = list.reduce((acc, r) => acc + (r.원화환산장부금액 || 0), 0)
            const wonEval = list.reduce((acc, r) => acc + (r.원화환산평가금액 || 0), 0)
            const wonProfit = wonEval - wonBook
            const wonYield = wonBook > 0 ? Number(((wonProfit / wonBook) * 100).toFixed(2)) : 0

            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardBody className="p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="font-semibold text-sky-400">USD 달러 자산 합계</span>
                      <span>{usdList.length}개 종목</span>
                    </div>
                    <div className="text-xl font-bold font-mono text-slate-100 mb-2">
                      ${usdEval.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800 font-mono">
                      <span className="text-slate-400">
                        장부: ${usdBook.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className={usdProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {usdProfit >= 0 ? '+' : ''}${usdProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({usdYield}%)
                      </span>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="font-semibold text-amber-400">JPY 엔화 자산 합계</span>
                      <span>{jpyList.length}개 종목</span>
                    </div>
                    <div className="text-xl font-bold font-mono text-slate-100 mb-2">
                      ¥{jpyEval.toLocaleString()}
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800 font-mono">
                      <span className="text-slate-400">장부: ¥{jpyBook.toLocaleString()}</span>
                      <span className={jpyProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {jpyProfit >= 0 ? '+' : ''}¥{jpyProfit.toLocaleString()} ({jpyYield}%)
                      </span>
                    </div>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody className="p-4">
                    <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                      <span className="font-semibold text-emerald-400">원화환산 통합 평가금액</span>
                      <span>총 {list.length}개 종목</span>
                    </div>
                    <div className="text-xl font-bold font-mono text-emerald-400 mb-2">
                      {formatKRW(wonEval)}
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800 font-mono">
                      <span className="text-slate-400">원화 장부: {formatKRW(wonBook)}</span>
                      <span className={wonProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {wonProfit >= 0 ? '+' : ''}{formatKRW(wonProfit)} ({wonYield}%)
                      </span>
                    </div>
                  </CardBody>
                </Card>
              </div>
            )
          })()}

          {/* 외화자산 상세 보유 테이블 */}
          <Card>
            <CardHeader
              title="외화표시 자산 보유 명세 (외화기준)"
              subtitle="외화 고유 매입단가, 외화 현재가, 외화 손익 및 원화환산 평가내역"
            />
            <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                    <th className="py-3 px-3">계좌</th>
                    <th className="py-3 px-3">통화</th>
                    <th className="py-3 px-3">종목명</th>
                    <th className="py-3 px-3 text-right">보유수량</th>
                    <th className="py-3 px-3 text-right">외화 매입단가</th>
                    <th className="py-3 px-3 text-right">외화 현재가</th>
                    <th className="py-3 px-3 text-right text-slate-300">외화 장부금액</th>
                    <th className="py-3 px-3 text-right text-sky-400 font-semibold">외화 평가금액</th>
                    <th className="py-3 px-3 text-right">외화 평가손익</th>
                    <th className="py-3 px-3 text-right">외화 수익률</th>
                    <th className="py-3 px-3 text-right text-slate-400">적용 환율</th>
                    <th className="py-3 px-3 text-right text-emerald-400 font-bold">원화환산 평가액</th>
                    <th className="py-3 px-3 text-right font-semibold">원화 평가손익</th>
                    <th className="py-3 px-3 text-right font-bold">원화 수익률</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(summary?.t_ovs_comm || []).map((r, i) => {
                    const isUsd = r.통화 === '달러'
                    const fmtNative = (num?: number) => {
                      if (num === undefined || num === null) return '-'
                      return isUsd
                        ? '$' + Number(num).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '¥' + Number(num).toLocaleString()
                    }
                    const fxProfit = r.외화평가손익 || 0
                    const wonProfit = r.원화환산평가손익 || 0

                    return (
                      <tr key={i} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 font-sans font-semibold text-slate-200">{r.계좌}</td>
                        <td className="py-2.5 px-3 font-sans text-sky-400">{r.통화}</td>
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-100 max-w-[180px] truncate" title={r.상품명 || r.종목명}>
                          {r.상품명 || r.종목명}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {r.자산군 === '현금성' ? '-' : (r.보유수량 ? Number(r.보유수량).toLocaleString(undefined, { maximumFractionDigits: 4 }) : '-')}
                        </td>
                        <td className="py-2.5 px-3 text-right">{r.자산군 === '현금성' ? '-' : fmtNative(r.외화매입단가)}</td>
                        <td className="py-2.5 px-3 text-right">{r.자산군 === '현금성' ? '-' : fmtNative(r.외화현재가)}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">{fmtNative(r.외화장부금액)}</td>
                        <td className="py-2.5 px-3 text-right font-semibold text-sky-300">{fmtNative(r.외화평가금액)}</td>
                        <td className={`py-2.5 px-3 text-right font-semibold ${fxProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {fmtNative(fxProfit)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold ${r.외화수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatPercent(r.외화수익률)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-300">
                          {r.현재환율 ? Number(r.현재환율).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                          {formatKRW(r.원화환산평가금액)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-semibold ${wonProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatKRW(wonProfit)}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-bold ${r.원화수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {formatPercent(r.원화수익률)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
