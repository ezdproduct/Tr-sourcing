'use client'

import React, { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSourcing } from '@/providers/sourcing-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/ui/data-table'
import { updateOrderStageAction } from '@/app/(dashboard)/orders/actions'
import { KanbanBoard } from '@/app/(dashboard)/orders/kanban-board'
import {
  Anchor,
  FileText,
  PlusCircle,
  TrendingDown,
  CheckCircle,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Loader2,
  ChevronRight,
  Globe,
  Search
} from 'lucide-react'
import { createInspectionAction } from './actions'

export interface DatabaseInspectionRecord {
  id: string
  order_id: string
  port_name: string
  container_number: string
  seal_number: string
  defect_rate: number
  verdict: 'Approved' | 'Rejected'
  inspector: string
  date_checked: string
  verified_quantity?: number | null
  quality_status?: 'PASS' | 'FAIL' | null
  orders?: {
    order_code: string
  }
}

export interface ActiveOrderForInspection {
  id: string
  order_code: string
  order_items?: Array<{
    id: string
    item_name: string
    quantity: number
    uom?: string
  }>
}

export interface SidebarOrderRecord {
  id: string
  order_code: string
  order_type?: string | null
  stage: string
  order_date?: string | null
}

interface InspectionClientProps {
  initialInspections: DatabaseInspectionRecord[]
  activeOrders: ActiveOrderForInspection[]
  initialOrders: SidebarOrderRecord[]
}

const getStageBadge = (stage: string) => {
  if (!stage) return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
  switch (stage.toLowerCase()) {
    case 'sourcing':
      return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900'
    case 'arrived - awaiting inspection':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900'
    case 'inspection passed':
    case 'materials in stock':
    case 'delivered / completed':
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900'
    case 'po confirmed':
      return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900'
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
  }
}

