import { NextRequest, NextResponse } from 'next/server'
import { buildTickerAnalysisData } from '@/lib/engine/ticker-analysis'
import { subYears, format } from 'date-fns'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const ticker = searchParams.get('ticker')
    const benchmark = searchParams.get('benchmark') || 'SPY'
    
    // 기본 시작일: 3년 전
    const defaultStart = format(subYears(new Date(), 3), 'yyyy-MM-dd')
    const defaultEnd = format(new Date(), 'yyyy-MM-dd')
    
    const startDate = searchParams.get('startDate') || defaultStart
    const endDate = searchParams.get('endDate') || defaultEnd

    if (!ticker) {
      return NextResponse.json({ success: false, error: 'Ticker is required' }, { status: 400 })
    }

    const data = await buildTickerAnalysisData(ticker, benchmark, startDate, endDate)
    return NextResponse.json({ success: true, data })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during ticker analysis'
    console.error('[API /api/ticker]', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
