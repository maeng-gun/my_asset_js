'use client'

import { useMemo } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import {
  ACCOUNT_IPS_RULES,
  AccountAllocationLike,
  AccountLocationResult,
  AssetStrategyTagRow,
  HoldingLike,
  MAJOR_9_ASSETS,
  Major9Key,
  TransferInstruction,
} from '@/lib/engine/alm-tpa-types'
import { ALLOCATION_ACCOUNTS } from '@/lib/engine/types'
import { formatKRW, formatPercent } from '@/lib/utils'
import { AlertTriangle, ArrowRight, CheckCircle2, Grid, Landmark } from 'lucide-react'

interface ExecutionSummaryTabProps {
  accountAllo: AccountAllocationLike[]
  holdings: HoldingLike[]
  strategyTags: AssetStrategyTagRow[]
  matrixOverrides: Record<string, number>
  expectedInflow: number
  lastSolverResult: AccountLocationResult | null
  onBackToMatrix: () => void
  unitMode: 'won' | 'man'
}

export function ExecutionSummaryTab({
  accountAllo,
  holdings,
  strategyTags,
  matrixOverrides,
  expectedInflow,
  lastSolverResult,
  onBackToMatrix,
  unitMode,
}: ExecutionSummaryTabProps) {
  const fmtMoney = (val: number | null | undefined, withUnit = false): string => {
    if (val === null || val === undefined || isNaN(val)) return '0'
    if (unitMode === 'man') {
      return Math.round(val / 10_000).toLocaleString('ko-KR') + (withUnit ? ' 만원' : '')
    }
    return Math.round(val).toLocaleString('ko-KR') + (withUnit ? ' 원' : '')
  }

  const fmtDelta = (val: number | null | undefined, withUnit = false): string => {
    if (val === null || val === undefined || isNaN(val)) return '0'
    const sign = val > 0 ? '+' : ''
    return `${sign}${fmtMoney(val, withUnit)}`
  }

  const tagMap = useMemo(() => {
    const map = new Map<string, AssetStrategyTagRow>()
    for (const t of strategyTags) {
      map.set(t.ticker_code, t)
    }
    return map
  }, [strategyTags])

  const executionAccounts = useMemo(() => {
    const list: Array<{
      account: string
      currentTotal: number
      targetTotal: number
      netDelta: number
      actions: Array<{
        majorKey: Major9Key
        rowKey: string
        rowLabel: string
        currentAmt: number
        targetAmt: number
        delta: number
        holdings: Array<{
          ticker: string
          상품명: string
          보유수량: number
          현재가: number
          평가금액: number
          수익률: number
          estimatedOrderShares: number | null
          strategyRole?: string
          factorCluster?: string | null
        }>
      }>
    }> = []

    for (const acct of ALLOCATION_ACCOUNTS) {
      let curTotal = 0
      let targetTotal = 0
      const acctActions: (typeof list)[0]['actions'] = []

      for (const major of MAJOR_9_ASSETS) {
        for (const sub of major.subRows) {
          const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
          const found = accountAllo.find(
            (r) =>
              r.자산군 === sub.자산군 &&
              r.세부자산군 === sub.세부자산군 &&
              r.세부자산군2 === sub.세부자산군2
          )
          const curVal = Number(found?.[acct] ?? 0) || 0
          const cellKey = `${rowKey}_${acct}`
          const targetVal =
            matrixOverrides[cellKey] !== undefined ? matrixOverrides[cellKey] : curVal
          const delta = targetVal - curVal
          curTotal += curVal
          targetTotal += targetVal

          if (Math.round(delta) !== 0) {
            const actualHoldings = holdings
              .filter(
                (h) =>
                  h.계좌 === acct &&
                  h.세부자산군 === sub.세부자산군 &&
                  h.세부자산군2 === sub.세부자산군2 &&
                  h.종목코드 &&
                  h.종목코드 !== ''
              )
              .map((h) => {
                const price = Number(h.현재가) || 0
                const estShares =
                  price > 0 ? Math.max(1, Math.round(Math.abs(delta) / price)) : null
                const tag = tagMap.get(h.종목코드)
                return {
                  ticker: h.종목코드,
                  상품명: h.상품명 || h.종목명 || h.종목코드,
                  보유수량: Number(h.보유수량) || 0,
                  현재가: price,
                  평가금액: Number(h.평가금액) || 0,
                  수익률: Number(h.평가수익률) || 0,
                  estimatedOrderShares: estShares,
                  strategyRole: tag?.strategy_role,
                  factorCluster: tag?.factor_cluster,
                }
              })

            acctActions.push({
              majorKey: major.key,
              rowKey,
              rowLabel: sub.name,
              currentAmt: curVal,
              targetAmt: targetVal,
              delta,
              holdings: actualHoldings,
            })
          }
        }
      }

      if (acctActions.length > 0) {
        list.push({
          account: acct,
          currentTotal: curTotal,
          targetTotal,
          netDelta: targetTotal - curTotal,
          actions: acctActions,
        })
      }
    }

    return list
  }, [accountAllo, holdings, matrixOverrides, tagMap])

  // Derive hub transfer plan from current matrixOverrides if solver result isn't directly active
  const derivedTransfers: TransferInstruction[] = useMemo(() => {
    if (lastSolverResult?.transferPlan && lastSolverResult.transferPlan.length > 0) {
      return lastSolverResult.transferPlan
    }
    const transfers: TransferInstruction[] = []
    for (const acct of executionAccounts) {
      if (acct.account === '한투' || Math.abs(acct.netDelta) < 10_000) continue
      if (acct.netDelta > 0) {
        transfers.push({
          fromAccount: '한투',
          toAccount: acct.account,
          amountKrw: Math.round(acct.netDelta),
          reason: ACCOUNT_IPS_RULES[acct.account]?.role || '목표 배분 재원 이체',
        })
      } else {
        transfers.push({
          fromAccount: acct.account,
          toAccount: '한투',
          amountKrw: Math.round(-acct.netDelta),
          reason: '초과 자산 매도 대금 중앙 허브 회수',
        })
      }
    }
    return transfers
  }, [executionAccounts, lastSolverResult])

  const totalSell = executionAccounts.reduce(
    (acc, a) =>
      acc + a.actions.filter((act) => act.delta < 0).reduce((s, act) => s + Math.abs(act.delta), 0),
    0
  )
  const totalBuy = executionAccounts.reduce(
    (acc, a) => acc + a.actions.filter((act) => act.delta > 0).reduce((s, act) => s + act.delta, 0),
    0
  )
  const netFlowSum = executionAccounts.reduce((acc, a) => acc + a.netDelta, 0)

  return (
    <div className="space-y-6">
      {/* 상단 요약 KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 font-medium mb-1">매매 발생 계좌</div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {executionAccounts.length}개 계좌
            </div>
            <div className="text-xs text-slate-500 mt-1">총 11개 계좌 중</div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 font-medium mb-1">총 매도 예정 금액</div>
            <div className="text-2xl font-bold font-mono text-rose-400">
              {fmtMoney(totalSell, true)}
            </div>
            <div className="text-xs text-slate-500 mt-1">비중 축소 및 현금화</div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 font-medium mb-1">총 매수 예정 금액</div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {fmtMoney(totalBuy, true)}
            </div>
            <div className="text-xs text-slate-500 mt-1">비중 확대 및 신규 매수</div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 font-medium mb-1">순 자금 유출입</div>
            <div
              className={`text-2xl font-bold font-mono ${
                netFlowSum > 0
                  ? 'text-emerald-400'
                  : netFlowSum < 0
                  ? 'text-rose-400'
                  : 'text-slate-300'
              }`}
            >
              {fmtDelta(netFlowSum, true)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              목표 유출입: {fmtDelta(expectedInflow, true)}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 한투 중앙 자금 허브 이체 지시서 */}
      {derivedTransfers.length > 0 && (
        <Card className="border-sky-500/30">
          <CardHeader
            title={
              <span className="flex items-center gap-2 text-sky-300">
                <Landmark className="w-4 h-4" />
                한투 중앙 자금 허브 이체 동선 지시서
              </span>
            }
            subtitle="계좌간 자금 이동은 한투 허브를 경유하며 연금/폐쇄풀(한투ISA) 제약을 준수합니다"
          />
          <CardBody className="space-y-2">
            {derivedTransfers.map((tr, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs"
              >
                <div className="flex items-center gap-2 font-semibold">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200">
                    {tr.fromAccount}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
                  <span className="px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-700/40">
                    {tr.toAccount}
                  </span>
                  <span className="text-slate-400 font-normal ml-1">{tr.reason}</span>
                </div>
                <span className="font-mono font-bold text-emerald-400 text-sm shrink-0">
                  {fmtMoney(tr.amountKrw, true)}
                </span>
              </div>
            ))}

            {lastSolverResult?.violations.map((v, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-950/30 border border-amber-600/30 text-xs text-amber-300"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{v.message}</span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {executionAccounts.length === 0 ? (
        <Card>
          <CardBody className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-200">아직 리밸런싱 매매 내역이 없습니다</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              [탭 3: 11계좌 절세 자동배정 매트릭스]에서 &ldquo;11계좌 자동배정 초안 생성&rdquo;을
              클릭하거나 개별 셀을 수정하시면 계좌별 주문표와 이체 동선이 이곳에 표시됩니다.
            </p>
            <button
              onClick={onBackToMatrix}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1.5"
            >
              <Grid className="w-4 h-4" />
              11계좌 매트릭스로 이동하기
            </button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {executionAccounts.map((acctData) => {
            const isZeroNet = Math.abs(acctData.netDelta) < 1000
            return (
              <Card key={acctData.account} className="border-slate-800 shadow-md flex flex-col">
                <CardHeader
                  title={
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold text-base">
                        {acctData.account}
                      </span>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${
                          isZeroNet
                            ? 'bg-slate-800 text-slate-300 border-slate-700'
                            : acctData.netDelta > 0
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-950/40 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {isZeroNet
                          ? '자체 리밸런싱 (순입출금 0원)'
                          : acctData.netDelta > 0
                          ? `+${fmtMoney(acctData.netDelta, true)} 입금`
                          : `${fmtMoney(acctData.netDelta, true)} 출금`}
                      </span>
                    </div>
                  }
                  subtitle={
                    <div className="flex items-center gap-2 text-xs font-mono pt-1 text-slate-400">
                      <span>현재: {fmtMoney(acctData.currentTotal, true)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-slate-200 font-semibold">
                        목표: {fmtMoney(acctData.targetTotal, true)}
                      </span>
                    </div>
                  }
                />
                <CardBody className="p-0 divide-y divide-slate-800/80 flex-1">
                  {acctData.actions.map((act) => {
                    const isBuy = act.delta > 0
                    return (
                      <div key={act.rowKey} className="p-4 space-y-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="text-slate-400 text-[11px] font-mono">
                              [{act.majorKey}]
                            </span>
                            <span className="font-bold text-slate-100">{act.rowLabel}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-slate-400 font-mono text-[11px]">
                              {fmtMoney(act.currentAmt)} ➔ {fmtMoney(act.targetAmt)}
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-lg font-bold font-mono text-xs ${
                                isBuy
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {isBuy ? '매수 ' : '매도 '}
                              {fmtDelta(act.delta, true)}
                            </span>
                          </div>
                        </div>

                        <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800/80 space-y-1.5">
                          <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                            <span>보유 종목 및 예상 주문 수량 힌트 ({act.holdings.length}건)</span>
                            <span className="text-slate-500 text-[10px]">현재가 기준 추산</span>
                          </div>

                          {act.holdings.length === 0 ? (
                            <div className="text-slate-500 text-[11px] py-1 text-center font-sans">
                              (현재 보유 종목 없음 — 해당 계좌 IPS 적격 코어 ETF 신규 편입)
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              {act.holdings.map((h, i) => (
                                <div
                                  key={i}
                                  className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono py-1 border-t border-slate-900 first:border-0"
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {h.strategyRole && (
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase ${
                                          h.strategyRole === 'core'
                                            ? 'bg-sky-950/60 text-sky-300 border border-sky-700/40'
                                            : h.strategyRole === 'satellite'
                                            ? 'bg-purple-950/60 text-purple-300 border border-purple-700/40'
                                            : 'bg-slate-800 text-slate-300'
                                        }`}
                                      >
                                        {h.strategyRole}
                                      </span>
                                    )}
                                    <span
                                      className="font-sans font-medium text-slate-200 truncate max-w-[175px]"
                                      title={h.상품명}
                                    >
                                      {h.상품명}
                                    </span>
                                    {h.factorCluster && (
                                      <span className="text-[9px] font-sans text-slate-500 hidden sm:inline">
                                        ({h.factorCluster})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2.5 shrink-0">
                                    {h.estimatedOrderShares && (
                                      <span className="text-sky-300 font-semibold">
                                        {isBuy ? '+' : '-'}약 {h.estimatedOrderShares.toLocaleString()}주
                                      </span>
                                    )}
                                    <span className="text-slate-400">
                                      {h.보유수량 ? `${h.보유수량.toLocaleString()}주` : '-'}
                                    </span>
                                    <span className="text-slate-200 font-semibold">
                                      {formatKRW(h.평가금액)}원
                                    </span>
                                    <span
                                      className={`font-bold ${
                                        h.수익률 >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                      }`}
                                    >
                                      {formatPercent(h.수익률)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
