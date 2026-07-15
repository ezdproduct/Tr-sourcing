'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import {
  useSourcing,
  UserRole,
  UserDepartment,
} from '@/providers/sourcing-provider'
import { createClient } from '@/supabase/client'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
  LogOut,
  Mail,
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
    icon: BarChart3,
  },
  {
    label: 'Order Management',
    href: '/orders',
    icon: Package,
  },
  {
    label: 'Sourcing Management',
    href: '/sourcing',
    icon: Handshake,
  },
  {
    label: 'Quality Control',
    href: '/audit',
    icon: FileCheck2,
  },
  {
    label: 'Inspection',
    href: '/inspection',
    icon: Anchor,
  },
  {
    label: 'Logistics & Inventory',
    href: '/logistics',
    icon: Truck,
  },
  {
    label: 'Production',
    href: '/production',
    icon: TrendingUp,
  },
  {
    label: 'Management System',
    href: '/management',
    icon: Database,
  },
]

function TreeConnector({ isLast }: { isLast: boolean }) {
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 -left-5 w-5">
      {/* Vertical line: if last, only extends to middle height (1/2), else extends full height (full) */}
      <div
        className={`absolute top-0 left-2.5 w-[1.5px] bg-slate-200 dark:bg-slate-800/80 ${isLast ? 'h-1/2' : 'h-full'}`}
      />
      {/* Horizontal branch curving to the right */}
      <div className="absolute top-0 bottom-1/2 left-2.5 w-3 rounded-bl-lg border-b-[1.5px] border-l-[1.5px] border-slate-200 dark:border-slate-800/80" />
    </div>
  )
}

