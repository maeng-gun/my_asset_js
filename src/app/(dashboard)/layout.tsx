import { Navbar } from '@/components/layout/navbar'

export const dynamic = 'force-dynamic'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
      <footer className="py-4 border-t border-slate-900 text-center text-xs text-slate-500">
        developed by H.M. Choi • Next.js & Supabase Portfolio Engine
      </footer>
    </div>
  )
}
