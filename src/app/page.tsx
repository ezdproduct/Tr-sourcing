import { EnvVarWarning } from '@/components/env-var-warning'
import { AuthButton } from '@/components/auth-button'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { SourcingDashboard } from '@/components/dashboard'
import { hasEnvVars } from '@/utils/env'
import Link from 'next/link'
import { Suspense } from 'react'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center w-full">
      <div className="flex w-full flex-1 flex-col items-center gap-4">
        {/* Navigation Bar */}
        <nav className="border-border/40 bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 flex h-16 w-full justify-center border-b backdrop-blur">
          <div className="flex w-full items-center justify-between p-3 px-8 text-sm">
            <div className="flex items-center gap-5 font-semibold">
              <Link
                href={'/'}
                className="flex items-center gap-2 text-base tracking-tight hover:opacity-90"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-xs font-black text-white">
                  S
                </span>
                <span>Tr-Sourcing</span>
              </Link>
            </div>
            <div className="flex items-center gap-4">
              {!hasEnvVars ? (
                <EnvVarWarning />
              ) : (
                <Suspense
                  fallback={
                    <div className="bg-muted h-9 w-24 animate-pulse rounded" />
                  }
                >
                  <AuthButton />
                </Suspense>
              )}
              <ThemeSwitcher />
            </div>
          </div>
        </nav>

        {/* Dashboard Area */}
        <div className="flex w-full flex-1 flex-col">
          <SourcingDashboard />
        </div>

        {/* Footer */}
        <footer className="text-muted-foreground mx-auto mt-auto flex w-full items-center justify-between border-t px-8 py-6 text-xs">
          <p>© 2026 Tr-Sourcing. All rights reserved.</p>
          <div className="flex gap-4">
            <a
              href="https://supabase.com"
              target="_blank"
              className="hover:underline"
              rel="noreferrer"
            >
              Supabase
            </a>
            <a
              href="https://nextjs.org"
              target="_blank"
              className="hover:underline"
              rel="noreferrer"
            >
              Next.js
            </a>
          </div>
        </footer>
      </div>
    </main>
  )
}
