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
import { updateOrderStageAction } from '@/app/(dashboard)/orders/actions'
import { KanbanBoard } from '@/app/(dashboard)/orders/kanban-board'
import {
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  Layers,
  CheckCircle,
  FileText,
  Loader2,
  Globe,
  ChevronRight,
  Search
} from 'lucide-react'
import { startProductionAssemblyAction, finalizeProductionAndCloseOrderAction } from './actions'
import { TimelineProposalCard } from '@/components/timeline-proposal-card'

export interface DatabaseProductionBatch {
  id: string
  order_id: string
  target_output_quantity: number
  current_assembled_quantity: number
  production_status: 'PENDING_MATERIALS' | 'READY_TO_ASSEMBLE' | 'IN_PROGRESS' | 'COMPLETED'
  production_notes?: string | null
  updated_at: string
  orders?: {
    order_code: string
    order_items?: Array<{
      item_name: string
    }>
  } | null
}

interface ProductionClientProps {
  initialBatches: DatabaseProductionBatch[]
  initialOrders: any[]
}

export function ProductionClient({ initialBatches, initialOrders }: ProductionClientProps) {
  const { userRole, userDepartment } = useSourcing()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>((searchParams.get('subtab') as 'overview' | 'workplace') || 'overview')
  const [overviewMode, setOverviewMode] = useState<'analytics' | 'kanban'>('analytics')
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  // Dialog / Modal state
  const [closeModalOpen, setCloseModalOpen] = useState(false)
  const [activeBatch, setActiveBatch] = useState<DatabaseProductionBatch | null>(null)
  const [actualQty, setActualQty] = useState('')
  const [notes, setNotes] = useState('')

  const [startModalOpen, setStartModalOpen] = useState(false)
  const [batchToStart, setBatchToStart] = useState<DatabaseProductionBatch | null>(null)

  const [viewMode, setViewMode] = useState<'all' | 'batch'>('all')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [sidebarBatchSearch, setSidebarBatchSearch] = useState('')

  const filteredBatches = initialBatches.filter(batch => {
    const query = sidebarBatchSearch.toLowerCase()
    const code = (batch.orders?.order_code || '').toLowerCase()
    return code.includes(query)
  })
  const selectedBatch = initialBatches.find(b => b.id === selectedBatchId) || null

  const isWriteAllowed = userRole === 'admin' || userRole === 'boss' || userDepartment === 'production' || userDepartment === 'sourcing'
  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  const handleStageChange = async (orderId: string, newStage: string) => {
    const result = await updateOrderStageAction(orderId, newStage)
    if (!result.success) {
      alert(`Failed to update order stage: ${result.error}`)
      return false
    }
    return true
  }

  // Summary Metrics
  const activeLinesCount = initialBatches.filter(b => b.production_status === 'IN_PROGRESS').length
  const pendingMaterialsCount = initialBatches.filter(b => b.production_status === 'PENDING_MATERIALS' || b.production_status === 'READY_TO_ASSEMBLE').length
  const completedBatchesCount = initialBatches.filter(b => b.production_status === 'COMPLETED').length

  const handleStartAssembly = (batch: DatabaseProductionBatch) => {
    setBatchToStart(batch)
    setStartModalOpen(true)
  }

  const confirmStartAssembly = () => {
    if (!batchToStart) return
    startTransition(async () => {
      setErrorMessage(null)
      const res = await startProductionAssemblyAction(batchToStart.id)
      if (res.success) {
        setStartModalOpen(false)
        setBatchToStart(null)
        router.refresh()
      } else {
        setErrorMessage(res.error || 'Failed to start assembly line')
      }
    })
  }

  const handleOpenCloseModal = (batch: DatabaseProductionBatch) => {
    setActiveBatch(batch)
    setActualQty(String(batch.target_output_quantity)) // default to target
    setNotes(batch.production_notes || '')
    setCloseModalOpen(true)
  }

  const handleCloseOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeBatch || actualQty === '') return

    startTransition(async () => {
      setErrorMessage(null)
      const res = await finalizeProductionAndCloseOrderAction(activeBatch.id, Number(actualQty), notes)
      if (res.success) {
        setCloseModalOpen(false)
        setActiveBatch(null)
        setActualQty('')
        setNotes('')
        router.refresh()
      } else {
        setErrorMessage(res.error || 'Failed to finalize production and close order')
      }
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_MATERIALS':
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400">
            Pending Materials
          </Badge>
        )
      case 'READY_TO_ASSEMBLE':
        return (
          <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900">
            Ready to Assemble
          </Badge>
        )
      case 'IN_PROGRESS':
        return (
          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900 animate-pulse">
            In Progress
          </Badge>
        )
      case 'COMPLETED':
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900">
            Completed
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getStatusBadgeMini = (status: string) => {
    switch (status) {
      case 'PENDING_MATERIALS':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-slate-105 text-slate-600 dark:bg-slate-800 dark:text-slate-450">
            Pending
          </span>
        )
      case 'READY_TO_ASSEMBLE':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-750 dark:bg-blue-950/40 dark:text-blue-400">
            Ready
          </span>
        )
      case 'IN_PROGRESS':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 animate-pulse">
            Running
          </span>
        )
      case 'COMPLETED':
        return (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            Completed
          </span>
        )
      default:
        return <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">{status}</span>
    }
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
              {/* KPI Summary Grid */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Assembly Lines</CardTitle>
                    <TrendingUp className="h-4 w-4 text-indigo-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {activeLinesCount}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Manufacturing lines currently running assembly</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Materials</CardTitle>
                    <Clock className="h-4 w-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {pendingMaterialsCount}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Batches awaiting inbound warehouse stock-in</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completed Batches</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {completedBatchesCount}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Finished product runs closed &amp; closed orders</p>
                  </CardContent>
                </Card>
              </div>

              {/* Layout Overview Charts */}
              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Assembly Line Completion Progress</CardTitle>
                    <CardDescription className="text-xs">Visualizing completed units against original target metrics</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {initialBatches.length === 0 ? (
                      <p className="text-xs text-slate-400">No active batches registered.</p>
                    ) : (
                      initialBatches.map((b) => {
                        const item = b.orders?.order_items?.[0]?.item_name || 'Materials'
                        const code = b.orders?.order_code || 'ORD'
                        const pct = Math.min(100, Math.round((b.current_assembled_quantity / b.target_output_quantity) * 100))
                        return (
                          <div key={b.id} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs font-semibold">
                              <span className="text-slate-700 dark:text-slate-300">{item} ({code})</span>
                              <span className="text-indigo-600 dark:text-indigo-400">{pct}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full dark:bg-slate-900">
                              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader>
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Recent Activities &amp; Logs</CardTitle>
                    <CardDescription className="text-xs">Status details and logs of current assembly lines</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {initialBatches.length === 0 ? (
                      <p className="text-xs text-slate-400">No active batch updates found.</p>
                    ) : (
                      initialBatches.slice(0, 5).map((b) => (
                        <div key={b.id} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900">
                            {b.orders?.order_code || 'PO'}
                          </span>
                          <div className="flex-1 space-y-0.5 text-xs">
                            <div className="flex justify-between font-semibold">
                              <span className="text-slate-800 dark:text-slate-200">
                                {b.orders?.order_items?.[0]?.item_name || 'Materials Run'}
                              </span>
                              {getStatusBadge(b.production_status)}
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Assembled: {b.current_assembled_quantity} / {b.target_output_quantity} units
                            </p>
                            {b.production_notes && (
                              <p className="text-[10px] italic text-slate-500 bg-slate-50 dark:bg-slate-955/25 p-1.5 rounded mt-1 border border-slate-100 dark:border-slate-900">
                                Notes: {b.production_notes}
                              </p>
                            )}
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
                  // In Production, select batch in workplace if possible
                  setSubtab('workplace')
                }}
                onStageChange={handleStageChange}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="workplace" className="mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="grid lg:grid-cols-[280px_1fr] -mx-8 -mt-8 -mb-8 h-[calc(100vh-4rem)] overflow-hidden">

            {/* Production Batches Sidebar */}
            <div className="border-r border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col h-full overflow-hidden">
              <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-1.5">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white">Production Runs</h3>
                </div>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search batches..."
                    value={sidebarBatchSearch}
                    onChange={(e) => setSidebarBatchSearch(e.target.value)}
                    className="w-full pl-7.5 pr-2.5 py-0.5 text-[11px] rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredBatches.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400">
                    No batches found.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredBatches.map(batch => {
                      const code = batch.orders?.order_code || 'ORD'
                      const isSelected = viewMode === 'batch' && selectedBatchId === batch.id
                      return (
                        <li key={batch.id}>
                          <button
                            id={`batch-select-${batch.id}`}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedBatchId('')
                                setViewMode('all')
                              } else {
                                setSelectedBatchId(batch.id)
                                setViewMode('batch')
                              }
                            }}
                            className={`w-full text-left px-2.5 py-3 flex items-center justify-between gap-1 transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50 dark:bg-indigo-950/30'
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Layers size={13} className={isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
                              <span className={`text-xs font-bold truncate font-mono ${
                                isSelected
                                  ? 'text-indigo-700 dark:text-indigo-400'
                                  : 'text-slate-800 dark:text-slate-200'
                              }`}>
                                {code}
                              </span>
                              {(() => {
                                const order = initialOrders.find(o => o.id === batch.order_id)
                                const timelines = order?.order_stage_timelines
                                if (!timelines) return null
                                const stages = ['Production']
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
                            <ChevronRight size={12} className={isSelected ? 'text-indigo-500' : 'text-slate-300'} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Active Workspace / Content */}
            <div className="flex flex-col h-full overflow-y-auto p-3 space-y-6">
              {(() => {
                if (viewMode === 'all') return null
                const selectedBatch = initialBatches.find(b => b.id === selectedBatchId)
                if (!selectedBatch) return null
                const selectedOrderOfBatch = initialOrders.find(o => o.id === selectedBatch.order_id)
                if (!selectedOrderOfBatch) return null

                return (
                  <TimelineProposalCard
                    orderId={selectedOrderOfBatch.id}
                    orderCode={selectedOrderOfBatch.order_code}
                    orderDate={selectedOrderOfBatch.order_date || ''}
                    estimatedDeliveryDate={selectedOrderOfBatch.estimated_delivery_date || ''}
                    userDepartment="production"
                    existingTimelines={selectedOrderOfBatch.order_stage_timelines || []}
                  />
                )
              })()}
              {viewMode === 'all' ? (
                /* Active Batches Table */
                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                    <CardTitle className="text-base font-bold">Active Batches Checklist</CardTitle>
                    <CardDescription className="text-xs">Internal production runs initiated by incoming procurement materials</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-bold uppercase dark:border-slate-800 dark:bg-slate-900/30">
                            <th className="px-6 py-3.5">Order Code</th>
                            <th className="px-6 py-3.5">Procured Material</th>
                            <th className="px-6 py-3.5">Output Progress</th>
                            <th className="px-6 py-3.5">Target Output</th>
                            <th className="px-6 py-3.5">Status</th>
                            <th className="px-6 py-3.5 text-right"><span className="sr-only">Actions</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {initialBatches.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="text-center p-12 text-slate-400">
                                No internal production runs logged.
                              </td>
                            </tr>
                          ) : (
                            initialBatches.map((b) => {
                              const pct = Math.min(100, Math.round((b.current_assembled_quantity / b.target_output_quantity) * 100))
                              return (
                                <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                                  <td className="px-6 py-4 font-semibold text-indigo-600 dark:text-indigo-400 font-mono">
                                    {b.orders?.order_code || 'N/A'}
                                  </td>
                                  <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                                    {b.orders?.order_items?.[0]?.item_name || 'Materials'}
                                  </td>
                                  <td className="px-6 py-4">
                                    {b.production_status === 'IN_PROGRESS' || b.production_status === 'COMPLETED' ? (
                                      <div className="space-y-1 w-44">
                                        <div className="flex justify-between text-[10px] font-bold">
                                          <span>{b.current_assembled_quantity} built</span>
                                          <span>{pct}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-slate-100 rounded-full dark:bg-slate-850">
                                          <div
                                            className={`h-full rounded-full transition-all duration-300 ${
                                              b.production_status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-[#5c59e9]'
                                            }`}
                                            style={{ width: `${pct}%` }}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-slate-400">Not started</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 font-bold text-slate-950 dark:text-white">
                                    {b.target_output_quantity} units
                                  </td>
                                  <td className="px-6 py-4">
                                    {getStatusBadge(b.production_status)}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    {b.production_status === 'READY_TO_ASSEMBLE' && (
                                      <Button
                                        size="sm"
                                        onClick={() => handleStartAssembly(b)}
                                        disabled={isPending || !isWriteAllowed}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1"
                                      >
                                        <Play size={12} />
                                        <span>Start Assembly</span>
                                      </Button>
                                    )}
                                    {b.production_status === 'IN_PROGRESS' && (
                                      <Button
                                        size="sm"
                                        onClick={() => handleOpenCloseModal(b)}
                                        disabled={isPending || !isWriteAllowed}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                      >
                                        <span>✏️ Log Output &amp; Close</span>
                                      </Button>
                                    )}
                                    {b.production_status === 'PENDING_MATERIALS' && (
                                      <span className="text-[10px] text-slate-400 italic">Awaiting Material Logistics</span>
                                    )}
                                    {b.production_status === 'COMPLETED' && (
                                      <span className="text-[10px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
                                        <CheckCircle size={12} /> Order Closed
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                /* Detailed Batch Workplace */
                selectedBatch && (
                  <Card className="border-slate-200/60 dark:border-slate-800">
                    <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-base font-bold flex items-center gap-2">
                            <span>Production Run Details</span>
                            <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded text-xs">
                              {selectedBatch.orders?.order_code || 'ORD'}
                            </span>
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Manage and track the internal manufacturing process for this batch.
                          </CardDescription>
                        </div>
                        {getStatusBadge(selectedBatch.production_status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-6">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-900 space-y-1">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Procured Material</span>
                          <span className="font-bold text-slate-850 dark:text-slate-250 text-sm">
                            {selectedBatch.orders?.order_items?.[0]?.item_name || 'Materials'}
                          </span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-900 space-y-1">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Target Output</span>
                          <span className="font-bold text-slate-950 dark:text-white text-sm">
                            {selectedBatch.target_output_quantity} units
                          </span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-100 dark:border-slate-900 space-y-1">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Assembled</span>
                          <span className="font-bold text-slate-950 dark:text-white text-sm">
                            {selectedBatch.current_assembled_quantity} units
                          </span>
                        </div>
                      </div>

                      {/* Progress bar visual */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                          <span>Output Progress</span>
                          <span className="text-indigo-600 dark:text-indigo-400">
                            {Math.min(100, Math.round((selectedBatch.current_assembled_quantity / selectedBatch.target_output_quantity) * 100))}%
                          </span>
                        </div>
                        <div className="h-3 w-full bg-slate-100 rounded-full dark:bg-slate-900 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              selectedBatch.production_status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-indigo-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.round((selectedBatch.current_assembled_quantity / selectedBatch.target_output_quantity) * 100))}%` }}
                          />
                        </div>
                      </div>

                      {selectedBatch.production_notes && (
                        <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-150 dark:border-slate-800/80 space-y-1">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Production Log Notes</span>
                          <p className="text-xs italic text-slate-700 dark:text-slate-300">
                            {selectedBatch.production_notes}
                          </p>
                        </div>
                      )}

                      {/* Action trigger section */}
                      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                        <div>
                          <p className="text-xs text-slate-500">
                            {selectedBatch.production_status === 'READY_TO_ASSEMBLE' && "All materials are stocked. Click start to spin up the manufacturing run."}
                            {selectedBatch.production_status === 'IN_PROGRESS' && "Assembly line is currently active. Click log output to finalize production."}
                            {selectedBatch.production_status === 'PENDING_MATERIALS' && "Awaiting inbound logistics. Order matching must be performed first."}
                            {selectedBatch.production_status === 'COMPLETED' && "This production batch has been fully completed and closed."}
                          </p>
                        </div>
                        <div>
                          {selectedBatch.production_status === 'READY_TO_ASSEMBLE' && (
                            <Button
                              onClick={() => handleStartAssembly(selectedBatch)}
                              disabled={isPending || !isWriteAllowed}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-bold cursor-pointer"
                            >
                              <Play size={14} />
                              <span>Start Assembly Line</span>
                            </Button>
                          )}
                          {selectedBatch.production_status === 'IN_PROGRESS' && (
                            <Button
                              onClick={() => handleOpenCloseModal(selectedBatch)}
                              disabled={isPending || !isWriteAllowed}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold cursor-pointer"
                            >
                              <span>✏️ Log Output &amp; Close</span>
                            </Button>
                          )}
                          {selectedBatch.production_status === 'COMPLETED' && (
                            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border-none font-bold py-1.5 px-3 rounded-lg flex items-center gap-1">
                              <CheckCircle size={13} /> Order Closed
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Log Output & Close Order Modal Dialog */}
      {closeModalOpen && activeBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in-50 duration-200">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 shadow-xl animate-in zoom-in-95 duration-200">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3.5">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="text-indigo-500 h-5 w-5" />
                <span>Log Output &amp; Close Order</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Complete internal assembly and finalize material order lifecycle
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCloseOrderSubmit}>
              <CardContent className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-900">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Order Code</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{activeBatch.orders?.order_code || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Target Output</span>
                    <span className="font-bold text-slate-950 dark:text-white">{activeBatch.target_output_quantity} units</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="actualQty" className="text-xs font-semibold flex items-center justify-between">
                    <span>Actual Assembled Quantity</span>
                    <span className="text-[10px] text-rose-500 font-medium">Required</span>
                  </Label>
                  <Input
                    id="actualQty"
                    type="number"
                    min="0"
                    placeholder="e.g. 100"
                    value={actualQty}
                    onChange={e => setActualQty(e.target.value)}
                    required
                    className="h-9 text-xs rounded-lg bg-white dark:bg-slate-950"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="productionNotes" className="text-xs font-semibold">Production Notes</Label>
                  <textarea
                    id="productionNotes"
                    placeholder="Provide assembly line notes, defect records, or calibration details..."
                    value={notes}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                    className="flex min-h-[80px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
                  />
                </div>
              </CardContent>
              <div className="flex justify-end gap-2 p-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCloseModalOpen(false)
                    setActiveBatch(null)
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                >
                  {isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
                  <span>🎉 Finalize Production &amp; Close Order</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Start Assembly Confirmation Modal */}
      {startModalOpen && batchToStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in-50 duration-200">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 shadow-xl animate-in zoom-in-95 duration-200">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3.5">
              <CardTitle className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Play className="text-indigo-500 h-5 w-5" />
                <span>Start Assembly Line</span>
              </CardTitle>
              <CardDescription className="text-xs">
                Confirm starting the assembly line for this production batch.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Are you ready to spin up the assembly line and start production for this batch?
              </p>
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-900">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Order Code</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{batchToStart.orders?.order_code || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Target Output</span>
                  <span className="font-bold text-slate-950 dark:text-white">{batchToStart.target_output_quantity} units</span>
                </div>
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-4 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartModalOpen(false)
                  setBatchToStart(null)
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={confirmStartAssembly}
                className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                {isPending && <Loader2 size={13} className="animate-spin mr-1.5" />}
                <span>Start Production</span>
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
