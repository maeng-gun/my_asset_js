import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/profit'

  // 로컬 호스트 판별 유틸 (로컬 데스크톱 프로덕션 환경 포함)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = forwardedHost || request.headers.get('host') || ''
  const isLocalHost =
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('0.0.0.0') ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('0.0.0.0')

  const localTarget = host.includes('127.0.0.1')
    ? `http://${host}`
    : host.includes('localhost')
      ? `http://${host}`
      : origin.replace('0.0.0.0', '127.0.0.1')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      if (isLocalHost) {
        return NextResponse.redirect(`${localTarget}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // 오류 발생 시 로그인 페이지로 에러 파라미터와 함께 이동
  const fallbackBase = isLocalHost ? localTarget : origin
  return NextResponse.redirect(`${fallbackBase}/auth/login?error=auth_failed`)
}
