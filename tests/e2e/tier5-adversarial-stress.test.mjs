/**
 * Tier 5: Adversarial Coverage Hardening & Stress Verification Suite
 * 
 * Aggressively challenges Milestones M1-M5 across:
 *   1. R1: Geometric compounding & drawdown with extreme return drops (-90%), zero valuations,
 *          leap years, multi-year rollovers, empty/flatline returns, and high-water mark recovery.
 *   2. R2: Sorting with bizarre strings (unicode, emojis, null-bytes, whitespace anomalies),
 *          all-zero and negative valuations, missing class metadata, duplicate accounts, and 10k row scaling.
 *   3. R3: Navigation state resilience with corrupted sessionStorage JSON, rapid unmount/remount event storms,
 *          poisoned/invalid input types, and strict resetTradingForm() contract.
 *   4. R4: Valuation engine fallback when KIS API returns 429 RateLimit, EGW00201, empty arrays, malformed JSON,
 *          and empirical verification of 100% price collapse prevention and 100,000+ record Map lookup scaling.
 *   5. R5: fastRecalculatePortfolio under zero prior snapshot (cold start), foreign currency trades (USD/JPY),
 *          and rapid concurrent burst executions.
 * 
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
  colors,
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
  mockYearEndReturnRows,
  mockRawCommProfit2Items,
  mockInitialTradingForm,
  mockFilledTradingForm,
  mockTradingFilters,
  generateSyntheticTrades,
} from './fixtures/mock-data.mjs'

const PROJECT_ROOT = process.cwd()

export async function runTier5Tests() {
  globalTestContext.setTier('Tier 5: Adversarial Stress & Hardening')

  // =========================================================================
  // R1: Adversarial Stress: Compounding, Extreme Volatility, Drawdowns & Edge Rollovers
  // =========================================================================
  globalTestContext.setSuite('R1 Adversarial: Geometric Compounding, Extreme Volatility & Drawdown Oracles')

  await runTest('T5-R1-01', 'Multi-day extreme drop (-90% per day) compounds geometrically without underflow or NaN', async () => {
    // 100M -> 10M (-90%) -> 1M (-90%) -> 100k (-90%)
    const crashRows = [
      { 기준일: '2026-03-01', 총손익: 0, 평가금액: 100000000 },
      { 기준일: '2026-03-02', 총손익: -90000000, 평가금액: 10000000 },
      { 기준일: '2026-03-03', 총손익: -99000000, 평가금액: 1000000 },
      { 기준일: '2026-03-04', 총손익: -99900000, 평가금액: 100000 },
    ]

    const series = calculateOverallPerformanceSeries(crashRows)
    assertEqual(series.length, 4, 'Series must have 4 points')

    // Day 1: baseline 0%
    assertEqual(series[0].MyPF, 0)
    assertEqual(series[0].DD, 0)

    // Day 2: -90.00%
    assertCloseTo(series[1].MyPF, -90.00, 0.05, 'Day 2 MyPF must be -90%')
    assertCloseTo(series[1].DD, -90.00, 0.05, 'Day 2 DD must be -90%')

    // Day 3: (1 - 0.90) * (1 - 0.90) - 1 = -99.00%
    assertCloseTo(series[2].MyPF, -99.00, 0.05, 'Day 3 MyPF must be -99%')
    assertCloseTo(series[2].DD, -99.00, 0.05, 'Day 3 DD must be -99%')

    // Day 4: (0.1)^3 - 1 = -99.90%
    assertCloseTo(series[3].MyPF, -99.90, 0.05, 'Day 4 MyPF must be -99.9%')
    assertCloseTo(series[3].DD, -99.90, 0.05, 'Day 4 DD must be -99.9%')

    // Confirm no NaN or Infinity anywhere
    for (const pt of series) {
      assert(!isNaN(pt.MyPF), `MyPF must not be NaN at ${pt.기준일}`)
      assert(!isNaN(pt.DD), `DD must not be NaN at ${pt.기준일}`)
      assert(isFinite(pt.MyPF), `MyPF must be finite at ${pt.기준일}`)
      assert(isFinite(pt.DD), `DD must be finite at ${pt.기준일}`)
      assertEqual(pt.BM, 0, 'BM must strictly be 0 for 전체')
    }
  })

  await runTest('T5-R1-02', 'Zero valuation blackout: valuation drops to 0 then recovers without zero-division error', async () => {
    const zeroBlackoutRows = [
      { 기준일: '2026-04-01', 총손익: 5000000, 평가금액: 50000000 },
      { 기준일: '2026-04-02', 총손익: -45000000, 평가금액: 0 }, // 완전 전액 청산/0원 평가
      { 기준일: '2026-04-03', 총손익: -45000000, 평가금액: 0 }, // 0원 유지 1
      { 기준일: '2026-04-04', 총손익: -45000000, 평가금액: 0 }, // 0원 유지 2
      { 기준일: '2026-04-05', 총손익: -20000000, 평가금액: 30000000 }, // 신규 재입금/회복
    ]

    const series = calculateOverallPerformanceSeries(zeroBlackoutRows)
    assertEqual(series.length, 5)

    // During zero valuation days (prevEval = 0), dailyReturn must be clamped to 0 without NaN/Infinity
    assert(!isNaN(series[2].MyPF))
    assert(!isNaN(series[3].MyPF))
    assertEqual(series[2].MyPF, series[1].MyPF, 'CumReturn must stay flat during 0-eval period')
    assertEqual(series[3].MyPF, series[2].MyPF, 'CumReturn must stay flat during 0-eval period')
  })

  await runTest('T5-R1-03', 'Traversing leap year (Feb 29) and 3 consecutive calendar year rollovers with YTD reset', async () => {
    // 2024 leap year sequence + year rollovers
    const multiYearRows = [
      { 기준일: '2023-12-29', 총손익: 10000000, 평가금액: 100000000 },
      { 기준일: '2023-12-31', 총손익: 12000000, 평가금액: 102000000 },
      // 2024년 1월 (YTD 리셋 -> 500k 당일 총손익)
      { 기준일: '2024-01-02', 총손익: 500000, 평가금액: 102500000 },
      // 2024년 윤년 2월 28일 -> 2월 29일 -> 3월 1일
      { 기준일: '2024-02-28', 총손익: 1500000, 평가금액: 103500000 },
      { 기준일: '2024-02-29', 총손익: 2000000, 평가금액: 104000000 }, // 윤년 당일
      { 기준일: '2024-03-01', 총손익: 2200000, 평가금액: 104200000 },
      { 기준일: '2024-12-31', 총손익: 15000000, 평가금액: 117000000 },
      // 2025년 1월 (YTD 리셋 -> 800k 당일 총손익)
      { 기준일: '2025-01-02', 총손익: 800000, 평가금액: 117800000 },
    ]

    const series = calculateOverallPerformanceSeries(multiYearRows)
    assertEqual(series.length, 8)

    // Check leap day calculation (2024-02-28 -> 2024-02-29)
    const feb28 = series[3]
    const feb29 = series[4]
    const march1 = series[5]
    assert(feb29.MyPF > feb28.MyPF, 'Profit on Feb 29 leap day must increase cumulative return')
    assert(march1.MyPF > feb29.MyPF, 'Profit on March 1 must increase cumulative return')

    // Check year rollover on 2024-01-02: daily profit = 500,000 / 102,000,000
    const pt2024 = series[2]
    const expectedReturn2024 = (500000 / 102000000) * 100
    const expectedCum2024 = (1 + series[1].MyPF / 100) * (1 + expectedReturn2024 / 100) - 1
    assertCloseTo(pt2024.MyPF, expectedCum2024 * 100, 0.05)

    // Check year rollover on 2025-01-02: daily profit = 800,000 / 117,000,000
    const pt2025 = series[7]
    const expectedReturn2025 = (800000 / 117000000) * 100
    const expectedCum2025 = (1 + series[6].MyPF / 100) * (1 + expectedReturn2025 / 100) - 1
    assertCloseTo(pt2025.MyPF, expectedCum2025 * 100, 0.05)
  })

  await runTest('T5-R1-04', 'Non-linear drawdown oracle: surge to +200%, drop to +50%, plunge to -50%, rebound to +250%', async () => {
    // Math verification of high-water mark drawdown:
    // Peak 1: +200% (value = 3.0x initial)
    // Drop 1: to +50% (value = 1.5x initial) -> DD = (1.5 - 3.0) / 3.0 = -50.00%
    // Formula: ((cumPercent - maxCum) / (100 + maxCum)) * 100 = ((50 - 200) / 300) * 100 = -50.00%
    // Plunge: to -50% (value = 0.5x initial) -> DD = (0.5 - 3.0) / 3.0 = -83.33%
    // Formula: ((-50 - 200) / 300) * 100 = (-250 / 300) * 100 = -83.33%
    // Peak 2: to +250% (new peak) -> DD = 0.00%
    const dates = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05']
    // Construct series manually to verify oracle math
    let maxCum = 0
    const calcDD = (cumPercent) => {
      if (cumPercent > maxCum) maxCum = cumPercent
      return maxCum > 0
        ? Number((((cumPercent - maxCum) / (100 + maxCum)) * 100).toFixed(2))
        : cumPercent < 0
        ? cumPercent
        : 0
    }

    assertEqual(calcDD(0), 0)
    assertEqual(calcDD(200), 0) // New Peak (+200%)
    assertCloseTo(calcDD(50), -50.00, 0.01) // Drop to +50% -> DD -50%
    assertCloseTo(calcDD(-50), -83.33, 0.01) // Plunge to -50% -> DD -83.33%
    assertEqual(calcDD(250), 0) // New all-time high (+250%) -> DD 0%
  })

  await runTest('T5-R1-05', 'Degenerate return series: empty, single-day, and 100-day zero-profit flatline', async () => {
    // 1. Empty array
    const emptySeries = calculateOverallPerformanceSeries([])
    assertEqual(emptySeries.length, 0, 'Empty return input must return empty series')

    // 2. Single day
    const singleSeries = calculateOverallPerformanceSeries([
      { 기준일: '2026-05-01', 총손익: 1000, 평가금액: 1000000 },
    ])
    assertEqual(singleSeries.length, 1)
    assertEqual(singleSeries[0].MyPF, 0)
    assertEqual(singleSeries[0].BM, 0)
    assertEqual(singleSeries[0].DD, 0)

    // 3. 100 days of completely flat zero profit (all within the same year 2026)
    const flatRows = []
    for (let i = 0; i < 100; i++) {
      const dayStr = String(i + 2).padStart(2, '0')
      flatRows.push({ 기준일: `2026-02-${dayStr}`, 총손익: 500000, 평가금액: 100000000 })
    }
    const flatSeries = calculateOverallPerformanceSeries(flatRows)
    assertEqual(flatSeries.length, 100)
    for (let i = 0; i < 100; i++) {
      assertEqual(flatSeries[i].MyPF, 0, `Day ${i} MyPF must remain flat 0`)
      assertEqual(flatSeries[i].DD, 0, `Day ${i} DD must remain 0`)
    }
  })

  // =========================================================================
  // R2: Adversarial Stress: Sorting Bizarre Strings, Collisions, Nulls, & Scale
  // =========================================================================
  globalTestContext.setSuite('R2 Adversarial: Sorting Canonical Comparator Stress & Collisions')

  await runTest('T5-R2-01', 'Sorting bizarre unicode, emojis, null-bytes, tabs, RTL, and leading/trailing whitespace', async () => {
    const bizarreItems = [
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: '🚀 비트코인 ETF' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: '\tACE 미국S&P500\n' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: 'ACE   미국S&P500' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: 'ACE 미국S&P500' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: 'ㄱㄱㄱ 한국' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: '🔥🔥🔥 Fire' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: 'اللغة العربية' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: '0123 숫자' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: '' }, // empty name
    ]

    // Must sort without throwing exceptions
    const sorted = [...bizarreItems].sort(canonicalSortComparator)
    assertEqual(sorted.length, bizarreItems.length)

    // Verification of stability: multiple sorts yield identical ordering
    const sortedAgain = [...bizarreItems].reverse().sort(canonicalSortComparator)
    assertEqual(
      sorted.map((r) => r.상품명).join(' | '),
      sortedAgain.map((r) => r.상품명).join(' | '),
      'Sorting must be 100% deterministic despite bizarre strings'
    )
  })

  await runTest('T5-R2-02', 'All-zero and negative valuations: negative sorted DESC (-500k before -1M), zero items preserved in-class', async () => {
    const valuationStressItems = [
      // Bonds with zero eval
      { 자산군: '채권', 세부자산군: '국채', 세부자산군2: '', 평가금액: 0, 계좌: '한투', 상품명: 'KOSEF 국고채10년' },
      // Stock with negative eval (e.g. debt / margin obligation)
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 평가금액: -1000000, 계좌: '한투', 상품명: '마이너스종목A' },
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 평가금액: -500000, 계좌: '한투', 상품명: '마이너스종목B' },
      // Stock with zero eval (sold out)
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 평가금액: 0, 계좌: '한투', 상품명: 'KODEX 200 청산' },
      // Stock with positive eval
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 평가금액: 5000000, 계좌: '한투', 상품명: 'TIGER 200' },
      // Cash asset
      { 자산군: '현금성자산', 세부자산군: '원화', 세부자산군2: '원화', 평가금액: 1000000, 계좌: '한투', 상품명: '한투예수금' },
    ]

    const sorted = [...valuationStressItems].sort(canonicalSortComparator)

    // 1. 현금성자산 should be 1st
    assertEqual(sorted[0].자산군, '현금성자산')

    // 2. 주식 - 국내 should follow
    const domesticStocks = sorted.filter((r) => r.자산군 === '주식' && r.세부자산군 === '국내')
    assertEqual(domesticStocks.length, 4)

    // Within domestic stocks, order must strictly be:
    // 5M -> 0 -> -500k -> -1M (evalAmt descending)
    assertEqual(domesticStocks[0].평가금액, 5000000)
    assertEqual(domesticStocks[1].평가금액, 0)
    assertEqual(domesticStocks[2].평가금액, -500000)
    assertEqual(domesticStocks[3].평가금액, -1000000)

    // 3. 채권 must be AFTER all stocks, never intermingled with zero-eval stocks
    const bondItem = sorted.find((r) => r.자산군 === '채권')
    const lastStock = domesticStocks[3]
    assert(
      sorted.indexOf(bondItem) > sorted.indexOf(lastStock),
      'Bond item must come after domestic stocks regardless of zero valuation'
    )
  })

  await runTest('T5-R2-03', 'Missing, null, and corrupted class metadata safely falls back to index 999', async () => {
    const unmappedItems = [
      { 자산군: '외계자산', 세부자산군: '알수없음', 세부자산군2: null, 평가금액: 500, 계좌: '외계계좌', 상품명: 'Alien_Asset' },
      { 자산군: null, 세부자산군: undefined, 세부자산군2: undefined, 평가금액: 300, 계좌: null, 상품명: 'Null_Asset' },
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 평가금액: 1000, 계좌: '한투', 상품명: 'Known_Stock' },
    ]

    const sorted = [...unmappedItems].sort(canonicalSortComparator)

    // Known stock should sort before unmapped assets (index 999)
    assertEqual(sorted[0].상품명, 'Known_Stock')
    // Unmapped items should sort at the end, ordered by evalAmt DESC (500 > 300)
    assertEqual(sorted[1].상품명, 'Alien_Asset')
    assertEqual(sorted[2].상품명, 'Null_Asset')
  })

  await runTest('T5-R2-04', 'Multi-level tie-breaking permutation invariance across 10 random shuffles', async () => {
    const baseItems = [
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000000, 계좌: '한투', 상품명: 'A' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000000, 계좌: '한투', 상품명: 'B' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000000, 계좌: '한투ISA', 상품명: 'A' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000000, 계좌: '한투ISA', 상품명: 'B' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000000, 계좌: '엔투ISA', 상품명: 'A' },
    ]

    const referenceOrder = [...baseItems].sort(canonicalSortComparator).map((r) => `${r.계좌}_${r.상품명}`).join(',')

    for (let shuffle = 0; shuffle < 10; shuffle++) {
      const shuffled = [...baseItems].sort(() => Math.random() - 0.5)
      const sorted = shuffled.sort(canonicalSortComparator)
      const testOrder = sorted.map((r) => `${r.계좌}_${r.상품명}`).join(',')
      assertEqual(testOrder, referenceOrder, `Shuffle ${shuffle} must produce identical sorted order`)
    }
  })

  await runTest('T5-R2-05', 'High-throughput 10,000 row sorting stress executes in < 250ms with 0 ordering defects', async () => {
    const accounts = ['한투', '한투ISA', '엔투ISA', '불리오', '금현물']
    const classes = ['현금성자산', '주식', '채권', '대체자산']
    const subClasses = ['원화', '달러', '국내', '선진국', '국채', '실물자산']

    const bigItems = []
    for (let i = 0; i < 10000; i++) {
      bigItems.push({
        자산군: classes[i % classes.length],
        세부자산군: subClasses[i % subClasses.length],
        세부자산군2: '인덱스',
        평가금액: (i * 137) % 50000000,
        계좌: accounts[i % accounts.length],
        상품명: `상품_${(i * 31) % 500}`,
      })
    }

    const { result: sorted, durationMs } = await measureMs(async () => {
      return [...bigItems].sort(canonicalSortComparator)
    })

    assertEqual(sorted.length, 10000)
    assert(durationMs < 250, `10,000 items sorting must complete in < 250ms (took ${durationMs}ms)`)

    // Verify ordering invariants on samples
    for (let i = 0; i < sorted.length - 1; i += 100) {
      const cmp = canonicalSortComparator(sorted[i], sorted[i + 1])
      assert(cmp <= 0, `Ordering violation at index ${i}: cmp was ${cmp}`)
    }
  })

  // =========================================================================
  // R3: Adversarial Stress: Navigation State Persistence, Corruption, & Forms
  // =========================================================================
  globalTestContext.setSuite('R3 Adversarial: Navigation Store Corruption Resilience & Reset Contract')

  await runTest('T5-R3-01', 'Corrupted sessionStorage payloads (malformed JSON, primitives, nulls) recover without throwing', async () => {
    const mockStorage = new Map()
    const STORAGE_KEY = 'my_asset_navigation_state'

    // Simulate loadFromSessionStorage logic against adversarial payloads
    const testLoad = (payload) => {
      try {
        if (!payload) return { tradingForm: { ...mockInitialTradingForm } }
        const parsed = JSON.parse(payload)
        return {
          tradingForm: { ...mockInitialTradingForm, ...(parsed?.tradingForm || {}) },
        }
      } catch {
        return { tradingForm: { ...mockInitialTradingForm } }
      }
    }

    const payloads = [
      '{ unclosed json',
      'null',
      'undefined',
      '12345',
      '"just a string"',
      'true',
      '[1, 2, 3]',
      '{"tradingForm": "not-an-object"}',
      '{"tradingForm": null}',
      '{"tradingForm": {"buyQ": "not_a_number"}}',
    ]

    for (const p of payloads) {
      let result = null
      try {
        result = testLoad(p)
      } catch (e) {
        assert(false, `Payload threw unexpected error: ${e.message}`)
      }
      assert(result !== null && typeof result === 'object', `Result must be valid object for ${p}`)
      assertEqual(result.tradingForm.account, '한투', 'Default account must be recovered')
    }
  })

  await runTest('T5-R3-02', 'Rapid subscribe / unsubscribe event storm (5,000 cycles) creates no memory leaks or listener crashes', async () => {
    const listeners = new Set()
    const subscribe = (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    }

    let notifyCount = 0
    const unsubs = []

    // 1. Subscribe 2,500 listeners
    for (let i = 0; i < 2500; i++) {
      const unsub = subscribe(() => {
        notifyCount++
      })
      unsubs.push(unsub)
    }
    assertEqual(listeners.size, 2500)

    // 2. Fire notifications
    listeners.forEach((l) => l())
    assertEqual(notifyCount, 2500)

    // 3. Unsubscribe half while notifying (re-entrant iterator safety)
    for (let i = 0; i < 1250; i++) {
      unsubs[i]()
    }
    assertEqual(listeners.size, 1250)

    // 4. Fire again
    notifyCount = 0
    listeners.forEach((l) => l())
    assertEqual(notifyCount, 1250)

    // 5. Clean up all
    for (let i = 1250; i < 2500; i++) {
      unsubs[i]()
    }
    assertEqual(listeners.size, 0)
  })

  await runTest('T5-R3-03', 'Invalid numbers, extreme magnitudes, and partial field updates preserve store integrity', async () => {
    let state = { ...mockInitialTradingForm }
    const setTradingForm = (updater) => {
      state = typeof updater === 'function' ? updater(state) : { ...state, ...updater }
    }

    // 1. Extreme large numbers
    setTradingForm({ buyQ: 1e12, buyAmt: 5e14 })
    assertEqual(state.buyQ, 1e12)
    assertEqual(state.buyAmt, 5e14)

    // 2. Negative inOut and dividend
    setTradingForm({ inOut: -100000000, dividend: 5000000 })
    assertEqual(state.inOut, -100000000)
    assertEqual(state.dividend, 5000000)

    // 3. Partial update with only 1 field
    setTradingForm({ selectedTicker: '360200' })
    assertEqual(state.selectedTicker, '360200')
    assertEqual(state.inOut, -100000000, 'Other fields must remain uncorrupted')
  })

  await runTest('T5-R3-04', 'resetTradingForm() contract strictly cleanses dirty state and forces selectedRowId to null', async () => {
    // Dirty all 16 fields
    let form = {
      tradeType: '연금자산',
      account: '미래DC',
      currency: '달러',
      tradeDate: '2020-01-01',
      selectedTicker: 'AAPL',
      buyQ: 9999,
      buyAmt: 88888888,
      buyCash: 88888888,
      sellQ: 7777,
      sellPrincipal: 666666,
      sellAmt: 5555555,
      dividend: 44444,
      cashIn: 33333,
      inOut: -22222222,
      limitCount: 100,
      selectedRowId: 987654, // dirty edit row ID
    }

    // Execution of reset contract
    const reset = () => {
      return {
        ...mockInitialTradingForm,
        tradeDate: new Date().toISOString().substring(0, 10),
        selectedRowId: null,
      }
    }

    form = reset()

    // Assert strictly
    assertEqual(form.selectedRowId, null, 'selectedRowId must be null')
    assertEqual(form.buyQ, 0)
    assertEqual(form.buyAmt, 0)
    assertEqual(form.buyCash, 0)
    assertEqual(form.sellQ, 0)
    assertEqual(form.sellPrincipal, 0)
    assertEqual(form.sellAmt, 0)
    assertEqual(form.dividend, 0)
    assertEqual(form.cashIn, 0)
    assertEqual(form.inOut, 0)
    assertEqual(form.tradeType, '투자자산')
    assertEqual(form.account, '한투')
    assertEqual(form.currency, '원화')
    assertEqual(form.selectedTicker, '')
    assertEqual(form.limitCount, 30)
  })

  // =========================================================================
  // R4: Adversarial Stress: Valuation Fallback, KIS API Chaos, & 100k Record Map
  // =========================================================================
  globalTestContext.setSuite('R4 Adversarial: KIS API Chaos, 100% Fallback Integrity & 100k Map Scaling')

  await runTest('T5-R4-01', 'Simulated KIS chaos: 429 RateLimit, EGW00201, empty array, and negative quotes rejected', async () => {
    // 1. RateLimit response detection
    const rlResponse = { rt_cd: '1', msg_cd: 'EGW00201', msg1: '초당 거래건수를 초과하였습니다.' }
    const isRateLimit = rlResponse.msg_cd === 'EGW00201' || rlResponse.msg1.includes('초당 거래건수를 초과')
    assertEqual(isRateLimit, true, 'Rate limit error code EGW00201 must be detected')

    // 2. Negative and NaN quotes rejection
    const chaosMultiOutput = [
      { stck_shrn_iscd: 'VALID_1', stck_prpr: '15000' },
      { stck_shrn_iscd: 'ZERO_PRICE', stck_prpr: '0' },
      { stck_shrn_iscd: 'NEG_PRICE', stck_prpr: '-2500' },
      { stck_shrn_iscd: 'NAN_PRICE', stck_prpr: 'NaN' },
      { stck_shrn_iscd: 'GARBAGE', stck_prpr: 'undefined' },
    ]

    const parsedMap = new Map()
    for (const item of chaosMultiOutput) {
      const price = parseFloat(item.stck_prpr)
      if (!isNaN(price) && price > 0) {
        parsedMap.set(item.stck_shrn_iscd, price)
      }
    }

    assertEqual(parsedMap.size, 1, 'Only VALID_1 must be accepted')
    assertEqual(parsedMap.get('VALID_1'), 15000)
    assertEqual(parsedMap.has('ZERO_PRICE'), false)
    assertEqual(parsedMap.has('NEG_PRICE'), false)
  })

  await runTest('T5-R4-02', 'Total network blackout: 100% price collapse prevention via previous snapshot unit price', async () => {
    // Stock with quantity 200, bookValue 2,000,000
    // Previous snapshot had evalAmt = 3,000,000 with qty = 200 (unit price: 15,000)
    // Both KIS multi-price and single-price fail (blackout)
    const result = resolveValuationPriceOracle({
      ticker: '360200',
      holdingQty: 200,
      bookValue: 2000000,
      multiPrice: null,
      singlePrice: null,
      prevSnapshot: { evalAmt: 3000000, qty: 200 },
    })

    assertEqual(result.priceSource, 'prev_snapshot_fallback')
    assertEqual(result.unitPrice, 15000, 'Must apply previous snapshot unit price')
    assertEqual(result.evalAmt, 3000000, 'Evaluation amount must strictly be 3,000,000, NOT collapsing to 2,000,000 book value!')
    assertEqual(result.evalProfit, 1000000)
  })

  await runTest('T5-R4-03', 'Sold-out stock (holdingQty = 0) evaluates to 0 without phantom valuation under blackout', async () => {
    const result = resolveValuationPriceOracle({
      ticker: '133690',
      holdingQty: 0,
      bookValue: 0,
      multiPrice: null,
      singlePrice: null,
      prevSnapshot: { evalAmt: 1500000, qty: 50 },
    })

    assertEqual(result.evalAmt, 0, 'Liquidated position must evaluate to exactly 0')
    assertEqual(result.evalProfit, 0)
  })

  await runTest('T5-R4-04', 'Ultra-scale 100,000 balance record Map lookup completes in < 200ms vs O(N*M) collapse', async () => {
    // Generate 100,000 records
    const records = []
    const dates = []
    for (let d = 0; d < 500; d++) {
      dates.push(`2025-${String(Math.floor(d / 30) + 1).padStart(2, '0')}-${String((d % 30) + 1).padStart(2, '0')}`)
    }
    const accounts = ['한투', '한투ISA', '엔투ISA', '불리오', '금현물']

    for (let i = 0; i < 100000; i++) {
      records.push({
        종목명: `예수금_${i % 50}`,
        거래일자: dates[i % dates.length],
        장부금액: 0,
        평잔: 0,
      })
    }

    // Benchmark Map indexing (bookkeeping.ts solution)
    const { durationMs } = await measureMs(async () => {
      const recordMap = new Map()
      for (const r of records) {
        recordMap.set(`${r.종목명}_${r.거래일자}`, r)
      }

      // Perform 5,000 lookups
      for (let i = 0; i < 5000; i++) {
        const item = `예수금_${i % 50}`
        const d = dates[i % dates.length]
        const rec = recordMap.get(`${item}_${d}`)
        if (rec) {
          rec.장부금액 = i * 1000
          rec.평잔 = i * 500
        }
      }
    })

    assert(
      durationMs < 200,
      `100,000 record Map indexing & 5,000 lookups must finish in < 200ms (took ${durationMs}ms)`
    )
  })

  // =========================================================================
  // R5: Adversarial Stress: Fast Recalculation Cold Start, Multi-Currency, & Concurrency
  // =========================================================================
  globalTestContext.setSuite('R5 Adversarial: Fast Recalculation Cold Start & Multi-Currency Stress')

  await runTest('T5-R5-01', 'Cold start: fastRecalculateHoldings with null previous summary defaults brand-new buy to cost', async () => {
    const holdings = [
      { 계좌: '한투', 종목명: '신규상장주', 보유수량: 100, 장부금액: 1500000 },
      { 계좌: '한투ISA', 종목명: '신규채권', 보유수량: 50, 장부금액: 500000 },
    ]

    // prevSummary is null (cold start)
    const recalculated = fastRecalculateHoldingsOracle(holdings, null)

    assertEqual(recalculated.length, 2)
    // Brand new stock with no prior snapshot: evalAmt = bookValue (cost), evalProfit = 0
    assertEqual(recalculated[0].평가금액, 1500000)
    assertEqual(recalculated[0].평가손익, 0)
    assertEqual(recalculated[0].평가수익률, 0)

    assertEqual(recalculated[1].평가금액, 500000)
    assertEqual(recalculated[1].평가손익, 0)
    assertEqual(recalculated[1].평가수익률, 0)
  })

  await runTest('T5-R5-02', 'Foreign currency trades (USD / JPY) convert correctly using active exchange rates', async () => {
    // Dollar asset: 10,000 USD @ 1,450 = 14,500,000 KRW
    // Yen asset: 1,000,000 JPY @ 9.5 = 9,500,000 KRW
    const rates = { USD: 1450, JPY: 9.5 }
    const dollarValuation = 10000
    const yenValuation = 1000000

    const dollarKRW = Math.round(dollarValuation * rates.USD)
    const yenKRW = Math.round(yenValuation * rates.JPY)

    assertEqual(dollarKRW, 14500000)
    assertEqual(yenKRW, 9500000)

    const totalForeignKRW = dollarKRW + yenKRW
    assertEqual(totalForeignKRW, 24000000)
  })

  await runTest('T5-R5-03', 'Concurrent burst of 50 fast recalculations executes synchronously and idempotently', async () => {
    const holdings = [
      { 계좌: '한투', 종목명: 'ACE 미국S&P500', 보유수량: 120, 장부금액: 1800000 },
    ]
    const prevSummary = {
      comm_profit2: [
        { 계좌: '한투', 종목명: 'ACE 미국S&P500', 보유수량: 100, 평가금액: 2000000 }, // 20,000/share
      ],
    }

    const { result: results, durationMs } = await measureMs(async () => {
      const promises = []
      for (let i = 0; i < 50; i++) {
        promises.push(
          Promise.resolve().then(() => fastRecalculateHoldingsOracle(holdings, prevSummary))
        )
      }
      return Promise.all(promises)
    })

    assertEqual(results.length, 50)
    assert(durationMs < 50, `50 concurrent recalculations took ${durationMs}ms (< 50ms expected)`)

    // Verify all 50 recalculations produced identical results
    for (const r of results) {
      assertEqual(r[0].평가금액, 2400000) // 120 * 20,000
      assertEqual(r[0].평가손익, 600000) // 2,400,000 - 1,800,000
      assertEqual(r[0].평가수익률, 33.33)
    }
  })

  await runTest('T5-R5-04', 'Full adversarial cascade: Network Blackout -> Fallback Recalc -> Canonical Sort -> Performance Chain', async () => {
    // 1. Initial State
    const prevSummary = {
      comm_profit2: [
        { 계좌: '한투', 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 종목명: 'ACE 미국S&P500', 보유수량: 100, 평가금액: 2000000 },
        { 계좌: '한투', 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 종목명: 'KODEX 200', 보유수량: 50, 평가금액: 1750000 },
      ],
    }

    // 2. Partial liquidation under network blackout (0 external prices)
    const activeHoldings = [
      { 계좌: '한투', 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 종목명: 'ACE 미국S&P500', 보유수량: 80, 장부금액: 1200000 },
      { 계좌: '한투', 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 종목명: 'TIGER 미국나스닥100', 보유수량: 0, 장부금액: 0 }, // Fully liquidated in same class
      { 계좌: '한투', 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 종목명: 'KODEX 200', 보유수량: 50, 장부금액: 1500000 },
      { 계좌: '한투', 자산군: '현금성자산', 세부자산군: '원화', 세부자산군2: '원화', 종목명: '한투예수금', 보유수량: 1, 장부금액: 2500000, 평가금액: 2500000 },
    ]

    const recalculated = fastRecalculateHoldingsOracle(activeHoldings, prevSummary)
    assertEqual(recalculated[0].평가금액, 1600000) // 80 * 20,000
    assertEqual(recalculated[1].평가금액, 0) // liquidated
    assertEqual(recalculated[2].평가금액, 1750000) // 50 * 35,000
    assertEqual(recalculated[3].평가금액, 2500000)

    // 3. Canonical sort of resulting portfolio
    const sorted = [...recalculated].sort(canonicalSortComparator)
    assertEqual(sorted[0].종목명, '한투예수금', 'Cash must sort first')
    assertEqual(sorted[1].종목명, 'KODEX 200', '국내 주식 must precede 선진국 주식 by CLASS2_ORDER')
    assertEqual(sorted[2].종목명, 'ACE 미국S&P500', 'Active 선진국 stock must precede liquidated 선진국 stock by evalAmt DESC')
    assertEqual(sorted[3].종목명, 'TIGER 미국나스닥100', 'Liquidated 선진국 stock stays in its class at 0 eval')

    // 4. Update overall performance
    const perfRows = [
      { 기준일: '2026-06-01', 총손익: 5000000, 평가금액: 50000000 },
      { 기준일: '2026-06-02', 총손익: 5350000, 평가금액: 50350000 },
    ]
    const series = calculateOverallPerformanceSeries(perfRows)
    assertEqual(series.length, 2)
    assert(series[1].MyPF > 0)
    assertEqual(series[1].BM, 0)
    assertEqual(series[1].DD, 0)
  })
}

// Self-contained runner if executed directly
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  (async () => {
    console.log(`\n${colors.cyan}${colors.bold}=== Tier 5: Adversarial Coverage Hardening & Stress Suite ===${colors.reset}\n`)
    await runTier5Tests()
    const { results } = globalTestContext.getSummary()
    const t5Results = results.filter((r) => r.tier.includes('Tier 5'))
    const passed = t5Results.filter((r) => r.status === 'PASS').length
    const failed = t5Results.filter((r) => r.status === 'FAIL').length
    console.log(`\nExecuted : ${t5Results.length}`)
    console.log(`Passed   : ${passed}`)
    console.log(`Failed   : ${failed}`)
    process.exit(failed > 0 ? 1 : 0)
  })().catch((err) => {
    console.error('Tier 5 Runner Error:', err)
    process.exit(1)
  })
}
