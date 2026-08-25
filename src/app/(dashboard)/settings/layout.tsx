import Link from 'next/link'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 border-b border-slate-800 pb-4">
        <h1 className="text-2xl font-bold text-slate-100">설정</h1>
        <div className="flex gap-2">
          <Link href="/settings/asset" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-200 transition">투자종목 관리</Link>
          <Link href="/settings/group" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm text-slate-200 transition">구분항목 관리</Link>
        </div>
      </div>
      {children}
    </div>
  )
}
