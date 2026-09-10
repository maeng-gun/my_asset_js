import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/components/providers/query-provider'
import { ServiceWorkerRegistrar } from '@/components/providers/sw-registrar'
import { Toaster } from 'sonner'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const viewport: Viewport = {
  themeColor: '#0f172a',
}

export const metadata: Metadata = {
  title: '포트폴리오 관리 — 가족자산관리',
  description: 'Next.js + Supabase 기반의 실시간 포트폴리오 및 자산배분 관리 웹앱',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '포트폴리오 관리',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100 min-h-screen selection:bg-emerald-500 selection:text-white`}
      >
        <QueryProvider>
          <ServiceWorkerRegistrar />
          {children}
          <Toaster
            position="bottom-center"
            theme="dark"
            richColors
            closeButton
            toastOptions={{
              style: {
                background: '#0f172a',
                borderColor: '#1e293b',
                color: '#f8fafc',
              },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  )
}
