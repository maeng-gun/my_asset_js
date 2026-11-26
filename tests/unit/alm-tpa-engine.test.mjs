import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// Compiled via tsc into .tmp-test during verification
const types = require('../../.tmp-test/alm-tpa-types.js')
const opt = require('../../.tmp-test/saa-taa-optimizer.js')
const solver = require('../../.tmp-test/location-solver.js')

test('MAJOR_9_ASSETS covers all 22 leaf rows without duplicates and maps cleanly to 6 columns', () => {
  const leafKeys = new Set()
  for (const major of types.MAJOR_9_ASSETS) {
    for (const sub of major.subRows) {
      const k = `${sub.자산군}|${sub.세부자산군}|${sub.세부자산군2}`
      assert.equal(leafKeys.has(k), false, `Duplicate leaf key: ${k}`)
      leafKeys.add(k)
      assert.equal(
        types.classifyLeafToMajor9(sub.자산군, sub.세부자산군, sub.세부자산군2),
        major.key
      )
    }
  }
  assert.equal(leafKeys.size, 22)

  const allo6 = types.aggregate9ToAllo6(opt.DEFAULT_SAA_WEIGHTS_9)
  assert.equal(allo6.해외주식, 45)
  assert.equal(allo6.국내주식, 19) // 국내 16 + 신흥국 3
  assert.equal(allo6.실물자산, 10) // 귀금속 7 + 원자재 3
  assert.equal(allo6.인컴자산, 5)
  assert.equal(allo6.만기보유채권, 13)
  assert.equal(allo6.시장형채권, 5)
})

test('Proportional corridor band follows min(5.0, max(1.5, 0.25 * w*))', () => {
  assert.equal(opt.computeProportionalCorridor(45), 5.0)
  assert.equal(opt.computeProportionalCorridor(16), 4.0)
  assert.equal(opt.computeProportionalCorridor(13), 3.25)
  assert.equal(opt.computeProportionalCorridor(7), 1.75)
  assert.equal(opt.computeProportionalCorridor(3), 1.5)
  assert.equal(opt.computeProportionalCorridor(0), 1.5)
})

test('evaluateTpaRiskMetrics computes exact equity-equivalent beta and 100% risk contribution sum', () => {
  const saaMetrics = opt.evaluateTpaRiskMetrics(opt.DEFAULT_SAA_WEIGHTS_9)
  assert.equal(saaMetrics.equityEqBetaPct, 74.85)
  const rcSum = Object.values(saaMetrics.riskContributionsPct).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(rcSum - 100) < 0.2, `RC sum should be ~100%, got ${rcSum}`)
  assert.ok(saaMetrics.trackingErrorPct <= 6.0)

  const taaMetrics = opt.evaluateTpaRiskMetrics(opt.DEFAULT_TAA_WEIGHTS_9)
  assert.equal(taaMetrics.equityEqBetaPct, 70.48)

  const riskyWeights = { ...opt.DEFAULT_SAA_WEIGHTS_9, 선진국주식: 75, 만기보유채권: 0, 현금성자산: 0, 시장형채권: 0 }
  const alertMetrics = opt.evaluateTpaRiskMetrics(riskyWeights, opt.DEFAULT_REF_WEIGHTS_9, opt.DEFAULT_LTCMA_INPUTS, {
    satelliteWeightPct: 32.98,
  })
  assert.ok(alertMetrics.alerts.some((a) => a.code === 'SATELLITE_HARDCAP_BREACH'))
})

test('computeBlackLittermanSAA converges within constraints (sum=100%, debt floor, beta band)', () => {
  const bl = opt.computeBlackLittermanSAA({
    minNonPensionDebtFloorPct: 13.83,
    targetBetaEqPct: 75.0,
    betaTolerancePct: 2.0,
  })
  const w = bl.roundedWeights9
  const total = types.sumWeights9(w)
  assert.ok(Math.abs(total - 100) < 0.05, `Total weight must equal 100%, got ${total}`)
  assert.ok(
    w.만기보유채권 + w.현금성자산 >= 13.83 - 0.5,
    `Debt floor must hold, got ${w.만기보유채권 + w.현금성자산}`
  )
  const beta = types.computeEquityEqBeta(w)
  assert.ok(beta >= 72.5 && beta <= 77.5, `Beta should be near 75±2%p, got ${beta}`)
})

