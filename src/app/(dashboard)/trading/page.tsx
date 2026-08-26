'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Tabs, TabItem } from '@/components/ui/tabs'
import AssetSettings from './AssetSettings'
import GroupSettings from './GroupSettings'
import { getTickers, getTradeHistory, getCategories, addTrade, updateTrade, deleteTrade } from '@/lib/actions/db'
import { formatKRW } from '@/lib/utils'
import { toast } from 'sonner'
import { subMonths, format } from 'date-fns'
import {
  Receipt,
  Tag,
  ListFilter,
  PlusCircle,
  Edit2,
  Trash2,
  Calendar,
  Layers,
} from 'lucide-react'

const TABS: TabItem[] = [
  { id: 'history', label: '거래내역', icon: Receipt },
  { id: 'asset', label: '투자종목 관리', icon: Tag },
  { id: 'group', label: '구분항목 관리', icon: Tag },
  { id: 'total', label: '종합거래내역', icon: ListFilter },
]

export default function TradingPage() {
  const [activeTab, setActiveTab] = useState('history')
  const queryClient = useQueryClient()

  // 1. 거래내역 입력 폼 상태
  const [tradeType, setTradeType] = useState<'투자자산' | '연금자산'>('투자자산')
  const [account, setAccount] = useState('한투')
  const [currency, setCurrency] = useState('원화')
  const [tradeDate, setTradeDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedTicker, setSelectedTicker] = useState('')
  const [buyQ, setBuyQ] = useState(0)
  const [buyAmt, setBuyAmt] = useState(0)
  const [buyCash, setBuyCash] = useState(0)
  const [sellQ, setSellQ] = useState(0)
  const [sellPrincipal, setSellPrincipal] = useState(0)
  const [sellAmt, setSellAmt] = useState(0)
  const [dividend, setDividend] = useState(0)
  const [cashIn, setCashIn] = useState(0)
  const [inOut, setInOut] = useState(0)
  const [limitCount, setLimitCount] = useState(30)
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null)
  
  const setEditMode = (r: any) => {
    setSelectedRowId(r.행번호)
    setTradeDate(r.거래일자?.substring(0, 10))
    setBuyQ(r.매입수량 || 0)
    setBuyAmt(r.매입액 || 0)
    setBuyCash(r.현금지출 || 0)
    setSellQ(r.매도수량 || 0)
    setSellPrincipal(r.매도원금 || 0)
    setSellAmt(r.매도액 || 0)
    setDividend(r.이자배당액 || 0)
    setCashIn(r.현금수입 || 0)
    setInOut(r.입출금 || 0)
    
    // Select ticker by code. It relies on tickersData containing the ticker.
    setSelectedTicker(r.종목코드)
    setAccount(r.계좌)
    setCurrency(r.통화)
  }

  // 종합거래내역 기간 필터 상태
  const [totalStartDate, setTotalStartDate] = useState(format(subMonths(new Date(), 6), 'yyyy-MM-dd'))
  const [totalEndDate, setTotalEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [totalAssetClass, setTotalAssetClass] = useState('전체')

  // 2. 종목 마스터 쿼리
  const { data: tickersData } = useQuery({
    queryKey: ['tickers-list', tradeType],
    queryFn: async () => {
      return await getTickers(tradeType)
    },
  })

  // 3. 일별 거래내역 쿼리
  const { data: tradeHistory, isLoading } = useQuery({
    queryKey: ['trade-history', tradeType, account, currency, limitCount],
    queryFn: async () => {
      return await getTradeHistory(tradeType, account, currency, limitCount)
    },
  })

  // 4. 카테고리 쿼리
  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => {
      return await getCategories()
    },
  })

  // 5. 종합거래내역 API 쿼리 (단가 및 계층분류 집계)
  const { data: totalTradesData, isLoading: isLoadingTotal } = useQuery({
    queryKey: ['total-trades', totalStartDate, totalEndDate, totalAssetClass],
    queryFn: async () => {
      const res = await fetch(
        `/api/portfolio/analytics/trading?startDate=${totalStartDate}&endDate=${totalEndDate}&assetClass=${totalAssetClass}`
      )
      if (!res.ok) throw new Error('종합거래내역 조회 실패')
      const json = await res.json()
      return (json?.totalTrades || []) as any[]
    },
    enabled: activeTab === 'total',
  })

  // 거래내역 추가 Mutation
  const addTradeMutation = useMutation({
    mutationFn: async () => {
      const newRecord = {
        계좌: account,
        종목코드: selectedTicker,
        거래일자: tradeDate,
        매입수량: buyQ,
        매입액: buyAmt,
        현금지출: buyCash,
        매도수량: sellQ,
        매도원금: sellPrincipal,
        매도액: sellAmt,
        이자배당액: dividend,
        현금수입: cashIn,
        입출금: inOut,
      }
      await addTrade(tradeType, newRecord)
    },
    onSuccess: () => {
      toast.success('거래내역이 추가되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['trade-history'] })
      queryClient.invalidateQueries({ queryKey: ['total-trades'] })
      // 폼 리셋
      setBuyQ(0)
      setBuyAmt(0)
      setBuyCash(0)
      setSellQ(0)
      setSellPrincipal(0)
      setSellAmt(0)
      setDividend(0)
      setCashIn(0)
      setInOut(0)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '추가 실패'
      toast.error(`추가 오류: ${msg}`)
    },
  })

  // 거래내역 삭제 Mutation
  
  const updateTradeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRowId) return
      const updateRecord = {
        계좌: account,
        종목코드: selectedTicker,
        거래일자: tradeDate,
        매입수량: buyQ,
        매입액: buyAmt,
        현금지출: buyCash,
        매도수량: sellQ,
        매도원금: sellPrincipal,
        매도액: sellAmt,
        이자배당액: dividend,
        현금수입: cashIn,
        입출금: inOut,
      }
      await updateTrade(tradeType, selectedRowId, updateRecord)
    },
    onSuccess: () => {
      toast.success('거래내역이 수정되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['trade-history'] })
      queryClient.invalidateQueries({ queryKey: ['total-trades'] })
      setSelectedRowId(null)
      setBuyQ(0); setBuyAmt(0); setBuyCash(0); setSellQ(0); setSellPrincipal(0); setSellAmt(0); setDividend(0); setCashIn(0); setInOut(0);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '수정 실패'
      toast.error(`수정 오류: ${msg}`)
    },
  })

