import { NextResponse } from 'next/server'
import { runPortfolioValuation } from '@/lib/engine/portfolio-runner'

export async function POST() {
  try {
    const result = await runPortfolioValuation()
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown valuation error'
    console.error('[API /api/valuation] Error:', err)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