function BadgeIndicator({ count, href }: { count: number; href: string }) {
  if (count === 0) return null

  let colorClasses =
    'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
  switch (href) {
    case '/orders':
      colorClasses =
        'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-100/60 dark:border-emerald-900/30'
      break
    case '/sourcing':
      colorClasses =
        'bg-blue-50 text-blue-600 dark:bg-blue-955/20 dark:text-blue-400 border border-blue-100/60 dark:border-blue-900/30'
      break
    case '/audit':
      colorClasses =
        'bg-amber-50 text-amber-600 dark:bg-amber-955/20 dark:text-amber-400 border border-amber-100/60 dark:border-amber-900/30'
      break
    case '/inspection':
      colorClasses =
        'bg-indigo-50 text-indigo-600 dark:bg-indigo-955/20 dark:text-indigo-400 border border-indigo-100/60 dark:border-indigo-900/30'
      break
    case '/logistics':
      colorClasses =
        'bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400 border border-purple-100/60 dark:border-purple-900/30'
      break
    case '/production':
      colorClasses =
        'bg-orange-50 text-orange-600 dark:bg-orange-955/20 dark:text-orange-400 border border-orange-100/60 dark:border-orange-900/30'
      break
  }

  return (
    <span
      className={`ml-auto scale-90 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${colorClasses}`}
    >
      {count}
    </span>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const subtabParam = searchParams.get('subtab')
  const { userRole, setUserRole, userDepartment, setUserDepartment } =
    useSourcing()
  const router = useRouter()
  const [isHovered, setIsHovered] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const shouldExpand = isHovered || isDropdownOpen
  const [counts, setCounts] = useState<Record<string, number>>({})

  const [user, setUser] = useState<any>(null)
  const [dbProfile, setDbProfile] = useState<any>(null)
  const [connectedGmail, setConnectedGmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user)
        supabase
          .from('profiles')
          .select('role, gmail_agent_id')
          .eq('id', user.id)
          .single()
          .then(({ data: profile }) => {
            setDbProfile(profile)
          })
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
        supabase
          .from('profiles')
          .select('role, gmail_agent_id')
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

  // Fetch linked Gmail email address
  useEffect(() => {
    if (dbProfile?.gmail_agent_id) {
      const fetchGmail = async () => {
        try {
          const res = await fetch(
            `https://sent-gmail-api.transformerrobotics.com/api/v1/emails/agent/${dbProfile.gmail_agent_id}`,
            {
              headers: {
                'x-api-key': 'TransformerRobotics-api-key-2026',
              },
            },
          )
          if (res.ok) {
            const data = await res.json()
            if (data.agent) {
              setConnectedGmail(data.agent.email)
            }
          }
        } catch (e) {
          console.error('Error fetching gmail agent info:', e)
        }
      }
      fetchGmail()
    } else {
      setConnectedGmail(null)
    }
  }, [dbProfile?.gmail_agent_id])

  const handleConnectGmail = async () => {
    if (!user) return
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirectUrl = `${appUrl}/sourcing`
    const url = `https://sent-gmail-api.transformerrobotics.com/api/v1/auth/google/url?tenant_id=1&email=${encodeURIComponent(user.email)}&redirect_url=${encodeURIComponent(redirectUrl)}`

    try {
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        window.location.href = data.url
      } else {
        alert('Không lấy được URL kết nối Gmail')
      }
    } catch (e) {
      console.error(e)
      alert('Lỗi kết nối server')
    }
  }

  const handleDisconnectGmail = async () => {
    if (!dbProfile?.gmail_agent_id) return
    if (!confirm('Bạn có chắc chắn muốn ngắt kết nối Gmail khỏi hệ thống?'))
      return

    try {
      const res = await fetch(
        `https://sent-gmail-api.transformerrobotics.com/api/v1/auth/google/disconnect`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agent_id: dbProfile.gmail_agent_id,
          }),
        },
      )

      if (res.ok) {
        const supabase = createClient()
        const { error } = await supabase
          .from('profiles')
          .update({ gmail_agent_id: null })
          .eq('id', user.id)

        if (error) {
          console.error(error)
          alert('Không thể cập nhật profile')
        } else {
          alert('✓ Đã ngắt kết nối Gmail thành công!')
          window.location.reload()
        }
      } else {
        alert('Lỗi ngắt kết nối phía Server')
      }
    } catch (e) {
      console.error(e)
      alert('Lỗi kết nối')
    }
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const handleSwitchContext = (
    role: UserRole,
    dept: UserDepartment,
    targetRoute: string,
  ) => {
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
        return 'SOURCING MGMT'
      case 'audit':
        return 'QUALITY CONTROL'
      case 'inspection':
        return 'INSPECTION'
      case 'logistics':
        return 'LOGISTICS & INVENTORY'
      case 'production':
        return 'PRODUCTION'
      default:
        return 'STAFF'
    }
  }

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
          { count: production },
        ] = await Promise.all([
          supabase.from('orders').select('*', { count: 'exact', head: true }),
          supabase
            .from('suppliers')
            .select('*', { count: 'exact', head: true }),
          supabase
            .from('factory_audits')
            .select('*', { count: 'exact', head: true }),
          supabase
            .from('inspection_records')
            .select('*', { count: 'exact', head: true }),
          supabase
            .from('logistics_records')
            .select('*', { count: 'exact', head: true }),
          supabase
            .from('production_batches')
            .select('*', { count: 'exact', head: true }),
        ])

        setCounts({
          '/orders': orders || 0,
          '/sourcing': suppliers || 0,
          '/audit': audits || 0,
          '/inspection': inspections || 0,
          '/logistics': logistics || 0,
          '/production': production || 0,
        })
      } catch (err) {
        console.error('Failed to load sidebar counts:', err)
      }
    }
    fetchCounts()
  }, [])

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
    if (userDepartment === 'all') {
      return true
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
      className={`dark:bg-slate-955 hidden h-full flex-shrink-0 flex-col border-r border-slate-200/80 bg-white text-slate-800 transition-all duration-300 ease-in-out select-none md:flex dark:border-slate-800/80 dark:text-slate-200 ${
        shouldExpand ? 'w-[280px]' : 'w-[70px]'
      }`}
    >
      {/* Brand Header */}
      <div
        className={`flex items-center overflow-hidden pt-6 pb-2 transition-all duration-300 ${
          shouldExpand ? 'gap-3 px-6' : 'justify-center px-[15px]'
        }`}
      >
        {/* Brand Logo Image */}
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden bg-transparent">
          <img
            src="/logo.svg"
            alt="Transformer Robotics Logo"
            className="h-full w-full object-contain"
          />
        </div>

        {/* Logo text next to it */}
        <div
          className={`flex flex-col whitespace-nowrap transition-all duration-300 ${
            !shouldExpand
              ? 'w-0 -translate-x-4 overflow-hidden opacity-0'
              : 'translate-x-0 opacity-100'
          }`}
        >
          <span className="text-slate-955 text-sm leading-tight font-bold dark:text-white">
            Sourcing Hub
          </span>
          <span className="text-[10px] font-semibold text-slate-400">
            Enterprise Panel
          </span>
        </div>
      </div>

      {/* Navigation Menus */}
      <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 pt-3 pb-6">
        {filteredNavItems.map((item) => {
          const isSupplierDetail = pathname.startsWith('/management/supplier/')
          const isActive = isSupplierDetail
            ? item.href === '/sourcing'
            : pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))
          const Icon = item.icon
          const hasSubtabs = [
            '/orders',
            '/sourcing',
            '/audit',
            '/inspection',
            '/logistics',
            '/production',
            '/management',
          ].includes(item.href)

          return (
            <div key={item.href} className="space-y-1">
              <Link
                href={item.href}
                className={`flex cursor-pointer items-center gap-3.5 overflow-hidden rounded-xl px-3 py-3 text-sm transition-all ${
                  isActive
                    ? 'text-slate-955 bg-slate-100 font-bold dark:bg-slate-900 dark:text-white'
                    : 'font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/50 dark:hover:text-white'
                }`}
              >
                <div
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center transition-colors ${isActive ? 'text-[#5c59e9] dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'}`}
                >
                  <Icon size={18} />
                </div>

                <span
                  className={`whitespace-nowrap transition-all duration-300 ${
                    !shouldExpand
                      ? 'w-0 -translate-x-4 overflow-hidden opacity-0'
                      : 'translate-x-0 opacity-100'
                  }`}
                >
                  {item.label}
                </span>
              </Link>

              {/* Subtabs tree branches structure */}
              {isActive && hasSubtabs && shouldExpand && (
                <div className="animate-in slide-in-from-top-2 space-y-1 py-1 pr-2 pl-9 duration-200">
                  {(item.href === '/management'
                    ? [
                        { label: 'System Profiles', subtabVal: 'system' },
                        {
                          label: 'Sheets Integration',
                          subtabVal: 'sheets-mapping',
                        },
                        { label: 'Supplier Logs', subtabVal: 'supplier-logs' },
                      ]
                    : item.href === '/sourcing'
                      ? [
                          { label: 'Overview', subtabVal: 'overview' },
                          {
                            label: 'Supplier Profiles',
                            subtabVal: 'suppliers',
                          },
                          { label: 'Workplace', subtabVal: 'workplace' },
                          {
                            label: 'Launches & Timelines',
                            subtabVal: 'launches',
                          },
                          {
                            label: 'Email Templates',
                            subtabVal: 'email-templates',
                          },
                        ]
                      : [
                          { label: 'Overview', subtabVal: 'overview' },
                          { label: 'Workplace', subtabVal: 'workplace' },
                        ]
                  ).map((sub, idx, arr) => {
                    const isSubActive = isSupplierDetail
                      ? item.href === '/sourcing' &&
                        sub.subtabVal === 'suppliers'
                      : subtabParam === sub.subtabVal ||
                        (!subtabParam &&
                          sub.subtabVal ===
                            (item.href === '/management'
                              ? 'system'
                              : 'overview'))
                    return (
                      <Link
                        key={sub.subtabVal}
                        href={`${item.href}?subtab=${sub.subtabVal}`}
                        className={`relative flex cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-sm font-semibold transition-all ${
                          isSubActive
                            ? 'bg-slate-100 font-bold text-[#5c59e9] dark:bg-slate-900 dark:text-white'
                            : 'dark:hover:text-slate-355 text-slate-400 hover:bg-slate-50/50 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-900/30'
                        }`}
                      >
                        <TreeConnector isLast={idx === arr.length - 1} />
                        <span>{sub.label}</span>
                        {isSubActive && (
                          <ChevronRight
                            size={12}
                            className="ml-auto text-slate-400 dark:text-slate-500"
                          />
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
      <div className="flex-shrink-0 space-y-3 border-t border-slate-200/60 bg-slate-50/50 p-3 dark:border-slate-800/80 dark:bg-slate-900/10">
        {/* Theme and Role Switching Row */}
        <div
          className={`flex items-center gap-2 ${!shouldExpand ? 'flex-col justify-center' : 'justify-between'}`}
        >
          <div className="flex flex-shrink-0 items-center justify-center">
            <ThemeSwitcher onOpenChange={setIsDropdownOpen} />
          </div>

          {shouldExpand && (
            <div className="min-w-0 flex-1">
              {/* Role Context Selector Dropdown */}
              {!user || dbProfile?.role === 'admin' ? (
                <DropdownMenu onOpenChange={setIsDropdownOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="dark:border-slate-850 flex h-8 w-full items-center justify-between gap-1.5 border-slate-200 bg-white px-2 text-[11px] dark:bg-slate-950"
                    >
                      <div className="flex min-w-0 items-center gap-1">
                        <Shield
                          size={12}
                          className="flex-shrink-0 text-[#5c59e9]"
                        />
                        <span className="truncate font-bold text-slate-700 dark:text-slate-300">
                          {getRoleLabel(userRole, userDepartment)}
                        </span>
                      </div>
                      <ChevronDown
                        size={10}
                        className="flex-shrink-0 text-slate-400"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-[9999] w-48">
                    <DropdownMenuLabel className="px-2 py-1 text-[10px] text-slate-400">
                      Switch User Context
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() =>
                        handleSwitchContext('admin', 'all', '/orders')
                      }
                      className="cursor-pointer text-xs font-medium"
                    >
                      Admin (All Access)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleSwitchContext('boss', 'all', '/dashboard')
                      }
                      className="cursor-pointer text-xs font-medium"
                    >
                      Boss (Dashboard ONLY)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="px-2 py-1 text-[10px] text-slate-400">
                      Staff Departments
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() =>
                        handleSwitchContext('staff', 'orders', '/orders')
                      }
                      className="cursor-pointer text-xs font-medium"
                    >
                      Orders Department
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleSwitchContext('staff', 'sourcing', '/sourcing')
                      }
                      className="cursor-pointer text-xs font-medium"
                    >
                      Sourcing Management
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleSwitchContext('staff', 'audit', '/audit')
                      }
                      className="cursor-pointer text-xs font-medium"
                    >
                      Quality Control
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleSwitchContext(
                          'staff',
                          'inspection',
                          '/inspection',
                        )
                      }
                      className="cursor-pointer text-xs font-medium"
                    >
                      Inspection
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleSwitchContext('staff', 'logistics', '/logistics')
                      }
                      className="cursor-pointer text-xs font-medium"
                    >
                      Logistics & Inventory
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() =>
                        handleSwitchContext(
                          'staff',
                          'production',
                          '/production',
                        )
                      }
                      className="cursor-pointer text-xs font-medium"
                    >
                      Production
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div className="dark:border-slate-850 dark:bg-slate-955/50 flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white/50 px-2 text-[11px] font-bold text-slate-600 select-none dark:text-slate-400">
                  <Shield size={12} className="flex-shrink-0 text-[#5c59e9]" />
                  <span className="truncate">
                    {getRoleLabel(userRole, userDepartment)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile Card and Dropdown */}
        <div className="border-t border-slate-200/50 pt-2 dark:border-slate-800/50">
          <DropdownMenu onOpenChange={setIsDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-10 w-full justify-start gap-2 rounded-xl p-1 hover:bg-slate-100 dark:hover:bg-slate-900/60`}
              >
                <div className="dark:bg-indigo-955 dark:border-indigo-955 flex h-7.5 w-7.5 flex-shrink-0 items-center justify-center rounded-lg border border-indigo-100/50 bg-indigo-50">
                  <User
                    size={13}
                    className="text-indigo-600 dark:text-indigo-400"
                  />
                </div>
                {shouldExpand && (
                  <div className="flex min-w-0 flex-1 flex-col items-start text-left">
                    <span className="w-full truncate text-[11px] font-bold text-slate-800 dark:text-slate-200">
                      {user ? user.email.split('@')[0] : 'Mock User'}
                    </span>
                    <span className="w-full truncate text-[9px] font-medium text-slate-400 dark:text-slate-500">
                      {user ? user.email : 'local-user@sourcinghub.com'}
                    </span>
                  </div>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[9999] w-52">
              <DropdownMenuLabel className="px-2 py-1 text-[10px] text-slate-400">
                {user ? user.email : 'local-user@sourcinghub.com'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {dbProfile?.gmail_agent_id ? (
                <DropdownMenuItem
                  onClick={handleDisconnectGmail}
                  className="flex cursor-pointer items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
                >
                  <Mail size={13} />
                  <span className="truncate">
                    Disconnect {connectedGmail || 'Gmail'}
                  </span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={handleConnectGmail}
                  className="flex cursor-pointer items-center gap-2 text-xs text-[#5c59e9]"
                >
                  <Mail size={13} />
                  <span>Connect Gmail</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {user ? (
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-red-650 flex cursor-pointer items-center gap-2 text-xs dark:text-red-400"
                >
                  <LogOut size={13} />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={() => router.push('/auth/login')}
                  className="flex cursor-pointer items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400"
                >
                  <User size={13} />
                  <span>Sign In</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  )
}
