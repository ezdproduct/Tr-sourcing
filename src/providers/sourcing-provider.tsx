'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { createContext, useContext, useState, useEffect } from 'react'
import { createClient } from '@/supabase/client'

export type UserRole = 'admin' | 'boss' | 'staff'
export type UserDepartment = 'all' | 'orders' | 'sourcing' | 'audit' | 'inspection' | 'logistics' | 'production' | 'dashboard'

interface SourcingContextType {
  userRole: UserRole
  setUserRole: (role: UserRole) => void
  userDepartment: UserDepartment
  setUserDepartment: (dept: UserDepartment) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  currentUserEmail: string | null
}

const SourcingContext = createContext<SourcingContextType | undefined>(undefined)

export function SourcingProvider({ children }: { children: React.ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole>('admin')
  const [userDepartment, setUserDepartment] = useState<UserDepartment>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)

  // Load initial role and department from Supabase user session or localStorage
  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data, error }) => {
      if (data?.user && !error) {
        setCurrentUserEmail(data.user.email || null)
        supabase
          .from('profiles')
          .select('role, department, is_approved')
          .eq('id', data.user.id)
          .single()
          .then(({ data: profile, error: profileError }) => {
            if (profile && !profileError) {
              if (!profile.is_approved) {
                supabase.auth.signOut().then(() => {
                  setCurrentUserEmail(null)
                  window.location.href = '/auth/login?unauthorized=true'
                })
              } else {
                setUserRole(profile.role as UserRole)
                setUserDepartment(profile.department as UserDepartment)
              }
            } else {
              // Profile not found or query error (user might have been deleted)
              supabase.auth.signOut().then(() => {
                setCurrentUserEmail(null)
                window.location.href = '/auth/login'
              })
            }
          })
      } else {
        const savedRole = localStorage.getItem('sourcing_user_role') as UserRole
        if (savedRole && ['admin', 'boss', 'staff'].includes(savedRole)) {
          setUserRole(savedRole)
        }
        const savedDept = localStorage.getItem('sourcing_user_department') as UserDepartment
        if (savedDept && ['all', 'orders', 'sourcing', 'audit', 'inspection', 'logistics', 'production'].includes(savedDept)) {
          setUserDepartment(savedDept)
        }
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setCurrentUserEmail(session.user.email || null)
        supabase
          .from('profiles')
          .select('role, department, is_approved')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profile, error: profileError }) => {
            if (profile && !profileError) {
              if (!profile.is_approved) {
                supabase.auth.signOut().then(() => {
                  setCurrentUserEmail(null)
                  window.location.href = '/auth/login?unauthorized=true'
                })
              } else {
                setUserRole(profile.role as UserRole)
                setUserDepartment(profile.department as UserDepartment)
              }
            } else {
              // Profile not found or query error (user might have been deleted)
              supabase.auth.signOut().then(() => {
                setCurrentUserEmail(null)
                window.location.href = '/auth/login'
              })
            }
          })
      } else {
        // BUG 19 FIX: was setting userRole='admin' on sign-out which granted admin
        // access to whoever viewed the page next until the component unmounted.
        // Instead redirect to login so no privileged state is ever left behind.
        setCurrentUserEmail(null)
        window.location.href = '/auth/login'
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSetRole = (role: UserRole) => {
    setUserRole(role)
    localStorage.setItem('sourcing_user_role', role)
  }

  const handleSetDepartment = (dept: UserDepartment) => {
    setUserDepartment(dept)
    localStorage.setItem('sourcing_user_department', dept)
  }

  return (
    <SourcingContext.Provider
      value={{
        userRole,
        setUserRole: handleSetRole,
        userDepartment,
        setUserDepartment: handleSetDepartment,
        searchQuery,
        setSearchQuery,
        currentUserEmail,
      }}
    >
      {children}
    </SourcingContext.Provider>
  )
}

export function useSourcing() {
  const context = useContext(SourcingContext)
  if (context === undefined) {
    throw new Error('useSourcing must be used within a SourcingProvider')
  }
  return context
}
