'use client'

import { useEffect, useMemo } from 'react'
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
} from 'lucide-react'
import { ACCOUNT_ORDER } from '@/lib/engine/types'
import {
  useTradingFormStore,
  useTradingFiltersStore,
  useTradingTabStore,
  resetTradingForm,
} from '@/lib/stores/navigation-state'

const TABS: TabItem[] = [
  { id: 'history', label: '거래내역', icon: Receipt },
  { id: 'asset', label: '투자종목 관리', icon: Tag },
  { id: 'group', label: '구분항목 관리', icon: Tag },
  { id: 'total', label: '종합거래내역', icon: ListFilter },
]

export default function TradingPage() {
  const [activeTab, setActiveTab] = useTradingTabStore()
  const queryClient = useQueryClient()

  // 1. 거래내역 입력 폼 상태 (navigation-state store 연동)
  const [tradingForm, setTradingForm] = useTradingFormStore()
  const {
    tradeType,
    account,
    currency,
    tradeDate,
    selectedTicker,
    fxRate,
    autoLinkWonCash,
    buyQ,
    buyAmt,
    buyCash,
    sellQ,
    sellPrincipal,
    sellAmt,
    dividend,
    cashIn,
    inOut,
    limitCount,
    selectedRowId,
  } = tradingForm

  const setTradeType = (val: '투자자산' | '연금자산') => setTradingForm({ tradeType: val })
  const setAccount = (val: string) => setTradingForm({ account: val })
  const setCurrency = (val: string) => setTradingForm({ currency: val })
  const setTradeDate = (val: string) => setTradingForm({ tradeDate: val })
  const setSelectedTicker = (val: string) => setTradingForm({ selectedTicker: val })
  const setFxRate = (val: number | string) => setTradingForm({ fxRate: val })
  const setAutoLinkWonCash = (val: boolean) => setTradingForm({ autoLinkWonCash: val })
  const setBuyQ = (val: number) => setTradingForm({ buyQ: val })
  const setBuyAmt = (val: number) => setTradingForm({ buyAmt: val })
  const setBuyCash = (val: number) => setTradingForm({ buyCash: val })
  const setSellQ = (val: number) => setTradingForm({ sellQ: val })
  const setSellPrincipal = (val: number) => setTradingForm({ sellPrincipal: val })
  const setSellAmt = (val: number) => setTradingForm({ sellAmt: val })
  const setDividend = (val: number) => setTradingForm({ dividend: val })
  const setCashIn = (val: number) => setTradingForm({ cashIn: val })
  const setInOut = (val: number) => setTradingForm({ inOut: val })
  const setLimitCount = (val: number) => setTradingForm({ limitCount: val })

  const setEditMode = (r: any) => {
    setTradingForm({
      selectedRowId: r.행번호,
      tradeDate: r.거래일자?.substring(0, 10),
      buyQ: r.매입수량 || 0,
      buyAmt: r.매입액 || 0,
      buyCash: r.현금지출 || 0,
      sellQ: r.매도수량 || 0,
      sellPrincipal: r.매도원금 || 0,
      sellAmt: r.매도액 || 0,
      dividend: r.이자배당액 || 0,
      cashIn: r.현금수입 || 0,
      inOut: r.입출금 || 0,
      selectedTicker: r.종목코드,
      account: r.계좌,
      currency: r.통화,
      fxRate: r.환율 !== undefined && r.환율 !== null ? r.환율 : (r.통화 === '원화' ? 1 : ''),
      autoLinkWonCash: false,
    })
  }

  // 종합거래내역 기간 필터 및 캐스케이딩 필터 상태
  const [tradingFilters, setTradingFilters] = useTradingFiltersStore()
  const {
    totalStartDate,
    totalEndDate,
    selAssetClass,
    selAssetClass1,
    selAssetClass2,
    selAccount,
    selProductName,
  } = tradingFilters

  const setTotalStartDate = (val: string) => setTradingFilters({ totalStartDate: val })
  const setTotalEndDate = (val: string) => setTradingFilters({ totalEndDate: val })
  const setSelAssetClass = (val: string) => setTradingFilters({ selAssetClass: val })
  const setSelAssetClass1 = (val: string) => setTradingFilters({ selAssetClass1: val })
  const setSelAssetClass2 = (val: string) => setTradingFilters({ selAssetClass2: val })
  const setSelAccount = (val: string) => setTradingFilters({ selAccount: val })
  const setSelProductName = (val: string) => setTradingFilters({ selProductName: val })

  // 2. 종목 마스터 쿼리
  const { data: tickersData } = useQuery({
    queryKey: ['tickers-list'],
    queryFn: async () => {
      return await getTickers()
    },
  })

  // 3. 일별 거래내역 쿼리
  const { data: tradeHistory } = useQuery({
    queryKey: ['trade-history', account, currency, limitCount],
    queryFn: async () => {
      return await getTradeHistory('투자자산', account, currency, limitCount)
    },
  })

  // 4. 카테고리 쿼리
  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => {
      return await getCategories()
    },
  })

  // 계좌 변경 핸들러: 해당 계좌의 통화 목록과 즉시 동기화 및 폼 입력 상태 초기화
  const handleAccountChange = (newAccount: string) => {
    const accCurrencies = tickersData
      ? Array.from(new Set(tickersData.filter((t: any) => t.계좌 === newAccount && t.통화).map((t: any) => t.통화)))
      : ['원화']
    accCurrencies.sort((a: string, b: string) => (a === '원화' ? -1 : b === '원화' ? 1 : a.localeCompare(b)))

    const newCurrency = accCurrencies.includes(currency) ? currency : (accCurrencies[0] || '원화')

    setTradingForm({
      account: newAccount,
      currency: newCurrency,
      selectedTicker: '',
      selectedRowId: null,
      buyQ: 0,
      buyAmt: 0,
      buyCash: 0,
      sellQ: 0,
      sellPrincipal: 0,
      sellAmt: 0,
      dividend: 0,
      cashIn: 0,
      inOut: 0,
      fxRate: newCurrency === '원화' ? 1 : '',
      autoLinkWonCash: false,
    })
  }

  // 동적 계좌 목록 계산 (모든 계좌 포함)
  const availableAccounts = useMemo(() => {
    if (!categories) return []
    const accounts = categories
      .filter((c: any) => c.key === 'ass_account' || c.key === 'pen_account')
      .map((c: any) => c.value)
    const unique = Array.from(new Set(accounts))
    return unique.sort((a: string, b: string) => {
      const ia = ACCOUNT_ORDER.indexOf(a)
      const ib = ACCOUNT_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [categories])

  // 계좌 목록 로드 시 현재 계좌가 유효하지 않으면 첫 번째 항목 자동 선택
  useEffect(() => {
    if (availableAccounts.length > 0 && !availableAccounts.includes(account) && !selectedRowId) {
      handleAccountChange(availableAccounts[0])
    }
  }, [availableAccounts, account, selectedRowId])

  // 동적 통화 목록 계산 ('원화' 우선 정렬)
  const availableCurrencies = useMemo(() => {
    if (!tickersData) return []
    const currencies = tickersData
      .filter((t: any) => t.계좌 === account && t.통화)
      .map((t: any) => t.통화)
    const unique = Array.from(new Set(currencies))
    return unique.sort((a: string, b: string) => {
      if (a === '원화') return -1
      if (b === '원화') return 1
      return a.localeCompare(b)
    })
  }, [tickersData, account])

  // 통화 목록 변경 시 현재 통화가 유효하지 않으면 첫 번째 통화(원화 우선)로 자동 동기화
  useEffect(() => {
    if (availableCurrencies.length > 0 && !availableCurrencies.includes(currency)) {
      setCurrency(availableCurrencies[0])
    }
  }, [availableCurrencies, currency])

  // 5. 종합거래내역 API 쿼리
  const { data: totalTradesData } = useQuery({
    queryKey: ['total-trades', 'all'],
    queryFn: async () => {
      const res = await fetch(
        `/api/portfolio/analytics/trading?startDate=1900-01-01&endDate=2100-01-01`
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
      const parsedRate = fxRate !== '' && fxRate !== undefined && fxRate !== null ? Number(fxRate) : (currency === '원화' ? 1 : null)
      const newRecord = {
        계좌: account,
        종목코드: selectedTicker,
        거래일자: tradeDate,
        환율: parsedRate,
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
      await addTrade(tradeType, newRecord, { autoLinkWonCash: Boolean(autoLinkWonCash) })
    },
    onSuccess: () => {
      toast.success('거래내역이 추가되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['trade-history'] })
      queryClient.invalidateQueries({ queryKey: ['total-trades'] })
      queryClient.invalidateQueries({ queryKey: ['latest-portfolio-summary'] })
      queryClient.invalidateQueries({ queryKey: ['profit-return-data'] })
      queryClient.invalidateQueries({ queryKey: ['summary-return-trend'] })
      queryClient.invalidateQueries({ queryKey: ['liquidity-analytics'] })
      queryClient.invalidateQueries({ queryKey: ['asset-settings'] })
      resetTradingForm()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '추가 실패'
      toast.error(`추가 오류: ${msg}`)
    },
  })

  // 거래내역 수정 Mutation
  const updateTradeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRowId) return
      const parsedRate = fxRate !== '' && fxRate !== undefined && fxRate !== null ? Number(fxRate) : (currency === '원화' ? 1 : null)
      const updateRecord = {
        계좌: account,
        종목코드: selectedTicker,
        거래일자: tradeDate,
        환율: parsedRate,
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
      queryClient.invalidateQueries({ queryKey: ['latest-portfolio-summary'] })
      queryClient.invalidateQueries({ queryKey: ['profit-return-data'] })
      queryClient.invalidateQueries({ queryKey: ['summary-return-trend'] })
      queryClient.invalidateQueries({ queryKey: ['liquidity-analytics'] })
      queryClient.invalidateQueries({ queryKey: ['asset-settings'] })
      resetTradingForm()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '수정 실패'
      toast.error(`수정 오류: ${msg}`)
    },
  })

  // 거래내역 삭제 Mutation
  const deleteTradeMutation = useMutation({
    mutationFn: async (id: number) => {
      await deleteTrade(tradeType, id)
    },
    onSuccess: () => {
      toast.success('거래내역이 삭제되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['trade-history'] })
      queryClient.invalidateQueries({ queryKey: ['total-trades'] })
      queryClient.invalidateQueries({ queryKey: ['latest-portfolio-summary'] })
      queryClient.invalidateQueries({ queryKey: ['profit-return-data'] })
      queryClient.invalidateQueries({ queryKey: ['summary-return-trend'] })
      queryClient.invalidateQueries({ queryKey: ['liquidity-analytics'] })
      queryClient.invalidateQueries({ queryKey: ['asset-settings'] })
      resetTradingForm()
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '삭제 실패'
      toast.error(`삭제 오류: ${msg}`)
    },
  })

  // Client-side filtering and aggregation for Comprehensive Trades
  const processedData = useMemo(() => {
    if (!totalTradesData) return { filtered: [], totals: null, options: {} }

    const options = {
      assetClasses: ['전체', ...Array.from(new Set(totalTradesData.map((t: any) => t['자산군']).filter(Boolean)))],
      assetClasses1: ['전체', ...Array.from(new Set(totalTradesData
        .filter((t: any) => selAssetClass === '전체' || t['자산군'] === selAssetClass)
        .map((t: any) => t['세부자산군'])
        .filter(Boolean)))],
      assetClasses2: ['전체', ...Array.from(new Set(totalTradesData
        .filter((t: any) => 
          (selAssetClass === '전체' || t['자산군'] === selAssetClass) &&
          (selAssetClass1 === '전체' || t['세부자산군'] === selAssetClass1)
        )
        .map((t: any) => t['세부자산군2'])
        .filter(Boolean)))],
      accounts: ['전체', ...Array.from(new Set(totalTradesData
        .filter((t: any) => 
          (selAssetClass === '전체' || t['자산군'] === selAssetClass) &&
          (selAssetClass1 === '전체' || t['세부자산군'] === selAssetClass1) &&
          (selAssetClass2 === '전체' || t['세부자산군2'] === selAssetClass2)
        )
        .map((t: any) => t['계좌'])
        .filter(Boolean)))],
      products: ['전체', ...Array.from(new Set(totalTradesData
        .filter((t: any) => 
          (selAssetClass === '전체' || t['자산군'] === selAssetClass) &&
          (selAssetClass1 === '전체' || t['세부자산군'] === selAssetClass1) &&
          (selAssetClass2 === '전체' || t['세부자산군2'] === selAssetClass2) &&
          (selAccount === '전체' || t['계좌'] === selAccount)
        )
        .map((t: any) => t['상품명'])
        .filter(Boolean)))],
    }

    const filtered = totalTradesData
      .filter((t: any) => {
        const d = t['거래일자'] ? t['거래일자'].substring(0, 10) : ''
        if (totalStartDate && d < totalStartDate) return false
        if (totalEndDate && d > totalEndDate) return false
        if (selAssetClass !== '전체' && t['자산군'] !== selAssetClass) return false
        if (selAssetClass1 !== '전체' && t['세부자산군'] !== selAssetClass1) return false
        if (selAssetClass2 !== '전체' && t['세부자산군2'] !== selAssetClass2) return false
        if (selAccount !== '전체' && t['계좌'] !== selAccount) return false
        if (selProductName !== '전체' && t['상품명'] !== selProductName) return false
        return true
      })
      .sort((a: any, b: any) => {
        if (a['거래일자'] !== b['거래일자']) {
          return a['거래일자'] < b['거래일자'] ? 1 : -1
        }
        return (b['행번호'] || 0) - (a['행번호'] || 0)
      })

    const totals = filtered.reduce(
      (acc: any, cur: any) => {
        acc.매입액 += cur['매입액'] || 0
        acc.매도액 += cur['매도액'] || 0
        return acc
      },
      { 매입액: 0, 매도액: 0 }
    )

    return { filtered, totals, options }
  }, [
    totalTradesData,
    totalStartDate,
    totalEndDate,
    selAssetClass,
    selAssetClass1,
    selAssetClass2,
    selAccount,
    selProductName,
  ])

  return (
    <div className="space-y-6">
      {/* 탭 네비게이션 */}
      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {/* 탭 1: 거래내역 기록 */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* 입력 카드 */}
          <Card>
            <CardHeader title="거래내역 입력" subtitle="신규 거래 등록, 수정 및 삭제 (외화 거래 환율 입력 지원)" />
            <CardBody>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {/* 1st Row */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">계좌</label>
                  <select
                    value={account}
                    onChange={(e) => handleAccountChange(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    {availableAccounts.length > 0 ? (
                      availableAccounts.map((acc: string) => (
                        <option key={acc} value={acc}>{acc}</option>
                      ))
                    ) : (
                      <option value="">계좌 없음</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">통화</label>
                  <select
                    value={currency}
                    onChange={(e) => {
                      const val = e.target.value
                      setCurrency(val)
                      setFxRate(val === '원화' ? 1 : '')
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    {availableCurrencies.length > 0 ? (
                      availableCurrencies.map((curr: string) => (
                        <option key={curr} value={curr}>{curr}</option>
                      ))
                    ) : (
                      <option value="">통화 없음</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-sky-400 font-medium block mb-1">
                    {currency === '원화' ? '환율 (고정 1)' : currency === '엔화' ? '환율 (100¥=원)' : '환율 ($1=원)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={currency === '원화'}
                    value={currency === '원화' ? '1' : (fxRate !== undefined && fxRate !== null ? fxRate : '')}
                    onChange={(e) => setFxRate(e.target.value)}
                    placeholder={currency === '엔화' ? '예: 912.34' : '예: 1435.50'}
                    className={`w-full px-2.5 py-1.5 bg-slate-950 border rounded-lg text-xs font-mono ${
                      currency === '원화'
                        ? 'border-slate-800 text-slate-500 cursor-not-allowed'
                        : 'border-sky-500/50 text-sky-200 focus:border-sky-400'
                    }`}
                  />
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
                  <label className="text-xs text-slate-400 font-medium block mb-1">이자배당액</label>
                  <input
                    type="number"
                    value={dividend || ''}
                    onChange={(e) => setDividend(parseFloat(e.target.value) || 0)}
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

                {/* 2nd Row */}
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">거래일자</label>
                  <input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    onClick={(e) => 'showPicker' in HTMLInputElement.prototype && (e.target as HTMLInputElement).showPicker()}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 font-medium block mb-1">종목명</label>
                  <select
                    value={selectedTicker}
                    onChange={(e) => setSelectedTicker(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
                  >
                    <option value="">종목 선택</option>
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
                  <label className="text-xs text-slate-400 font-medium block mb-1">현금수입</label>
                  <input
                    type="number"
                    value={cashIn || ''}
                    onChange={(e) => setCashIn(parseFloat(e.target.value) || 0)}
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

              {/* 외화 예수금 환전 연동 옵션 */}
              {currency !== '원화' && (
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="autoLinkWonCash"
                    checked={Boolean(autoLinkWonCash)}
                    onChange={(e) => setAutoLinkWonCash(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500/30"
                  />
                  <label htmlFor="autoLinkWonCash" className="text-xs text-slate-300 cursor-pointer">
                    계좌 내 원화예수금 환전 동시 반영 (외화 입출금 입력 시 지정 환율로 동일 계좌 원화예수금에 상계 입출금 자동 생성)
                  </label>
                </div>
              )}

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
                        if (confirm('삭제하시겠습니까?')) deleteTradeMutation.mutate(selectedRowId)
                      }}
                      disabled={deleteTradeMutation.isPending}
                      className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 active:scale-95 text-white transition disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                      삭제
                    </button>
                    <button
                      onClick={() => resetTradingForm()}
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
            <CardHeader
              title={`최근 거래내역 (${account})`}
              subtitle="행을 클릭하면 상단 입력창에서 수정 또는 삭제할 수 있습니다"
            />
            <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs sm:text-sm text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                    <th className="py-3 px-3 text-center">행번호</th>
                    <th className="py-3 px-3">거래일자</th>
                    <th className="py-3 px-3">종목명</th>
                    <th className="py-3 px-3 text-right text-sky-400">환율</th>
                    <th className="py-3 px-3 text-right">매입수량</th>
                    <th className="py-3 px-3 text-right text-emerald-400">매입액</th>
                    <th className="py-3 px-3 text-right">현금지출</th>
                    <th className="py-3 px-3 text-right">매도수량</th>
                    <th className="py-3 px-3 text-right">매도원금</th>
                    <th className="py-3 px-3 text-right text-rose-400">매도액</th>
                    <th className="py-3 px-3 text-right">현금수입</th>
                    <th className="py-3 px-3 text-right text-emerald-300">매매수익</th>
                    <th className="py-3 px-3 text-right text-emerald-300">이자배당액</th>
                    <th className="py-3 px-3 text-right text-rose-300">매매비용</th>
                    <th className="py-3 px-3 text-right font-bold text-emerald-500">순수익</th>
                    <th className="py-3 px-3 text-right">입출금</th>
                    <th className="py-3 px-3 text-right font-bold text-slate-200">잔액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(tradeHistory || []).map((r: any, i: number) => {
                    const isSelected = selectedRowId === r.행번호
                    return (
                      <tr
                        key={i}
                        onClick={() => setEditMode(r)}
                        className={`hover:bg-slate-800/40 cursor-pointer transition ${
                          isSelected ? 'bg-slate-800/60 ring-1 ring-emerald-500/50' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 text-center text-slate-500">{r.행번호}</td>
                        <td className="py-2.5 px-3 text-slate-300 font-sans">{r.거래일자?.substring(0, 10)}</td>
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                          {tickersData?.find((t: any) => t.종목코드 === r.종목코드)?.종목명 || r.종목코드}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-sky-300">
                          {r.환율 ? (
                            r.통화 === '엔화'
                              ? Number(r.환율).toLocaleString()
                              : Number(r.환율).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })
                          ) : r.통화 !== '원화' ? (
                            <span className="text-amber-400 font-sans text-xs px-1.5 py-0.5 rounded bg-amber-500/10">
                              미입력
                            </span>
                          ) : (
                            '1'
                          )}
                        </td>
                        {(() => {
                          const isUsd = r.통화 === '달러' || currency === '달러'
                          const fmtAmt = (val: number | null | undefined) => {
                            if (val === null || val === undefined || isNaN(val)) return '0'
                            return isUsd
                              ? Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              : Math.round(val).toLocaleString('ko-KR')
                          }
                          return (
                            <>
                              <td className="py-2.5 px-3 text-right">{formatKRW(r.매입수량)}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">{fmtAmt(r.매입액)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(r.현금지출)}</td>
                              <td className="py-2.5 px-3 text-right">{formatKRW(r.매도수량)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(r.매도원금)}</td>
                              <td className="py-2.5 px-3 text-right text-rose-400 font-medium">{fmtAmt(r.매도액)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(r.현금수입)}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-300">{fmtAmt(r.매매수익)}</td>
                              <td className="py-2.5 px-3 text-right text-emerald-300">{fmtAmt(r.이자배당액)}</td>
                              <td className="py-2.5 px-3 text-right text-rose-300">{fmtAmt((r.매입비용 || 0) + (r.매도비용 || 0))}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-500">{fmtAmt(r.순수익)}</td>
                              <td className="py-2.5 px-3 text-right">{fmtAmt(r.입출금)}</td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-200">{fmtAmt(r.잔액)}</td>
                            </>
                          )
                        })()}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* 탭 2: 투자종목 관리 */}
      {activeTab === 'asset' && <AssetSettings />}

      {/* 탭 3: 구분항목 관리 */}
      {activeTab === 'group' && <GroupSettings />}

      {/* 탭 4: 종합거래내역 */}
      {activeTab === 'total' && (
        <div className="space-y-6">
          <div className="flex flex-col gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 text-xs">
            {/* Row 1: Filters */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-slate-400 font-medium block mb-1">자산군</label>
                <select value={selAssetClass} onChange={(e) => { setSelAssetClass(e.target.value); setSelAssetClass1('전체'); setSelAssetClass2('전체'); setSelAccount('전체'); setSelProductName('전체'); }} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200">
                  {(processedData.options as any).assetClasses?.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 font-medium block mb-1">세부자산군</label>
                <select value={selAssetClass1} onChange={(e) => { setSelAssetClass1(e.target.value); setSelAssetClass2('전체'); setSelAccount('전체'); setSelProductName('전체'); }} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200">
                  {(processedData.options as any).assetClasses1?.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 font-medium block mb-1">세부자산군2</label>
                <select value={selAssetClass2} onChange={(e) => { setSelAssetClass2(e.target.value); setSelAccount('전체'); setSelProductName('전체'); }} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200">
                  {(processedData.options as any).assetClasses2?.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 font-medium block mb-1">계좌</label>
                <select value={selAccount} onChange={(e) => { setSelAccount(e.target.value); setSelProductName('전체'); }} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200">
                  {(processedData.options as any).accounts?.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-slate-400 font-medium block mb-1">상품명</label>
                <select value={selProductName} onChange={(e) => setSelProductName(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200">
                  {(processedData.options as any).products?.map((o: string) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Row 2: Dates */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800/60">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300 font-medium">조회 기간:</span>
                <input type="date" value={totalStartDate} onChange={(e) => setTotalStartDate(e.target.value)} className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200" />
                <span className="text-slate-500">~</span>
                <input type="date" value={totalEndDate} onChange={(e) => setTotalEndDate(e.target.value)} className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-200" />
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => setTotalStartDate(format(subMonths(new Date(), 1), 'yyyy-MM-dd'))} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300">1M</button>
                <button onClick={() => setTotalStartDate(format(subMonths(new Date(), 3), 'yyyy-MM-dd'))} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300">3M</button>
                <button onClick={() => setTotalStartDate(format(subMonths(new Date(), 6), 'yyyy-MM-dd'))} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300">6M</button>
                <button onClick={() => setTotalStartDate(format(subMonths(new Date(), 12), 'yyyy-MM-dd'))} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300">1Y</button>
                <button onClick={() => setTotalStartDate('1900-01-01')} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-md text-slate-300">전체</button>
              </div>
            </div>
          </div>

          <Card>
            <CardHeader
              title="기간별 종합거래내역"
              subtitle="자산군 분류 및 매입/매도 단가가 계산된 종합 거래 명세"
            />
            <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
              <table className="w-full text-xs sm:text-sm text-left border-collapse min-w-[800px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                    <th className="py-3 px-3">자산군</th>
                    <th className="py-3 px-3">세부자산군</th>
                    <th className="py-3 px-3">세부자산군2</th>
                    <th className="py-3 px-3">통화</th>
                    <th className="py-3 px-3">계좌</th>
                    <th className="py-3 px-3">상품명</th>
                    <th className="py-3 px-3">거래일자</th>
                    <th className="py-3 px-3 text-right">매입수량</th>
                    <th className="py-3 px-3 text-right">매입단가</th>
                    <th className="py-3 px-3 text-right">매입액</th>
                    <th className="py-3 px-3 text-right">매도수량</th>
                    <th className="py-3 px-3 text-right">매도단가</th>
                    <th className="py-3 px-3 text-right font-bold text-slate-200">매도액</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {processedData.filtered.map((t: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/40 transition">
                      <td className="py-2 px-3 font-sans font-semibold text-slate-200 whitespace-nowrap">{t.자산군}</td>
                      <td className="py-2 px-3 font-sans text-slate-400 whitespace-nowrap">{t.세부자산군 || '-'}</td>
                      <td className="py-2 px-3 font-sans text-slate-400 whitespace-nowrap">{t.세부자산군2 || '-'}</td>
                      <td className="py-2 px-3 font-sans text-slate-400">{t.통화}</td>
                      <td className="py-2 px-3 font-sans text-slate-200 whitespace-nowrap">{t.계좌}</td>
                      <td className="py-2 px-3 font-sans font-medium text-slate-100 min-w-[120px] max-w-[200px] truncate" title={t.상품명}>{t.상품명}</td>
                      <td className="py-2 px-3 font-sans text-slate-300 whitespace-nowrap">{t.거래일자}</td>
                      <td className="py-2 px-3 text-right">{t.매입수량 === 0 ? '-' : formatKRW(t.매입수량)}</td>
                      <td className="py-2 px-3 text-right">{t.매입단가 === 0 ? '-' : formatKRW(t.매입단가)}</td>
                      <td className="py-2 px-3 text-right text-emerald-400">{formatKRW(t.매입액)}</td>
                      <td className="py-2 px-3 text-right">{t.매도수량 === 0 ? '-' : formatKRW(t.매도수량)}</td>
                      <td className="py-2 px-3 text-right">{t.매도단가 === 0 ? '-' : formatKRW(t.매도단가)}</td>
                      <td className="py-2 px-3 text-right text-rose-400 font-medium">{formatKRW(t.매도액)}</td>
                    </tr>
                  ))}
                  {processedData.totals && (
                    <tr className="bg-slate-900/80 font-bold text-emerald-400">
                      <td colSpan={7} className="py-2 px-3 text-right">합계</td>
                      <td className="py-2 px-3 text-right">-</td>
                      <td className="py-2 px-3 text-right">-</td>
                      <td className="py-2 px-3 text-right text-emerald-400">{formatKRW(processedData.totals.매입액)}</td>
                      <td className="py-2 px-3 text-right">-</td>
                      <td className="py-2 px-3 text-right">-</td>
                      <td className="py-2 px-3 text-right text-rose-400 font-medium">{formatKRW(processedData.totals.매도액)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
