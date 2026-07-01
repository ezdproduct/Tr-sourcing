'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSourcing } from '@/providers/sourcing-provider'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  createOrderAction, 
  updateOrderAction, 
  deleteOrderAction, 
  deleteOrdersBatchAction, 
  updateOrderStageAction 
} from './actions'
import { KanbanBoard } from './kanban-board'
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
  Edit3,
  TrendingUp,
  CheckCircle2,
  Clock,
  ChevronDown,
  SlidersHorizontal,
  Search,
  ChevronRight,
  Users2,
  User,
  Mail,
  Phone,
  Globe,
  MapPin
} from 'lucide-react'

export interface SupplierDetails {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  website?: string | null
  contact_person?: string | null
  tax_id?: string | null
  business_type?: string | null
  supplier_code?: string | null
  legal_name?: string | null
  main_products?: string[] | null
  short_description?: string | null
  status?: string | null
  sourcing_stage?: string | null
  quality_rating?: string | null
  reliability_score?: number | null
}

export interface DatabaseOrderItem {
  id: string
  order_id: string
  item_name: string
  quantity: number
  spec_file_url: string | null
  created_at: string
  item_type?: string
  uom?: string
  selected_supplier_id?: string | null
  suppliers?: SupplierDetails | null
}

export interface DatabaseStageTimeline {
  id: string
  order_id: string
  stage_name: string
  estimated_start_date: string
  estimated_end_date: string
  actual_start_date?: string | null
  actual_end_date?: string | null
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
  order_stage_timelines?: DatabaseStageTimeline[]
  suppliers?: SupplierDetails | null
  order_suppliers?: {
    supplier_name: string
    is_shortlisted: boolean
    supplier_id?: string | null
    suppliers?: SupplierDetails | null
    quoted_price?: string | null
    lead_time_days?: number | null
    order_items?: {
      item_name: string
    } | null
  }[]
  factory_audits?: {
    id: string
    supplier_id: string
    audit_status: string
    suppliers?: SupplierDetails | null
  }[]
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
  const searchParams = useSearchParams()
  const initialSubtab = (searchParams.get('subtab') as 'overview' | 'workplace') || 'overview'
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>(initialSubtab)
  const [viewMode, setViewMode] = useState<'analytics' | 'kanban'>('analytics')

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
    setSelectedOrderIds([])
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?subtab=${val}`
      window.history.pushState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
    }
  }
  
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
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([])
  const [selectedSupplierForModal, setSelectedSupplierForModal] = useState<any | null>(null)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)

  // Submit and delete loader states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [sidebarOrderSearch, setSidebarOrderSearch] = useState('')

  // Error messaging states
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null)
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null)
  
  // Creation form states
  const [formData, setFormData] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    estimatedDeliveryDate: ''
  })
  const [items, setItems] = useState<Array<{ itemName: string; quantity: number | ''; uom: string; specFiles: File[] }>>([
    { itemName: '', quantity: 1, uom: 'pcs', specFiles: [] }
  ])
  const [stageTimelines, setStageTimelines] = useState<Array<{ stageName: string; estimatedStartDate: string; estimatedEndDate: string }>>([])

  // Editing form states
  const [editFormData, setEditFormData] = useState({
    orderDate: '',
    estimatedDeliveryDate: ''
  })
  const [editItems, setEditItems] = useState<Array<{ itemName: string; quantity: number | ''; uom: string; specFiles: File[]; specFileUrls: string[]; itemType?: string }>>([])
  const [editStage, setEditStage] = useState<string>('')
  const [editStageTimelines, setEditStageTimelines] = useState<Array<{ stageName: string; estimatedStartDate: string; estimatedEndDate: string }>>([])

  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  const handleStageChange = async (orderId: string, newStage: string) => {
    const result = await updateOrderStageAction(orderId, newStage)
    if (!result.success) {
      alert(`Failed to update order stage: ${result.error}`)
      return false
    }
    return true
  }

  // Helper to split duration into 6 equal stages
  const calculateEqualStages = (startDateStr: string, endDateStr: string) => {
    if (!startDateStr || !endDateStr) return []
    const start = new Date(startDateStr).getTime()
    const end = new Date(endDateStr).getTime()
    if (isNaN(start) || isNaN(end) || end < start) return []
    
    const stageNames = ['Order', 'Sourcing', 'QC', 'Create PO', 'Inspection', 'Logistic', 'Production', 'Order Done']
    const totalMs = end - start
    const chunkMs = totalMs / 8
    
    return stageNames.map((name, idx) => {
      const sTime = start + chunkMs * idx
      const eTime = start + chunkMs * (idx + 1)
      return {
        stageName: name,
        estimatedStartDate: new Date(sTime).toISOString().split('T')[0],
        estimatedEndDate: new Date(eTime).toISOString().split('T')[0]
      }
    })
  }

  const handleCreateDateChange = (field: 'orderDate' | 'estimatedDeliveryDate', value: string) => {
    const newFormData = { ...formData, [field]: value }
    setFormData(newFormData)
    
    if (newFormData.orderDate && newFormData.estimatedDeliveryDate) {
      const calculated = calculateEqualStages(newFormData.orderDate, newFormData.estimatedDeliveryDate)
      setStageTimelines(calculated)
    }
  }

  const handleEditDateChange = (field: 'orderDate' | 'estimatedDeliveryDate', value: string) => {
    const newEditFormData = { ...editFormData, [field]: value }
    setEditFormData(newEditFormData)
    
    if (newEditFormData.orderDate && newEditFormData.estimatedDeliveryDate) {
      const calculated = calculateEqualStages(newEditFormData.orderDate, newEditFormData.estimatedDeliveryDate)
      setEditStageTimelines(calculated)
    }
  }

  const handleStageTimelineChange = (index: number, field: 'estimatedStartDate' | 'estimatedEndDate', value: string) => {
    const updated = [...stageTimelines]
    updated[index] = { ...updated[index], [field]: value }
    setStageTimelines(updated)
  }
  
  const handleEditStageTimelineChange = (index: number, field: 'estimatedStartDate' | 'estimatedEndDate', value: string) => {
    const updated = [...editStageTimelines]
    updated[index] = { ...updated[index], [field]: value }
    setEditStageTimelines(updated)
  }

  // --- Helpers for Item arrays (Create) ---
  const handleAddItem = () => {
    setItems([...items, { itemName: '', quantity: 1, uom: 'pcs', specFiles: [] }])
  }

  const handleRemoveItem = (index: number) => {
    const newItems = [...items]
    newItems.splice(index, 1)
    setItems(newItems)
  }

  const handleItemChange = (index: number, field: 'itemName' | 'quantity' | 'uom' | 'specFiles', value: any) => {
    const newItems = [...items]
    newItems[index] = {
      ...newItems[index],
      [field]: value
    }
    setItems(newItems)
  }

  // --- Helpers for Item arrays (Edit) ---
  const handleAddEditItem = () => {
    setEditItems([...editItems, { itemName: '', quantity: 1, uom: 'pcs', specFiles: [], specFileUrls: [] }])
  }

  const handleRemoveEditItem = (index: number) => {
    const newItems = [...editItems]
    newItems.splice(index, 1)
    setEditItems(newItems)
  }

  const handleEditItemChange = (index: number, field: 'itemName' | 'quantity' | 'uom' | 'specFiles' | 'specFileUrls', value: any) => {
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
    
    if (items.some(item => !item.itemName || item.quantity === '' || item.quantity <= 0)) {
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
            quantity: Number(item.quantity),
            specFileUrl,
            uom: item.uom || 'pcs'
          }
        })
      )

      const result = await createOrderAction({
        orderDate: formData.orderDate,
        estimatedDeliveryDate: formData.estimatedDeliveryDate,
        items: itemsInput,
        stageTimelines: stageTimelines.map(st => ({
          stageName: st.stageName.toLowerCase(),
          estimatedStartDate: st.estimatedStartDate,
          estimatedEndDate: st.estimatedEndDate
        }))
      })

      setIsSubmitting(false)

      if (result.success) {
        setFormData({
          orderDate: new Date().toISOString().split('T')[0],
          estimatedDeliveryDate: ''
        })
        setItems([{ itemName: '', quantity: 1, uom: 'pcs', specFiles: [] }])
        setStageTimelines([])
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
        uom: item.uom || 'pcs',
        specFiles: [],
        specFileUrls: parseSpecFileUrls(item.spec_file_url),
        itemType: item.item_type || 'PENDING'
      })))
    } else {
      setEditItems([{ itemName: '', quantity: 1, uom: 'pcs', specFiles: [], specFileUrls: [] }])
    }

    // Initialize stage and stage timelines for edit dialog
    setEditStage(order.stage || 'Order')
    
    const existingTimelines = order.order_stage_timelines || []
    if (existingTimelines.length > 0) {
      const formatted = existingTimelines.map(t => {
        let name = t.stage_name || ''
        // Map lowercase DB name to capitalize display name
        if (name.toLowerCase() === 'qc') name = 'QC'
        else name = name ? name.charAt(0).toUpperCase() + name.slice(1) : ''
        
        return {
          stageName: name,
          estimatedStartDate: t.estimated_start_date ? new Date(t.estimated_start_date).toISOString().split('T')[0] : '',
          estimatedEndDate: t.estimated_end_date ? new Date(t.estimated_end_date).toISOString().split('T')[0] : ''
        }
      })
      const stageOrder = ['Order', 'Sourcing', 'QC', 'Create PO', 'Inspection', 'Logistic', 'Production', 'Order Done']
      formatted.sort((a, b) => stageOrder.indexOf(a.stageName) - stageOrder.indexOf(b.stageName))
      setEditStageTimelines(formatted)
    } else {
      const calculated = calculateEqualStages(
        order.order_date ? new Date(order.order_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        order.estimated_delivery_date ? new Date(order.estimated_delivery_date).toISOString().split('T')[0] : ''
      )
      setEditStageTimelines(calculated)
    }
    
    setEditErrorMessage(null)
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOrder) return

    if (editItems.some(item => !item.itemName || item.quantity === '' || item.quantity <= 0)) {
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
            quantity: Number(item.quantity),
            specFileUrl,
            itemType: item.itemType || 'PENDING',
            uom: item.uom || 'pcs'
          }
        })
      )

      const result = await updateOrderAction({
        orderId: editingOrder.id,
        orderType: getOrderTypeFromItems(editingOrder.order_items) as any,
        orderDate: editFormData.orderDate,
        estimatedDeliveryDate: editFormData.estimatedDeliveryDate,
        stage: editStage,
        items: itemsInput,
        stageTimelines: editStageTimelines.map(st => ({
          stageName: st.stageName.toLowerCase(),
          estimatedStartDate: st.estimatedStartDate,
          estimatedEndDate: st.estimatedEndDate
        }))
      })

      setIsSubmitting(false)

      if (result.success) {
        setEditingOrder(null)
        setEditStage('')
        setEditStageTimelines([])
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

  // Filter orders based on sidebar search query
  const sidebarFilteredOrders = initialOrders.filter((order) => {
    const computedType = getOrderTypeFromItems(order.order_items)
    return (
      order.order_code.toLowerCase().includes(sidebarOrderSearch.toLowerCase()) ||
      computedType.toLowerCase().includes(sidebarOrderSearch.toLowerCase()) ||
      order.stage.toLowerCase().includes(sidebarOrderSearch.toLowerCase()) ||
      (order.order_items && order.order_items.some(item => item.item_name.toLowerCase().includes(sidebarOrderSearch.toLowerCase())))
    )
  })

  const getStageBadgeColor = (stage: string) => {
    switch (stage.toLowerCase()) {
      case 'sourcing':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400'
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
      case 'po issued':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400'
      case 'partial po issued':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400'
    }
  }

  return (
    <div className="space-y-6">
      {/* Controls Row */}
      {subtab === 'overview' && (
        <div className="flex justify-end items-center gap-4">
          <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
            <Button
              variant={viewMode === 'analytics' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('analytics')}
              className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
                viewMode === 'analytics'
                  ? 'bg-white text-[#5c59e9] shadow-sm dark:bg-slate-800 dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <span>Analytics View</span>
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
                viewMode === 'kanban'
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

          {viewMode === 'analytics' ? (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* KPI Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Orders</CardTitle>
                    <Package className="h-4 w-4 text-indigo-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">{initialOrders.length}</div>
                    <p className="text-[10px] text-slate-400 mt-1">Total registered campaigns</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Open Orders</CardTitle>
                    <TrendingUp className="h-4 w-4 text-amber-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {initialOrders.filter(o => o.stage.toLowerCase() !== 'closed').length}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Orders currently in progress</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Closed Orders</CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {initialOrders.filter(o => o.stage.toLowerCase() === 'closed').length}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Orders completed &amp; reconciled</p>
                  </CardContent>
                </Card>

                <Card className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Cycle Time</CardTitle>
                    <Clock className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                      {(() => {
                        const closedOrders = initialOrders.filter(o => o.stage.toLowerCase() === 'closed')
                        if (closedOrders.length === 0) return 'N/A'
                        const totalDays = closedOrders.reduce((sum, order) => {
                          const start = new Date(order.order_date)
                          const end = order.estimated_delivery_date ? new Date(order.estimated_delivery_date) : new Date()
                          const diffTime = Math.abs(end.getTime() - start.getTime())
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                          return sum + diffDays
                        }, 0)
                        return `${Math.round(totalDays / closedOrders.length)} days`
                      })()}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Average duration of closed orders</p>
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
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Recent Active Updates</CardTitle>
                    <CardDescription className="text-xs">Latest active updates in this stage</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {initialOrders.length === 0 ? (
                      <p className="text-xs text-slate-400">No active orders.</p>
                    ) : (
                      initialOrders.slice(0, 3).map((order, idx) => (
                        <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                          <button
                            onClick={() => {
                              setSelectedOrder(order)
                              setSubtab('workplace')
                            }}
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
            <div className="animate-in fade-in duration-300">
              <KanbanBoard
                orders={filteredOrders}
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

      <TabsContent value="workplace" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0 animate-in fade-in duration-300">
        <div className="grid lg:grid-cols-[280px_1fr] -mx-8 -mt-8 -mb-8 h-[calc(100vh-4rem)] overflow-hidden">
          {/* Left column: Purchase Orders sidebar */}
          <div className="border-r border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-955 flex flex-col h-full overflow-hidden">
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-2 bg-slate-50/50 dark:bg-slate-900/10">
              {/* Row 1: Title & Create Button */}
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Purchase Orders</h3>
                {isStaffOrAdmin && (
                  <Button 
                    onClick={() => setIsOpen(true)} 
                    size="sm"
                    className="h-7 px-2 bg-[#5c59e9] hover:bg-[#4a47d2] text-[10px] font-bold rounded-lg cursor-pointer flex items-center gap-1 text-white"
                  >
                    <PlusCircle size={11} />
                    <span>Create Order</span>
                  </Button>
                )}
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

              {/* Row 3: Select All & Delete Action */}
              <div className="flex items-center justify-between pt-0.5">
                {sidebarFilteredOrders.length > 0 && (
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={sidebarFilteredOrders.length > 0 && sidebarFilteredOrders.every(o => selectedOrderIds.includes(o.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOrderIds(prev => {
                            const newIds = [...prev]
                            sidebarFilteredOrders.forEach(o => {
                              if (!newIds.includes(o.id)) newIds.push(o.id)
                            })
                            return newIds
                          })
                        } else {
                          setSelectedOrderIds(prev => prev.filter(id => !sidebarFilteredOrders.some(o => o.id === id)))
                        }
                      }}
                      className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                    />
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">Select All</span>
                  </label>
                )}

                {selectedOrderIds.length > 0 && isStaffOrAdmin && (
                  <button 
                    onClick={() => setIsBulkDeleteConfirmOpen(true)}
                    className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 font-bold text-[10px] transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <Trash2 size={11} />
                    <span>Delete ({selectedOrderIds.length})</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sidebarFilteredOrders.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400">
                  No orders found.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {sidebarFilteredOrders.map(order => (
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
                          <div onClick={(e) => e.stopPropagation()} className="flex items-center">
                            <input 
                              type="checkbox"
                              checked={selectedOrderIds.includes(order.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedOrderIds(prev => [...prev, order.id])
                                } else {
                                  setSelectedOrderIds(prev => prev.filter(id => id !== order.id))
                                }
                              }}
                              className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                            />
                          </div>
                          <FileText size={13} className={selectedOrder?.id === order.id ? 'text-[#5c59e9] dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
                          <span className={`text-xs font-bold truncate ${
                            selectedOrder?.id === order.id
                              ? 'text-[#5c59e9] dark:text-indigo-400'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}>
                            {order.order_code}
                          </span>
                        </div>
                        <ChevronRight size={12} className={selectedOrder?.id === order.id ? 'text-[#5c59e9] dark:text-indigo-400' : 'text-slate-350'} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Right column: main workplace card */}
          <div className="flex flex-col h-full overflow-y-auto p-4 bg-slate-50/30 dark:bg-slate-955/10">
            {!selectedOrder ? (
              <Card className="border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-xl">
                <CardContent className="p-12 flex flex-col items-center justify-center gap-3 text-center">
                  <Package size={36} className="text-slate-200 dark:text-slate-700 animate-pulse" />
                  <p className="text-sm text-slate-450 dark:text-slate-500 font-semibold">Select an order from the sidebar to begin</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm rounded-xl p-6">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                      <Package size={14} />
                    </span>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      Purchase Order Details
                    </h2>
                  </div>
                  {isStaffOrAdmin && (() => {
                    const isClassified = selectedOrder.stage !== 'Order' && 
                                         selectedOrder.stage !== 'Order Intake' && 
                                         selectedOrder.stage !== 'Pending Classification'
                    return (
                      <Button 
                        size="sm" 
                        onClick={() => handleStartEdit(selectedOrder)} 
                        disabled={isClassified}
                        title={isClassified ? "Classified orders cannot be edited" : undefined}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer h-8 text-xs font-semibold px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Edit Order
                      </Button>
                    )
                  })()}
                </div>

                <div className="space-y-6">
                  {/* Order Meta Info */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-5 border-b border-slate-100 dark:border-slate-800 pb-5 text-xs sm:text-sm">
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

                  {/* Delivery & Stage Timeline */}
                  <div className="border-b border-slate-100 dark:border-slate-800 pb-6 overflow-x-auto no-scrollbar">
                    <span className="text-slate-400 block mb-3 font-bold text-[10px] uppercase tracking-wider">Order Sourcing & Delivery Timeline</span>
                    {(() => {
                      const start = selectedOrder.order_date ? new Date(selectedOrder.order_date).getTime() : 0
                      const end = selectedOrder.estimated_delivery_date ? new Date(selectedOrder.estimated_delivery_date).getTime() : 0
                      const now = new Date().getTime()
                      
                      if (!start || !end) return <span className="text-xs text-slate-400">Timeline not available</span>
                      
                      const total = end - start
                      if (total <= 0) return <span className="text-xs text-slate-400">Invalid dates</span>
                      
                      let progressPct = ((now - start) / total) * 100
                      progressPct = Math.max(0, Math.min(100, progressPct))
                      
                      const daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24))
                      const daysElapsed = Math.floor((now - start) / (1000 * 60 * 60 * 24))
                      const stages = [
                        { name: 'Order' },
                        { name: 'Sourcing' },
                        { name: 'QC' },
                        { name: 'Create PO' },
                        { name: 'Inspection' },
                        { name: 'Logistic' },
                        { name: 'Production' },
                        { name: 'Order Done' }
                      ]
                      
                      const getStageIndex = (stg: string) => {
                        const s = stg ? stg.toLowerCase() : ''
                        if (s.includes('definition') || s.includes('draft') || s.includes('order')) return 0
                        if (s.includes('sourcing')) return 1
                        if (s.includes('audit') || s.includes('qc')) return 2
                        if (s.includes('ready') || s.includes('po')) return 3
                        if (s.includes('inspection passed') || s.includes('inspection_passed')) return 5
                        if (s.includes('inspection') || s.includes('port')) return 4
                        if (s.includes('logistics') || s.includes('inbound') || s.includes('logistic')) return 5
                        if (s.includes('production') || s.includes('run') || s.includes('stock') || s.includes('assemble')) return 6
                        if (s.includes('closed') || s.includes('completed') || s.includes('done')) return 7
                        return 1
                      }
                      
                      const activeIdx = getStageIndex(selectedOrder.stage)
                      const stageProgressPct = (activeIdx / (stages.length - 1)) * 100

                      const selectedSuppliers = (() => {
                        const list: { name: string; details?: any }[] = []
                        const seen = new Set<string>()
                        selectedOrder.order_suppliers?.forEach(os => {
                          if (os.supplier_name && !seen.has(os.supplier_name)) {
                            seen.add(os.supplier_name)
                            list.push({
                              name: os.supplier_name,
                              details: os.suppliers || { name: os.supplier_name }
                            })
                          }
                        })
                        if (selectedOrder.suppliers?.name && !seen.has(selectedOrder.suppliers.name)) {
                          seen.add(selectedOrder.suppliers.name)
                          list.push({
                            name: selectedOrder.suppliers.name,
                            details: selectedOrder.suppliers
                          })
                        }
                        selectedOrder.order_items?.forEach(item => {
                          if (item.suppliers?.name && !seen.has(item.suppliers.name)) {
                            seen.add(item.suppliers.name)
                            list.push({
                              name: item.suppliers.name,
                              details: item.suppliers
                            })
                          }
                        })
                        return list
                      })()

                      const qcSuppliers = (() => {
                        const list: { name: string; details?: any }[] = []
                        const seen = new Set<string>()
                        selectedOrder.factory_audits?.forEach(audit => {
                          const name = audit.suppliers?.name
                          if (name && !seen.has(name)) {
                            seen.add(name)
                            list.push({
                              name: name,
                              details: audit.suppliers
                            })
                          }
                        })
                        return list
                      })()
                      
                      return (
                        <div className="space-y-4 py-2 px-1 min-w-[700px]">
                          <div className="relative flex items-start justify-between w-full h-auto pb-4">
                            <div className="absolute left-[40px] right-[40px] top-[22px] h-1 bg-slate-100 dark:bg-slate-800 z-0 rounded-full border border-slate-200/20" />
                            <div 
                              className="absolute left-[40px] top-[22px] h-1 bg-[#5c59e9] transition-all duration-500 z-0 rounded-full"
                              style={{ width: `calc((100% - 80px) * (${stageProgressPct} / 100))` }}
                            />
                            
                            {stages.map((stage, idx) => {
                              const isCompleted = idx < activeIdx
                              const isActive = idx === activeIdx
                              
                              return (
                                <div key={idx} className="relative flex flex-col items-center z-10 w-20 pt-2">
                                  <div 
                                    className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold border transition-all duration-300 ${
                                      isCompleted 
                                        ? 'bg-[#5c59e9] border-[#5c59e9] text-white shadow-sm'
                                        : isActive
                                        ? 'bg-[#5c59e9] border-2 border-white text-white dark:border-slate-900 shadow-md ring-4 ring-indigo-100 dark:ring-indigo-950/40 scale-105'
                                        : 'bg-white border-2 border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-800'
                                    }`}
                                  >
                                    {isCompleted ? (
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    ) : isActive ? (
                                      <span>{idx + 1}</span>
                                    ) : (
                                      <span className="opacity-40">{idx + 1}</span>
                                    )}
                                  </div>
                                  <div className="mt-2 text-center w-24 flex flex-col items-center">
                                    <span 
                                      className={`block text-[10px] font-bold tracking-tight transition-colors duration-300 ${
                                        isActive 
                                          ? 'text-[#5c59e9]' 
                                          : isCompleted 
                                          ? 'text-slate-800 dark:text-slate-200 font-bold' 
                                          : 'text-slate-400'
                                      }`}
                                    >
                                      {stage.name}
                                    </span>
                                    {idx === 1 && selectedSuppliers.length > 0 && (
                                      <div className="flex flex-col items-center gap-1 mt-1.5 w-full">
                                        {selectedSuppliers.map((sup) => (
                                          <button
                                            key={sup.name}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setSelectedSupplierForModal(sup.details)
                                            }}
                                            className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-150 hover:bg-indigo-100 hover:text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/50 dark:hover:bg-indigo-900/50 dark:hover:text-indigo-300 max-w-[90px] truncate cursor-pointer transition-colors"
                                            title={`Click to view ${sup.name} details`}
                                          >
                                            {sup.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {idx === 2 && qcSuppliers.length > 0 && (
                                      <div className="flex flex-col items-center gap-1 mt-1.5 w-full">
                                        {qcSuppliers.map((sup) => (
                                          <button
                                            key={sup.name}
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setSelectedSupplierForModal(sup.details)
                                            }}
                                            className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-150 hover:bg-indigo-100 hover:text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-900/50 dark:hover:bg-indigo-900/50 dark:hover:text-indigo-300 max-w-[90px] truncate cursor-pointer transition-colors"
                                            title={`Click to view ${sup.name} details`}
                                          >
                                            {sup.name}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold pt-3 px-1 border-t border-slate-100 dark:border-slate-800/60 mt-2">
                            <span>Started: {selectedOrder.order_date ? new Date(selectedOrder.order_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'} ({daysElapsed}d elapsed)</span>
                            <span className="text-[#5c59e9] font-bold">
                              {daysLeft > 0 ? `${daysLeft} days remaining` : `Target Date Reached / Passed`}
                            </span>
                            <span>Delivery: {selectedOrder.estimated_delivery_date ? new Date(selectedOrder.estimated_delivery_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>

                  {/* Products Included */}
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
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 font-semibold block uppercase tracking-wider mb-0.5">Quantity</span>
                              <span className="font-extrabold text-slate-900 dark:text-white text-base sm:text-lg">
                                {item.quantity} <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{item.uom || 'pcs'}</span>
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </TabsContent>
      </Tabs>

      {/* CREATE Modal Dialog Form */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 relative my-8 max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
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
                    onChange={(e) => handleCreateDateChange('orderDate', e.target.value)}
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
                    onChange={(e) => handleCreateDateChange('estimatedDeliveryDate', e.target.value)}
                    required
                    min={formData.orderDate}
                    className="h-11 text-sm rounded-lg"
                  />
                </div>
              </div>

              {/* Stage Timelines Configuration */}
              {stageTimelines.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Estimated Stage Timelines (Auto-proposed)
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                    {stageTimelines.map((st, idx) => (
                      <div key={idx} className="p-3 border border-slate-100 dark:border-slate-800/80 rounded-lg bg-slate-50/50 dark:bg-slate-900/30 space-y-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                          Stage {idx + 1}: {st.stageName}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400">Start Date</label>
                            <Input
                              type="date"
                              value={st.estimatedStartDate}
                              onChange={(e) => handleStageTimelineChange(idx, 'estimatedStartDate', e.target.value)}
                              className="h-8 text-xs px-2"
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400">End Date</label>
                            <Input
                              type="date"
                              value={st.estimatedEndDate}
                              onChange={(e) => handleStageTimelineChange(idx, 'estimatedEndDate', e.target.value)}
                              className="h-8 text-xs px-2"
                              required
                              min={st.estimatedStartDate}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    <div className="col-span-5">Product Name</div>
                    <div className="col-span-2">Quantity</div>
                    <div className="col-span-2">Unit</div>
                    <div className="col-span-2">Spec File</div>
                    <div className="col-span-1 text-center">Delete</div>
                  </div>

                  <div className="space-y-3">
                    {items.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-center border-b border-slate-100 dark:border-slate-800/60 pb-3 last:border-0 last:pb-0 px-1">
                        {/* Product Name */}
                        <div className="col-span-5">
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
                            step="any"
                            min="0.0001"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleItemChange(index, 'quantity', val === '' ? '' : parseFloat(val));
                            }}
                            required
                            className="h-11 text-sm rounded-lg"
                          />
                        </div>

                        {/* UOM Select */}
                        <div className="col-span-2">
                          <select
                            value={item.uom || 'pcs'}
                            onChange={(e) => handleItemChange(index, 'uom', e.target.value)}
                            required
                            className="h-11 w-full text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#5c59e9]/20"
                          >
                            <optgroup label="Furniture Products" className="text-xs text-slate-450 dark:text-slate-550 font-semibold bg-white dark:bg-slate-950">
                              <option value="pcs">pcs (Pieces)</option>
                              <option value="sets">sets (Sets)</option>
                            </optgroup>
                            <optgroup label="Raw Materials" className="text-xs text-slate-455 dark:text-slate-555 font-semibold bg-white dark:bg-slate-950">
                              <option value="m3">m³ (Cubic Meters)</option>
                              <option value="m2">m² (Square Meters)</option>
                              <option value="m">m (Meters)</option>
                              <option value="yards">yards (Yards)</option>
                              <option value="rolls">rolls (Rolls)</option>
                              <option value="kg">kg (Kilograms)</option>
                              <option value="liters">liters (Liters)</option>
                            </optgroup>
                          </select>
                        </div>

                        {/* File spec */}
                        <div className="col-span-2 relative">
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
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 relative my-8 max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
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

              {/* Order Workflow Stage Select */}
              <div className="space-y-1.5">
                <Label htmlFor="editStage" className="text-sm font-bold text-slate-700 dark:text-slate-300">Order Workflow Stage</Label>
                <select
                  id="editStage"
                  value={editStage}
                  onChange={(e) => setEditStage(e.target.value)}
                  className="flex h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50 cursor-pointer"
                >
                  <option value="Order">Order</option>
                  <option value="Sourcing">Sourcing</option>
                  <option value="QC">QC</option>
                  <option value="Ready for PO">Ready for PO</option>
                  <option value="Inspection">Inspection</option>
                  <option value="Logistic">Logistic</option>
                  <option value="Production">Production</option>
                  <option value="Closed">Order Done</option>
                </select>
              </div>

              {/* Date Pickers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="editOrderDate" className="text-sm font-bold text-slate-700 dark:text-slate-300">Order Date</Label>
                  <Input
                    id="editOrderDate"
                    type="date"
                    value={editFormData.orderDate}
                    onChange={(e) => handleEditDateChange('orderDate', e.target.value)}
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
                    onChange={(e) => handleEditDateChange('estimatedDeliveryDate', e.target.value)}
                    required
                    min={editFormData.orderDate}
                    className="h-11 text-sm rounded-lg"
                  />
                </div>
              </div>

              {/* Stage Timelines Configuration */}
              {editStageTimelines.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Estimated Stage Timelines
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[220px] overflow-y-auto pr-1">
                    {editStageTimelines.map((st, idx) => (
                      <div key={idx} className="p-3 border border-slate-100 dark:border-slate-800/80 rounded-lg bg-slate-50/50 dark:bg-slate-900/30 space-y-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                          Stage {idx + 1}: {st.stageName}
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400">Start Date</label>
                            <Input
                              type="date"
                              value={st.estimatedStartDate}
                              onChange={(e) => handleEditStageTimelineChange(idx, 'estimatedStartDate', e.target.value)}
                              className="h-8 text-xs px-2"
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-400">End Date</label>
                            <Input
                              type="date"
                              value={st.estimatedEndDate}
                              onChange={(e) => handleEditStageTimelineChange(idx, 'estimatedEndDate', e.target.value)}
                              className="h-8 text-xs px-2"
                              required
                              min={st.estimatedStartDate}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    <div className="col-span-5">Product Name</div>
                    <div className="col-span-2">Quantity</div>
                    <div className="col-span-2">Unit</div>
                    <div className="col-span-2">Spec File</div>
                    <div className="col-span-1 text-center">Delete</div>
                  </div>

                  <div className="space-y-3">
                    {editItems.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-3 items-center border-b border-slate-100 dark:border-slate-800/60 pb-3 last:border-0 last:pb-0 px-1">
                        {/* Product Name */}
                        <div className="col-span-5">
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
                            step="any"
                            min="0.0001"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = e.target.value;
                              handleEditItemChange(index, 'quantity', val === '' ? '' : parseFloat(val));
                            }}
                            required
                            className="h-11 text-sm rounded-lg"
                          />
                        </div>

                        {/* UOM Select */}
                        <div className="col-span-2">
                          <select
                            value={item.uom || 'pcs'}
                            onChange={(e) => handleEditItemChange(index, 'uom', e.target.value)}
                            required
                            className="h-11 w-full text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#5c59e9]/20"
                          >
                            <optgroup label="Furniture Products" className="text-xs text-slate-450 dark:text-slate-550 font-semibold bg-white dark:bg-slate-950">
                              <option value="pcs">pcs (Pieces)</option>
                              <option value="sets">sets (Sets)</option>
                            </optgroup>
                            <optgroup label="Raw Materials" className="text-xs text-slate-455 dark:text-slate-555 font-semibold bg-white dark:bg-slate-950">
                              <option value="m3">m³ (Cubic Meters)</option>
                              <option value="m2">m² (Square Meters)</option>
                              <option value="m">m (Meters)</option>
                              <option value="yards">yards (Yards)</option>
                              <option value="rolls">rolls (Rolls)</option>
                              <option value="kg">kg (Kilograms)</option>
                              <option value="liters">liters (Liters)</option>
                            </optgroup>
                          </select>
                        </div>

                        {/* File spec */}
                        <div className="col-span-2 relative">
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

      {/* BULK DELETE CONFIRMATION Dialog Overlay */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 relative">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
              <AlertCircle className="text-rose-500 shrink-0" size={20} />
              <span>Delete {selectedOrderIds.length} Purchase Orders</span>
            </h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
              Are you sure you want to delete the <span className="font-bold text-slate-900 dark:text-white">{selectedOrderIds.length} selected purchase orders</span>? 
              This will permanently delete all selected purchase orders and all of their related product item specs from the database. This action cannot be undone.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                disabled={isBulkDeleting}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  setIsBulkDeleting(true)
                  const result = await deleteOrdersBatchAction(selectedOrderIds)
                  setIsBulkDeleting(false)
                  if (result.success) {
                    setSelectedOrderIds([])
                    setIsBulkDeleteConfirmOpen(false)
                  } else {
                    alert(result.error || 'Failed to delete selected orders.')
                  }
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-600 cursor-pointer"
                disabled={isBulkDeleting}
              >
                {isBulkDeleting ? 'Deleting...' : 'Yes, Delete Selected'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SUPPLIER DETAILS Modal Dialog */}
      {selectedSupplierForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 relative max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            <button
              onClick={() => setSelectedSupplierForModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shrink-0">
                <Users2 size={20} />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {selectedSupplierForModal.name || selectedSupplierForModal.supplier_name}
                </h2>
                <p className="text-xs text-slate-450 dark:text-slate-500 font-semibold">
                  Supplier Profile Details
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              {/* Left Column: General & Contact Info */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Contact Information</h3>
                
                <div>
                  <span className="text-slate-400 block text-xs font-medium mb-0.5">Contact Person</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-250 flex items-center gap-1.5">
                    <User size={13} className="text-slate-400" />
                    {selectedSupplierForModal.contact_person || '-'}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-xs font-medium mb-0.5">Email</span>
                  {selectedSupplierForModal.email ? (
                    <a href={`mailto:${selectedSupplierForModal.email}`} className="font-semibold text-indigo-600 hover:underline flex items-center gap-1.5">
                      <Mail size={13} className="text-indigo-500" />
                      {selectedSupplierForModal.email}
                    </a>
                  ) : (
                    <span className="text-slate-800 dark:text-slate-250">-</span>
                  )}
                </div>

                <div>
                  <span className="text-slate-400 block text-xs font-medium mb-0.5">Phone</span>
                  {selectedSupplierForModal.phone ? (
                    <a href={`tel:${selectedSupplierForModal.phone}`} className="font-semibold text-slate-800 dark:text-slate-250 hover:underline flex items-center gap-1.5">
                      <Phone size={13} className="text-slate-400" />
                      {selectedSupplierForModal.phone}
                    </a>
                  ) : (
                    <span className="text-slate-800 dark:text-slate-250">-</span>
                  )}
                </div>

                <div>
                  <span className="text-slate-400 block text-xs font-medium mb-0.5">Website</span>
                  {selectedSupplierForModal.website ? (
                    <a href={selectedSupplierForModal.website.startsWith('http') ? selectedSupplierForModal.website : `https://${selectedSupplierForModal.website}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:underline flex items-center gap-1.5">
                      <Globe size={13} className="text-indigo-500" />
                      {selectedSupplierForModal.website}
                    </a>
                  ) : (
                    <span className="text-slate-800 dark:text-slate-250">-</span>
                  )}
                </div>

                <div>
                  <span className="text-slate-400 block text-xs font-medium mb-0.5">Address</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-250 flex items-start gap-1.5 leading-relaxed">
                    <MapPin size={13} className="text-slate-400 mt-1 shrink-0" />
                    {selectedSupplierForModal.address || '-'}
                  </span>
                </div>
              </div>

              {/* Right Column: Business & Performance Details */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Business Details</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block text-xs font-medium mb-0.5">Supplier Code</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-350">
                      {selectedSupplierForModal.supplier_code || '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs font-medium mb-0.5">Business Type</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-250">
                      {selectedSupplierForModal.business_type || '-'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block text-xs font-medium mb-0.5">Status</span>
                    {selectedSupplierForModal.status ? (
                      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-455 dark:border-emerald-900/50">
                        {selectedSupplierForModal.status}
                      </span>
                    ) : (
                      <span className="text-slate-850 dark:text-slate-250">-</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs font-medium mb-0.5">Sourcing Stage</span>
                    {selectedSupplierForModal.sourcing_stage ? (
                      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900/50">
                        {selectedSupplierForModal.sourcing_stage}
                      </span>
                    ) : (
                      <span className="text-slate-850 dark:text-slate-250">-</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block text-xs font-medium mb-0.5">Quality Rating</span>
                    {selectedSupplierForModal.quality_rating ? (
                      <span className="font-bold text-amber-500 dark:text-amber-400">
                        ★ {selectedSupplierForModal.quality_rating}
                      </span>
                    ) : (
                      <span className="text-slate-850 dark:text-slate-250">-</span>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-400 block text-xs font-medium mb-0.5">Reliability Score</span>
                    {selectedSupplierForModal.reliability_score !== undefined && selectedSupplierForModal.reliability_score !== null ? (
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {selectedSupplierForModal.reliability_score}%
                      </span>
                    ) : (
                      <span className="text-slate-850 dark:text-slate-250">-</span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400 block text-xs font-medium mb-1">Main Products</span>
                  {selectedSupplierForModal.main_products && selectedSupplierForModal.main_products.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSupplierForModal.main_products.map((product: string) => (
                        <Badge key={product} variant="outline" className="text-[10px] bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-400">
                          {product}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-800 dark:text-slate-250">-</span>
                  )}
                </div>
              </div>
            </div>

            {/* Products Supplied for this Order */}
            {(() => {
              const supplierBids = selectedOrder?.order_suppliers?.filter(os => 
                os.supplier_name === (selectedSupplierForModal.name || selectedSupplierForModal.supplier_name) || 
                (os.supplier_id && os.supplier_id === selectedSupplierForModal.id)
              ) || []

              return (
                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-3">Products Supplied for this Order</h3>
                  {supplierBids.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {supplierBids.map((bid, bidIdx) => (
                        <div 
                          key={bidIdx}
                          className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-lg border border-slate-150 dark:border-slate-800/80 flex flex-col gap-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {bid.order_items?.item_name || 'General Product'}
                            </span>
                            {bid.is_shortlisted && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900/50">
                                Shortlisted
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                            <div>
                              <span className="block text-slate-400">Quoted Price:</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-350">
                                {bid.quoted_price ? `$${Number(bid.quoted_price).toLocaleString('en-US')}` : '-'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-slate-400">Lead Time:</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-350">
                                {bid.lead_time_days ? `${bid.lead_time_days} days` : '-'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No specific product bids found for this order.</p>
                  )}
                </div>
              )
            })()}

            <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <Button
                onClick={() => setSelectedSupplierForModal(null)}
                className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                Close Profile
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
