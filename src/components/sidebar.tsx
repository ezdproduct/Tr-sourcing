'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSourcing } from '@/providers/sourcing-provider'
import {
  BarChart3,
  Package,
  Handshake,
  FileCheck2,
  Anchor,
  Truck,
  TrendingUp,
  Database
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: BarChart3
  },
  {
    label: 'Order Management',
    href: '/orders',
    icon: Package
  },
  {
    label: 'Supplier Sourcing',
    href: '/sourcing',
    icon: Handshake
  },
  {
    label: 'Factory Audit',
    href: '/audit',
    icon: FileCheck2
  },
  {
    label: 'Port Inspection',
    href: '/inspection',
    icon: Anchor
  },
  {
    label: 'Logistics & Inbound',
    href: '/logistics',
    icon: Truck
  },
  {
    label: 'Production Run',
    href: '/production',
    icon: TrendingUp
  },
  {
    label: 'Management System',
    href: '/management',
    icon: Database
  }
]

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const subtabParam = searchParams.get('subtab')
  const { userRole, userDepartment } = useSourcing()
  const [isHovered, setIsHovered] = useState(false)

  const filteredNavItems = navItems.filter((item) => {
    if (userRole === 'admin') {
      return true
    }
    if (userRole === 'boss') {
      return item.href === '/dashboard'
    }
    // Staff roles
    if (item.href === '/dashboard' || item.href === '/management') {
      return false
    }
    switch (userDepartment) {
      case 'orders':
        return item.href === '/orders'
      case 'sourcing':
        return item.href === '/sourcing'
      case 'audit':
        return item.href === '/audit'
      case 'inspection':
        return item.href === '/inspection'
      case 'logistics':
        return item.href === '/logistics'
      case 'production':
        return item.href === '/production'
      default:
        return false
    }
  })

  return (
    <aside
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`hidden flex-col border-r border-slate-200/80 bg-white text-slate-800 dark:border-slate-800/80 dark:bg-slate-950 dark:text-slate-200 md:flex transition-all duration-300 ease-in-out select-none ${
        isHovered ? 'w-72' : 'w-[72px]'
      }`}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 px-4 border-b border-slate-200/60 dark:border-slate-800/80 overflow-hidden">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#5c59e9] text-sm font-black text-white shadow-md shadow-[#5c59e9]/30">
          S
        </span>
        <span className={`text-base font-black tracking-tight text-slate-900 dark:text-white whitespace-nowrap transition-all duration-300 ${
          isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 w-0 overflow-hidden'
        }`}>
          Sourcing Hub
        </span>
      </div>

      {/* Navigation Menus */}
      <nav className="flex-1 space-y-1.5 px-3 py-6 overflow-hidden">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon
          const hasSubtabs = [
            '/orders',
            '/sourcing',
            '/audit',
            '/inspection',
            '/logistics',
            '/production'
          ].includes(item.href)

          return (
            <div key={item.href} className="space-y-1">
              <Link
                href={item.href}
                className={`flex items-center gap-3.5 rounded-xl px-3 py-3 text-sm font-semibold transition-all cursor-pointer overflow-hidden ${
                  isActive
                    ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/50 dark:hover:text-white'
                }`}
              >
                <div className="flex-shrink-0 flex items-center justify-center w-6 h-6">
                  <Icon size={18} />
                </div>
                <span className={`whitespace-nowrap transition-all duration-300 ${
                  isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 w-0 overflow-hidden'
                }`}>
                  {item.label}
                </span>
              </Link>

              {isActive && hasSubtabs && isHovered && (
                <div className="pl-9 pr-2 py-1 space-y-1 animate-in slide-in-from-top-2 duration-200">
                  <Link
                    href={`${item.href}?subtab=overview`}
                    className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      subtabParam !== 'workplace'
                        ? 'bg-slate-100 text-[#5c59e9] font-bold dark:bg-slate-900 dark:text-white'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-900/30'
                    }`}
                  >
                    <span>Overview</span>
                  </Link>
                  <Link
                    href={`${item.href}?subtab=workplace`}
                    className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                      subtabParam === 'workplace'
                        ? 'bg-slate-100 text-[#5c59e9] font-bold dark:bg-slate-900 dark:text-white'
                        : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50 dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-900/30'
                    }`}
                  >
                    <span>Workplace</span>
                  </Link>
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer System Info */}
      <div className="border-t border-slate-200/60 dark:border-slate-800/80 p-4 overflow-hidden">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
          <Database size={12} className="text-teal-500 flex-shrink-0 animate-pulse" />
          <span className={`transition-all duration-300 ${
            isHovered ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 w-0 overflow-hidden'
          }`}>
            Sourcing Hub Active
          </span>
        </div>
      </div>
    </aside>
  )
}
