import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const types = require('../../.tmp-test/alm-tpa-types.js')
const opt = require('../../.tmp-test/saa-taa-optimizer.js')
const alm = require('../../.tmp-test/alm-projection.js')
const attr = require('../../.tmp-test/attribution-engine.js')
const bt = require('../../.tmp-test/backtest.js')

test('computeHouseholdBalanceSheet computes leverage and ICR accurately', () => {
  const bs = alm.computeHouseholdBalanceSheet(506_046_857, null, 8_790_000, 2026)
  assert.equal(bs.investmentDebtKrw, 120_000_000)
  assert.equal(bs.maturityDebtKrw, 70_000_000)
  assert.equal(bs.netInvestmentCapitalKrw, 386_046_857)
  assert.equal(bs.leverageRatio, 1.31)
  assert.equal(bs.annualInterestOutflowKrw, 3_900_000 + 420_000)
  assert.ok(bs.icr > 2.0 && bs.icr < 2.1)
  assert.equal(bs.currentAge, 42)
})

test('computeMortgage2029Tracker measures non-pension buffer & shortfall correctly', () => {
  const accountAllocation = [
    { 자산군: '채권', 세부자산군: '만기보유', 세부자산군2: '크레딧', 한투: 7_466_863, 한투ISA: 5_047_839 },
    { 자산군: '채권', 세부자산군: '만기보유', 세부자산군2: '안전자산', 엔투하영: 3_300_000 }, // excluded (엔투하영)
    { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '원화상품', 한투ISA: 9_189_635 },
    { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '외화상품', 불리오: 9_194_472 },
    { 자산군: '현금성', 세부자산군: '현금', 세부자산군2: '원화', 한투ISA: 252_797, 농협IRP: 3_674_809 }, // IRP excluded
  ]

  const tracker = alm.computeMortgage2029Tracker(accountAllocation, null, [], '2026-11-26')
  const expected = 7_466_863 + 5_047_839 + 9_189_635 + 9_194_472 + 252_797
  assert.equal(tracker.currentBufferKrw, expected)
  assert.equal(tracker.shortfallKrw, 70_000_000 - expected)
  assert.equal(tracker.monthsRemaining, 37)
  assert.ok(tracker.requiredMonthlyPaceKrw > 1_000_000)
})

test('projectAlm30Years handles Bond Tent glide path and 2029 debt payoff', () => {
  const schedules = [
    {
      title: '한투 월급 순저축',
      account: '한투',
      flow_type: 'salary_saving',
      cadence: 'monthly',
      amount_krw: 3_500_000,
      growth_rate_pct: 3.0,
      start_date: '2026-12-01',
      end_date: '2044-12-31',
      is_active: true,
    },
    {
      title: '주담대 만기 상환',
      account: '한투',
      flow_type: 'debt_principal',
      cadence: 'one_off',
      amount_krw: -70_000_000,
      growth_rate_pct: 0,
      start_date: '2029-12-31',
      end_date: '2029-12-31',
      is_active: true,
    },
  ]
  const pts = alm.projectAlm30Years({
    currentTotalAssetsKrw: 506_046_857,
    almConfig: null,
    schedules,
    startYear: 2026,
    horizonYears: 30,
  })
  assert.equal(pts.length, 31)
  // 2026 (age 42) -> 75% equity, debt 1.9억
  assert.equal(pts[0].targetEquityPct, 75)
  assert.equal(pts[0].remainingDebtKrw, 190_000_000)
  // 2029 (year 2029): 7,000만 mortgage paid off -> remaining debt drops to 1.2억
  const pt2029 = pts.find((p) => p.year === 2029)
  assert.equal(pt2029.remainingDebtKrw, 120_000_000)
  assert.ok(pt2029.events.includes('주담대 만기 상환'))
  // 2046 (age 62): Bond Tent target 60%
  const pt2046 = pts.find((p) => p.year === 2046)
  assert.equal(pt2046.targetEquityPct, 60)
  // Optimistic > Base > Pessimistic
  assert.ok(pts[30].optimisticNetKrw > pts[30].baseNetKrw)
  assert.ok(pts[30].baseNetKrw > pts[30].pessimisticNetKrw)
})

