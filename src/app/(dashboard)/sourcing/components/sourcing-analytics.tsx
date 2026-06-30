'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users2, Package, Shield } from 'lucide-react'
import { DatabaseOrder, DatabaseSupplier } from '../types'

interface SourcingAnalyticsProps {
  suppliers: DatabaseSupplier[]
  orders: DatabaseOrder[]
  setSubtab: (tab: 'overview' | 'suppliers' | 'workplace') => void
}

export function SourcingAnalytics({ suppliers, orders, setSubtab }: SourcingAnalyticsProps) {
  // KPI values
  const totalSuppliers = suppliers.length
  const activeBidsCount = suppliers.filter(s => s.quoted_price > 0).length
  const totalCampaigns = orders.length

  return (
    <div className="space-y-6">
      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Suppliers</CardTitle>
            <Users2 className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{totalSuppliers}</div>
            <p className="text-[10px] text-slate-400 mt-1">Registered suppliers in database</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">With Pricing Bids</CardTitle>
            <Package className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{activeBidsCount}</div>
            <p className="text-[10px] text-slate-400 mt-1">Suppliers with active bids</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Campaigns</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{totalCampaigns}</div>
            <p className="text-[10px] text-slate-400 mt-1">Sourcing campaigns running</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Quality Grade</CardTitle>
            <Shield className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">A- Grade</div>
            <p className="text-[10px] text-emerald-600 mt-1 font-medium">92% Compliance pass rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Sourcing Distribution and Recent actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Sourcing Category Division</CardTitle>
            <CardDescription className="text-xs">Shortlist allocation across wood/metal components</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Binh Duong Woodworks (Oakwood)', pct: '85%' },
              { label: 'Dong Nai Metalware (Fasteners)', pct: '70%' },
              { label: 'Long An Plastics (Cases)', pct: '45%' },
              { label: 'Da Nang Electronics (Cables)', pct: '60%' }
            ].map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                  <span className="text-indigo-600 dark:text-indigo-400">{item.pct}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full dark:bg-slate-900">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: item.pct }} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Recent Shortlists & Bids</CardTitle>
            <CardDescription className="text-xs">Latest supplier entries added to sourcing matrix</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {suppliers.length === 0 ? (
              <p className="text-xs text-slate-400">No suppliers registered.</p>
            ) : (
              suppliers.slice(0, 3).map((supplier, idx) => (
                <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                  <button
                    onClick={() => {
                      setSubtab('workplace')
                    }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    {supplier.supplier_name}
                  </button>
                  <div className="flex-1 space-y-0.5">
                    <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                      Created at {new Date(supplier.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      Contact: {supplier.suppliers?.email || supplier.suppliers?.phone || 'N/A'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