const deleteTradeMutation = useMutation({
    mutationFn: async (id: number) => {
      await deleteTrade(tradeType, id)
    },
    onSuccess: () => {
      toast.success('거래내역이 삭제되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['trade-history'] })
      queryClient.invalidateQueries({ queryKey: ['total-trades'] })
      setSelectedRowId(null)
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '삭제 실패'
      toast.error(`삭제 오류: ${msg}`)
    },
  })

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* 탭 1: 거래내역 기록 */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* 입력 카드 */}
          <Card>
            <CardHeader title="거래내역 입력" subtitle="신규 거래 등록, 수정 및 삭제" />
            <CardBody>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">운용구분</label>
                  <select
                    value={tradeType}
                    onChange={(e) => setTradeType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    <option value="투자자산">투자자산</option>
                    <option value="연금자산">연금자산</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">계좌</label>
                  <select
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    <option value="한투">한투</option>
                    <option value="불리오">불리오</option>
                    <option value="한투ISA">한투ISA</option>
                    <option value="엔투ISA">엔투ISA</option>
                    <option value="엔투저축연금">엔투저축연금</option>
                    <option value="한투연금저축">한투연금저축</option>
                    <option value="미래DC">미래DC</option>
                    <option value="농협IRP">농협IRP</option>
                    <option value="엔투IRP">엔투IRP</option>
                    <option value="금현물">금현물</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">통화</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    <option value="원화">원화</option>
                    <option value="달러">달러</option>
                    <option value="엔화">엔화</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">거래일자</label>
                  <input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-slate-400 font-medium block mb-1">종목명</label>
                  <select
                    value={selectedTicker}
                    onChange={(e) => setSelectedTicker(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    <option value="">종목을 선택하세요</option>
                    {(tickersData || [])
                      .filter((t) => t.계좌 === account)
                      .map((t) => (
                        <option key={t.종목코드} value={t.종목코드}>
                          {t.종목명} ({t.종목코드})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">매입수량</label>
                  <input
                    type="number"
                    value={buyQ || ''}
                    onChange={(e) => setBuyQ(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">매입액</label>
                  <input
                    type="number"
                    value={buyAmt || ''}
                    onChange={(e) => setBuyAmt(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">현금지출</label>
                  <input
                    type="number"
                    value={buyCash || ''}
                    onChange={(e) => setBuyCash(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">매도수량</label>
                  <input
                    type="number"
                    value={sellQ || ''}
                    onChange={(e) => setSellQ(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">매도원금</label>
                  <input
                    type="number"
                    value={sellPrincipal || ''}
                    onChange={(e) => setSellPrincipal(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">매도액</label>
                  <input
                    type="number"
                    value={sellAmt || ''}
                    onChange={(e) => setSellAmt(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">이자배당액</label>
                  <input
                    type="number"
                    value={dividend || ''}
                    onChange={(e) => setDividend(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">현금수입</label>
                  <input
                    type="number"
                    value={cashIn || ''}
                    onChange={(e) => setCashIn(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">입출금</label>
                  <input
                    type="number"
                    value={inOut || ''}
                    onChange={(e) => setInOut(parseFloat(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">조회건수</label>
                  <input
                    type="number"
                    value={limitCount}
                    onChange={(e) => setLimitCount(parseInt(e.target.value) || 30)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
                  />
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex items-center justify-center gap-3 mt-5 pt-4 border-t border-slate-800">
    {selectedRowId ? (
      <>
        <button
          onClick={() => updateTradeMutation.mutate()}
          disabled={!selectedTicker || updateTradeMutation.isPending}
          className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition disabled:opacity-50"
        >
          <Edit2 className="w-4 h-4" />
          수정 저장 (No.{selectedRowId})
        </button>
        <button
          onClick={() => {
            setSelectedRowId(null)
            setBuyQ(0); setBuyAmt(0); setBuyCash(0); setSellQ(0); setSellPrincipal(0); setSellAmt(0); setDividend(0); setCashIn(0); setInOut(0);
          }}
          className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-slate-700 hover:bg-slate-600 active:scale-95 text-white transition"
        >
          취소
        </button>
      </>
    ) : (
      <button
        onClick={() => addTradeMutation.mutate()}
        disabled={!selectedTicker || addTradeMutation.isPending}
        className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white transition disabled:opacity-50"
      >
        <PlusCircle className="w-4 h-4" />
        거래 추가
      </button>
    )}
  </div>
            </CardBody>
          </Card>

          {/* 내역 테이블 */}
          <Card>
            <CardHeader title={`최근 거래내역 (${account} / ${tradeType})`} subtitle="행을 클릭하여 삭제 대상을 선택할 수 있습니다" />
            <CardBody className="p-0 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-3 px-3 text-center">행번호</th>
  <th className="py-3 px-3">계좌</th>
  <th className="py-3 px-3">거래일자</th>
  <th className="py-3 px-3">종목명</th>
  <th className="py-3 px-3 text-right">매입수량</th>
  <th className="py-3 px-3 text-right">매입액</th>
  <th className="py-3 px-3 text-right">현금지출</th>
  <th className="py-3 px-3 text-right text-rose-300">매입비용</th>
  <th className="py-3 px-3 text-right">매도수량</th>
  <th className="py-3 px-3 text-right">매도원금</th>
  <th className="py-3 px-3 text-right">매도액</th>
  <th className="py-3 px-3 text-right text-emerald-300">매매수익</th>
  <th className="py-3 px-3 text-right">이자배당액</th>
  <th className="py-3 px-3 text-right">현금수입</th>
  <th className="py-3 px-3 text-right text-rose-300">매도비용</th>
  <th className="py-3 px-3 text-right font-bold text-emerald-400">순수익</th>
  <th className="py-3 px-3 text-right">입출금</th>
  <th className="py-3 px-3 text-right font-bold text-slate-200">잔액</th>
  <th className="py-3 px-3 text-center">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(tradeHistory || []).map((r: any) => {
                    const isSelected = selectedRowId === r.행번호
                    return (
                      <tr
                        key={r.행번호}
                        
                        className={`cursor-pointer transition ${
                          isSelected ? 'bg-emerald-500/20 border-l-4 border-l-emerald-500' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center text-slate-500">{r.행번호}</td>
  <td className="py-2.5 px-3 text-slate-400">{r.계좌}</td>
  <td className="py-2.5 px-3 text-slate-200 font-sans">{r.거래일자?.substring(0, 10)}</td>
  <td className="py-2.5 px-3 font-medium text-emerald-400">{r.종목명}</td>
  <td className="py-2.5 px-3 text-right">{r.매입수량}</td>
  <td className="py-2.5 px-3 text-right">{formatKRW(r.매입액)}</td>
  <td className="py-2.5 px-3 text-right">{formatKRW(r.현금지출)}</td>
  <td className="py-2.5 px-3 text-right text-rose-300">{formatKRW(r.매입비용)}</td>
  <td className="py-2.5 px-3 text-right">{r.매도수량}</td>
  <td className="py-2.5 px-3 text-right">{formatKRW(r.매도원금)}</td>
  <td className="py-2.5 px-3 text-right">{formatKRW(r.매도액)}</td>
  <td className="py-2.5 px-3 text-right text-emerald-300">{formatKRW(r.매매수익)}</td>
  <td className="py-2.5 px-3 text-right">{formatKRW(r.이자배당액)}</td>
  <td className="py-2.5 px-3 text-right">{formatKRW(r.현금수입)}</td>
  <td className="py-2.5 px-3 text-right text-rose-300">{formatKRW(r.매도비용)}</td>
  <td className="py-2.5 px-3 text-right font-bold text-emerald-400">{formatKRW(r.순수익)}</td>
  <td className="py-2.5 px-3 text-right">{formatKRW(r.입출금)}</td>
  <td className="py-2.5 px-3 text-right font-bold text-slate-200">{formatKRW(r.잔액)}</td>
  <td className="py-2.5 px-3 text-center">
    <div className="flex items-center justify-center gap-2">
      <button 
        onClick={(e) => { e.stopPropagation(); setEditMode(r); }}
        className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-emerald-600/20 hover:text-emerald-400 transition"
        title="수정"
      >
        <Edit2 className="w-4 h-4" />
      </button>
      <button 
        onClick={(e) => { e.stopPropagation(); if(confirm('삭제하시겠습니까?')) deleteTradeMutation.mutate(r.행번호); }}
        className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-rose-600/20 hover:text-rose-400 transition"
        title="삭제"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
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

      {/* 탭 4: 종합거래내역 (단가 연산 및 기간별 전체 거래 집계) */}
      {/* 탭2: 투자종목 관리 */}
      {activeTab === 'asset' && <AssetSettings />}

      {/* 탭3: 구분항목 관리 */}
      {activeTab === 'group' && <GroupSettings />}

      {activeTab === 'total' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300 font-medium">조회 기간:</span>
                <input
                  type="date"
                  value={totalStartDate}
                  onChange={(e) => setTotalStartDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                />
                <span className="text-slate-500">~</span>
                <input
                  type="date"
                  value={totalEndDate}
                  onChange={(e) => setTotalEndDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200"
                />
              </div>
              <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
                <span className="text-slate-300 font-medium">자산 구분:</span>
                <select
                  value={totalAssetClass}
                  onChange={(e) => setTotalAssetClass(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 min-w-[120px]"
                >
                  {['전체', '주식', '대체자산', '채권', '현금성'].map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-1.5">
              <button
                onClick={() => setTotalStartDate(format(subMonths(new Date(), 1), 'yyyy-MM-dd'))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300"
              >
                1M
              </button>
              <button
                onClick={() => setTotalStartDate(format(subMonths(new Date(), 3), 'yyyy-MM-dd'))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300"
              >
                3M
              </button>
              <button
                onClick={() => setTotalStartDate(format(subMonths(new Date(), 6), 'yyyy-MM-dd'))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300"
              >
                6M
              </button>
              <button
                onClick={() => setTotalStartDate(format(subMonths(new Date(), 12), 'yyyy-MM-dd'))}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300"
              >
                1Y
              </button>
            </div>
          </div>

          <Card>
            <CardHeader
              title="기간별 종합거래내역"
              subtitle="자산군 분류 및 매입/매도 단가가 계산된 종합 거래 명세"
            />
            <CardBody className="p-0 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-3 px-3">자산군</th>
                    <th className="py-3 px-3">세부자산군</th>
                    <th className="py-3 px-3">통화</th>
                    <th className="py-3 px-3">거래일자</th>
                    <th className="py-3 px-3">계좌</th>
                    <th className="py-3 px-3">상품명</th>
                    <th className="py-3 px-3 text-right">매입수량</th>
                    <th className="py-3 px-3 text-right">매입단가</th>
                    <th className="py-3 px-3 text-right">매입액</th>
                    <th className="py-3 px-3 text-right">매도수량</th>
                    <th className="py-3 px-3 text-right">매도단가</th>
                    <th className="py-3 px-3 text-right font-bold text-slate-200">매도액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(totalTradesData || []).map((t: any, i: number) => {
                    const isTotalRow = t.상품명 === '합계'
                    return (
                      <tr
                        key={i}
                        className={`hover:bg-slate-800/40 transition ${
                          isTotalRow ? 'bg-slate-900/80 font-bold text-emerald-400' : ''
                        }`}
                      >
                        <td className="py-2 px-3 font-sans font-semibold text-slate-200">{t.자산군}</td>
                        <td className="py-2 px-3 font-sans text-slate-400">{t.세부자산군 || '-'}</td>
                        <td className="py-2 px-3 font-sans text-slate-400">{t.통화}</td>
                        <td className="py-2 px-3 font-sans text-slate-300">{t.거래일자}</td>
                        <td className="py-2 px-3 font-sans text-slate-200">{t.계좌}</td>
                        <td className="py-2 px-3 font-sans font-medium text-slate-100 max-w-[160px] truncate" title={t.상품명}>
                          {t.상품명}
                        </td>
                        <td className="py-2 px-3 text-right">{t.매입수량 === 0 ? '-' : formatKRW(t.매입수량)}</td>
                        <td className="py-2 px-3 text-right">{t.매입단가 === 0 ? '-' : formatKRW(t.매입단가)}</td>
                        <td className="py-2 px-3 text-right text-emerald-400">{formatKRW(t.매입액)}</td>
                        <td className="py-2 px-3 text-right">{t.매도수량 === 0 ? '-' : formatKRW(t.매도수량)}</td>
                        <td className="py-2 px-3 text-right">{t.매도단가 === 0 ? '-' : formatKRW(t.매도단가)}</td>
                        <td className="py-2 px-3 text-right text-rose-400 font-medium">{formatKRW(t.매도액)}</td>
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
