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
  const processedOption = mounted ? JSON.parse(JSON.stringify(option)) : option
  if (mounted && processedOption.yAxis) {
    if (!Array.isArray(processedOption.yAxis)) {
      processedOption.yAxis = [processedOption.yAxis]
    }
    if (processedOption.yAxis.length === 1) {
      processedOption.yAxis.push({
        ...processedOption.yAxis[0],
        position: 'right',
        alignTicks: true
      })
      processedOption.yAxis[0].position = 'left'
    } else if (processedOption.yAxis.length >= 2) {
      processedOption.yAxis[1].position = 'right'
      processedOption.yAxis[1].alignTicks = true
      processedOption.yAxis[0].position = 'left'
    }

    if (processedOption.series && Array.isArray(processedOption.series)) {
      const extraSeries: any[] = []
      processedOption.series.forEach((s: any) => {
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
      processedOption.series = [...processedOption.series, ...extraSeries]
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
