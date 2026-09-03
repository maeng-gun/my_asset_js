'use client'

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

export function EChartsWrapper({
  option,
  height = '350px',
  className,
}: {
  option: any
  height?: string
  className?: string
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Process option to force dual y-axis mirroring
  let processedOption = option
  if (mounted && option.yAxis) {
    processedOption = { ...option }
    let yAxis = Array.isArray(option.yAxis) ? [...option.yAxis] : [{...option.yAxis}]
    yAxis = yAxis.map(y => ({...y}))

    if (yAxis.length === 1) {
      yAxis.push({
        ...yAxis[0],
        position: 'right',
        alignTicks: true
      })
      yAxis[0].position = 'left'
    } else if (yAxis.length >= 2) {
      yAxis[1].position = 'right'
      yAxis[1].alignTicks = true
      yAxis[0].position = 'left'
    }
    processedOption.yAxis = yAxis

    if (option.series && Array.isArray(option.series)) {
      const series = option.series.map((s: any) => ({...s}))
      const extraSeries: any[] = []
      series.forEach((s: any) => {
        if (!s.yAxisIndex || s.yAxisIndex === 0) {
          extraSeries.push({
            ...s,
            yAxisIndex: 1,
            itemStyle: { opacity: 0 },
            lineStyle: { opacity: 0 },
            areaStyle: { opacity: 0 },
            symbol: 'none',
            tooltip: { show: false },
            label: { show: false },
            silent: true,
            name: s.name ? s.name + ' (mirror)' : undefined
          })
        }
      })
      processedOption.series = [...series, ...extraSeries]
    }
  }

  if (!mounted) {
    return (
      <div
        style={{ height }}
        className={`w-full flex items-center justify-center bg-slate-900/40 rounded-xl border border-slate-800 animate-pulse text-slate-500 text-xs ${className || ''}`}
      >
        차트 로딩 중...
      </div>
    )
  }

  return (
    <div style={{ height }} className={`w-full ${className || ''}`}>
      <ReactECharts
        option={processedOption}
        style={{ height: '100%', width: '100%' }}
        theme="dark"
        opts={{ renderer: 'svg' }}
      />
    </div>
  )
}
