'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import {
  getTickers,
  getCategories,
  addTicker,
  updateTicker,
  deleteTicker,
  getAssetStrategyTags,
  upsertAssetStrategyTag,
  deleteAssetStrategyTag,
} from '@/lib/actions/db'
import { formatKRW } from '@/lib/utils'
import { toast } from 'sonner'
import { useMemo, useState } from 'react'
import { PlusCircle, Trash2, Check, X, Tags } from 'lucide-react'
import { format } from 'date-fns'
import { ACCOUNT_ORDER } from '@/lib/engine/types'
import { AssetStrategyTagRow, StrategyRole } from '@/lib/engine/alm-tpa-types'
import { useAssetSettingsStore, resetAssetSettingsForm } from '@/lib/stores/navigation-state'

export default function AssetSettingsPage() {
  const queryClient = useQueryClient()
  const [form, setAssetSettingsForm] = useAssetSettingsStore()
  const {
    tradeType,
    isEditing,
    editId,
    account,
    ticker,
    assName,
    commName,
    assClass,
    assClass1,
    assClass2,
    assCur,
    evalPrice,
    maturityDate,
  } = form

  // 비파괴 보조 태그 편집 상태 (asset_strategy_tags)
  const [tagTicker, setTagTicker] = useState('')
  const [tagAssetName, setTagAssetName] = useState('')
  const [strategyRole, setStrategyRole] = useState<StrategyRole>('core')
  const [factorCluster, setFactorCluster] = useState('')
  const [economicCurrency, setEconomicCurrency] = useState('KRW')
  const [isPensionSafeOverride, setIsPensionSafeOverride] = useState(false)
  const [equityBetaOverride, setEquityBetaOverride] = useState('')

  const setAccount = (val: string) => setAssetSettingsForm({ account: val })
  const setTicker = (val: string) => setAssetSettingsForm({ ticker: val })
  const setAssName = (val: string) => setAssetSettingsForm({ assName: val })
  const setCommName = (val: string) => setAssetSettingsForm({ commName: val })
  const setAssClass = (val: string) => setAssetSettingsForm({ assClass: val })
  const setAssClass1 = (val: string) => setAssetSettingsForm({ assClass1: val })
  const setAssClass2 = (val: string) => setAssetSettingsForm({ assClass2: val })
  const setAssCur = (val: string) => setAssetSettingsForm({ assCur: val })
  const setEvalPrice = (val: number) => setAssetSettingsForm({ evalPrice: val })
  const setMaturityDate = (val: string) => setAssetSettingsForm({ maturityDate: val })

  const { data: tickersData } = useQuery({
    queryKey: ['tickers-list'],
    queryFn: async () => await getTickers(),
  })

  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => await getCategories(),
  })

  const { data: strategyTags = [] } = useQuery({
    queryKey: ['asset-strategy-tags'],
    queryFn: async () => await getAssetStrategyTags(),
  })

  const tagMap = useMemo(() => {
    const map = new Map<string, AssetStrategyTagRow>()
    for (const tag of strategyTags) {
      map.set(tag.ticker_code, tag)
    }
    return map
  }, [strategyTags])

  const resetForm = () => {
    resetAssetSettingsForm()
  }

  const handleEdit = (t: Record<string, unknown>) => {
    const tickerCode = String(t.종목코드 || '')
    const name = String(t.상품명 || t.종목명 || tickerCode)
    setAssetSettingsForm({
      isEditing: true,
      editId: Number(t.행번호),
      account: String(t.계좌 || ''),
      ticker: tickerCode,
      assName: String(t.종목명 || ''),
      commName: String(t.상품명 || ''),
      assClass: String(t.자산군 || ''),
      assClass1: String(t.세부자산군 || ''),
      assClass2: String(t.세부자산군2 || ''),
      assCur: String(t.통화 || ''),
      evalPrice: Number(t.평가금액) || 0,
      maturityDate: String(t.만기일 || format(new Date(), 'yyyy-MM-dd')),
    })

    const existingTag = tagMap.get(tickerCode)
    setTagTicker(tickerCode)
    setTagAssetName(existingTag?.asset_name || name)
    if (existingTag) {
      setStrategyRole(existingTag.strategy_role)
      setFactorCluster(existingTag.factor_cluster || '')
      setEconomicCurrency(existingTag.economic_currency || 'KRW')
      setIsPensionSafeOverride(Boolean(existingTag.is_pension_safe_override))
      setEquityBetaOverride(
        existingTag.equity_beta_override !== null && existingTag.equity_beta_override !== undefined
          ? String(existingTag.equity_beta_override)
          : ''
      )
    } else {
      const defaultRole: StrategyRole =
        t.자산군 === '현금성'
          ? 'cash'
          : t.세부자산군2 === '테마' || t.세부자산군2 === '종목' || t.세부자산군2 === '원자재'
          ? 'satellite'
          : 'core'
      setStrategyRole(defaultRole)
      setFactorCluster('')
      setEconomicCurrency(t.통화 === '달러' ? 'USD' : t.통화 === '엔화' ? 'JPY' : 'KRW')
      setIsPensionSafeOverride(false)
      setEquityBetaOverride('')
    }
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const record = {
        계좌: account,
        종목코드: ticker,
        종목명: assName,
        상품명: commName,
        자산군: assClass,
        세부자산군: assClass1,
        세부자산군2: assClass2,
        통화: assCur,
        평가금액: evalPrice,
        만기일: maturityDate,
      }
      if (isEditing && editId !== null) {
        await updateTicker(tradeType, editId, record)
      } else {
        await addTicker(tradeType, record)
      }
    },
    onSuccess: () => {
      toast.success(isEditing ? '수정되었습니다.' : '추가되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['tickers-list'] })
      queryClient.invalidateQueries({ queryKey: ['asset-settings'] })
      queryClient.invalidateQueries({ queryKey: ['latest-portfolio-summary'] })
      queryClient.invalidateQueries({ queryKey: ['trade-history'] })
      resetForm()
    },
    onError: (err: Error) => {
      toast.error(`오류: ${err.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await deleteTicker(tradeType, id)
    },
    onSuccess: () => {
      toast.success('삭제되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['tickers-list'] })
      queryClient.invalidateQueries({ queryKey: ['asset-settings'] })
      queryClient.invalidateQueries({ queryKey: ['latest-portfolio-summary'] })
      queryClient.invalidateQueries({ queryKey: ['trade-history'] })
      resetForm()
    },
    onError: (err: Error) => {
      toast.error(`삭제 오류: ${err.message}`)
    },
  })

  // 비파괴 보조 태그 저장/삭제 (원장 재계산 미실행)
  const saveTagMutation = useMutation({
    mutationFn: async () => {
      if (!tagTicker.trim()) throw new Error('종목코드를 먼저 선택하거나 입력하세요.')
      const parsedBeta = equityBetaOverride.trim() === '' ? null : Number(equityBetaOverride)
      await upsertAssetStrategyTag({
        ticker_code: tagTicker.trim(),
        asset_name: tagAssetName.trim() || tagTicker.trim(),
        strategy_role: strategyRole,
        factor_cluster: factorCluster.trim() || null,
        economic_currency: economicCurrency.trim() || null,
        is_pension_safe_override: isPensionSafeOverride,
        equity_beta_override: Number.isFinite(parsedBeta) ? parsedBeta : null,
      })
    },
    onSuccess: () => {
      toast.success(`[${tagTicker}] 전략 보조 태그가 저장되었습니다 (원장 무손실).`)
      queryClient.invalidateQueries({ queryKey: ['asset-strategy-tags'] })
    },
    onError: (err: Error) => {
      toast.error(`보조 태그 저장 오류: ${err.message}`)
    },
  })

  const deleteTagMutation = useMutation({
    mutationFn: async () => {
      if (!tagTicker.trim()) throw new Error('삭제할 종목코드가 없습니다.')
      await deleteAssetStrategyTag(tagTicker.trim())
    },
    onSuccess: () => {
      toast.success(`[${tagTicker}] 전략 보조 태그가 삭제되었습니다.`)
      queryClient.invalidateQueries({ queryKey: ['asset-strategy-tags'] })
      setFactorCluster('')
      setIsPensionSafeOverride(false)
      setEquityBetaOverride('')
    },
    onError: (err: Error) => {
      toast.error(`보조 태그 삭제 오류: ${err.message}`)
    },
  })

  const getCat = (key: string) =>
    (categories || [])
      .filter((c: Record<string, unknown>) => c.key === key)
      .map((c: Record<string, unknown>) => String(c.value))

  const accountOptions = useMemo(() => {
    const ass = (categories || [])
      .filter((c: Record<string, unknown>) => c.key === 'ass_account')
      .map((c: Record<string, unknown>) => String(c.value))
    const pen = (categories || [])
      .filter((c: Record<string, unknown>) => c.key === 'pen_account')
      .map((c: Record<string, unknown>) => String(c.value))
    const all = Array.from(new Set([...ass, ...pen]))
    return all.sort((a, b) => {
      const ia = ACCOUNT_ORDER.indexOf(a)
      const ib = ACCOUNT_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [categories])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="투자종목 관리" subtitle="종목 추가/수정/삭제 (원장 마스터)" />
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-5 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">계좌</label>
              <select
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              >
                <option value="">선택</option>
                {accountOptions.map((opt: string) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">종목코드</label>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">종목명</label>
              <input
                type="text"
                value={assName}
                onChange={(e) => setAssName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">상품명</label>
              <input
                type="text"
                value={commName}
                onChange={(e) => setCommName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">통화</label>
              <select
                value={assCur}
                onChange={(e) => setAssCur(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              >
                <option value="">선택</option>
                {getCat('ass_cur').map((opt: string) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">자산군</label>
              <select
                value={assClass}
                onChange={(e) => setAssClass(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              >
                <option value="">선택</option>
                {getCat('ass_class').map((opt: string) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">세부자산군</label>
              <select
                value={assClass1}
                onChange={(e) => setAssClass1(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              >
                <option value="">선택</option>
                {getCat('ass_class1').map((opt: string) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">세부자산군2</label>
              <select
                value={assClass2}
                onChange={(e) => setAssClass2(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              >
                <option value="">선택</option>
                {getCat('ass_class2').map((opt: string) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">평가금액</label>
              <input
                type="number"
                value={evalPrice}
                onChange={(e) => setEvalPrice(parseFloat(e.target.value) || 0)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">만기일</label>
              <input
                type="date"
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
                onClick={(e) =>
                  'showPicker' in HTMLInputElement.prototype &&
                  (e.target as HTMLInputElement).showPicker()
                }
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-800">
            {isEditing ? (
              <>
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={!ticker || saveMutation.isPending}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> 수정
                </button>
                <button
                  onClick={() => {
                    if (confirm('삭제하시겠습니까?')) deleteMutation.mutate(editId!)
                  }}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" /> 삭제
                </button>
                <button
                  onClick={resetForm}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-slate-600 hover:bg-slate-500 text-white transition"
                >
                  <X className="w-4 h-4" /> 취소
                </button>
              </>
            ) : (
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!ticker || saveMutation.isPending}
                className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
              >
                <PlusCircle className="w-4 h-4" /> 추가
              </button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* 비파괴 전략 보조 태그 편집기 */}
      <Card className="border-sky-500/20">
        <CardHeader
          title={
            <span className="flex items-center gap-2 text-sky-300">
              <Tags className="w-4 h-4" />
              전략 보조 태그 (Core / Satellite · 원장 무손실)
            </span>
          }
          subtitle="원장 세부자산군2 및 545일 return 테이블을 전혀 수정하지 않고 종목코드 기준 공유 태그로 Core/Satellite, 팩터 클러스터, 연금 안전자산 특례를 관리합니다"
        />
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-4 text-xs">
            <div>
              <label className="text-slate-400 font-medium block mb-1">종목코드 (공유 키)</label>
              <input
                type="text"
                value={tagTicker}
                onChange={(e) => setTagTicker(e.target.value)}
                placeholder="예: 360200"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sky-300 font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">종목/상품명</label>
              <input
                type="text"
                value={tagAssetName}
                onChange={(e) => setTagAssetName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">전략 역할</label>
              <select
                value={strategyRole}
                onChange={(e) => setStrategyRole(e.target.value as StrategyRole)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              >
                <option value="core">core (핵심)</option>
                <option value="satellite">satellite (위성 · ≤20%)</option>
                <option value="cash">cash (현금/RP)</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">팩터 클러스터</label>
              <input
                type="text"
                value={factorCluster}
                onChange={(e) => setFactorCluster(e.target.value)}
                placeholder="예: S&P500, AI/반도체/전력/로봇"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">실질 통화</label>
              <select
                value={economicCurrency}
                onChange={(e) => setEconomicCurrency(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
              >
                <option value="KRW">KRW</option>
                <option value="USD">USD</option>
                <option value="JPY">JPY</option>
                <option value="VND">VND</option>
                <option value="HKD_CNY">HKD_CNY</option>
                <option value="HEDGED">HEDGED</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">β_eq 오버라이드</label>
              <input
                type="number"
                step={0.05}
                value={equityBetaOverride}
                onChange={(e) => setEquityBetaOverride(e.target.value)}
                placeholder="선택 (예: 0.70)"
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={isPensionSafeOverride}
                onChange={(e) => setIsPensionSafeOverride(e.target.checked)}
                className="accent-emerald-500 rounded"
              />
              <span>DC/IRP 70% 한도 산출 시 안전자산(적격 TDF/채권혼합) 특례 인정</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                onClick={() => saveTagMutation.mutate()}
                disabled={!tagTicker || saveTagMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" /> 보조 태그 저장
              </button>
              <button
                onClick={() => deleteTagMutation.mutate()}
                disabled={!tagTicker || deleteTagMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" /> 태그 초기화/삭제
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="등록된 투자종목 목록" />
        <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
          <table className="w-full text-xs sm:text-sm text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                <th className="py-3 px-4 text-center">행번호</th>
                <th className="py-3 px-4">계좌</th>
                <th className="py-3 px-4">종목코드</th>
                <th className="py-3 px-4">전략역할</th>
                <th className="py-3 px-4">팩터 클러스터</th>
                <th className="py-3 px-4">종목명</th>
                <th className="py-3 px-4">상품명</th>
                <th className="py-3 px-4">자산군</th>
                <th className="py-3 px-4">세부자산군</th>
                <th className="py-3 px-4">세부자산군2</th>
                <th className="py-3 px-4">통화</th>
                <th className="py-3 px-4 text-right">평가금액</th>
                <th className="py-3 px-4 text-right">만기일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(() => {
                let displayed = tickersData ? [...(tickersData as Array<Record<string, unknown>>)] : []
                if (account) displayed = displayed.filter((t) => t.계좌 === account)
                displayed.sort((a, b) => (Number(b.행번호) || 0) - (Number(a.행번호) || 0))
                return displayed
              })().map((t) => {
                const rowId = Number(t.행번호)
                const tickerCode = String(t.종목코드 || '')
                const tag = tagMap.get(tickerCode)
                const isSelected = editId === rowId
                return (
                  <tr
                    key={rowId}
                    onClick={() => handleEdit(t)}
                    className={`cursor-pointer transition ${
                      isSelected
                        ? 'bg-emerald-500/20 border-l-4 border-l-emerald-500'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-4 text-center text-slate-500">{rowId}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-200">{String(t.계좌 || '')}</td>
                    <td className="py-2.5 px-4 font-mono text-emerald-400">{tickerCode}</td>
                    <td className="py-2.5 px-4">
                      {tag ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            tag.strategy_role === 'core'
                              ? 'bg-sky-950/60 text-sky-300 border border-sky-700/40'
                              : tag.strategy_role === 'satellite'
                              ? 'bg-purple-950/60 text-purple-300 border border-purple-700/40'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {tag.strategy_role}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[10px]">미지정</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 text-xs">
                      {tag?.factor_cluster || '-'}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-100">{String(t.종목명 || '')}</td>
                    <td className="py-2.5 px-4 text-slate-300">{String(t.상품명 || '')}</td>
                    <td className="py-2.5 px-4 text-slate-400">{String(t.자산군 || '')}</td>
                    <td className="py-2.5 px-4 text-slate-400">{String(t.세부자산군 || '')}</td>
                    <td className="py-2.5 px-4 text-slate-400">{String(t.세부자산군2 || '')}</td>
                    <td className="py-2.5 px-4 text-slate-400">{String(t.통화 || '')}</td>
                    <td className="py-2.5 px-4 text-right font-mono">
                      {formatKRW(Number(t.평가금액) || 0)}
                    </td>
                    <td className="py-2.5 px-4 text-right">{String(t.만기일 || '')}</td>
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
