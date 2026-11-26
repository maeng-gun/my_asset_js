import {
  AccountAllocationLike,
  AlmCashflowScheduleRow,
  AlmConfigRow,
  MAJOR_9_ASSETS,
  NON_PENSION_MORTGAGE_ACCOUNTS,
} from './alm-tpa-types'

export interface HouseholdBalanceSheet {
  totalAssetsKrw: number
  investmentDebtKrw: number
  maturityDebtKrw: number
  totalDebtKrw: number
  netInvestmentCapitalKrw: number
  netFinancialWorthKrw: number
  leverageRatio: number
  annualInterestOutflowKrw: number
  annualDividendInterestKrw: number
  icr: number
  currentAge: number
}

export interface MortgageAccountBreakdown {
  account: string
  htmBondKrw: number
  cashKrw: number
  totalBufferKrw: number
}

export interface Mortgage2029TrajectoryPoint {
  month: string
  projectedBufferKrw: number
  targetFloorKrw: number
}

export interface Mortgage2029Tracker {
  targetFloorKrw: number
  maturityDate: string
  currentBufferKrw: number
  shortfallKrw: number
  coveragePct: number
  monthsRemaining: number
  requiredMonthlyPaceKrw: number
  accountBreakdown: MortgageAccountBreakdown[]
  trajectory: Mortgage2029TrajectoryPoint[]
}

export interface AlmProjectionYearPoint {
  year: number
  age: number
  targetEquityPct: number
  inflowKrw: number
  outflowKrw: number
  netCashflowKrw: number
  remainingDebtKrw: number
  pessimisticNetKrw: number
  baseNetKrw: number
  optimisticNetKrw: number
  baseGrossKrw: number
  events: string[]
}

const DEFAULT_ALM_LIABILITIES = [
  {
    id: 'parents_loan',
    title: '부모님 차입 투자자금',
    principal_krw: 120_000_000,
    annual_rate_pct: 3.25,
    rate_type: 'floating_deposit' as const,
    start_date: '2024-01-01',
    maturity_date: null,
    repay_at_maturity: false,
    non_pension_only: false,
  },
  {
    id: 'company_mortgage_2029',
    title: '주택담보대출 (회사 지원)',
    principal_krw: 70_000_000,
    annual_rate_pct: 0.6,
    rate_type: 'fixed' as const,
    start_date: '2026-12-01',
    maturity_date: '2029-12-31',
    repay_at_maturity: true,
    non_pension_only: true,
  },
]

export function computeHouseholdBalanceSheet(
  totalFinancialAssetsKrw: number,
  almConfig: AlmConfigRow | null,
  annualDividendInterestKrw = 8_790_000,
  asOfYear = 2026
): HouseholdBalanceSheet {
  const liabilities = almConfig?.liabilities ?? DEFAULT_ALM_LIABILITIES

  let investmentDebtKrw = 0
  let maturityDebtKrw = 0
  let annualInterestOutflowKrw = 0

  for (const l of liabilities) {
    const principal = Number(l.principal_krw) || 0
    const rate = Number(l.annual_rate_pct) || 0
    if (l.repay_at_maturity && l.non_pension_only) {
      maturityDebtKrw += principal
    } else {
      investmentDebtKrw += principal
    }
    annualInterestOutflowKrw += Math.round(principal * (rate / 100))
  }

  const totalAssetsKrw = Math.max(0, Math.round(totalFinancialAssetsKrw))
  const totalDebtKrw = investmentDebtKrw + maturityDebtKrw
  const netInvestmentCapitalKrw = totalAssetsKrw - investmentDebtKrw
  const netFinancialWorthKrw = totalAssetsKrw - totalDebtKrw
  const leverageRatio =
    netInvestmentCapitalKrw > 0
      ? Number((totalAssetsKrw / netInvestmentCapitalKrw).toFixed(2))
      : 0
  const icr =
    annualInterestOutflowKrw > 0
      ? Number((annualDividendInterestKrw / annualInterestOutflowKrw).toFixed(2))
      : 0
  const birthYear = almConfig?.birth_year ?? 1984
  const currentAge = Math.max(20, asOfYear - birthYear)

  return {
    totalAssetsKrw,
    investmentDebtKrw,
    maturityDebtKrw,
    totalDebtKrw,
    netInvestmentCapitalKrw,
    netFinancialWorthKrw,
    leverageRatio,
    annualInterestOutflowKrw,
    annualDividendInterestKrw,
    icr,
    currentAge,
  }
}

