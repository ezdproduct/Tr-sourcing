'use client'

import React, { useState } from 'react'
import { useSourcing } from '@/providers/sourcing-provider'
import { createOrderAction, updateOrderAction, deleteOrderAction } from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Package,
  PlusCircle,
  Download,
  AlertCircle,
  X,
  Trash2,
  Layers,
  Calendar,
  FileText,
  Edit3
} from 'lucide-react'

export interface DatabaseOrderItem {
  id: string
  order_id: string
  item_name: string
  quantity: number
  spec_file_url: string | null
  created_at: string
  item_type?: string
}

export interface DatabaseOrder {
  id: string
  order_code: string
  order_type: 'MATERIAL' | 'PRODUCT' | 'PENDING' | string
  stage: string
  created_at: string
  order_date: string
  estimated_delivery_date: string | null
  order_items?: DatabaseOrderItem[]
}

// Helper to upload a file to Cloudflare R2 via proxy API
async function uploadFile(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  
  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  })
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to upload file to R2.')
  }
  
  const data = await res.json()
  return data.url
}

// Helper to extract clean original filename from R2 generated key URL
function getFilenameFromUrl(url: string | null | undefined): string {
  if (!url) return ''
  if (!url.includes('?key=')) return url
  try {
    const params = new URLSearchParams(url.split('?')[1])
    const key = params.get('key')
    if (key) {
      const parts = key.split('-')
      // R2 key format: timestamp-random-originalName
      if (parts.length > 2) {
        return parts.slice(2).join('-')
      }
      return key
    }
  } catch (e) {
    // Fallback
  }
  return url
}

// Helper to parse spec file URLs (backward compatible with single URLs or JSON arrays)
function parseSpecFileUrls(url: string | null | undefined): string[] {
  if (!url) return []
  try {
    const parsed = JSON.parse(url)
    if (Array.isArray(parsed)) {
      return parsed.filter(Boolean)
    }
  } catch (e) {
    // Fallback to treat as a single URL if it's not JSON
  }
  return [url].filter(Boolean)
}

interface OrdersClientProps {
  initialOrders: DatabaseOrder[]
}

export function getOrderTypeFromItems(items?: DatabaseOrderItem[]): string {
  if (!items || items.length === 0) return 'PENDING'
  const hasMaterial = items.some(item => item.item_type === 'MATERIAL')
  const hasFinishedGoods = items.some(item => item.item_type === 'FINISHED_GOODS' || item.item_type === 'PRODUCT')
  if (hasMaterial && hasFinishedGoods) return 'MIXED'
  if (hasMaterial) return 'MATERIAL'
  if (hasFinishedGoods) return 'PRODUCT'
  return 'PENDING'
}

