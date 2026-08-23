import { NextResponse } from 'next/server'

export async function POST() {
  try {
    // 500ms 후 Node.js 프로세스 정상 종료 (HTTP 응답이 브라우저에 안전하게 전달된 후 종료)
    setTimeout(() => {
      console.log('[System] Shutting down MyAsset background server...')
      process.exit(0)
    }, 500)

    return NextResponse.json({
      success: true,
      message: 'MyAsset 서버가 정상적으로 종료되었습니다.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Shutdown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