test('computeTaaFromScorecard respects neutral=SAA and enforces ±5%p and beta±7.5%p guardrails', () => {
  const neutral = opt.computeTaaFromScorecard(opt.DEFAULT_SAA_WEIGHTS_9, {
    cycle: 0,
    inflationRates: 0,
    valuationFx: 0,
    policyEvent: 0,
  })
  for (const k of types.MAJOR_9_KEYS) {
    assert.equal(neutral.weights9[k], opt.DEFAULT_SAA_WEIGHTS_9[k])
  }

  const extreme = opt.computeTaaFromScorecard(opt.DEFAULT_SAA_WEIGHTS_9, {
    cycle: 2,
    inflationRates: -2,
    valuationFx: 2,
    policyEvent: 2,
  })
  assert.ok(Math.abs(types.sumWeights9(extreme.weights9) - 100) < 0.05)
  for (const k of types.MAJOR_9_KEYS) {
    assert.ok(
      Math.abs(extreme.tilts9[k]) <= 5.05,
      `Tilt for ${k} exceeded ±5%p: ${extreme.tilts9[k]}`
    )
  }
  const extBeta = types.computeEquityEqBeta(extreme.weights9)
  assert.ok(extBeta >= 67.4 && extBeta <= 82.6, `Extreme TAA beta out of guardrail: ${extBeta}`)
})

