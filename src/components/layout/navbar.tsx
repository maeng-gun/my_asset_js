'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  TrendingUp,
  Receipt,
  Coins,
  LineChart,
  Lightbulb,
  Layers,
  Activity,
  RefreshCw,
  RotateCcw,
  Power,
  Menu,
  X,
  Tag,
  MoreVertical,
} from 'lucide-react'

const NAV_ITEMS = [
  { name: '손익현황', href: '/profit', icon: LineChart },
  { name: '보유현황', href: '/holdings', icon: Coins },
  { name: '운용기록', href: '/trading', icon: Receipt },
  { name: '투자전략', href: '/strategy/investment', icon: Lightbulb },
  { name: '배분전략', href: '/strategy/allocation', icon: Layers },
  { name: '유동성 관리', href: '/liquidity', icon: Activity },
  ]

export function Navbar() {
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const supabase = createClient()

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.actions-dropdown')) {
        setActionsMenuOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])
  const [isRevaluing, setIsRevaluing] = useState(false)
  const [isRenewing, setIsRenewing] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const hasAutoCheckedRef = useRef(false)

  // 평가금액 재계산 실행 함수 (수동 or 자동)
  const handleReval = async (isAuto = false) => {
    setIsRevaluing(true)
    const toastId = isAuto ? 'auto-reval' : 'reval'
    const loadingMsg = isAuto
      ? '오늘 첫 접속: 실시간 시세 및 포트폴리오를 백그라운드에서 동기화 중입니다...'
      : '평가금액 재계산 및 시세 업데이트 중...'

    toast.loading(loadingMsg, { id: toastId })
    try {
      const resp = await fetch('/api/valuation', { method: 'POST' })
      const json = await resp.json()
      if (!resp.ok || !json.success) {
        throw new Error(json.error || '재계산 실패')
      }
      const successMsg = isAuto
        ? '오늘자 최신 시세로 포트폴리오가 갱신되었습니다!'
        : '평가금액 재계산이 완료되었습니다!'
      toast.success(successMsg, { id: toastId })
      await queryClient.invalidateQueries()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : '오류 발생'
      toast.error(`재계산 오류: ${errorMsg}`, { id: toastId })
    } finally {
      setIsRevaluing(false)
    }
  }

  // 앱 첫 접속 시 오늘자 스냅샷 확인 후 백그라운드 자동 갱신 트리거
  useEffect(() => {
    if (hasAutoCheckedRef.current) return
    hasAutoCheckedRef.current = true

    const checkAndAutoRevalue = async () => {
      try {
        const todayStr = format(new Date(), 'yyyy-MM-dd')
        const { data: summary } = (await supabase
          .from('latest_portfolio_summary')
          .select('*')
          .eq('id', 'latest')
          .single()) as { data: any }

        const isToday = summary?.기준일 === todayStr

        // 스냅샷이 없거나 오늘 기준일이 아닌 경우 (오늘 첫 접속)
        if (!summary || !isToday) {
          handleReval(true)
        }
      } catch (err) {
        console.warn('[Navbar] Auto revaluation check error:', err)
      }
    }

    checkAndAutoRevalue()
  }, [])

  // 기초평가손익 갱신 실행
  const handleRenewEval = async () => {
    if (!confirm('전년도 말 평가손익으로 기초평가손익을 갱신하시겠습니까?')) return
    setIsRenewing(true)
    toast.loading('기초평가손익 갱신 중...', { id: 'renew' })
    try {
      const resp = await fetch('/api/renew-eval', { method: 'POST' })
      const json = await resp.json()
      if (!resp.ok || !json.success) {
        throw new Error(json.error || '갱신 실패')
      }
      toast.success(json.message || '기초평가손익이 갱신되었습니다!', { id: 'renew' })
      await queryClient.invalidateQueries()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : '오류 발생'
      toast.error(`갱신 오류: ${errorMsg}`, { id: 'renew' })
    } finally {
      setIsRenewing(false)
    }
  }

  // 백그라운드 3000 포트 서버 프로세스 종료 및 앱 나가기
  const handleExit = async () => {
    if (!confirm('MyAsset 백그라운드 서버를 완전히 종료하고 나가시겠습니까?')) return
    setIsExiting(true)
    toast.loading('백그라운드 서버를 종료하는 중입니다...', { id: 'exit' })
    try {
      await fetch('/api/system/shutdown', { method: 'POST' }).catch(() => {})
      toast.success('MyAsset 서버가 종료되었습니다. 브라우저 탭을 닫아주세요.', { id: 'exit' })
      setTimeout(() => {
        window.close()
      }, 1000)
    } catch {
      toast.success('서버가 종료되었습니다.', { id: 'exit' })
    } finally {
      setIsExiting(false)
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100 shadow-lg">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* 로고 및 앱 타이틀 */}
          <div className="flex items-center gap-3">
            <Link href="/profit" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-inner group-hover:scale-105 transition">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
                포트폴리오 관리
              </span>
            </Link>

            {/* 데스크톱 메뉴 탭 */}
            <nav className="hidden lg:flex items-center gap-1 ml-6">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || (item.href !== '/profit' && pathname.startsWith(item.href))
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition duration-150 whitespace-nowrap ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 shadow-sm'
                        : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* 우측 글로벌 액션 버튼 (드롭다운) */}
          <div className="hidden sm:flex items-center gap-2 relative actions-dropdown">
            <button
              onClick={() => setActionsMenuOpen(!actionsMenuOpen)}
              className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 transition"
              title="추가 작업"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {actionsMenuOpen && (
              <div className="absolute right-0 top-12 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-xl p-2 flex flex-col gap-1 z-50">
                <button
                  onClick={() => { handleReval(false); setActionsMenuOpen(false); }}
                  disabled={isRevaluing}
                  className="flex items-center justify-start gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 transition"
                >
                  <RefreshCw className={`w-4 h-4 ${isRevaluing ? 'animate-spin' : ''}`} />
                  평가금액 재계산
                </button>
                <button
                  onClick={() => { handleRenewEval(); setActionsMenuOpen(false); }}
                  disabled={isRenewing}
                  className="flex items-center justify-start gap-2 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-slate-800 text-slate-200 transition"
                >
                  <RotateCcw className={`w-4 h-4 ${isRenewing ? 'animate-spin' : ''}`} />
                  기초손익 갱신
                </button>
                <div className="h-px w-full bg-slate-800 my-1"></div>
                <button
                  onClick={() => { handleExit(); setActionsMenuOpen(false); }}
                  disabled={isExiting}
                  className="flex items-center justify-start gap-2 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-rose-900/40 text-rose-400 transition"
                >
                  <Power className="w-4 h-4" />
                  나가기
                </button>
              </div>
            )}
          </div>

          {/* 모바일 햄버거 버튼 */}
          <div className="flex lg:hidden items-center gap-2">
            <button
              onClick={() => handleReval(false)}
              disabled={isRevaluing}
              className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30"
              title="평가금액 재계산"
            >
              <RefreshCw className={`w-4 h-4 ${isRevaluing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-300 hover:bg-slate-800 transition"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* 모바일 드로어 메뉴 */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-900/95 px-4 pt-3 pb-5 space-y-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || (item.href !== '/profit' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </Link>
            )
          })}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <button
              onClick={handleRenewEval}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 py-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              기초평가손익 갱신
            </button>
            <button
              onClick={handleExit}
              className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1.5 py-1.5 font-semibold"
            >
              <Power className="w-3.5 h-3.5" />
              서버 종료 및 나가기
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
