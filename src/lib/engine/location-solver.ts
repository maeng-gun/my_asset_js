import {
  ACCOUNT_IPS_RULES,
  AccountLocationRequest,
  AccountLocationResult,
  AccountLocationSummary,
  AccountOrderHint,
  ConstraintViolation,
  DEFAULT_PENSION_SAFE_CODES,
  MAJOR_9_ASSETS,
  MAJOR_9_KEYS,
  Major9Key,
  NON_PENSION_MORTGAGE_ACCOUNTS,
  TransferInstruction,
  Weights9,
  createZeroWeights9,
  isPensionSafeName,
} from './alm-tpa-types'
import { ALLOCATION_ACCOUNTS } from './types'

const CANONICAL_SUBROW: Record<Major9Key, { 자산군: string; 세부자산군: string; 세부자산군2: string; label: string }> = {
  선진국주식: { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', label: '선진국 인덱스' },
  신흥국주식: { 자산군: '주식', 세부자산군: '신흥국', 세부자산군2: '인덱스', label: '신흥국 인덱스' },
  국내주식: { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', label: '국내 인덱스' },
  귀금속: { 자산군: '대체자산', 세부자산군: '실물자산', 세부자산군2: '귀금속', label: '실물자산 귀금속' },
  원자재: { 자산군: '대체자산', 세부자산군: '실물자산', 세부자산군2: '원자재', label: '실물자산 원자재' },
  인컴자산: { 자산군: '대체자산', 세부자산군: '인컴자산', 세부자산군2: '국내', label: '인컴자산 국내' },
  만기보유채권: { 자산군: '채권', 세부자산군: '만기보유', 세부자산군2: '안전자산', label: '만기보유 안전자산' },
  시장형채권: { 자산군: '채권', 세부자산군: '시장형', 세부자산군2: '국내', label: '시장형 국내' },
  현금성자산: { 자산군: '현금성', 세부자산군: '현금', 세부자산군2: '원화', label: '현금 원화' },
}

const BUY_PRIORITY: Record<Major9Key, string[]> = {
  만기보유채권: ['한투', '한투ISA'],
  시장형채권: ['농협IRP', '미래DC', '엔투IRP', '엔투저축연금', '한투ISA', '엔투ISA', '한투연금저축', '불리오'],
  선진국주식: ['엔투ISA', '미래DC', '농협IRP', '엔투저축연금', '엔투IRP', '한투ISA', '한투연금저축', '불리오'],
  신흥국주식: ['엔투ISA', '한투ISA', '미래DC', '농협IRP', '엔투저축연금', '엔투IRP', '불리오'],
  국내주식: ['한투', '엔투하영', '엔투ISA', '한투ISA'],
  귀금속: ['금현물'],
  원자재: ['엔투ISA', '한투ISA', '미래DC', '농협IRP', '엔투저축연금', '엔투IRP', '불리오'],
  인컴자산: ['엔투ISA', '한투ISA', '농협IRP', '미래DC', '엔투저축연금', '엔투IRP', '불리오'],
  현금성자산: ['한투', '금현물', '불리오'],
}

const MIN_REBALANCE_UNIT_KRW = 10_000

function roundKrw(val: number): number {
  return Math.round(val)
}

function getTaxNoteForAccount(acct: string, direction: 'BUY' | 'SELL'): string {
  const rule = ACCOUNT_IPS_RULES[acct]
  if (!rule) return ''
  if (direction === 'SELL') {
    if (rule.sellTaxPenalty === 0) return '비과세/과세이연 계좌 내부 교체 (세금 0원)'
    if (acct === '불리오') return '해외양도세 22% (250만 공제 후) 유의 — 최후 매도'
    return '일반계좌 매도 (배당소득/수수료 점검)'
  }
  if (acct === '한투') return '중앙 허브 직접 매수'
  if (acct === '금현물') return 'KRX 금현물 비과세 매수'
  if (rule.taxWrapper === 'isa' || rule.taxWrapper === 'dc' || rule.taxWrapper === 'irp' || rule.taxWrapper === 'pension_savings') {
    return '절세계좌 내 적격 상품 매수'
  }
  return rule.role
}

export function solveAccountLocation(req: AccountLocationRequest): AccountLocationResult {
  const accounts = [...ALLOCATION_ACCOUNTS]
  const holdings = req.holdings ?? []
  const mortgageFloor = req.mortgageFloorKrw ?? 70_000_000
  const safeCodeSet = new Set<string>(DEFAULT_PENSION_SAFE_CODES)
  for (const tag of req.strategyTags ?? []) {
    if (tag.is_pension_safe_override) {
      safeCodeSet.add(tag.ticker_code)
    }
  }

  // 1. Build current 11x9 matrix and leaf lookup
  const curMatrix: Record<string, Weights9> = {}
  const leafLookup: Record<string, Record<string, Record<string, number>>> = {}

  for (const acct of accounts) {
    curMatrix[acct] = createZeroWeights9()
    leafLookup[acct] = {}
    for (const key of MAJOR_9_KEYS) {
      leafLookup[acct][key] = {}
    }
  }

  let currentTotalKrw = 0
  for (const major of MAJOR_9_ASSETS) {
    for (const sub of major.subRows) {
      const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
      const found = req.accountAllocation.find(
        (r) =>
          r.자산군 === sub.자산군 &&
          r.세부자산군 === sub.세부자산군 &&
          r.세부자산군2 === sub.세부자산군2
      )
      for (const acct of accounts) {
        const val = Number(found?.[acct] ?? 0) || 0
        curMatrix[acct][major.key] += val
        leafLookup[acct][major.key][rowKey] = val
        currentTotalKrw += val
      }
    }
  }

  const targetTotalKrw = Math.max(0, currentTotalKrw + (Number(req.expectedInflowKrw) || 0))
  const currentMacro: Weights9 = createZeroWeights9()
  for (const m of MAJOR_9_KEYS) {
    currentMacro[m] = accounts.reduce((acc, a) => acc + curMatrix[a][m], 0)
  }

  const targetMacro: Weights9 = createZeroWeights9()
  const macroGap: Weights9 = createZeroWeights9()
  for (const m of MAJOR_9_KEYS) {
    targetMacro[m] = roundKrw(targetTotalKrw * ((Number(req.targetWeights9[m]) || 0) / 100))
    macroGap[m] = targetMacro[m] - currentMacro[m]
  }
  // Adjust rounding residual on 현금성자산
  const targetSum = MAJOR_9_KEYS.reduce((a, m) => a + targetMacro[m], 0)
  const totalResidual = roundKrw(targetTotalKrw) - targetSum
  targetMacro.현금성자산 += totalResidual
  macroGap.현금성자산 += totalResidual

  // Calculate initial DC/IRP safe assets (시장형채권 + 현금성자산 + safe TDF overrides)
  const dcIrpSafeBaseline: Record<string, number> = {}
  for (const acct of ['미래DC', '농협IRP', '엔투IRP']) {
    let safeTdf = 0
    for (const h of holdings) {
      if (h.계좌 !== acct || !h.종목코드) continue
      const isBondOrCash = h.자산군 === '채권' || h.자산군 === '현금성'
      if (!isBondOrCash && (safeCodeSet.has(h.종목코드) || isPensionSafeName(h.상품명 || h.종목명 || ''))) {
        safeTdf += Number(h.평가금액) || 0
      }
    }
    dcIrpSafeBaseline[acct] = safeTdf
  }

  // Working deltas: delta[acct][major9]
  const delta: Record<string, Weights9> = {}
  for (const acct of accounts) {
    delta[acct] = createZeroWeights9()
  }

  const projectedVal = (acct: string, m: Major9Key) => curMatrix[acct][m] + delta[acct][m]
  const projectedAcctTotal = (acct: string) =>
    MAJOR_9_KEYS.reduce((acc, m) => acc + projectedVal(acct, m), 0)

  const canBuyInAccount = (acct: string, m: Major9Key, addAmount: number): boolean => {
    const rule = ACCOUNT_IPS_RULES[acct]
    if (!rule) return false
    if (!rule.allowedMajor9.includes(m)) return false
    if (rule.exclusiveMajor9 && rule.exclusiveMajor9 !== m && m !== '현금성자산') return false
    if (m === '귀금속' && acct !== '금현물') return false

    // DC/IRP 70% risky asset cap check
    if (rule.riskyAssetLimit !== null && m !== '시장형채권' && m !== '현금성자산') {
      const nextTotal = projectedAcctTotal(acct) + addAmount
      const safeAssets =
        projectedVal(acct, '시장형채권') +
        projectedVal(acct, '현금성자산') +
        (dcIrpSafeBaseline[acct] ?? 0)
      const riskyAssets = Math.max(0, nextTotal - safeAssets)
      if (nextTotal > 0 && riskyAssets / nextTotal > rule.riskyAssetLimit + 0.001) {
        return false
      }
    }
    return true
  }

  // Track each account's net external cash flow
  // For closed/locked accounts (allowNewContribution===false or withdrawalAllowed===false in tax_min_full):
  // internal cash pool = curMatrix[acct]['현금성자산'] + internal sells
  const acctExternalFlow = (acct: string) =>
    MAJOR_9_KEYS.reduce((acc, m) => acc + delta[acct][m], 0)

  if (req.mode === 'no_sell') {
    // -----------------------------------------------------------------------
    // MODE A: no_sell (Zero Sells, Cash + Expected Inflow Deployment Only)
    // -----------------------------------------------------------------------
    const remainingPositiveGap: Partial<Record<Major9Key, number>> = {}
    for (const m of MAJOR_9_KEYS) {
      if (m !== '현금성자산' && macroGap[m] > MIN_REBALANCE_UNIT_KRW) {
        remainingPositiveGap[m] = macroGap[m]
      }
    }

    // Track deployable cash per account:
    // - Closed/locked accounts can spend their internal cash above a 10만 buffer (or all internal cash)
    // - Hub ('한투') starts with expectedInflowKrw + its own cash
    const internalCashPool: Record<string, number> = {}
    for (const acct of accounts) {
      internalCashPool[acct] = Math.max(0, curMatrix[acct].현금성자산)
    }
    let hubNewInflowPool = Math.max(0, Number(req.expectedInflowKrw) || 0)
    const hubCashReserve = Math.max(0, targetMacro.현금성자산 * 0.4)
    const hubDeployableCash = Math.max(0, internalCashPool['한투'] - hubCashReserve)
    internalCashPool['한투'] = hubDeployableCash

    const buyOrder: Major9Key[] = [
      '만기보유채권',
      '시장형채권',
      '선진국주식',
      '국내주식',
      '신흥국주식',
      '인컴자산',
      '귀금속',
      '원자재',
    ]

    for (const m of buyOrder) {
      let need = remainingPositiveGap[m] ?? 0
      if (need < MIN_REBALANCE_UNIT_KRW) continue

      const candidates = BUY_PRIORITY[m] ?? []
      // Pass 1: Spend internal cash already sitting inside eligible accounts
      for (const acct of candidates) {
        if (need < MIN_REBALANCE_UNIT_KRW) break
        if (!canBuyInAccount(acct, m, Math.min(need, internalCashPool[acct]))) continue
        const avail = internalCashPool[acct]
        if (avail < MIN_REBALANCE_UNIT_KRW) continue
        const amt = Math.min(need, avail)
        delta[acct][m] += amt
        delta[acct].현금성자산 -= amt
        internalCashPool[acct] -= amt
        need -= amt
      }

      // Pass 2: Deploy new expected inflow via 한투 hub (or eligible contribution accounts)
      if (need >= MIN_REBALANCE_UNIT_KRW && hubNewInflowPool >= MIN_REBALANCE_UNIT_KRW) {
        for (const acct of candidates) {
          if (need < MIN_REBALANCE_UNIT_KRW || hubNewInflowPool < MIN_REBALANCE_UNIT_KRW) break
          const rule = ACCOUNT_IPS_RULES[acct]
          if (!rule || !rule.allowNewContribution) continue

          let cap = hubNewInflowPool
          if (rule.annualContributionCapKrw) {
            const alreadyAdded = Math.max(0, acctExternalFlow(acct))
            cap = Math.min(cap, Math.max(0, rule.annualContributionCapKrw - alreadyAdded))
          }
          if (rule.remainingTotalContributionCapKrw) {
            const alreadyAdded = Math.max(0, acctExternalFlow(acct))
            cap = Math.min(cap, Math.max(0, rule.remainingTotalContributionCapKrw - alreadyAdded))
          }
          const amt = Math.min(need, cap)
          if (amt < MIN_REBALANCE_UNIT_KRW) continue
          if (!canBuyInAccount(acct, m, amt)) continue

          delta[acct][m] += amt
          hubNewInflowPool -= amt
          need -= amt
        }
      }

      remainingPositiveGap[m] = need
    }

    // Put any remaining expectedInflowKrw into 한투 현금성자산
    if (Math.abs(hubNewInflowPool) > 0) {
      delta['한투'].현금성자산 += hubNewInflowPool
    }
    // If expectedInflowKrw < 0 (withdrawal), deduct from 한투 -> 불리오 -> 금현물
    if ((Number(req.expectedInflowKrw) || 0) < 0) {
      let withdrawNeed = Math.abs(Number(req.expectedInflowKrw) || 0)
      for (const acct of ['한투', '불리오', '금현물']) {
        if (withdrawNeed <= 0) break
        const avail = Math.max(0, curMatrix[acct].현금성자산 + delta[acct].현금성자산)
        const take = Math.min(withdrawNeed, avail)
        delta[acct].현금성자산 -= take
        withdrawNeed -= take
      }
      if (withdrawNeed > 0) {
        delta['한투'].현금성자산 -= withdrawNeed
      }
    }
  } else {
    // -----------------------------------------------------------------------
    // MODE B: tax_min_full (Tax-Minimized Full Rebalance + Hub Routing)
    // -----------------------------------------------------------------------
    const workingGap: Weights9 = { ...macroGap }

    // Step 1: Sell IPS-violating non-cash assets first (e.g., 국내주식 in 미래DC)
    for (const acct of accounts) {
      const rule = ACCOUNT_IPS_RULES[acct]
      if (!rule) continue
      for (const m of MAJOR_9_KEYS) {
        if (m === '현금성자산') continue
        const curVal = curMatrix[acct][m]
        if (curVal <= 0) continue
        const isViolation =
          !rule.allowedMajor9.includes(m) || (m === '귀금속' && acct !== '금현물')
        if (isViolation && (workingGap[m] < 0 || acct === '미래DC')) {
          const sellAmt = curVal
          delta[acct][m] -= sellAmt
          delta[acct].현금성자산 += sellAmt
          workingGap[m] += sellAmt
          workingGap.현금성자산 -= sellAmt
        }
      }
    }

    // Step 2: Sell over-weighted non-cash assets in tax-minimizing order
    const sellSortedAccounts = [...accounts].sort((a, b) => {
      const pa = ACCOUNT_IPS_RULES[a]?.sellTaxPenalty ?? 0.15
      const pb = ACCOUNT_IPS_RULES[b]?.sellTaxPenalty ?? 0.15
      if (pa !== pb) return pa - pb
      // Within 0% tax wrappers, prefer ISA / DC / IRP over others
      const wa = ACCOUNT_IPS_RULES[a]?.withdrawalAllowed ? 1 : 0
      const wb = ACCOUNT_IPS_RULES[b]?.withdrawalAllowed ? 1 : 0
      return wa - wb
    })

    for (const m of MAJOR_9_KEYS) {
      if (m === '현금성자산') continue
      let excess = -workingGap[m]
      if (excess < MIN_REBALANCE_UNIT_KRW) continue

      for (const acct of sellSortedAccounts) {
        if (excess < MIN_REBALANCE_UNIT_KRW) break
        const available = Math.max(0, projectedVal(acct, m))
        if (available < MIN_REBALANCE_UNIT_KRW) continue
        const sellAmt = Math.min(excess, available)
        delta[acct][m] -= sellAmt
        delta[acct].현금성자산 += sellAmt
        excess -= sellAmt
        workingGap[m] += sellAmt
        workingGap.현금성자산 -= sellAmt
      }
    }

    // Step 3: Reinvest internal cash inside locked/closed accounts (keeping net external flow = 0)
    const lockedInternalAccts = accounts.filter((a) => {
      const r = ACCOUNT_IPS_RULES[a]
      return r && !r.withdrawalAllowed
    })

    const buyOrderLocked: Major9Key[] = [
      '만기보유채권',
      '시장형채권',
      '선진국주식',
      '국내주식',
      '신흥국주식',
      '인컴자산',
      '원자재',
    ]

    for (const acct of lockedInternalAccts) {
      // Target a small cash buffer (~2% of account or existing cash min) inside locked account
      let availCash = Math.max(0, projectedVal(acct, '현금성자산'))
      if (availCash < MIN_REBALANCE_UNIT_KRW) continue

      for (const m of buyOrderLocked) {
        if (availCash < MIN_REBALANCE_UNIT_KRW) break
        const need = workingGap[m]
        if (need < MIN_REBALANCE_UNIT_KRW) continue
        const amt = Math.min(need, availCash)
        if (!canBuyInAccount(acct, m, amt)) continue

        delta[acct][m] += amt
        delta[acct].현금성자산 -= amt
        availCash -= amt
        workingGap[m] -= amt
        workingGap.현금성자산 += amt
      }
    }

    // Step 4: Pool general withdrawable cash (한투, 금현물, 불리오) + expectedInflowKrw through 한투 Hub
    let hubPoolKrw = Number(req.expectedInflowKrw) || 0
    for (const acct of ['금현물', '불리오', '한투']) {
      const cashNow = Math.max(0, projectedVal(acct, '현금성자산'))
      if (cashNow > 0) {
        delta[acct].현금성자산 -= cashNow
        hubPoolKrw += cashNow
      }
    }

    // Deploy hubPoolKrw into remaining positive non-cash gaps
    const buyOrderHub: Major9Key[] = [
      '만기보유채권',
      '시장형채권',
      '국내주식',
      '선진국주식',
      '신흥국주식',
      '귀금속',
      '인컴자산',
      '원자재',
    ]

    for (const m of buyOrderHub) {
      let need = workingGap[m]
      if (need < MIN_REBALANCE_UNIT_KRW || hubPoolKrw < MIN_REBALANCE_UNIT_KRW) continue

      const candidates = BUY_PRIORITY[m] ?? []
      for (const acct of candidates) {
        if (need < MIN_REBALANCE_UNIT_KRW || hubPoolKrw < MIN_REBALANCE_UNIT_KRW) break
        const rule = ACCOUNT_IPS_RULES[acct]
        if (!rule) continue
        // Closed accounts cannot accept external hub transfers
        if (!rule.allowNewContribution) continue

        let cap = hubPoolKrw
        if (rule.annualContributionCapKrw) {
          const added = Math.max(0, acctExternalFlow(acct))
          cap = Math.min(cap, Math.max(0, rule.annualContributionCapKrw - added))
        }
        if (rule.remainingTotalContributionCapKrw) {
          const added = Math.max(0, acctExternalFlow(acct))
          cap = Math.min(cap, Math.max(0, rule.remainingTotalContributionCapKrw - added))
        }

        const amt = Math.min(need, cap)
        if (amt < MIN_REBALANCE_UNIT_KRW) continue
        if (!canBuyInAccount(acct, m, amt)) continue

        delta[acct][m] += amt
        hubPoolKrw -= amt
        need -= amt
        workingGap[m] -= amt
      }
    }

    // Step 5: Park remaining hubPoolKrw as cash in 한투 (or distribute back if negative)
    delta['한투'].현금성자산 += hubPoolKrw
  }

  // -------------------------------------------------------------------------
  // Map 11x9 deltas -> 22-leaf matrixOverrides + transferPlan + orderHints
  // -------------------------------------------------------------------------
  const matrixOverrides: Record<string, number> = {}
  const orderHints: AccountOrderHint[] = []

  for (const acct of accounts) {
    for (const major of MAJOR_9_ASSETS) {
      const m = major.key
      const remDelta = roundKrw(delta[acct][m])
      if (Math.abs(remDelta) < 100) continue

      if (remDelta < 0) {
        // Distribute sell across existing non-zero subRows largest-first
        let sellLeft = -remDelta
        const subRowsSorted = [...major.subRows].sort((a, b) => {
          const ka = `${a.자산군}_${a.세부자산군}_${a.세부자산군2}`
          const kb = `${b.자산군}_${b.세부자산군}_${b.세부자산군2}`
          return (leafLookup[acct][m][kb] ?? 0) - (leafLookup[acct][m][ka] ?? 0)
        })

        for (const sub of subRowsSorted) {
          if (sellLeft <= 0) break
          const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
          const curSub = leafLookup[acct][m][rowKey] ?? 0
          if (curSub <= 0 && sub !== subRowsSorted[subRowsSorted.length - 1]) continue
          const take =
            sub === subRowsSorted[subRowsSorted.length - 1]
              ? sellLeft
              : Math.min(curSub, sellLeft)
          const targetSub = Math.max(0, roundKrw(curSub - take))
          const actualTake = roundKrw(curSub - targetSub)
          if (actualTake > 0) {
            matrixOverrides[`${rowKey}_${acct}`] = targetSub
            sellLeft -= actualTake
            if (m !== '현금성자산') {
              const matchingHolding = holdings.find(
                (h) =>
                  h.계좌 === acct &&
                  h.자산군 === sub.자산군 &&
                  h.세부자산군 === sub.세부자산군 &&
                  h.세부자산군2 === sub.세부자산군2 &&
                  (Number(h.평가금액) || 0) > 0
              )
              const px = Number(matchingHolding?.현재가) || 0
              orderHints.push({
                account: acct,
                major9: m,
                rowKey,
                rowLabel: sub.name,
                deltaKrw: -actualTake,
                direction: 'SELL',
                suggestedTicker: matchingHolding?.종목코드,
                suggestedName: matchingHolding?.상품명 || matchingHolding?.종목명,
                currentPriceKrw: px > 0 ? px : undefined,
                estimatedShares: px > 0 ? Math.max(1, Math.round(actualTake / px)) : undefined,
                taxNote: getTaxNoteForAccount(acct, 'SELL'),
              })
            }
          }
        }
      } else {
        // Positive buy -> prefer existing largest subRow in that account, or canonical core subRow
        const canon = CANONICAL_SUBROW[m]
        let bestSub = major.subRows.find(
          (s) =>
            s.자산군 === canon.자산군 &&
            s.세부자산군 === canon.세부자산군 &&
            s.세부자산군2 === canon.세부자산군2
        ) ?? major.subRows[0]

        // Prefer index subRow if already held in account
        let maxCur = -1
        for (const sub of major.subRows) {
          const rk = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
          const curVal = leafLookup[acct][m][rk] ?? 0
          if (curVal > maxCur && sub.세부자산군2 !== '종목') {
            maxCur = curVal
            bestSub = sub
          }
        }

        const rowKey = `${bestSub.자산군}_${bestSub.세부자산군}_${bestSub.세부자산군2}`
        const curSub = leafLookup[acct][m][rowKey] ?? 0
        matrixOverrides[`${rowKey}_${acct}`] = roundKrw(curSub + remDelta)

        if (m !== '현금성자산') {
          const matchingHolding = holdings.find(
            (h) =>
              h.계좌 === acct &&
              h.자산군 === bestSub.자산군 &&
              h.세부자산군 === bestSub.세부자산군 &&
              h.세부자산군2 === bestSub.세부자산군2 &&
              (Number(h.평가금액) || 0) > 0
          )
          const px = Number(matchingHolding?.현재가) || 0
          orderHints.push({
            account: acct,
            major9: m,
            rowKey,
            rowLabel: bestSub.name,
            deltaKrw: remDelta,
            direction: 'BUY',
            suggestedTicker: matchingHolding?.종목코드,
            suggestedName: matchingHolding?.상품명 || matchingHolding?.종목명,
            currentPriceKrw: px > 0 ? px : undefined,
            estimatedShares: px > 0 ? Math.max(1, Math.round(remDelta / px)) : undefined,
            taxNote: getTaxNoteForAccount(acct, 'BUY'),
          })
        }
      }
    }
  }

  // Build account summaries & hub transfer plan
  const accountSummaries: AccountLocationSummary[] = []
  const transferPlan: TransferInstruction[] = []

  for (const acct of accounts) {
    const currentAcctTotal = MAJOR_9_KEYS.reduce((a, m) => a + curMatrix[acct][m], 0)
    const targetAcctTotal = MAJOR_9_KEYS.reduce((a, m) => a + projectedVal(acct, m), 0)
    const netFlow = roundKrw(targetAcctTotal - currentAcctTotal)

    let internalBuy = 0
    let internalSell = 0
    for (const m of MAJOR_9_KEYS) {
      if (m === '현금성자산') continue
      if (delta[acct][m] > 0) internalBuy += roundKrw(delta[acct][m])
      if (delta[acct][m] < 0) internalSell += roundKrw(-delta[acct][m])
    }

    let dcIrpRiskyRatioPct: number | undefined
    const rule = ACCOUNT_IPS_RULES[acct]
    if (rule && rule.riskyAssetLimit !== null && targetAcctTotal > 0) {
      const safeAssets =
        projectedVal(acct, '시장형채권') +
        projectedVal(acct, '현금성자산') +
        (dcIrpSafeBaseline[acct] ?? 0)
      const riskyAssets = Math.max(0, targetAcctTotal - safeAssets)
      dcIrpRiskyRatioPct = Number(((riskyAssets / targetAcctTotal) * 100).toFixed(2))
    }

    accountSummaries.push({
      account: acct,
      currentTotalKrw: roundKrw(currentAcctTotal),
      targetTotalKrw: roundKrw(targetAcctTotal),
      netFlowKrw: netFlow,
      internalBuyKrw: internalBuy,
      internalSellKrw: internalSell,
      dcIrpRiskyRatioPct,
    })

    if (acct !== '한투' && Math.abs(netFlow) >= MIN_REBALANCE_UNIT_KRW) {
      if (netFlow > 0) {
        transferPlan.push({
          fromAccount: '한투',
          toAccount: acct,
          amountKrw: netFlow,
          reason:
            ACCOUNT_IPS_RULES[acct]?.fundedFromHub === '한투'
              ? `${acct} 신규 배분 재원 이체 (${ACCOUNT_IPS_RULES[acct].role})`
              : `${acct} 목표 비중 복원 자금 이체`,
        })
      } else {
        transferPlan.push({
          fromAccount: acct,
          toAccount: '한투',
          amountKrw: -netFlow,
          reason: `${acct} 초과분 매도 대금 중앙 허브 회수`,
        })
      }
    }
  }

  // Evaluate ALM & IPS constraints
  const violations: ConstraintViolation[] = []
  const nonPensionDebtBufferBeforeKrw = roundKrw(
    NON_PENSION_MORTGAGE_ACCOUNTS.reduce(
      (sum, a) => sum + (curMatrix[a]?.만기보유채권 ?? 0) + (curMatrix[a]?.현금성자산 ?? 0),
      0
    )
  )
  const nonPensionDebtBufferAfterKrw = roundKrw(
    NON_PENSION_MORTGAGE_ACCOUNTS.reduce(
      (sum, a) => sum + projectedVal(a, '만기보유채권') + projectedVal(a, '현금성자산'),
      0
    )
  )

  if (nonPensionDebtBufferAfterKrw < mortgageFloor) {
    violations.push({
      severity: 'warning',
      code: 'MORTGAGE_2029_BUFFER_SHORTFALL',
      message: `비연금 인출가능 계좌(한투·한투ISA·불리오)의 만기보유채권+현금성 합계(${Math.round(
        nonPensionDebtBufferAfterKrw / 10_000
      ).toLocaleString()}만 원)가 2029.12 주담대 상환 하한(${Math.round(
        mortgageFloor / 10_000
      ).toLocaleString()}만 원)에 ${Math.round(
        (mortgageFloor - nonPensionDebtBufferAfterKrw) / 10_000
      ).toLocaleString()}만 원 부족합니다.`,
    })
  }

  for (const s of accountSummaries) {
    if (s.dcIrpRiskyRatioPct !== undefined && s.dcIrpRiskyRatioPct > 70.0) {
      violations.push({
        severity: 'error',
        account: s.account,
        code: 'DC_IRP_70_CAP_BREACH',
        message: `${s.account} 위험자산 비중(${s.dcIrpRiskyRatioPct.toFixed(1)}%)이 퇴직연금 법정 한도(70%)를 초과했습니다.`,
      })
    }
  }

  const unallocatedGapByMajor9 = createZeroWeights9()
  for (const m of MAJOR_9_KEYS) {
    const achievedMacro = accounts.reduce((acc, a) => acc + projectedVal(a, m), 0)
    unallocatedGapByMajor9[m] = roundKrw(targetMacro[m] - achievedMacro)
  }

  const totalBuyKrw = roundKrw(
    accountSummaries.reduce((acc, s) => acc + s.internalBuyKrw, 0)
  )
  const totalSellKrw = roundKrw(
    accountSummaries.reduce((acc, s) => acc + s.internalSellKrw, 0)
  )

  return {
    mode: req.mode,
    matrixOverrides,
    accountDeltas9: delta,
    transferPlan,
    orderHints,
    accountSummaries,
    violations,
    nonPensionDebtBufferBeforeKrw,
    nonPensionDebtBufferAfterKrw,
    totalBuyKrw,
    totalSellKrw,
    unallocatedGapByMajor9,
  }
}
