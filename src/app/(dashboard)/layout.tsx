import React from 'react'
import { Sidebar } from '@/components/sidebar'
import { Header } from '@/components/header'
import { SourcingProvider } from '@/providers/sourcing-provider'

type DashboardLayoutProps = {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SourcingProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Sidebar (Left Sidebar Panel) */}
        <Sidebar />

        {/* Content Area (Right Area wrapper) */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header (Top Navbar) */}
          <Header />

          {/* Page Contents (Scrollable workspace) */}
          <main className="flex-1 overflow-y-auto p-8 bg-[#f8fafc] dark:bg-slate-950">
            {children}
          </main>
        </div>
      </div>
    </SourcingProvider>
  )
}
