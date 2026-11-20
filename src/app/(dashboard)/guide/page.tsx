import { notFound } from 'next/navigation'
import { readLocalGuideHtml } from '@/lib/local-guide'

export const dynamic = 'force-dynamic'

export default function LocalCioGuidePage() {
  const html = readLocalGuideHtml()
  if (!html) {
    notFound()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div>
          <h1 className="text-lg font-bold text-slate-100">portfolio-cio 개인 CIO 사용설명서</h1>
          <p className="text-xs text-slate-400">
            로컬 데스크탑 전용 비공개 가이드 (Google Drive 정션 동기화 &middot; Vercel 배포 환경 비노출)
          </p>
        </div>
      </div>
      <iframe
        srcDoc={html}
        title="portfolio-cio 개인 CIO 사용설명서"
        sandbox="allow-scripts allow-same-origin"
        className="w-full h-[calc(100vh-165px)] min-h-[640px] rounded-2xl border border-slate-800 bg-slate-950 shadow-lg"
      />
    </div>
  )
}
