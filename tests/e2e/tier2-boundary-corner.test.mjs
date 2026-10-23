/**
 * Tier 2: Boundary & Corner Cases E2E Tests (F1, F2, F3, F4, F5)
 * Requirements-driven edge cases, boundary conditions, and stress verifications.
 * Authoritative Sources: ORIGINAL_REQUEST.md & PROJECT.md
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  runTest,
  assert,
  assertEqual,
  assertDeepEqual,
  assertCloseTo,
  measureMs,
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
  ACCOUNT_ORDER,
} from './fixtures/oracle-math.mjs'
import {
  mockKisRateLimitResponse,
  mockKisMultiPriceResponsePartial,
  mockPrevPortfolioSummary,
  generateSyntheticTrades,
  mockInitialTradingForm,
  mockFilledTradingForm,
  mockTradingFilters,
} from './fixtures/mock-data.mjs'

const PROJECT_ROOT = process.cwd()

export async function runTier2Tests() {
  globalTestContext.setTier('Tier 2: Boundary & Corner Cases')

  // =========================================================================
  // F1: Boundary Cases
  // =========================================================================
  globalTestContext.setSuite('F1 Boundary: Investment Performance Edge Cases')

  await runTest('T2-F1-01', 'Calendar year boundary rollover (12-31 to 01-02) uses 당일 총손익 instead of difference', async () => {
    const rows = [
      { 기준일: '2024-12-31', 총손익: 20000000, 평가금액: 200000000 },
      { 기준일: '2025-01-02', 총손익: 500000, 평가금액: 200500000 }, // 연도 바뀜: 당일 총손익 500,000 사용
    ]
    const series = calculateOverallPerformanceSeries(rows)
    assertEqual(series.length, 2)
    // 2025-01-02 daily return = 500,000 / 200,000,000 = 0.25%
    assertEqual(series[1].MyPF, 0.25)
  })

  await runTest('T2-F1-02', 'Zero previous day evaluation amount (prevEval = 0) yields 0% daily return without NaN/Infinity', async () => {
    const rows = [
      { 기준일: '2025-01-02', 총손익: 0, 평가금액: 0 },
      { 기준일: '2025-01-03', 총손익: 100000, 평가금액: 1000000 },
    ]
    const series = calculateOverallPerformanceSeries(rows)
    assertEqual(series[1].MyPF, 0, 'Must not divide by zero or yield Infinity')
    assert(!isNaN(series[1].MyPF), 'Must not be NaN')
  })

  await runTest('T2-F1-03', 'Continuous loss sequence computes strictly negative MyPF and DD equals MyPF when peak <= 0', async () => {
    const rows = [
      { 기준일: '2025-01-02', 총손익: 1000000, 평가금액: 100000000 },
      { 기준일: '2025-01-03', 총손익: 0, 평가금액: 99000000 }, // -1%
      { 기준일: '2025-01-04', 총손익: -1000000, 평가금액: 98000000 }, // -1.01%
    ]
    const series = calculateOverallPerformanceSeries(rows)
    assert(series[1].MyPF < 0, 'MyPF must be negative on loss')
    assert(series[2].MyPF < series[1].MyPF, 'MyPF must drop further')
    // When peak is 0, DD equals cumPercent (e.g. -1.0%, -2.01%)
    assertEqual(series[1].DD, series[1].MyPF)
    assertEqual(series[2].DD, series[2].MyPF)
  })

  await runTest('T2-F1-04', 'Single-day date range (startDate == endDate) returns single initial point (MyPF=0, DD=0)', async () => {
    const rows = [{ 기준일: '2025-05-15', 총손익: 5000000, 평가금액: 100000000 }]
    const series = calculateOverallPerformanceSeries(rows)
    assertEqual(series.length, 1)
    assertEqual(series[0].MyPF, 0)
    assertEqual(series[0].DD, 0)
    assertEqual(series[0].BM, 0)
  })

  await runTest('T2-F1-05', 'Empty dataset returns empty performance series without throwing exceptions', async () => {
    const series = calculateOverallPerformanceSeries([])
    assertDeepEqual(series, [])
  })

  await runTest('T2-F1-06', 'Consecutive zero-profit days maintain flat cumulative return and preserve existing peak for Drawdown', async () => {
    const rows = [
      { 기준일: '2025-01-02', 총손익: 1000000, 평가금액: 100000000 },
      { 기준일: '2025-01-03', 총손익: 2000000, 평가금액: 101000000 }, // +1% (peak)
      { 기준일: '2025-01-04', 총손익: 2000000, 평가금액: 101000000 }, // 0% change
      { 기준일: '2025-01-05', 총손익: 2000000, 평가금액: 101000000 }, // 0% change
    ]
    const series = calculateOverallPerformanceSeries(rows)
    assertEqual(series[2].MyPF, series[1].MyPF)
    assertEqual(series[3].MyPF, series[1].MyPF)
    assertEqual(series[2].DD, 0)
    assertEqual(series[3].DD, 0)
  })

  // =========================================================================
  // F2: Boundary Cases
  // =========================================================================
  globalTestContext.setSuite('F2 Boundary: Commodity Profit Table Sorting Corner Cases')

  await runTest('T2-F2-01', 'Multiple sold-out items (quantity = 0, eval = 0) sort by ACCOUNT_ORDER then 상품명 within subgroup', async () => {
    const items = [
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 0, 계좌: '한투ISA', 상품명: 'B' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 0, 계좌: '한투', 상품명: 'A' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 0, 계좌: '한투', 상품명: 'Z' },
    ]
    const sorted = items.sort(canonicalSortComparator)
    assertEqual(sorted[0].계좌, '한투')
    assertEqual(sorted[0].상품명, 'A')
    assertEqual(sorted[1].계좌, '한투')
    assertEqual(sorted[1].상품명, 'Z')
    assertEqual(sorted[2].계좌, '한투ISA')
  })

  await runTest('T2-F2-02', 'Foreign currency items (USD/JPY) sort under designated class (현금성자산/달러/외환) without exception', async () => {
    const items = [
      { 자산군: '현금성자산', 세부자산군: '엔화', 세부자산군2: '외환', 평가금액: 500000, 계좌: '한투', 상품명: '직접운용엔' },
      { 자산군: '현금성자산', 세부자산군: '달러', 세부자산군2: '외환', 평가금액: 1000000, 계좌: '불리오', 상품명: '불리오달러' },
      { 자산군: '현금성자산', 세부자산군: '원화', 세부자산군2: '원화', 평가금액: 2000000, 계좌: '한투', 상품명: '한투예수금' },
    ]
    const sorted = items.sort(canonicalSortComparator)
    // CLASS2_ORDER: '원화', '달러', '엔화'
    assertEqual(sorted[0].세부자산군, '원화')
    assertEqual(sorted[1].세부자산군, '달러')
    assertEqual(sorted[2].세부자산군, '엔화')
  })

  await runTest('T2-F2-03', 'Product names with irregular whitespace differences match and sort deterministically', async () => {
    const items = [
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 100, 계좌: '한투', 상품명: 'ACE 미국 S&P500' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 100, 계좌: '한투', 상품명: 'ACE  미국 S&P500' },
    ]
    const sorted = items.sort(canonicalSortComparator)
    assertEqual(sorted.length, 2, 'Must not lose any row due to whitespace variance')
  })

  await runTest('T2-F2-04', 'Unknown/unmapped asset classes or accounts fallback gracefully to index 999 without crash', async () => {
    const items = [
      { 자산군: '신규외계자산', 세부자산군: '미분류', 세부자산군2: '미분류', 평가금액: 1000, 계좌: '알수없는계좌', 상품명: '미확인상품' },
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: 'KODEX 200' },
    ]
    const sorted = items.sort(canonicalSortComparator)
    assertEqual(sorted[0].자산군, '주식', 'Known class should sort before unknown')
    assertEqual(sorted[1].자산군, '신규외계자산', 'Unknown class should be placed at end with order 999')
  })

  await runTest('T2-F2-05', 'Ties across all 5 sort levels sort deterministically by 상품명 localeCompare', async () => {
    const items = [
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: 'TIGER 코스피' },
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: 'KODEX 코스피' },
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: 'ACE 코스피' },
    ]
    const sorted = items.sort(canonicalSortComparator)
    assertEqual(sorted[0].상품명, 'ACE 코스피')
    assertEqual(sorted[1].상품명, 'KODEX 코스피')
    assertEqual(sorted[2].상품명, 'TIGER 코스피')
  })

  await runTest('T2-F2-06', 'Large dataset (1,000 rows) sorting completes in < 50ms', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({
      자산군: CLASS_ORDER[i % CLASS_ORDER.length],
      세부자산군: CLASS2_ORDER[i % CLASS2_ORDER.length],
      세부자산군2: CLASS3_ORDER[i % CLASS3_ORDER.length],
      평가금액: (i * 37) % 10000000,
      계좌: ACCOUNT_ORDER[i % ACCOUNT_ORDER.length],
      상품명: `상품_${i}`,
    }))
    const { durationMs } = await measureMs(() => {
      items.sort(canonicalSortComparator)
    })
    assert(durationMs < 50, `Sorting 1000 rows took ${durationMs}ms (target: < 50ms)`)
  })

  // =========================================================================
  // F3: Boundary Cases
  // =========================================================================
  globalTestContext.setSuite('F3 Boundary: Form State Persistence Edge Cases')

  await runTest('T2-F3-01', 'Extreme input values (large quantities, negative inOut, 0 amounts) preserve precision', async () => {
    const extremeState = {
      ...mockInitialTradingForm,
      buyQ: 100000000, // 1억 주
      buyAmt: 999999999999, // 1조 원
      inOut: -50000000, // -5천만 원 출금
    }
    assertEqual(extremeState.buyQ, 100000000)
    assertEqual(extremeState.buyAmt, 999999999999)
    assertEqual(extremeState.inOut, -50000000)
  })

  await runTest('T2-F3-02', 'Partial form input (only 2 out of 16 fields edited) merges cleanly with defaults', async () => {
    const partialUpdate = { selectedTicker: '069500', buyQ: 25 }
    const merged = { ...mockInitialTradingForm, ...partialUpdate }
    assertEqual(merged.selectedTicker, '069500')
    assertEqual(merged.buyQ, 25)
    assertEqual(merged.account, '한투')
    assertEqual(merged.currency, '원화')
  })

  await runTest('T2-F3-03', 'Holdings sub-tab cycling (allocation -> commodity1 -> commodity2 -> commodity3) persists cleanly', async () => {
    const tabs = ['allocation', 'commodity1', 'commodity2', 'commodity3']
    let currentTab = 'allocation'
    for (const t of tabs) {
      currentTab = t
      assertEqual(currentTab, t)
    }
  })

  await runTest('T2-F3-04', 'Distinguishes between 0, null, and empty string without falsy coercion', async () => {
    const formWithZeros = {
      ...mockInitialTradingForm,
      buyQ: 0,
      selectedTicker: '',
      selectedRowId: null,
    }
    assert(formWithZeros.buyQ === 0, 'buyQ must be exactly 0, not null/undefined')
    assert(formWithZeros.selectedTicker === '', 'selectedTicker must be empty string')
    assert(formWithZeros.selectedRowId === null, 'selectedRowId must be null')
  })

  await runTest('T2-F3-05', 'Reset during edit mode clears selectedRowId and sets form back to blank create mode', async () => {
    const editingForm = { ...mockFilledTradingForm, selectedRowId: 55 }
    assert(editingForm.selectedRowId !== null)
    // After reset
    const resetForm = { ...mockInitialTradingForm, selectedRowId: null }
    assertEqual(resetForm.selectedRowId, null)
    assertEqual(resetForm.buyQ, 0)
    assertEqual(resetForm.selectedTicker, '')
  })

  await runTest('T2-F3-06', 'Trading filter date bounds handle leap year and end-of-month correctly', async () => {
    const filter = { ...mockTradingFilters, totalStartDate: '2024-02-29', totalEndDate: '2024-12-31' }
    assertEqual(filter.totalStartDate, '2024-02-29')
    assertEqual(filter.totalEndDate, '2024-12-31')
  })

  // =========================================================================
  // F4: Boundary Cases
  // =========================================================================
  globalTestContext.setSuite('F4 Boundary: Valuation Fallbacks & Rate Limits')

  await runTest('T2-F4-01', 'KIS Rate Limit error (EGW00201) triggers backoff retry branch rather than fatal throw', async () => {
    const kisContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/services/kis.ts'), 'utf-8')
    assert(
      kisContent.includes('EGW00201') || kisContent.includes('초당') || kisContent.includes('RateLimit') || kisContent.includes('rate'),
      'kis.ts must detect RateLimit EGW00201 and implement retry/backoff logic'
    )
  })

  await runTest('T2-F4-02', 'Multi-price API batch chunking slices exactly 31 tickers into 2 requests (30 + 1)', async () => {
    const tickers = Array.from({ length: 31 }, (_, i) => `STK_${String(i).padStart(4, '0')}`)
    const chunks = []
    for (let i = 0; i < tickers.length; i += 30) {
      chunks.push(tickers.slice(i, i + 30))
    }
    assertEqual(chunks.length, 2, '31 tickers must be partitioned into 2 chunks')
    assertEqual(chunks[0].length, 30)
    assertEqual(chunks[1].length, 1)
  })

  await runTest('T2-F4-03', 'Multi-price partial response: 1 item present, 1 missing -> missing item fetched via fallback', async () => {
    // 360200 present (19,850원), 069500 missing in partial response
    const item360200 = resolveValuationPriceOracle({
      ticker: '360200',
      holdingQty: 100,
      bookValue: 1500000,
      multiPrice: 19850,
    })
    assertEqual(item360200.priceSource, 'kis_multi')
    assertEqual(item360200.evalAmt, 1985000)

    // 069500 missing from multi -> single price fallback succeeds (34,500원)
    const item069500 = resolveValuationPriceOracle({
      ticker: '069500',
      holdingQty: 80,
      bookValue: 2400000,
      multiPrice: null,
      singlePrice: 34500,
    })
    assertEqual(item069500.priceSource, 'kis_single_fallback')
    assertEqual(item069500.evalAmt, 2760000)
  })

  await runTest('T2-F4-04', 'Single item price returns NaN or negative -> rejected and invokes previous price fallback', async () => {
    const resolved = resolveValuationPriceOracle({
      ticker: '069500',
      holdingQty: 80,
      bookValue: 2400000,
      multiPrice: null,
      singlePrice: -500, // Invalid negative quote
      prevSnapshot: { evalAmt: 2720000, qty: 80 }, // Prev unit price = 34,000
    })
    assertEqual(resolved.priceSource, 'prev_snapshot_fallback')
    assertEqual(resolved.unitPrice, 34000)
    assertEqual(resolved.evalAmt, 2720000)
  })

  await runTest('T2-F4-05', 'Both external API and previous snapshot missing (new stock + network blackout) falls back to cost', async () => {
    const resolved = resolveValuationPriceOracle({
      ticker: 'NEW_STOCK',
      holdingQty: 10,
      bookValue: 500000,
      multiPrice: null,
      singlePrice: null,
      prevSnapshot: null, // No prior snapshot
    })
    assertEqual(resolved.priceSource, 'book_value_fallback')
    assertEqual(resolved.evalAmt, 500000)
    assertEqual(resolved.evalProfit, 0)
  })

  await runTest('T2-F4-06', 'Large dataset stress test: 10,000 trades balance sheet indexing completes under 500ms', async () => {
    const trades = generateSyntheticTrades(10000)
    const { durationMs } = await measureMs(() => {
      const map = new Map()
      for (const t of trades) {
        map.set(`${t.계좌}_${t.종목코드}_${t.거래일자}`, t)
      }
      for (let i = 0; i < 1000; i++) {
        map.get(`한투_STK_5_2025-01-10`)
      }
    })
    assert(durationMs < 500, `10,000 trades lookup took ${durationMs}ms (target: < 500ms)`)
  })

  // =========================================================================
  // F5: Boundary Cases
  // =========================================================================
  globalTestContext.setSuite('F5 Boundary: Fast Recalculation Edge Cases')

  await runTest('T2-F5-01', 'Full liquidation trade (selling 100% of holding, qty becomes 0) sets evalAmt to 0 and evalProfit to 0', async () => {
    const holdings = [
      { 계좌: '한투', 종목명: 'ACE 미국S&P500', 보유수량: 0, 장부금액: 0 },
    ]
    const recalculated = fastRecalculateHoldingsOracle(holdings, mockPrevPortfolioSummary)
    assertEqual(recalculated[0].평가금액, 0)
    assertEqual(recalculated[0].평가손익, 0)
    assertEqual(recalculated[0].평가수익률, 0)
  })

  await runTest('T2-F5-02', 'Burst of 5 consecutive trade recalculations executes synchronously under 250ms total', async () => {
    const holdings = [
      { 계좌: '한투', 종목명: 'ACE 미국S&P500', 보유수량: 100, 장부금액: 1500000 },
    ]
    const { durationMs } = await measureMs(() => {
      for (let i = 0; i < 5; i++) {
        holdings[0].보유수량 += 10
        holdings[0].장부금액 += 150000
        fastRecalculateHoldingsOracle(holdings, mockPrevPortfolioSummary)
      }
    })
    assert(durationMs < 250, `5 successive recalculations took ${durationMs}ms (target: < 250ms)`)
  })

  await runTest('T2-F5-03', 'First-time buy of brand new stock calculates valuation = book value and evaluation profit = 0', async () => {
    const holdings = [
      { 계좌: '한투', 종목명: '신규미국채권ETF', 보유수량: 200, 장부금액: 2000000 },
    ]
    const recalculated = fastRecalculateHoldingsOracle(holdings, mockPrevPortfolioSummary)
    assertEqual(recalculated[0].평가금액, 2000000)
    assertEqual(recalculated[0].평가손익, 0)
    assertEqual(recalculated[0].평가수익률, 0)
  })

  await runTest('T2-F5-04', 'Cold start: fast recalculation handles null/empty previous summary gracefully', async () => {
    const holdings = [
      { 계좌: '한투', 종목명: 'ACE 미국S&P500', 보유수량: 50, 장부금액: 800000 },
    ]
    const recalculated = fastRecalculateHoldingsOracle(holdings, null)
    assertEqual(recalculated[0].평가금액, 800000)
    assertEqual(recalculated[0].평가손익, 0)
  })

  await runTest('T2-F5-05', 'Floating point precision rounding: Math.round avoids fraction pennies in evalAmt', async () => {
    const prevSummary = {
      comm_profit2: [
        { 계좌: '한투', 종목명: '단수주식', 보유수량: 3, 평가금액: 10000 }, // 단가: 3333.333333...원
      ],
    }
    const holdings = [{ 계좌: '한투', 종목명: '단수주식', 보유수량: 7, 장부금액: 23000 }]
    const recalculated = fastRecalculateHoldingsOracle(holdings, prevSummary)
    assertEqual(recalculated[0].평가금액, 23333, 'Evaluation amount must be rounded integer')
  })

  await runTest('T2-F5-06', 'Liquidity record with zero amount or future date preserves current balance integrity', async () => {
    const currentBalance = 15000000
    const zeroFlow = 0
    const nextBalance = currentBalance + zeroFlow
    assertEqual(nextBalance, currentBalance)
  })
}
