'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { getCategories, addCategory, deleteCategory } from '@/lib/actions/db'
import { toast } from 'sonner'
import { PlusCircle, Trash2 } from 'lucide-react'

const CAT_KEYS = [
  { key: 'ass_account', label: '투자계좌' },
  { key: 'pen_account', label: '연금계좌' },
  { key: 'ass_cur', label: '통화' },
  { key: 'ass_class', label: '자산군' },
  { key: 'ass_class1', label: '세부자산군' },
  { key: 'ass_class2', label: '세부자산군2' },
]

export default function GroupSettingsPage() {
  const queryClient = useQueryClient()
  
  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories-list'],
    queryFn: async () => await getCategories(),
  })

  const addMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await addCategory(key, value)
    },
    onSuccess: () => {
      toast.success('항목이 추가되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['categories-list'] })
    },
    onError: (err: any) => {
      toast.error(`추가 오류: ${err.message}`)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await deleteCategory(key, value)
    },
    onSuccess: () => {
      toast.success('항목이 삭제되었습니다.')
      queryClient.invalidateQueries({ queryKey: ['categories-list'] })
    },
    onError: (err: any) => {
      toast.error(`삭제 오류: ${err.message}`)
    }
  })

  const CategorySection = ({ cKey, label }: { cKey: string; label: string }) => {
    const [newValue, setNewValue] = useState('')
    const items = (categories || []).filter((c: any) => c.key === cKey)

    const handleAdd = () => {
      if (!newValue.trim()) return
      addMutation.mutate({ key: cKey, value: newValue.trim() })
      setNewValue('')
    }

    return (
      <Card>
        <CardHeader title={label} />
        <CardBody>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="새 항목 이름"
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              className="flex-1 px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-100"
            />
            <button
              onClick={handleAdd}
              disabled={!newValue.trim() || addMutation.isPending}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition disabled:opacity-50 flex items-center justify-center"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-2">
            {items.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                <span className="text-sm font-medium text-slate-200">{c.value}</span>
                <button
                  onClick={() => { if(confirm('삭제하시겠습니까?')) deleteMutation.mutate({ key: cKey, value: c.value }) }}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 text-rose-400 hover:bg-rose-400/20 rounded transition disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {items.length === 0 && <div className="text-xs text-slate-500 text-center py-2">항목이 없습니다.</div>}
          </div>
        </CardBody>
      </Card>
    )
  }

  if (isLoading) return <div className="p-8 text-center text-slate-500">로딩 중...</div>

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {CAT_KEYS.map(cat => (
        <CategorySection key={cat.key} cKey={cat.key} label={cat.label} />
      ))}
    </div>
  )
}