test('computeFiveStageAttribution satisfies exact additive identity', () => {
  const dates = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07']
  const bmDailyReturns = {}
  for (const k of types.MAJOR_9_KEYS) {
    bmDailyReturns[k] = [0, 0.01, -0.005, 0.008]
  }
  bmDailyReturns.만기보유채권 = [0, 0.001, 0.001, 0.001]
  bmDailyReturns.현금성자산 = [0, 0.0001, 0.0001, 0.0001]

  const actualDailyWeights = dates.map(() => ({
    ...opt.DEFAULT_TAA_WEIGHTS_9,
    선진국주식: opt.DEFAULT_TAA_WEIGHTS_9.선진국주식 + 3,
    만기보유채권: opt.DEFAULT_TAA_WEIGHTS_9.만기보유채권 - 3,
  }))
  const myPfDailyReturns = [0, 0.011, -0.004, 0.009]

  const res = attr.computeFiveStageAttribution({
    dates,
    bmDailyReturns,
    myPfDailyReturns,
    actualDailyWeights,
    refWeights: opt.DEFAULT_REF_WEIGHTS_9,
    saaWeights: opt.DEFAULT_SAA_WEIGHTS_9,
    taaWeights: opt.DEFAULT_TAA_WEIGHTS_9,
  })

  const bd = res.breakdown
  const reconstructed =
    bd.refReturnPct +
    bd.saaEffectPct +
    bd.taaEffectPct +
    bd.driftEffectPct +
    bd.selectionExecutionEffectPct
  assert.ok(
    Math.abs(reconstructed - bd.myPfReturnPct) < 1e-6,
    `Additive identity broken: ${reconstructed} vs ${bd.myPfReturnPct}`
  )
  assert.equal(res.series.length, 4)
})

test('computeCoreSatelliteXRay classifies holdings and detects Satellite > 20% breach', () => {
  const holdings = [
    { 계좌: '미래DC', 종목코드: '360200', 상품명: 'ACE미국S&P500', 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 통화: '원화', 평가금액: 70_000_000, 평가수익률: 15 },
    { 계좌: '한투ISA', 종목코드: '446770', 상품명: 'ACE글로벌반도체TOP4', 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '테마', 통화: '원화', 평가금액: 30_000_000, 평가수익률: 22 },
  ]
  const strategyTags = [
    { ticker_code: '360200', asset_name: 'ACE미국S&P500', strategy_role: 'core', factor_cluster: 'S&P500', economic_currency: 'USD', is_pension_safe_override: false, equity_beta_override: null },
    { ticker_code: '446770', asset_name: 'ACE글로벌반도체TOP4', strategy_role: 'satellite', factor_cluster: 'AI/반도체', economic_currency: 'USD', is_pension_safe_override: false, equity_beta_override: null },
  ]
  const res = attr.computeCoreSatelliteXRay({ holdings, strategyTags })
  assert.equal(res.corePct, 70)
  assert.equal(res.satellitePct, 30)
  assert.equal(res.maxClusterName, 'S&P500')
  assert.equal(res.maxClusterPct, 70)
  assert.ok(res.riskComparison.current.alerts.some((a) => a.code === 'SATELLITE_HARDCAP_BREACH'))
})

test('selectLatestAlloRow picks the latest row instead of oldest', () => {
  const rows = [
    { 행번호: 1, 배분일자: '2025-12-21', 구분: 'SAA', 해외주식: 45.5 },
    { 행번호: 2, 배분일자: '2025-12-21', 구분: 'TAA1', 해외주식: 49.0 },
    { 행번호: 5, 배분일자: '2026-05-11', 구분: 'TAA1', 해외주식: 45.5 },
    { 행번호: 6, 배분일자: '2026-05-11', 구분: 'TAA2', 해외주식: 45.5 },
  ]
  const pickedTaa = bt.selectLatestAlloRow(rows, ['TAA', 'TAA2', 'TAA1'])
  assert.equal(pickedTaa.행번호, 6)
  const pickedTaa1 = bt.selectLatestAlloRow(rows, ['TAA1'])
  assert.equal(pickedTaa1.행번호, 5)
})
