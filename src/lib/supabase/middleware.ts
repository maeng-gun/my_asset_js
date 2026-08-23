import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // Supabase URL이 아직 설정되지 않은 초기 로컬 환경 처리
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/auth')
  const isApiRoute = pathname.startsWith('/api')

  // 1. 비로그인 사용자가 대시보드 접근 시 로그인 페이지로 이동
  if (!user && !isAuthRoute && !isApiRoute && pathname !== '/favicon.ico') {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  // 2. 로그인 사용자 화이트리스트 검증 (ALLOWED_EMAILS 존재 시)
  const allowedEmailsRaw = process.env.ALLOWED_EMAILS
  if (user && allowedEmailsRaw && !isAuthRoute) {
    const allowedEmails = allowedEmailsRaw.split(',').map((e) => e.trim().toLowerCase())
    if (user.email && !allowedEmails.includes(user.email.toLowerCase())) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/unauthorized'
      return NextResponse.redirect(url)
    }
  }

  // 3. 이미 로그인한 사용자가 로그인 페이지 진입 시 대시보드로 이동
  if (user && isAuthRoute && pathname === '/auth/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/profit'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
