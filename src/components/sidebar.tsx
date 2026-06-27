'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  const { userRole, userDepartment } = useSourcing()

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
    <aside className="hidden w-72 flex-col border-r border-[#1e1b4b] bg-[#100e2b] text-slate-200 dark:border-indigo-950/40 dark:bg-[#09081a] md:flex">
      {/* Brand Header */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-[#1e1b4b]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5c59e9] text-sm font-black text-white shadow-md shadow-[#5c59e9]/30">
          S
        </span>
        <span className="text-base font-black tracking-tight text-white">Sourcing Hub</span>
      </div>

      {/* Navigation Menus */}
      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20'
                  : 'text-slate-400 hover:bg-[#1a173d] hover:text-white'
              }`}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer System Info */}
      <div className="border-t border-[#1e1b4b] p-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Database size={12} className="text-teal-500 animate-pulse" />
          <span>Sourcing Hub Active</span>
        </div>
      </div>
    </aside>
  )
}
