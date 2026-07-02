'use client'

import React, { useState } from 'react'
import { DatabaseOrder, getOrderTypeFromItems } from './orders-client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Layers,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  Handshake,
  FileCheck2,
  Anchor,
  Truck,
  TrendingUp,
  FolderOpen,
  FileText,
  CheckCircle2,
  Factory
} from 'lucide-react'

// Define Kanban Columns
const COLUMNS = [
  {
    key: 'Order',
    label: 'Order Intake',
    colorClass: 'border-t-blue-500 bg-blue-50/50 dark:bg-blue-950/10 hover:bg-blue-100/30 dark:hover:bg-blue-950/20 text-blue-700 dark:text-blue-400 border-blue-100 dark:border-blue-900/40',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    icon: Package
  },
  {
    key: 'Sourcing',
    label: 'Sourcing & Bids',
    colorClass: 'border-t-amber-500 bg-amber-50/50 dark:bg-amber-950/10 hover:bg-amber-100/30 dark:hover:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-900/40',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    icon: Handshake
  },
  {
    key: 'QC',
    label: 'Quality Control',
    colorClass: 'border-t-purple-500 bg-purple-50/50 dark:bg-purple-950/10 hover:bg-purple-100/30 dark:hover:bg-purple-950/20 text-purple-700 dark:text-purple-400 border-purple-100 dark:border-purple-900/40',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
    icon: FileCheck2
  },
  {
    key: 'CreatePO',
    label: 'Create PO',
    colorClass: 'border-t-pink-500 bg-pink-50/50 dark:bg-pink-950/10 hover:bg-pink-100/30 dark:hover:bg-pink-950/20 text-pink-700 dark:text-pink-400 border-pink-100 dark:border-pink-900/40',
    badgeClass: 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300',
    icon: FileText
  },
  {
    key: 'SupplierProduction',
    label: 'Supplier Production',
    colorClass: 'border-t-orange-500 bg-orange-50/50 dark:bg-orange-950/10 hover:bg-orange-100/30 dark:hover:bg-orange-950/20 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-900/40',
    badgeClass: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
    icon: Factory
  },
  {
    key: 'Inspection',
    label: 'Inspection',
    colorClass: 'border-t-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/10 hover:bg-indigo-100/30 dark:hover:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    icon: Anchor
  },
  {
    key: 'Logistic',
    label: 'Logistics & Inventory',
    colorClass: 'border-t-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/10 hover:bg-cyan-100/30 dark:hover:bg-cyan-950/20 text-cyan-700 dark:text-cyan-400 border-cyan-100 dark:border-cyan-900/40',
    badgeClass: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
    icon: Truck
  },
  {
    key: 'Production',
    label: 'Production',
    colorClass: 'border-t-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/10 hover:bg-emerald-100/30 dark:hover:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/40',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    icon: TrendingUp
  },
  {
    key: 'Done',
    label: 'Order Done',
    colorClass: 'border-t-emerald-600 bg-emerald-50/30 dark:bg-emerald-950/5 hover:bg-emerald-100/20 dark:hover:bg-emerald-950/10 text-emerald-800 dark:text-emerald-500 border-emerald-100 dark:border-emerald-900/40',
    badgeClass: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-305',
    icon: CheckCircle2
  }
]

// Safely map an order's stage string to a Column Key
export function getColumnKey(stage: string): string {
  const s = stage ? stage.toLowerCase() : ''
  if (s.includes('definition') || s.includes('draft') || s.includes('order')) return 'Order'
  if (s.includes('ready') || s.includes('po')) return 'CreatePO'
  if (s.includes('sourcing')) return 'Sourcing'
  if (s.includes('audit') || s.includes('qc')) return 'QC'
  if (s.includes('inspection passed') || s.includes('inspection_passed')) return 'Logistic'
  if (s.includes('inspection') || s.includes('port')) return 'Inspection'
  if (s.includes('logistics') || s.includes('inbound') || s.includes('logistic')) return 'Logistic'
  if (s.includes('supplier production') || s.includes('supplier_production')) return 'SupplierProduction'
  if (s.includes('production') || s.includes('run') || s.includes('stock') || s.includes('assemble')) return 'Production'
  if (s.includes('closed') || s.includes('completed') || s.includes('done')) return 'Done'
  return 'Order' // default fallback
}

