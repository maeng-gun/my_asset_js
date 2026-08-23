import React from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl bg-slate-900/80 backdrop-blur-md border border-slate-800/80 shadow-xl overflow-hidden',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  className,
  title,
  subtitle,
  action,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  title?: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'px-5 py-4 border-b border-slate-800/80 flex items-center justify-between gap-4',
        className
      )}
      {...props}
    >
      {children ? (
        children
      ) : (
        <>
          <div>
            {title && <h3 className="font-semibold text-slate-100 text-base tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </>
      )}
    </div>
  )
}

export function CardBody({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  )
}
