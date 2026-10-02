'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const isFirstMountRef = useRef(true)

  useEffect(() => {
    // 최초 마운트 시에는 불필요한 토스트 방지
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false
    }

    const channel = supabase
      .channel('realtime_portfolio_summary')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'latest_portfolio_summary',
        },
        () => {
          // 캐시 무효화로 대시보드, 손익현황, 보유현황 데이터 즉시 백그라운드 재조회
          queryClient.invalidateQueries({ queryKey: ['latest-portfolio-summary'] })
          queryClient.invalidateQueries({ queryKey: ['profit-return-data'] })
          toast.info('최신 시세로 자산 평가가 실시간 갱신되었습니다.', {
            id: 'realtime-update',
            duration: 3500,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, supabase])

  return <>{children}</>
}
