'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import {
  getAllocationPolicies,
  getAssetStrategyTags,
  getLatestPortfolioSummary,
} from '@/lib/actions/db'
import {
  HoldingLike,
  MAJOR_9_ASSETS,
  MAJOR_9_KEYS,
  normalizeWeights9,
} from '@/lib/engine/alm-tpa-types'
import {
  DEFAULT_REF_WEIGHTS_9,
  DEFAULT_SAA_WEIGHTS_9,
  DEFAULT_TAA_WEIGHTS_9,
} from '@/lib/engine/saa-taa-optimizer'
import { computeCoreSatelliteXRay } from '@/lib/engine/attribution-engine'
import { LatestPortfolioSummary } from '@/lib/engine/types'
import { formatKRW, formatPercent } from '@/lib/utils'
import { AlertTriangle, Layers, ShieldAlert, ShieldCheck } from 'lucide-react'

export function TpaRiskXRayTab() {
  const [roleFilter, setRoleFilter] = useState<'all' | 'core' | 'satellite' | 'cash' | 'untagged'>('all')

  const { data: summary } = useQuery({
    queryKey: ['latest-portfolio-summary'],
    queryFn: async () => (await getLatestPortfolioSummary()) as LatestPortfolioSummary,
  })

  const { data: policies = [] } = useQuery({
    queryKey: ['allocation-policies'],
    queryFn: async () => await getAllocationPolicies(),
  })

  const { data: strategyTags = [] } = useQuery({
    queryKey: ['asset-strategy-tags'],
    queryFn: async () => await getAssetStrategyTags(),
  })

  const xray = useMemo(() => {
    const holdings = ((summary?.t_comm2 || []) as unknown) as HoldingLike[]
    const curRef = policies.find((p) => p.policy_type === 'REF' && p.is_current)
    const curSaa = policies.find((p) => p.policy_type === 'SAA' && p.is_current)
    const curTaa = policies.find((p) => p.policy_type === 'TAA' && p.is_current)

    return computeCoreSatelliteXRay({
      holdings,
      strategyTags,
      refWeights: curRef?.weights_9 ? normalizeWeights9(curRef.weights_9) : DEFAULT_REF_WEIGHTS_9,
      saaWeights: curSaa?.weights_9 ? normalizeWeights9(curSaa.weights_9) : DEFAULT_SAA_WEIGHTS_9,
      taaWeights: curTaa?.weights_9 ? normalizeWeights9(curTaa.weights_9) : DEFAULT_TAA_WEIGHTS_9,
    })
  }, [summary, policies, strategyTags])

  const filteredHoldings = useMemo(() => {
    if (roleFilter === 'all') return xray.holdings
    if (roleFilter === 'untagged') return xray.holdings.filter((h) => h.isUntagged)
    return xray.holdings.filter((h) => h.strategyRole === roleFilter)
  }, [xray.holdings, roleFilter])

  const donutOption = useMemo(
    () => ({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'item', formatter: '{b}: {c}%' },
      legend: { bottom: '0%', textStyle: { color: '#94a3b8' } },
      series: [
        {
          name: 'Core / Satellite',
          type: 'pie',
          radius: ['45%', '72%'],
          center: ['50%', '44%'],
          label: { color: '#e2e8f0', formatter: '{b}\n{c}%' },
          data: [
            { value: xray.corePct, name: 'Core (핵심)', itemStyle: { color: '#38bdf8' } },
            { value: xray.satellitePct, name: 'Satellite (위성)', itemStyle: { color: '#a855f7' } },
            { value: xray.cashPct, name: 'Cash/RP', itemStyle: { color: '#64748b' } },
          ],
        },
      ],
    }),
    [xray]
  )

  const clusterChartOption = useMemo(() => {
    const topClusters = xray.clusters.slice(0, 10)
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: '3%', right: '6%', bottom: '8%', top: '8%', containLabel: true },
      xAxis: {
        type: 'value',
        name: '비중(%)',
        max: (val: { max: number }) => Math.max(28, Math.ceil(val.max + 2)),
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: topClusters.map((c) => c.cluster),
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#e2e8f0', fontSize: 11 },
      },
      series: [
        {
          name: '비중(%)',
          type: 'bar',
          data: topClusters.map((c) => ({
            value: c.weightPct,
            itemStyle: { color: c.breachesCap ? '#f43f5e' : '#38bdf8', borderRadius: [0, 4, 4, 0] },
          })),
          label: { show: true, position: 'right', color: '#cbd5e1', formatter: '{c}%' },
        },
      ],
    }
  }, [xray])

  const rcChartOption = useMemo(() => {
    const categories = MAJOR_9_ASSETS.map((m) => m.shortLabel)
    const curWeights = xray.currentWeights9
    const curRc = xray.riskComparison.current.riskContributionsPct
    return {
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: {
        data: ['현재 자본비중 (W%)', '현재 리스크기여도 (RC%)'],
        textStyle: { color: '#94a3b8' },
        top: '2%',
        right: '2%',
      },
      grid: { left: '3%', right: '4%', bottom: '10%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#94a3b8', fontSize: 11, interval: 0 },
      },
      yAxis: {
        type: 'value',
        name: '비중(%)',
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        axisLabel: { color: '#94a3b8', formatter: '{value}%' },
      },
      series: [
        {
          name: '현재 자본비중 (W%)',
          type: 'bar',
          data: MAJOR_9_KEYS.map((k) => Number((curWeights[k] || 0).toFixed(2))),
          itemStyle: { color: '#10b981', borderRadius: [3, 3, 0, 0] },
        },
        {
          name: '현재 리스크기여도 (RC%)',
          type: 'bar',
          data: MAJOR_9_KEYS.map((k) => Number((curRc[k] || 0).toFixed(2))),
          itemStyle: { color: '#f59e0b', borderRadius: [3, 3, 0, 0] },
        },
      ],
    }
  }, [xray.currentWeights9, xray.riskComparison])

  return (
    <div className="space-y-6">
      {/* 하이브리드 C-1 3대 하드캡 KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className={xray.satellitePct > 20 ? 'border-rose-500/40' : 'border-emerald-500/30'}>
          <CardBody className="p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>실질 Satellite 비중 (상한 ≤ 20%)</span>
              {xray.satellitePct > 20 ? (
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              )}
            </div>
            <div
              className={`text-2xl font-bold font-mono ${
                xray.satellitePct > 20 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {xray.satellitePct.toFixed(2)}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Core {xray.corePct.toFixed(1)}% · Cash {xray.cashPct.toFixed(1)}%
            </div>
          </CardBody>
        </Card>

        <Card className={xray.maxClusterPct > 25 ? 'border-rose-500/40' : ''}>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 mb-1">최대 팩터 클러스터 (상한 ≤ 25%)</div>
            <div
              className={`text-2xl font-bold font-mono ${
                xray.maxClusterPct > 25 ? 'text-rose-400' : 'text-sky-400'
              }`}
            >
              {xray.maxClusterPct.toFixed(2)}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1 truncate">
              {xray.maxClusterName}
            </div>
          </CardBody>
        </Card>

        <Card className={xray.individualStockTotalPct > 10 ? 'border-amber-500/40' : ''}>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 mb-1">개별주식 합산 (≤10% · 단일 ≤4%)</div>
            <div
              className={`text-2xl font-bold font-mono ${
                xray.individualStockTotalPct > 10 || xray.maxSingleStockPct > 4
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }`}
            >
              {xray.individualStockTotalPct.toFixed(2)}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1 truncate">
              최대종목: {xray.maxSingleStockName || '-'} ({xray.maxSingleStockPct.toFixed(2)}%)
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-4">
            <div className="text-xs text-slate-400 mb-1">현재 β_eq / 사전 추적오차(TE)</div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {xray.riskComparison.current.equityEqBetaPct.toFixed(2)}%
              <span className="text-sm text-sky-400 ml-2">
                (TE {xray.riskComparison.current.trackingErrorPct.toFixed(2)}%)
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              미태그 종목 {xray.untaggedCount}건
            </div>
          </CardBody>
        </Card>
      </div>

      {/* 경보 목록 */}
      {xray.riskComparison.current.alerts.length > 0 && (
        <Card className="border-amber-500/30">
          <CardBody className="p-4 space-y-2">
            <div className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> 하이브리드 C-1 리스크 경보 ({xray.riskComparison.current.alerts.length}건)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {xray.riskComparison.current.alerts.map((al) => (
                <div
                  key={al.code}
                  className={`p-2.5 rounded-xl text-xs border ${
                    al.level === 'critical'
                      ? 'bg-rose-950/40 border-rose-600/40 text-rose-200'
                      : 'bg-amber-950/30 border-amber-600/30 text-amber-200'
                  }`}
                >
                  {al.message}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* 도넛 + 팩터 클러스터 + W% vs RC% */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader title="Core / Satellite / Cash 구성" subtitle="원장 무손실 보조 태그 기준 분리" />
          <CardBody>
            <EChartsWrapper option={donutOption} height="300px" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Look-Through 팩터 클러스터 노출" subtitle="단일 클러스터 상한 25% 기준 점검" />
          <CardBody>
            <EChartsWrapper option={clusterChartOption} height="300px" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="자본비중(W%) vs 리스크기여도(RC%)" subtitle="공분산 기반 리스크 편중 진단" />
          <CardBody>
            <EChartsWrapper option={rcChartOption} height="300px" />
          </CardBody>
        </Card>
      </div>

      {/* 현재 vs Ref vs SAA vs TAA 리스크 분해 & 실질 경제 통화 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7">
          <CardHeader title="계층별 TPA 리스크 프로필 비교" subtitle="현재 포트폴리오 vs Ref vs SAA vs TAA" />
          <CardBody className="p-0 overflow-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-slate-400 border-b border-slate-800">
                  <th className="py-3 px-4">포트폴리오 계층</th>
                  <th className="py-3 px-3 text-right">기대수익</th>
                  <th className="py-3 px-3 text-right">변동성</th>
                  <th className="py-3 px-3 text-right">주식등가 β_eq</th>
                  <th className="py-3 px-3 text-right">추적오차 TE</th>
                  <th className="py-3 px-3 text-right">Sharpe 추정</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {[
                  { name: '현재 포트폴리오 (실측)', m: xray.riskComparison.current },
                  { name: '1층 Ref (75:25 기준선)', m: xray.riskComparison.ref },
                  { name: '2층-A 장기 SAA', m: xray.riskComparison.saa },
                  { name: '2층-B 현행 TAA', m: xray.riskComparison.taa },
                ].map((row) => (
                  <tr key={row.name} className="hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-sans font-semibold text-slate-200">{row.name}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400">
                      {row.m.expectedReturnPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">
                      {row.m.volatilityPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-sky-400 font-bold">
                      {row.m.equityEqBetaPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-amber-300">
                      {row.m.trackingErrorPct.toFixed(2)}%
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {row.m.sharpeEstimate.toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader title="실질 경제 통화 노출 (Economic Currency)" subtitle="기초자산 실질 통화 기준" />
          <CardBody className="space-y-2">
            {xray.currencies.map((c) => (
              <div key={c.currency} className="space-y-1 text-xs">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-sans font-semibold text-slate-200">{c.currency}</span>
                  <span className="text-slate-300">
                    {formatKRW(c.evalKrw)}원 ({c.weightPct.toFixed(2)}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full bg-sky-500" style={{ width: `${Math.min(100, c.weightPct)}%` }} />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* 종목별 Core/Satellite X-Ray 테이블 */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-400" />
              종목별 Core / Satellite / Factor X-Ray 상세 ({filteredHoldings.length}건)
            </span>
          }
          action={
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(
                [
                  { id: 'all', label: '전체' },
                  { id: 'core', label: 'Core' },
                  { id: 'satellite', label: 'Satellite' },
                  { id: 'cash', label: 'Cash' },
                  { id: 'untagged', label: '미태그' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setRoleFilter(f.id)}
                  className={`px-3 py-1 rounded-lg font-medium ${
                    roleFilter === f.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          }
        />
        <CardBody className="p-0 overflow-auto max-h-[420px]">
          <table className="w-full text-xs text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-900 text-slate-400 border-b border-slate-800">
              <tr className="whitespace-nowrap">
                <th className="py-2.5 px-3">계좌</th>
                <th className="py-2.5 px-3">종목명</th>
                <th className="py-2.5 px-3">역할</th>
                <th className="py-2.5 px-3">9대 자산군</th>
                <th className="py-2.5 px-3">팩터 클러스터</th>
                <th className="py-2.5 px-3">실질통화</th>
                <th className="py-2.5 px-3 text-right">β_eq</th>
                <th className="py-2.5 px-3 text-right">평가금액</th>
                <th className="py-2.5 px-3 text-right">비중</th>
                <th className="py-2.5 px-3 text-right">수익률</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredHoldings.map((h, i) => (
                <tr key={`${h.account}_${h.tickerCode}_${i}`} className="hover:bg-slate-800/40">
                  <td className="py-2 px-3 font-semibold text-slate-300">{h.account}</td>
                  <td className="py-2 px-3 text-slate-100">
                    {h.name}
                    {h.isPensionSafeOverride && (
                      <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-700/40">
                        연금안전
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        h.strategyRole === 'core'
                          ? 'bg-sky-950/60 text-sky-300'
                          : h.strategyRole === 'satellite'
                          ? 'bg-purple-950/60 text-purple-300'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {h.strategyRole}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-300">{h.major9}</td>
                  <td className="py-2 px-3 text-slate-400">{h.factorCluster}</td>
                  <td className="py-2 px-3 font-mono text-slate-400">{h.economicCurrency}</td>
                  <td className="py-2 px-3 text-right font-mono text-slate-400">
                    {h.effectiveBetaEq.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-slate-200">
                    {formatKRW(h.evalKrw)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-sky-300">
                    {h.weightPct.toFixed(2)}%
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-mono font-bold ${
                      h.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {formatPercent(h.returnPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  )
}
