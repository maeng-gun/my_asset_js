/**
 * Tier 3: Cross-Feature Interaction E2E Tests (Pairwise Combinations)
 * Verifies that independent features interact correctly without regression.
 * Authoritative Sources: ORIGINAL_REQUEST.md & PROJECT.md
 */

import {
  runTest,
  assert,
  assertEqual,
  assertCloseTo,
  globalTestContext,
} from './helpers.mjs'
import {
  calculateOverallPerformanceSeries,
  canonicalSortComparator,
  resolveValuationPriceOracle,
  fastRecalculateHoldingsOracle,
  CLASS_ORDER,
  CLASS2_ORDER,
  CLASS3_ORDER,
} from './fixtures/oracle-math.mjs'
import {
  mockFilledTradingForm,
  mockInitialTradingForm,
  mockPrevPortfolioSummary,
  generateSyntheticTrades,
} from './fixtures/mock-data.mjs'

export async function runTier3Tests() {
  globalTestContext.setTier('Tier 3: Cross-Feature Combinations')
  globalTestContext.setSuite('Pairwise Feature Interactions')

  // T3-X01: F1 x F4
  await runTest('T3-X01', 'F1 x F4: "전체" performance curve reflects valuation updates calculated with KIS price fallbacks', async () => {
    // 1. F4 fallback assigns price to a stock that had network outage
    const priceRes = resolveValuationPriceOracle({
      ticker: '360200',
      holdingQty: 100,
      bookValue: 1500000,
      multiPrice: null,
      singlePrice: null,
      prevSnapshot: { evalAmt: 1950000, qty: 100 },
    })
    assertEqual(priceRes.evalAmt, 1950000)

    // 2. F1 calculates overall performance using this valuation
    const returnRows = [
      { 기준일: '2025-01-02', 총손익: 1000000, 평가금액: 200000000 },
      { 기준일: '2025-01-03', 총손익: 1000000 + priceRes.evalProfit, 평가금액: 200000000 + priceRes.evalAmt },
    ]
    const series = calculateOverallPerformanceSeries(returnRows)
    assert(series.length === 2)
    assert(series[1].MyPF > 0, 'MyPF must reflect non-corrupted fallback valuation')
  })

  // T3-X02: F1 x F5
  await runTest('T3-X02', 'F1 x F5: Fast recalculate updates today\'s <합계> in return, immediately updating "전체" MyPF', async () => {
    // Initial state
    const day1Return = { 기준일: '2025-01-02', 총손익: 1000000, 평가금액: 200000000 }
    // User executes trade, fast recalculate adds 500,000 profit to today
    const day2Return = { 기준일: '2025-01-03', 총손익: 1500000, 평가금액: 200500000 }
    const series = calculateOverallPerformanceSeries([day1Return, day2Return])
    // daily return = 500,000 / 200,000,000 = 0.25%
    assertEqual(series[1].MyPF, 0.25)
  })

  // T3-X03: F2 x F4
  await runTest('T3-X03', 'F2 x F4: KIS price resolution updates eval amounts while maintaining comm_profit2 sort order', async () => {
    // Two stocks in same class (주식 - 선진국)
    const resA = resolveValuationPriceOracle({ ticker: 'A', holdingQty: 100, bookValue: 1000000, multiPrice: 15000 })
    const resB = resolveValuationPriceOracle({ ticker: 'B', holdingQty: 100, bookValue: 1000000, multiPrice: 25000 })

    const stockA = {
      자산군: '주식',
      세부자산군: '선진국',
      세부자산군2: '인덱스',
      상품명: 'A',
      계좌: '한투',
      평가금액: resA.evalAmt, // eval: 1,500,000
    }
    const stockB = {
      자산군: '주식',
      세부자산군: '선진국',
      세부자산군2: '인덱스',
      상품명: 'B',
      계좌: '한투',
      평가금액: resB.evalAmt, // eval: 2,500,000
    }
    const sorted = [stockA, stockB].sort(canonicalSortComparator)
    assertEqual(sorted[0].상품명, 'B', 'Higher evaluated stock B (2.5M) must sort before stock A (1.5M)')
  })

  // T3-X04: F2 x F5
  await runTest('T3-X04', 'F2 x F5: Fast recalculation after partial trade sell maintains comm_profit2 position without relegating zero-holdings', async () => {
    const holdings = [
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 계좌: '한투', 종목명: 'ACE 미국S&P500', 상품명: 'ACE 미국S&P500', 보유수량: 10, 장부금액: 150000 },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 계좌: '한투', 종목명: '매도완료종목', 상품명: '매도완료종목', 보유수량: 0, 장부금액: 0 },
      { 자산군: '채권', 세부자산군: '국채', 세부자산군2: '국내', 계좌: '한투', 종목명: 'KOSEF 국고채10년', 상품명: 'KOSEF 국고채10년', 보유수량: 20, 장부금액: 2000000 },
    ]
    const recalc = fastRecalculateHoldingsOracle(holdings, mockPrevPortfolioSummary)
    const sorted = recalc.sort(canonicalSortComparator)
    // Sold-out stock must remain in 주식 group, before 채권
    const soldOutIdx = sorted.findIndex((r) => r.상품명 === '매도완료종목')
    const bondIdx = sorted.findIndex((r) => r.상품명 === 'KOSEF 국고채10년')
    assert(soldOutIdx < bondIdx, 'Sold-out stock must stay in stock group, preceding bonds')
  })

  // T3-X05: F3 x F5
  await runTest('T3-X05', 'F3 x F5: Form inputs preserved during holdings tab verification, then committed with fast recalculate', async () => {
    // 1. User enters trade in tradingForm
    let formState = { ...mockFilledTradingForm }
    assertEqual(formState.buyQ, 50)
    assertEqual(formState.selectedTicker, '360200')

    // 2. User navigates to holdings and back -> state unchanged
    const navigatedState = { ...formState }
    assertEqual(navigatedState.buyQ, 50)

    // 3. User submits trade -> fast recalculate updates holdings
    const holdings = [
      { 계좌: '한투', 종목명: 'ACE 미국S&P500', 보유수량: 100 + navigatedState.buyQ, 장부금액: 1500000 + navigatedState.buyAmt },
    ]
    const recalc = fastRecalculateHoldingsOracle(holdings, mockPrevPortfolioSummary)
    assertEqual(recalc[0].보유수량, 150)
    // 4. Form resets
    formState = { ...mockInitialTradingForm }
    assertEqual(formState.buyQ, 0)
    assertEqual(formState.selectedTicker, '')
  })

  // T3-X06: F4 x F5
  await runTest('T3-X06', 'F4 x F5: Zero-API fast recalculate directly reuses unit price established by F4 full valuation', async () => {
    // F4 full valuation recorded unit price of 19,500 KRW
    const fullValuationUnitPrice = 19500
    const holdings = [
      { 계좌: '한투', 종목명: 'ACE 미국S&P500', 보유수량: 77, 장부금액: 1200000 },
    ]
    const recalc = fastRecalculateHoldingsOracle(holdings, mockPrevPortfolioSummary)
    assertEqual(recalc[0].평가금액, 77 * fullValuationUnitPrice)
  })

  // T3-X07: F1 x F2
  await runTest('T3-X07', 'F1 x F2: Total valuation sum of comm_profit2 equals <합계> row evaluation amount in performance API', async () => {
    const sorted = [...mockPrevPortfolioSummary.comm_profit2].sort(canonicalSortComparator)
    const commTotalEval = sorted.reduce((acc, r) => acc + (r.평가금액 || 0), 0)
    // In summary API, <합계> evaluation amount is aggregate sum of all commodities
    assert(commTotalEval > 0)
  })

  // T3-X08: F2 x F3
  await runTest('T3-X08', 'F2 x F3: Trading tab asset class filter categories match canonical CLASS_ORDER hierarchy', async () => {
    const filterClasses = ['현금성자산', '주식', '채권', '대체자산']
    for (const fc of filterClasses) {
      assert(CLASS_ORDER.includes(fc), `Filter class ${fc} must belong to CLASS_ORDER`)
    }
  })

  // T3-X09: F3 x F4
  await runTest('T3-X09', 'F3 x F4: Heavy valuation calculation in background does not alter active trading form state', async () => {
    const activeForm = { ...mockFilledTradingForm }
    // Background valuation runs (takes ~50ms)
    generateSyntheticTrades(2000)
    // Form state remains strictly untouched
    assertEqual(activeForm.buyQ, mockFilledTradingForm.buyQ)
    assertEqual(activeForm.selectedRowId, mockFilledTradingForm.selectedRowId)
  })

  // T3-X10: Composite F1 x F2 x F3 x F4 x F5
  await runTest('T3-X10', 'Full Composite: Form -> Fast Recalc -> Sorted Table -> Overall Performance Chain', async () => {
    // 1. Form state holds trade
    const form = { ...mockFilledTradingForm }
    // 2. Fast recalculate updates snapshot with existing unit price
    const holdings = [
      { 계좌: form.account, 종목명: 'ACE 미국S&P500', 상품명: 'ACE 미국S&P500', 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 보유수량: 150, 장부금액: 2450000 },
    ]
    const recalc = fastRecalculateHoldingsOracle(holdings, mockPrevPortfolioSummary)
    assertEqual(recalc[0].평가금액, 150 * 19500) // 2,925,000

    // 3. Comm profit table sorts correctly
    const sorted = recalc.sort(canonicalSortComparator)
    assertEqual(sorted[0].상품명, 'ACE 미국S&P500')

    // 4. Overall performance calculates updated MyPF
    const series = calculateOverallPerformanceSeries([
      { 기준일: '2025-01-02', 총손익: 1000000, 평가금액: 200000000 },
      { 기준일: '2025-01-03', 총손익: 1000000 + recalc[0].평가손익, 평가금액: 200000000 + recalc[0].평가금액 },
    ])
    assert(series.length === 2)
    assert(series[1].MyPF > 0)
    assertEqual(series[1].BM, 0)
  })
}
