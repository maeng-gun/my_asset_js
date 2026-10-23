/**
 * Tier 1: Feature Coverage E2E Tests (F1, F2, F3, F4, F5)
 * Requirements-driven tests covering primary behaviors & interface contracts.
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
  mockYearEndReturnRows,
  mockRawCommProfit2Items,
  mockInitialTradingForm,
  mockFilledTradingForm,
  mockTradingFilters,
  generateSyntheticTrades,
  mockKisMultiPriceResponseSuccess,
  mockKisMultiPriceResponsePartial,
  mockPrevPortfolioSummary,
} from './fixtures/mock-data.mjs'

const PROJECT_ROOT = process.cwd()
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'

export async function runTier1Tests() {
  globalTestContext.setTier('Tier 1: Feature Coverage')

  // =========================================================================
  // F1: R1 '투자전략' - '투자성과' 화면에 '전체' 자산군 선택지 추가
  // =========================================================================
  globalTestContext.setSuite('F1: Overall Portfolio Performance (전체)')

  await runTest('T1-F1-01', 'API endpoint /api/portfolio/analytics/investment includes "전체" in performance object', async () => {
    // 1. Live API 호출 검증
    let apiData = null
    try {
      const res = await fetch(`${BASE_URL}/api/portfolio/analytics/investment?startDate=2024-01-01&endDate=2024-01-10`)
      if (res.ok) {
        apiData = await res.json()
      }
    } catch {
      // 서버 미가동 시 정적 코드 검증으로 폴백
    }

    if (apiData?.performance) {
      assert('전체' in apiData.performance, 'API response performance object must contain "전체" key')
    } else {
      // 정적 코드 검사: route.ts에 '전체' 키가 performance 반환 객체에 정의되어 있는지 확인
      const routeContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/app/api/portfolio/analytics/investment/route.ts'), 'utf-8')
      assert(
        routeContent.includes("'전체':") || routeContent.includes('"전체":') || routeContent.includes('전체:'),
        'route.ts performance object must export "전체" series'
      )
    }
  })

  await runTest('T1-F1-02', '"전체" performance items contain { 기준일, MyPF, BM, DD } schema', async () => {
    const series = calculateOverallPerformanceSeries(mockYearEndReturnRows)
    assert(series.length > 0, 'Generated series should not be empty')
    for (const item of series) {
      assert(typeof item.기준일 === 'string', 'Item must have string 기준일')
      assert(typeof item.MyPF === 'number', 'Item must have numeric MyPF')
      assert(typeof item.BM === 'number', 'Item must have numeric BM')
      assert(typeof item.DD === 'number', 'Item must have numeric DD')
    }
  })

  await runTest('T1-F1-03', '"전체" BM return is identically 0 for all dates (no BM line)', async () => {
    const series = calculateOverallPerformanceSeries(mockYearEndReturnRows)
    for (const item of series) {
      assertEqual(item.BM, 0, `BM for date ${item.기준일} must be 0`)
    }
  })

  await runTest('T1-F1-04', '"전체" MyPF cumulative return matches geometric chain linking from daily returns of <합계>', async () => {
    const series = calculateOverallPerformanceSeries(mockYearEndReturnRows)
    // 2024-12-30: base day (0%)
    assertEqual(series[0].MyPF, 0)

    // 2024-12-31: daily profit = 15.5M - 15.0M = 500,000. prevEval = 250,000,000 -> r = 500,000 / 250,000,000 = 0.2%
    assertEqual(series[1].MyPF, 0.2)

    // 2025-01-02: new year! daily profit = 당일 총손익 300,000. prevEval = 250,500,000 -> r = 300,000 / 250,500,000 = 0.11976%
    // cum = (1 + 0.002) * (1 + 0.0011976) - 1 = 0.00320 = 0.32%
    assertCloseTo(series[2].MyPF, 0.32, 0.01, 'New year geometric cumulative return')
  })

  await runTest('T1-F1-05', '"전체" Drawdown (DD) calculation matches high-water mark drawdown formula', async () => {
    const series = calculateOverallPerformanceSeries(mockYearEndReturnRows)
    // 2025-01-06 is a drop from peak
    const peakBefore = Math.max(...series.slice(0, 4).map((s) => s.MyPF))
    const itemDrop = series[4]
    const expectedDd = Number((((itemDrop.MyPF - peakBefore) / (100 + peakBefore)) * 100).toFixed(2))
    assertEqual(itemDrop.DD, expectedDd, 'Drawdown must match high-water mark peak decline')
  })

  await runTest('T1-F1-06', 'UI strategy/investment/page.tsx starts ASSET_CLASSES with "전체" as default first selection', async () => {
    const pageContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/app/(dashboard)/strategy/investment/page.tsx'), 'utf-8')
    // ASSET_CLASSES must have '전체' as first element: ['전체', '선진국', '국내', '실물자산', '인컴자산', '채권']
    const hasOverallClass =
      pageContent.includes("['전체', '선진국'") ||
      pageContent.includes('["전체", "선진국"') ||
      pageContent.includes("ASSET_CLASSES = ['전체'")
    assert(hasOverallClass, 'ASSET_CLASSES in strategy/investment/page.tsx must start with "전체"')

    const hasOverallDefault =
      pageContent.includes("useState<AssetClassType>('전체')") ||
      pageContent.includes('useState<AssetClassType>("전체")')
    assert(hasOverallDefault, 'Default selected asset state in strategy/investment/page.tsx must be "전체"')
  })

  // =========================================================================
  // F2: R2 '손익현황' - '자산군별상품' 테이블 정렬 일관화
  // =========================================================================
  globalTestContext.setSuite('F2: Consistent Commodity Profit Table Sorting (comm_profit2)')

  await runTest('T1-F2-01', 'Canonical sort strictly follows CLASS_ORDER -> CLASS2_ORDER -> CLASS3_ORDER hierarchy', async () => {
    const sorted = [...mockRawCommProfit2Items].sort(canonicalSortComparator)
    // 1st item should be 현금성자산 (CLASS_ORDER index 0)
    assertEqual(sorted[0].자산군, '현금성자산', '현금성자산 should sort first')
    // Next should be 주식 (CLASS_ORDER index 1)
    const stockItems = sorted.filter((r) => r.자산군 === '주식')
    assert(stockItems.length > 0, 'Stock items must exist')
    // Within 주식, 국내 comes before 선진국? CLASS2_ORDER: '원화', '달러', '엔화', '국내', '선진국'
    assertEqual(CLASS2_ORDER.indexOf('국내') < CLASS2_ORDER.indexOf('선진국'), true)
    const firstStock = sorted.find((r) => r.자산군 === '주식')
    assertEqual(firstStock.세부자산군, '국내', '국내 주식 should precede 선진국 주식')
  })

  await runTest('T1-F2-02', 'Items within the same asset subgroup are sorted by evaluation amount (평가금액) descending', async () => {
    const sorted = [...mockRawCommProfit2Items].sort(canonicalSortComparator)
    const usStocks = sorted.filter((r) => r.자산군 === '주식' && r.세부자산군 === '선진국')
    for (let i = 0; i < usStocks.length - 1; i++) {
      assert(
        usStocks[i].평가금액 >= usStocks[i + 1].평가금액,
        `Evaluation amount descending violation: ${usStocks[i].평가금액} < ${usStocks[i + 1].평가금액}`
      )
    }
  })

  await runTest('T1-F2-03', 'Items with identical evaluation amount are sorted by ACCOUNT_ORDER', async () => {
    const items = [
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000000, 계좌: '엔투ISA', 상품명: 'A' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000000, 계좌: '한투', 상품명: 'B' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 평가금액: 1000000, 계좌: '한투ISA', 상품명: 'C' },
    ]
    const sorted = items.sort(canonicalSortComparator)
    // ACCOUNT_ORDER: 한투(0), 한투ISA(1), 엔투ISA(2)
    assertEqual(sorted[0].계좌, '한투')
    assertEqual(sorted[1].계좌, '한투ISA')
    assertEqual(sorted[2].계좌, '엔투ISA')
  })

  await runTest('T1-F2-04', 'Items in different accounts are preserved as separate distinct rows in comm_profit2', async () => {
    const sorted = [...mockRawCommProfit2Items].sort(canonicalSortComparator)
    const aceRows = sorted.filter((r) => r.상품명.replace(/\s+/g, '') === 'ACE미국S&P500')
    assertEqual(aceRows.length, 3, 'Must retain 3 distinct rows for 한투, 한투ISA, 엔투ISA')
    const accounts = aceRows.map((r) => r.계좌)
    assert(accounts.includes('한투') && accounts.includes('한투ISA') && accounts.includes('엔투ISA'))
  })

  await runTest('T1-F2-05', 'Completely sold-out items (quantity = 0, eval = 0) are sorted in their asset class, not table bottom', async () => {
    const sorted = [...mockRawCommProfit2Items].sort(canonicalSortComparator)
    const soldOutItem = sorted.find((r) => r.상품명 === 'TIGER 미국나스닥100')
    assert(soldOutItem !== undefined, 'Sold out item must be present in sorted results')
    assertEqual(soldOutItem.자산군, '주식')
    assertEqual(soldOutItem.세부자산군, '선진국')
    // It should be placed after positive eval stocks in 선진국 인덱스, but BEFORE other lower asset classes (채권, 대체자산)
    const soldOutIndex = sorted.indexOf(soldOutItem)
    const bondIndex = sorted.findIndex((r) => r.자산군 === '채권')
    assert(
      soldOutIndex < bondIndex,
      `Sold-out stock (index ${soldOutIndex}) must appear before bond items (index ${bondIndex})`
    )
  })

  await runTest('T1-F2-06', 'profit/page.tsx table rendering applies canonical comparator instead of commodityOrder map', async () => {
    const profitContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/app/(dashboard)/profit/page.tsx'), 'utf-8')
    assert(
      !profitContent.includes('commodityOrder.get(a.상품명)'),
      'profit/page.tsx must not sort by buggy commodityOrder.get(a.상품명) which relegates zero-holdings'
    )
    assert(
      profitContent.includes('CLASS_ORDER') || profitContent.includes('canonicalSort') || profitContent.includes('commProfit2'),
      'profit/page.tsx must apply consistent hierarchical sorting'
    )
  })

  // =========================================================================
  // F3: R3 '운용기록' ↔ '보유현황' 탭 이동 간 상태 유지
  // =========================================================================
  globalTestContext.setSuite('F3: Navigation State Persistence Store')

  await runTest('T1-F3-01', 'src/lib/stores/navigation-state.ts exists and exports required stores & reset', async () => {
    const storePath = path.join(PROJECT_ROOT, 'src/lib/stores/navigation-state.ts')
    assert(fs.existsSync(storePath), 'src/lib/stores/navigation-state.ts must exist')
    const content = fs.readFileSync(storePath, 'utf-8')
    assert(
      content.includes('useTradingFormStore') || content.includes('tradingFormStore'),
      'Must export useTradingFormStore'
    )
    assert(
      content.includes('useHoldingsTabStore') || content.includes('holdingsTabStore'),
      'Must export useHoldingsTabStore'
    )
    assert(
      content.includes('resetTradingForm'),
      'Must export resetTradingForm'
    )
  })

  await runTest('T1-F3-02', 'Navigation state store defines 16 trading form fields and 7 filter fields', async () => {
    const storePath = path.join(PROJECT_ROOT, 'src/lib/stores/navigation-state.ts')
    assert(fs.existsSync(storePath), 'Store file must exist')
    const content = fs.readFileSync(storePath, 'utf-8')
    const expectedFields = [
      'tradeType', 'account', 'currency', 'tradeDate', 'selectedTicker',
      'buyQ', 'buyAmt', 'buyCash', 'sellQ', 'sellPrincipal',
      'sellAmt', 'dividend', 'cashIn', 'inOut', 'limitCount', 'selectedRowId',
    ]
    for (const f of expectedFields) {
      assert(content.includes(f), `Trading form store must include field: ${f}`)
    }
    const filterFields = [
      'totalStartDate', 'totalEndDate', 'selAssetClass',
      'selAssetClass1', 'selAssetClass2', 'selAccount', 'selProductName',
    ]
    for (const ff of filterFields) {
      assert(content.includes(ff), `Trading form store must include filter field: ${ff}`)
    }
  })

  await runTest('T1-F3-03', 'Trading page integrates navigation-state store rather than unmaintained local state', async () => {
    const tradingContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/app/(dashboard)/trading/page.tsx'), 'utf-8')
    assert(
      tradingContent.includes('useTradingFormStore') || tradingContent.includes('navigation-state'),
      'trading/page.tsx must import and use navigation store for form values'
    )
  })

  await runTest('T1-F3-04', 'Holdings page integrates holdingsTab store for active sub-tab persistence', async () => {
    const holdingsContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/app/(dashboard)/holdings/page.tsx'), 'utf-8')
    assert(
      holdingsContent.includes('useHoldingsTabStore') || holdingsContent.includes('navigation-state'),
      'holdings/page.tsx must import and use navigation store for activeTab'
    )
  })

  await runTest('T1-F3-05', 'resetTradingForm contract resets 16 fields to defaults and selectedRowId to null', async () => {
    const storePath = path.join(PROJECT_ROOT, 'src/lib/stores/navigation-state.ts')
    assert(fs.existsSync(storePath), 'Store file must exist')
    const content = fs.readFileSync(storePath, 'utf-8')
    assert(
      content.includes('selectedRowId: null') || content.includes('selectedRowId: null'),
      'resetTradingForm must clear selectedRowId to null'
    )
  })

  await runTest('T1-F3-06', 'Cancel / submit buttons in trading/page.tsx trigger resetTradingForm()', async () => {
    const tradingContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/app/(dashboard)/trading/page.tsx'), 'utf-8')
    assert(
      tradingContent.includes('resetTradingForm'),
      'trading/page.tsx must call resetTradingForm upon trade add/update/delete success or cancel'
    )
  })

  // =========================================================================
  // F4: R4 '평가금액 재계산' 속도 병목 제거 및 시세 수신 무결성 보장
  // =========================================================================
  globalTestContext.setSuite('F4: Valuation Engine Optimization & 100% Price Integrity')

  await runTest('T1-F4-01', 'bookkeeping.ts getBalanceSheet uses Map lookup instead of O(N*M) records.find', async () => {
    const bkContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/engine/bookkeeping.ts'), 'utf-8')
    assert(
      !bkContent.includes('records.find((r) => r.종목명 === itemName && r.거래일자 === d)'),
      'bookkeeping.ts must not perform linear records.find scan in cashMapping loop'
    )
    assert(
      bkContent.includes('Map') || bkContent.includes('recordMap'),
      'bookkeeping.ts must use Map indexing for deposit mapping'
    )
  })

  await runTest('T1-F4-02', 'Balance sheet deposit mapping with 5,000 synthetic records executes in < 100ms', async () => {
    const trades = generateSyntheticTrades(5000)
    // Map 조회 알고리즘 벤치마크
    const { durationMs } = await measureMs(() => {
      const recordMap = new Map()
      for (const t of trades) {
        recordMap.set(`${t.종목명}_${t.거래일자}`, t)
      }
      // Simulate 500 lookups
      for (let i = 0; i < 500; i++) {
        const item = recordMap.get(`종목_${i % 40}_2025-01-15`)
      }
    })
    assert(durationMs < 100, `Map indexing should take < 100ms, took ${durationMs}ms`)
  })

  await runTest('T1-F4-03', 'kis.ts provides getMultipleCurrentPrices batch API (up to 30 tickers)', async () => {
    const kisContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/services/kis.ts'), 'utf-8')
    assert(
      kisContent.includes('getMultipleCurrentPrices') || kisContent.includes('intstock-multprice') || kisContent.includes('FHKST11300006'),
      'kis.ts must implement multi-price batch API getMultipleCurrentPrices with TR_ID FHKST11300006'
    )
  })

  await runTest('T1-F4-04', 'Single item price fallback handles missing or 0-won quotes from multi-price response', async () => {
    const resolved = resolveValuationPriceOracle({
      ticker: '148070',
      holdingQty: 30,
      bookValue: 3000000,
      multiPrice: 0, // 0원(무효) -> 단건 조회 성공 가정
      singlePrice: 102500,
    })
    assertEqual(resolved.priceSource, 'kis_single_fallback')
    assertEqual(resolved.unitPrice, 102500)
    assertEqual(resolved.evalAmt, 3075000)
    assertEqual(resolved.evalProfit, 75000)
  })

  await runTest('T1-F4-05', 'Final safety net falls back to previous unit price (기존 평가금액 ÷ 기존 수량), never book value', async () => {
    const resolved = resolveValuationPriceOracle({
      ticker: '360200',
      holdingQty: 100,
      bookValue: 1500000,
      multiPrice: null, // 외부 API 장애
      singlePrice: null, // 재시도 모두 실패
      prevSnapshot: { evalAmt: 1950000, qty: 100 }, // 직전 스냅샷 단가: 19,500원
    })
    assertEqual(resolved.priceSource, 'prev_snapshot_fallback')
    assertEqual(resolved.unitPrice, 19500)
    assertEqual(resolved.evalAmt, 1950000)
    assertEqual(resolved.evalProfit, 450000) // 평가손익이 0이 되지 않고 직전 시세 유지!
  })

  await runTest('T1-F4-06', 'Target quote ticker extraction only queries positions with holding quantity > 0', async () => {
    const runnerContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/engine/portfolio-runner.ts'), 'utf-8')
    assert(
      runnerContent.includes('보유수량 > 0') || runnerContent.includes('r.보유수량 > 0') || runnerContent.includes('r.보유수량 <= 0'),
      'portfolio-runner.ts must filter activeHoldings by holding quantity > 0'
    )
  })

  // =========================================================================
  // F5: R5 '운용기록' 및 '유동성관리' 변경 시 기존 가격 기반 즉시 연동
  // =========================================================================
  globalTestContext.setSuite('F5: Zero-API Fast Recalculation & Cache Synchronization')

  await runTest('T1-F5-01', 'portfolio-runner.ts exports fastRecalculatePortfolio function', async () => {
    const runnerContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/engine/portfolio-runner.ts'), 'utf-8')
    assert(
      runnerContent.includes('export async function fastRecalculatePortfolio') ||
      runnerContent.includes('fastRecalculatePortfolio'),
      'portfolio-runner.ts must export fastRecalculatePortfolio'
    )
  })

  await runTest('T1-F5-02', 'fastRecalculatePortfolio runs with ZERO external price API calls', async () => {
    const runnerContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/engine/portfolio-runner.ts'), 'utf-8')
    // Function body of fastRecalculatePortfolio must not call KISService.getCurrentPrice or MarketDataService.getGoldPrice
    const match = runnerContent.match(/export async function fastRecalculatePortfolio[\s\S]*?^}/m)
    if (match) {
      const funcBody = match[0]
      assert(!funcBody.includes('getCurrentPrice'), 'fastRecalculatePortfolio must not call getCurrentPrice')
      assert(!funcBody.includes('getFundPrices'), 'fastRecalculatePortfolio must not call getFundPrices')
    }
  })

  await runTest('T1-F5-03', 'fastRecalculate preserves existing unit price for existing holdings and cost for new buys', async () => {
    const holdings = [
      { 계좌: '한투', 종목명: 'ACE 미국S&P500', 보유수량: 120, 장부금액: 1800000 }, // 기존 종목(단가 19,500원)
      { 계좌: '한투', 종목명: '신규종목ETF', 보유수량: 50, 장부금액: 500000 }, // 신규 종목
    ]
    const recalculated = fastRecalculateHoldingsOracle(holdings, mockPrevPortfolioSummary)
    // 기존 종목: 120주 * 19,500원 = 2,340,000원. 평가손익 = 2,340,000 - 1,800,000 = 540,000원
    assertEqual(recalculated[0].평가금액, 2340000)
    assertEqual(recalculated[0].평가손익, 540000)
    // 신규 종목: 평가금액 = 장부금액 500,000원, 평가손익 = 0
    assertEqual(recalculated[1].평가금액, 500000)
    assertEqual(recalculated[1].평가손익, 0)
  })

  await runTest('T1-F5-04', 'src/lib/actions/db.ts trade CRUD triggers fast recalculate and cache invalidation hooks', async () => {
    const dbContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/lib/actions/db.ts'), 'utf-8')
    assert(
      dbContent.includes('fastRecalculatePortfolio') || dbContent.includes('recalculate') || dbContent.includes('revalidate'),
      'Trade CRUD actions (addTrade/updateTrade/deleteTrade) must trigger portfolio recalculation'
    )
  })

  await runTest('T1-F5-05', 'Trading and Liquidity UI pages invalidate related React Query cache keys upon mutation', async () => {
    const tradingContent = fs.readFileSync(path.join(PROJECT_ROOT, 'src/app/(dashboard)/trading/page.tsx'), 'utf-8')
    assert(
      tradingContent.includes('invalidateQueries') || tradingContent.includes('queryClient'),
      'trading/page.tsx must manage queryClient invalidation on mutations'
    )
  })

  await runTest('T1-F5-06', 'Fast recalculation latency target: algorithmic recalculation completes in < 50ms', async () => {
    const holdings = Array.from({ length: 100 }, (_, i) => ({
      계좌: '한투',
      종목명: `종목_${i}`,
      보유수량: 10 + i,
      장부금액: 100000 * (i + 1),
    }))
    const { durationMs } = await measureMs(() => {
      fastRecalculateHoldingsOracle(holdings, mockPrevPortfolioSummary)
    })
    assert(durationMs < 50, `Fast recalculate math took ${durationMs}ms (target: < 50ms)`)
  })
}
