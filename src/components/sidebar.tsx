'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { useSourcing, UserRole, UserDepartment } from '@/providers/sourcing-provider'
import { createClient } from '@/supabase/client'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  BarChart3,
  Package,
  Handshake,
  FileCheck2,
  Anchor,
  Truck,
  TrendingUp,
  Database,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  User,
  Shield,
  LogOut
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

function TreeConnector({ isLast }: { isLast: boolean }) {
  return (
    <div className="absolute -left-5 top-0 bottom-0 w-5 pointer-events-none">
      {/* Vertical line: if last, only extends to middle height (1/2), else extends full height (full) */}
      <div className={`absolute left-2.5 top-0 w-[1.5px] bg-slate-200 dark:bg-slate-800/80 ${isLast ? 'h-1/2' : 'h-full'}`} />
      {/* Horizontal branch curving to the right */}
      <div className="absolute left-2.5 top-0 bottom-1/2 w-3 border-l-[1.5px] border-b-[1.5px] border-slate-200 dark:border-slate-800/80 rounded-bl-lg" />
    </div>
  )
}

function BadgeIndicator({ count, href }: { count: number; href: string }) {
  if (count === 0) return null

  let colorClasses = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  switch (href) {
    case '/orders':
      colorClasses = 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100/60 dark:border-emerald-900/30'
      break
    case '/sourcing':
      colorClasses = 'bg-blue-50 text-blue-600 dark:bg-blue-955/20 dark:text-blue-400 border border-blue-100/60 dark:border-blue-900/30'
      break
    case '/audit':
      colorClasses = 'bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400 border border-amber-100/60 dark:border-amber-900/30'
      break
    case '/inspection':
      colorClasses = 'bg-indigo-50 text-indigo-600 dark:bg-indigo-955/20 dark:text-indigo-400 border border-indigo-100/60 dark:border-indigo-900/30'
      break
    case '/logistics':
      colorClasses = 'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400 border border-purple-100/60 dark:border-purple-900/30'
      break
    case '/production':
      colorClasses = 'bg-orange-50 text-orange-600 dark:bg-orange-955/20 dark:text-orange-400 border border-orange-100/60 dark:border-orange-900/30'
      break
  }

  return (
    <span className={`ml-auto font-bold px-1.5 py-0.5 rounded-md text-[10px] scale-90 ${colorClasses}`}>
      {count}
    </span>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const subtabParam = searchParams.get('subtab')
  const { userRole, setUserRole, userDepartment, setUserDepartment } = useSourcing()
  const router = useRouter()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const isExpanded = !isCollapsed || isHovered
  const [counts, setCounts] = useState<Record<string, number>>({})

  const [user, setUser] = useState<any>(null)
  const [dbProfile, setDbProfile] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    
    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user)
        supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
          .then(({ data: profile }) => {
            setDbProfile(profile)
          })
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
        supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profile }) => {
            setDbProfile(profile)
          })
      } else {
        setUser(null)
        setDbProfile(null)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const handleSwitchContext = (role: UserRole, dept: UserDepartment, targetRoute: string) => {
    setUserRole(role)
    setUserDepartment(dept)
    router.push(targetRoute)
  }

  const getRoleLabel = (role: UserRole, dept: UserDepartment) => {
    if (role === 'admin') return 'ADMIN'
    if (role === 'boss') return 'BOSS'
    switch (dept) {
      case 'orders':
        return 'ORDERS DEPT'
      case 'sourcing':
        return 'SOURCING DEPT'
      case 'audit':
        return 'AUDIT DEPT'
      case 'inspection':
        return 'INSPECTION DEPT'
      case 'logistics':
        return 'LOGISTICS DEPT'
      case 'production':
        return 'PRODUCTION DEPT'
      default:
        return 'STAFF'
    }
  }

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved) {
      setIsCollapsed(saved === 'true')
    }
  }, [])

  // Fetch counts from Supabase on mount
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const supabase = createClient()
        const [
          { count: orders },
          { count: suppliers },
          { count: audits },
          { count: inspections },
          { count: logistics },
          { count: production }
        ] = await Promise.all([
          supabase.from('orders').select('*', { count: 'exact', head: true }),
          supabase.from('suppliers').select('*', { count: 'exact', head: true }),
          supabase.from('factory_audits').select('*', { count: 'exact', head: true }),
          supabase.from('inspection_records').select('*', { count: 'exact', head: true }),
          supabase.from('logistics_records').select('*', { count: 'exact', head: true }),
          supabase.from('production_batches').select('*', { count: 'exact', head: true })
        ])

        setCounts({
          '/orders': orders || 0,
          '/sourcing': suppliers || 0,
          '/audit': audits || 0,
          '/inspection': inspections || 0,
          '/logistics': logistics || 0,
          '/production': production || 0
        })
      } catch (err) {
        console.error('Failed to load sidebar counts:', err)
      }
    }
    fetchCounts()
  }, [])

  const toggleCollapse = () => {
    const next = !isCollapsed
    setIsCollapsed(next)
    setIsHovered(false)
    localStorage.setItem('sidebar-collapsed', String(next))
  }

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
    <div 
      onMouseEnter={() => isCollapsed && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative hidden md:block flex-shrink-0 transition-all duration-300 select-none ${
        isCollapsed ? 'w-20' : 'w-[260px]'
      }`}
    >
      <aside
        className={`flex flex-col border-r border-slate-200/80 bg-white text-slate-800 dark:border-slate-800/80 dark:bg-slate-950 dark:text-slate-200 md:flex transition-all duration-300 ease-in-out h-full ${
          isExpanded ? 'w-[260px]' : 'w-20'
        } ${
          isCollapsed && isHovered ? 'absolute top-0 left-0 z-50 shadow-2xl h-screen' : 'relative'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 px-4 border-b border-slate-200/60 dark:border-slate-800/80 overflow-hidden">
          {/* Concentric Circle Brand Logo */}
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm dark:bg-white dark:text-slate-955">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5 text-white dark:text-slate-950">
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>
          
          {/* Logo text next to it */}
          <div className={`flex flex-col whitespace-nowrap transition-all duration-300 ${
            !isExpanded ? 'opacity-0 w-0 overflow-hidden -translate-x-4' : 'opacity-100 translate-x-0'
          }`}>
            <span className="text-sm font-bold text-slate-955 dark:text-white leading-tight">Sourcing Hub</span>
            <span className="text-[10px] font-semibold text-slate-400">Enterprise Panel</span>
          </div>
        </div>

        {/* Manual Collapse Toggle Button */}
        <button
          onClick={toggleCollapse}
          className="absolute top-5 -right-3.5 z-40 h-7 w-7 rounded-full border border-slate-200/80 bg-white flex items-center justify-center text-slate-400 hover:text-slate-700 shadow-sm cursor-pointer hover:scale-105 transition-all dark:border-slate-800 dark:bg-slate-955 dark:text-slate-500 dark:hover:text-slate-300"
        >
          {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        {/* Navigation Menus */}
        <nav className="flex-1 space-y-1.5 px-3 py-6 overflow-y-auto">
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
                  className={`flex items-center gap-3.5 rounded-xl px-3 py-3 text-sm transition-all cursor-pointer overflow-hidden ${
                    isActive
                      ? 'bg-slate-100 text-slate-955 font-bold dark:bg-slate-900 dark:text-white'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/50 dark:hover:text-white font-medium'
                  }`}
                >
                  <div className={`flex-shrink-0 flex items-center justify-center w-6 h-6 transition-colors ${isActive ? 'text-[#5c59e9] dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    <Icon size={18} />
                  </div>
                  
                  <span className={`whitespace-nowrap transition-all duration-300 ${
                    !isExpanded ? 'opacity-0 w-0 overflow-hidden -translate-x-4' : 'opacity-100 translate-x-0'
                  }`}>
                    {item.label}
                  </span>

                  {/* Badge indicator & Chevrons */}
                  {isExpanded && (
                    <div className="ml-auto flex items-center gap-1.5">
                      {counts[item.href] !== undefined && (
                        <BadgeIndicator count={counts[item.href]} href={item.href} />
                      )}
                      {hasSubtabs && (
                        isActive ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />
                      )}
                    </div>
                  )}
                </Link>

                {/* Subtabs tree branches structure */}
                {isActive && hasSubtabs && isExpanded && (
                  <div className="pl-9 pr-2 py-1 space-y-1 animate-in slide-in-from-top-2 duration-200">
                    {[
                      { label: 'Overview', subtabVal: 'overview' },
                      { label: 'Workplace', subtabVal: 'workplace' }
                    ].map((sub, idx) => {
                      const isSubActive = subtabParam === sub.subtabVal || (!subtabParam && sub.subtabVal === 'overview')
                      return (
                        <Link
                          key={sub.subtabVal}
                          href={`${item.href}?subtab=${sub.subtabVal}`}
                          className={`relative flex items-center justify-between rounded-lg px-3 py-1.5 text-sm font-semibold transition-all cursor-pointer ${
                            isSubActive
                              ? 'bg-slate-100 text-[#5c59e9] font-bold dark:bg-slate-900 dark:text-white'
                              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50/50 dark:text-slate-500 dark:hover:text-slate-355 dark:hover:bg-slate-900/30'
                          }`}
                        >
                          <TreeConnector isLast={idx === 1} />
                          <span>{sub.label}</span>
                          {isSubActive && (
                            <ChevronRight size={12} className="ml-auto text-slate-400 dark:text-slate-500" />
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        {/* Footer / Controls Section */}
        <div className="border-t border-slate-200/60 dark:border-slate-800/80 p-3 space-y-3 flex-shrink-0 bg-slate-50/50 dark:bg-slate-900/10">
          {/* Theme and Role Switching Row */}
          <div className={`flex items-center gap-2 ${!isExpanded ? 'flex-col justify-center' : 'justify-between'}`}>
            <div className="flex-shrink-0 flex items-center justify-center">
              <ThemeSwitcher />
            </div>

            {isExpanded && (
              <div className="flex-1 min-w-0">
                {/* Role Context Selector Dropdown */}
                {!user || dbProfile?.role === 'admin' ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-full gap-1.5 text-[11px] border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-950 px-2 flex items-center justify-between">
                        <div className="flex items-center gap-1 min-w-0">
                          <Shield size={12} className="text-[#5c59e9] flex-shrink-0" />
                          <span className="font-bold truncate text-slate-700 dark:text-slate-300">
                            {getRoleLabel(userRole, userDepartment)}
                          </span>
                        </div>
                        <ChevronDown size={10} className="text-slate-400 flex-shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48 z-[9999]">
                      <DropdownMenuLabel className="text-[10px] text-slate-400 px-2 py-1">Switch User Context</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleSwitchContext('admin', 'all', '/orders')} className="text-xs cursor-pointer font-medium">
                        Admin (All Access)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSwitchContext('boss', 'all', '/dashboard')} className="text-xs cursor-pointer font-medium">
                        Boss (Dashboard ONLY)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-[10px] text-slate-400 px-2 py-1">Staff Departments</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleSwitchContext('staff', 'orders', '/orders')} className="text-xs cursor-pointer font-medium">
                        Orders Department
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSwitchContext('staff', 'sourcing', '/sourcing')} className="text-xs cursor-pointer font-medium">
                        Sourcing Department
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSwitchContext('staff', 'audit', '/audit')} className="text-xs cursor-pointer font-medium">
                        Factory Audit Dept
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSwitchContext('staff', 'inspection', '/inspection')} className="text-xs cursor-pointer font-medium">
                        Port Inspection Dept
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSwitchContext('staff', 'logistics', '/logistics')} className="text-xs cursor-pointer font-medium">
                        Logistics & Inbound
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleSwitchContext('staff', 'production', '/production')} className="text-xs cursor-pointer font-medium">
                        Production Run Dept
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <div className="flex h-8 items-center gap-1.5 px-2 rounded-lg border border-slate-200 bg-white/50 dark:border-slate-850 dark:bg-slate-955/50 text-[11px] font-bold text-slate-600 dark:text-slate-400 select-none">
                    <Shield size={12} className="text-[#5c59e9] flex-shrink-0" />
                    <span className="truncate">{getRoleLabel(userRole, userDepartment)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Profile Card and Dropdown */}
          <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className={`h-10 w-full gap-2 hover:bg-slate-100 dark:hover:bg-slate-900/60 p-1 justify-start rounded-xl`}>
                  <div className="flex h-7.5 w-7.5 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/50 dark:border-indigo-955 flex-shrink-0">
                    <User size={13} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  {isExpanded && (
                    <div className="flex flex-col items-start text-left min-w-0 flex-1">
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate w-full">
                        {user ? user.email.split('@')[0] : 'Mock User'}
                      </span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium truncate w-full">
                        {user ? user.email : 'local-user@sourcinghub.com'}
                      </span>
                    </div>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 z-[9999]">
                <DropdownMenuLabel className="text-[10px] text-slate-400 px-2 py-1">
                  {user ? user.email : 'local-user@sourcinghub.com'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-xs text-slate-400 cursor-not-allowed">
                  User Profile
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs text-slate-400 cursor-not-allowed">
                  Preferences
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {user ? (
                  <DropdownMenuItem onClick={handleLogout} className="text-xs text-red-650 dark:text-red-400 cursor-pointer flex gap-2 items-center">
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => router.push('/auth/login')} className="text-xs text-indigo-600 dark:text-indigo-400 cursor-pointer flex gap-2 items-center">
                    <User size={13} />
                    <span>Sign In</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>
    </div>
  )
}
