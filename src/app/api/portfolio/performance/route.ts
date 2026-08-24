import { NextRequest, NextResponse } from 'next/server'
import { buildAssetPerformanceData, buildPortfolioBenchmark } from '@/lib/engine/asset-performance'
import { subYears, format } from 'date-fns'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'asset' // 'asset' | 'portfolio'
    
    // 기본 시작일: 3년 전
    const defaultStart = format(subYears(new Date(), 3), 'yyyy-MM-dd')
    const defaultEnd = format(new Date(), 'yyyy-MM-dd')
    
    const startDate = searchParams.get('startDate') || defaultStart
    const endDate = searchParams.get('endDate') || defaultEnd

    let data;
    if (type === 'portfolio') {
      const bms = searchParams.get('benchmarks')?.split(',') || ['SPY', 'AOR']
      data = await buildPortfolioBenchmark(bms, startDate, endDate)
    } else {
      const classes = searchParams.get('classes')?.split(',') || ['주식', '채권', '대체자산', '현금성', '외화자산']
      data = await buildAssetPerformanceData(classes, startDate, endDate)
    }

    return NextResponse.json({ success: true, data })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error during performance fetch'
    console.error('[API /api/portfolio/performance]', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