export function InspectionClient({ initialInspections, activeOrders, initialOrders }: InspectionClientProps) {
  const { userRole } = useSourcing()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>((searchParams.get('subtab') as 'overview' | 'workplace') || 'overview')
  const [overviewMode, setOverviewMode] = useState<'analytics' | 'kanban'>('analytics')
  const [viewMode, setViewMode] = useState<'all' | 'order'>('all')
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Sync subtab when URL searchParams change (e.g., sidebar link click without unmount)
  useEffect(() => {
    const tab = searchParams.get('subtab')
    if (tab === 'overview' || tab === 'workplace') {
      setSubtab(tab)
    }
  }, [searchParams])

  const handleTabChange = (val: 'overview' | 'workplace') => {
    setSubtab(val)
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?subtab=${val}`
      window.history.pushState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
    }
  }
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [sidebarOrderSearch, setSidebarOrderSearch] = useState('')

  const filteredOrders = initialOrders.filter(order => {
    const query = sidebarOrderSearch.toLowerCase()
    return order.order_code.toLowerCase().includes(query)
  })
  const [selectedOrder, setSelectedOrder] = useState<ActiveOrderForInspection | null>(null)
  const [isInspectionDialogOpen, setIsInspectionDialogOpen] = useState(false)
  const [defectNotes, setDefectNotes] = useState('')

  const [newInsp, setNewInsp] = useState({
    portName: 'Cat Lai Port, HCMC',
    containerNumber: '',
    sealNumber: '',
    defectRate: '0.80',
    inspector: 'John Carter'
  })
  const [verifiedQuantity, setVerifiedQuantity] = useState('')
  const [qualityStatus, setQualityStatus] = useState<'PASS' | 'FAIL'>('PASS')

  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  const handleStageChange = async (orderId: string, newStage: string) => {
    const result = await updateOrderStageAction(orderId, newStage)
    if (!result.success) {
      alert(`Failed to update order stage: ${result.error}`)
      return false
    }
    return true
  }

  const handleCreateInspection = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderId || !newInsp.containerNumber || !newInsp.sealNumber || !newInsp.defectRate || !newInsp.inspector || !verifiedQuantity) return

    startTransition(async () => {
      setErrorMessage(null)
      const res = await createInspectionAction({
        orderId: selectedOrderId,
        orderItemId: selectedOrder?.order_items?.[0]?.id || '',
        portName: newInsp.portName,
        containerNumber: newInsp.containerNumber,
        sealNumber: newInsp.sealNumber,
        defectRate: Number(newInsp.defectRate),
        inspector: newInsp.inspector,
        verifiedQuantity: Number(verifiedQuantity),
        qualityStatus: qualityStatus,
        defectNotes: defectNotes
      })
      if (res.success) {
        setSelectedOrderId('')
        setVerifiedQuantity('')
        setQualityStatus('PASS')
        setDefectNotes('')
        setNewInsp({ portName: 'Cat Lai Port, HCMC', containerNumber: '', sealNumber: '', defectRate: '0.80', inspector: 'John Carter' })
        setIsInspectionDialogOpen(false)
        setSelectedOrder(null)
        router.refresh()
      } else {
        setErrorMessage(res.error || 'Failed to file inspection report')
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

      {/* Subtab Switcher */}
      <Tabs value={subtab} onValueChange={(v) => handleTabChange(v as 'overview' | 'workplace')} className="w-full space-y-6">

        <TabsContent value="overview" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/10 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/60">
            <div className="space-y-0.5">
              <h2 className="text-sm font-bold text-slate-950 dark:text-slate-50">Inspection Overview</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                Monitor key metrics and track purchase order lifecycle stages in real-time.
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-955 p-1 rounded-xl self-start sm:self-auto border border-slate-200/50 dark:border-slate-800/80">
              <Button
                variant={overviewMode === 'analytics' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setOverviewMode('analytics')}
                className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
                  overviewMode === 'analytics'
                    ? 'bg-white text-[#5c59e9] shadow-sm dark:bg-slate-900 dark:text-white'
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
                    ? 'bg-white text-[#5c59e9] shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                <span>Kanban Board</span>
              </Button>
            </div>
          </div>

          {overviewMode === 'analytics' ? (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* KPI Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inspected Shipments</CardTitle>
                    <Anchor className="h-4 w-4 text-indigo-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">{initialInspections.length}</div>
                    <p className="text-[10px] text-slate-400 mt-1">Total cargo containers checked at port</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">AQL Pass Rate</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {(() => {
                        const approved = initialInspections.filter(i => i.verdict === 'Approved').length
                        if (initialInspections.length === 0) return '100%'
                        return `${((approved / initialInspections.length) * 100).toFixed(0)}%`
                      })()}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Defects below AQL 2.5% threshold</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Defect Rate</CardTitle>
                    <TrendingDown className="h-4 w-4 text-indigo-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {(() => {
                        if (initialInspections.length === 0) return '0%'
                        const sum = initialInspections.reduce((total, i) => total + Number(i.defect_rate), 0)
                        return `${(sum / initialInspections.length).toFixed(2)}%`
                      })()}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Measured cargo quality deviation</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reports Filed</CardTitle>
                    <FileText className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">{initialInspections.length}</div>
                    <p className="text-[10px] text-slate-400 mt-1">Digitized bill of lading documents</p>
                  </CardContent>
                </Card>
              </div>

              {/* Port split & Recent inspections */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Loading Volumes by Port</CardTitle>
                    <CardDescription className="text-xs">Cargo allocation split across key transit ports</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { label: 'Cat Lai Port, HCMC', pct: '80%' },
                      { label: 'Hai Phong Port, Hai Phong', pct: '60%' },
                      { label: 'Da Nang Port, Da Nang', pct: '40%' }
                    ].map((item, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                          <span className="text-[#5c59e9] dark:text-indigo-400">{item.pct}</span>
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
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Recent Loading Inspection Logs</CardTitle>
                    <CardDescription className="text-xs">Latest port checks filed by logistics agents</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {initialInspections.length === 0 ? (
                      <p className="text-xs text-slate-400">No inspections logged yet.</p>
                    ) : (
                      initialInspections.slice(0, 3).map((item, idx) => (
                        <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            item.verdict === 'Approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-450'
                          }`}>
                            {item.container_number}
                          </span>
                          <div className="flex-1 space-y-0.5">
                            <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                              Defect: {Number(item.defect_rate).toFixed(2)}% at {item.port_name}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              Checked by {item.inspector} on {item.date_checked}
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
                  // In Inspection, select order in workplace
                  const matchingActive = activeOrders.find(o => o.id === order.id)
                  if (matchingActive) {
                    setSelectedOrderId(order.id)
                    setSelectedOrder(matchingActive)
                    setViewMode('order')
                  }
                  setSubtab('workplace')
                }}
                onStageChange={handleStageChange}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="workplace" className="mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="grid lg:grid-cols-[280px_1fr] -mx-8 -mt-8 -mb-8 h-[calc(100vh-4rem)] overflow-hidden">

            {/* Orders Sidebar */}
            <div className="border-r border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col h-full overflow-hidden">
              <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-1.5">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Purchase Orders</h3>
                </div>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search orders..."
                    value={sidebarOrderSearch}
                    onChange={(e) => setSidebarOrderSearch(e.target.value)}
                    className="w-full pl-7.5 pr-2.5 py-0.5 text-[11px] rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredOrders.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400">
                    No orders found.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredOrders.map(order => {
                      const isSelected = viewMode === 'order' && selectedOrderId === order.id
                      return (
                        <li key={order.id}>
                          <button
                            id={`order-select-${order.id}`}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedOrderId('')
                                setViewMode('all')
                              } else {
                                setSelectedOrderId(order.id)
                                setViewMode('order')
                              }
                            }}
                            className={`w-full text-left px-2.5 py-3 flex items-center justify-between gap-1 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/30'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <FileText size={13} className={isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
                              <span className={`text-xs font-bold truncate ${
                                isSelected
                                  ? 'text-indigo-700 dark:text-indigo-400'
                                  : 'text-slate-800 dark:text-slate-200'
                              }`}>
                                {order.order_code}
                              </span>
                            </div>
                            <ChevronRight size={12} className={isSelected ? 'text-indigo-500' : 'text-slate-300'} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Workplace Content Column */}
            <div className="flex flex-col h-full overflow-y-auto p-3 space-y-6">
              {/* Active Shipments Awaiting Quality Check Checklist */}
              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Active Incoming Shipments</CardTitle>
                  <CardDescription className="text-xs">
                    Checklist of orders marked as ARRIVED - AWAITING INSPECTION. Click to perform inspection.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {(() => {
                    const filteredActive = viewMode === 'all' 
                      ? activeOrders 
                      : activeOrders.filter(o => o.id === selectedOrderId)

                    if (filteredActive.length === 0) {
                      return (
                        <div className="p-8 text-center text-slate-400 text-xs">
                          {viewMode === 'all' 
                            ? 'No orders currently waiting in Awaiting Inspection stage.' 
                            : 'This order is not currently awaiting port inspection.'}
                        </div>
                      )
                    }

                    return (
                      <div className="divide-y divide-slate-150 dark:divide-slate-800">
                        {filteredActive.map((order) => {
                          const mainItem = order.order_items?.[0]
                          const qtyStr = mainItem ? `${mainItem.quantity} ${mainItem.uom || 'units'}` : 'N/A'
                          const prodName = mainItem?.item_name || 'Goods'

                          return (
                            <div key={order.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/40 dark:hover:bg-slate-900/10">
                              <div className="space-y-1">
                                <span className="font-mono text-xs font-bold text-indigo-650 dark:text-indigo-400">
                                  {order.order_code}
                                </span>
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                  Product: <span className="font-semibold">{prodName}</span> | Target: <span className="font-semibold">{qtyStr}</span>
                                </div>
                              </div>
                              <Button
                                onClick={() => {
                                  setSelectedOrderId(order.id)
                                  setSelectedOrder(order)
                                  const qtySum = order.order_items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0
                                  setVerifiedQuantity(qtySum > 0 ? String(qtySum) : '')
                                  setQualityStatus('PASS')
                                  setDefectNotes('')
                                  setNewInsp({
                                    portName: 'Cat Lai Port, HCMC',
                                    containerNumber: '',
                                    sealNumber: '',
                                    defectRate: '0.80',
                                    inspector: 'John Carter'
                                  })
                                  setIsInspectionDialogOpen(true)
                                }}
                                size="sm"
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs py-1.5 h-8 rounded-lg cursor-pointer"
                              >
                                Inspect Shipment
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>

              {/* Inspection List Table */}
              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                  <CardTitle className="text-base font-bold">Port Inspection Records</CardTitle>
                  <CardDescription className="text-xs">Container seal audits. Defect limit AQL threshold is 2.5% max.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {(() => {
                    const filteredRecords = viewMode === 'all'
                      ? initialInspections
                      : initialInspections.filter(r => r.order_id === selectedOrderId)

                    return (
                      <DataTable
                        headers={[
                          'Port',
                          'Container Details',
                          'Seal Number',
                          'Measured Defect Rate',
                          'Verification Date',
                          'Verified Qty',
                          'Quality Status',
                          'AQL Verdict',
                          <span key="doc" className="sr-only">Actions</span>
                        ]}
                        items={filteredRecords}
                        renderRow={(i) => (
                          <tr key={i.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                            <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                              <div className="flex items-center gap-1.5">
                                <Anchor size={14} className="text-[#5c59e9]" />
                                <span>{i.port_name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-mono">
                              {i.container_number}
                            </td>
                            <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-mono">
                              {i.seal_number}
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900 dark:text-white">
                                {Number(i.defect_rate).toFixed(2)}%
                              </div>
                              <div className="text-[10px] text-slate-400">Limit: 2.50%</div>
                            </td>
                            <td className="px-6 py-4 text-slate-500">{i.date_checked}</td>
                            <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-semibold">
                              {i.verified_quantity !== null && i.verified_quantity !== undefined ? i.verified_quantity.toLocaleString() : 'N/A'}
                            </td>
                            <td className="px-6 py-4">
                              {i.quality_status === 'PASS' ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400">
                                  PASS
                                </Badge>
                              ) : i.quality_status === 'FAIL' ? (
                                <Badge className="bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-450">
                                  FAIL
                                </Badge>
                              ) : (
                                <span className="text-slate-400">N/A</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {i.verdict === 'Approved' ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400">
                                  APPROVED
                                </Badge>
                              ) : (
                                <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-450">
                                  REJECTED
                                </Badge>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5">
                                <FileText size={12} className="text-indigo-500" />
                                <span>View doc</span>
                              </Button>
                            </td>
                          </tr>
                        )}
                      />
                    )
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Inspection Dialog Modal */}
            {isInspectionDialogOpen && selectedOrder && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in-50 duration-200">
                <Card className="w-full max-w-lg border-slate-200 dark:border-slate-800 shadow-xl animate-in zoom-in-95 duration-200">
                  <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3.5">
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Anchor className="text-indigo-500 h-5 w-5" />
                      <span>Perform Port Quality Inspection</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Verify shipment details, inspect for defects, and log AQL verdict.
                    </CardDescription>
                  </CardHeader>
                  <form onSubmit={handleCreateInspection}>
                    <CardContent className="space-y-4 pt-4 max-h-[60vh] overflow-y-auto">
                      <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-900">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Order Code</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedOrder.order_code}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Ordered Product</span>
                          <span className="font-bold text-slate-950 dark:text-white">
                            {selectedOrder.order_items?.map(item => `${item.quantity} ${item.uom || 'units'} ${item.item_name}`).join(', ') || 'N/A'}
                          </span>
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="port" className="text-xs font-semibold">Loading Port</Label>
                          <select
                            id="port"
                            value={newInsp.portName}
                            onChange={e => setNewInsp({ ...newInsp, portName: e.target.value })}
                            className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950 text-slate-700 dark:text-slate-350"
                          >
                            <option value="Cat Lai Port, HCMC">Cat Lai Port, HCMC</option>
                            <option value="Hai Phong Port, Hai Phong">Hai Phong Port, Hai Phong</option>
                            <option value="Da Nang Port, Da Nang">Da Nang Port, Da Nang</option>
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="inspectorName" className="text-xs font-semibold">Inspector Name</Label>
                          <Input
                            id="inspectorName"
                            placeholder="e.g. John Carter"
                            value={newInsp.inspector}
                            onChange={e => setNewInsp({ ...newInsp, inspector: e.target.value })}
                            required
                            className="h-9 text-xs rounded-lg"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="container" className="text-xs font-semibold">Container Number</Label>
                          <Input
                            id="container"
                            placeholder="e.g. TRSU-102948-2"
                            value={newInsp.containerNumber}
                            onChange={e => setNewInsp({ ...newInsp, containerNumber: e.target.value })}
                            required
                            className="h-9 text-xs rounded-lg"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="seal" className="text-xs font-semibold">Seal Number</Label>
                          <Input
                            id="seal"
                            placeholder="e.g. SL-9921"
                            value={newInsp.sealNumber}
                            onChange={e => setNewInsp({ ...newInsp, sealNumber: e.target.value })}
                            required
                            className="h-9 text-xs rounded-lg"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="defect" className="text-xs font-semibold">Measured Defect Rate (%)</Label>
                          <Input
                            id="defect"
                            type="number"
                            step="0.01"
                            placeholder="e.g. 0.80"
                            value={newInsp.defectRate}
                            onChange={e => setNewInsp({ ...newInsp, defectRate: e.target.value })}
                            required
                            className="h-9 text-xs rounded-lg"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="verifiedQuantity" className="text-xs font-semibold flex items-center justify-between">
                            <span>Verified Quantity</span>
                            <span className="text-[10px] text-rose-500 font-medium">Required</span>
                          </Label>
                          <Input
                            id="verifiedQuantity"
                            type="number"
                            placeholder="e.g. 5000"
                            value={verifiedQuantity}
                            onChange={e => setVerifiedQuantity(e.target.value)}
                            required
                            className="h-9 text-xs rounded-lg"
                          />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor="qualityStatus" className="text-xs font-semibold">Quality Status Verdict</Label>
                          <select
                            id="qualityStatus"
                            value={qualityStatus}
                            onChange={e => setQualityStatus(e.target.value as 'PASS' | 'FAIL')}
                            className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950 text-slate-700 dark:text-slate-350"
                          >
                            <option value="PASS">PASS / APPROVED</option>
                            <option value="FAIL">FAIL / REJECTED (Dispute Flagged)</option>
                          </select>
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                          <Label htmlFor="defectNotes" className="text-xs font-semibold">Defect Notes / Remarks</Label>
                          <textarea
                            id="defectNotes"
                            placeholder="Add comments about packing, damages, or discrepancies..."
                            value={defectNotes}
                            onChange={e => setDefectNotes(e.target.value)}
                            className="flex min-h-[70px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950 text-slate-700 dark:text-slate-350"
                          />
                        </div>
                      </div>
                    </CardContent>
                    <div className="flex justify-end gap-2 p-4 border-t border-slate-100 dark:border-slate-800">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsInspectionDialogOpen(false)
                          setSelectedOrder(null)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={isPending}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                      >
                        {isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
                        <span>Submit Inspection Report</span>
                      </Button>
                    </div>
                  </form>
                </Card>
              </div>
            )}

          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
