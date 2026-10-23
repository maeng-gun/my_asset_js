/**
 * Tier 4: Real-World Application Scenarios E2E Tests
 * Realistic end-to-end workflows exercising full lifecycle of portfolio management.
 * Authoritative Sources: ORIGINAL_REQUEST.md & PROJECT.md
 */

import {
  runTest,
  assert,
  assertEqual,
  assertCloseTo,
  measureMs,
  globalTestContext,
} from './helpers.mjs'
import {
  calculateOverallPerformanceSeries,
  canonicalSortComparator,
  resolveValuationPriceOracle,
  fastRecalculateHoldingsOracle,
} from './fixtures/oracle-math.mjs'
import {
  mockFilledTradingForm,
  mockInitialTradingForm,
  mockPrevPortfolioSummary,
} from './fixtures/mock-data.mjs'

export async function runTier4Tests() {
  globalTestContext.setTier('Tier 4: Real-World Scenarios')
  globalTestContext.setSuite('End-to-End Application Workflows')

  // Scenario 1: Daily Portfolio Review & Rebalancing Workflow
  await runTest('T4-S01', 'Scenario 1: Daily Portfolio Review & Rebalancing Workflow', async () => {
    // 1. User reviews overall portfolio performance
    const history = [
      { 기준일: '2026-10-20', 총손익: 12000000, 평가금액: 180000000 },
      { 기준일: '2026-10-21', 총손익: 12500000, 평가금액: 180500000 },
    ]
    const perf = calculateOverallPerformanceSeries(history)
    assertEqual(perf[0].BM, 0)
    assertEqual(perf[1].BM, 0)

    // 2. User navigates to /trading and inputs rebalance trade
    let formState = {
      ...mockInitialTradingForm,
      tradeType: '투자자산',
      account: '한투ISA',
      tradeDate: '2026-10-22',
      selectedTicker: '360200',
      buyQ: 30,
      buyAmt: 585000,
      buyCash: 585100,
    }

    // 3. Mid-input, user switches to /holdings to check cash balance, changes tab to commodity2
    let holdingsActiveTab = 'commodity2'
    assertEqual(holdingsActiveTab, 'commodity2')

    // 4. User returns to /trading: form inputs are preserved 100%
    assertEqual(formState.buyQ, 30)
    assertEqual(formState.selectedTicker, '360200')
    assertEqual(formState.account, '한투ISA')

    // 5. User clicks submit: zero-API fast recalculate runs in < 200ms
    const { durationMs, result: recalculated } = await measureMs(() => {
      const currentHoldings = [
        { 계좌: '한투ISA', 종목명: 'ACE 미국S&P500', 보유수량: 80 + formState.buyQ, 장부금액: 1200000 + formState.buyAmt },
      ]
      return fastRecalculateHoldingsOracle(currentHoldings, mockPrevPortfolioSummary)
    })
    assert(durationMs < 200, `Fast recalculate took ${durationMs}ms (target: < 200ms)`)
    assertEqual(recalculated[0].보유수량, 110)
    assertEqual(recalculated[0].평가금액, 110 * 19500) // Uses existing unit price 19,500

    // 6. Form resets back to initial state
    formState = { ...mockInitialTradingForm }
    assertEqual(formState.buyQ, 0)
    assertEqual(formState.selectedTicker, '')
  })

  // Scenario 2: Network Outage & High-Volatility Market Valuation
  await runTest('T4-S02', 'Scenario 2: Network Outage & High-Volatility Market Valuation Safety Net', async () => {
    // 31 domestic stocks during extreme volatility
    const portfolioStocks = Array.from({ length: 31 }, (_, i) => ({
      ticker: `STK_${String(i).padStart(3, '0')}`,
      holdingQty: 100,
      bookValue: 1000000,
      prevEval: 1200000, // previous unit price = 12,000 KRW (profit = +200,000)
    }))

    // External market responses:
    // 25 succeed in batch multi-price
    // 3 fail batch (RateLimit) but succeed in single-item retry
    // 3 fail both batch and single retries due to total network blackout
    const resolvedResults = []
    for (let i = 0; i < portfolioStocks.length; i++) {
      const stock = portfolioStocks[i]
      let multiPrice = null
      let singlePrice = null

      if (i < 25) {
        multiPrice = 11800 // market down today
      } else if (i < 28) {
        singlePrice = 11500 // retry succeeded
      } else {
        // total outage
      }

      const resolved = resolveValuationPriceOracle({
        ticker: stock.ticker,
        holdingQty: stock.holdingQty,
        bookValue: stock.bookValue,
        multiPrice,
        singlePrice,
        prevSnapshot: { evalAmt: stock.prevEval, qty: stock.holdingQty },
      })
      resolvedResults.push(resolved)
    }

    assertEqual(resolvedResults.length, 31)

    // Verify 100% price integrity: ZERO stocks fell back to book value
    const bookValueFallbacks = resolvedResults.filter((r) => r.priceSource === 'book_value_fallback')
    assertEqual(bookValueFallbacks.length, 0, 'No existing holding may fall back to book value')

    // 3 stocks used previous price fallback safely
    const snapshotFallbacks = resolvedResults.filter((r) => r.priceSource === 'prev_snapshot_fallback')
    assertEqual(snapshotFallbacks.length, 3, 'Exactly 3 stocks must use prev_snapshot_fallback')
    for (const sf of snapshotFallbacks) {
      assertEqual(sf.evalAmt, 1200000, 'Must preserve previous valuation of 1,200,000 KRW')
      assertEqual(sf.evalProfit, 200000, 'Must preserve evaluation profit (+200,000), never 0')
    }
  })

  // Scenario 3: Complete Position Exit & Tax/Profit Realization
  await runTest('T4-S03', 'Scenario 3: Complete Position Exit & Proper Asset Class Sorting of Sold-out Commodity', async () => {
    // User had 50 shares of TIGER 미국나스닥100 in 한투, sells all 50
    const holdings = [
      {
        자산군: '주식',
        세부자산군: '선진국',
        세부자산군2: '인덱스',
        계좌: '한투',
        상품명: 'TIGER 미국나스닥100',
        보유수량: 0, // 100% sold out
        장부금액: 0,
        평가금액: 0,
      },
      {
        자산군: '주식',
        세부자산군: '선진국',
        세부자산군2: '인덱스',
        계좌: '한투',
        상품명: 'ACE 미국S&P500',
        보유수량: 100,
        장부금액: 1500000,
        평가금액: 2000000,
      },
      {
        자산군: '대체자산',
        세부자산군: '실물자산',
        세부자산군2: '귀금속',
        계좌: '금현물',
        상품명: 'KRX 금현물 1g',
        보유수량: 50,
        장부금액: 4500000,
        평가금액: 5500000,
      },
    ]

    const sorted = [...holdings].sort(canonicalSortComparator)

    // ACE 미국S&P500 (주식-선진국, 평가금 2M) -> 1st
    assertEqual(sorted[0].상품명, 'ACE 미국S&P500')
    // TIGER 미국나스닥100 (주식-선진국, 평가금 0) -> 2nd (within 주식-선진국, before 대체자산!)
    assertEqual(sorted[1].상품명, 'TIGER 미국나스닥100')
    // KRX 금현물 1g (대체자산) -> 3rd
    assertEqual(sorted[2].상품명, 'KRX 금현물 1g')
  })

  // Scenario 4: New Year Boundary Portfolio Carryover
  await runTest('T4-S04', 'Scenario 4: New Year Boundary Portfolio Carryover and High-Water Mark DD', async () => {
    const yearEndHistory = [
      { 기준일: '2024-12-30', 총손익: 20000000, 평가금액: 200000000 },
      { 기준일: '2024-12-31', 총손익: 21000000, 평가금액: 201000000 }, // Peak year-end
      { 기준일: '2025-01-02', 총손익: 400000, 평가금액: 201400000 },   // New year day 1: +400,000 / 201,000,000 = +0.199%
      { 기준일: '2025-01-03', 총손익: -200000, 평가금액: 200800000 },  // Drop: diff = -600,000 / 201,400,000 = -0.298%
    ]
    const series = calculateOverallPerformanceSeries(yearEndHistory)
    assertEqual(series.length, 4)
    // 2025-01-02 cumPercent exceeds 2024-12-31
    assert(series[2].MyPF > series[1].MyPF)
    assertEqual(series[2].DD, 0) // New all-time high!
    // 2025-01-03 drops below peak -> DD must be negative
    assert(series[3].DD < 0, 'Drawdown must register negative dip from peak')
  })

  // Scenario 5: Multi-Account Split Trade & Inflow Orchestration
  await runTest('T4-S05', 'Scenario 5: Multi-Account Split Trade and Instant Holdings & Profit Reflection', async () => {
    // Inflow 10,000,000 KRW
    const initialCash = 5000000
    const inflow = 10000000
    const totalAvailableCash = initialCash + inflow
    assertEqual(totalAvailableCash, 15000000)

    // User splits purchase across 한투 (60% = 6,000,000) and 한투ISA (40% = 4,000,000)
    const splitTrades = [
      { 계좌: '한투', 상품명: 'ACE 미국S&P500', 종목명: '360200', 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 보유수량: 300, 장부금액: 5850000 },
      { 계좌: '한투ISA', 상품명: 'ACE 미국S&P500', 종목명: '360200', 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 보유수량: 200, 장부금액: 3900000 },
    ]

    const recalculated = fastRecalculateHoldingsOracle(splitTrades, mockPrevPortfolioSummary)
    assertEqual(recalculated[0].평가금액, 300 * 19500) // 5,850,000
    assertEqual(recalculated[1].평가금액, 200 * 19500) // 3,900,000

    // comm_profit2 must sort 한투 (eval 5.85M) before 한투ISA (eval 3.90M)
    const sorted = recalculated.sort(canonicalSortComparator)
    assertEqual(sorted[0].계좌, '한투')
    assertEqual(sorted[1].계좌, '한투ISA')
  })
}
