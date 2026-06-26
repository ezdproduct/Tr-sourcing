'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSourcing } from '@/providers/sourcing-provider'
import { addSupplierAction, updateShortlistAction, deleteSupplierAction, classifyOrderItemsBatchAction } from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Users2,
  TrendingUp,
  Check,
  Plus,
  Trash2,
  X,
  AlertCircle,
  ChevronRight,
  Package,
  ShoppingBag,
  Loader2,
  Tag,
  Globe,
  Star,
  Clock,
  Search,
  Layers,
} from 'lucide-react'

export interface DatabaseOrderItem {
  id: string
  item_name: string
  quantity: number
  item_type?: string
}

export interface DatabaseOrder {
  id: string
  order_code: string
  order_type: 'MATERIAL' | 'PRODUCT' | 'PENDING' | string
  stage: string
  order_date: string
  estimated_delivery_date: string | null
  order_items?: DatabaseOrderItem[]
}

export interface DatabaseSupplier {
  id: string
  order_id: string | null
  order_item_id: string | null
  supplier_name: string
  quoted_price: number
  lead_time_days: number
  is_shortlisted: boolean
  created_at: string
  // Joined from orders table
  orders?: { order_code: string } | null
  order_items?: { item_name: string } | null
}

interface SourcingClientProps {
  initialOrders: DatabaseOrder[]
  initialSuppliers: DatabaseSupplier[]
}

// ─── View Mode ─────────────────────────────────────────────────────────────────
type ViewMode = 'order' | 'all'

export function getOrderTypeFromItems(items?: DatabaseOrderItem[]): string {
  if (!items || items.length === 0) return 'PENDING'
  const hasMaterial = items.some(item => item.item_type === 'MATERIAL')
  const hasFinishedGoods = items.some(item => item.item_type === 'FINISHED_GOODS' || item.item_type === 'PRODUCT')
  if (hasMaterial && hasFinishedGoods) return 'MIXED'
  if (hasMaterial) return 'MATERIAL'
  if (hasFinishedGoods) return 'PRODUCT'
  return 'PENDING'
}

