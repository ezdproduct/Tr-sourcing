'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSourcing } from '@/providers/sourcing-provider'
import { 
  addSupplierAction, 
  updateShortlistAction, 
  deleteSupplierAction, 
  classifyOrderItemsBatchAction,
  bulkImportSuppliersAction,
  addSupplierNormalizedAction,
  deleteSuppliersBatchAction,
  sendShortlistToQcAction,
  fetchSupplierCapabilitiesAction,
  updateSupplierProfileAction
} from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
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
  Upload,
  Send,
  SlidersHorizontal,
} from 'lucide-react'

// ─── CSV Parser Helper ────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const lines: string[][] = []
  let row: string[] = []
  let inQuotes = false
  let currentValue = ''
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"'
        i++ // skip next double quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentValue.trim())
      currentValue = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++ // skip \n
      }
      row.push(currentValue.trim())
      lines.push(row)
      row = []
      currentValue = ''
    } else {
      currentValue += char
    }
  }
  
  if (currentValue || row.length > 0) {
    row.push(currentValue.trim())
    lines.push(row)
  }
  
  // Filter out empty rows
  return lines.filter(r => r.length > 0 && r.some(cell => cell !== ''))
}


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
  supplier_id?: string | null
  // Joined from orders table
  orders?: { order_code: string } | null
  order_items?: { item_name: string } | null
  // Joined from suppliers table
  suppliers?: { email: string | null; phone: string | null; address: string | null } | null
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
  const [orderShortlistFilterOnly, setOrderShortlistFilterOnly] = useState(false)

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

  // Upgraded manual normalized form states
  const [manualForm, setManualForm] = useState({
    supplierName: '',
    email: '',
    phone: '',
    address: '',
    orderId: ''
  })
  
  // Case 2 checklist bids: orderItemId -> { checked, price, leadTime }
  const [itemBids, setItemBids] = useState<Record<string, { checked: boolean; price: string; leadTime: string }>>({})

  // Case 1 & 2 repeating capability rows
  const [capabilities, setCapabilities] = useState<Array<{ id: string; productName: string; targetPrice: string }>>([])

  // Searchable order combobox states
  const [orderSearchQuery, setOrderSearchQuery] = useState('')
  const [isOrderDropdownOpen, setIsOrderDropdownOpen] = useState(false)

  // CSV Bulk Import states
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [csvPreview, setCsvPreview] = useState<any[]>([])
  const [importStatus, setImportStatus] = useState<{ success?: boolean; msg?: string; error?: string } | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  // Selection states for bulk delete in All Suppliers Overview
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
  const [isManageMode, setIsManageMode] = useState(false)

  // Supplier Profile detailed view & edit state
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isProfileEditMode, setIsProfileEditMode] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null)
  const [isFetchingCapabilities, setIsFetchingCapabilities] = useState(false)
  const [qcSuccessCount, setQcSuccessCount] = useState<number | null>(null)
  const [qcErrorText, setQcErrorText] = useState<string | null>(null)
  
  // Basic & contact details input state
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  })
  
  // Associated order bid details (for reference)
  const [profileOrderDetails, setProfileOrderDetails] = useState<{
    orderCode: string
    quotedPrice: number
    leadTimeDays: number
  } | null>(null)
  
  // List of capabilities: id, productName, targetPrice
  const [profileCapabilities, setProfileCapabilities] = useState<Array<{ id: string; productName: string; targetPrice: string }>>([])

  const handleOpenProfile = (supplier: any) => {
    if (!supplier.supplier_id) return

    setSelectedSupplierId(supplier.supplier_id)
    setProfileForm({
      name: supplier.supplier_name || '',
      email: supplier.suppliers?.email || '',
      phone: supplier.suppliers?.phone || '',
      address: supplier.suppliers?.address || ''
    })

    setProfileOrderDetails({
      orderCode: supplier.orders?.order_code || 'Unassigned',
      quotedPrice: Number(supplier.quoted_price || 0),
      leadTimeDays: supplier.lead_time_days || 0
    })

    setProfileCapabilities([])
    setProfileErrorMessage(null)
    setIsProfileEditMode(false)
    setIsProfileOpen(true)

    // Fetch capabilities
    setIsFetchingCapabilities(true)
    startTransition(async () => {
      const res = await fetchSupplierCapabilitiesAction(supplier.supplier_id)
      setIsFetchingCapabilities(false)
      if (res.success && res.capabilities) {
        setProfileCapabilities(
          res.capabilities.map((c: any) => ({
            id: c.id || Math.random().toString(),
            productName: c.product_name || '',
            targetPrice: String(c.target_price || 0)
          }))
        )
      } else {
        setProfileErrorMessage(res.error || 'Failed to fetch capabilities.')
      }
    })
  }

  // Clear selections when filters or viewMode changes
  useEffect(() => {
    setSelectedSupplierIds([])
    setIsManageMode(false)
  }, [allSuppliersSearch, shortlistFilterOnly, orderShortlistFilterOnly, viewMode])

  // Column Visibility State following TanStack Table model (All Suppliers)
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({
    supplierName: true,
    email: false,
    phone: false,
    address: false,
    associatedOrder: true,
    productItem: true,
    quotedPrice: true,
    leadTime: true,
    shortlistStatus: true,
  })

  const toggleableColumns = [
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'associatedOrder', label: 'Associated Order' },
    { key: 'productItem', label: 'Product Item' },
    { key: 'quotedPrice', label: 'Quoted Price' },
    { key: 'leadTime', label: 'Lead Time' },
    { key: 'shortlistStatus', label: 'Shortlist Status' },
  ]

  // Column Visibility State for individual order supplier table
  const [orderColumnVisibility, setOrderColumnVisibility] = useState<Record<string, boolean>>({
    supplierName: true,
    email: false,
    phone: false,
    address: false,
    productItem: true,
    quotedPrice: true,
    leadTime: true,
    shortlistStatus: true,
  })

  const orderToggleableColumns = [
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'productItem', label: 'Product Item' },
    { key: 'quotedPrice', label: 'Quoted Price' },
    { key: 'leadTime', label: 'Lead Time' },
    { key: 'shortlistStatus', label: 'Shortlist Status' },
  ]

  // Select order handler
  const handleSelectOrder = (orderId: string) => {
    setManualForm(prev => ({ ...prev, orderId }))
    setIsOrderDropdownOpen(false)
    setOrderSearchQuery('')
    
    if (orderId) {
      const selectedOrd = orders.find(o => o.id === orderId)
      if (selectedOrd?.order_items) {
        const initialBids: Record<string, { checked: boolean; price: string; leadTime: string }> = {}
        selectedOrd.order_items.forEach(item => {
          initialBids[item.id] = { checked: false, price: '', leadTime: '' }
        })
        setItemBids(initialBids)
      } else {
        setItemBids({})
      }
    } else {
      setItemBids({})
    }
  }

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

  // Suppliers for selected order, also filter by search and shortlist status
  const orderSuppliers = suppliers.filter(s => s.order_id === selectedOrderId && (
    searchQuery === '' ||
    s.supplier_name.toLowerCase().includes(searchQuery.toLowerCase())
  ) && (
    !orderShortlistFilterOnly || s.is_shortlisted
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
    const { supplierName, email, phone, address, orderId } = manualForm

    if (!supplierName) {
      setErrorMessage('Supplier Name is required.')
      return
    }

    const bids: Array<{ orderItemId: string; quotedPrice: number; leadTimeDays: number }> = []
    if (orderId) {
      for (const [itemId, bidVal] of Object.entries(itemBids)) {
        if (bidVal.checked) {
          const price = parseFloat(bidVal.price)
          const lead = parseInt(bidVal.leadTime)
          if (isNaN(price) || isNaN(lead) || price <= 0 || lead <= 0) {
            setErrorMessage('Please enter a valid price and lead time for checked items.')
            return
          }
          bids.push({
            orderItemId: itemId,
            quotedPrice: price,
            leadTimeDays: lead
          })
        }
      }
      if (bids.length === 0 && capabilities.length === 0) {
        setErrorMessage('Please check at least one order item or add at least one product capability.')
        return
      }
    } else {
      if (capabilities.length === 0) {
        setErrorMessage('Please add at least one product capability for unassigned suppliers.')
        return
      }
    }

    const caps: Array<{ productName: string; targetPrice: number }> = []
    for (const cap of capabilities) {
      if (!cap.productName) {
        setErrorMessage('Product Name is required for all capabilities.')
        return
      }
      const price = parseFloat(cap.targetPrice)
      if (isNaN(price) || price < 0) {
        setErrorMessage('Please enter a valid target price for all capabilities.')
        return
      }
      caps.push({
        productName: cap.productName.trim(),
        targetPrice: price
      })
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    const result = await addSupplierNormalizedAction({
      supplierName,
      email,
      phone,
      address,
      orderId: orderId || null,
      items: bids,
      capabilities: caps
    })

    setIsSubmitting(false)

    if (result.success) {
      setManualForm({
        supplierName: '',
        email: '',
        phone: '',
        address: '',
        orderId: ''
      })
      setItemBids({})
      setCapabilities([])
      setIsAddOpen(false)
      router.refresh()
    } else {
      setErrorMessage(result.error || 'Failed to add supplier.')
    }
  }

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (!text) return
      
      try {
        const rawRows = parseCSV(text)
        if (rawRows.length < 2) {
          setErrorMessage('CSV file must contain a header row and at least one data row.')
          return
        }
        
        const headers = rawRows[0].map(h => h.toLowerCase().trim().replace(/['"_\s]+/g, ''))
        
        const colMap = {
          supplierName: headers.indexOf('suppliername'),
          email: headers.indexOf('email'),
          phone: headers.indexOf('phone'),
          address: headers.indexOf('address'),
          orderCode: headers.indexOf('ordercode'),
          productName: headers.indexOf('productname'),
          quotedPrice: headers.indexOf('quotedprice'),
          leadTime: headers.indexOf('leadtime')
        }
        
        if (colMap.supplierName === -1) colMap.supplierName = 0
        if (colMap.email === -1) colMap.email = 1
        if (colMap.phone === -1) colMap.phone = 2
        if (colMap.address === -1) colMap.address = 3
        if (colMap.orderCode === -1) colMap.orderCode = 4
        if (colMap.productName === -1) colMap.productName = 5
        if (colMap.quotedPrice === -1) colMap.quotedPrice = 6
        if (colMap.leadTime === -1) colMap.leadTime = 7

        const parsedData = rawRows.slice(1).map(row => {
          const getValue = (idx: number) => (idx !== -1 && idx < row.length ? row[idx] : '')
          
          const supplierName = getValue(colMap.supplierName)
          const email = getValue(colMap.email)
          const phone = getValue(colMap.phone)
          const address = getValue(colMap.address)
          const orderCode = getValue(colMap.orderCode)
          const productName = getValue(colMap.productName)
          const quotedPriceStr = getValue(colMap.quotedPrice)
          const leadTimeStr = getValue(colMap.leadTime)
          
          return {
            supplierName,
            email,
            phone,
            address,
            orderCode,
            productName,
            quotedPrice: parseFloat(quotedPriceStr) || 0,
            leadTime: parseInt(leadTimeStr) || 0
          }
        }).filter(item => item.supplierName !== '')

        setCsvPreview(parsedData)
        setImportStatus(null)
      } catch (err: any) {
        setErrorMessage('Failed to parse CSV file: ' + err.message)
      }
    }
    reader.readAsText(file)
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

  const handleSendShortlistToQc = (orderId?: string | null) => {
    startTransition(async () => {
      const res = await sendShortlistToQcAction(orderId)
      if (res.success) {
        setQcSuccessCount(res.count ?? 0)
      } else {
        setQcErrorText(res.error || 'Failed to send shortlist to QC')
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

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSupplierId) return

    setProfileErrorMessage(null)
    setIsSavingProfile(true)

    // Validate capabilities
    const caps: Array<{ productName: string; targetPrice: number }> = []
    for (const cap of profileCapabilities) {
      if (!cap.productName.trim()) {
        setProfileErrorMessage('Product Name is required for all capabilities.')
        setIsSavingProfile(false)
        return
      }
      const price = parseFloat(cap.targetPrice)
      if (isNaN(price) || price < 0) {
        setProfileErrorMessage('Target Price must be a valid positive number.')
        setIsSavingProfile(false)
        return
      }
      caps.push({
        productName: cap.productName.trim(),
        targetPrice: price
      })
    }

    const res = await updateSupplierProfileAction({
      supplierId: selectedSupplierId,
      email: profileForm.email,
      phone: profileForm.phone,
      address: profileForm.address,
      capabilities: caps
    })

    setIsSavingProfile(false)

    if (res.success) {
      setSuppliers(prev => prev.map(s => {
        if (s.supplier_id === selectedSupplierId) {
          return {
            ...s,
            suppliers: {
              ...s.suppliers,
              email: profileForm.email,
              phone: profileForm.phone,
              address: profileForm.address
            }
          }
        }
        return s
      }))
      setIsProfileEditMode(false)
    } else {
      setProfileErrorMessage(res.error || 'Failed to update supplier profile.')
    }
  }

  const handleAddProfileCapability = () => {
    setProfileCapabilities(prev => [
      ...prev,
      { id: Math.random().toString(), productName: '', targetPrice: '' }
    ])
  }

  const handleDeleteProfileCapability = (id: string) => {
    setProfileCapabilities(prev => prev.filter(c => c.id !== id))
  }

  const handleProfileCapabilityChange = (id: string, field: 'productName' | 'targetPrice', value: string) => {
    setProfileCapabilities(prev =>
      prev.map(c => (c.id === id ? { ...c, [field]: value } : c))
    )
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
                  {isManageMode ? (
                    <>
                      <Button
                        id="btn-bulk-delete"
                        disabled={selectedSupplierIds.length === 0}
                        onClick={() => setIsBulkDeleteConfirmOpen(true)}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:bg-red-600 text-white gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        <Trash2 size={12} />
                        <span>Delete Selected ({selectedSupplierIds.length})</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsManageMode(false)
                          setSelectedSupplierIds([])
                        }}
                        className="h-8 px-3 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer text-xs font-semibold"
                          >
                            <SlidersHorizontal size={12} />
                            <span>Manage Table</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-md z-50">
                          {/* Manage Mode trigger */}
                          <div
                            role="button"
                            onClick={() => setIsManageMode(true)}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-750 dark:text-slate-300"
                          >
                            <Trash2 size={12} className="text-red-500" />
                            <span>Select & Delete</span>
                          </div>

                          <DropdownMenuCheckboxItem
                            checked={shortlistFilterOnly}
                            onCheckedChange={(checked) => {
                              setShortlistFilterOnly(!!checked)
                            }}
                            onSelect={(e) => e.preventDefault()}
                            className="text-xs rounded-lg cursor-pointer py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-[#5c59e9]"
                          >
                            Shortlisted Only
                          </DropdownMenuCheckboxItem>
                          
                          <DropdownMenuSeparator className="my-1 border-t border-slate-100 dark:border-slate-800" />
                          
                          {/* Column toggles header */}
                          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Toggle Columns
                          </div>
                          
                          {toggleableColumns.map(col => (
                            <DropdownMenuCheckboxItem
                              key={col.key}
                              checked={columnVisibility[col.key]}
                              onCheckedChange={(checked) => {
                                setColumnVisibility(prev => ({ ...prev, [col.key]: !!checked }))
                              }}
                              onSelect={(e) => e.preventDefault()}
                              className="text-xs rounded-lg cursor-pointer py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              {col.label}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {suppliers.some(s => s.is_shortlisted) && (
                        <Button
                          id="btn-send-qc"
                          onClick={() => handleSendShortlistToQc()}
                          disabled={isPending}
                          className="bg-[#5c59e9] hover:bg-[#4a47d2] text-white gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          {isPending ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Send size={12} />
                          )}
                          <span>Send Shortlist to QC</span>
                        </Button>
                      )}

                      <Button
                        onClick={() => {
                          setCsvPreview([])
                          setImportStatus(null)
                          setIsImportOpen(true)
                          setErrorMessage(null)
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-350 cursor-pointer h-8 px-3 rounded-lg text-xs"
                      >
                        <Upload size={14} />
                        <span>Import Excel/CSV</span>
                      </Button>
                      <Button
                        onClick={() => {
                          setManualForm({
                            supplierName: '',
                            email: '',
                            phone: '',
                            address: '',
                            orderId: ''
                          })
                          setItemBids({})
                          setCapabilities([])
                          setIsAddOpen(true)
                          setErrorMessage(null)
                        }}
                        size="sm"
                        className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer h-8 px-3 rounded-lg text-xs"
                      >
                        <Plus size={14} />
                        <span>Add Supplier</span>
                      </Button>
                    </>
                  )}
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
                        {isManageMode && (
                          <th className="px-6 py-4 w-12 text-center">
                            <input 
                              type="checkbox"
                              checked={filteredAllSuppliers.length > 0 && selectedSupplierIds.length === filteredAllSuppliers.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedSupplierIds(filteredAllSuppliers.map(s => s.id))
                                } else {
                                  setSelectedSupplierIds([])
                                }
                              }}
                              className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer"
                            />
                          </th>
                        )}
                        {columnVisibility.supplierName && <th className="px-6 py-4">Supplier Name</th>}
                        {columnVisibility.email && <th className="px-6 py-4">Email</th>}
                        {columnVisibility.phone && <th className="px-6 py-4">Phone</th>}
                        {columnVisibility.address && <th className="px-6 py-4">Address</th>}
                        {columnVisibility.associatedOrder && <th className="px-6 py-4">Associated Order</th>}
                        {columnVisibility.productItem && <th className="px-6 py-4">Product Item</th>}
                        {columnVisibility.quotedPrice && <th className="px-6 py-4">Quoted Price</th>}
                        {columnVisibility.leadTime && <th className="px-6 py-4">Lead Time</th>}
                        {columnVisibility.shortlistStatus && <th className="px-6 py-4 text-center">Shortlist Status</th>}
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {filteredAllSuppliers.map(supplier => {
                        const orderCode = supplier.orders?.order_code ?? '—'
                        const linkedOrder = orders.find(o => o.id === supplier.order_id)
                        return (
                          <tr key={supplier.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/20 ${selectedSupplierIds.includes(supplier.id) ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}>
                            {isManageMode && (
                              <td className="px-6 py-4 w-12 text-center">
                                <input 
                                  type="checkbox"
                                  checked={selectedSupplierIds.includes(supplier.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedSupplierIds(prev => [...prev, supplier.id])
                                    } else {
                                      setSelectedSupplierIds(prev => prev.filter(id => id !== supplier.id))
                                    }
                                  }}
                                  className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer"
                                />
                              </td>
                            )}
                            {columnVisibility.supplierName && (
                              <td className="px-6 py-4">
                                <button
                                  type="button"
                                  onClick={() => handleOpenProfile(supplier)}
                                  className="font-semibold text-slate-800 dark:text-slate-200 hover:text-[#5c59e9] dark:hover:text-[#818cf8] hover:underline cursor-pointer text-left focus:outline-none transition-colors"
                                >
                                  {supplier.supplier_name}
                                </button>
                              </td>
                            )}
                            {columnVisibility.email && (
                              <td className="px-6 py-4">
                                <div className="text-slate-600 dark:text-slate-400">
                                  {supplier.suppliers?.email || '—'}
                                </div>
                              </td>
                            )}
                            {columnVisibility.phone && (
                              <td className="px-6 py-4">
                                <div className="text-slate-600 dark:text-slate-400">
                                  {supplier.suppliers?.phone || '—'}
                                </div>
                              </td>
                            )}
                            {columnVisibility.address && (
                              <td className="px-6 py-4">
                                <div className="text-slate-600 dark:text-slate-400 truncate max-w-xs" title={supplier.suppliers?.address || ''}>
                                  {supplier.suppliers?.address || '—'}
                                </div>
                              </td>
                            )}
                            {columnVisibility.associatedOrder && (
                              <td className="px-6 py-4">
                                {!supplier.order_id ? (
                                  supplier.order_item_id ? (
                                    <Badge variant="outline" className="text-[10px] font-semibold bg-red-50 text-red-500 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900">
                                      Deleted Order
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900/10 dark:text-slate-500 dark:border-slate-800">
                                      Unassigned
                                    </Badge>
                                  )
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
                            )}
                            {columnVisibility.productItem && (
                              <td className="px-6 py-4">
                                <span className="font-semibold text-slate-600 dark:text-slate-400">
                                  {supplier.order_items?.item_name || '—'}
                                </span>
                              </td>
                            )}
                            {columnVisibility.quotedPrice && (
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  ${Number(supplier.quoted_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </div>
                              </td>
                            )}
                            {columnVisibility.leadTime && (
                              <td className="px-6 py-4">
                                <div className="font-semibold text-slate-700 dark:text-slate-300">
                                  {supplier.lead_time_days} days
                                </div>
                              </td>
                            )}
                            {columnVisibility.shortlistStatus && (
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
                            )}
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
                            <div className="flex items-center gap-2">
                              {isManageMode ? (
                                <>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={selectedSupplierIds.length === 0}
                                    onClick={() => setIsBulkDeleteConfirmOpen(true)}
                                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-50"
                                  >
                                    <Trash2 size={12} />
                                    <span>Delete Selected ({selectedSupplierIds.length})</span>
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setIsManageMode(false)
                                      setSelectedSupplierIds([])
                                    }}
                                    className="h-8 px-3 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {orderSuppliers.some(s => s.is_shortlisted) && (
                                    <Button
                                      id="btn-order-send-qc"
                                      onClick={() => handleSendShortlistToQc(selectedOrderId)}
                                      disabled={isPending}
                                      className="bg-[#5c59e9] hover:bg-[#4a47d2] text-white gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold cursor-pointer"
                                    >
                                      {isPending ? (
                                        <Loader2 size={12} className="animate-spin" />
                                      ) : (
                                        <Send size={12} />
                                      )}
                                      <span>Send Shortlist to QC</span>
                                    </Button>
                                  )}

                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer text-xs font-semibold"
                                      >
                                        <SlidersHorizontal size={12} />
                                        <span>Manage Table</span>
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-md z-50">
                                      {/* Manage Mode trigger */}
                                      <div
                                        role="button"
                                        onClick={() => setIsManageMode(true)}
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-750 dark:text-slate-300"
                                      >
                                        <Trash2 size={12} className="text-red-500" />
                                        <span>Select & Delete</span>
                                      </div>

                                      <DropdownMenuCheckboxItem
                                        checked={orderShortlistFilterOnly}
                                        onCheckedChange={(checked) => {
                                          setOrderShortlistFilterOnly(!!checked)
                                        }}
                                        onSelect={(e) => e.preventDefault()}
                                        className="text-xs rounded-lg cursor-pointer py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold text-[#5c59e9]"
                                      >
                                        Shortlisted Only
                                      </DropdownMenuCheckboxItem>
                                      
                                      <DropdownMenuSeparator className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                      
                                      {/* Column toggles header */}
                                      <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                        Toggle Columns
                                      </div>
                                      
                                      {orderToggleableColumns.map(col => (
                                        <DropdownMenuCheckboxItem
                                          key={col.key}
                                          checked={orderColumnVisibility[col.key]}
                                          onCheckedChange={(checked) => {
                                            setOrderColumnVisibility(prev => ({ ...prev, [col.key]: !!checked }))
                                          }}
                                          onSelect={(e) => e.preventDefault()}
                                          className="text-xs rounded-lg cursor-pointer py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                                        >
                                          {col.label}
                                        </DropdownMenuCheckboxItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>

                                  <Button
                                    onClick={() => {
                                      setCsvPreview([])
                                      setImportStatus(null)
                                      setIsImportOpen(true)
                                      setErrorMessage(null)
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-350 cursor-pointer"
                                  >
                                    <Upload size={14} />
                                    <span>Import Excel/CSV</span>
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      setManualForm({
                                        supplierName: '',
                                        email: '',
                                        phone: '',
                                        address: '',
                                        orderId: selectedOrderId || ''
                                      })
                                      setCapabilities([])
                                      if (selectedOrderId) {
                                        handleSelectOrder(selectedOrderId)
                                      } else {
                                        setItemBids({})
                                      }
                                      setIsAddOpen(true)
                                      setErrorMessage(null)
                                    }}
                                    size="sm"
                                    className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer"
                                  >
                                    <Plus size={14} />
                                    <span>Add Supplier</span>
                                  </Button>
                                </>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent className="p-0">
                            {sortedOrderSuppliers.length === 0 ? (
                              <div className="p-12 flex flex-col items-center justify-center gap-3 text-center min-h-[350px]">
                                <Users2 size={36} className="text-slate-200 dark:text-slate-700" />
                                <p className="text-sm text-slate-400 font-medium">No suppliers yet</p>
                                <p className="text-xs text-slate-400">Click &quot;Add Supplier&quot; to start building your comparison matrix</p>
                                <Button
                                  onClick={() => {
                                    setManualForm({
                                      supplierName: '',
                                      email: '',
                                      phone: '',
                                      address: '',
                                      orderId: selectedOrderId || ''
                                    })
                                    setCapabilities([])
                                    if (selectedOrderId) {
                                      handleSelectOrder(selectedOrderId)
                                    } else {
                                      setItemBids({})
                                    }
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
                                      {isManageMode && (
                                        <th className="px-6 py-4 w-12 text-center">
                                          <input 
                                            type="checkbox"
                                            checked={sortedOrderSuppliers.length > 0 && selectedSupplierIds.length === sortedOrderSuppliers.length}
                                            onChange={(e) => {
                                              if (e.target.checked) {
                                                setSelectedSupplierIds(sortedOrderSuppliers.map(s => s.id))
                                              } else {
                                                setSelectedSupplierIds([])
                                              }
                                            }}
                                            className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer"
                                          />
                                        </th>
                                      )}
                                      {orderColumnVisibility.supplierName && <th className="px-6 py-4">Supplier</th>}
                                      {orderColumnVisibility.email && <th className="px-6 py-4">Email</th>}
                                      {orderColumnVisibility.phone && <th className="px-6 py-4">Phone</th>}
                                      {orderColumnVisibility.address && <th className="px-6 py-4">Address</th>}
                                      {orderColumnVisibility.productItem && <th className="px-6 py-4">Product Item</th>}
                                      {orderColumnVisibility.quotedPrice && <th className="px-6 py-4">Quoted Price</th>}
                                      {orderColumnVisibility.leadTime && <th className="px-6 py-4">Lead Time</th>}
                                      {orderColumnVisibility.shortlistStatus && <th className="px-6 py-4 text-center">Shortlist</th>}
                                      <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                    {sortedOrderSuppliers.map(supplier => {
                                      const isLowestPrice = supplier.order_item_id && bestPricePerItem[supplier.order_item_id] !== undefined && Number(supplier.quoted_price) === bestPricePerItem[supplier.order_item_id]
                                      const isFastestLead = supplier.order_item_id && bestLeadTimePerItem[supplier.order_item_id] !== undefined && supplier.lead_time_days === bestLeadTimePerItem[supplier.order_item_id]
                                      return (
                                        <tr key={supplier.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/20 ${selectedSupplierIds.includes(supplier.id) ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}>
                                          {isManageMode && (
                                            <td className="px-6 py-4 w-12 text-center">
                                              <input 
                                                type="checkbox"
                                                checked={selectedSupplierIds.includes(supplier.id)}
                                                onChange={(e) => {
                                                  if (e.target.checked) {
                                                    setSelectedSupplierIds(prev => [...prev, supplier.id])
                                                  } else {
                                                    setSelectedSupplierIds(prev => prev.filter(id => id !== supplier.id))
                                                  }
                                                }}
                                                className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer"
                                              />
                                            </td>
                                          )}
                                          {orderColumnVisibility.supplierName && (
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
                                          )}
                                          {orderColumnVisibility.email && (
                                            <td className="px-6 py-4">
                                              <div className="text-slate-600 dark:text-slate-400">
                                                {supplier.suppliers?.email || '—'}
                                              </div>
                                            </td>
                                          )}
                                          {orderColumnVisibility.phone && (
                                            <td className="px-6 py-4">
                                              <div className="text-slate-600 dark:text-slate-400">
                                                {supplier.suppliers?.phone || '—'}
                                              </div>
                                            </td>
                                          )}
                                          {orderColumnVisibility.address && (
                                            <td className="px-6 py-4">
                                              <div className="text-slate-600 dark:text-slate-400 truncate max-w-xs" title={supplier.suppliers?.address || ''}>
                                                {supplier.suppliers?.address || '—'}
                                              </div>
                                            </td>
                                          )}
                                          {orderColumnVisibility.productItem && (
                                            <td className="px-6 py-4 font-semibold text-slate-600 dark:text-slate-400">
                                              {supplier.order_items?.item_name || '—'}
                                            </td>
                                          )}
                                          {orderColumnVisibility.quotedPrice && (
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
                                          )}
                                          {orderColumnVisibility.leadTime && (
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
                                          )}
                                          {orderColumnVisibility.shortlistStatus && (
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
                                          )}
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

            <form onSubmit={handleAddSupplier} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {errorMessage && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-4 py-3">
                  <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="text-xs text-red-600 dark:text-red-400">{errorMessage}</span>
                </div>
              )}

              {/* SECTION 1: Supplier Basic Info */}
              <div className="space-y-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <h3 className="text-xs font-bold text-[#5c59e9] uppercase tracking-wider">Basic Information</h3>
                
                <div className="space-y-1.5">
                  <Label htmlFor="supplier-name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Supplier / Factory Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="supplier-name"
                    placeholder="e.g. Viet My Woodworking Ltd"
                    value={manualForm.supplierName}
                    onChange={e => setManualForm(f => ({ ...f, supplierName: e.target.value }))}
                    className="text-xs h-9"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Supplier Email
                    </Label>
                    <Input
                      id="supplier-email"
                      type="email"
                      placeholder="e.g. contact@vietmy.com"
                      value={manualForm.email}
                      onChange={e => setManualForm(f => ({ ...f, email: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-phone" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Supplier Phone
                    </Label>
                    <Input
                      id="supplier-phone"
                      placeholder="e.g. +84 901 234 567"
                      value={manualForm.phone}
                      onChange={e => setManualForm(f => ({ ...f, phone: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="supplier-address" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Supplier Address
                  </Label>
                  <Input
                    id="supplier-address"
                    placeholder="e.g. Binh Duong Province, Vietnam"
                    value={manualForm.address}
                    onChange={e => setManualForm(f => ({ ...f, address: e.target.value }))}
                    className="text-xs h-9"
                  />
                </div>
              </div>

              {/* SECTION 2: Order Selection & Product items mapping */}
              <div className="space-y-3.5">
                <h3 className="text-xs font-bold text-[#5c59e9] uppercase tracking-wider">Order &amp; Capability Mapping</h3>
                
                {/* Searchable Order Combobox */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Associated Order
                  </Label>
                  <div className="relative">
                    <div 
                      className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                      onClick={() => setIsOrderDropdownOpen(!isOrderDropdownOpen)}
                    >
                      <span>
                        {manualForm.orderId 
                          ? orders.find(o => o.id === manualForm.orderId)?.order_code 
                          : "No Associated Order (Unassigned)"
                        }
                      </span>
                      <ChevronRight size={14} className="transform rotate-90" />
                    </div>
                    
                    {isOrderDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900 max-h-60 overflow-y-auto">
                        <div className="flex items-center border-b border-slate-100 dark:border-slate-800 px-2 py-1 bg-slate-50 dark:bg-slate-950">
                          <Search size={12} className="text-slate-400 mr-2" />
                          <input 
                            type="text"
                            placeholder="Search orders..."
                            value={orderSearchQuery}
                            onChange={e => setOrderSearchQuery(e.target.value)}
                            className="w-full bg-transparent text-xs py-1 outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                          <li 
                            className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            onClick={() => handleSelectOrder('')}
                          >
                            No Associated Order (Unassigned)
                          </li>
                          {orders
                            .filter(o => o.order_code.toLowerCase().includes(orderSearchQuery.toLowerCase()))
                            .map(o => (
                              <li 
                                key={o.id}
                                className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs flex flex-col gap-0.5"
                                onClick={() => handleSelectOrder(o.id)}
                              >
                                <span className="font-bold text-slate-800 dark:text-slate-200">{o.order_code}</span>
                                <span className="text-[10px] text-slate-400">Date: {o.order_date || '—'}</span>
                              </li>
                            ))
                          }
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* CASE 2: Checklist of Order Items */}
                {manualForm.orderId && (
                  <div className="space-y-2.5">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Order Product Items Checklist
                    </Label>
                    <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 space-y-3.5 bg-slate-50/20 max-h-56 overflow-y-auto">
                      {orders.find(o => o.id === manualForm.orderId)?.order_items?.map(item => {
                        const bid = itemBids[item.id] || { checked: false, price: '', leadTime: '' }
                        return (
                          <div key={item.id} className="space-y-2 border-b border-slate-100 dark:border-slate-800/50 pb-2.5 last:border-0 last:pb-0">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                              <input 
                                type="checkbox"
                                checked={bid.checked}
                                onChange={e => setItemBids(prev => ({
                                  ...prev,
                                  [item.id]: { ...bid, checked: e.target.checked }
                                }))}
                                className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer"
                              />
                              {item.item_name} ({item.quantity})
                            </label>
                            
                            {bid.checked && (
                              <div className="grid grid-cols-2 gap-3 pl-5">
                                <div className="space-y-1">
                                  <Label htmlFor={`price-${item.id}`} className="text-[10px] font-semibold text-slate-500">
                                    Quoted Price (USD) <span className="text-red-500">*</span>
                                  </Label>
                                  <Input 
                                    id={`price-${item.id}`}
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    placeholder="Price"
                                    value={bid.price}
                                    onChange={e => setItemBids(prev => ({
                                      ...prev,
                                      [item.id]: { ...bid, price: e.target.value }
                                    }))}
                                    className="text-xs h-8"
                                    required
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`lead-${item.id}`} className="text-[10px] font-semibold text-slate-500">
                                    Lead Time (Days) <span className="text-red-500">*</span>
                                  </Label>
                                  <Input 
                                    id={`lead-${item.id}`}
                                    type="number"
                                    min="1"
                                    step="1"
                                    placeholder="Days"
                                    value={bid.leadTime}
                                    onChange={e => setItemBids(prev => ({
                                      ...prev,
                                      [item.id]: { ...bid, leadTime: e.target.value }
                                    }))}
                                    className="text-xs h-8"
                                    required
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Repeating capability rows */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      External Capabilities (Product Catalog)
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCapabilities(prev => [
                        ...prev, 
                        { id: Math.random().toString(), productName: '', targetPrice: '' }
                      ])}
                      className="h-7 text-[10px] px-2 gap-1 border-indigo-200 text-[#5c59e9] hover:bg-indigo-50 dark:border-indigo-900/50 cursor-pointer"
                    >
                      <Plus size={11} />
                      Add Product
                    </Button>
                  </div>
                  
                  {capabilities.length === 0 ? (
                    <div className="text-center p-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-[10px] text-slate-400">
                      No external product capabilities added.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {capabilities.map((cap, idx) => (
                        <div key={cap.id} className="flex items-center gap-2">
                          <Input 
                            placeholder="e.g. Dining Chair"
                            value={cap.productName}
                            onChange={e => setCapabilities(prev => prev.map(c => 
                              c.id === cap.id ? { ...c, productName: e.target.value } : c
                            ))}
                            className="text-xs h-8 flex-1"
                            required
                          />
                          <Input 
                            type="number"
                            step="0.01"
                            placeholder="Target Price"
                            value={cap.targetPrice}
                            onChange={e => setCapabilities(prev => prev.map(c => 
                              c.id === cap.id ? { ...c, targetPrice: e.target.value } : c
                            ))}
                            className="text-xs h-8 w-28"
                            required
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setCapabilities(prev => prev.filter(c => c.id !== cap.id))}
                            className="h-8 w-8 text-slate-400 hover:text-red-500 hover:border-red-200 cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
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

      {/* CSV Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { if (!isImporting) { setIsImportOpen(false); setCsvPreview([]); setImportStatus(null); } }}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">📥 Bulk Import Suppliers</h2>
                <p className="text-xs text-slate-400 mt-0.5">Upload a CSV file to import supplier information, quotes and capabilities</p>
              </div>
              <button
                onClick={() => { if (!isImporting) { setIsImportOpen(false); setCsvPreview([]); setImportStatus(null); } }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {importStatus ? (
                <div className="space-y-4 text-center py-6">
                  {importStatus.success ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600">
                        <Check size={24} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Import Completed Successfully</h3>
                      <p className="text-xs text-slate-500 max-w-md">{importStatus.msg}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center text-red-600">
                        <AlertCircle size={24} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Import Failed</h3>
                      <p className="text-xs text-red-600">{importStatus.error}</p>
                    </div>
                  )}
                  
                  <div className="pt-2">
                    <Button 
                      onClick={() => {
                        setIsImportOpen(false)
                        setCsvPreview([])
                        setImportStatus(null)
                        router.refresh()
                      }}
                      className="bg-[#5c59e9] hover:bg-[#4a47d2] px-6 cursor-pointer"
                    >
                      Close &amp; Refresh
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center bg-slate-50/50 dark:bg-slate-950/10">
                    <input 
                      type="file"
                      accept=".csv"
                      id="csv-file-input"
                      onChange={handleCsvUpload}
                      className="hidden"
                    />
                    <label 
                      htmlFor="csv-file-input"
                      className="cursor-pointer flex flex-col items-center gap-2"
                    >
                      <Upload className="h-8 w-8 text-slate-400 hover:text-[#5c59e9] transition-colors" />
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Click to upload CSV template</span>
                      <span className="text-[10px] text-slate-400">Columns: supplier_name, email, phone, address, order_code, product_name, quoted_price, lead_time</span>
                    </label>
                  </div>

                  {csvPreview.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Previewing {Math.min(5, csvPreview.length)} of {csvPreview.length} rows:
                        </span>
                      </div>
                      <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 font-bold uppercase text-slate-500">
                              <th className="px-4 py-2">Supplier Name</th>
                              <th className="px-4 py-2">Email</th>
                              <th className="px-4 py-2">Order Code</th>
                              <th className="px-4 py-2">Product Name</th>
                              <th className="px-4 py-2 text-right">Price</th>
                              <th className="px-4 py-2 text-right">Lead Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {csvPreview.slice(0, 5).map((row, idx) => (
                              <tr key={idx} className="text-slate-700 dark:text-slate-300">
                                <td className="px-4 py-2 font-semibold">{row.supplierName}</td>
                                <td className="px-4 py-2">{row.email || '—'}</td>
                                <td className="px-4 py-2 font-bold text-[#5c59e9]">{row.orderCode || '—'}</td>
                                <td className="px-4 py-2 font-medium">{row.productName || '—'}</td>
                                <td className="px-4 py-2 text-right font-bold text-slate-900 dark:text-white">${row.quotedPrice}</td>
                                <td className="px-4 py-2 text-right">{row.leadTime} days</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      <div className="flex gap-3 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => setCsvPreview([])}
                          disabled={isImporting}
                          className="flex-1 h-9 text-sm cursor-pointer"
                        >
                          Clear
                        </Button>
                        <Button
                          onClick={async () => {
                            setIsImporting(true)
                            const res = await bulkImportSuppliersAction(csvPreview)
                            setIsImporting(false)
                            if (res.success) {
                              setImportStatus({
                                success: true,
                                msg: `Imported ${res.importedSuppliersCount} unique suppliers, ${res.importedBidsCount} active bids, and ${res.importedCapabilitiesCount} capability records.`
                              })
                            } else {
                              setImportStatus({
                                success: false,
                                error: res.error || 'Import failed.'
                              })
                            }
                          }}
                          disabled={isImporting}
                          className="flex-1 h-9 text-sm bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer gap-2"
                        >
                          {isImporting ? (
                            <><Loader2 size={14} className="animate-spin" /> Importing...</>
                          ) : (
                            <>Confirm Import ({csvPreview.length} rows)</>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Bulk Delete Confirmation Modal */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { if (!isBulkDeleting) setIsBulkDeleteConfirmOpen(false); }}
          />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <AlertCircle size={22} className="flex-shrink-0 text-red-600 dark:text-red-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Selected Suppliers</h3>
            </div>
            
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              Are you sure you want to delete the <strong className="font-semibold text-slate-800 dark:text-slate-200">{selectedSupplierIds.length}</strong> selected supplier quotes? This action cannot be undone and will remove them from all comparison matrices.
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="flex-1 h-9 text-sm cursor-pointer"
                disabled={isBulkDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  setIsBulkDeleting(true)
                  const res = await deleteSuppliersBatchAction(selectedSupplierIds)
                  setIsBulkDeleting(false)
                  setIsBulkDeleteConfirmOpen(false)
                  if (res.success) {
                    setSuppliers(prev => prev.filter(s => !selectedSupplierIds.includes(s.id)))
                    setSelectedSupplierIds([])
                    setIsManageMode(false)
                  } else {
                    alert(res.error || 'Failed to delete suppliers.')
                  }
                }}
                disabled={isBulkDeleting}
                className="flex-1 h-9 text-sm bg-red-600 hover:bg-red-700 text-white cursor-pointer gap-2"
              >
                {isBulkDeleting ? <><Loader2 size={13} className="animate-spin" /> Deleting...</> : 'Delete'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Supplier Profile Modal */}
      {isProfileOpen && selectedSupplierId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={() => {
              if (!isSavingProfile) setIsProfileOpen(false)
            }}
          />
          <div className="relative z-10 w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Users2 className="h-5 w-5 text-[#5c59e9]" />
                  <span>Supplier Profile: {profileForm.name}</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isProfileEditMode ? 'Modify supplier contact info and product capabilities' : 'Detailed information and comparison specs'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                disabled={isSavingProfile}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {profileErrorMessage && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs rounded-xl flex items-center gap-2 font-medium">
                  <AlertCircle size={14} />
                  <span>{profileErrorMessage}</span>
                </div>
              )}

              {/* SECTION 1: Basic & Contact Info */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact & Basic Details</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Email */}
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500 font-semibold">Email Address</Label>
                    {isProfileEditMode ? (
                      <Input
                        type="email"
                        value={profileForm.email}
                        onChange={e => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="e.g. contact@supplier.com"
                        className="h-9 text-xs rounded-xl"
                      />
                    ) : (
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-100/50 dark:border-slate-800">
                        {profileForm.email || '—'}
                      </p>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="space-y-1">
                    <Label className="text-xs text-slate-500 font-semibold">Phone Number</Label>
                    {isProfileEditMode ? (
                      <Input
                        type="text"
                        value={profileForm.phone}
                        onChange={e => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="e.g. +84 901 234 567"
                        className="h-9 text-xs rounded-xl"
                      />
                    ) : (
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-100/50 dark:border-slate-800">
                        {profileForm.phone || '—'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500 font-semibold">Factory / Office Address</Label>
                  {isProfileEditMode ? (
                    <textarea
                      value={profileForm.address}
                      onChange={e => setProfileForm(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="e.g. 123 Industrial Zone, Binh Duong, Vietnam"
                      rows={2}
                      className="flex w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-xs shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5c59e9] dark:border-slate-800 dark:bg-slate-950 resize-none"
                    />
                  ) : (
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950/50 p-2.5 rounded-xl border border-slate-100/50 dark:border-slate-800 leading-relaxed">
                      {profileForm.address || '—'}
                    </p>
                  )}
                </div>
              </div>

              {/* SECTION 2: Associated Order Details */}
              {profileOrderDetails && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Associated Order Context</h4>
                  <div className="grid grid-cols-3 gap-4 bg-indigo-50/20 dark:bg-indigo-950/5 p-4 rounded-2xl border border-indigo-100/30 dark:border-indigo-900/20">
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold block">Order Reference</span>
                      <span className="text-xs font-extrabold text-[#5c59e9]">{profileOrderDetails.orderCode}</span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold block">Quoted Price</span>
                      <span className="text-xs font-extrabold text-slate-850 dark:text-white">
                        ${profileOrderDetails.quotedPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold block">Lead Time</span>
                      <span className="text-xs font-extrabold text-slate-850 dark:text-white">{profileOrderDetails.leadTimeDays} days</span>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3: Additional Capabilities */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Product Capabilities</h4>
                  {isProfileEditMode && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddProfileCapability}
                      className="h-7 px-2 text-[10px] border-dashed border-slate-300 dark:border-slate-700 hover:bg-slate-50 rounded-lg cursor-pointer flex items-center gap-1"
                    >
                      <Plus size={10} />
                      Add Product
                    </Button>
                  )}
                </div>

                {isFetchingCapabilities ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <Loader2 size={16} className="animate-spin text-slate-400" />
                    <span className="text-[10px] text-slate-400">Loading capabilities...</span>
                  </div>
                ) : profileCapabilities.length === 0 ? (
                  <p className="text-xs italic text-slate-450 dark:text-slate-500 py-2">No additional product capabilities cataloged for this supplier.</p>
                ) : (
                  <div className="space-y-3">
                    {profileCapabilities.map((cap) => (
                      <div key={cap.id} className="flex items-center gap-3">
                        {isProfileEditMode ? (
                          <>
                            <div className="flex-1">
                              <Input
                                placeholder="Product Name (e.g. Cardboard Packaging)"
                                value={cap.productName}
                                onChange={e => handleProfileCapabilityChange(cap.id, 'productName', e.target.value)}
                                className="h-8 text-xs rounded-xl"
                              />
                            </div>
                            <div className="w-28 relative">
                              <span className="absolute left-2.5 top-2 text-xs text-slate-400">$</span>
                              <Input
                                type="number"
                                step="any"
                                placeholder="Target Price"
                                value={cap.targetPrice}
                                onChange={e => handleProfileCapabilityChange(cap.id, 'targetPrice', e.target.value)}
                                className="h-8 text-xs pl-5 pr-2 rounded-xl"
                              />
                            </div>
                            <Button
                              type="button"
                              onClick={() => handleDeleteProfileCapability(cap.id)}
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 text-red-500 border-slate-200 dark:border-slate-800 hover:bg-red-50 rounded-xl cursor-pointer"
                            >
                              <Trash2 size={12} />
                            </Button>
                          </>
                        ) : (
                          <div className="flex-1 flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-100/50 dark:border-slate-800 text-xs">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{cap.productName}</span>
                            <span className="font-bold text-[#5c59e9]">
                              ${parseFloat(cap.targetPrice || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              {isProfileEditMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsProfileEditMode(false)
                      setProfileErrorMessage(null)
                      // Reset details back to the active record values
                      const matched = suppliers.find(s => s.supplier_id === selectedSupplierId)
                      if (matched) {
                        setProfileForm({
                          name: matched.supplier_name || '',
                          email: matched.suppliers?.email || '',
                          phone: matched.suppliers?.phone || '',
                          address: matched.suppliers?.address || ''
                        })
                      }
                    }}
                    disabled={isSavingProfile}
                    className="h-9 text-xs rounded-xl font-semibold cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handleProfileSave}
                    disabled={isSavingProfile}
                    className="h-9 text-xs bg-[#5c59e9] hover:bg-[#4a47d2] text-white rounded-xl font-semibold cursor-pointer flex items-center gap-1.5"
                  >
                    {isSavingProfile && <Loader2 size={13} className="animate-spin" />}
                    <span>Save Changes</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsProfileOpen(false)}
                    className="h-9 text-xs rounded-xl font-semibold cursor-pointer"
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setIsProfileEditMode(true)}
                    className="h-9 text-xs bg-[#5c59e9] hover:bg-[#4a47d2] text-white rounded-xl font-semibold cursor-pointer"
                  >
                    Edit / Update
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* QC Success Modal */}
      {qcSuccessCount !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-all duration-300 animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-6 text-center shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
            <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-emerald-500/10 blur-2xl animate-pulse" />
            
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 mx-auto mb-4 border border-emerald-100/30">
              <Check size={24} className="stroke-[2.5]" />
            </div>

            <h3 className="text-base font-bold text-slate-950 dark:text-white mb-2">Shortlist Sent to QC</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Successfully sent <span className="font-bold text-slate-800 dark:text-slate-200">{qcSuccessCount}</span> shortlisted suppliers to the QC team for factory audits!
            </p>

            <Button
              onClick={() => setQcSuccessCount(null)}
              className="w-full h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors cursor-pointer shadow-md shadow-emerald-200/40 dark:shadow-none"
            >
              Understood
            </Button>
          </div>
        </div>
      )}

      {/* QC Error Modal */}
      {qcErrorText !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm transition-all duration-300 animate-in fade-in">
          <div className="relative w-full max-w-sm rounded-3xl border border-slate-200/80 bg-white p-6 text-center shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
            <div className="absolute -top-10 -right-10 h-28 w-28 rounded-full bg-rose-500/10 blur-2xl animate-pulse" />
            
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 mx-auto mb-4 border border-rose-100/30">
              <AlertCircle size={24} className="stroke-[2.2]" />
            </div>

            <h3 className="text-base font-bold text-slate-950 dark:text-white mb-2">Transmission Failed</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              {qcErrorText}
            </p>

            <Button
              onClick={() => setQcErrorText(null)}
              className="w-full h-9 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors cursor-pointer shadow-md shadow-rose-200/40 dark:shadow-none"
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
