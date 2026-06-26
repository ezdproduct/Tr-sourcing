'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/supabase/client'
import { useSourcing, UserRole } from '@/providers/sourcing-provider'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  Search,
  User,
  Shield,
  LogOut,
  ChevronDown
} from 'lucide-react'

export function Header() {
  const router = useRouter()
  const { userRole, setUserRole, searchQuery, setSearchQuery } = useSourcing()
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    
    // Get current user session
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user)
      } else {
        setUser(null)
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

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return 'ADMIN'
      case 'boss':
        return 'BOSS'
      case 'staff':
        return 'STAFF'
    }
  }

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-indigo-950/20 dark:bg-slate-950">
      {/* Search Input Area */}
      <div className="relative w-72">
        <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
        <Input
          type="text"
          placeholder="Search in Sourcing Hub..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 w-full rounded-lg pl-9 pr-4 text-xs bg-slate-50 border-slate-200 focus:bg-white dark:bg-slate-900 dark:border-slate-800"
        />
      </div>

      {/* Right Side Options */}
      <div className="flex items-center gap-4">
        {/* Environment Badge */}
        <span className="hidden rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/40 md:inline-block">
          Demo Environment
        </span>

        {/* Theme Switcher */}
        <ThemeSwitcher />

        {/* Role Selector Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 text-xs border-slate-200 dark:border-slate-800">
              <Shield size={14} className="text-[#5c59e9]" />
              <span className="font-bold">{getRoleLabel(userRole)}</span>
              <ChevronDown size={12} className="text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuLabel className="text-xs text-slate-400">Switch User Role</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setUserRole('admin')} className="text-xs cursor-pointer font-medium">
              Admin Role
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUserRole('boss')} className="text-xs cursor-pointer font-medium">
              Boss Role
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUserRole('staff')} className="text-xs cursor-pointer font-medium">
              Staff Role
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-9 gap-2 hover:bg-slate-100 dark:hover:bg-slate-900">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/40">
                <User size={14} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="hidden flex-col items-start text-left md:flex">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {user ? user.email.split('@')[0] : 'Mock User'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {getRoleLabel(userRole).toLowerCase()}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">
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
              <DropdownMenuItem onClick={handleLogout} className="text-xs text-red-600 dark:text-red-400 cursor-pointer flex gap-2 items-center">
                <LogOut size={14} />
                <span>Sign Out</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => router.push('/auth/login')} className="text-xs text-indigo-600 dark:text-indigo-400 cursor-pointer flex gap-2 items-center">
                <User size={14} />
                <span>Sign In</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
