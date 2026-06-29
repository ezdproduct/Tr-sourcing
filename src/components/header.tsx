'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/supabase/client'
import { useSourcing, UserRole, UserDepartment } from '@/providers/sourcing-provider'
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
  const { userRole, setUserRole, userDepartment, setUserDepartment, searchQuery, setSearchQuery } = useSourcing()
  const [user, setUser] = useState<any>(null)
  const [dbProfile, setDbProfile] = useState<any>(null)

  useEffect(() => {
    const supabase = createClient()
    
    // Get current user session
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user)
        supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
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

  return (
    <header className="flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-indigo-950/20 dark:bg-slate-950">
      {/* Search Input Area Removed */}
      <div className="relative w-72">
      </div>
    </header>
  )
}
