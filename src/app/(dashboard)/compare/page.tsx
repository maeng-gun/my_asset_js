'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { formatKRW, formatPercent } from '@/lib/utils'
import { toast } from 'sonner'
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Scale,
  ArrowRight,
  TrendingUp,
  Coins,
  ShieldCheck,
} from 'lucide-react'
import { LatestPortfolioSummary } from '@/lib/engine/types'

interface AccountCashComparison {
  account: string
  cashTicker: string
  prodBalance: number
  devBalance: number
  diff: number
  isExact: boolean
}

export default function ComparePage() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const [filterDiffOnly, setFilterDiffOnly] = useState(false)
  const [selectedCurrency, setSelectedCurrency] = useState<'전체' | '원화' | '외화'>('전체')

  // 1. 운영(Prod) 최신 스냅샷 직접 조회
  const { data: prodSummary, isLoading: isProdLoading } = useQuery({
    queryKey: ['compare-prod-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('latest_portfolio_summary')
        .select('*')
        .eq('id', 'latest')
        .single()
      if (error) {
        console.warn('Prod summary fetch error:', error)
        return null
      }
      return data as LatestPortfolioSummary
    },
  })

  // 2. 개발(Dev) 최신 스냅샷 직접 조회
  const { data: devSummary, isLoading: isDevLoading } = useQuery({
    queryKey: ['compare-dev-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dev_latest_portfolio_summary')
        .select('*')
        .eq('id', 'latest')
        .single()
      if (error) {
        console.warn('Dev summary fetch error:', error)
        return null
      }
      return data as LatestPortfolioSummary
    },
  })

  // 3. 수동 재계산 Mutation
  const revalueMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/valuation', { method: 'POST' })
      if (!res.ok) throw new Error('재계산 요청 실패')
      return await res.json()
    },
    onSuccess: () => {
      toast.success('개발 환경(dev_*) 포트폴리오 재계산이 완료되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['compare-dev-summary'] })
      queryClient.invalidateQueries({ queryKey: ['latest-portfolio-summary'] })
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '오류 발생'
      toast.error(`재계산 오류: ${msg}`)
    },
  })

  const prodTotal = prodSummary?.t_comm3?.find((r) => r.자산군 === '<합계>')
  const devTotal = devSummary?.t_comm3?.find((r) => r.자산군 === '<합계>')

  const prodEvalAmt = prodTotal?.평가금액 || 0
  const devEvalAmt = devTotal?.평가금액 || 0
  const diffEvalAmt = devEvalAmt - prodEvalAmt

  const prodBookAmt = prodTotal?.장부금액 || 0
  const devBookAmt = devTotal?.장부금액 || 0
  const diffBookAmt = devBookAmt - prodBookAmt

  const prodProfitAmt = prodTotal?.총손익 || 0
  const devProfitAmt = devTotal?.총손익 || 0
  const diffProfitAmt = devProfitAmt - prodProfitAmt

  // 원화예수금 10개 계좌 잔액 일치 검증 목록 생성
  const ACCOUNTS_CASH_LIST = [
    { account: '한투', ticker: 'CASH_KOIN1' },
    { account: '불리오', ticker: 'BOOL_WON' },
    { account: '한투ISA', ticker: 'CASH_ISA' },
    { account: '엔투ISA', ticker: 'NTS_WON' },
    { account: '금현물', ticker: 'CASH_GOLD' },
    { account: '농협IRP', ticker: 'P010_CASH' },
    { account: '미래DC', ticker: 'P020_CASH' },
    { account: '엔투저축연금', ticker: 'P030_CASH' },
    { account: '한투연금저축', ticker: 'P040_CASH' },
    { account: '엔투IRP', ticker: 'P050_CASH' },
  ]

  const prodComm2Map = new Map<string, number>()
  for (const r of prodSummary?.t_comm2 || []) {
    if (r.계좌 && r.종목코드) {
      prodComm2Map.set(`${r.계좌}_${r.종목코드}`, r.장부금액)
    }
  }

  const devComm2Map = new Map<string, number>()
  for (const r of devSummary?.t_comm2 || []) {
    if (r.계좌 && r.종목코드) {
      devComm2Map.set(`${r.계좌}_${r.종목코드}`, r.장부금액)
    }
  }

  const cashComparisons: AccountCashComparison[] = ACCOUNTS_CASH_LIST.map((item) => {
    const key = `${item.account}_${item.ticker}`
    const prodBal = prodComm2Map.get(key) || 0
    const devBal = devComm2Map.get(key) || 0
    const diff = devBal - prodBal
    return {
      account: item.account,
      cashTicker: item.ticker,
      prodBalance: prodBal,
      devBalance: devBal,
      diff,
      isExact: diff === 0,
    }
  })

  const allCashExact = cashComparisons.every((c) => c.isExact)

  // 종목별 A/B 상세 비교 매트릭스 생성
  const allItemKeys = new Set<string>()
  const prodItemMap = new Map<string, any>()
  for (const r of prodSummary?.t_comm2 || []) {
    if (r.계좌 && r.종목코드) {
      const k = `${r.계좌}_${r.종목코드}`
      allItemKeys.add(k)
      prodItemMap.set(k, r)
    }
  }

  const devItemMap = new Map<string, any>()
  for (const r of devSummary?.t_comm2 || []) {
    if (r.계좌 && r.종목코드) {
      const k = `${r.계좌}_${r.종목코드}`
      allItemKeys.add(k)
      devItemMap.set(k, r)
    }
  }

  interface ItemDiffRow {
    key: string
    account: string
    code: string
    name: string
    currency: string
    assetClass: string
    prodBook: number
    devBook: number
    diffBook: number
    prodEval: number
    devEval: number
    diffEval: number
    prodProfit: number
    devProfit: number
    diffProfit: number
    isLegacyWrapper: boolean
    hasDiff: boolean
  }

  const itemDiffRows: ItemDiffRow[] = Array.from(allItemKeys).map((key) => {
    const prod = prodItemMap.get(key)
    const dev = devItemMap.get(key)
    const [account, code] = key.split('_')

    const name = dev?.종목명 || prod?.종목명 || code
    const currency = dev?.통화 || prod?.통화 || '원화'
    const assetClass = dev?.자산군 || prod?.자산군 || ''

    const pBook = prod?.장부금액 || 0
    const dBook = dev?.장부금액 || 0
    const diffB = dBook - pBook

    const pEval = prod?.평가금액 || 0
    const dEval = dev?.평가금액 || 0
    const diffE = dEval - pEval

    const pProf = prod ? (prod.평가손익 !== undefined ? prod.평가손익 : pEval - pBook) : 0
    const dProf = dev ? (dev.평가손익 !== undefined ? dev.평가손익 : dEval - dBook) : 0
    const diffP = dProf - pProf

    const isLegacy = code === 'USDAST' || code === 'JPYAST'
    const hasDiff = Math.abs(diffB) > 0 || Math.abs(diffE) > 0

    return {
      key,
      account,
      code,
      name,
      currency,
      assetClass,
      prodBook: pBook,
      devBook: dBook,
      diffBook: diffB,
      prodEval: pEval,
      devEval: dEval,
      diffEval: diffE,
      prodProfit: pProf,
      devProfit: dProf,
      diffProfit: diffP,
      isLegacyWrapper: isLegacy,
      hasDiff,
    }
  })

  // 필터 적용
  const filteredItemDiffs = itemDiffRows.filter((row) => {
    if (filterDiffOnly && !row.hasDiff) return false
    if (selectedCurrency === '원화' && row.currency !== '원화') return false
    if (selectedCurrency === '외화' && row.currency === '원화') return false
    return true
  }).sort((a, b) => {
    // 레거시 래퍼 및 외화 자산 먼저 표시
    if (a.currency !== b.currency) return a.currency === '원화' ? 1 : -1
    return Math.abs(b.diffEval) - Math.abs(a.diffEval)
  })

  return (
    <div className="space-y-6">
      {/* 상단 헤더 & 액션 버튼 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 rounded-2xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-bold text-slate-100">운영 vs 개발 A/B 검증 대시보드</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">
              dev_* 격리 검증
            </span>
          </div>
          <p className="text-xs text-slate-400">
            기존 운영 스냅샷(latest_portfolio_summary)과 외화 원화환산 통합 체계(dev_latest_portfolio_summary)를 1:1로 대조 검증합니다.
          </p>
        </div>

        <button
          onClick={() => revalueMutation.mutate()}
          disabled={revalueMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-lg shadow-emerald-950/40 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${revalueMutation.isPending ? 'animate-spin' : ''}`} />
          개발 환경 재계산 실행
        </button>
      </div>

      {/* 3대 핵심 지표 비교 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. 총 평가금액 */}
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-200">총 평가금액 (Net Asset Value)</span>
              <span className="font-mono text-xs">
                차이: <span className={diffEvalAmt >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatKRW(diffEvalAmt)}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
              <div>
                <span className="text-xs text-slate-500 block">운영 (기존)</span>
                <span className="text-base font-bold font-mono text-slate-300">{formatKRW(prodEvalAmt)}</span>
              </div>
              <div className="border-l border-slate-800/80 pl-2">
                <span className="text-xs text-emerald-400 block font-semibold">개발 (개편안)</span>
                <span className="text-base font-bold font-mono text-emerald-400">{formatKRW(devEvalAmt)}</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 2. 총 장부금액 */}
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-200">총 장부금액 (Book Cost)</span>
              <span className="font-mono text-xs">
                차이: <span className={diffBookAmt >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatKRW(diffBookAmt)}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
              <div>
                <span className="text-xs text-slate-500 block">운영 (기존)</span>
                <span className="text-base font-bold font-mono text-slate-300">{formatKRW(prodBookAmt)}</span>
              </div>
              <div className="border-l border-slate-800/80 pl-2">
                <span className="text-xs text-emerald-400 block font-semibold">개발 (개편안)</span>
                <span className="text-base font-bold font-mono text-emerald-400">{formatKRW(devBookAmt)}</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 3. 총 손익 */}
        <Card>
          <CardBody className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-200">총 손익 (Total Profit)</span>
              <span className="font-mono text-xs">
                차이: <span className={diffProfitAmt >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{formatKRW(diffProfitAmt)}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80">
              <div>
                <span className="text-xs text-slate-500 block">운영 (기존)</span>
                <span className="text-base font-bold font-mono text-slate-300">{formatKRW(prodProfitAmt)}</span>
              </div>
              <div className="border-l border-slate-800/80 pl-2">
                <span className="text-xs text-emerald-400 block font-semibold">개발 (개편안)</span>
                <span className="text-base font-bold font-mono text-emerald-400">{formatKRW(devProfitAmt)}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 10개 계좌 원화예수금 0원 오차 검증 카드 */}
      <Card>
        <CardHeader
          title="10개 계좌 원화예수금 잔액 0원 일치 검증"
          subtitle="외화 래퍼(USDAST/JPYAST) 폐지 및 연금자산 일원화 후에도 모든 원화예수금 잔액이 0원 오차로 완벽 일치해야 합니다"
          action={
            allCashExact ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                10개 전 계좌 0원 오차 일치
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <AlertTriangle className="w-3.5 h-3.5" />
                오차 발생 계좌 존재
              </span>
            )
          }
        />
        <CardBody className="p-0 overflow-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                <th className="py-2.5 px-4">계좌명</th>
                <th className="py-2.5 px-4">예수금 코드</th>
                <th className="py-2.5 px-4 text-right">운영 잔액</th>
                <th className="py-2.5 px-4 text-right">개발 잔액</th>
                <th className="py-2.5 px-4 text-right">차이 (Dev - Prod)</th>
                <th className="py-2.5 px-4 text-center">검증 상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {cashComparisons.map((c) => (
                <tr key={c.account} className="hover:bg-slate-800/30">
                  <td className="py-2 px-4 font-sans font-semibold text-slate-200">{c.account}</td>
                  <td className="py-2 px-4 text-slate-400">{c.cashTicker}</td>
                  <td className="py-2 px-4 text-right text-slate-300">{formatKRW(c.prodBalance)}</td>
                  <td className="py-2 px-4 text-right text-slate-100 font-semibold">{formatKRW(c.devBalance)}</td>
                  <td className={`py-2 px-4 text-right font-bold ${c.diff === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {c.diff === 0 ? '0원' : formatKRW(c.diff)}
                  </td>
                  <td className="py-2 px-4 text-center">
                    {c.isExact ? (
                      <span className="px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-emerald-500/10 text-emerald-400">
                        일치
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-rose-500/10 text-rose-400">
                        불일치
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* 자산군별 소계 비교 */}
      <Card>
        <CardHeader
          title="자산군별 소계 비교"
          subtitle="주식, 채권, 대체자산, 현금성 각 군별 평가금액 및 손익 변동"
        />
        <CardBody className="p-0 overflow-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                <th className="py-2.5 px-4">자산군</th>
                <th className="py-2.5 px-4 text-right">운영 평가금액</th>
                <th className="py-2.5 px-4 text-right">개발 평가금액</th>
                <th className="py-2.5 px-4 text-right text-emerald-400">평가금액 차이</th>
                <th className="py-2.5 px-4 text-right">운영 총손익</th>
                <th className="py-2.5 px-4 text-right">개발 총손익</th>
                <th className="py-2.5 px-4 text-right text-emerald-400">총손익 차이</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {['주식', '채권', '대체자산', '현금성', '<합계>'].map((cls) => {
                const p = prodSummary?.t_comm3?.find((r) => r.자산군 === cls && (!r.세부자산군 || r.세부자산군 === ''))
                const d = devSummary?.t_comm3?.find((r) => r.자산군 === cls && (!r.세부자산군 || r.세부자산군 === ''))
                const pEval = p?.평가금액 || 0
                const dEval = d?.평가금액 || 0
                const diffE = dEval - pEval

                const pProf = p?.총손익 || 0
                const dProf = d?.총손익 || 0
                const diffP = dProf - pProf

                const isTotal = cls === '<합계>'

                return (
                  <tr
                    key={cls}
                    className={`hover:bg-slate-800/30 ${
                      isTotal ? 'bg-slate-900/80 font-bold border-t border-slate-700 text-slate-100' : 'text-slate-300'
                    }`}
                  >
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-200">{cls}</td>
                    <td className="py-2.5 px-4 text-right">{formatKRW(pEval)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-100 font-semibold">{formatKRW(dEval)}</td>
                    <td className={`py-2.5 px-4 text-right font-bold ${diffE === 0 ? 'text-slate-500' : diffE > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {diffE === 0 ? '-' : formatKRW(diffE)}
                    </td>
                    <td className="py-2.5 px-4 text-right">{formatKRW(pProf)}</td>
                    <td className="py-2.5 px-4 text-right text-slate-100 font-semibold">{formatKRW(dProf)}</td>
                    <td className={`py-2.5 px-4 text-right font-bold ${diffP === 0 ? 'text-slate-500' : diffP > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {diffP === 0 ? '-' : formatKRW(diffP)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {/* 종목별 A/B 상세 대조 명세 테이블 */}
      <Card>
        <CardHeader
          title="종목별 1:1 대조 명세"
          subtitle="모든 종목의 장부금액, 평가금액, 손익 차이를 검증합니다. 원화 종목은 0원 일치해야 하며, 외화 종목은 통합 원화환산 평가가 반영됩니다."
          action={
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                {(['전체', '원화', '외화'] as const).map((cur) => (
                  <button
                    key={cur}
                    onClick={() => setSelectedCurrency(cur)}
                    className={`px-2.5 py-1 rounded-md transition ${
                      selectedCurrency === cur ? 'bg-slate-800 text-slate-100 font-semibold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cur}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterDiffOnly}
                  onChange={(e) => setFilterDiffOnly(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500/30"
                />
                차이 발생 종목만 보기
              </label>
            </div>
          }
        />
        <CardBody className="p-0 overflow-auto max-h-[calc(100vh-300px)]">
          <table className="w-full text-xs text-left border-collapse min-w-[900px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                <th className="py-2.5 px-3">계좌</th>
                <th className="py-2.5 px-3">통화</th>
                <th className="py-2.5 px-3">종목코드</th>
                <th className="py-2.5 px-3">종목명</th>
                <th className="py-2.5 px-3 text-right">운영 장부</th>
                <th className="py-2.5 px-3 text-right">개발 장부</th>
                <th className="py-2.5 px-3 text-right text-emerald-400">장부 차이</th>
                <th className="py-2.5 px-3 text-right">운영 평가</th>
                <th className="py-2.5 px-3 text-right">개발 평가</th>
                <th className="py-2.5 px-3 text-right text-emerald-400">평가 차이</th>
                <th className="py-2.5 px-3 text-right">운영 손익</th>
                <th className="py-2.5 px-3 text-right">개발 손익</th>
                <th className="py-2.5 px-3 text-right text-emerald-400">손익 차이</th>
                <th className="py-2.5 px-3 text-center">검증 결과</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredItemDiffs.map((r) => {
                const isWon = r.currency === '원화'
                const isExact = r.diffBook === 0 && r.diffEval === 0

                return (
                  <tr key={r.key} className="hover:bg-slate-800/30 transition">
                    <td className="py-2 px-3 font-sans font-semibold text-slate-200">{r.account}</td>
                    <td className="py-2 px-3 font-sans text-slate-400">{r.currency}</td>
                    <td className="py-2 px-3 text-slate-400">{r.code}</td>
                    <td className="py-2 px-3 font-sans font-medium text-slate-100 max-w-[160px] truncate" title={r.name}>
                      {r.name}
                      {r.isLegacyWrapper && (
                        <span className="ml-1.5 px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-400 font-sans">
                          폐지대상
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">{formatKRW(r.prodBook)}</td>
                    <td className="py-2 px-3 text-right text-slate-100">{formatKRW(r.devBook)}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${r.diffBook === 0 ? 'text-slate-500' : 'text-sky-400'}`}>
                      {r.diffBook === 0 ? '-' : formatKRW(r.diffBook)}
                    </td>
                    <td className="py-2 px-3 text-right">{formatKRW(r.prodEval)}</td>
                    <td className="py-2 px-3 text-right text-slate-100">{formatKRW(r.devEval)}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${r.diffEval === 0 ? 'text-slate-500' : 'text-sky-400'}`}>
                      {r.diffEval === 0 ? '-' : formatKRW(r.diffEval)}
                    </td>
                    <td className="py-2 px-3 text-right">{formatKRW(r.prodProfit)}</td>
                    <td className="py-2 px-3 text-right text-slate-100">{formatKRW(r.devProfit)}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${r.diffProfit === 0 ? 'text-slate-500' : 'text-sky-400'}`}>
                      {r.diffProfit === 0 ? '-' : formatKRW(r.diffProfit)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {isWon ? (
                        isExact ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-emerald-500/10 text-emerald-400">
                            0원 일치
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-rose-500/10 text-rose-400">
                            원화 오차
                          </span>
                        )
                      ) : r.isLegacyWrapper ? (
                        <span className="px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-slate-800 text-slate-400">
                          폐지 완료
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[11px] font-sans font-semibold bg-sky-500/10 text-sky-400">
                          외화 개편
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  )
}
