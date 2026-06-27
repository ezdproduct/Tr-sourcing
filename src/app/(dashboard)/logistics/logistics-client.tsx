'use client'

import React, { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/ui/data-table'
import {
  FileCheck2,
  CheckCircle,
  XCircle,
  Truck,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Loader2,
  CheckCircle2
} from 'lucide-react'
import { executeAllThreeWayMatchesAction, matchLogisticsRecordAction } from './actions'

export interface DatabaseLogisticsRecord {
  id: string
  order_id: string
  po_number: string
  gr_number: string
  invoice_number: string
  product_name: string
  po_qty: number
  gr_qty: number
  po_price: number
  invoice_price: number
  status: 'matched' | 'mismatched' | 'pending'
  created_at: string
}

interface LogisticsClientProps {
  initialRecords: DatabaseLogisticsRecord[]
}

export function LogisticsClient({ initialRecords }: LogisticsClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>((searchParams.get('subtab') as 'overview' | 'workplace') || 'overview')
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [matchingRecordId, setMatchingRecordId] = useState<string | null>(null)

  const handleTabChange = (val: 'overview' | 'workplace') => {
    setSubtab(val)
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?subtab=${val}`
      window.history.pushState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
    }
  }

  const handleExecuteAllMatches = () => {
    startTransition(async () => {
      setErrorMessage(null)
      const res = await executeAllThreeWayMatchesAction()
      if (res.success) {
        alert(`3-Way Match Verification complete! Matched ${res.count} records.`)
        router.refresh()
      } else {
        setErrorMessage(res.error || 'Failed to execute match')
      }
    })
  }

  const handleMatchRecord = (recordId: string) => {
    setMatchingRecordId(recordId)
    startTransition(async () => {
      setErrorMessage(null)
      const res = await matchLogisticsRecordAction(recordId)
      setMatchingRecordId(null)
      if (res.success) {
        router.refresh()
      } else {
        setErrorMessage(res.error || 'Failed to match record')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Logistics &amp; Inbound Reconciliation
          </h1>
        </div>

        <Button onClick={handleExecuteAllMatches} disabled={isPending} className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer">
          <RefreshCw size={16} className={isPending ? 'animate-spin' : ''} />
          <span>Execute All Matches</span>
        </Button>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 text-red-650 rounded-xl text-xs font-medium border border-red-200 flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Subtab Switcher */}
      <Tabs value={subtab} onValueChange={(v) => handleTabChange(v as 'overview' | 'workplace')} className="w-full space-y-6">
        <TabsList className="bg-slate-100 dark:bg-slate-950 p-1 rounded-xl w-fit flex gap-1">
          <TabsTrigger value="overview" className="px-4 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
            Overview
          </TabsTrigger>
          <TabsTrigger value="workplace" className="px-4 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
            Workplace
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="space-y-6">
            {/* KPI Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Logistics Invoices</CardTitle>
                  <FileCheck2 className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{initialRecords.length}</div>
                  <p className="text-[10px] text-slate-400 mt-1">Intake invoices registered in database</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">3-Way Match Rate</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {(() => {
                      const matched = initialRecords.filter(r => r.status === 'matched').length
                      if (initialRecords.length === 0) return '100%'
                      return `${((matched / initialRecords.length) * 100).toFixed(0)}%`
                    })()}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">PO-GR-Invoice matching rate</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Discrepancies</CardTitle>
                  <AlertCircle className="h-4 w-4 text-rose-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-rose-600 dark:text-rose-455">
                    {initialRecords.filter(r => r.status === 'mismatched').length}
                  </div>
                  <p className="text-[10px] text-rose-500 mt-1 font-medium">Requires price or quantity checks</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inbound Shipments</CardTitle>
                  <Truck className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {initialRecords.filter(r => r.status === 'pending').length} Pending
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Containers en route to warehouse</p>
                </CardContent>
              </Card>
            </div>

            {/* Logistics charts */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Logistics Verification Funnel</CardTitle>
                  <CardDescription className="text-xs">Intake matching step completion rates</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: 'Purchase Order Verification', pct: '100%' },
                    { label: 'Goods Receipt Audit (GR)', pct: '95%' },
                    { label: 'Invoice Match Check (INV)', pct: '85%' },
                    { label: 'Final Payment Authorization', pct: '70%' }
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
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Recent Intake Verification Logs</CardTitle>
                  <CardDescription className="text-xs">Latest matched and mismatched invoices</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {initialRecords.length === 0 ? (
                    <p className="text-xs text-slate-400">No records available.</p>
                  ) : (
                    initialRecords.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.status === 'matched'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
                            : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-455'
                        }`}>
                          {item.po_number}
                        </span>
                        <div className="flex-1 space-y-0.5">
                          <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                            {item.product_name} | Qty: {Number(item.po_qty).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Invoice: {item.invoice_number} | Status: {item.status}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="workplace" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          {/* 3-Way Match Verification Matrix Table */}
          <Card className="border-slate-200/60 dark:border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold">3-Way Match Verification Grid</CardTitle>
              <CardDescription className="text-xs">
                Matches Purchase Order (PO), Goods Receipt (GR), and Vendor Invoice. Quantities must match within 2% tolerance.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {initialRecords.length === 0 ? (
                <div className="p-12 text-center text-slate-400">No logistics records currently waiting for match.</div>
              ) : (
                <DataTable
                  headers={[
                    'Linked Documents',
                    'Material Name',
                    'Quantity Match (PO vs GR)',
                    'Price Match (PO vs INV)',
                    'Match Status',
                    <span key="inbound" className="sr-only">Actions</span>
                  ]}
                  items={initialRecords}
                  renderRow={(r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1 font-mono text-[10px]">
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold">{r.po_number}</span>
                          <span className="text-slate-500">{r.gr_number}</span>
                          <span className="text-slate-400">{r.invoice_number}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                        {r.product_name}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span>{Number(r.po_qty).toLocaleString()}</span>
                          <ArrowRight size={12} className="text-slate-400" />
                          <span>{Number(r.gr_qty).toLocaleString()}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Diff: {Math.abs(r.po_qty - r.gr_qty)} units ({(((r.po_qty - r.gr_qty) / r.po_qty) * 100).toFixed(1)}%)
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 font-medium">
                          <span>${Number(r.po_price).toFixed(2)}</span>
                          <ArrowRight size={12} className="text-slate-400" />
                          <span>${Number(r.invoice_price).toFixed(2)}</span>
                        </div>
                        {r.po_price !== r.invoice_price && (
                          <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                            Discrepancy: +${Math.abs(r.po_price - r.invoice_price).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {r.status === 'matched' ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 gap-1">
                            <CheckCircle size={10} />
                            <span>Matched</span>
                          </Badge>
                        ) : r.status === 'mismatched' ? (
                          <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-455 gap-1 animate-pulse">
                            <XCircle size={10} />
                            <span>Mismatched</span>
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400">
                            Pending
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {r.status !== 'matched' ? (
                          <Button
                            size="sm"
                            disabled={matchingRecordId === r.id}
                            onClick={() => handleMatchRecord(r.id)}
                            className="text-xs h-8 gap-1 bg-[#5c59e9] hover:bg-[#4a47d2] text-white cursor-pointer"
                          >
                            {matchingRecordId === r.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Truck size={12} />
                            )}
                            <span>Reconcile &amp; Close PO</span>
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled className="text-xs h-8 gap-1">
                            <CheckCircle size={12} />
                            <span>Matched</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  )}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