export function SourcingClient({ initialOrders, initialSuppliers }: SourcingClientProps) {
  const { searchQuery } = useSourcing()
  const router = useRouter()

  // View mode: 'order' = per-order matrix, 'all' = global all-suppliers table
  const [viewMode, setViewMode] = useState<ViewMode>('order')
  const [allSuppliersSearch, setAllSuppliersSearch] = useState('')
  const [shortlistFilterOnly, setShortlistFilterOnly] = useState(false)

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    initialOrders.length > 0 ? initialOrders[0].id : null
  )
  const [suppliers, setSuppliers] = useState<DatabaseSupplier[]>(initialSuppliers)
  // Local orders list to allow optimistic updates
  const [orders, setOrders] = useState<DatabaseOrder[]>(initialOrders)

  // Sync props to state when initialOrders or initialSuppliers change
  useEffect(() => {
    setOrders(initialOrders)
    if (!selectedOrderId && initialOrders.length > 0) {
      setSelectedOrderId(initialOrders[0].id)
    }
  }, [initialOrders, selectedOrderId])

  useEffect(() => {
    setSuppliers(initialSuppliers)
  }, [initialSuppliers])

  // Trigger router refresh on mount to clear Next.js client router cache and get fresh data
  useEffect(() => {
    router.refresh()
  }, [router])

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Add supplier form state
  const [addForm, setAddForm] = useState({
    supplierName: '',
    quotedPrice: '',
    leadTimeDays: '',
    orderId: '',
    orderItemId: ''
  })

  // Local state for item type classification dropdowns
  const [localTypes, setLocalTypes] = useState<Record<string, string>>({})
  const [isBatchSaving, setIsBatchSaving] = useState(false)

  const selectedOrder = orders.find(o => o.id === selectedOrderId) || null

  const [isEditingClassification, setIsEditingClassification] = useState(false)

  // Initialize and synchronize editing mode based on pending items
  useEffect(() => {
    if (selectedOrder?.order_items) {
      const hasPending = selectedOrder.order_items.some(
        item => (item.item_type || 'PENDING') === 'PENDING'
      )
      setIsEditingClassification(hasPending)
    } else {
      setIsEditingClassification(false)
    }
  }, [selectedOrderId, selectedOrder])

  useEffect(() => {
    if (selectedOrder?.order_items) {
      const initialTypes: Record<string, string> = {}
      selectedOrder.order_items.forEach(item => {
        initialTypes[item.id] = item.item_type || 'PENDING'
      })
      setLocalTypes(initialTypes)
    }
  }, [selectedOrderId, selectedOrder])

  // format order type helper
  const formatOrderType = (type: string) => {
    if (!type) return '-'
    const upper = type.toUpperCase()
    if (upper === 'MATERIAL') return 'Material'
    if (upper === 'PRODUCT' || upper === 'FINISHED_GOODS') return 'Product'
    if (upper === 'MIXED') return 'Mixed'
    if (upper === 'PENDING') return 'Pending'
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
  }

  // ─── Derived data ────────────────────────────────────────────────────────────

  const computedOrderType = selectedOrder ? getOrderTypeFromItems(selectedOrder.order_items) : 'PENDING'

  // Filter orders by search query (for sidebar)
  const filteredOrders = orders.filter(o => {
    const type = getOrderTypeFromItems(o.order_items)
    return (
      o.order_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.order_items && o.order_items.some(item =>
        item.item_name.toLowerCase().includes(searchQuery.toLowerCase())
      ))
    )
  })

  // Suppliers for selected order, also filter by search
  const orderSuppliers = suppliers.filter(s => s.order_id === selectedOrderId && (
    searchQuery === '' ||
    s.supplier_name.toLowerCase().includes(searchQuery.toLowerCase())
  ))

  const shortlistedCount = orderSuppliers.filter(s => s.is_shortlisted).length
  const bestPrice = orderSuppliers.length > 0
    ? Math.min(...orderSuppliers.map(s => Number(s.quoted_price)))
    : null
  const bestLeadTime = orderSuppliers.length > 0
    ? Math.min(...orderSuppliers.map(s => s.lead_time_days))
    : null

  // ─── All Suppliers metrics ────────────────────────────────────────────────────
  const totalEngaged = suppliers.length
  const totalShortlisted = suppliers.filter(s => s.is_shortlisted).length
  const avgLeadTime = suppliers.length > 0
    ? Math.round(suppliers.reduce((sum, s) => sum + s.lead_time_days, 0) / suppliers.length)
    : null

  // All suppliers with optional search/shortlist filter
  const filteredAllSuppliers = suppliers.filter(s => {
    const matchesSearch =
      allSuppliersSearch === '' ||
      s.supplier_name.toLowerCase().includes(allSuppliersSearch.toLowerCase()) ||
      (s.orders?.order_code ?? '').toLowerCase().includes(allSuppliersSearch.toLowerCase())
    const matchesShortlist = !shortlistFilterOnly || s.is_shortlisted
    return matchesSearch && matchesShortlist
  })

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleSaveAllClassifications = async () => {
    if (!selectedOrderId || !selectedOrder?.order_items) return

    const itemsToSave = selectedOrder.order_items.map(item => ({
      id: item.id,
      itemType: localTypes[item.id] || item.item_type || 'PENDING'
    }))

    setIsBatchSaving(true)
    const result = await classifyOrderItemsBatchAction(itemsToSave, selectedOrderId)
    setIsBatchSaving(false)

    if (result.success) {
      setOrders(prev => prev.map(o => {
        if (o.id === selectedOrderId) {
          const updatedItems = o.order_items?.map(item => ({
            ...item,
            item_type: localTypes[item.id] || item.item_type || 'PENDING'
          }))
          
          let updatedStage = o.stage
          if (o.stage === 'Order Intake' || o.stage === 'Pending Classification' || !o.stage) {
            updatedStage = 'Sourcing'
          }
          
          return {
            ...o,
            stage: updatedStage,
            order_items: updatedItems
          }
        }
        return o
      }))
    } else {
      alert(result.error || 'Failed to save classifications')
    }
  }


  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (viewMode === 'order' && !selectedOrderId) return

    const targetOrderId = viewMode === 'order' ? selectedOrderId : (addForm.orderId || null)
    const targetOrderItemId = targetOrderId ? (addForm.orderItemId || null) : null

    if (targetOrderId && !targetOrderItemId) {
      setErrorMessage('Please select a target product item.')
      return
    }

    const quotedPrice = parseFloat(addForm.quotedPrice)
    const leadTimeDays = parseInt(addForm.leadTimeDays)

    if (!addForm.supplierName || isNaN(quotedPrice) || isNaN(leadTimeDays) || quotedPrice <= 0 || leadTimeDays <= 0) {
      setErrorMessage('Please fill in all fields with valid values.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    const result = await addSupplierAction({
      orderId: targetOrderId,
      orderItemId: targetOrderItemId,
      supplierName: addForm.supplierName,
      quotedPrice,
      leadTimeDays
    })

    setIsSubmitting(false)

    if (result.success && result.supplier) {
      const assocOrder = targetOrderId ? orders.find(o => o.id === targetOrderId) : null
      const assocOrderItem = targetOrderItemId ? assocOrder?.order_items?.find(item => item.id === targetOrderItemId) : null
      const newSupplierObj: DatabaseSupplier = {
        ...(result.supplier as DatabaseSupplier),
        orders: assocOrder ? { order_code: assocOrder.order_code } : null,
        order_items: assocOrderItem ? { item_name: assocOrderItem.item_name } : null
      }
      setSuppliers(prev => [...prev, newSupplierObj])
      setAddForm({ supplierName: '', quotedPrice: '', leadTimeDays: '', orderId: '', orderItemId: '' })
      setIsAddOpen(false)
    } else {
      setErrorMessage(result.error || 'Failed to add supplier.')
    }
  }

  const handleToggleShortlist = (supplier: DatabaseSupplier) => {
    const newValue = !supplier.is_shortlisted

    // Optimistic UI update
    setSuppliers(prev =>
      prev.map(s => s.id === supplier.id ? { ...s, is_shortlisted: newValue } : s)
    )

    startTransition(async () => {
      const result = await updateShortlistAction(supplier.id, newValue)
      if (!result.success) {
        // Revert on failure
        setSuppliers(prev =>
          prev.map(s => s.id === supplier.id ? { ...s, is_shortlisted: !newValue } : s)
        )
      }
    })
  }

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return
    const idToDelete = confirmDeleteId
    setConfirmDeleteId(null)
    setDeletingId(idToDelete)
    const result = await deleteSupplierAction(idToDelete)
    setDeletingId(null)
    if (result.success) {
      setSuppliers(prev => prev.filter(s => s.id !== idToDelete))
    }
  }

  const getStageBadge = (stage: string) => {
    switch (stage.toLowerCase()) {
      case 'sourcing':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900'
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800'
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Supplier Sourcing &amp; Matrix
          </h1>
          <p className="text-sm text-slate-500">
            Phase 2–3: Evaluate factory capabilities, compare prices/lead times, and build your shortlist
          </p>
        </div>
        {viewMode === 'all' && (
          <Button
            onClick={() => {
              setAddForm({
                supplierName: '',
                quotedPrice: '',
                leadTimeDays: '',
                orderId: '',
                orderItemId: ''
              })
              setIsAddOpen(true)
              setErrorMessage(null)
            }}
            className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer"
          >
            <Plus size={16} />
            <span>Add Supplier</span>
          </Button>
        )}
      </div>

      {/* Stats Cards — toggle between per-order and global */}
      {viewMode === 'order' ? (
        selectedOrder && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-slate-200/60 dark:border-slate-800 bg-[#fbfbfe] dark:bg-slate-900/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-slate-400 uppercase">Active Order</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{selectedOrder.order_code}</div>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  {computedOrderType === 'MIXED' ? (
                    <Layers size={11} className="text-indigo-600" />
                  ) : computedOrderType === 'PRODUCT' ? (
                    <ShoppingBag size={11} />
                  ) : computedOrderType === 'PENDING' ? (
                    <Tag size={11} className="text-amber-500" />
                  ) : (
                    <Package size={11} />
                  )}
                  {computedOrderType === 'MIXED' ? (
                    <span className="text-indigo-600 font-semibold">Mixed</span>
                  ) : computedOrderType === 'PRODUCT' ? (
                    'Product'
                  ) : computedOrderType === 'PENDING' ? (
                    <span className="text-amber-500 font-semibold">Pending Classification</span>
                  ) : (
                    'Material'
                  )}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800 bg-[#fbfbfe] dark:bg-slate-900/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-slate-400 uppercase">Shortlisted Candidates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {shortlistedCount} / {orderSuppliers.length}
                </div>
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  <Star size={11} className="text-amber-500 fill-amber-500" /> Selected for further audit
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800 bg-[#fbfbfe] dark:bg-slate-900/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-slate-400 uppercase">Best Terms Available</CardTitle>
              </CardHeader>
              <CardContent>
                {orderSuppliers.length > 0 ? (
                  <>
                    <div className="text-lg font-bold text-emerald-600">
                      ${bestPrice?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Fastest lead time: <span className="font-semibold text-indigo-600">{bestLeadTime} days</span>
                    </p>
                  </>
                ) : (
                  <div className="text-sm text-slate-400">No quotes received</div>
                )}
              </CardContent>
            </Card>
          </div>
        )
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-slate-200/60 dark:border-slate-800 bg-[#fbfbfe] dark:bg-slate-900/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase">Total Candidates Engaged</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{totalEngaged} factories</div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <Globe size={11} /> Global supply footprint
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 dark:border-slate-800 bg-[#fbfbfe] dark:bg-slate-900/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase">Avg Lead Time</CardTitle>
            </CardHeader>
            <CardContent>
              {avgLeadTime !== null ? (
                <>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-200">{avgLeadTime} days</div>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <Clock size={11} /> System-wide average
                  </p>
                </>
              ) : (
                <div className="text-sm text-slate-400">No data yet</div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/60 dark:border-slate-800 bg-[#fbfbfe] dark:bg-slate-900/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-400 uppercase">Total Shortlisted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                {totalShortlisted}
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                <Star size={11} /> Approved for Phase 3 audits
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content: Order List + Matrix / All Suppliers */}
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">

        {/* Orders Sidebar */}
        <Card className="border-slate-200/60 dark:border-slate-800 h-fit">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="text-sm font-bold">Purchase Orders</CardTitle>
            <CardDescription className="text-xs">Select an order to manage suppliers</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* All Suppliers button */}
            <div className="px-3 pt-3 pb-2">
              <button
                id="btn-all-suppliers"
                onClick={() => setViewMode('all')}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all cursor-pointer ${
                  viewMode === 'all'
                    ? 'bg-[#5c59e9] border-[#5c59e9] text-white shadow-sm shadow-indigo-300/30'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#5c59e9]/40 hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20 hover:text-[#5c59e9]'
                }`}
              >
                <Globe size={15} className={viewMode === 'all' ? 'text-white' : 'text-[#5c59e9]'} />
                All Suppliers
                <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded-md ${
                  viewMode === 'all'
                    ? 'bg-white/20 text-white'
                    : 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400'
                }`}>
                  {suppliers.length}
                </span>
              </button>
            </div>

            <div className="px-3 pb-2">
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 pb-1.5">By Order</p>
              </div>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="px-4 pb-4 text-center text-sm text-slate-400">
                No orders found.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800 pb-2">
                {filteredOrders.map(order => {
                  const type = getOrderTypeFromItems(order.order_items)
                  return (
                    <li key={order.id}>
                      <button
                        id={`order-select-${order.id}`}
                        onClick={() => { setSelectedOrderId(order.id); setViewMode('order') }}
                        className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          viewMode === 'order' && selectedOrderId === order.id
                            ? 'bg-indigo-50 dark:bg-indigo-950/30'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20'
                        }`}
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className={`text-xs font-bold truncate ${
                            viewMode === 'order' && selectedOrderId === order.id
                              ? 'text-indigo-700 dark:text-indigo-400'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}>
                            {order.order_code}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {type === 'MIXED' ? (
                              <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Mixed</span>
                            ) : type === 'PRODUCT' ? (
                              'Product'
                            ) : type === 'PENDING' ? (
                              <span className="text-amber-500 font-semibold">Pending Classification</span>
                            ) : (
                              'Material'
                            )}
                          </span>
                          <span className={`text-[9px] font-semibold uppercase tracking-wide mt-0.5 px-1.5 py-0.5 rounded border inline-block w-fit ${getStageBadge(order.stage)}`}>
                            {order.stage}
                          </span>
                        </div>
                        <ChevronRight size={14} className={viewMode === 'order' && selectedOrderId === order.id ? 'text-indigo-500' : 'text-slate-300'} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Right Panel — either All Suppliers or per-order Matrix */}
        {viewMode === 'all' ? (
          /* ── All Suppliers Overview ───────────────────────────────────────── */
          <Card className="border-slate-200/60 dark:border-slate-800">
            <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Globe size={16} className="text-[#5c59e9]" />
                    All Suppliers Overview
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    System-wide view of all {suppliers.length} supplier candidates across all orders
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    id="filter-shortlisted"
                    onClick={() => setShortlistFilterOnly(v => !v)}
                    className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                      shortlistFilterOnly
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:hover:border-slate-600'
                    }`}
                  >
                    <Star size={12} />
                    Shortlisted only
                  </button>
                </div>
              </div>
              {/* Global search bar */}
              <div className="relative mt-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="all-suppliers-search"
                  type="text"
                  placeholder="Search by supplier name or order code..."
                  value={allSuppliersSearch}
                  onChange={e => setAllSuppliersSearch(e.target.value)}
                  className="w-full pl-9 pr-4 h-9 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5c59e9]/30 focus:border-[#5c59e9]"
                />
                {allSuppliersSearch && (
                  <button
                    onClick={() => setAllSuppliersSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredAllSuppliers.length === 0 ? (
                <div className="p-12 flex flex-col items-center justify-center gap-3 text-center">
                  <Users2 size={36} className="text-slate-200 dark:text-slate-700" />
                  <p className="text-sm text-slate-400 font-medium">
                    {shortlistFilterOnly ? 'No shortlisted suppliers found' : 'No suppliers found'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {allSuppliersSearch ? 'Try adjusting your search query.' : 'Select an order and add suppliers to get started.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                        <th className="px-6 py-4">Supplier Name</th>
                        <th className="px-6 py-4">Associated Order</th>
                        <th className="px-6 py-4">Product Item</th>
                        <th className="px-6 py-4">Quoted Price</th>
                        <th className="px-6 py-4">Lead Time</th>
                        <th className="px-6 py-4 text-center">Shortlist Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {filteredAllSuppliers.map(supplier => {
                        const orderCode = supplier.orders?.order_code ?? '—'
                        const linkedOrder = orders.find(o => o.id === supplier.order_id)
                        return (
                          <tr key={supplier.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-800 dark:text-slate-200">
                                {supplier.supplier_name}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {!supplier.order_id ? (
                                <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900/10 dark:text-slate-500 dark:border-slate-800">
                                  Unassigned
                                </Badge>
                              ) : !linkedOrder ? (
                                <Badge variant="outline" className="text-[10px] font-semibold bg-red-50 text-red-500 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900">
                                  Deleted Order
                                </Badge>
                              ) : (
                                <button
                                  id={`jump-to-order-${supplier.order_id}`}
                                  onClick={() => { setSelectedOrderId(supplier.order_id); setViewMode('order') }}
                                  className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer"
                                >
                                  {orderCode}
                                  <ChevronRight size={11} />
                                </button>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-slate-600 dark:text-slate-400">
                                {supplier.order_items?.item_name || '—'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900 dark:text-white">
                                ${Number(supplier.quoted_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="font-semibold text-slate-700 dark:text-slate-300">
                                {supplier.lead_time_days} days
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <button
                                id={`all-shortlist-${supplier.id}`}
                                onClick={() => handleToggleShortlist(supplier)}
                                disabled={isPending}
                                title={supplier.is_shortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                                className="cursor-pointer disabled:opacity-50"
                              >
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-semibold px-2.5 py-0.5 ${
                                    supplier.is_shortlisted
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800'
                                      : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-700'
                                  }`}
                                >
                                  {supplier.is_shortlisted ? '✓ Shortlisted' : 'Not shortlisted'}
                                </Badge>
                              </button>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button
                                id={`all-delete-supplier-${supplier.id}`}
                                onClick={() => setConfirmDeleteId(supplier.id)}
                                disabled={deletingId === supplier.id}
                                className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-950/20 dark:hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                                title="Remove supplier"
                              >
                                {deletingId === supplier.id
                                  ? <Loader2 size={13} className="animate-spin" />
                                  : <Trash2 size={13} />
                                }
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          /* ── Per-Order Details Stack ─────────────────────────────────────── */
          <div className="space-y-6">
            {!selectedOrderId ? (
              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardContent className="p-12 flex flex-col items-center justify-center gap-3 text-center">
                  <Users2 size={36} className="text-slate-200 dark:text-slate-700" />
                  <p className="text-sm text-slate-400">Select an order from the sidebar to begin</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {isEditingClassification ? (
                  /* Card 1: Product Items Classification (Visible during editing or when items are pending) */
                  <Card className="border-slate-200/60 dark:border-slate-800">
                    <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Package size={16} className="text-[#5c59e9]" />
                        Product Items Classification
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Classify each product item within the order to designate them as Material or Product.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      {selectedOrder?.order_items && selectedOrder.order_items.length > 0 ? (
                        <div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-medium uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                                  <th className="px-6 py-3">Product Item</th>
                                  <th className="px-6 py-3">Quantity</th>
                                  <th className="px-6 py-3">Classification</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {selectedOrder.order_items.map((item) => {
                                  const currentVal = localTypes[item.id] || item.item_type || 'PENDING'
                                  return (
                                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                                      <td className="px-6 py-3 font-medium text-slate-800 dark:text-slate-200 text-sm">
                                        {item.item_name}
                                      </td>
                                      <td className="px-6 py-3 text-slate-700 dark:text-slate-300 font-medium text-sm">
                                        {item.quantity}
                                      </td>
                                      <td className="px-6 py-3">
                                        <select
                                          value={currentVal}
                                          onChange={(e) => setLocalTypes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-[#5c59e9] outline-none font-medium text-slate-700 dark:text-slate-300 h-8.5"
                                        >
                                          <option value="PENDING">Pending</option>
                                          <option value="MATERIAL">Material</option>
                                          <option value="FINISHED_GOODS">Product</option>
                                        </select>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                          {/* Batch Save Footer */}
                          <div className="p-3 px-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-4 flex-wrap bg-slate-50/20 dark:bg-slate-950/10">
                            {selectedOrder.order_items.some(item => (localTypes[item.id] || item.item_type || 'PENDING') === 'PENDING') && (
                              <span className="text-red-500 font-semibold text-xs sm:text-sm flex items-center gap-1.5 animate-pulse">
                                <AlertCircle size={15} />
                                Please classify all items before saving
                              </span>
                            )}
                            <Button
                              id="save-all-classifications"
                              onClick={handleSaveAllClassifications}
                              disabled={isBatchSaving || selectedOrder.order_items.some(item => (localTypes[item.id] || item.item_type || 'PENDING') === 'PENDING')}
                              className={`px-5 py-2 h-9.5 text-xs sm:text-sm font-bold rounded-xl gap-2 cursor-pointer transition-all ${
                                selectedOrder.order_items.some(item => (localTypes[item.id] || item.item_type || 'PENDING') === 'PENDING')
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                  : 'bg-[#5c59e9] hover:bg-[#4a47d2] text-white shadow-sm shadow-indigo-300/30'
                              }`}
                            >
                              {isBatchSaving ? (
                                <><Loader2 size={16} className="animate-spin" /> Saving...</>
                              ) : (
                                <><Check size={16} /> Save All Classifications</>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-6 text-center text-slate-400">No items found for this order.</div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  /* Classified State: Show collapsed success banner & Suppliers matrix */
                  <>
                    <div className="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-150 dark:border-emerald-900/50 rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-450">
                          <Check size={14} className="stroke-[3]" />
                        </div>
                        <div>
                          <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                            Items classified successfully
                          </p>
                          <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                            All product items for this order have been designated as Material or Product.
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => setIsEditingClassification(true)}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-semibold px-3 border-emerald-250 text-emerald-700 hover:bg-emerald-150/50 dark:border-emerald-900/50 dark:text-emerald-400 cursor-pointer"
                      >
                        Edit Classification
                      </Button>
                    </div>

                    {(() => {
                      const bestPricePerItem: Record<string, number> = {}
                      const bestLeadTimePerItem: Record<string, number> = {}

                      orderSuppliers.forEach(s => {
                        if (s.order_item_id) {
                          const price = Number(s.quoted_price)
                          if (bestPricePerItem[s.order_item_id] === undefined || price < bestPricePerItem[s.order_item_id]) {
                            bestPricePerItem[s.order_item_id] = price
                          }
                          const lead = s.lead_time_days
                          if (bestLeadTimePerItem[s.order_item_id] === undefined || lead < bestLeadTimePerItem[s.order_item_id]) {
                            bestLeadTimePerItem[s.order_item_id] = lead
                          }
                        }
                      })

                      const sortedOrderSuppliers = [...orderSuppliers].sort((a, b) => {
                        const nameA = a.order_items?.item_name || ''
                        const nameB = b.order_items?.item_name || ''
                        const cmp = nameA.localeCompare(nameB)
                        if (cmp !== 0) return cmp
                        return Number(a.quoted_price) - Number(b.quoted_price)
                      })

                      return (
                        <Card className="border-slate-200/60 dark:border-slate-800">
                          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
                            <div>
                              <CardTitle className="text-base font-bold">
                                Suppliers for {selectedOrder?.order_code}
                              </CardTitle>
                              <CardDescription className="text-xs">
                                Compare quotes, lead times, and shortlist preferred factory suppliers
                              </CardDescription>
                            </div>
                            <Button
                              onClick={() => {
                                setAddForm({
                                  supplierName: '',
                                  quotedPrice: '',
                                  leadTimeDays: '',
                                  orderId: selectedOrderId || '',
                                  orderItemId: ''
                                })
                                setIsAddOpen(true)
                                setErrorMessage(null)
                              }}
                              size="sm"
                              className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer"
                            >
                              <Plus size={14} />
                              <span>Add Supplier</span>
                            </Button>
                          </CardHeader>
                          <CardContent className="p-0">
                            {sortedOrderSuppliers.length === 0 ? (
                              <div className="p-12 flex flex-col items-center justify-center gap-3 text-center min-h-[350px]">
                                <Users2 size={36} className="text-slate-200 dark:text-slate-700" />
                                <p className="text-sm text-slate-400 font-medium">No suppliers yet</p>
                                <p className="text-xs text-slate-400">Click &quot;Add Supplier&quot; to start building your comparison matrix</p>
                                <Button
                                  onClick={() => {
                                    setAddForm({
                                      supplierName: '',
                                      quotedPrice: '',
                                      leadTimeDays: '',
                                      orderId: selectedOrderId || '',
                                      orderItemId: ''
                                    })
                                    setIsAddOpen(true)
                                    setErrorMessage(null)
                                  }}
                                  size="sm"
                                  className="mt-2 gap-1.5 bg-[#5c59e9] hover:bg-[#4a47d2]"
                                >
                                  <Plus size={14} />
                                  <span>Add First Supplier</span>
                                </Button>
                              </div>
                            ) : (
                              <div className="overflow-x-auto min-h-[350px]">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                                      <th className="px-6 py-4">Supplier</th>
                                      <th className="px-6 py-4">Product Item</th>
                                      <th className="px-6 py-4">Quoted Price</th>
                                      <th className="px-6 py-4">Lead Time</th>
                                      <th className="px-6 py-4 text-center">Shortlist</th>
                                      <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                    {sortedOrderSuppliers.map(supplier => {
                                      const isLowestPrice = supplier.order_item_id && bestPricePerItem[supplier.order_item_id] !== undefined && Number(supplier.quoted_price) === bestPricePerItem[supplier.order_item_id]
                                      const isFastestLead = supplier.order_item_id && bestLeadTimePerItem[supplier.order_item_id] !== undefined && supplier.lead_time_days === bestLeadTimePerItem[supplier.order_item_id]
                                      return (
                                        <tr key={supplier.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                                          <td className="px-6 py-4">
                                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                                              {supplier.supplier_name}
                                            </div>
                                            {supplier.is_shortlisted && (
                                              <div className="text-[9px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-0.5">
                                                <Check size={9} /> Shortlisted
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">
                                            {supplier.order_items?.item_name || '—'}
                                          </td>
                                          <td className="px-6 py-4">
                                            <div className={`font-bold ${isLowestPrice ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                                              ${Number(supplier.quoted_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                            </div>
                                            {isLowestPrice && (
                                              <div className="text-[9px] text-emerald-600 font-medium flex items-center gap-0.5 mt-0.5">
                                                <TrendingUp size={9} /> Best price
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-6 py-4">
                                            <div className={`font-semibold ${isFastestLead ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                              {supplier.lead_time_days} days
                                            </div>
                                            {isFastestLead && (
                                              <div className="text-[9px] text-indigo-600 font-medium mt-0.5">
                                                Fastest
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-6 py-4 text-center">
                                            <button
                                              id={`shortlist-${supplier.id}`}
                                              onClick={() => handleToggleShortlist(supplier)}
                                              disabled={isPending}
                                              className={`mx-auto flex h-7 w-7 items-center justify-center rounded-lg border transition-all cursor-pointer disabled:opacity-50 ${
                                                supplier.is_shortlisted
                                                  ? 'bg-emerald-50 text-emerald-600 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800'
                                                  : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 dark:border-slate-800'
                                              }`}
                                            >
                                              <Check size={14} className={supplier.is_shortlisted ? 'opacity-100' : 'opacity-30'} />
                                            </button>
                                          </td>
                                          <td className="px-6 py-4 text-right">
                                            <button
                                              id={`delete-supplier-${supplier.id}`}
                                              onClick={() => setConfirmDeleteId(supplier.id)}
                                              disabled={deletingId === supplier.id}
                                              className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-950/20 dark:hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50"
                                              title="Remove supplier"
                                            >
                                              {deletingId === supplier.id
                                                ? <Loader2 size={13} className="animate-spin" />
                                                : <Trash2 size={13} />
                                              }
                                            </button>
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })()}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Add Supplier Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { setIsAddOpen(false); setErrorMessage(null) }}
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Add Supplier</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {viewMode === 'order' && selectedOrder
                    ? `For order ${selectedOrder.order_code}`
                    : 'Add a new supplier to the system'}
                </p>
              </div>
              <button
                onClick={() => { setIsAddOpen(false); setErrorMessage(null) }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddSupplier} className="p-6 space-y-4">
              {errorMessage && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-4 py-3">
                  <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-xs text-red-600 dark:text-red-400">{errorMessage}</span>
                </div>
              )}

              {/* 1. Associated Order (Optional) select - only shown in global view */}
              {viewMode === 'all' && (
                <div className="space-y-1.5">
                  <Label htmlFor="order-select" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Associated Order (Optional)
                  </Label>
                  <select
                    id="order-select"
                    value={addForm.orderId}
                    onChange={e => setAddForm(f => ({ ...f, orderId: e.target.value, orderItemId: '' }))}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#5c59e9] dark:border-slate-800 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                  >
                    <option value="">No Associated Order (Unassigned)</option>
                    {orders.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.order_code}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 2. Target Product Item (Required if Order is associated) select */}
              {(viewMode === 'order' ? !!selectedOrder : !!addForm.orderId) && (
                <div className="space-y-1.5">
                  <Label htmlFor="item-select" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Target Product Item <span className="text-red-500">*</span>
                  </Label>
                  <select
                    id="item-select"
                    value={addForm.orderItemId}
                    onChange={e => setAddForm(f => ({ ...f, orderItemId: e.target.value }))}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#5c59e9] dark:border-slate-800 dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                    required
                  >
                    <option value="">Select a product item...</option>
                    {(viewMode === 'order' ? selectedOrder?.order_items : orders.find(o => o.id === addForm.orderId)?.order_items)?.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.item_name} ({item.quantity})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3. Supplier / Factory Name input */}
              <div className="space-y-1.5">
                <Label htmlFor="supplier-name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Supplier / Factory Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="supplier-name"
                  placeholder="e.g. Viet My Woodworking Ltd"
                  value={addForm.supplierName}
                  onChange={e => setAddForm(f => ({ ...f, supplierName: e.target.value }))}
                  className="text-sm h-9"
                  required
                />
              </div>

              {/* 4. Quoted Price & Lead Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="quoted-price" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Quoted Price (USD) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="quoted-price"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="e.g. 340.00"
                    value={addForm.quotedPrice}
                    onChange={e => setAddForm(f => ({ ...f, quotedPrice: e.target.value }))}
                    className="text-sm h-9"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="lead-time" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Lead Time (Days) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="lead-time"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="e.g. 14"
                    value={addForm.leadTimeDays}
                    onChange={e => setAddForm(f => ({ ...f, leadTimeDays: e.target.value }))}
                    className="text-sm h-9"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setIsAddOpen(false); setErrorMessage(null) }}
                  className="flex-1 h-9 text-sm cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 h-9 text-sm bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Adding...
                    </>
                  ) : (
                    <>
                      <Plus size={14} />
                      Add Supplier
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmDeleteId(null)}
          />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <AlertCircle size={22} className="flex-shrink-0 text-red-600 dark:text-red-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Supplier</h3>
            </div>
            
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Are you sure you want to delete supplier <strong className="font-semibold text-slate-800 dark:text-slate-200">{suppliers.find(s => s.id === confirmDeleteId)?.supplier_name}</strong>? This action cannot be undone and will remove them from all comparison matrices.
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 h-9 text-sm cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 h-9 text-sm bg-red-600 hover:bg-red-700 text-white cursor-pointer gap-2"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
