import React, { Suspense } from 'react'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { SourcingProvider } from '@/providers/sourcing-provider'
import { AuthGuard } from '@/components/auth-guard'

type DashboardLayoutProps = {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SourcingProvider>
      <AuthGuard>
        <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-955">
          {/* Sidebar (Left Sidebar Panel) */}
          <Suspense fallback={<aside className="hidden w-[70px] bg-white dark:bg-slate-955 md:flex border-r border-slate-200/80 dark:border-slate-800/80" />}>
            <Sidebar />
          </Suspense>

          {/* Content Area (Right Area wrapper) */}
          <div className="flex flex-1 flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950">
            {/* Header (Top Navbar) */}
            <Header />

            {/* Page Contents (Scrollable workspace) */}
            <main className="flex-1 overflow-y-auto p-8 bg-[#f8fafc] dark:bg-slate-950">
              {children}
            </main>
          </div>
        </div>
      </AuthGuard>
    </SourcingProvider>
  )
}
