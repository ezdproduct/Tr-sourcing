'use client'

import React from 'react'
import { useSourcing } from '@/providers/sourcing-provider'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  TrendingUp,
  Package,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'

export default function DashboardPage() {
  const { userRole } = useSourcing()

  return (
    <div className="space-y-6">
      {/* KPI Cards */}

      {/* KPI Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Active Orders
            </CardTitle>
            <Package className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">12</div>
            <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-1 font-medium">
              <TrendingUp size={12} /> +18.4% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pending Audits
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">3</div>
            <p className="text-[10px] text-amber-600 flex items-center gap-1 mt-1 font-medium">
              <AlertCircle size={12} /> 2 factory visits scheduled
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Avg Sourcing Cycle
            </CardTitle>
            <Clock className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">14.2 Days</div>
            <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-1 font-medium">
              <TrendingUp size={12} /> -2.4 days improvement
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Inbound Accuracy
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">98.2%</div>
            <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-1 font-medium">
              <TrendingUp size={12} /> 3-way match validation pass
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Active Operations */}
        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
              Recent Supply Chain Actions
            </CardTitle>
            <CardDescription className="text-xs">
              Latest activities recorded across pipeline phases
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              {
                phase: 'Production Run',
                desc: 'Order #PO-2026-904 entered production at Binh Duong Woodworks.',
                time: '2 hours ago',
                status: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400'
              },
              {
                phase: 'Port Inspection',
                desc: 'Inspector logged port loading report for Shipment #SH-981 at Cat Lai.',
                time: '4 hours ago',
                status: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
              },
              {
                phase: 'Logistics',
                desc: '3-way match complete for PO-GR-Invoice matching on oak material.',
                time: '1 day ago',
                status: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
              },
              {
                phase: 'Factory Audit',
                desc: 'QC team issued Grade-A audit pass certificate to Viet My furniture xưởng.',
                time: '2 days ago',
                status: 'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-400'
              }
            ].map((item, idx) => (
              <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.status}`}>
                  {item.phase}
                </span>
                <div className="flex-1 space-y-0.5">
                  <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                    {item.desc}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {item.time}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Global Pipeline Health Status */}
        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
              Workflow Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Status division of running campaigns
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Phase 1: Order BOM definition', pct: '85%' },
              { label: 'Phase 2-3: Supplier sourcing & negotiation', pct: '60%' },
              { label: 'Phase 3: QC factory inspections & audits', pct: '45%' },
              { label: 'Phase 4: Port loading inspection verification', pct: '30%' },
              { label: 'Phase 5-6: Inbound PO-Invoice reconciliation', pct: '70%' },
              { label: 'Phase 7: Xưởng factory production & completion', pct: '92%' }
            ].map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                  <span className="text-indigo-600 dark:text-indigo-400">{item.pct}</span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full dark:bg-slate-900">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: item.pct }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