interface KanbanBoardProps {
  orders: any[]
  isStaffOrAdmin: boolean
  onCardClick: (order: any) => void
  onStageChange: (orderId: string, newStage: string) => Promise<boolean>
}

export function KanbanBoard({ orders, isStaffOrAdmin, onCardClick, onStageChange }: KanbanBoardProps) {
  const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({})
  const [activeDragColumn, setActiveDragColumn] = useState<string | null>(null)

  // format order type helper
  const formatOrderType = (type: string) => {
    if (!type) return '-'
    const upper = type.toUpperCase()
    if (upper === 'MATERIAL') return 'Material'
    if (upper === 'PRODUCT' || upper === 'FINISHED_GOODS') return 'Product'
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
  }

  // Handle stage change asynchronously with a spinner
  const handleStageMove = async (orderId: string, newStage: string) => {
    setUpdatingIds(prev => ({ ...prev, [orderId]: true }))
    try {
      let dbStage = newStage
      if (newStage === 'CreatePO') dbStage = 'Ready for PO'
      else if (newStage === 'SupplierProduction') dbStage = 'Supplier Production'
      else if (newStage === 'Done') dbStage = 'Closed'
      await onStageChange(orderId, dbStage)
    } finally {
      setUpdatingIds(prev => ({ ...prev, [orderId]: false }))
    }
  }

  // Shift stage relative to current index
  const shiftStage = (order: DatabaseOrder, direction: 'left' | 'right') => {
    const currentKey = getColumnKey(order.stage)
    const currentIndex = COLUMNS.findIndex(c => c.key === currentKey)
    if (direction === 'left' && currentIndex > 0) {
      handleStageMove(order.id, COLUMNS[currentIndex - 1].key)
    } else if (direction === 'right' && currentIndex < COLUMNS.length - 1) {
      handleStageMove(order.id, COLUMNS[currentIndex + 1].key)
    }
  }

  // HTML5 Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, order: DatabaseOrder) => {
    e.dataTransfer.setData('text/plain', order.id)
    e.dataTransfer.setData('currentStage', getColumnKey(order.stage))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    if (!isStaffOrAdmin) return
    e.preventDefault()
    if (activeDragColumn !== columnKey) {
      setActiveDragColumn(columnKey)
    }
  }

  const handleDragLeave = () => {
    setActiveDragColumn(null)
  }

  const handleDrop = async (e: React.DragEvent, targetColumnKey: string) => {
    e.preventDefault()
    setActiveDragColumn(null)
    if (!isStaffOrAdmin) return

    const orderId = e.dataTransfer.getData('text/plain')
    const sourceStageKey = e.dataTransfer.getData('currentStage')

    if (orderId && sourceStageKey !== targetColumnKey) {
      await handleStageMove(orderId, targetColumnKey)
    }
  }

  // Group orders by columns
  const groupedOrders: Record<string, DatabaseOrder[]> = {
    Order: [],
    Sourcing: [],
    QC: [],
    CreatePO: [],
    SupplierProduction: [],
    Inspection: [],
    Logistic: [],
    Production: [],
    Done: []
  }

  orders.forEach(order => {
    const colKey = getColumnKey(order.stage)
    if (groupedOrders[colKey]) {
      groupedOrders[colKey].push(order)
    } else {
      groupedOrders['Order'].push(order)
    }
  })

  return (
    <div className="w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200">
      <div className="flex gap-4 min-w-[1200px] h-[calc(100vh-16rem)] min-h-[500px]">
        {COLUMNS.map(col => {
          const colKey = col.key
          const colOrders = groupedOrders[colKey] || []
          const ColumnIcon = col.icon
          const isOver = activeDragColumn === colKey

          return (
            <div
              key={colKey}
              onDragOver={(e) => handleDragOver(e, colKey)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, colKey)}
              className={`flex-1 flex flex-col rounded-xl border border-dashed p-3 transition-all duration-200 ${
                col.colorClass
              } ${isOver ? 'ring-2 ring-indigo-500/50 scale-[1.01] border-indigo-400 bg-indigo-500/5' : ''}`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100 dark:border-slate-800/80 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="text-slate-600 dark:text-slate-300 flex items-center">
                    <ColumnIcon size={14} />
                  </div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight">
                    {col.label}
                  </span>
                </div>
                <Badge className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.badgeClass}`}>
                  {colOrders.length}
                </Badge>
              </div>

              {/* Cards Container */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-4 scrollbar-thin scrollbar-thumb-slate-100">
                {colOrders.length === 0 ? (
                  <div className="h-28 border border-dashed border-slate-200/60 dark:border-slate-800/60 rounded-xl flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-1.5 p-4 bg-white/20 dark:bg-slate-950/5">
                    <FolderOpen size={18} className="stroke-[1.5]" />
                    <span className="text-[10px] font-medium">No orders here</span>
                  </div>
                ) : (
                  colOrders.map(order => {
                    const orderType = getOrderTypeFromItems(order.order_items)
                    const isUpdating = !!updatingIds[order.id]
                    const currentIdx = COLUMNS.findIndex(c => c.key === colKey)

                    return (
                      <div
                        key={order.id}
                        draggable={isStaffOrAdmin && !isUpdating}
                        onDragStart={(e) => handleDragStart(e, order)}
                        onClick={() => onCardClick(order)}
                        className={`group relative border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all duration-200 select-none ${
                          isStaffOrAdmin && !isUpdating ? 'cursor-grab active:cursor-grabbing hover:border-indigo-300/80 dark:hover:border-indigo-800/80' : 'cursor-pointer'
                        } ${isUpdating ? 'opacity-65 pointer-events-none' : ''}`}
                      >
                        {/* Status Overlay Spinner */}
                        {isUpdating && (
                          <div className="absolute inset-0 bg-white/60 dark:bg-slate-950/60 rounded-xl flex items-center justify-center z-10 animate-in fade-in duration-200">
                            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                          </div>
                        )}

                        {/* Card Header Info */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="font-bold text-xs text-indigo-600 dark:text-indigo-400 group-hover:underline tracking-tight">
                            {order.order_code}
                          </span>
                          <Badge variant="outline" className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0 bg-slate-50 dark:bg-slate-950/50">
                            {formatOrderType(orderType)}
                          </Badge>
                        </div>

                        {/* Card Items details */}
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 mb-3.5 font-medium">
                          <Layers size={11} className="text-slate-400" />
                          <span>{order.order_items?.length || 0} items in order</span>
                        </div>

                        {/* Card Footer: Delivery Date & Shift Controls */}
                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-50 dark:border-slate-800/50">
                          <div className="flex items-center gap-1.5 text-[9px] text-slate-400 dark:text-slate-500 font-semibold uppercase">
                            <Calendar size={11} />
                            <span>
                              {order.estimated_delivery_date ? new Date(order.estimated_delivery_date).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              }) : 'No Est'}
                            </span>
                          </div>

                          {/* Quick Shift buttons (Mobile/Touch fallback) */}
                          {isStaffOrAdmin && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={currentIdx === 0 || isUpdating}
                                onClick={() => shiftStage(order, 'left')}
                                className="h-5 w-5 p-0 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              >
                                <ChevronLeft size={12} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={currentIdx === COLUMNS.length - 1 || isUpdating}
                                onClick={() => shiftStage(order, 'right')}
                                className="h-5 w-5 p-0 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                              >
                                <ChevronRight size={12} />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
