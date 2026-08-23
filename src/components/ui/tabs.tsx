'use client'

import React from 'react'
import { cn } from '@/lib/utils'

export interface TabItem {
  id: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

export function Tabs({
  tabs,
  activeTab,
  onChange,
  className,
}: {
  tabs: TabItem[]
  activeTab: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-1 p-1 bg-slate-900/90 rounded-xl border border-slate-800/80 overflow-x-auto no-scrollbar', className)}>
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition duration-150 whitespace-nowrap',
              isActive
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