export function computeMortgage2029Tracker(
  accountAllocation: AccountAllocationLike[],
  almConfig: AlmConfigRow | null,
  schedules: AlmCashflowScheduleRow[],
  asOfDateStr = '2026-11-26'
): Mortgage2029Tracker {
  const mortgage = (almConfig?.liabilities || []).find(
    (l) => l.repay_at_maturity && l.non_pension_only
  )
  const targetFloorKrw = mortgage ? Number(mortgage.principal_krw) || 70_000_000 : 70_000_000
  const maturityDate = mortgage?.maturity_date || '2029-12-31'

  const htmMajor = MAJOR_9_ASSETS.find((m) => m.key === '만기보유채권')!
  const cashMajor = MAJOR_9_ASSETS.find((m) => m.key === '현금성자산')!

  const accountBreakdown: MortgageAccountBreakdown[] = NON_PENSION_MORTGAGE_ACCOUNTS.map(
    (acct) => {
      let htmBondKrw = 0
      let cashKrw = 0
      for (const sub of htmMajor.subRows) {
        const found = accountAllocation.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        htmBondKrw += Number(found?.[acct] ?? 0) || 0
      }
      for (const sub of cashMajor.subRows) {
        const found = accountAllocation.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        cashKrw += Number(found?.[acct] ?? 0) || 0
      }
      return {
        account: acct,
        htmBondKrw: Math.round(htmBondKrw),
        cashKrw: Math.round(cashKrw),
        totalBufferKrw: Math.round(htmBondKrw + cashKrw),
      }
    }
  )

  const currentBufferKrw = accountBreakdown.reduce((acc, b) => acc + b.totalBufferKrw, 0)
  const shortfallKrw = Math.max(0, targetFloorKrw - currentBufferKrw)
  const coveragePct =
    targetFloorKrw > 0 ? Number(((currentBufferKrw / targetFloorKrw) * 100).toFixed(1)) : 100

  const [curY, curM] = asOfDateStr.split('-').map((n) => parseInt(n, 10) || 0)
  const [matY, matM] = maturityDate.split('-').map((n) => parseInt(n, 10) || 0)
  const monthsRemaining = Math.max(1, (matY - curY) * 12 + (matM - curM))
  const requiredMonthlyPaceKrw = Math.ceil(shortfallKrw / monthsRemaining)

  // Project monthly buffer assuming active '한투' monthly salary savings allocate to buffer until target met
  const hubMonthlySaving = schedules
    .filter(
      (s) =>
        s.is_active &&
        s.account === '한투' &&
        s.cadence === 'monthly' &&
        Number(s.amount_krw) > 0
    )
    .reduce((acc, s) => acc + Number(s.amount_krw), 0)

  const monthlyNetFlow = hubMonthlySaving > 0 ? hubMonthlySaving : 3_500_000
  const trajectory: Mortgage2029TrajectoryPoint[] = []
  let running = currentBufferKrw
  for (let i = 0; i <= Math.min(monthsRemaining, 48); i++) {
    const dateObj = new Date(curY, curM - 1 + i, 1)
    const ym = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`
    trajectory.push({
      month: ym,
      projectedBufferKrw: Math.round(running),
      targetFloorKrw,
    })
    running = running * (1 + 0.032 / 12) + monthlyNetFlow
  }

  return {
    targetFloorKrw,
    maturityDate,
    currentBufferKrw,
    shortfallKrw,
    coveragePct,
    monthsRemaining,
    requiredMonthlyPaceKrw,
    accountBreakdown,
    trajectory,
  }
}

export function getGlidePathEquityPct(age: number, almConfig: AlmConfigRow | null): number {
  const stages = almConfig?.glide_path ?? []
  for (const st of stages) {
    if (age >= st.age_start && age <= st.age_end) {
      if (st.annual_step_pct && st.annual_step_pct < 0) {
        // e.g., 55~62세: starts at 75% and steps down by -2%p/yr toward 60%
        const yearsIn = age - st.age_start + 1
        return Math.max(st.equity_ref_pct, Number((75 + yearsIn * st.annual_step_pct).toFixed(1)))
      }
      return st.equity_ref_pct
    }
  }
  if (age < 55) return 75.0
  if (age <= 62) return Math.max(60.0, 75.0 - (age - 54) * 2.0)
  return 57.5
}

export function projectAlm30Years(params: {
  currentTotalAssetsKrw: number
  almConfig: AlmConfigRow | null
  schedules: AlmCashflowScheduleRow[]
  startYear?: number
  horizonYears?: number
  baseReturnPct?: number
  pessimisticReturnPct?: number
  optimisticReturnPct?: number
}): AlmProjectionYearPoint[] {
  const startYear = params.startYear ?? 2026
  const horizonYears = params.horizonYears ?? 30
  const birthYear = params.almConfig?.birth_year ?? 1984
  const baseR = (params.baseReturnPct ?? 6.5) / 100
  const pessR = (params.pessimisticReturnPct ?? 4.0) / 100
  const optR = (params.optimisticReturnPct ?? 8.5) / 100

  const liabilities = params.almConfig?.liabilities ?? DEFAULT_ALM_LIABILITIES
  const initialParentsDebt = liabilities
    .filter((l) => !l.repay_at_maturity)
    .reduce((acc, l) => acc + (Number(l.principal_krw) || 0), 0)
  const initialMortDebt = liabilities
    .filter((l) => l.repay_at_maturity)
    .reduce((acc, l) => acc + (Number(l.principal_krw) || 0), 0)
  const mortMatYear = parseInt(
    (liabilities.find((l) => l.repay_at_maturity)?.maturity_date || '2029-12-31').slice(0, 4),
    10
  )

  let grossBase = Math.max(0, params.currentTotalAssetsKrw)
  let grossPess = grossBase
  let grossOpt = grossBase

  const points: AlmProjectionYearPoint[] = []

  for (let offset = 0; offset <= horizonYears; offset++) {
    const year = startYear + offset
    const age = year - birthYear
    const targetEquityPct = getGlidePathEquityPct(age, params.almConfig)

    let inflowKrw = 0
    let outflowKrw = 0
    const events: string[] = []

    if (offset > 0) {
      for (const s of params.schedules) {
        if (!s.is_active) continue
        const sStartY = parseInt(s.start_date.slice(0, 4), 10)
        const sEndY = s.end_date ? parseInt(s.end_date.slice(0, 4), 10) : 9999
        if (year < sStartY || year > sEndY) continue

        if (s.cadence === 'one_off') {
          if (year !== sStartY) continue
          const amt = Number(s.amount_krw) || 0
          if (amt >= 0) inflowKrw += amt
          else outflowKrw += Math.abs(amt)
          events.push(s.title)
        } else {
          const yearsActive = Math.max(0, year - sStartY)
          const growthFactor = Math.pow(1 + (Number(s.growth_rate_pct) || 0) / 100, yearsActive)
          const annualMultiplier = s.cadence === 'monthly' ? 12 : 1
          const amt = (Number(s.amount_krw) || 0) * annualMultiplier * growthFactor
          if (amt >= 0) inflowKrw += amt
          else outflowKrw += Math.abs(amt)
        }
      }

      const netCf = inflowKrw - outflowKrw
      // Adjust return slightly downward as glide path de-risks
      const eqScale = targetEquityPct / 75.0
      grossBase = Math.max(0, grossBase * (1 + baseR * (0.5 + 0.5 * eqScale)) + netCf)
      grossPess = Math.max(0, grossPess * (1 + pessR * (0.5 + 0.5 * eqScale)) + netCf)
      grossOpt = Math.max(0, grossOpt * (1 + optR * (0.5 + 0.5 * eqScale)) + netCf)
    }

    const remainingDebtKrw =
      initialParentsDebt + (year < mortMatYear ? initialMortDebt : 0)

    points.push({
      year,
      age,
      targetEquityPct,
      inflowKrw: Math.round(inflowKrw),
      outflowKrw: Math.round(outflowKrw),
      netCashflowKrw: Math.round(inflowKrw - outflowKrw),
      remainingDebtKrw: Math.round(remainingDebtKrw),
      pessimisticNetKrw: Math.round(grossPess - remainingDebtKrw),
      baseNetKrw: Math.round(grossBase - remainingDebtKrw),
      optimisticNetKrw: Math.round(grossOpt - remainingDebtKrw),
      baseGrossKrw: Math.round(grossBase),
      events,
    })
  }

  return points
}
