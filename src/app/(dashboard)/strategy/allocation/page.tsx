'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Tabs, TabItem } from '@/components/ui/tabs'
import { EChartsWrapper } from '@/components/charts/echarts-wrapper'
import {
  getLatestPortfolioSummary,
  getAlloTableRows,
  saveBothAlloStrategies,
  AlloStrategyInput,
} from '@/lib/actions/db'
import { formatKRW, formatPercent, formatNumber } from '@/lib/utils'
import { toast } from 'sonner'
import { ALLOCATION_ACCOUNTS, LatestPortfolioSummary } from '@/lib/engine/types'
import {
  PieChart,
  Grid,
  CheckCircle2,
  Check,
  Sliders,
  RotateCcw,
  Save,
  Plus,
  Minus,
  Coins,
  Wallet,
  AlertCircle,
  Eye,
  RefreshCw,
  Layers,
  FileText,
  X,
  ArrowRight,
  TrendingUp,
} from 'lucide-react'

// 3개 워크플로우 탭 정의
const TABS: TabItem[] = [
  { id: 'macro', label: '목표비중 및 매매금액 (SAA / TAA)', icon: PieChart },
  { id: 'matrix', label: '계좌별 리밸런싱 배분표', icon: Grid },
  { id: 'execution', label: '계좌별 매매 실행 요약', icon: CheckCircle2 },
]

// 7대 자산군 및 21개 세부자산군 매핑 정의
export interface MajorAssetDef {
  key: string
  label: string
  shortLabel: string
  dbCol: '해외주식' | '국내주식' | '실물자산' | '인컴자산' | '만기보유채권' | '시장형채권' | null
  color: string
  subRows: Array<{
    자산군: string
    세부자산군: string
    세부자산군2: string
    name: string
  }>
}

export const MAJOR_ASSETS: MajorAssetDef[] = [
  {
    key: '해외주식',
    label: '해외주식',
    shortLabel: '해외주식',
    dbCol: '해외주식',
    color: '#38bdf8', // sky-400
    subRows: [
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '인덱스', name: '선진국 인덱스' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '종목', name: '선진국 종목' },
      { 자산군: '주식', 세부자산군: '선진국', 세부자산군2: '테마', name: '선진국 테마' },
    ],
  },
  {
    key: '신흥국주식',
    label: '신흥국주식 (국내 포함)',
    shortLabel: '신흥국(국내)',
    dbCol: '국내주식',
    color: '#34d399', // emerald-400
    subRows: [
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '인덱스', name: '국내 인덱스' },
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '종목', name: '국내 종목' },
      { 자산군: '주식', 세부자산군: '국내', 세부자산군2: '테마', name: '국내 테마' },
      { 자산군: '주식', 세부자산군: '신흥국', 세부자산군2: '인덱스', name: '신흥국 인덱스' },
      { 자산군: '주식', 세부자산군: '신흥국', 세부자산군2: '테마', name: '신흥국 테마' },
    ],
  },
  {
    key: '실물자산',
    label: '실물자산',
    shortLabel: '실물자산',
    dbCol: '실물자산',
    color: '#fbbf24', // amber-400
    subRows: [
      { 자산군: '대체자산', 세부자산군: '실물자산', 세부자산군2: '귀금속', name: '실물자산 귀금속' },
      { 자산군: '대체자산', 세부자산군: '실물자산', 세부자산군2: '원자재', name: '실물자산 원자재' },
    ],
  },
  {
    key: '인컴자산',
    label: '인컴자산',
    shortLabel: '인컴자산',
    dbCol: '인컴자산',
    color: '#a78bfa', // purple-400
    subRows: [
      { 자산군: '대체자산', 세부자산군: '인컴자산', 세부자산군2: '국내', name: '인컴자산 국내' },
      { 자산군: '대체자산', 세부자산군: '인컴자산', 세부자산군2: '해외', name: '인컴자산 해외' },
    ],
  },
  {
    key: '만기보유채권',
    label: '만기보유채권',
    shortLabel: '만기채권',
    dbCol: '만기보유채권',
    color: '#818cf8', // indigo-400
    subRows: [
      { 자산군: '채권', 세부자산군: '만기보유', 세부자산군2: '안전자산', name: '만기보유 안전자산' },
      { 자산군: '채권', 세부자산군: '만기보유', 세부자산군2: '크레딧', name: '만기보유 크레딧' },
    ],
  },
  {
    key: '시장형채권',
    label: '시장형채권',
    shortLabel: '시장채권',
    dbCol: '시장형채권',
    color: '#60a5fa', // blue-400
    subRows: [
      { 자산군: '채권', 세부자산군: '시장형', 세부자산군2: '국내', name: '시장형 국내' },
      { 자산군: '채권', 세부자산군: '시장형', 세부자산군2: '해외', name: '시장형 해외' },
    ],
  },
  {
    key: '현금성자산',
    label: '현금성 자산',
    shortLabel: '현금성',
    dbCol: null,
    color: '#94a3b8', // slate-400
    subRows: [
      { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '원화상품', name: '금융상품 원화상품' },
      { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '단기ETF', name: '금융상품 단기ETF' },
      { 자산군: '현금성', 세부자산군: '금융상품', 세부자산군2: '외화상품', name: '금융상품 외화상품' },
      { 자산군: '현금성', 세부자산군: '현금', 세부자산군2: '원화', name: '현금 원화' },
      { 자산군: '현금성', 세부자산군: '현금', 세부자산군2: '외환', name: '현금 외환' },
    ],
  },
]

const LOCAL_STORAGE_KEY_OVERRIDES = 'myasset_rebalancing_matrix_overrides_v1'

