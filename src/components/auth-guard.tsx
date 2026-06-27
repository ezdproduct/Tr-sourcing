'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useSourcing } from '@/providers/sourcing-provider'
import { ShieldAlert, Loader2, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Mapping of departments to their allowed tabs
const deptToRouteMap: Record<string, string> = {
  all: '/orders',
  dashboard: '/dashboard',
  orders: '/orders',
  sourcing: '/sourcing',
  audit: '/audit',
  inspection: '/inspection',
  logistics: '/logistics',
  production: '/production'
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { userRole, userDepartment } = useSourcing()
  const [isRedirecting, setIsRedirecting] = useState(false)

  useEffect(() => {
    // 1. Redirection based on roles/departments
    if (pathname === '/') {
      if (userRole === 'staff') {
        const allowedRoute = deptToRouteMap[userDepartment]
        if (allowedRoute) {
          setIsRedirecting(true)
          router.replace(allowedRoute)
        } else {
          setIsRedirecting(false)
        }
      } else if (userRole === 'boss') {
        setIsRedirecting(true)
        router.replace('/dashboard')
      } else {
        setIsRedirecting(false)
      }
    } else if (pathname === '/dashboard' && userRole === 'staff') {
      const allowedRoute = deptToRouteMap[userDepartment]
      if (allowedRoute) {
        setIsRedirecting(true)
        router.replace(allowedRoute)
      } else {
        setIsRedirecting(false)
      }
    } else {
      setIsRedirecting(false)
    }
  }, [pathname, userRole, userDepartment, router])

  if (isRedirecting) {
    return (
      <div className="flex h-[60vh] w-full flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#5c59e9]" />
        <p className="text-xs font-semibold text-slate-500">Redirecting to your department portal...</p>
      </div>
    )
  }

  // 2. Check page-level permissions
  const isAuthorized = () => {
    if (userRole === 'admin') return true
    if (pathname.startsWith('/management')) return false

    if (userRole === 'boss') {
      // Boss only allowed to see dashboard
      return pathname === '/dashboard' || pathname === '/'
    }

    // Staff roles
    if (pathname === '/dashboard' || pathname === '/') return false

    if (pathname.startsWith('/orders') && userDepartment !== 'orders' && userDepartment !== 'all') return false
    if (pathname.startsWith('/sourcing') && userDepartment !== 'sourcing' && userDepartment !== 'all') return false
    if (pathname.startsWith('/audit') && userDepartment !== 'audit' && userDepartment !== 'all') return false
    if (pathname.startsWith('/inspection') && userDepartment !== 'inspection' && userDepartment !== 'all') return false
    if (pathname.startsWith('/logistics') && userDepartment !== 'logistics' && userDepartment !== 'all') return false
    if (pathname.startsWith('/production') && userDepartment !== 'production' && userDepartment !== 'all') return false

    return true
  }

  if (!isAuthorized()) {
    const myPortal = deptToRouteMap[userDepartment]
    
    return (
      <div className="flex h-[70vh] w-full items-center justify-center p-4">
        <div className="relative overflow-hidden w-full max-w-md rounded-3xl border border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60 p-8 shadow-xl text-center backdrop-blur-md">
          <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-rose-500/10 blur-2xl" />
          
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-450 mx-auto mb-4 border border-rose-100/30">
            <ShieldAlert size={24} className="stroke-[2.2]" />
          </div>

          <h3 className="text-base font-bold text-slate-950 dark:text-white mb-2">Access Denied</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
            Your department profile ({userDepartment === 'all' ? 'Unassigned' : userDepartment.toUpperCase()}) does not have permission to view this pipeline stage. Please coordinate with Administration for access privileges.
          </p>

          {myPortal ? (
            <Button
              onClick={() => router.push(myPortal)}
              className="w-full h-9 rounded-xl bg-[#5c59e9] hover:bg-[#4a47d2] text-white font-semibold text-xs transition-colors cursor-pointer gap-2"
            >
              <Compass size={14} />
              <span>Go to My Department Portal</span>
            </Button>
          ) : (
            <Button
              onClick={() => router.push('/auth/login')}
              className="w-full h-9 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors cursor-pointer"
            >
              Back to Login
            </Button>
          )}
        </div>
      </div>
    )
  }

  return <>{children}</>
}
