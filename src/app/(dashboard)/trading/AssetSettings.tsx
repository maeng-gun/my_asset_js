'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { getTickers, getCategories, addTicker, updateTicker, deleteTicker } from '@/lib/actions/db'
import { formatKRW } from '@/lib/utils'
import { toast } from 'sonner'
import { PlusCircle, Edit2, Trash2, Check, X } from 'lucide-react'
import { format } from 'date-fns'
import { useAssetSettingsStore, resetAssetSettingsForm, DEFAULT_ASSET_SETTINGS_FORM } from '@/lib/stores/navigation-state'

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

  const setTradeType = (val: '투자자산' | '연금자산') => setAssetSettingsForm({ tradeType: val })
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

  const { data: tickersData, isLoading: isTickersLoading } = useQuery({
    queryKey: ['tickers-list', tradeType],
    queryFn: async () => await getTickers(tradeType),
  })

  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => await getCategories(),
  })

  const resetForm = () => {
    resetAssetSettingsForm()
  }

  const handleEdit = (t: any) => {
    setAssetSettingsForm({
      isEditing: true,
      editId: t.행번호,
      account: t.계좌 || '',
      ticker: t.종목코드 || '',
      assName: t.종목명 || '',
      commName: t.상품명 || '',
      assClass: t.자산군 || '',
      assClass1: t.세부자산군 || '',
      assClass2: t.세부자산군2 || '',
      assCur: t.통화 || '',
      evalPrice: t.평가금액 || 0,
      maturityDate: t.만기일 || format(new Date(), 'yyyy-MM-dd'),
    })
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
    onError: (err: any) => {
      toast.error(`오류: ${err.message}`)
    }
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
    onError: (err: any) => {
      toast.error(`삭제 오류: ${err.message}`)
    }
  })

  const getCat = (key: string) => (categories || []).filter((c: any) => c.key === key).map((c: any) => c.value)

  const accountOptions = tradeType === '투자자산' ? getCat('ass_account') : getCat('pen_account')

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="투자종목 관리" subtitle="종목 추가/수정/삭제" />
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">운용구분</label>
              <select
                value={tradeType}
                onChange={(e) => {
                  setAssetSettingsForm({
                    ...DEFAULT_ASSET_SETTINGS_FORM,
                    tradeType: e.target.value as any,
                  })
                }}
                className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100"
              >
                <option value="투자자산">투자자산</option>
                <option value="연금자산">연금자산</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">계좌</label>
              <select value={account} onChange={(e) => setAccount(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100">
                <option value="">선택</option>
                {accountOptions.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">종목코드</label>
              <input type="text" value={ticker} onChange={(e) => setTicker(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">종목명</label>
              <input type="text" value={assName} onChange={(e) => setAssName(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">상품명</label>
              <input type="text" value={commName} onChange={(e) => setCommName(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">자산군</label>
              <select value={assClass} onChange={(e) => setAssClass(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100">
                <option value="">선택</option>
                {getCat('ass_class').map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">세부자산군</label>
              <select value={assClass1} onChange={(e) => setAssClass1(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100">
                <option value="">선택</option>
                {getCat('ass_class1').map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">세부자산군2</label>
              <select value={assClass2} onChange={(e) => setAssClass2(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100">
                <option value="">선택</option>
                {getCat('ass_class2').map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">통화</label>
              <select value={assCur} onChange={(e) => setAssCur(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100">
                <option value="">선택</option>
                {getCat('ass_cur').map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">평가금액</label>
              <input type="number" value={evalPrice} onChange={(e) => setEvalPrice(parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 font-mono" />
            </div>
            <div>
              <label className="text-xs text-slate-400 font-medium block mb-1">만기일</label>
              <input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} onClick={(e) => 'showPicker' in HTMLInputElement.prototype && (e.target as HTMLInputElement).showPicker()} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 cursor-pointer" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-800">
            {isEditing ? (
              <>
                <button onClick={() => saveMutation.mutate()} disabled={!ticker || saveMutation.isPending} className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50">
                  <Check className="w-4 h-4" /> 수정
                </button>
                <button onClick={() => { if(confirm('삭제하시겠습니까?')) deleteMutation.mutate(editId!) }} disabled={deleteMutation.isPending} className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition disabled:opacity-50">
                  <Trash2 className="w-4 h-4" /> 삭제
                </button>
                <button onClick={resetForm} className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-slate-600 hover:bg-slate-500 text-white transition">
                  <X className="w-4 h-4" /> 취소
                </button>
              </>
            ) : (
              <button onClick={() => saveMutation.mutate()} disabled={!ticker || saveMutation.isPending} className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50">
                <PlusCircle className="w-4 h-4" /> 추가
              </button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="등록된 투자종목 목록" />
        <CardBody className="p-0 overflow-auto max-h-[calc(100vh-350px)]">
          <table className="w-full text-xs sm:text-sm text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                <th className="py-3 px-4 text-center">행번호</th>
                <th className="py-3 px-4">계좌</th>
                <th className="py-3 px-4">종목코드</th>
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
                let displayed = tickersData ? [...tickersData] : []
                if (account) displayed = displayed.filter((t: any) => t.계좌 === account)
                // 행번호 기준 내림차순(역순) 정렬
                displayed.sort((a: any, b: any) => (b.행번호 || 0) - (a.행번호 || 0))
                return displayed
              })().map((t: any) => {
                const isSelected = editId === t.행번호;
                return (
                  <tr 
                    key={t.행번호} 
                    onClick={() => handleEdit(t)} 
                    className={`cursor-pointer transition ${isSelected ? 'bg-emerald-500/20 border-l-4 border-l-emerald-500' : 'hover:bg-slate-800/40'}`}
                  >
                    <td className="py-2.5 px-4 text-center text-slate-500">{t.행번호}</td>
                    <td className="py-2.5 px-4 font-semibold text-slate-200">{t.계좌}</td>
                    <td className="py-2.5 px-4 font-mono text-emerald-400">{t.종목코드}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-100">{t.종목명}</td>
                    <td className="py-2.5 px-4 text-slate-300">{t.상품명}</td>
                    <td className="py-2.5 px-4 text-slate-400">{t.자산군}</td>
                    <td className="py-2.5 px-4 text-slate-400">{t.세부자산군}</td>
                    <td className="py-2.5 px-4 text-slate-400">{t.세부자산군2}</td>
                    <td className="py-2.5 px-4 text-slate-400">{t.통화}</td>
                    <td className="py-2.5 px-4 text-right font-mono">{formatKRW(t.평가금액 || 0)}</td>
                    <td className="py-2.5 px-4 text-right">{t.만기일}</td>
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
