'use client'

import React, { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/ui/data-table'
import { useSourcing } from '@/providers/sourcing-provider'
import { updateOrderStageAction } from '@/app/(dashboard)/orders/actions'
import { KanbanBoard } from '@/app/(dashboard)/orders/kanban-board'
import { TimelineProposalCard } from '@/components/timeline-proposal-card'
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
  CheckCircle2,
  Package,
  Search,
  ChevronRight,
  FileText
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
  orders?: {
    order_type: string
    order_items?: Array<{
      item_name: string
      item_type: string
    }>
  } | null
}

interface LogisticsClientProps {
  initialRecords: DatabaseLogisticsRecord[]
  initialOrders: any[]
}

export function LogisticsClient({ initialRecords, initialOrders }: LogisticsClientProps) {
  const router = useRouter()
  const { userRole } = useSourcing()
  const searchParams = useSearchParams()
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>((searchParams.get('subtab') as 'overview' | 'workplace') || 'overview')
  const [overviewMode, setOverviewMode] = useState<'analytics' | 'kanban'>('analytics')
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [sidebarOrderSearch, setSidebarOrderSearch] = useState('')

  // Filter orders based on sidebar search query
  const sidebarFilteredOrders = initialOrders.filter((order) => {
    return (
      order.order_code.toLowerCase().includes(sidebarOrderSearch.toLowerCase()) ||
      (order.order_items && order.order_items.some((item: any) => item.item_name.toLowerCase().includes(sidebarOrderSearch.toLowerCase())))
    )
  })

  const subtabParam = searchParams.get('subtab')

  useEffect(() => {
    if (subtabParam === 'overview' || subtabParam === 'workplace') {
      setSubtab(subtabParam)
    } else {
      setSubtab('overview')
    }
  }, [subtabParam])

  const handleTabChange = (val: 'overview' | 'workplace') => {
    setSubtab(val)
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?subtab=${val}`
      window.history.pushState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
    }
  }

  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  const handleStageChange = async (orderId: string, newStage: string) => {
    const result = await updateOrderStageAction(orderId, newStage)
    if (!result.success) {
      alert(`Failed to update order stage: ${result.error}`)
      return false
    }
    return true
  }
  const [matchingRecordId, setMatchingRecordId] = useState<string | null>(null)

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

      {errorMessage && (
        <div className="p-3 bg-red-50 text-red-650 rounded-xl text-xs font-medium border border-red-200 flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Controls Row */}
      {subtab === 'overview' && (
        <div className="flex justify-end items-center gap-4">
          <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
            <Button
              variant={overviewMode === 'analytics' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setOverviewMode('analytics')}
              className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
                overviewMode === 'analytics'
                  ? 'bg-white text-[#5c59e9] shadow-sm dark:bg-slate-800 dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <span>Analytics View</span>
            </Button>
            <Button
              variant={overviewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setOverviewMode('kanban')}
              className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
                overviewMode === 'kanban'
                  ? 'bg-white text-[#5c59e9] shadow-sm dark:bg-slate-800 dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <span>Kanban Board</span>
            </Button>
          </div>
        </div>
      )}

      {/* Subtab Switcher */}
      <Tabs value={subtab} className="w-full space-y-6">

        <TabsContent value="overview" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">

          {overviewMode === 'analytics' ? (
            <div className="space-y-6 animate-in fade-in duration-300">
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
          ) : (
            <div className="animate-in fade-in duration-300">
              <KanbanBoard
                orders={initialOrders}
                isStaffOrAdmin={isStaffOrAdmin}
                onCardClick={(order) => {
                  setSelectedOrder(order)
                  setSubtab('workplace')
                }}
                onStageChange={handleStageChange}
              />
            </div>
          )}
        </TabsContent>

      <TabsContent value="workplace" className="mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0 animate-in fade-in duration-300">
        <div className="grid lg:grid-cols-[280px_1fr] -mx-8 -mt-8 -mb-8 h-[calc(100vh-4rem)] overflow-hidden">
          {/* Left column: Purchase Orders sidebar */}
          <div className="border-r border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-955 flex flex-col h-full overflow-hidden">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-2 bg-slate-50/50 dark:bg-slate-900/10">
              {/* Row 1: Title */}
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Purchase Orders</h3>
              </div>

              {/* Row 2: Search Input */}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search orders..."
                  value={sidebarOrderSearch}
                  onChange={(e) => setSidebarOrderSearch(e.target.value)}
                  className="w-full pl-7.5 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {sidebarFilteredOrders.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">
                  No orders found.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {sidebarFilteredOrders.map(order => {
                    const recordsCount = initialRecords.filter(r => r.po_number === order.order_code).length;
                    return (
                      <li key={order.id}>
                        <button
                          onClick={() => {
                            if (selectedOrder?.id === order.id) {
                              setSelectedOrder(null)
                            } else {
                              setSelectedOrder(order)
                            }
                          }}
                          className={`w-full text-left px-3 py-3 flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                            selectedOrder?.id === order.id
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/20'
                              : 'hover:bg-slate-50/60 dark:hover:bg-slate-900/10'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText size={13} className={selectedOrder?.id === order.id ? 'text-[#5c59e9] dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
                            <span className={`text-xs font-bold truncate ${
                              selectedOrder?.id === order.id
                                ? 'text-[#5c59e9] dark:text-indigo-400'
                                : 'text-slate-800 dark:text-slate-200'
                            }`}>
                              {order.order_code}
                            </span>
                            {(() => {
                              const timelines = order.order_stage_timelines
                              if (!timelines) return null
                              const stages = ['Logistic']
                              const isPending = stages.some(stageName => {
                                const match = timelines.find((t: any) => t.stage_name.toLowerCase() === stageName.toLowerCase())
                                return !match || !match.estimated_start_date || !match.estimated_end_date
                              })
                              if (!isPending) return null
                              return (
                                <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-955/20 dark:text-amber-400 shrink-0 select-none">
                                  Setup
                                </span>
                              )
                            })()}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {recordsCount > 0 && (
                              <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[9px] font-bold py-0.5 px-1.5 border border-slate-200/50 dark:border-slate-700/50">
                                {recordsCount}
                              </Badge>
                            )}
                            <ChevronRight size={12} className={selectedOrder?.id === order.id ? 'text-[#5c59e9] dark:text-indigo-400' : 'text-slate-350'} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Right column: main workplace card */}
          <div className="flex flex-col h-full overflow-y-auto p-4 bg-slate-50/30 dark:bg-slate-955/10 space-y-6">
            {!selectedOrder ? (
              <Card className="border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-xl">
                <CardContent className="p-12 flex flex-col items-center justify-center gap-3 text-center">
                  <Truck size={36} className="text-slate-200 dark:text-slate-700 animate-pulse" />
                  <p className="text-sm text-slate-450 dark:text-slate-500 font-semibold">Select an order from the sidebar to begin</p>
                </CardContent>
              </Card>
            ) : (() => {
              const orderRecords = initialRecords.filter(r => r.po_number === selectedOrder.order_code);
              return (
                <>
                  <TimelineProposalCard
                    orderId={selectedOrder.id}
                    orderCode={selectedOrder.order_code}
                    orderDate={selectedOrder.order_date || ''}
                    estimatedDeliveryDate={selectedOrder.estimated_delivery_date || ''}
                    userDepartment="logistics"
                    existingTimelines={selectedOrder.order_stage_timelines || []}
                  />
                  <Card className="border-slate-200/60 dark:border-slate-800 flex flex-col overflow-hidden bg-white dark:bg-slate-900 shadow-sm rounded-xl">
                  <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Truck size={16} className="text-[#5c59e9]" />
                      <span>3-Way Match Verification Grid — {selectedOrder.order_code}</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Matches Purchase Order (PO), Goods Receipt (GR), and Vendor Invoice. Quantities must match within 2% tolerance.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0 flex-1 overflow-y-auto">
                    {orderRecords.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 text-xs italic">
                        No logistics records currently waiting for match for this order.
                      </div>
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
                        items={orderRecords}
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
                              ) : (() => {
                                const matchingItem = r.orders?.order_items?.find(item => item.item_name === r.product_name)
                                const isProduct = matchingItem ? matchingItem.item_type === 'PRODUCT' : r.orders?.order_type === 'PRODUCT'
                                if (isProduct) {
                                  return (
                                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1.5 py-1.5">
                                      <CheckCircle2 size={13} className="text-emerald-500" />
                                      <span>Order Closed</span>
                                    </span>
                                  )
                                }
                                return (
                                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center justify-end gap-1.5 py-1.5">
                                    <TrendingUp size={13} className="text-blue-500" />
                                    <span>Transferred to Production</span>
                                  </span>
                                )
                              })()}
                            </td>
                          </tr>
                        )}
                      />
                    )}
                  </CardContent>
                </Card>
                </>
              );
            })()}
          </div>
        </div>
      </TabsContent>
      </Tabs>
    </div>
  )
}
