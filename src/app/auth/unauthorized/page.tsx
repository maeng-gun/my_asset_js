'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ShieldAlert, LogOut } from 'lucide-react'

export default function UnauthorizedPage() {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-slate-800 shadow-2xl text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mb-4 shadow-inner">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-slate-100 mb-2">접근 권한이 없습니다</h1>
        <p className="text-sm text-slate-400 leading-relaxed mb-6">
          해당 계정은 시스템 접근이 승인되지 않았습니다. 관리자(허용 이메일 목록)에 등록된 계정으로 로그인해 주세요.
        </p>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.99] text-slate-100 font-medium border border-slate-700 transition duration-150 shadow-sm text-sm"
        >
          <LogOut className="w-4 h-4" />
          다른 계정으로 로그인
        </button>
      </div>
    </div>
  )
}
