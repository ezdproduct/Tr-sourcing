'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { createContext, useContext, useState, useEffect } from 'react'

export type UserRole = 'admin' | 'boss' | 'staff'

interface SourcingContextType {
  userRole: UserRole
  setUserRole: (role: UserRole) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
}

const SourcingContext = createContext<SourcingContextType | undefined>(undefined)

export function SourcingProvider({ children }: { children: React.ReactNode }) {
  const [userRole, setUserRole] = useState<UserRole>('admin')
  const [searchQuery, setSearchQuery] = useState('')

  // Load initial role from localStorage if available
  useEffect(() => {
    const savedRole = localStorage.getItem('sourcing_user_role') as UserRole
    if (savedRole && ['admin', 'boss', 'staff'].includes(savedRole)) {
      setUserRole(savedRole)
    }
  }, [])

  const handleSetRole = (role: UserRole) => {
    setUserRole(role)
    localStorage.setItem('sourcing_user_role', role)
  }

  return (
    <SourcingContext.Provider
      value={{
        userRole,
        setUserRole: handleSetRole,
        searchQuery,
        setSearchQuery,
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
