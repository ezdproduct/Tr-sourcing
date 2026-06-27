'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileCheck2,
  CheckCircle,
  XCircle,
  Truck,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  Package,
  Shield,
  CheckCircle2,
  Users2,
  AlertCircle
} from 'lucide-react'

interface MatchRecord {
  id: string
  poNumber: string
  grNumber: string
  invoiceNumber: string
  productName: string
  poQty: number
  grQty: number
  poPrice: number
  invoicePrice: number
  status: 'matched' | 'mismatched' | 'pending'
}

const initialMatches: MatchRecord[] = [
  {
    id: 'match-1',
    poNumber: 'PO-2026-901',
    grNumber: 'GR-2026-4401',
    invoiceNumber: 'INV-778921',
    productName: 'US Red Oak lumber',
    poQty: 100,
    grQty: 100,
    poPrice: 340,
    invoicePrice: 340,
    status: 'matched'
  },
  {
    id: 'match-2',
    poNumber: 'PO-2026-902',
    grNumber: 'GR-2026-4402',
    invoiceNumber: 'INV-779811',
    productName: 'Eco-glue bonding resin',
    poQty: 1200,
    grQty: 1195, // Deficit of 5kg, within tolerance (e.g. 1%)
    poPrice: 4.5,
    invoicePrice: 4.5,
    status: 'matched'
  },
  {
    id: 'match-3',
    poNumber: 'PO-2026-903',
    grNumber: 'GR-2026-4403',
    invoiceNumber: 'INV-780104',
    productName: '5-Layer Carton Corrugated Boxes',
    poQty: 50000,
    grQty: 50000,
    poPrice: 0.15,
    invoicePrice: 0.18, // Price mismatch! $0.18 vs PO $0.15
    status: 'mismatched'
  }
]

export default function LogisticsInboundPage() {
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>('overview')
  const [records, setRecords] = useState<MatchRecord[]>(initialMatches)
  const [isVerifying, setIsVerifying] = useState(false)

  const runThreeWayMatch = () => {
    setIsVerifying(true)
    setTimeout(() => {
      setIsVerifying(false)
      alert('3-Way Match Verification complete! All matching systems checked.')
    }, 1500)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Logistics & Inbound Reconciliation
          </h1>
          <p className="text-sm text-slate-500">
            Phases 5-6: Handle warehouse intake, verify PO-GR-Invoice 3-way matching, and authorize supplier bills
          </p>
        </div>

        <Button onClick={runThreeWayMatch} disabled={isVerifying} className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer">
          <RefreshCw size={16} className={isVerifying ? 'animate-spin' : ''} />
          <span>Execute 3-Way Match</span>
        </Button>
      </div>

      {/* Subtab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setSubtab('overview')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            subtab === 'overview'
              ? 'border-[#5c59e9] text-[#5c59e9]'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setSubtab('workplace')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            subtab === 'workplace'
              ? 'border-[#5c59e9] text-[#5c59e9]'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Workplace
        </button>
      </div>

      {subtab === 'overview' ? (
        <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Logistics Invoices</CardTitle>
                <FileCheck2 className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">{records.length}</div>
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
                    const matched = records.filter(r => r.status === 'matched').length
                    if (records.length === 0) return '100%'
                    return `${((matched / records.length) * 100).toFixed(0)}%`
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
                  {records.filter(r => r.status === 'mismatched').length}
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
                <div className="text-2xl font-black text-slate-900 dark:text-white">5 Active</div>
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
                {records.length === 0 ? (
                  <p className="text-xs text-slate-400">No records available.</p>
                ) : (
                  records.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.status === 'matched'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
                          : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-455'
                      }`}>
                        {item.poNumber}
                      </span>
                      <div className="flex-1 space-y-0.5">
                        <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                          {item.productName} | Qty: {item.poQty.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Invoice: {item.invoiceNumber} | Status: {item.status}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>

      {/* KPI Stats */}
      <div className="grid gap-6 sm:grid-cols-3">
        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Matched Transactions</CardTitle>
          </CardHeader>
          <CardContent className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">2 / 3</div>
            <span className="text-[10px] text-slate-400 font-medium">Reconciled successfully</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Discrepancies</CardTitle>
          </CardHeader>
          <CardContent className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-rose-600 dark:text-rose-400">1</div>
            <span className="text-[10px] text-slate-400 font-medium">Requires price correction</span>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Inbound Shipments</CardTitle>
          </CardHeader>
          <CardContent className="flex items-baseline gap-2">
            <div className="text-2xl font-black text-slate-900 dark:text-white">5 Active</div>
            <span className="text-[10px] text-slate-400 font-medium">En route to factory warehouse</span>
          </CardContent>
        </Card>
      </div>

      {/* 3-Way Match Verification Matrix Table */}
      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold">3-Way Match Verification Grid</CardTitle>
          <CardDescription className="text-xs">
            Matches Purchase Order (PO), Goods Receipt (GR), and Vendor Invoice. Quantities must match within 2% tolerance.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                  <th className="px-6 py-4">Linked Documents</th>
                  <th className="px-6 py-4">Material Name</th>
                  <th className="px-6 py-4">Quantity Match (PO vs GR)</th>
                  <th className="px-6 py-4">Price Match (PO vs INV)</th>
                  <th className="px-6 py-4">Match Status</th>
                  <th className="px-6 py-4 text-right">Inbound Log</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 font-mono text-[10px]">
                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">{r.poNumber}</span>
                        <span className="text-slate-500">{r.grNumber}</span>
                        <span className="text-slate-400">{r.invoiceNumber}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                      {r.productName}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>{r.poQty.toLocaleString()}</span>
                        <ArrowRight size={12} className="text-slate-400" />
                        <span>{r.grQty.toLocaleString()}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Diff: {Math.abs(r.poQty - r.grQty)} units ({(((r.poQty - r.grQty) / r.poQty) * 100).toFixed(1)}%)
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 font-medium">
                        <span>${r.poPrice.toFixed(2)}</span>
                        <ArrowRight size={12} className="text-slate-400" />
                        <span>${r.invoicePrice.toFixed(2)}</span>
                      </div>
                      {r.poPrice !== r.invoicePrice && (
                        <div className="text-[10px] text-red-600 font-semibold mt-0.5">
                          Discrepancy: +${Math.abs(r.poPrice - r.invoicePrice).toFixed(2)}
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
                        <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 gap-1 animate-pulse">
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
                      <Button size="sm" variant="outline" className="text-xs h-8 gap-1">
                        <Truck size={12} className="text-[#5c59e9]" />
                        <span>GR Receipt</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </>
      )}
    </div>
  )
}
