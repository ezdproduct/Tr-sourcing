import React, { Suspense } from 'react'
import { Sidebar } from '@/components/sidebar'
import { SourcingProvider } from '@/providers/sourcing-provider'
import { AuthGuard } from '@/components/auth-guard'
import { Loader2 } from 'lucide-react'

type DashboardLayoutProps = {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SourcingProvider>
      <Suspense fallback={
        <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-955 text-slate-500 text-sm">
          <Loader2 className="animate-spin text-[#5c59e9] mr-2" size={18} />
          <span>Loading Sourcing Hub...</span>
        </div>
      }>
        <AuthGuard>
          <div className="flex h-screen w-full overflow-hidden bg-slate-50 dark:bg-slate-955">
            {/* Sidebar (Left Sidebar Panel) */}
            <Suspense fallback={<aside className="hidden w-[70px] bg-white dark:bg-slate-955 md:flex border-r border-slate-200/80 dark:border-slate-800/80" />}>
              <Sidebar />
            </Suspense>

            {/* Main Content Canvas (Scrollable workspace) */}
            <main className="flex-1 h-full overflow-y-auto p-8 bg-[#f8fafc] dark:bg-slate-955">
              <Suspense fallback={
                <div className="flex h-[60vh] w-full items-center justify-center gap-2 text-slate-500 text-sm">
                  <Loader2 className="animate-spin text-[#5c59e9]" size={16} />
                  <span>Loading...</span>
                </div>
              }>
                {children}
              </Suspense>
            </main>
          </div>
        </AuthGuard>
      </Suspense>
    </SourcingProvider>
  )
}
