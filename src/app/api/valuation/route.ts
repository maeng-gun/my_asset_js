import { NextRequest, NextResponse } from 'next/server'
import { runPortfolioValuation } from '@/lib/engine/portfolio-runner'
import { createClient } from '@/lib/supabase/server'

// Vercel 서버리스 함수 실행 제한 시간 최대 60초로 확장 (주식 시세 다건 조회 및 외부 크롤링 지연 방어)
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    let isAuthorized = false

    // 1. Bearer Token 검증 (GitHub Actions / 스케줄러 자동 호출)
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true
    }

    // 2. 로그인된 사용자 세션 검증 (웹 브라우저 UI에서 수동 재계산 클릭)
    if (!isAuthorized) {
      try {
        const supabase = await createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (user) {
          isAuthorized = true
        }
      } catch {
        // 세션 검증 예외 시 무시
      }
    }

    // 3. 로컬 개발 환경 편의성 (개발 환경 및 로컬 desktop_tray_app 수동 호출 지원)
    if (!isAuthorized && process.env.NODE_ENV === 'development') {
      isAuthorized = true
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: 유효한 인증 토큰 또는 로그인 세션이 필요합니다.' },
        { status: 401 }
      )
    }

    const result = await runPortfolioValuation()
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown valuation error'
    console.error('[API /api/valuation] Error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
