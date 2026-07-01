'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users2, Package, Shield } from 'lucide-react'
import { DatabaseOrder, DatabaseSupplier } from '../types'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface SourcingAnalyticsProps {
  suppliers: DatabaseSupplier[]
  orders: DatabaseOrder[]
  setSubtab: (tab: 'overview' | 'suppliers' | 'workplace') => void
}

export function SourcingAnalytics({ suppliers, orders, setSubtab }: SourcingAnalyticsProps) {
  // Aggregate suppliers by main_products
  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    suppliers.forEach(supplier => {
      const products = supplier.suppliers?.main_products || []
      products.forEach(product => {
        counts[product] = (counts[product] || 0) + 1
      })
    })

    // Convert to array, sort by count descending, and take top 7
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7)
  }, [suppliers])

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
        <Card className="border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
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

        <Card className="border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Category Distribution</CardTitle>
            <CardDescription className="text-xs">Number of registered suppliers by product category</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {categoryCounts.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">No category data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryCounts}
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    fontSize={10}
                    width={130}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => value.length > 20 ? `${value.substring(0, 18)}...` : value}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '11px'
                    }}
                    formatter={(value) => [`${value} suppliers`, 'Count']}
                  />
                  <Bar dataKey="count" name="Suppliers" fill="#5c59e9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
