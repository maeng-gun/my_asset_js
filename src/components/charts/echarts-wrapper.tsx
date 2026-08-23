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
        option={option}
        style={{ height: '100%', width: '100%' }}
        theme="dark"
        opts={{ renderer: 'svg' }}
      />
    </div>
  )
}