test('solveAccountLocation enforces no_sell and all locked Q5 11-account IPS rules', () => {
  // Realistic snapshot matching live 5.06억 family portfolio
  const accountAllocation = [
    { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', 미래DC: 38_572_520, 농협IRP: 9_772_070, 엔투ISA: 11_562_040, 엔투IRP: 4_226_460 },
    { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '테마', 한투ISA: 46_753_100, 엔투저축연금: 24_749_760, 미래DC: 23_403_240, 농협IRP: 28_716_315, 한투연금저축: 8_501_940, 엔투IRP: 1_676_680 },
    { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '종목', 불리오: 23_900_711 },
    { 자산군: '주식', 세부자산군: '신흥국', 세부자산군2: '인덱스', 한투ISA: 8_283_000, 농협IRP: 566_306 },
    { 자산군: '주식', 세부자산군: '신흥국', 세부자산군2: '테마', 한투ISA: 5_882_110, 미래DC: 1_242_450 },
    { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', 한투: 27_297_675, 한투ISA: 3_885_615, 엔투하영: 6_557_070 },
    { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '테마', 한투: 31_565_125, 한투ISA: 3_825_165, 미래DC: 3_960_643 },
    { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '종목', 한투: 5_305_000, 엔투하영: 5_897_400 },
    { 자산군: '대체자산', 세부자산군: '실물자산', 세부자산군2: '귀금속', 금현물: 57_239_280 },
    { 자산군: '대체자산', 세부자산군: '실물자산', 세부자산군2: '원자재', 미래DC: 11_934_100, 한투ISA: 19_403_740, 엔투ISA: 5_162_600, 한투연금저축: 1_937_220 },
    { 자산군: '대체자산', 세부자산군: '인컴자산', 세부자산군2: '국내', 엔투ISA: 6_536_760, 한투ISA: 5_091_060, 농협IRP: 4_567_680 },
    { 자산군: '대체자산', 세부자산군: '인컴자산', 세부자산군2: '해외', 엔투ISA: 7_767_360, 농협IRP: 5_194_050, 한투ISA: 2_010_600 },
    { 자산군: '채권', 세부자산군: '만기보유', 세부자산군2: '안전자산', 엔투하영: 3_300_000 },
    { 자산군: '채권', 세부자산군: '만기보유', 세부자산군2: '크레딧', 한투: 7_466_863, 한투ISA: 5_047_839 },
    { 자산군: '채권', 세부자산군: '시장형', 세부자산군2: '국내', 한투ISA: 4_927_010, 엔투ISA: 2_935_240 },
    { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '원화상품', 한투ISA: 9_189_635, 엔투하영: 1_060_500 },
    { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '외화상품', 불리오: 9_194_472 },
    { 자산군: '현금성', 세부자산군: '현금', 세부자산군2: '원화', 농협IRP: 3_674_809, 엔투저축연금: 687_040, 엔투ISA: 619_548, 미래DC: 602_263, 한투ISA: 252_797, 한투연금저축: 40_972, 엔투IRP: 40_809 },
    { 자산군: '현금성', 세부자산군: '현금', 세부자산군2: '외환', 한투: 1_107, 불리오: 13 },
  ]

  // 1) no_sell mode: zero non-cash sells
  const noSell = solver.solveAccountLocation({
    accountAllocation,
    targetWeights9: opt.DEFAULT_TAA_WEIGHTS_9,
    expectedInflowKrw: 7_000_000,
    mode: 'no_sell',
  })
  assert.equal(noSell.totalSellKrw, 0, 'no_sell mode must have 0 sell amount')
  for (const [acct, deltas] of Object.entries(noSell.accountDeltas9)) {
    for (const m of types.MAJOR_9_KEYS) {
      if (m === '현금성자산') continue
      assert.ok(deltas[m] >= -1, `no_sell had sell in ${acct}/${m}: ${deltas[m]}`)
    }
  }

  // 2) tax_min_full mode: strict Q5 IPS enforcement
  const full = solver.solveAccountLocation({
    accountAllocation,
    targetWeights9: opt.DEFAULT_TAA_WEIGHTS_9,
    expectedInflowKrw: 0,
    mode: 'tax_min_full',
  })

  // 한투 only buys 국내주식, 만기보유채권, 현금성자산
  for (const m of types.MAJOR_9_KEYS) {
    if (!['국내주식', '만기보유채권', '현금성자산'].includes(m)) {
      assert.ok(full.accountDeltas9['한투'][m] <= 0, `한투 bought disallowed ${m}`)
    }
  }
  // 금현물 exclusive for 귀금속
  for (const acct of Object.keys(full.accountDeltas9)) {
    if (acct !== '금현물') {
      assert.ok(full.accountDeltas9[acct].귀금속 <= 0, `${acct} bought 귀금속`)
    }
  }
  // 5 pensions never buy 국내주식, 귀금속, 만기보유채권 & never withdraw externally
  for (const pAcct of types.PENSION_ACCOUNTS) {
    assert.ok(full.accountDeltas9[pAcct].국내주식 <= 0, `${pAcct} bought 국내주식`)
    assert.ok(full.accountDeltas9[pAcct].귀금속 <= 0, `${pAcct} bought 귀금속`)
    assert.ok(full.accountDeltas9[pAcct].만기보유채권 <= 0, `${pAcct} bought 만기보유채권`)
    const summary = full.accountSummaries.find((s) => s.account === pAcct)
    assert.ok(summary.netFlowKrw >= -100, `${pAcct} had external withdrawal: ${summary.netFlowKrw}`)
  }
  // Closed pools (한투ISA, 한투연금저축) net external flow = 0
  for (const closedAcct of ['한투ISA', '한투연금저축']) {
    const summary = full.accountSummaries.find((s) => s.account === closedAcct)
    assert.ok(
      Math.abs(summary.netFlowKrw) <= 100,
      `Closed account ${closedAcct} netFlow must be 0, got ${summary.netFlowKrw}`
    )
  }
  // 엔투ISA annual cap 2,000만 & no 만기보유채권
  const n2IsaSummary = full.accountSummaries.find((s) => s.account === '엔투ISA')
  assert.ok(n2IsaSummary.netFlowKrw <= 20_000_000 + 100)
  assert.ok(full.accountDeltas9['엔투ISA'].만기보유채권 <= 0)

  // 엔투하영 only buys 국내주식
  for (const m of types.MAJOR_9_KEYS) {
    if (m !== '국내주식' && m !== '현금성자산') {
      assert.ok(full.accountDeltas9['엔투하영'][m] <= 0, `엔투하영 bought ${m}`)
    }
  }
})