export default function AllocationStrategyPage() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('macro')

  // 금액 단위 모드 ('won' | 'man')
  const [unitMode, setUnitMode] = useState<'won' | 'man'>('man')

  // 1. 최신 포트폴리오 스냅샷 쿼리
  const { data: summary } = useQuery({
    queryKey: ['latest-portfolio-summary'],
    queryFn: async () => {
      const data = await getLatestPortfolioSummary()
      return data as LatestPortfolioSummary
    },
  })

  // 2. allo_table 목표 배분 비중 쿼리
  const { data: alloRows } = useQuery({
    queryKey: ['allo-table-rows'],
    queryFn: async () => {
      const data = await getAlloTableRows()
      return data as any[]
    },
  })

  // 총 평가금액 (현재 시점)
  const accountAllo = (summary?.account_allocation || []) as any[]
  const currentTotalEval = accountAllo.find((r) => r.자산군 === '<합계>')?.합계 || 1

  // 예상 자금 유출입액 및 목표 총자산
  const [expectedInflow, setExpectedInflow] = useState<number>(0)
  const targetTotalEval = currentTotalEval + expectedInflow

  // SAA / TAA 입력 비중 상태
  const [saaInputs, setSaaInputs] = useState<AlloStrategyInput>({
    해외주식: 45.5,
    국내주식: 19.5,
    실물자산: 8.45,
    인컴자산: 4.55,
    만기보유채권: 17.4,
    시장형채권: 2.6,
  })

  const [taaInputs, setTaaInputs] = useState<AlloStrategyInput>({
    해외주식: 45.5,
    국내주식: 19.5,
    실물자산: 5.8,
    인컴자산: 3.2,
    만기보유채권: 17.0,
    시장형채권: 3.0,
  })

  const [isSavingAllo, setIsSavingAllo] = useState(false)

  // DB에서 최신 SAA, TAA 로드
  useEffect(() => {
    if (!alloRows || alloRows.length === 0) return

    // SAA 최신 행
    const saaRow = [...alloRows]
      .reverse()
      .find((r) => r.구분 === 'SAA')
    if (saaRow) {
      setSaaInputs({
        해외주식: Number(saaRow.해외주식) || 0,
        국내주식: Number(saaRow.국내주식) || 0,
        실물자산: Number(saaRow.실물자산) || 0,
        인컴자산: Number(saaRow.인컴자산) || 0,
        만기보유채권: Number(saaRow.만기보유채권) || 0,
        시장형채권: Number(saaRow.시장형채권) || 0,
      })
    }

    // TAA 최신 행 (TAA 우선, 없으면 TAA2 -> TAA1)
    const taaRow = [...alloRows]
      .reverse()
      .find((r) => r.구분 === 'TAA' || r.구분 === 'TAA2' || r.구분 === 'TAA1')
    if (taaRow) {
      setTaaInputs({
        해외주식: Number(taaRow.해외주식) || 0,
        국내주식: Number(taaRow.국내주식) || 0,
        실물자산: Number(taaRow.실물자산) || 0,
        인컴자산: Number(taaRow.인컴자산) || 0,
        만기보유채권: Number(taaRow.만기보유채권) || 0,
        시장형채권: Number(taaRow.시장형채권) || 0,
      })
    }
  }, [alloRows])

  // 현금성 자산 비중 (100% - 6개 자산군 합계)
  const saaCashRatio = useMemo(() => {
    const sum =
      saaInputs.해외주식 +
      saaInputs.국내주식 +
      saaInputs.실물자산 +
      saaInputs.인컴자산 +
      saaInputs.만기보유채권 +
      saaInputs.시장형채권
    return Number((100 - sum).toFixed(2))
  }, [saaInputs])

  const taaCashRatio = useMemo(() => {
    const sum =
      taaInputs.해외주식 +
      taaInputs.국내주식 +
      taaInputs.실물자산 +
      taaInputs.인컴자산 +
      taaInputs.만기보유채권 +
      taaInputs.시장형채권
    return Number((100 - sum).toFixed(2))
  }, [taaInputs])

  // 7대 자산군별 현재 평가금액 및 비중 집계
  const majorAssetStats = useMemo(() => {
    const map: Record<
      string,
      {
        currentAmt: number
        currentRatio: number
        saaRatio: number
        saaRatioDiff: number
        saaTargetAmt: number
        saaTradeAmt: number
        taaRatio: number
        taaRatioDiff: number
        taaTargetAmt: number
        taaTradeAmt: number
      }
    > = {}

    for (const major of MAJOR_ASSETS) {
      let currentAmt = 0
      for (const sub of major.subRows) {
        const found = accountAllo.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        if (found) {
          currentAmt += found.합계 || 0
        }
      }

      const currentRatio = currentTotalEval > 0 ? (currentAmt / currentTotalEval) * 100 : 0

      let saaRatio = 0
      let taaRatio = 0
      if (major.dbCol) {
        saaRatio = saaInputs[major.dbCol] || 0
        taaRatio = taaInputs[major.dbCol] || 0
      } else {
        saaRatio = saaCashRatio
        taaRatio = taaCashRatio
      }

      const saaTargetAmt = targetTotalEval * (saaRatio / 100)
      const saaTradeAmt = saaTargetAmt - currentAmt
      const saaRatioDiff = saaRatio - currentRatio

      const taaTargetAmt = targetTotalEval * (taaRatio / 100)
      const taaTradeAmt = taaTargetAmt - currentAmt
      const taaRatioDiff = taaRatio - currentRatio

      map[major.key] = {
        currentAmt,
        currentRatio,
        saaRatio,
        saaRatioDiff,
        saaTargetAmt,
        saaTradeAmt,
        taaRatio,
        taaRatioDiff,
        taaTargetAmt,
        taaTradeAmt,
      }
    }

    return map
  }, [accountAllo, currentTotalEval, targetTotalEval, saaInputs, taaInputs, saaCashRatio, taaCashRatio])

  // 금액 포맷 헬퍼 (단위 모드 반영)
  const fmtMoney = (val: number | null | undefined, withUnit = false): string => {
    if (val === null || val === undefined || isNaN(val)) return '0'
    if (unitMode === 'man') {
      const rounded = Math.round(val / 10000)
      return rounded.toLocaleString('ko-KR') + (withUnit ? ' 만원' : '')
    }
    return Math.round(val).toLocaleString('ko-KR') + (withUnit ? ' 원' : '')
  }

  const fmtDelta = (val: number | null | undefined, withUnit = false): string => {
    if (val === null || val === undefined || isNaN(val)) return '0'
    const sign = val > 0 ? '+' : ''
    return `${sign}${fmtMoney(val, withUnit)}`
  }

  // SAA / TAA 목표비중 DB 저장
  const handleSaveAllo = async () => {
    if (saaCashRatio < 0 || taaCashRatio < 0) {
      toast.error('현금성 자산 비중이 0% 미만입니다. 자산군 비중 합계를 100% 이하로 맞춰주세요.')
      return
    }

    setIsSavingAllo(true)
    const toastId = 'save-allo'
    toast.loading('자산배분 목표 비중(SAA, TAA)을 DB에 저장 중...', { id: toastId })
    try {
      await saveBothAlloStrategies(saaInputs, taaInputs)
      toast.success('SAA 및 TAA 목표 비중이 성공적으로 저장되었습니다!', { id: toastId })
      await queryClient.invalidateQueries({ queryKey: ['allo-table-rows'] })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '저장 실패'
      toast.error(`저장 오류: ${msg}`, { id: toastId })
    } finally {
      setIsSavingAllo(false)
    }
  }

  // ----------------------------------------------------
  // [탭 2 & 탭 3] 매트릭스 편집 및 오버라이드 상태 관리
  // ----------------------------------------------------
  const [matrixStrategy, setMatrixStrategy] = useState<'TAA' | 'SAA'>('TAA')
  const [matrixViewMode, setMatrixViewMode] = useState<'combined' | 'deltaOnly'>('combined')

  // 오버라이드 맵: key = `${자산군}_${세부자산군}_${세부자산군2}_${계좌}`, value = 변경 후 목표 평가금액
  const [matrixOverrides, setMatrixOverrides] = useState<Record<string, number>>({})

  // 로컬 스토리지에서 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_OVERRIDES)
      if (saved) {
        setMatrixOverrides(JSON.parse(saved))
      }
    } catch {
      // ignore
    }
  }, [])

  // 변경 시 로컬 스토리지에 저장
  const updateMatrixOverride = (key: string, val: number, currentVal: number) => {
    setMatrixOverrides((prev) => {
      const next = { ...prev }
      if (Math.round(val) === Math.round(currentVal)) {
        delete next[key]
      } else {
        next[key] = val
      }
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_OVERRIDES, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  // 매트릭스 전체 초기화 (현재 보유현황으로 리셋)
  const handleResetMatrix = () => {
    if (!confirm('모든 셀의 조정한 매매 금액을 지우고 현재 보유현황으로 초기화하시겠습니까?')) return
    setMatrixOverrides({})
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY_OVERRIDES)
    } catch {}
    toast.success('매트릭스가 현재 보유현황으로 초기화되었습니다.')
  }

  // 셀 편집 팝오버/모달 상태
  const [editingCell, setEditingCell] = useState<{
    rowKey: string
    rowLabel: string
    account: string
    majorKey: string
    currentVal: number
    targetVal: number
  } | null>(null)

  const [editInputVal, setEditInputVal] = useState<string>('')
  const [editDeltaInputVal, setEditDeltaInputVal] = useState<string>('')

  const openCellEditor = (
    rowKey: string,
    rowLabel: string,
    account: string,
    majorKey: string,
    currentVal: number,
    targetVal: number
  ) => {
    setEditingCell({
      rowKey,
      rowLabel,
      account,
      majorKey,
      currentVal,
      targetVal,
    })
    setEditInputVal(String(Math.round(targetVal)))
    setEditDeltaInputVal(String(Math.round(targetVal - currentVal)))
  }

  // 7대 자산군별 배분 진행 현황 및 미배분 잔액 계산
  const majorAllocatedDeltas = useMemo(() => {
    const allocated: Record<string, number> = {}
    for (const major of MAJOR_ASSETS) {
      allocated[major.key] = 0
    }

    for (const major of MAJOR_ASSETS) {
      for (const sub of major.subRows) {
        const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
        const found = accountAllo.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        for (const acct of ALLOCATION_ACCOUNTS) {
          const curVal = (found as any)?.[acct] || 0
          const cellKey = `${rowKey}_${acct}`
          const targetVal = matrixOverrides[cellKey] !== undefined ? matrixOverrides[cellKey] : curVal
          allocated[major.key] += targetVal - curVal
        }
      }
    }
    return allocated
  }, [accountAllo, matrixOverrides])

  // 계좌별 순증감(필요 입출금액) 계산
  const accountDeltas = useMemo(() => {
    const curMap: Record<string, number> = {}
    const targetMap: Record<string, number> = {}
    const deltaMap: Record<string, number> = {}

    for (const acct of ALLOCATION_ACCOUNTS) {
      curMap[acct] = 0
      targetMap[acct] = 0
      deltaMap[acct] = 0
    }

    for (const major of MAJOR_ASSETS) {
      for (const sub of major.subRows) {
        const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
        const found = accountAllo.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        for (const acct of ALLOCATION_ACCOUNTS) {
          const curVal = (found as any)?.[acct] || 0
          const cellKey = `${rowKey}_${acct}`
          const targetVal = matrixOverrides[cellKey] !== undefined ? matrixOverrides[cellKey] : curVal
          curMap[acct] += curVal
          targetMap[acct] += targetVal
          deltaMap[acct] += targetVal - curVal
        }
      }
    }

    return { curMap, targetMap, deltaMap }
  }, [accountAllo, matrixOverrides])

  // 계좌 내 현금 자동정산 핸들러
  const handleAutoBalanceAccountCash = (acct: string) => {
    // 해당 계좌에서 현금성(현금 원화)을 제외한 나머지 모든 셀의 델타 합계 산출
    const cashRowKey = '현금성_현금_원화'
    let otherDeltas = 0

    for (const major of MAJOR_ASSETS) {
      for (const sub of major.subRows) {
        const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
        if (rowKey === cashRowKey) continue

        const found = accountAllo.find(
          (r) =>
            r.자산군 === sub.자산군 &&
            r.세부자산군 === sub.세부자산군 &&
            r.세부자산군2 === sub.세부자산군2
        )
        const curVal = (found as any)?.[acct] || 0
        const cellKey = `${rowKey}_${acct}`
        const targetVal = matrixOverrides[cellKey] !== undefined ? matrixOverrides[cellKey] : curVal
        otherDeltas += targetVal - curVal
      }
    }

    // 현금 셀의 현재 보유금액
    const cashFound = accountAllo.find(
      (r) => r.자산군 === '현금성' && r.세부자산군 === '현금' && r.세부자산군2 === '원화'
    )
    const currentCashVal = (cashFound as any)?.[acct] || 0
    const newCashTarget = currentCashVal - otherDeltas

    if (newCashTarget < 0) {
      toast.warning(
        `[${acct}] 매수 금액이 계좌 내 기존 현금보다 많아 계좌 잔고가 음수(${fmtMoney(newCashTarget, true)})가 됩니다. 추가 입금이 필요할 수 있습니다.`
      )
    }

    updateMatrixOverride(`${cashRowKey}_${acct}`, newCashTarget, currentCashVal)
    toast.success(`[${acct}] 계좌 내 현금(원화)으로 상계 정산되었습니다. (계좌 순증감: 0원)`)
  }

  // ----------------------------------------------------
  // 차트 옵션 (현재 vs SAA vs TAA 비교 & 매매금액)
  // ----------------------------------------------------
  const compareCategories = MAJOR_ASSETS.map((m) => m.shortLabel)

  const chartSeriesCurrent = MAJOR_ASSETS.map((m) =>
    Number((majorAssetStats[m.key]?.currentRatio || 0).toFixed(2))
  )
  const chartSeriesSaa = MAJOR_ASSETS.map((m) =>
    Number((majorAssetStats[m.key]?.saaRatio || 0).toFixed(2))
  )
  const chartSeriesTaa = MAJOR_ASSETS.map((m) =>
    Number((majorAssetStats[m.key]?.taaRatio || 0).toFixed(2))
  )

  const ratioChartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        let text = `<div class="font-bold text-slate-200 mb-1">${params[0].axisValue}</div>`
        params.forEach((p) => {
          text += `<div class="flex items-center justify-between gap-4 text-xs">
            <span style="color:${p.color}">● ${p.seriesName}:</span>
            <span class="font-mono font-bold">${p.data}%</span>
          </div>`
        })
        return text
      },
    },
    legend: {
      data: ['현재 비중', 'SAA 중장기 목표', 'TAA 당면 목표'],
      textStyle: { color: '#94a3b8' },
      right: '2%',
      top: '2%',
    },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: compareCategories,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 11, interval: 0 },
    },
    yAxis: {
      type: 'value',
      name: '비중(%)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8', formatter: '{value}%' },
    },
    series: [
      {
        name: '현재 비중',
        type: 'bar',
        data: chartSeriesCurrent,
        itemStyle: { color: '#10b981', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: 'SAA 중장기 목표',
        type: 'bar',
        data: chartSeriesSaa,
        itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: 'TAA 당면 목표',
        type: 'bar',
        data: chartSeriesTaa,
        itemStyle: { color: '#38bdf8', borderRadius: [3, 3, 0, 0] },
      },
    ],
  }

  // 매수(+) / 매도(-) 필요 금액 차트
  const tradeAmtSaaVals = MAJOR_ASSETS.map(
    (m) => Math.round((majorAssetStats[m.key]?.saaTradeAmt || 0) / 10000)
  )
  const tradeAmtTaaVals = MAJOR_ASSETS.map(
    (m) => Math.round((majorAssetStats[m.key]?.taaTradeAmt || 0) / 10000)
  )

  const tradeAmountChartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        let text = `<div class="font-bold text-slate-200 mb-1">${params[0].axisValue}</div>`
        params.forEach((p) => {
          const val = p.data
          const isBuy = val > 0
          const color = isBuy ? '#10b981' : '#f43f5e'
          const label = isBuy ? '추가 매수 필요' : '비중 축소/매도'
          text += `<div class="flex items-center justify-between gap-4 text-xs">
            <span style="color:${p.color}">● ${p.seriesName}:</span>
            <span style="color:${color};font-weight:bold;">${val > 0 ? '+' : ''}${val.toLocaleString()} 만원 (${label})</span>
          </div>`
        })
        return text
      },
    },
    legend: {
      data: ['SAA 필요 매매금액', 'TAA 필요 매매금액'],
      textStyle: { color: '#94a3b8' },
      right: '2%',
      top: '2%',
    },
    grid: { left: '3%', right: '4%', bottom: '10%', top: '18%', containLabel: true },
    xAxis: {
      type: 'category',
      data: compareCategories,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: { color: '#94a3b8', fontSize: 11, interval: 0 },
    },
    yAxis: {
      type: 'value',
      name: '필요 금액 (만원)',
      nameTextStyle: { color: '#94a3b8' },
      axisLine: { lineStyle: { color: '#334155' } },
      splitLine: { lineStyle: { color: '#1e293b' } },
      axisLabel: { color: '#94a3b8' },
    },
    series: [
      {
        name: 'SAA 필요 매매금액',
        type: 'bar',
        data: tradeAmtSaaVals,
        itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] },
      },
      {
        name: 'TAA 필요 매매금액',
        type: 'bar',
        data: tradeAmtTaaVals,
        itemStyle: { color: '#06b6d4', borderRadius: [3, 3, 0, 0] },
      },
    ],
  }

  // ----------------------------------------------------
  // [탭 3] 계좌별 실행 요약 카드 데이터 가공
  // ----------------------------------------------------
  const executionAccounts = useMemo(() => {
    const list: Array<{
      account: string
      currentTotal: number
      targetTotal: number
      netDelta: number
      actions: Array<{
        majorKey: string
        rowKey: string
        rowLabel: string
        currentAmt: number
        targetAmt: number
        delta: number
        holdings: Array<{
          상품명: string
          보유수량: number
          평단가: number
          현재가: number
          평가금액: number
          수익률: number
        }>
      }>
    }> = []

    const tComm2 = (summary?.t_comm2 || []) as any[]

    for (const acct of ALLOCATION_ACCOUNTS) {
      const curTotal = accountDeltas.curMap[acct] || 0
      const targetTotal = accountDeltas.targetMap[acct] || 0
      const netDelta = accountDeltas.deltaMap[acct] || 0

      const acctActions: (typeof list)[0]['actions'] = []

      for (const major of MAJOR_ASSETS) {
        for (const sub of major.subRows) {
          const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
          const found = accountAllo.find(
            (r) =>
              r.자산군 === sub.자산군 &&
              r.세부자산군 === sub.세부자산군 &&
              r.세부자산군2 === sub.세부자산군2
          )
          const curVal = (found as any)?.[acct] || 0
          const cellKey = `${rowKey}_${acct}`
          const targetVal = matrixOverrides[cellKey] !== undefined ? matrixOverrides[cellKey] : curVal
          const delta = targetVal - curVal

          if (Math.round(delta) !== 0) {
            // 해당 계좌·세부자산군의 실제 보유 종목(t_comm2) 필터링
            const actualHoldings = tComm2
              .filter(
                (h) =>
                  h.계좌 === acct &&
                  h.세부자산군 === sub.세부자산군 &&
                  h.세부자산군2 === sub.세부자산군2 &&
                  h.종목코드 &&
                  h.종목코드 !== ''
              )
              .map((h) => ({
                상품명: h.상품명 || h.종목명,
                보유수량: h.보유수량 || 0,
                평단가: h.보유수량 > 0 ? Math.round(h.장부금액 / h.보유수량) : 0,
                현재가: h.현재가 || 0,
                평가금액: h.평가금액 || 0,
                수익률: h.평가수익률 || 0,
              }))

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
          netDelta,
          actions: acctActions,
        })
      }
    }

    return list
  }, [accountAllo, matrixOverrides, accountDeltas, summary])

  return (
    <div className="space-y-6">
      {/* 글로벌 헤더: 탭 전환 및 단위 선택 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 p-3 sm:p-4 rounded-2xl border border-slate-800 shadow-md">
        <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
          {/* 변경 건수 뱃지 */}
          {Object.keys(matrixOverrides).length > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              배분 조정 {Object.keys(matrixOverrides).length}건
            </span>
          )}

          {/* 금액 단위 토글 */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setUnitMode('man')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                unitMode === 'man'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              만원 단위
            </button>
            <button
              onClick={() => setUnitMode('won')}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                unitMode === 'won'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              원 단위
            </button>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* [탭 1] SAA / TAA 목표비중 설정 및 매매금액 산출 */}
      {/* ======================================================== */}
      {activeTab === 'macro' && (
        <div className="space-y-6">
          {/* 총자산 목표금액 & 자금 유출입 컨트롤 바 */}
          <Card className="border-emerald-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-900/90 shadow-lg">
            <CardBody className="p-4 sm:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                {/* 1. 현재 총평가금액 */}
                <div className="space-y-1 border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 pr-0 md:pr-4">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    현재 포트폴리오 총평가금액
                  </div>
                  <div className="text-2xl font-bold font-mono text-slate-100">
                    {formatKRW(currentTotalEval)} 원
                  </div>
                  <div className="text-xs text-slate-500">
                    약 {Math.round(currentTotalEval / 10000).toLocaleString()} 만원 (100.0%)
                  </div>
                </div>

                {/* 2. 예상 자금 유출입 (양방향 연동) */}
                <div className="space-y-2 border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 pr-0 md:pr-4">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-300 flex items-center gap-1">
                      <Coins className="w-4 h-4 text-sky-400" />
                      예상 자금 유출입 (+입금 / -출금)
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        expectedInflow > 0
                          ? 'text-emerald-400'
                          : expectedInflow < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {expectedInflow > 0 ? '+' : ''}
                      {fmtMoney(expectedInflow, true)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step={1000000}
                      value={expectedInflow}
                      onChange={(e) => setExpectedInflow(Number(e.target.value) || 0)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                      placeholder="유출입 금액 (원)"
                    />
                  </div>

                  {/* 빠른 증감 버튼 */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[-10000000, -5000000, -1000000, 0, 1000000, 5000000, 10000000].map((step) => (
                      <button
                        key={step}
                        onClick={() => {
                          if (step === 0) setExpectedInflow(0)
                          else setExpectedInflow((prev) => prev + step)
                        }}
                        className={`text-[11px] px-2 py-0.5 rounded-lg font-mono transition ${
                          step === 0
                            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            : step > 0
                            ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-900/40'
                            : 'bg-rose-950/40 text-rose-400 border border-rose-500/20 hover:bg-rose-900/40'
                        }`}
                      >
                        {step === 0 ? '0' : step > 0 ? `+${step / 10000}만` : `${step / 10000}만`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. 총자산 목표금액 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-300 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      총자산 목표금액 (현재 + 유출입)
                    </span>
                    <span className="text-xs text-emerald-400 font-mono">
                      (
                      {expectedInflow >= 0
                        ? `+${((expectedInflow / currentTotalEval) * 100).toFixed(1)}%`
                        : `${((expectedInflow / currentTotalEval) * 100).toFixed(1)}%`}
                      )
                    </span>
                  </div>

                  <input
                    type="number"
                    step={1000000}
                    value={targetTotalEval}
                    onChange={(e) => {
                      const newTarget = Number(e.target.value) || currentTotalEval
                      setExpectedInflow(newTarget - currentTotalEval)
                    }}
                    className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-base font-bold font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />

                  <div className="text-xs text-slate-500 flex items-center justify-between">
                    <span>약 {Math.round(targetTotalEval / 10000).toLocaleString()} 만원</span>
                    <span className="text-slate-400 font-mono">
                      목표 배분 총액에 곱해지는 기준 금액
                    </span>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* 7대 자산군 SAA / TAA 목표비중 및 필요 매매금액 통합 편집 테이블 */}
          <Card>
            <CardHeader
              title="7대 자산군 목표 배분 및 필요 매매금액 (SAA & TAA)"
              subtitle="현금성 자산은 100% 잔여로 자동 산출되며, 필요 금액(+매수 / -매도)은 목표 총자산 기준입니다"
              action={
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      // DB 값으로 되돌리기
                      if (alloRows && alloRows.length > 0) {
                        const sRow = [...alloRows].reverse().find((r) => r.구분 === 'SAA')
                        if (sRow) {
                          setSaaInputs({
                            해외주식: Number(sRow.해외주식) || 0,
                            국내주식: Number(sRow.국내주식) || 0,
                            실물자산: Number(sRow.실물자산) || 0,
                            인컴자산: Number(sRow.인컴자산) || 0,
                            만기보유채권: Number(sRow.만기보유채권) || 0,
                            시장형채권: Number(sRow.시장형채권) || 0,
                          })
                        }
                        const tRow = [...alloRows]
                          .reverse()
                          .find((r) => r.구분 === 'TAA' || r.구분 === 'TAA2' || r.구분 === 'TAA1')
                        if (tRow) {
                          setTaaInputs({
                            해외주식: Number(tRow.해외주식) || 0,
                            국내주식: Number(tRow.국내주식) || 0,
                            실물자산: Number(tRow.실물자산) || 0,
                            인컴자산: Number(tRow.인컴자산) || 0,
                            만기보유채권: Number(tRow.만기보유채권) || 0,
                            시장형채권: Number(tRow.시장형채권) || 0,
                          })
                        }
                        toast.success('DB에 저장된 원래 배분비중으로 복원했습니다.')
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    되돌리기
                  </button>

                  <button
                    onClick={handleSaveAllo}
                    disabled={isSavingAllo || saaCashRatio < 0 || taaCashRatio < 0}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    목표비중 DB 저장
                  </button>
                </div>
              }
            />
            <CardBody className="p-0 overflow-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                    <th className="py-3 px-4">자산군</th>
                    <th className="py-3 px-3 text-right">현재 금액</th>
                    <th className="py-3 px-3 text-right">현재 비중</th>

                    {/* SAA 컬럼 그룹 */}
                    <th className="py-3 px-3 text-center border-l border-slate-800 bg-sky-950/20 text-sky-300 font-semibold">
                      SAA 목표비중(%)
                    </th>
                    <th className="py-3 px-3 text-right bg-sky-950/10 text-sky-400">비중 차이</th>
                    <th className="py-3 px-3 text-right bg-sky-950/10 text-slate-300">목표 금액</th>
                    <th className="py-3 px-4 text-right bg-sky-950/20 text-sky-300 font-bold">
                      SAA 필요 매매액
                    </th>

                    {/* TAA 컬럼 그룹 */}
                    <th className="py-3 px-3 text-center border-l border-slate-800 bg-emerald-950/20 text-emerald-300 font-semibold">
                      <div className="flex items-center justify-center gap-1.5">
                        <span>TAA 목표비중(%)</span>
                        <button
                          onClick={() => setTaaInputs({ ...saaInputs })}
                          title="SAA 비중을 TAA에 그대로 복사"
                          className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-800/40 hover:bg-emerald-700/60 text-emerald-300 border border-emerald-600/30 font-normal"
                        >
                          SAA 복사
                        </button>
                      </div>
                    </th>
                    <th className="py-3 px-3 text-right bg-emerald-950/10 text-emerald-400">비중 차이</th>
                    <th className="py-3 px-3 text-right bg-emerald-950/10 text-slate-300">목표 금액</th>
                    <th className="py-3 px-4 text-right bg-emerald-950/20 text-emerald-300 font-bold">
                      TAA 필요 매매액
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono whitespace-nowrap">
                  {MAJOR_ASSETS.map((major) => {
                    const stats = majorAssetStats[major.key] || ({} as any)
                    const isCash = major.dbCol === null

                    return (
                      <tr key={major.key} className="hover:bg-slate-800/40 transition">
                        {/* 자산군명 */}
                        <td className="py-3 px-4 font-sans font-semibold text-slate-200">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: major.color }}
                            />
                            <span>{major.label}</span>
                          </div>
                        </td>

                        {/* 현재 금액 및 비중 */}
                        <td className="py-3 px-3 text-right text-slate-300 font-medium">
                          {fmtMoney(stats.currentAmt)}
                        </td>
                        <td className="py-3 px-3 text-right text-slate-400">
                          {formatPercent(stats.currentRatio, false)}
                        </td>

                        {/* SAA 목표 비중 입력 */}
                        <td className="py-2 px-3 border-l border-slate-800 bg-sky-950/10">
                          {isCash ? (
                            <div className="text-center font-bold text-sky-400">
                              {saaCashRatio.toFixed(2)}%
                              <span className="text-[10px] text-slate-500 font-normal ml-1">
                                (잔여)
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1 font-sans">
                              <button
                                onClick={() => {
                                  if (!major.dbCol) return
                                  const col = major.dbCol
                                  setSaaInputs((prev) => ({
                                    ...prev,
                                    [col]: Math.max(0, Number((prev[col] - 1).toFixed(2))),
                                  }))
                                }}
                                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                step={0.5}
                                min={0}
                                max={100}
                                value={major.dbCol ? saaInputs[major.dbCol] : 0}
                                onChange={(e) => {
                                  if (!major.dbCol) return
                                  const col = major.dbCol
                                  const v = parseFloat(e.target.value) || 0
                                  setSaaInputs((prev) => ({ ...prev, [col]: v }))
                                }}
                                className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-xs font-mono text-sky-300 font-bold focus:outline-none focus:border-sky-500"
                              />
                              <button
                                onClick={() => {
                                  if (!major.dbCol) return
                                  const col = major.dbCol
                                  setSaaInputs((prev) => ({
                                    ...prev,
                                    [col]: Number((prev[col] + 1).toFixed(2)),
                                  }))
                                }}
                                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </td>

                        {/* SAA 비중 차이 */}
                        <td
                          className={`py-3 px-3 text-right ${
                            stats.saaRatioDiff > 0
                              ? 'text-emerald-400'
                              : stats.saaRatioDiff < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {stats.saaRatioDiff > 0 ? '+' : ''}
                          {stats.saaRatioDiff.toFixed(2)}%p
                        </td>

                        {/* SAA 목표 금액 */}
                        <td className="py-3 px-3 text-right text-slate-300">
                          {fmtMoney(stats.saaTargetAmt)}
                        </td>

                        {/* SAA 필요 매매액 */}
                        <td
                          className={`py-3 px-4 text-right font-bold text-sm bg-sky-950/20 ${
                            stats.saaTradeAmt > 0
                              ? 'text-emerald-400'
                              : stats.saaTradeAmt < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {fmtDelta(stats.saaTradeAmt)}
                          <span className="text-[10px] ml-1 font-normal font-sans">
                            {stats.saaTradeAmt > 0
                              ? '(매수)'
                              : stats.saaTradeAmt < 0
                              ? '(매도)'
                              : '-'}
                          </span>
                        </td>

                        {/* TAA 목표 비중 입력 */}
                        <td className="py-2 px-3 border-l border-slate-800 bg-emerald-950/10">
                          {isCash ? (
                            <div className="text-center font-bold text-emerald-400">
                              {taaCashRatio.toFixed(2)}%
                              <span className="text-[10px] text-slate-500 font-normal ml-1">
                                (잔여)
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1 font-sans">
                              <button
                                onClick={() => {
                                  if (!major.dbCol) return
                                  const col = major.dbCol
                                  setTaaInputs((prev) => ({
                                    ...prev,
                                    [col]: Math.max(0, Number((prev[col] - 1).toFixed(2))),
                                  }))
                                }}
                                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                step={0.5}
                                min={0}
                                max={100}
                                value={major.dbCol ? taaInputs[major.dbCol] : 0}
                                onChange={(e) => {
                                  if (!major.dbCol) return
                                  const col = major.dbCol
                                  const v = parseFloat(e.target.value) || 0
                                  setTaaInputs((prev) => ({ ...prev, [col]: v }))
                                }}
                                className="w-16 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-center text-xs font-mono text-emerald-300 font-bold focus:outline-none focus:border-emerald-500"
                              />
                              <button
                                onClick={() => {
                                  if (!major.dbCol) return
                                  const col = major.dbCol
                                  setTaaInputs((prev) => ({
                                    ...prev,
                                    [col]: Number((prev[col] + 1).toFixed(2)),
                                  }))
                                }}
                                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </td>

                        {/* TAA 비중 차이 */}
                        <td
                          className={`py-3 px-3 text-right ${
                            stats.taaRatioDiff > 0
                              ? 'text-emerald-400'
                              : stats.taaRatioDiff < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {stats.taaRatioDiff > 0 ? '+' : ''}
                          {stats.taaRatioDiff.toFixed(2)}%p
                        </td>

                        {/* TAA 목표 금액 */}
                        <td className="py-3 px-3 text-right text-slate-300">
                          {fmtMoney(stats.taaTargetAmt)}
                        </td>

                        {/* TAA 필요 매매액 */}
                        <td
                          className={`py-3 px-4 text-right font-bold text-sm bg-emerald-950/20 ${
                            stats.taaTradeAmt > 0
                              ? 'text-emerald-400'
                              : stats.taaTradeAmt < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {fmtDelta(stats.taaTradeAmt)}
                          <span className="text-[10px] ml-1 font-normal font-sans">
                            {stats.taaTradeAmt > 0
                              ? '(매수)'
                              : stats.taaTradeAmt < 0
                              ? '(매도)'
                              : '-'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>

                {/* <합계> 종합 푸터 */}
                <tfoot>
                  <tr className="bg-slate-900/90 font-bold text-slate-100 border-t-2 border-slate-700 whitespace-nowrap">
                    <td className="py-3 px-4 font-sans text-emerald-400">총계 (합계)</td>
                    <td className="py-3 px-3 text-right font-mono font-bold">
                      {fmtMoney(currentTotalEval)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">100.00%</td>

                    {/* SAA 합계 */}
                    <td className="py-3 px-3 text-center border-l border-slate-800 font-mono text-sky-400">
                      100.00%
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400">0.00%p</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-200">
                      {fmtMoney(targetTotalEval)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-sky-400">
                      {fmtDelta(expectedInflow)}
                    </td>

                    {/* TAA 합계 */}
                    <td className="py-3 px-3 text-center border-l border-slate-800 font-mono text-emerald-400">
                      100.00%
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400">0.00%p</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-200">
                      {fmtMoney(targetTotalEval)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                      {fmtDelta(expectedInflow)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardBody>
          </Card>

          {/* 비교 차트 2종 (2열 그리드) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader
                title="7대 자산군 비중 비교"
                subtitle="현재 비중 vs SAA 중장기 목표 vs TAA 당면 목표"
              />
              <CardBody>
                <EChartsWrapper option={ratioChartOption} height="360px" />
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="7대 자산군 필요 매매금액"
                subtitle="(+) 추가 매수 필요 / (-) 비중 축소 및 매도 금액"
              />
              <CardBody>
                <EChartsWrapper option={tradeAmountChartOption} height="360px" />
              </CardBody>
            </Card>
          </div>

          {/* DB allo_table 변경 히스토리 */}
          <Card>
            <CardHeader
              title="자산배분 모델 변경 이력 (allo_table)"
              subtitle="DB에 보존된 날짜별 SAA 및 TAA 목표 비중 히스토리"
            />
            <CardBody className="p-0 overflow-auto max-h-[280px]">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium">
                    <th className="py-2.5 px-4">배분일자</th>
                    <th className="py-2.5 px-3">전략 구분</th>
                    <th className="py-2.5 px-3 text-right">해외주식</th>
                    <th className="py-2.5 px-3 text-right">신흥국(국내)</th>
                    <th className="py-2.5 px-3 text-right">실물자산</th>
                    <th className="py-2.5 px-3 text-right">인컴자산</th>
                    <th className="py-2.5 px-3 text-right">만기보유채권</th>
                    <th className="py-2.5 px-3 text-right">시장형채권</th>
                    <th className="py-2.5 px-3 text-right">현금성(잔여)</th>
                    <th className="py-2.5 px-3 text-center">동작</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {(alloRows || []).map((r, i) => {
                    const cash = Math.max(
                      0,
                      100 -
                        ((r.해외주식 || 0) +
                          (r.국내주식 || 0) +
                          (r.실물자산 || 0) +
                          (r.인컴자산 || 0) +
                          (r.만기보유채권 || 0) +
                          (r.시장형채권 || 0))
                    )
                    return (
                      <tr key={i} className="hover:bg-slate-800/40 transition">
                        <td className="py-2 px-4 font-sans text-slate-300">{r.배분일자}</td>
                        <td className="py-2 px-3 font-sans font-semibold text-emerald-400">
                          {r.구분}
                        </td>
                        <td className="py-2 px-3 text-right">{formatPercent(r.해외주식, false)}</td>
                        <td className="py-2 px-3 text-right">{formatPercent(r.국내주식, false)}</td>
                        <td className="py-2 px-3 text-right">{formatPercent(r.실물자산, false)}</td>
                        <td className="py-2 px-3 text-right">{formatPercent(r.인컴자산, false)}</td>
                        <td className="py-2 px-3 text-right">
                          {formatPercent(r.만기보유채권, false)}
                        </td>
                        <td className="py-2 px-3 text-right">{formatPercent(r.시장형채권, false)}</td>
                        <td className="py-2 px-3 text-right text-slate-400">
                          {formatPercent(cash, false)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => {
                              if (r.구분 === 'SAA') {
                                setSaaInputs({
                                  해외주식: r.해외주식 || 0,
                                  국내주식: r.국내주식 || 0,
                                  실물자산: r.실물자산 || 0,
                                  인컴자산: r.인컴자산 || 0,
                                  만기보유채권: r.만기보유채권 || 0,
                                  시장형채권: r.시장형채권 || 0,
                                })
                                toast.success(`${r.배분일자} SAA 비중을 편집창에 불러왔습니다.`)
                              } else {
                                setTaaInputs({
                                  해외주식: r.해외주식 || 0,
                                  국내주식: r.국내주식 || 0,
                                  실물자산: r.실물자산 || 0,
                                  인컴자산: r.인컴자산 || 0,
                                  만기보유채권: r.만기보유채권 || 0,
                                  시장형채권: r.시장형채권 || 0,
                                })
                                toast.success(`${r.배분일자} TAA 비중을 편집창에 불러왔습니다.`)
                              }
                            }}
                            className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-sans"
                          >
                            비중 불러오기
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ======================================================== */}
      {/* [탭 2] 계좌별 리밸런싱 배분표 (21개 세부자산군 × 11개 계좌) */}
      {/* ======================================================== */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          {/* 상단 컨트롤 툴바 */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {/* 목표 기준 선택 */}
              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <span className="text-slate-400 px-2 font-medium">기준 전략:</span>
                <button
                  onClick={() => setMatrixStrategy('TAA')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    matrixStrategy === 'TAA'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  TAA (당면 목표)
                </button>
                <button
                  onClick={() => setMatrixStrategy('SAA')}
                  className={`px-3 py-1 rounded-lg font-semibold transition ${
                    matrixStrategy === 'SAA'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  SAA (중장기 목표)
                </button>
              </div>

              {/* 매트릭스 보기 모드 */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setMatrixViewMode('combined')}
                  className={`px-3 py-1 rounded-lg font-medium transition ${
                    matrixViewMode === 'combined'
                      ? 'bg-slate-800 text-slate-100 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  목표금액 + 증감(Δ) 함께 보기
                </button>
                <button
                  onClick={() => setMatrixViewMode('deltaOnly')}
                  className={`px-3 py-1 rounded-lg font-medium transition ${
                    matrixViewMode === 'deltaOnly'
                      ? 'bg-slate-800 text-slate-100 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  매매 실행금액(Δ)만 보기
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* 전체 초기화 버튼 */}
              <button
                onClick={handleResetMatrix}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                현재 보유현황으로 전체 초기화
              </button>

              <button
                onClick={() => setActiveTab('execution')}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition"
              >
                <CheckCircle2 className="w-4 h-4" />
                매매 실행 요약 보기 ({executionAccounts.length}개 계좌)
              </button>
            </div>
          </div>

          {/* 안내 배너 */}
          <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-xs text-slate-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-emerald-500/20 text-emerald-400">
                <Sliders className="w-4 h-4" />
              </span>
              <span>
                각 셀은 <strong>현재 보유 평가금액</strong>으로 초기화되어 있습니다. 수정할 셀을
                클릭하여 변경 후 금액이나 매수/매도 증감액을 입력하세요.
              </span>
            </div>
            <div className="text-emerald-400 font-medium shrink-0">
              선택 기준: <strong>{matrixStrategy} 목표 매매액</strong>
            </div>
          </div>

          {/* 인터랙티브 계좌별 자산배분 매트릭스 */}
          <Card>
            <CardBody className="p-0 overflow-auto max-h-[calc(100vh-320px)]">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 font-medium whitespace-nowrap">
                    <th className="py-3 px-3 min-w-[160px] sticky left-0 z-30 bg-slate-900 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                      자산군 / 세부자산군
                    </th>
                    {ALLOCATION_ACCOUNTS.map((acct) => (
                      <th key={acct} className="py-3 px-2 text-right min-w-[85px]">
                        {acct}
                      </th>
                    ))}
                    <th className="py-3 px-3 text-right font-bold text-slate-100 border-l border-slate-800 bg-slate-900 min-w-[90px]">
                      합계
                    </th>
                    <th className="py-3 px-3 text-right font-bold text-sky-400 min-w-[85px]">
                      목표 증감
                    </th>
                    <th className="py-3 px-3 text-right font-bold text-emerald-400 min-w-[85px]">
                      배분 증감
                    </th>
                    <th className="py-3 px-3 text-right font-bold text-amber-400 min-w-[95px]">
                      미배분 잔액
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/60 font-mono whitespace-nowrap">
                  {MAJOR_ASSETS.map((major) => {
                    const stats = majorAssetStats[major.key] || ({} as any)
                    const targetTradeAmt =
                      matrixStrategy === 'TAA' ? stats.taaTradeAmt || 0 : stats.saaTradeAmt || 0
                    const allocatedDelta = majorAllocatedDeltas[major.key] || 0
                    const unallocatedRemaining = targetTradeAmt - allocatedDelta
                    const isCompleted = Math.abs(unallocatedRemaining) < 1000 // 1천원 미만 완료

                    return (
                      <Fragment key={major.key}>
                        {/* 7대 자산군 그룹 헤더 (소계 및 검증 행) */}
                        <tr className="bg-slate-900/90 font-semibold text-slate-200 border-t-2 border-slate-700/80">
                          <td className="py-2.5 px-3 font-sans sticky left-0 z-10 bg-slate-900 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.5)]">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: major.color }}
                              />
                              <span className="font-bold text-slate-100">{major.label}</span>
                            </div>
                          </td>

                          {/* 각 계좌별 해당 자산군 소계 */}
                          {ALLOCATION_ACCOUNTS.map((acct) => {
                            let acctSubTotal = 0
                            let acctSubDelta = 0
                            for (const sub of major.subRows) {
                              const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
                              const found = accountAllo.find(
                                (r) =>
                                  r.자산군 === sub.자산군 &&
                                  r.세부자산군 === sub.세부자산군 &&
                                  r.세부자산군2 === sub.세부자산군2
                              )
                              const cur = (found as any)?.[acct] || 0
                              const target =
                                matrixOverrides[`${rowKey}_${acct}`] !== undefined
                                  ? matrixOverrides[`${rowKey}_${acct}`]
                                  : cur
                              acctSubTotal += target
                              acctSubDelta += target - cur
                            }

                            return (
                              <td
                                key={acct}
                                className={`py-2 px-2 text-right ${
                                  acctSubTotal === 0 ? 'text-slate-600' : 'text-slate-300'
                                }`}
                              >
                                {matrixViewMode === 'deltaOnly' ? (
                                  acctSubDelta !== 0 ? (
                                    <span
                                      className={
                                        acctSubDelta > 0 ? 'text-emerald-400' : 'text-rose-400'
                                      }
                                    >
                                      {fmtDelta(acctSubDelta)}
                                    </span>
                                  ) : (
                                    '-'
                                  )
                                ) : (
                                  fmtMoney(acctSubTotal)
                                )}
                              </td>
                            )
                          })}

                          {/* 행 합계 */}
                          <td className="py-2 px-3 text-right font-bold border-l border-slate-800 text-slate-100 bg-slate-900/60">
                            {fmtMoney(stats.currentAmt + allocatedDelta)}
                          </td>

                          {/* 목표 증감액 */}
                          <td className="py-2 px-3 text-right font-bold text-sky-400">
                            {fmtDelta(targetTradeAmt)}
                          </td>

                          {/* 배분한 합계 증감 */}
                          <td
                            className={`py-2 px-3 text-right font-bold ${
                              allocatedDelta > 0
                                ? 'text-emerald-400'
                                : allocatedDelta < 0
                                ? 'text-rose-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {fmtDelta(allocatedDelta)}
                          </td>

                          {/* 미배분 잔액 검증 배지 */}
                          <td className="py-2 px-3 text-right font-bold">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] border border-emerald-500/30">
                                <Check className="w-3 h-3" /> 배분완료
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
                                  unallocatedRemaining > 0
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                }`}
                              >
                                {unallocatedRemaining > 0 ? '부족 ' : '초과 '}
                                {fmtDelta(unallocatedRemaining)}
                              </span>
                            )}
                          </td>
                        </tr>

                        {/* 세부자산군 행 (최대 5행) */}
                        {major.subRows.map((sub) => {
                          const rowKey = `${sub.자산군}_${sub.세부자산군}_${sub.세부자산군2}`
                          const found = accountAllo.find(
                            (r) =>
                              r.자산군 === sub.자산군 &&
                              r.세부자산군 === sub.세부자산군 &&
                              r.세부자산군2 === sub.세부자산군2
                          )

                          let rowTotal = 0
                          let rowDelta = 0

                          for (const acct of ALLOCATION_ACCOUNTS) {
                            const cur = (found as any)?.[acct] || 0
                            const target =
                              matrixOverrides[`${rowKey}_${acct}`] !== undefined
                                ? matrixOverrides[`${rowKey}_${acct}`]
                                : cur
                            rowTotal += target
                            rowDelta += target - cur
                          }

                          return (
                            <tr key={rowKey} className="hover:bg-slate-800/40 transition">
                              <td className="py-2 px-3 font-sans text-slate-300 pl-6 sticky left-0 z-10 bg-slate-950 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.5)] truncate max-w-[180px]">
                                {sub.name}
                              </td>

                              {/* 11개 계좌 셀 */}
                              {ALLOCATION_ACCOUNTS.map((acct) => {
                                const curVal = (found as any)?.[acct] || 0
                                const cellKey = `${rowKey}_${acct}`
                                const isOverridden = matrixOverrides[cellKey] !== undefined
                                const targetVal = isOverridden ? matrixOverrides[cellKey] : curVal
                                const delta = targetVal - curVal

                                return (
                                  <td
                                    key={acct}
                                    onClick={() =>
                                      openCellEditor(
                                        rowKey,
                                        `${acct} > ${sub.name}`,
                                        acct,
                                        major.key,
                                        curVal,
                                        targetVal
                                      )
                                    }
                                    title={`클릭하여 금액 조정 (현재: ${fmtMoney(
                                      curVal,
                                      true
                                    )}, 목표: ${fmtMoney(targetVal, true)})`}
                                    className={`py-2 px-2 text-right cursor-pointer transition select-none ${
                                      isOverridden
                                        ? delta > 0
                                          ? 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 font-semibold'
                                          : 'bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 font-semibold'
                                        : curVal === 0
                                        ? 'text-slate-600 hover:bg-slate-800/50'
                                        : 'text-slate-300 hover:bg-slate-800/60'
                                    }`}
                                  >
                                    {matrixViewMode === 'deltaOnly' ? (
                                      delta !== 0 ? (
                                        <span
                                          className={
                                            delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                                          }
                                        >
                                          {fmtDelta(delta)}
                                        </span>
                                      ) : (
                                        '-'
                                      )
                                    ) : (
                                      <div>
                                        <div>{targetVal === 0 ? '-' : fmtMoney(targetVal)}</div>
                                        {isOverridden && delta !== 0 && (
                                          <div
                                            className={`text-[9px] font-mono leading-none ${
                                              delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                                            }`}
                                          >
                                            {fmtDelta(delta)}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                )
                              })}

                              {/* 행 합계 */}
                              <td className="py-2 px-3 text-right font-semibold border-l border-slate-800 text-slate-200 bg-slate-900/40">
                                {fmtMoney(rowTotal)}
                              </td>

                              {/* 빈 칸 (세부 행에서는 목표 없음) */}
                              <td className="py-2 px-3 text-right text-slate-600">-</td>

                              {/* 세부 행 증감 합계 */}
                              <td
                                className={`py-2 px-3 text-right ${
                                  rowDelta > 0
                                    ? 'text-emerald-400'
                                    : rowDelta < 0
                                    ? 'text-rose-400'
                                    : 'text-slate-500'
                                }`}
                              >
                                {rowDelta !== 0 ? fmtDelta(rowDelta) : '-'}
                              </td>

                              <td className="py-2 px-3 text-right text-slate-600">-</td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                </tbody>

                {/* 하단 고정 푸터: 계좌별 합계 및 밸런스 검증 */}
                <tfoot className="border-t-2 border-slate-600 bg-slate-900 text-slate-200">
                  {/* 1. 현재 계좌 합계 */}
                  <tr className="whitespace-nowrap">
                    <td className="py-2.5 px-3 font-sans font-semibold sticky left-0 z-10 bg-slate-900 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.5)] text-slate-400">
                      현재 계좌 합계
                    </td>
                    {ALLOCATION_ACCOUNTS.map((acct) => (
                      <td key={acct} className="py-2 px-2 text-right text-slate-400">
                        {fmtMoney(accountDeltas.curMap[acct])}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-bold border-l border-slate-800 text-slate-300">
                      {fmtMoney(currentTotalEval)}
                    </td>
                    <td colSpan={3} className="text-slate-600 px-3 text-center">
                      (현재 총자산)
                    </td>
                  </tr>

                  {/* 2. 배분 후 계좌 합계 */}
                  <tr className="whitespace-nowrap bg-slate-900/80 font-semibold">
                    <td className="py-2.5 px-3 font-sans sticky left-0 z-10 bg-slate-900 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.5)] text-emerald-400">
                      배분 후 계좌 합계
                    </td>
                    {ALLOCATION_ACCOUNTS.map((acct) => (
                      <td key={acct} className="py-2 px-2 text-right text-slate-100">
                        {fmtMoney(accountDeltas.targetMap[acct])}
                      </td>
                    ))}
                    <td className="py-2.5 px-3 text-right font-bold border-l border-slate-800 text-emerald-400">
                      {fmtMoney(
                        Object.values(accountDeltas.targetMap).reduce((a, b) => a + b, 0)
                      )}
                    </td>
                    <td colSpan={3} className="text-slate-400 px-3 text-right font-mono text-xs">
                      목표 총자산: {fmtMoney(targetTotalEval)}
                    </td>
                  </tr>

                  {/* 3. 계좌별 순증감 (필요 입출금액) & 현금 정산 버튼 */}
                  <tr className="whitespace-nowrap bg-slate-950/90 font-bold border-t border-slate-800">
                    <td className="py-3 px-3 font-sans sticky left-0 z-10 bg-slate-950 border-r border-slate-800 shadow-[2px_0_5px_rgba(0,0,0,0.5)] text-sky-400">
                      <div>계좌 순증감 (입출금)</div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        0원 = 자체 리밸런싱
                      </div>
                    </td>
                    {ALLOCATION_ACCOUNTS.map((acct) => {
                      const netDelta = accountDeltas.deltaMap[acct] || 0
                      const isZero = Math.abs(netDelta) < 1000

                      return (
                        <td key={acct} className="py-2.5 px-2 text-right">
                          <div
                            className={
                              isZero
                                ? 'text-slate-400'
                                : netDelta > 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                            }
                          >
                            {isZero ? '0' : fmtDelta(netDelta)}
                          </div>
                          {!isZero && (
                            <button
                              onClick={() => handleAutoBalanceAccountCash(acct)}
                              title="계좌 내 현금(원화) 셀로 증감을 상계하여 계좌 순증감을 0원으로 맞춤"
                              className="mt-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 font-sans font-normal border border-slate-700"
                            >
                              현금정산
                            </button>
                          )}
                        </td>
                      )
                    })}
                    <td className="py-3 px-3 text-right font-bold border-l border-slate-800 text-sky-400">
                      {fmtDelta(
                        Object.values(accountDeltas.deltaMap).reduce((a, b) => a + b, 0)
                      )}
                    </td>
                    <td colSpan={3} className="px-3 text-right text-xs font-mono">
                      {Math.abs(
                        Object.values(accountDeltas.deltaMap).reduce((a, b) => a + b, 0) -
                          expectedInflow
                      ) < 1000 ? (
                        <span className="text-emerald-400 font-semibold flex items-center justify-end gap-1">
                          <Check className="w-4 h-4" /> 전체 유출입 금액과 정확히 일치
                        </span>
                      ) : (
                        <span className="text-amber-400 flex items-center justify-end gap-1">
                          <AlertCircle className="w-4 h-4" /> 유출입 목표(
                          {fmtMoney(expectedInflow)})와 격차 발생
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </CardBody>
          </Card>

          {/* 셀 편집 모달 대화상자 */}
          {editingCell && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-slate-100">{editingCell.rowLabel}</h3>
                    <p className="text-xs text-slate-400 font-medium">
                      대분류: {editingCell.majorKey} • 계좌: {editingCell.account}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingCell(null)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  {/* 현재 보유금액 정보 */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">현재 보유 평가금액:</span>
                    <span className="font-mono font-bold text-slate-200 text-sm">
                      {formatKRW(editingCell.currentVal)} 원
                    </span>
                  </div>

                  {/* 변경 후 목표금액 입력 */}
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium flex items-center justify-between">
                      <span>변경 후 목표금액 (원)</span>
                      <span className="text-slate-500 font-mono">
                        약 {Math.round(Number(editInputVal || 0) / 10000).toLocaleString()} 만원
                      </span>
                    </label>
                    <input
                      type="number"
                      step={100000}
                      value={editInputVal}
                      onChange={(e) => {
                        const val = e.target.value
                        setEditInputVal(val)
                        const num = Number(val) || 0
                        setEditDeltaInputVal(String(num - editingCell.currentVal))
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* 매수/매도 증감액 입력 */}
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-medium flex items-center justify-between">
                      <span>매수(+)/매도(-) 증감액 (Δ)</span>
                      <span
                        className={`font-mono font-bold ${
                          Number(editDeltaInputVal || 0) > 0
                            ? 'text-emerald-400'
                            : Number(editDeltaInputVal || 0) < 0
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {Number(editDeltaInputVal || 0) > 0 ? '+' : ''}
                        {Math.round(Number(editDeltaInputVal || 0) / 10000).toLocaleString()} 만원
                      </span>
                    </label>
                    <input
                      type="number"
                      step={100000}
                      value={editDeltaInputVal}
                      onChange={(e) => {
                        const delta = e.target.value
                        setEditDeltaInputVal(delta)
                        const num = Number(delta) || 0
                        setEditInputVal(String(editingCell.currentVal + num))
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {/* 빠른 증감 버튼들 */}
                  <div className="space-y-1.5">
                    <span className="text-slate-400 text-[11px]">빠른 증감 조정:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[-5000000, -1000000, -500000, 500000, 1000000, 5000000].map((step) => (
                        <button
                          key={step}
                          onClick={() => {
                            const curTarget = Number(editInputVal) || editingCell.currentVal
                            const nextTarget = Math.max(0, curTarget + step)
                            setEditInputVal(String(nextTarget))
                            setEditDeltaInputVal(String(nextTarget - editingCell.currentVal))
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition ${
                            step > 0
                              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-900/40'
                              : 'bg-rose-950/40 text-rose-400 border border-rose-500/20 hover:bg-rose-900/40'
                          }`}
                        >
                          {step > 0 ? `+${step / 10000}만` : `${step / 10000}만`}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setEditInputVal('0')
                          setEditDeltaInputVal(String(-editingCell.currentVal))
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-rose-300"
                      >
                        전액 매도(0원)
                      </button>
                      <button
                        onClick={() => {
                          setEditInputVal(String(editingCell.currentVal))
                          setEditDeltaInputVal('0')
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs bg-slate-800 hover:bg-slate-700 text-slate-300"
                      >
                        원래대로
                      </button>
                    </div>
                  </div>

                  {/* 마법 버튼: 미배분 잔액 전액 반영 */}
                  {(() => {
                    const stats = majorAssetStats[editingCell.majorKey] || ({} as any)
                    const targetTradeAmt =
                      matrixStrategy === 'TAA' ? stats.taaTradeAmt || 0 : stats.saaTradeAmt || 0
                    const allocatedDelta = majorAllocatedDeltas[editingCell.majorKey] || 0
                    const currentCellDelta = editingCell.targetVal - editingCell.currentVal
                    const remainingForOthers = targetTradeAmt - (allocatedDelta - currentCellDelta)

                    return (
                      <div className="pt-2 border-t border-slate-800">
                        <button
                          onClick={() => {
                            const newTarget = Math.max(
                              0,
                              editingCell.currentVal + remainingForOthers
                            )
                            setEditInputVal(String(newTarget))
                            setEditDeltaInputVal(String(newTarget - editingCell.currentVal))
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-sky-950/40 hover:bg-sky-900/50 text-sky-300 border border-sky-600/30 flex items-center justify-between font-semibold transition"
                        >
                          <span>⭐ [{editingCell.majorKey}] 미배분 잔액 전액 반영</span>
                          <span className="font-mono text-sky-400">
                            {fmtDelta(remainingForOthers, true)}
                          </span>
                        </button>
                      </div>
                    )
                  })()}
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setEditingCell(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => {
                      const finalTarget = Number(editInputVal) || 0
                      updateMatrixOverride(
                        `${editingCell.rowKey}_${editingCell.account}`,
                        finalTarget,
                        editingCell.currentVal
                      )
                      setEditingCell(null)
                      toast.success(`${editingCell.rowLabel} 목표금액이 반영되었습니다.`)
                    }}
                    className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition"
                  >
                    적용하기
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* [탭 3] 계좌별 매매 실행 요약 (별도 화면) */}
      {/* ======================================================== */}
      {activeTab === 'execution' && (
        <div className="space-y-6">
          {/* 상단 총괄 실행 요약 배너 */}
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
                  {fmtMoney(
                    executionAccounts.reduce(
                      (acc, a) =>
                        acc +
                        a.actions
                          .filter((act) => act.delta < 0)
                          .reduce((s, act) => s + Math.abs(act.delta), 0),
                      0
                    ),
                    true
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1">비중 축소 및 현금화</div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4">
                <div className="text-xs text-slate-400 font-medium mb-1">총 매수 예정 금액</div>
                <div className="text-2xl font-bold font-mono text-emerald-400">
                  {fmtMoney(
                    executionAccounts.reduce(
                      (acc, a) =>
                        acc +
                        a.actions
                          .filter((act) => act.delta > 0)
                          .reduce((s, act) => s + act.delta, 0),
                      0
                    ),
                    true
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1">비중 확대 및 신규 매수</div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4">
                <div className="text-xs text-slate-400 font-medium mb-1">순 자금 유출입</div>
                <div
                  className={`text-2xl font-bold font-mono ${
                    executionAccounts.reduce((acc, a) => acc + a.netDelta, 0) > 0
                      ? 'text-emerald-400'
                      : executionAccounts.reduce((acc, a) => acc + a.netDelta, 0) < 0
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  {fmtDelta(
                    executionAccounts.reduce((acc, a) => acc + a.netDelta, 0),
                    true
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  목표 유출입: {fmtDelta(expectedInflow, true)}
                </div>
              </CardBody>
            </Card>
          </div>

          {executionAccounts.length === 0 ? (
            <Card>
              <CardBody className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-200">
                  아직 리밸런싱 매매 내역이 없습니다
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  [탭 2: 계좌별 리밸런싱 배분표]에서 각 계좌의 셀을 클릭하여 매수/매도할 금액을
                  설정하시면, 증권사 앱에서 주문을 넣을 수 있도록 계좌별 실행 카드와 보유 종목이
                  이곳에 표시됩니다.
                </p>
                <button
                  onClick={() => setActiveTab('matrix')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition inline-flex items-center gap-1.5"
                >
                  <Grid className="w-4 h-4" />
                  계좌별 배분표로 이동하기
                </button>
              </CardBody>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {executionAccounts.map((acctData) => {
                const isZeroNet = Math.abs(acctData.netDelta) < 1000

                return (
                  <Card key={acctData.account} className="border-slate-800 shadow-md flex flex-col">
                    {/* 카드 헤더 */}
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
                              ? `+${fmtMoney(acctData.netDelta, true)} 추가 입금 필요`
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

                    {/* 카드 본문: 실행 테이블 및 보유 종목 */}
                    <CardBody className="p-0 divide-y divide-slate-800/80 flex-1">
                      {acctData.actions.map((act) => {
                        const isBuy = act.delta > 0

                        return (
                          <div key={act.rowKey} className="p-4 space-y-2.5">
                            {/* 매매 지시 헤더 */}
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

                            {/* 해당 계좌·세부자산군의 실제 보유 종목 리스트 */}
                            <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800/80 space-y-1.5">
                              <div className="text-[11px] text-slate-400 font-medium flex items-center justify-between">
                                <span>현재 보유 종목 ({act.holdings.length}건)</span>
                                <span className="text-slate-500 text-[10px]">
                                  증권사 주문 참고용
                                </span>
                              </div>

                              {act.holdings.length === 0 ? (
                                <div className="text-slate-500 text-[11px] py-1 text-center font-sans">
                                  (현재 보유 중인 종목이 없습니다 — 신규 ETF/상품 매수 필요)
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {act.holdings.map((h, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center justify-between text-[11px] font-mono py-1 border-t border-slate-900 first:border-0"
                                    >
                                      <div
                                        className="font-sans font-medium text-slate-200 truncate max-w-[200px]"
                                        title={h.상품명}
                                      >
                                        {h.상품명}
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0">
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
      )}
    </div>
  )
}
