'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { getTickers, getCategories, addTicker, updateTicker, deleteTicker } from '@/lib/actions/db'
import { formatKRW } from '@/lib/utils'
import { toast } from 'sonner'
import { PlusCircle, Edit2, Trash2, Check, X } from 'lucide-react'
import { format } from 'date-fns'

export default function AssetSettingsPage() {
  const queryClient = useQueryClient()
  const [tradeType, setTradeType] = useState<'투자자산' | '연금자산'>('투자자산')
  
  // 폼 상태
  const [isEditing, setIsEditing] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [account, setAccount] = useState('')
  const [ticker, setTicker] = useState('')
  const [assName, setAssName] = useState('')
  const [commName, setCommName] = useState('')
  const [assClass, setAssClass] = useState('')
  const [assClass1, setAssClass1] = useState('')
  const [assClass2, setAssClass2] = useState('')
  const [assCur, setAssCur] = useState('')
  const [evalPrice, setEvalPrice] = useState(0)
  const [maturityDate, setMaturityDate] = useState(format(new Date(), 'yyyy-MM-dd'))

  const { data: tickersData, isLoading: isTickersLoading } = useQuery({
    queryKey: ['tickers-list', tradeType],
    queryFn: async () => await getTickers(tradeType),
  })

  const { data: categories } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => await getCategories(),
  })

  const resetForm = () => {
    setIsEditing(false)
    setEditId(null)
    setAccount('')
    setTicker('')
    setAssName('')
    setCommName('')
    setAssClass('')
    setAssClass1('')
    setAssClass2('')
    setAssCur('')
    setEvalPrice(0)
    setMaturityDate(format(new Date(), 'yyyy-MM-dd'))
  }

  const handleEdit = (t: any) => {
    setIsEditing(true)
    setEditId(t.행번호)
    setAccount(t.계좌 || '')
    setTicker(t.종목코드 || '')
    setAssName(t.종목명 || '')
    setCommName(t.상품명 || '')
    setAssClass(t.자산군 || '')
    setAssClass1(t.세부자산군 || '')
    setAssClass2(t.세부자산군2 || '')
    setAssCur(t.통화 || '')
    setEvalPrice(t.평가금액 || 0)
    setMaturityDate(t.만기일 || format(new Date(), 'yyyy-MM-dd'))
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
                  setTradeType(e.target.value as any)
                  resetForm()
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
              <input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 pt-4 border-t border-slate-800">
            {isEditing ? (
              <>
                <button onClick={() => saveMutation.mutate()} disabled={!ticker || saveMutation.isPending} className="flex items-center gap-2 px-6 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50">
                  <Check className="w-4 h-4" /> 수정
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
        <CardBody className="p-0 overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/90 text-slate-400 border-b border-slate-800 font-medium">
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
                <th className="py-3 px-4 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {(tickersData || []).map((t: any) => (
                <tr key={t.행번호} className="hover:bg-slate-800/40 transition">
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
                  <td className="py-2.5 px-4 text-right">
                    <button onClick={() => handleEdit(t)} className="p-1.5 text-blue-400 hover:bg-blue-400/20 rounded mr-1">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => { if(confirm('삭제하시겠습니까?')) deleteMutation.mutate(t.행번호) }} className="p-1.5 text-rose-400 hover:bg-rose-400/20 rounded">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  )
}