export function OrdersClient({ initialOrders }: OrdersClientProps) {
  const { userRole, searchQuery } = useSourcing()
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>('overview')
  
  const formatOrderType = (type: string) => {
    if (!type) return '-'
    const upper = type.toUpperCase()
    if (upper === 'MATERIAL') return 'Material'
    if (upper === 'PRODUCT' || upper === 'FINISHED_GOODS') return 'Product'
    if (upper === 'MIXED') return 'Mixed'
    if (upper === 'PENDING') return 'Pending'
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
  }
  
  // Modal toggle states
  const [isOpen, setIsOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<DatabaseOrder | null>(null)
  const [editingOrder, setEditingOrder] = useState<DatabaseOrder | null>(null)
  const [deletingOrder, setDeletingOrder] = useState<DatabaseOrder | null>(null)

  // Submit and delete loader states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Error messaging states
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)
  
  // Creation form states
  const [formData, setFormData] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    estimatedDeliveryDate: ''
  })
  const [items, setItems] = useState<Array<{ itemName: string; quantity: number; specFiles: File[] }>>([
    { itemName: '', quantity: 1, specFiles: [] }
  ])

  // Editing form states
  const [editFormData, setEditFormData] = useState({
    orderDate: '',
    estimatedDeliveryDate: ''
  })
  const [editItems, setEditItems] = useState<Array<{ itemName: string; quantity: number; specFiles: File[]; specFileUrls: string[]; itemType?: string }>>([])

  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  // --- Helpers for Item arrays (Create) ---
  const handleAddItem = () => {
    setItems([...items, { itemName: '', quantity: 1, specFiles: [] }])
  }

  const handleRemoveItem = (index: number) => {
    const newItems = [...items]
    newItems.splice(index, 1)
    setItems(newItems)
  }

  const handleItemChange = (index: number, field: 'itemName' | 'quantity' | 'specFiles', value: any) => {
    const newItems = [...items]
    newItems[index] = {
      ...newItems[index],
      [field]: value
    }
    setItems(newItems)
  }

  // --- Helpers for Item arrays (Edit) ---
  const handleAddEditItem = () => {
    setEditItems([...editItems, { itemName: '', quantity: 1, specFiles: [], specFileUrls: [] }])
  }

  const handleRemoveEditItem = (index: number) => {
    const newItems = [...editItems]
    newItems.splice(index, 1)
    setEditItems(newItems)
  }

  const handleEditItemChange = (index: number, field: 'itemName' | 'quantity' | 'specFiles' | 'specFileUrls', value: any) => {
    const newItems = [...editItems]
    newItems[index] = {
      ...newItems[index],
      [field]: value
    }
    setEditItems(newItems)
  }

  // --- Action Handlers ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (items.some(item => !item.itemName || item.quantity <= 0)) {
      setErrorMessage('Please fill in all item names and ensure quantities are greater than 0.')
      return
    }

    if (!formData.estimatedDeliveryDate) {
      setErrorMessage('Please select an estimated delivery date.')
      return
    }

    if (new Date(formData.estimatedDeliveryDate) < new Date(formData.orderDate)) {
      setErrorMessage('Estimated delivery date cannot be before the order date.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      // Upload any selected specs files to Cloudflare R2 in parallel
      const itemsInput = await Promise.all(
        items.map(async (item) => {
          const uploadedUrls = await Promise.all(
            item.specFiles.map(file => uploadFile(file))
          )
          
          const specFileUrl = uploadedUrls.length > 0 ? JSON.stringify(uploadedUrls) : ''
          
          return {
            itemName: item.itemName,
            quantity: item.quantity,
            specFileUrl
          }
        })
      )

      const result = await createOrderAction({
        orderDate: formData.orderDate,
        estimatedDeliveryDate: formData.estimatedDeliveryDate,
        items: itemsInput
      })

      setIsSubmitting(false)

      if (result.success) {
        setFormData({
          orderDate: new Date().toISOString().split('T')[0],
          estimatedDeliveryDate: ''
        })
        setItems([{ itemName: '', quantity: 1, specFiles: [] }])
        setIsOpen(false)
      } else {
        setErrorMessage(result.error || 'Failed to create order.')
      }
    } catch (error: any) {
      setIsSubmitting(false)
      setErrorMessage(error.message || 'Failed to upload files or create order.')
    }
  }

  const handleStartEdit = (order: DatabaseOrder) => {
    setEditingOrder(order)
    setEditFormData({
      orderDate: order.order_date ? new Date(order.order_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      estimatedDeliveryDate: order.estimated_delivery_date ? new Date(order.estimated_delivery_date).toISOString().split('T')[0] : ''
    })
    
    const existingItems = order.order_items || []
    if (existingItems.length > 0) {
      setEditItems(existingItems.map(item => ({
        itemName: item.item_name,
        quantity: item.quantity,
        specFiles: [],
        specFileUrls: parseSpecFileUrls(item.spec_file_url),
        itemType: item.item_type || 'PENDING'
      })))
    } else {
      setEditItems([{ itemName: '', quantity: 1, specFiles: [], specFileUrls: [] }])
    }
    
    setEditErrorMessage(null)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOrder) return

    if (editItems.some(item => !item.itemName || item.quantity <= 0)) {
      setEditErrorMessage('Please fill in all item names and ensure quantities are greater than 0.')
      return
    }

    if (!editFormData.estimatedDeliveryDate) {
      setEditErrorMessage('Please select an estimated delivery date.')
      return
    }

    if (new Date(editFormData.estimatedDeliveryDate) < new Date(editFormData.orderDate)) {
      setEditErrorMessage('Estimated delivery date cannot be before the order date.')
      return
    }

    setIsSubmitting(true)
    setEditErrorMessage(null)

    try {
      // Upload any new specs files to Cloudflare R2
      const itemsInput = await Promise.all(
        editItems.map(async (item) => {
          const newUrls = await Promise.all(
            item.specFiles.map(file => uploadFile(file))
          )
          
          const allUrls = [...item.specFileUrls, ...newUrls]
          const specFileUrl = allUrls.length > 0 ? JSON.stringify(allUrls) : ''
          
          return {
            itemName: item.itemName,
            quantity: item.quantity,
            specFileUrl,
            itemType: item.itemType || 'PENDING'
          }
        })
      )

      const result = await updateOrderAction({
        orderId: editingOrder.id,
        orderType: getOrderTypeFromItems(editingOrder.order_items) as any,
        orderDate: editFormData.orderDate,
        estimatedDeliveryDate: editFormData.estimatedDeliveryDate,
        items: itemsInput
      })

      setIsSubmitting(false)

      if (result.success) {
        setEditingOrder(null)
      } else {
        setEditErrorMessage(result.error || 'Failed to update order.')
      }
    } catch (error: any) {
      setIsSubmitting(false)
      setEditErrorMessage(error.message || 'Failed to upload files or update order.')
    }
  }

  const handleStartDelete = (order: DatabaseOrder) => {
    setDeletingOrder(order)
    setDeleteErrorMessage(null)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingOrder) return

    setIsDeleting(true)
    setDeleteErrorMessage(null)

    const result = await deleteOrderAction(deletingOrder.id)

    setIsDeleting(false)

    if (result.success) {
      setDeletingOrder(null)
    } else {
      setDeleteErrorMessage(result.error || 'Failed to delete order.')
    }
  }

  // Filter orders based on global search query
  const filteredOrders = initialOrders.filter((order) => {
    const computedType = getOrderTypeFromItems(order.order_items)
    return (
      order.order_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      computedType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.stage.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.order_items && order.order_items.some(item => item.item_name.toLowerCase().includes(searchQuery.toLowerCase())))
    )
  })

  const getStageBadgeColor = (stage: string) => {
    switch (stage.toLowerCase()) {
      case 'sourcing':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400'
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400'
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Order Management
          </h1>
          <p className="text-sm text-slate-500">
            Phase 1: Monitor active supply chain purchase orders and ingest material specs
          </p>
        </div>

        {isStaffOrAdmin && (
          <Button onClick={() => setIsOpen(true)} className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer">
            <PlusCircle size={16} />
            <span>Create Order</span>
          </Button>
        )}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Orders</CardTitle>
                <Package className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">{initialOrders.length}</div>
                <p className="text-[10px] text-slate-400 mt-1">Active purchase orders in database</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Material Orders</CardTitle>
                <Package className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {initialOrders.filter(o => getOrderTypeFromItems(o.order_items) === 'MATERIAL').length}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Raw material purchase orders</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Product Orders</CardTitle>
                <Package className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {initialOrders.filter(o => getOrderTypeFromItems(o.order_items) === 'PRODUCT').length}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Finished product orders</p>
              </CardContent>
            </Card>
          </div>

          {/* Workflow progress or Distribution chart */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Order Pipeline Distribution</CardTitle>
                <CardDescription className="text-xs">Workflow division of running campaigns</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Draft / Definition', pct: '85%' },
                  { label: 'Sourcing Phase', pct: '60%' },
                  { label: 'Audit / QC', pct: '45%' },
                  { label: 'Shipped / Inbound', pct: '70%' }
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
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Recent Order Updates</CardTitle>
                <CardDescription className="text-xs">Latest active updates in this stage</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {initialOrders.length === 0 ? (
                  <p className="text-xs text-slate-400">No active updates available.</p>
                ) : (
                  initialOrders.slice(0, 3).map((order, idx) => (
                    <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {order.order_code}
                      </button>
                      <div className="flex-1 space-y-0.5">
                        <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                          Order was created on {new Date(order.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-[10px] text-slate-400">Status: {order.stage}</p>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">Active Purchase Orders</CardTitle>
              <CardDescription className="text-xs">
                Click anywhere on a row to view complete order details & documents.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs">
              <Download size={12} />
              <span>Export CSV</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                    <th className="px-6 py-4 text-left">Order Code</th>
                    <th className="px-6 py-4 text-center">Order Type</th>
                    <th className="px-6 py-4 text-center">Stage</th>
                    <th className="px-6 py-4 text-center">Product Items</th>
                    <th className="px-6 py-4 text-center">Order Date</th>
                    <th className="px-6 py-4 text-center">Est. Delivery</th>
                    <th className="px-6 py-4 text-right pr-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                        No orders found. {searchQuery ? 'Try adjusting your search query.' : 'Click Create Order to add one.'}
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4 font-bold text-indigo-600 dark:text-indigo-400 hover:underline text-left">
                          {order.order_code}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline" className="text-xs font-semibold capitalize bg-slate-50 dark:bg-slate-900">
                            {formatOrderType(getOrderTypeFromItems(order.order_items))}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="outline" className={getStageBadgeColor(order.stage)}>
                            {order.stage}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <Layers size={13} className="text-slate-400" />
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {order.order_items?.length || 0} items
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500 text-center">
                          {order.order_date ? new Date(order.order_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          }) : '-'}
                        </td>
                        <td className="px-6 py-4 text-slate-500 font-medium text-center">
                          {order.estimated_delivery_date ? new Date(order.estimated_delivery_date).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          }) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right pr-8" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            {isStaffOrAdmin && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStartEdit(order)}
                                  className="h-8 w-8 p-0 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-100 dark:border-indigo-900/40 cursor-pointer rounded-lg"
                                  title="Update Order"
                                >
                                  <Edit3 size={14} />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setDeletingOrder(order)}
                                  className="h-8 w-8 p-0 text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 border-red-100 dark:border-red-900/40 cursor-pointer rounded-lg"
                                  title="Delete Order"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* CREATE Modal Dialog Form */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 relative my-8">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              Create New Sourcing Order
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              Enter the specification details to insert into Supabase database.
            </p>

            {errorMessage && (
              <div className="p-3 mb-4 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-start gap-2 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/40">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="orderCode" className="text-sm font-bold text-slate-700 dark:text-slate-300">Order Code</Label>
                <Input
                  id="orderCode"
                  value="Automatically Generated (ORD-YYYY-XXXX)"
                  disabled
                  className="h-11 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 font-semibold text-slate-500 border-dashed border-slate-200"
                />
              </div>

              {/* Order Type is INTENTIONALLY removed — will be classified by Sourcing team in Phase 2 */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/40 px-4 py-3 flex items-start gap-2.5">
                <AlertCircle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Order Type will be classified later</p>
                  <p className="text-[11px] text-amber-600/80 dark:text-amber-500/80 mt-0.5">
                    The Sourcing team will classify this order as Material or Product in Phase 2.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="orderDate" className="text-sm font-bold text-slate-700 dark:text-slate-300">Order Date</Label>
                  <Input
                    id="orderDate"
                    type="date"
                    value={formData.orderDate}
                    onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                    required
                    className="h-11 text-sm rounded-lg"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="estimatedDeliveryDate" className="text-sm font-bold text-slate-700 dark:text-slate-300">Est. Delivery Date</Label>
                  <Input
                    id="estimatedDeliveryDate"
                    type="date"
                    value={formData.estimatedDeliveryDate}
                    onChange={(e) => setFormData({ ...formData, estimatedDeliveryDate: e.target.value })}
                    required
                    min={formData.orderDate}
                    className="h-11 text-sm rounded-lg"
                  />
                </div>
              </div>

              {/* Dynamic items section */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Product Items</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddItem}
                    className="h-7 text-[10px] gap-1 px-2 border-dashed border-slate-300 hover:border-slate-400 cursor-pointer"
                  >
                    <PlusCircle size={12} />
                    <span>Add Item</span>
                  </Button>
                </div>

                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 border border-slate-100 dark:border-slate-800 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">
                  {/* Grid Headers */}
                  <div className="grid grid-cols-12 gap-3 mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                    <div className="col-span-6">Product Name</div>
                    <div className="col-span-2">Quantity</div>
                    <div className="col-span-3">Spec File</div>
                    <div className="col-span-1 text-center">Delete</div>
                  </div>

                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-center border-b border-slate-100 dark:border-slate-800/60 pb-3 last:border-0 last:pb-0 px-1">
                        {/* Product Name */}
                        <div className="col-span-6">
                          <Input
                            placeholder="Product Name"
                            value={item.itemName}
                            onChange={(e) => handleItemChange(index, 'itemName', e.target.value)}
                            required
                            className="h-11 text-sm rounded-lg"
                          />
                        </div>
                        
                        {/* Quantity */}
                        <div className="col-span-2">
                          <Input
                            type="number"
                            min="1"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                            required
                            className="h-11 text-sm rounded-lg"
                          />
                        </div>

                        {/* File spec */}
                        <div className="col-span-3 relative">
                          <input
                            type="file"
                            id={`file-${index}`}
                            multiple
                            onChange={(e) => {
                              const newFiles = Array.from(e.target.files || [])
                              handleItemChange(index, 'specFiles', [...item.specFiles, ...newFiles])
                            }}
                            className="hidden"
                          />
                          <label
                            htmlFor={`file-${index}`}
                            className="flex items-center gap-1.5 h-11 w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer overflow-hidden whitespace-nowrap text-ellipsis"
                          >
                            <Download size={13} className="shrink-0 text-slate-400" />
                            <span className="truncate">Choose files...</span>
                          </label>

                          {/* Selected files list */}
                          {item.specFiles.length > 0 && (
                            <div className="mt-1.5 space-y-1 max-h-[70px] overflow-y-auto">
                              {item.specFiles.map((file, fileIdx) => (
                                <div key={fileIdx} className="flex items-center justify-between text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">
                                  <span className="truncate max-w-[120px]">{file.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newFiles = item.specFiles.filter((_, fIdx) => fIdx !== fileIdx)
                                      handleItemChange(index, 'specFiles', newFiles)
                                    }}
                                    className="text-slate-400 hover:text-rose-500 ml-1 cursor-pointer"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Delete button */}
                        <div className="col-span-1 flex justify-center">
                          {items.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer shrink-0"
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : (
                            <div className="w-8 h-8" /> // Empty space for alignment
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#5c59e9] hover:bg-[#4a47d2]"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPDATE / EDIT Modal Dialog Form */}
      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 relative my-8">
            <button
              onClick={() => setEditingOrder(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X size={18} />
            </button>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5">
              <Edit3 size={20} className="text-indigo-600 dark:text-indigo-400" />
              <span>Update Sourcing Order</span>
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              Modify details for order <span className="font-bold text-slate-700 dark:text-slate-200">{editingOrder.order_code}</span>.
            </p>

            {editErrorMessage && (
              <div className="p-3 mb-4 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-start gap-2 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/40">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{editErrorMessage}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-5">
              {/* Order Code (Disabled) */}
              <div className="space-y-1.5">
                <Label htmlFor="editOrderCode" className="text-sm font-bold text-slate-700 dark:text-slate-300">Order Code</Label>
                <Input
                  id="editOrderCode"
                  value={editingOrder.order_code}
                  disabled
                  className="h-11 text-sm rounded-lg bg-slate-50 dark:bg-slate-900 font-semibold text-slate-600 border border-slate-200"
                />
              </div>

              {/* Order Type — read-only, classified by Sourcing team in Phase 2 */}
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">Order Type</Label>
                <div className="h-11 flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 gap-2">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${
                    getOrderTypeFromItems(editingOrder.order_items) === 'MATERIAL'
                      ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900'
                      : (getOrderTypeFromItems(editingOrder.order_items) === 'PRODUCT' || getOrderTypeFromItems(editingOrder.order_items) === 'FINISHED_GOODS')
                      ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900'
                      : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900'
                  }`}>
                    {formatOrderType(getOrderTypeFromItems(editingOrder.order_items))}
                  </span>
                  <span className="text-xs text-slate-400">Classified by Sourcing team</span>
                </div>
              </div>

              {/* Date Pickers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="editOrderDate" className="text-sm font-bold text-slate-700 dark:text-slate-300">Order Date</Label>
                  <Input
                    id="editOrderDate"
                    type="date"
                    value={editFormData.orderDate}
                    onChange={(e) => setEditFormData({ ...editFormData, orderDate: e.target.value })}
                    required
                    className="h-11 text-sm rounded-lg"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="editEstimatedDeliveryDate" className="text-sm font-bold text-slate-700 dark:text-slate-300">Est. Delivery Date</Label>
                  <Input
                    id="editEstimatedDeliveryDate"
                    type="date"
                    value={editFormData.estimatedDeliveryDate}
                    onChange={(e) => setEditFormData({ ...editFormData, estimatedDeliveryDate: e.target.value })}
                    required
                    min={editFormData.orderDate}
                    className="h-11 text-sm rounded-lg"
                  />
                </div>
              </div>

              {/* Dynamic products list for editing */}
              <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Product Items</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddEditItem}
                    className="h-7 text-[10px] gap-1 px-2 border-dashed border-slate-300 hover:border-slate-400 cursor-pointer"
                  >
                    <PlusCircle size={12} />
                    <span>Add Item</span>
                  </Button>
                </div>

                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1 border border-slate-100 dark:border-slate-800 rounded-lg p-3 bg-slate-50/50 dark:bg-slate-900/30">
                  {/* Grid Headers */}
                  <div className="grid grid-cols-12 gap-3 mb-2 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
                    <div className="col-span-6">Product Name</div>
                    <div className="col-span-2">Quantity</div>
                    <div className="col-span-3">Spec File</div>
                    <div className="col-span-1 text-center">Delete</div>
                  </div>

                  <div className="space-y-3">
                    {editItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-center border-b border-slate-100 dark:border-slate-800/60 pb-3 last:border-0 last:pb-0 px-1">
                        {/* Product Name */}
                        <div className="col-span-6">
                          <Input
                            placeholder="Product Name"
                            value={item.itemName}
                            onChange={(e) => handleEditItemChange(index, 'itemName', e.target.value)}
                            required
                            className="h-11 text-sm rounded-lg"
                          />
                        </div>
                        
                        {/* Quantity */}
                        <div className="col-span-2">
                          <Input
                            type="number"
                            min="1"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => handleEditItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                            required
                            className="h-11 text-sm rounded-lg"
                          />
                        </div>

                        {/* File spec */}
                        <div className="col-span-3 relative">
                          <input
                            type="file"
                            id={`edit-file-${index}`}
                            multiple
                            onChange={(e) => {
                              const newFiles = Array.from(e.target.files || [])
                              handleEditItemChange(index, 'specFiles', [...item.specFiles, ...newFiles])
                            }}
                            className="hidden"
                          />
                          <label
                            htmlFor={`edit-file-${index}`}
                            className="flex items-center gap-1.5 h-11 w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-2.5 rounded-lg text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer overflow-hidden whitespace-nowrap text-ellipsis"
                          >
                            <Download size={13} className="shrink-0 text-slate-400" />
                            <span className="truncate">Choose files...</span>
                          </label>

                          {/* List of existing uploaded files */}
                          {item.specFileUrls && item.specFileUrls.length > 0 && (
                            <div className="mt-1.5 space-y-1 max-h-[70px] overflow-y-auto">
                              {item.specFileUrls.map((url, urlIdx) => (
                                <div key={urlIdx} className="flex items-center justify-between text-xs bg-indigo-50 dark:bg-indigo-950/30 px-2 py-1 rounded text-indigo-600 dark:text-indigo-400 border border-indigo-100/40">
                                  <span className="truncate max-w-[120px]">{getFilenameFromUrl(url)}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newUrls = item.specFileUrls.filter((_, uIdx) => uIdx !== urlIdx)
                                      handleEditItemChange(index, 'specFileUrls', newUrls)
                                    }}
                                    className="text-indigo-400 hover:text-rose-500 ml-1 cursor-pointer"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* List of newly selected files */}
                          {item.specFiles && item.specFiles.length > 0 && (
                            <div className="mt-1.5 space-y-1 max-h-[70px] overflow-y-auto">
                              {item.specFiles.map((file, fileIdx) => (
                                <div key={fileIdx} className="flex items-center justify-between text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">
                                  <span className="truncate max-w-[120px]">{file.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newFiles = item.specFiles.filter((_, fIdx) => fIdx !== fileIdx)
                                      handleEditItemChange(index, 'specFiles', newFiles)
                                    }}
                                    className="text-slate-400 hover:text-rose-500 ml-1 cursor-pointer"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Delete button */}
                        <div className="col-span-1 flex justify-center">
                          {editItems.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveEditItem(index)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer shrink-0"
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : (
                            <div className="w-8 h-8" /> // Empty space for alignment
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingOrder(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#5c59e9] hover:bg-[#4a47d2]"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Updating...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE Alert Dialog Overlay */}
      {deletingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 relative">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <AlertCircle className="text-rose-500 shrink-0" size={20} />
              <span>Delete Purchase Order</span>
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              Are you sure you want to delete order <span className="font-bold text-slate-900 dark:text-white">{deletingOrder.order_code}</span>? 
              This will permanently delete the purchase order and all of its related <span className="font-bold">{deletingOrder.order_items?.length || 0} product item specs</span> from the database. This action cannot be undone.
            </p>

            {deleteErrorMessage && (
              <div className="p-3 mb-4 rounded-lg bg-rose-50 text-rose-700 text-xs flex items-start gap-2 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/40">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{deleteErrorMessage}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeletingOrder(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDeleteConfirm}
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete Order'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* DETAILS VIEW Dialog Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 relative">
            <button
              onClick={() => setSelectedOrder(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <Package size={14} />
              </span>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Purchase Order Details
              </h2>
            </div>

            {/* Order Meta Info */}
            <div className="grid grid-cols-2 gap-5 border-b border-slate-100 dark:border-slate-800 pb-5 mb-5 text-xs sm:text-sm">
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Order Code</span>
                <span className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">{selectedOrder.order_code}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Order Type</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 text-sm sm:text-base">{formatOrderType(getOrderTypeFromItems(selectedOrder.order_items))}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Order Date</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm sm:text-base">
                  {selectedOrder.order_date ? new Date(selectedOrder.order_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  }) : '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Est. Delivery Date</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-sm sm:text-base">
                  {selectedOrder.estimated_delivery_date ? new Date(selectedOrder.estimated_delivery_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  }) : '-'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5 font-medium">Status Stage</span>
                <Badge variant="outline" className={`mt-0.5 text-xs px-2.5 py-0.5 ${getStageBadgeColor(selectedOrder.stage)}`}>
                  {selectedOrder.stage}
                </Badge>
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Products Included ({selectedOrder.order_items?.length || 0})
              </span>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                {!selectedOrder.order_items || selectedOrder.order_items.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6 italic">No items listed for this order.</p>
                ) : (
                  selectedOrder.order_items.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800/80 grid grid-cols-3 items-center gap-4 text-sm"
                    >
                      {/* Column 1: Product Item Name & Specs */}
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider">Product Item</span>
                        <p className="font-bold text-slate-900 dark:text-white text-base">
                          {item.item_name}
                        </p>
                        {item.spec_file_url && (
                          <div className="flex flex-col gap-1.5 mt-1" onClick={(e) => e.stopPropagation()}>
                            {parseSpecFileUrls(item.spec_file_url).map((url, urlIdx) => (
                              <a
                                key={urlIdx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline font-medium"
                              >
                                <FileText size={13} className="text-indigo-400 shrink-0" />
                                <span className="truncate max-w-[100px] sm:max-w-[140px]">{getFilenameFromUrl(url)}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Column 2: Classification Type */}
                      <div className="flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider mb-1">Item Type</span>
                        <Badge variant="outline" className={`text-[10px] font-bold px-2.5 py-0.5 uppercase tracking-wide ${
                          item.item_type === 'MATERIAL'
                            ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900'
                            : (item.item_type === 'FINISHED_GOODS' || item.item_type === 'PRODUCT')
                            ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/20 dark:text-violet-400 dark:border-violet-900'
                            : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900'
                        }`}>
                          {item.item_type === 'MATERIAL' ? 'Material' : (item.item_type === 'FINISHED_GOODS' || item.item_type === 'PRODUCT') ? 'Product' : 'Pending'}
                        </Badge>
                      </div>

                      {/* Column 3: Quantity */}
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider mb-0.5">Quantity</span>
                        <span className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg">{item.quantity}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
              <Button size="sm" onClick={() => setSelectedOrder(null)} className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
