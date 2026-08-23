import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 원화/정수 포맷팅 (예: 12,345,678)
 */
export function formatKRW(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0'
  return Math.round(val).toLocaleString('ko-KR')
}

/**
 * 일반 숫자 포맷팅 (소수점 지정)
 */
export function formatNumber(val: number | null | undefined, digits = 0): string {
  if (val === null || val === undefined || isNaN(val)) return '0'
  return val.toLocaleString('ko-KR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/**
 * 수익률/비중 백분율 포맷팅 (예: +12.34%)
 */
export function formatPercent(val: number | null | undefined, showSign = true): string {
  if (val === null || val === undefined || isNaN(val)) return '0.00%'
  const formatted = val.toFixed(2)
  if (showSign && val > 0) return `+${formatted}%`
  return `${formatted}%`
}

/**
 * 테이블 데이터 TSV 클립보드 복사 헬퍼
 */
export async function copyTableToClipboard(data: Record<string, any>[]): Promise<boolean> {
  if (!data || data.length === 0) return false

  const headers = Object.keys(data[0])
  const rows = data.map((row) =>
    headers.map((h) => {
      const v = row[h]
      return v === null || v === undefined ? '' : String(v)
    }).join('\t')
  )

  const tsv = [headers.join('\t'), ...rows].join('\n')

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(tsv)
      return true
    } else {
      const textArea = document.createElement('textarea')
      textArea.value = tsv
      textArea.style.position = 'fixed'
      textArea.style.left = '-999999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      return successful
    }
  } catch (err) {
    console.error('Clipboard copy failed:', err)
    return false
  }
}
