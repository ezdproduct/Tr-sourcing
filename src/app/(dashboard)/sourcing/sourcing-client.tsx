'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
  updateSupplierProfileAction,
  confirmSupplierAndCreatePoAction
} from './actions'
import { KanbanBoard } from '@/app/(dashboard)/orders/kanban-board'
import { updateOrderStageAction } from '@/app/(dashboard)/orders/actions'
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
  DropdownMenuItem,
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
  Shield,
  CheckCircle2,
  FileText,
  PlusCircle,
  XCircle,
  ChevronDown,
  Clipboard,
  Download,
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
  suppliers?: { 
    email: string | null; 
    phone: string | null; 
    address: string | null;
    website?: string | null;
    contact_person?: string | null;
    tax_id?: string | null;
    business_type?: string | null;
    certifications?: string[] | null;
    [key: string]: any;
  } | null
}

interface SourcingClientProps {
  initialOrders: DatabaseOrder[]
  initialSuppliers: DatabaseSupplier[]
  initialAudits?: any[]
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

export function SourcingClient({ initialOrders, initialSuppliers, initialAudits = [] }: SourcingClientProps) {
  const { searchQuery, userRole } = useSourcing()
  const router = useRouter()

  const [overviewMode, setOverviewMode] = useState<'analytics' | 'kanban'>('analytics')
  const [audits, setAudits] = useState<any[]>(initialAudits)
  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  const handleStageChange = async (orderId: string, newStage: string) => {
    const result = await updateOrderStageAction(orderId, newStage)
    if (!result.success) {
      alert(`Failed to update order stage: ${result.error}`)
      return false
    }
    return true
  }

  // View mode: 'order' = per-order matrix, 'all' = global all-suppliers table
  const [viewMode, setViewMode] = useState<ViewMode>('all')
  const [allSuppliersSearch, setAllSuppliersSearch] = useState('')
  const [sidebarOrderSearch, setSidebarOrderSearch] = useState('')
  const [shortlistFilterOnly, setShortlistFilterOnly] = useState(false)
  const [orderShortlistFilterOnly, setOrderShortlistFilterOnly] = useState(false)

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [suppliers, setSuppliers] = useState<DatabaseSupplier[]>(initialSuppliers)
  // Local orders list to allow optimistic updates
  const [orders, setOrders] = useState<DatabaseOrder[]>(initialOrders)

  // Sync props to state when initialOrders or initialSuppliers change
  useEffect(() => {
    setOrders(initialOrders)
  }, [initialOrders])

  useEffect(() => {
    setSuppliers(initialSuppliers)
  }, [initialSuppliers])

  useEffect(() => {
    setAudits(initialAudits || [])
  }, [initialAudits])

  // Trigger router refresh once on mount only to clear Next.js client router cache
  // BUG 1 FIX: was [router] dep which caused infinite refresh loop
  useEffect(() => {
    router.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync selectedOrderId and viewMode with orders list (handling deletions/empty states)
  useEffect(() => {
    if (selectedOrderId && !orders.some(o => o.id === selectedOrderId)) {
      setSelectedOrderId(null)
      setViewMode('all')
    }
  }, [orders, selectedOrderId])

  const searchParams = useSearchParams()
  const initialSubtab = (searchParams.get('subtab') as 'overview' | 'suppliers' | 'workplace') || 'overview'
  const [subtab, setSubtab] = useState<'overview' | 'suppliers' | 'workplace'>(initialSubtab)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [isDeletingBatch, setIsDeletingBatch] = useState(false)

  const subtabParam = searchParams.get('subtab')

  useEffect(() => {
    if (subtabParam === 'overview' || subtabParam === 'suppliers' || subtabParam === 'workplace') {
      setSubtab(subtabParam)
    } else {
      setSubtab('overview')
    }
  }, [subtabParam])

  const handleTabChange = (val: 'overview' | 'suppliers' | 'workplace') => {
    setSubtab(val)
    setSelectedSupplierIds([])
    setIsManageMode(false)
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?subtab=${val}`
      window.history.pushState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
    }
  }
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  
  // PO creation states
  const [poSupplier, setPoSupplier] = useState<DatabaseSupplier | null>(null)
  const [poContractValue, setPoContractValue] = useState<number>(0)
  const [isPoConfirming, setIsPoConfirming] = useState(false)
  const [poTargetDeliveryDate, setPoTargetDeliveryDate] = useState<string>('')
  const [poDeliveryAddress, setPoDeliveryAddress] = useState<string>('')
  const [poContractFile, setPoContractFile] = useState<File | null>(null)

  // Upgraded manual normalized form states
  const [manualForm, setManualForm] = useState({
    supplierName: '',
    email: '',
    phone: '',
    address: '',
    orderId: '',
    website: '',
    contactPerson: '',
    taxId: '',
    businessType: ''
  })
  
  // Case 2 checklist bids: orderItemId -> { checked, price, leadTime }
  const [itemBids, setItemBids] = useState<Record<string, { checked: boolean; price: string; leadTime: string }>>({})

  // Case 1 & 2 repeating capability rows
  const [capabilities, setCapabilities] = useState<Array<{ 
    id: string
    productName: string 
    targetPrice: string 
    leadTimeDays?: string
    description?: string
    moq?: string
    sku?: string
    monthlyCapacity?: string
  }>>([])

  // Searchable order combobox states
  const [orderSearchQuery, setOrderSearchQuery] = useState('')
  const [isOrderDropdownOpen, setIsOrderDropdownOpen] = useState(false)

  // CSV Bulk Import states
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [csvPreview, setCsvPreview] = useState<any[]>([])
  const [importStatus, setImportStatus] = useState<{ success?: boolean; msg?: string; error?: string } | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importTab, setImportTab] = useState<'file' | 'paste'>('file')

  // Sheets paste states
  const [pasteText, setPasteText] = useState('')
  const [pastePreview, setPastePreview] = useState<any[]>([])
  const [isPasteImporting, setIsPasteImporting] = useState(false)
  const [pasteImportStatus, setPasteImportStatus] = useState<{ success?: boolean; msg?: string; error?: string } | null>(null)
  const [pasteErrorMessage, setPasteErrorMessage] = useState<string | null>(null)

  // Selection states for bulk delete in All Suppliers Overview
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
  const [isManageMode, setIsManageMode] = useState(false)

  // Supplier Profile detailed view & edit state
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isSendToQcConfirmOpen, setIsSendToQcConfirmOpen] = useState(false)
  const [isSendingToQc, setIsSendingToQc] = useState(false)
  const [toasts, setToasts] = useState<Array<{ id: string; message: string }>>([])

  // Duplicate Conflict Resolution states
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false)
  const [conflictingDuplicates, setConflictingDuplicates] = useState<any[]>([])
  const [pendingActionType, setPendingActionType] = useState<'manual' | 'csv' | 'paste' | null>(null)
  const [pendingPayload, setPendingPayload] = useState<any>(null)
  const [isResolvingDuplicates, setIsResolvingDuplicates] = useState(false)

  const handleResolveDuplicates = async (resolution: 'skip' | 'overwrite') => {
    if (!pendingActionType || !pendingPayload) return

    setIsResolvingDuplicates(true)
    setErrorMessage(null)
    setPasteErrorMessage(null)

    try {
      if (pendingActionType === 'manual') {
        const res = await addSupplierNormalizedAction(pendingPayload, resolution)
        if (res.success) {
          setManualForm({
            supplierName: '',
            email: '',
            phone: '',
            address: '',
            orderId: '',
            website: '',
            contactPerson: '',
            taxId: '',
            businessType: ''
          })
          setItemBids({})
          setCapabilities([])
          setIsAddOpen(false)
          setIsConflictDialogOpen(false)
          setPendingActionType(null)
          setPendingPayload(null)
          setConflictingDuplicates([])
          router.refresh()
        } else {
          setErrorMessage(res.error || 'Failed to add supplier.')
          setIsConflictDialogOpen(false)
        }
      } else if (pendingActionType === 'csv') {
        const res = await bulkImportSuppliersAction(pendingPayload, resolution)
        if (res.success) {
          setImportStatus({
            success: true,
            msg: `Imported ${res.importedSuppliersCount} unique suppliers, ${res.importedBidsCount} active bids, and ${res.importedCapabilitiesCount} capability records (with resolution: ${resolution}).`
          })
          setIsConflictDialogOpen(false)
          setPendingActionType(null)
          setPendingPayload(null)
          setConflictingDuplicates([])
        } else {
          setImportStatus({
            success: false,
            error: res.error || 'Import failed.'
          })
          setIsConflictDialogOpen(false)
        }
      } else if (pendingActionType === 'paste') {
        const res = await bulkImportSuppliersAction(pendingPayload, resolution)
        if (res.success) {
          setPasteImportStatus({
            success: true,
            msg: `Imported ${res.importedSuppliersCount} unique suppliers, ${res.importedBidsCount} active bids, and ${res.importedCapabilitiesCount} capability records (with resolution: ${resolution}).`
          })
          setIsConflictDialogOpen(false)
          setPendingActionType(null)
          setPendingPayload(null)
          setConflictingDuplicates([])
        } else {
          setPasteImportStatus({
            success: false,
            error: res.error || 'Import failed.'
          })
          setIsConflictDialogOpen(false)
        }
      }
    } catch (err: any) {
      console.error('Error resolving duplicates:', err)
      setErrorMessage(err.message || 'An unexpected error occurred.')
    } finally {
      setIsResolvingDuplicates(false)
    }
  }

  const triggerToast = (message: string) => {
    // eslint-disable-next-line react-hooks/purity
    const id = Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }
  const [isProfileEditMode, setIsProfileEditMode] = useState(false)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null)
  const [isFetchingCapabilities, setIsFetchingCapabilities] = useState(false)
  const [qcSuccessCount, setQcSuccessCount] = useState<number | null>(null)
  const [qcErrorText, setQcErrorText] = useState<string | null>(null)
  
  // Tab selector for Profile Modal
  const [activeProfileTab, setActiveProfileTab] = useState<'overview' | 'sourcing' | 'financials' | 'documents'>('overview')

  // Basic & contact details input state
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    contactPerson: '',
    taxId: '',
    businessType: '',

    // Basic Information
    supplierCode: '',
    legalName: '',
    yearFounded: '',
    companySize: '',
    industry: '',
    mainProducts: '',
    shortDescription: '',

    // Contact Information
    primaryContactName: '',
    position: '',
    alternativeContact: '',
    street: '',
    district: '',
    city: '',
    country: '',
    postalCode: '',
    linkedin: '',
    socialContact: '',

    // Financial & Legal
    paymentTerms: '',
    currency: '',
    bankInfo: '',
    creditLimit: '',
    taxStatus: '',
    businessLicense: '',
    certifications: '',

    // Sourcing & Performance
    sourcingCategory: '',
    leadTimeAverage: '',
    moq: '',
    pricingTier: '',
    qualityRating: '',
    reliabilityScore: '',
    onTimeDeliveryRate: '',
    defectRate: '',
    lastSourcedDate: '',
    totalSpend: '',
    totalOrders: '',
    isPreferred: false,

    // Metadata & Tracking
    status: 'Prospect',
    sourcingStage: 'New',
    approvalDate: '',
    reviewedBy: '',
    nextReviewDate: '',
    riskLevel: '',
    riskNotes: '',
    createdBy: '',
    ownerPic: '',
    tags: '',

    // Attachments
    docCompanyProfile: '',
    docCatalog: '',
    docContract: '',
    docCertificates: '',
    docAuditReports: '',
    docSampleApprovals: '',
    docNda: '',

    // Advanced
    esgScore: '',
    socialResponsibilityNotes: '',
    maxCapacityMonthly: '',
    mainMarkets: '',
    competitors: '',
    notes: '',
    communicationHistory: ''
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
    
    const sDetails: any = supplier.suppliers || {}
    setProfileForm({
      name: supplier.supplier_name || '',
      email: sDetails.email || '',
      phone: sDetails.phone || '',
      address: sDetails.address || '',
      website: sDetails.website || '',
      contactPerson: sDetails.contact_person || '',
      taxId: sDetails.tax_id || '',
      businessType: sDetails.business_type || '',

      // Basic Information
      supplierCode: sDetails.supplier_code || '',
      legalName: sDetails.legal_name || '',
      yearFounded: sDetails.year_founded ? String(sDetails.year_founded) : '',
      companySize: sDetails.company_size || '',
      industry: sDetails.industry || '',
      mainProducts: sDetails.main_products ? sDetails.main_products.join(', ') : '',
      shortDescription: sDetails.short_description || '',

      // Contact Information
      primaryContactName: sDetails.primary_contact_name || '',
      position: sDetails.position || '',
      alternativeContact: sDetails.alternative_contact || '',
      street: sDetails.street || '',
      district: sDetails.district || '',
      city: sDetails.city || '',
      country: sDetails.country || '',
      postalCode: sDetails.postal_code || '',
      linkedin: sDetails.linkedin || '',
      socialContact: sDetails.social_contact || '',

      // Financial & Legal
      paymentTerms: sDetails.payment_terms || '',
      currency: sDetails.currency || '',
      bankInfo: sDetails.bank_info || '',
      creditLimit: sDetails.credit_limit ? String(sDetails.credit_limit) : '',
      taxStatus: sDetails.tax_status || '',
      businessLicense: sDetails.business_license || '',
      certifications: sDetails.certifications ? sDetails.certifications.join(', ') : '',

      // Sourcing & Performance
      sourcingCategory: sDetails.sourcing_category || '',
      leadTimeAverage: sDetails.lead_time_average ? String(sDetails.lead_time_average) : '',
      moq: sDetails.moq ? String(sDetails.moq) : '',
      pricingTier: sDetails.pricing_tier || '',
      qualityRating: sDetails.quality_rating || '',
      reliabilityScore: sDetails.reliability_score ? String(sDetails.reliability_score) : '',
      onTimeDeliveryRate: sDetails.on_time_delivery_rate ? String(sDetails.on_time_delivery_rate) : '',
      defectRate: sDetails.defect_rate ? String(sDetails.defect_rate) : '',
      lastSourcedDate: sDetails.last_sourced_date || '',
      totalSpend: sDetails.total_spend ? String(sDetails.total_spend) : '',
      totalOrders: sDetails.total_orders ? String(sDetails.total_orders) : '',
      isPreferred: sDetails.is_preferred || false,

      // Metadata & Tracking
      status: sDetails.status || 'Prospect',
      sourcingStage: sDetails.sourcing_stage || 'New',
      approvalDate: sDetails.approval_date ? sDetails.approval_date.substring(0, 10) : '',
      reviewedBy: sDetails.reviewed_by || '',
      nextReviewDate: sDetails.next_review_date || '',
      riskLevel: sDetails.risk_level || '',
      riskNotes: sDetails.risk_notes || '',
      createdBy: sDetails.created_by || '',
      ownerPic: sDetails.owner_pic || '',
      tags: sDetails.tags ? sDetails.tags.join(', ') : '',

      // Attachments
      docCompanyProfile: sDetails.doc_company_profile || '',
      docCatalog: sDetails.doc_catalog || '',
      docContract: sDetails.doc_contract || '',
      docCertificates: sDetails.doc_certificates ? sDetails.doc_certificates.join(', ') : '',
      docAuditReports: sDetails.doc_audit_reports ? sDetails.doc_audit_reports.join(', ') : '',
      docSampleApprovals: sDetails.doc_sample_approvals ? sDetails.doc_sample_approvals.join(', ') : '',
      docNda: sDetails.doc_nda || '',

      // Advanced
      esgScore: sDetails.esg_score ? String(sDetails.esg_score) : '',
      socialResponsibilityNotes: sDetails.social_responsibility_notes || '',
      maxCapacityMonthly: sDetails.max_capacity_monthly || '',
      mainMarkets: sDetails.main_markets ? sDetails.main_markets.join(', ') : '',
      competitors: sDetails.competitors || '',
      notes: sDetails.notes || '',
      communicationHistory: sDetails.communication_history || ''
    })

    setProfileOrderDetails({
      orderCode: (supplier.orders?.order_code && supplier.orders.order_code !== 'POTENTIAL') ? supplier.orders.order_code : 'Unassigned',
      quotedPrice: Number(supplier.quoted_price || 0),
      leadTimeDays: supplier.lead_time_days || 0
    })

    setProfileCapabilities([])
    setProfileErrorMessage(null)
    setIsProfileEditMode(false)
    setActiveProfileTab('overview')
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
    website: false,
    contactPerson: false,
    taxId: false,
    businessType: false,
    certifications: false,
    associatedOrder: true,
    productItem: true,
    quotedPrice: true,
    leadTime: true,
    shortlistStatus: true,
    qcStatus: true,
  })

  const toggleableColumns = [
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'website', label: 'Website' },
    { key: 'contactPerson', label: 'Contact Person' },
    { key: 'taxId', label: 'Tax ID' },
    { key: 'businessType', label: 'Business Type' },
    { key: 'certifications', label: 'Certifications' },
    { key: 'associatedOrder', label: 'Associated Order' },
    { key: 'productItem', label: 'Product Item' },
    { key: 'quotedPrice', label: 'Quoted Price' },
    { key: 'leadTime', label: 'Lead Time' },
    { key: 'shortlistStatus', label: 'Shortlist Status' },
    { key: 'qcStatus', label: 'QC Status' },
  ]

  // Column Visibility State for individual order supplier table
  const [orderColumnVisibility, setOrderColumnVisibility] = useState<Record<string, boolean>>({
    supplierName: true,
    email: false,
    phone: false,
    address: false,
    website: false,
    contactPerson: false,
    taxId: false,
    businessType: false,
    certifications: false,
    productItem: true,
    quotedPrice: true,
    leadTime: true,
    shortlistStatus: true,
    qcStatus: true,
  })

  const orderToggleableColumns = [
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'address', label: 'Address' },
    { key: 'website', label: 'Website' },
    { key: 'contactPerson', label: 'Contact Person' },
    { key: 'taxId', label: 'Tax ID' },
    { key: 'businessType', label: 'Business Type' },
    { key: 'certifications', label: 'Certifications' },
    { key: 'productItem', label: 'Product Item' },
    { key: 'quotedPrice', label: 'Quoted Price' },
    { key: 'leadTime', label: 'Lead Time' },
    { key: 'shortlistStatus', label: 'Shortlist Status' },
    { key: 'qcStatus', label: 'QC Status' },
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
      o.order_code.toLowerCase().includes(sidebarOrderSearch.toLowerCase()) ||
      type.toLowerCase().includes(sidebarOrderSearch.toLowerCase()) ||
      (o.order_items && o.order_items.some(item =>
        item.item_name.toLowerCase().includes(sidebarOrderSearch.toLowerCase())
      ))
    )
  })

  // Suppliers for selected order, also filter by search and shortlist status
  // BUG 2 FIX: only apply item-match filter when the order actually HAS items;
  //            an empty order_items array (length === 0) previously hid all suppliers.
  const orderSuppliers = suppliers.filter(s => {
    if (s.order_id !== selectedOrderId) return false

    // Only enforce item-matching when the order has at least one item defined
    if (selectedOrder?.order_items && selectedOrder.order_items.length > 0) {
      const isAllowedItem = selectedOrder.order_items.some(item => item.id === s.order_item_id)
      if (!isAllowedItem) return false
    }

    const matchesSearch = searchQuery === '' || s.supplier_name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesShortlist = !orderShortlistFilterOnly || s.is_shortlisted
    return matchesSearch && matchesShortlist
  })

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

  // Unique supplier profiles directory logic (moved from management system)
  const uniqueSuppliers = Array.from(
    new Map(
      suppliers
        .filter(s => s.suppliers)
        .map(s => [s.supplier_id, {
          id: s.suppliers!.id,
          name: s.supplier_name,
          email: s.suppliers!.email,
          phone: s.suppliers!.phone,
          address: s.suppliers!.address,
          website: s.suppliers!.website,
          contact_person: s.suppliers!.contact_person,
          tax_id: s.suppliers!.tax_id,
          business_type: s.suppliers!.business_type,
          bidsCount: suppliers.filter(x => x.supplier_id === s.supplier_id && x.order_id).length,
          auditsCount: audits.filter(x => x.supplier_id === s.supplier_id).length,
          rawRecord: s
        }])
    ).values()
  )

  const filteredUniqueSuppliers = uniqueSuppliers.filter(s => {
    const q = supplierSearch.toLowerCase()
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.contact_person || '').toLowerCase().includes(q)
    )
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
    const { supplierName, email, phone, address, orderId, website, contactPerson, taxId, businessType } = manualForm

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

    const caps: Array<{
      productName: string
      targetPrice: number
      leadTimeDays?: string
      description?: string
      moq?: number
      sku?: string
      monthlyCapacity?: string
    }> = []
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
      const moqVal = cap.moq ? parseInt(cap.moq, 10) : undefined
      caps.push({
        productName: cap.productName.trim(),
        targetPrice: price,
        leadTimeDays: cap.leadTimeDays || undefined,
        description: cap.description || undefined,
        moq: moqVal,
        sku: cap.sku || undefined,
        monthlyCapacity: cap.monthlyCapacity || undefined
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
      capabilities: caps,
      website,
      contactPerson,
      taxId,
      businessType
    })

    setIsSubmitting(false)

    if (result.success) {
      setManualForm({
        supplierName: '',
        email: '',
        phone: '',
        address: '',
        orderId: '',
        website: '',
        contactPerson: '',
        taxId: '',
        businessType: ''
      })
      setItemBids({})
      setCapabilities([])
      setIsAddOpen(false)
      router.refresh()
    } else if (result.duplicateDetected) {
      setPendingActionType('manual')
      setPendingPayload({
        supplierName,
        email,
        phone,
        address,
        orderId: orderId || null,
        items: bids,
        capabilities: caps,
        website,
        contactPerson,
        taxId,
        businessType
      })
      setConflictingDuplicates(result.duplicates)
      setIsConflictDialogOpen(true)
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
          productName: headers.indexOf('productname') !== -1 ? headers.indexOf('productname') : headers.indexOf('product'),
          quotedPrice: headers.indexOf('quotedprice') !== -1 ? headers.indexOf('quotedprice') : headers.indexOf('price'),
          leadTime: headers.indexOf('leadtime') !== -1 ? headers.indexOf('leadtime') : headers.indexOf('leadtimedays'),
          website: headers.indexOf('website'),
          contactPerson: headers.indexOf('contactperson'),
          taxId: headers.indexOf('taxid'),
          businessType: headers.indexOf('businesstype')
        }
        
        if (colMap.supplierName === -1) colMap.supplierName = headers.findIndex(h => h.includes('supplier') || h.includes('name'))
        if (colMap.email === -1) colMap.email = headers.indexOf('email')
        if (colMap.phone === -1) colMap.phone = headers.indexOf('phone')
        if (colMap.address === -1) colMap.address = headers.indexOf('address')
        if (colMap.orderCode === -1) colMap.orderCode = headers.findIndex(h => h.includes('ordercode') || h.includes('order'))
        if (colMap.productName === -1) colMap.productName = headers.findIndex(h => h.includes('product') || h.includes('item'))
        if (colMap.quotedPrice === -1) colMap.quotedPrice = headers.findIndex(h => h.includes('price') || h.includes('quoted'))
        if (colMap.leadTime === -1) colMap.leadTime = headers.findIndex(h => h.includes('lead') || h.includes('time') || h.includes('days'))
        if (colMap.website === -1) colMap.website = headers.findIndex(h => h.includes('website') || h.includes('site'))
        if (colMap.contactPerson === -1) colMap.contactPerson = headers.findIndex(h => h.includes('contact') || h.includes('representative'))
        if (colMap.taxId === -1) colMap.taxId = headers.findIndex(h => h.includes('tax') || h.includes('reg'))
        if (colMap.businessType === -1) colMap.businessType = headers.findIndex(h => h.includes('business') || h.includes('type'))

        if (colMap.supplierName === -1) colMap.supplierName = 0
        if (colMap.email === -1) colMap.email = 1
        if (colMap.phone === -1) colMap.phone = 2
        if (colMap.address === -1) colMap.address = 3
        if (colMap.orderCode === -1) colMap.orderCode = -1
        if (colMap.productName === -1) colMap.productName = 4
        if (colMap.quotedPrice === -1) colMap.quotedPrice = 5
        if (colMap.leadTime === -1) colMap.leadTime = 6
        if (colMap.website === -1) colMap.website = -1
        if (colMap.contactPerson === -1) colMap.contactPerson = -1
        if (colMap.taxId === -1) colMap.taxId = -1
        if (colMap.businessType === -1) colMap.businessType = -1

        const parsedData = rawRows.slice(1).map(row => {
          const getValue = (idx: number) => (idx !== -1 && idx < row.length ? row[idx] : '')
          
          const supplierName = getValue(colMap.supplierName)
          const email = getValue(colMap.email)
          const phone = getValue(colMap.phone)
          const address = getValue(colMap.address)
          let orderCode = getValue(colMap.orderCode)
          const productName = getValue(colMap.productName)
          const quotedPriceStr = getValue(colMap.quotedPrice)
          const leadTimeStr = getValue(colMap.leadTime)

          const website = getValue(colMap.website)
          const contactPerson = getValue(colMap.contactPerson)
          const taxId = getValue(colMap.taxId)
          const businessType = getValue(colMap.businessType)

          // Inject active order code if blank, null, or dashed in order view context, AND the product matches the order requirements
          const isBlankOrder = !orderCode || orderCode.trim() === '' || orderCode.trim() === '-'
          if (isBlankOrder && viewMode === 'order' && selectedOrder) {
            const matchesActiveOrderItems = selectedOrder.order_items?.some(
              (item: any) => item.item_name.toLowerCase().trim() === productName.toLowerCase().trim()
            )
            if (matchesActiveOrderItems) {
              orderCode = selectedOrder.order_code
            }
          }
          
          // Price: strip dollar sign, parse as float
          const cleanPriceStr = quotedPriceStr ? quotedPriceStr.replace(/[^0-9.]/g, '') : '0'
          const quotedPrice = parseFloat(cleanPriceStr) || 0

          // Lead Time: strip non-numeric characters, parse as integer
          const cleanLeadTimeStr = leadTimeStr ? leadTimeStr.replace(/[^0-9]/g, '') : '0'
          const leadTime = parseInt(cleanLeadTimeStr) || 0

          return {
            supplierName,
            email,
            phone,
            address,
            orderCode,
            productName,
            quotedPrice,
            leadTime,
            website,
            contactPerson,
            taxId,
            businessType
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

  const handleClipboardPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text')
    if (!pastedText) return
    parseAndPreviewPaste(pastedText)
  }

  const handlePasteTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setPasteText(text)
    parseAndPreviewPaste(text)
  }

  const parseAndPreviewPaste = (text: string) => {
    try {
      const rawRows = text.split(/\r?\n/).map(row => row.split('\t').map(cell => cell.trim()))
      const validRows = rawRows.filter(r => r.length > 0 && r.some(cell => cell !== ''))
      
      if (validRows.length === 0) {
        setPastePreview([])
        return
      }

      // Check if the first row is a header row
      const firstRow = validRows[0]
      const lowercaseFirstRow = firstRow.map(cell => cell.toLowerCase().trim().replace(/['"_\s]+/g, ''))
      
      const hasHeaderIndicators = lowercaseFirstRow.some(h => 
        h.includes('supplier') || h.includes('name') || h.includes('email') || 
        h.includes('product') || h.includes('item') || h.includes('price') || 
        h.includes('quoted') || h.includes('lead') || h.includes('time') || h.includes('days')
      )

      let dataRows = validRows
      let colMap = {
        supplierName: 0,
        email: 1,
        productName: 2,
        quotedPrice: 3,
        leadTime: 4,
        phone: -1,
        address: -1,
        orderCode: -1,
        website: -1,
        contactPerson: -1,
        taxId: -1,
        businessType: -1
      }

      if (hasHeaderIndicators) {
        dataRows = validRows.slice(1)
        colMap = {
          supplierName: lowercaseFirstRow.findIndex(h => h.includes('supplier') || h.includes('name')),
          email: lowercaseFirstRow.indexOf('email'),
          productName: lowercaseFirstRow.findIndex(h => h.includes('product') || h.includes('item')),
          quotedPrice: lowercaseFirstRow.findIndex(h => h.includes('price') || h.includes('quoted')),
          leadTime: lowercaseFirstRow.findIndex(h => h.includes('lead') || h.includes('time') || h.includes('days')),
          phone: lowercaseFirstRow.indexOf('phone'),
          address: lowercaseFirstRow.indexOf('address'),
          orderCode: lowercaseFirstRow.findIndex(h => h.includes('ordercode') || h.includes('order')),
          website: lowercaseFirstRow.findIndex(h => h.includes('website') || h.includes('site')),
          contactPerson: lowercaseFirstRow.findIndex(h => h.includes('contact') || h.includes('representative')),
          taxId: lowercaseFirstRow.findIndex(h => h.includes('tax') || h.includes('reg')),
          businessType: lowercaseFirstRow.findIndex(h => h.includes('business') || h.includes('type'))
        }

        // Fallbacks if not found
        if (colMap.supplierName === -1) colMap.supplierName = 0
        if (colMap.email === -1) colMap.email = 1
        if (colMap.productName === -1) colMap.productName = 2
        if (colMap.quotedPrice === -1) colMap.quotedPrice = 3
        if (colMap.leadTime === -1) colMap.leadTime = 4
      }

      const parsedData = dataRows.map(row => {
        const getValue = (idx: number) => (idx !== -1 && idx < row.length ? row[idx] : '')
        
        const supplierName = getValue(colMap.supplierName)
        const email = getValue(colMap.email)
        const phone = getValue(colMap.phone)
        const address = getValue(colMap.address)
        let orderCode = getValue(colMap.orderCode)
        const productName = getValue(colMap.productName)
        const quotedPriceStr = getValue(colMap.quotedPrice)
        const leadTimeStr = getValue(colMap.leadTime)

        const website = getValue(colMap.website)
        const contactPerson = getValue(colMap.contactPerson)
        const taxId = getValue(colMap.taxId)
        const businessType = getValue(colMap.businessType)

        // Inject active order code if blank, null, or dashed in order view context, AND the product matches the order requirements
        const isBlankOrder = !orderCode || orderCode.trim() === '' || orderCode.trim() === '-'
        if (isBlankOrder && viewMode === 'order' && selectedOrder) {
          const matchesActiveOrderItems = selectedOrder.order_items?.some(
            (item: any) => item.item_name.toLowerCase().trim() === productName.toLowerCase().trim()
          )
          if (matchesActiveOrderItems) {
            orderCode = selectedOrder.order_code
          }
        }

        // Price: strip dollar sign, parse as float
        const cleanPriceStr = quotedPriceStr ? quotedPriceStr.replace(/[^0-9.]/g, '') : '0'
        const quotedPrice = parseFloat(cleanPriceStr) || 0

        // Lead Time: strip non-numeric characters, parse as integer
        const cleanLeadTimeStr = leadTimeStr ? leadTimeStr.replace(/[^0-9]/g, '') : '0'
        const leadTime = parseInt(cleanLeadTimeStr) || 0

        return {
          supplierName,
          email,
          phone,
          address,
          orderCode,
          productName,
          quotedPrice,
          leadTime,
          website,
          contactPerson,
          taxId,
          businessType
        }
      }).filter(item => item.supplierName !== '')

      setPastePreview(parsedData)
      setPasteErrorMessage(null)
    } catch (err: any) {
      setPasteErrorMessage('Failed to parse clipboard data: ' + err.message)
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

  // BUG 5 FIX: orderId was accepted but silently dropped — now stored so
  //            handleConfirmSendToQc can use the correct scoped order
  const [pendingQcOrderId, setPendingQcOrderId] = useState<string | null | undefined>(undefined)

  const handleSendShortlistToQc = (orderId?: string | null) => {
    setPendingQcOrderId(orderId)
    setIsSendToQcConfirmOpen(true)
  }

  const handleConfirmSendToQc = async () => {
    setIsSendingToQc(true)
    // BUG 5 FIX: use pendingQcOrderId (set by handleSendShortlistToQc) so the
    //            correct order scope is preserved through the confirmation modal
    const targetOrderId = pendingQcOrderId !== undefined ? pendingQcOrderId : selectedOrderId

    const checkedCount = selectedSupplierIds.length
    if (checkedCount > 0) {
      const scopedSuppliers = targetOrderId
        ? orderSuppliers.filter(s => selectedSupplierIds.includes(s.id))
        : suppliers.filter(s => selectedSupplierIds.includes(s.id))
      const unshortlisted = scopedSuppliers.filter(s => !s.is_shortlisted)
      
      for (const supplier of unshortlisted) {
        await updateShortlistAction(supplier.id, true)
      }
      
      // Update local state
      setSuppliers(prev =>
        prev.map(item => selectedSupplierIds.includes(item.id) ? { ...item, is_shortlisted: true } : item)
      )
    }
    
    const res = await sendShortlistToQcAction(targetOrderId)
    setIsSendingToQc(false)
    setIsSendToQcConfirmOpen(false)
    setPendingQcOrderId(undefined)
    
    if (res.success) {
      setQcSuccessCount(res.count ?? 0)
      setSelectedSupplierIds([])
    } else {
      setQcErrorText(res.error || 'Failed to send shortlist to QC')
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return
    const idToDelete = confirmDeleteId
    setConfirmDeleteId(null)
    setDeletingId(idToDelete)

    const itemToDelete = suppliers.find(s => s.id === idToDelete)
    const supplierId = itemToDelete ? itemToDelete.supplier_id : null

    const result = await deleteSupplierAction(idToDelete)
    setDeletingId(null)
    if (result.success) {
      setSuppliers(prev => prev.filter(s => 
        s.id !== idToDelete && 
        (supplierId ? s.supplier_id !== supplierId : true)
      ))
    }
  }

  const handleConfirmBatchDelete = async () => {
    setIsDeletingBatch(true)
    const res = await deleteSuppliersBatchAction(selectedSupplierIds)
    setIsDeletingBatch(false)
    setIsBulkDeleteConfirmOpen(false)

    if (res.success) {
      setSuppliers(prev => prev.filter(s => s.supplier_id ? !selectedSupplierIds.includes(s.supplier_id) : true))
      setSelectedSupplierIds([])
      setIsManageMode(false)
      triggerToast(`Successfully deleted ${selectedSupplierIds.length} suppliers.`)
    } else {
      triggerToast(res.error || 'Failed to delete suppliers.')
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
      capabilities: caps,
      website: profileForm.website,
      contactPerson: profileForm.contactPerson,
      taxId: profileForm.taxId,
      businessType: profileForm.businessType,

      supplierCode: profileForm.supplierCode,
      legalName: profileForm.legalName,
      yearFounded: profileForm.yearFounded ? parseInt(profileForm.yearFounded) : undefined,
      companySize: profileForm.companySize,
      industry: profileForm.industry,
      mainProducts: profileForm.mainProducts ? profileForm.mainProducts.split(',').map(s => s.trim()).filter(Boolean) : [],
      shortDescription: profileForm.shortDescription,

      primaryContactName: profileForm.primaryContactName,
      position: profileForm.position,
      alternativeContact: profileForm.alternativeContact,
      street: profileForm.street,
      district: profileForm.district,
      city: profileForm.city,
      country: profileForm.country,
      postalCode: profileForm.postalCode,
      linkedin: profileForm.linkedin,
      socialContact: profileForm.socialContact,

      paymentTerms: profileForm.paymentTerms,
      currency: profileForm.currency,
      bankInfo: profileForm.bankInfo,
      creditLimit: profileForm.creditLimit ? parseFloat(profileForm.creditLimit) : undefined,
      taxStatus: profileForm.taxStatus,
      businessLicense: profileForm.businessLicense,
      certifications: profileForm.certifications ? profileForm.certifications.split(',').map(s => s.trim()).filter(Boolean) : [],

      sourcingCategory: profileForm.sourcingCategory,
      leadTimeAverage: profileForm.leadTimeAverage ? parseInt(profileForm.leadTimeAverage) : undefined,
      moq: profileForm.moq ? parseInt(profileForm.moq) : undefined,
      pricingTier: profileForm.pricingTier,
      qualityRating: profileForm.qualityRating,
      reliabilityScore: profileForm.reliabilityScore ? parseFloat(profileForm.reliabilityScore) : undefined,
      onTimeDeliveryRate: profileForm.onTimeDeliveryRate ? parseFloat(profileForm.onTimeDeliveryRate) : undefined,
      defectRate: profileForm.defectRate ? parseFloat(profileForm.defectRate) : undefined,
      lastSourcedDate: profileForm.lastSourcedDate || undefined,
      totalSpend: profileForm.totalSpend ? parseFloat(profileForm.totalSpend) : undefined,
      totalOrders: profileForm.totalOrders ? parseInt(profileForm.totalOrders) : undefined,
      isPreferred: profileForm.isPreferred,

      status: profileForm.status,
      sourcingStage: profileForm.sourcingStage,
      approvalDate: profileForm.approvalDate || undefined,
      reviewedBy: profileForm.reviewedBy,
      nextReviewDate: profileForm.nextReviewDate || undefined,
      riskLevel: profileForm.riskLevel,
      riskNotes: profileForm.riskNotes,
      createdBy: profileForm.createdBy,
      ownerPic: profileForm.ownerPic,
      tags: profileForm.tags ? profileForm.tags.split(',').map(s => s.trim()).filter(Boolean) : [],

      docCompanyProfile: profileForm.docCompanyProfile,
      docCatalog: profileForm.docCatalog,
      docContract: profileForm.docContract,
      docCertificates: profileForm.docCertificates ? profileForm.docCertificates.split(',').map(s => s.trim()).filter(Boolean) : [],
      docAuditReports: profileForm.docAuditReports ? profileForm.docAuditReports.split(',').map(s => s.trim()).filter(Boolean) : [],
      docSampleApprovals: profileForm.docSampleApprovals ? profileForm.docSampleApprovals.split(',').map(s => s.trim()).filter(Boolean) : [],
      docNda: profileForm.docNda,

      esgScore: profileForm.esgScore ? parseFloat(profileForm.esgScore) : undefined,
      socialResponsibilityNotes: profileForm.socialResponsibilityNotes,
      maxCapacityMonthly: profileForm.maxCapacityMonthly,
      mainMarkets: profileForm.mainMarkets ? profileForm.mainMarkets.split(',').map(s => s.trim()).filter(Boolean) : [],
      competitors: profileForm.competitors,
      notes: profileForm.notes,
      communicationHistory: profileForm.communicationHistory
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
              address: profileForm.address,
              website: profileForm.website,
              contact_person: profileForm.contactPerson,
              tax_id: profileForm.taxId,
              business_type: profileForm.businessType,

              supplier_code: profileForm.supplierCode,
              legal_name: profileForm.legalName,
              year_founded: profileForm.yearFounded ? parseInt(profileForm.yearFounded) : null,
              company_size: profileForm.companySize,
              industry: profileForm.industry,
              main_products: profileForm.mainProducts ? profileForm.mainProducts.split(',').map(s => s.trim()).filter(Boolean) : [],
              short_description: profileForm.shortDescription,

              primary_contact_name: profileForm.primaryContactName,
              position: profileForm.position,
              alternative_contact: profileForm.alternativeContact,
              street: profileForm.street,
              district: profileForm.district,
              city: profileForm.city,
              country: profileForm.country,
              postal_code: profileForm.postalCode,
              linkedin: profileForm.linkedin,
              social_contact: profileForm.socialContact,

              payment_terms: profileForm.paymentTerms,
              currency: profileForm.currency,
              bank_info: profileForm.bankInfo,
              credit_limit: profileForm.creditLimit ? parseFloat(profileForm.creditLimit) : null,
              tax_status: profileForm.taxStatus,
              business_license: profileForm.businessLicense,
              certifications: profileForm.certifications ? profileForm.certifications.split(',').map(s => s.trim()).filter(Boolean) : [],

              sourcing_category: profileForm.sourcingCategory,
              lead_time_average: profileForm.leadTimeAverage ? parseInt(profileForm.leadTimeAverage) : null,
              moq: profileForm.moq ? parseInt(profileForm.moq) : null,
              pricing_tier: profileForm.pricingTier,
              quality_rating: profileForm.qualityRating,
              reliability_score: profileForm.reliabilityScore ? parseFloat(profileForm.reliabilityScore) : null,
              on_time_delivery_rate: profileForm.onTimeDeliveryRate ? parseFloat(profileForm.onTimeDeliveryRate) : null,
              defect_rate: profileForm.defectRate ? parseFloat(profileForm.defectRate) : null,
              last_sourced_date: profileForm.lastSourcedDate || null,
              total_spend: profileForm.totalSpend ? parseFloat(profileForm.totalSpend) : null,
              total_orders: profileForm.totalOrders ? parseInt(profileForm.totalOrders) : null,
              is_preferred: profileForm.isPreferred,

              status: profileForm.status,
              sourcing_stage: profileForm.sourcingStage,
              approval_date: profileForm.approvalDate || null,
              reviewed_by: profileForm.reviewedBy,
              next_review_date: profileForm.nextReviewDate || null,
              risk_level: profileForm.riskLevel,
              risk_notes: profileForm.riskNotes,
              created_by: profileForm.createdBy,
              owner_pic: profileForm.ownerPic,
              tags: profileForm.tags ? profileForm.tags.split(',').map(s => s.trim()).filter(Boolean) : [],

              doc_company_profile: profileForm.docCompanyProfile,
              doc_catalog: profileForm.docCatalog,
              doc_contract: profileForm.docContract,
              doc_certificates: profileForm.docCertificates ? profileForm.docCertificates.split(',').map(s => s.trim()).filter(Boolean) : [],
              doc_audit_reports: profileForm.docAuditReports ? profileForm.docAuditReports.split(',').map(s => s.trim()).filter(Boolean) : [],
              doc_sample_approvals: profileForm.docSampleApprovals ? profileForm.docSampleApprovals.split(',').map(s => s.trim()).filter(Boolean) : [],
              doc_nda: profileForm.docNda,

              esg_score: profileForm.esgScore ? parseFloat(profileForm.esgScore) : null,
              social_responsibility_notes: profileForm.socialResponsibilityNotes,
              max_capacity_monthly: profileForm.maxCapacityMonthly,
              main_markets: profileForm.mainMarkets ? profileForm.mainMarkets.split(',').map(s => s.trim()).filter(Boolean) : [],
              competitors: profileForm.competitors,
              notes: profileForm.notes,
              communication_history: profileForm.communicationHistory
            }
          }
        }
        return s
      }))
      // Refresh order context
      const updatedSupplier = suppliers.find(s => s.supplier_id === selectedSupplierId)
      if (updatedSupplier) {
        setProfileOrderDetails({
          orderCode: (updatedSupplier.orders?.order_code && updatedSupplier.orders.order_code !== 'POTENTIAL')
            ? updatedSupplier.orders.order_code
            : 'Unassigned',
          quotedPrice: Number(updatedSupplier.quoted_price || 0),
          leadTimeDays: updatedSupplier.lead_time_days || 0
        })
      }
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

  return (
    <div className="space-y-6">
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
        <div className="space-y-6">


          {overviewMode === 'analytics' ? (
            <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Suppliers</CardTitle>
                <Users2 className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                {/* BUG 15 FIX: use live suppliers state, not the stale initial prop */}
                <div className="text-2xl font-black text-slate-900 dark:text-white">{suppliers.length}</div>
                <p className="text-[10px] text-slate-400 mt-1">Registered suppliers in database</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">With Pricing Bids</CardTitle>
                <Package className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {/* BUG 16 FIX: use live suppliers state */}
                  {suppliers.filter(s => s.quoted_price > 0).length}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Suppliers with active bids</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Campaigns</CardTitle>
                <Package className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                {/* BUG 17 FIX: use live orders state */}
                <div className="text-2xl font-black text-slate-900 dark:text-white">{orders.length}</div>
                <p className="text-[10px] text-slate-400 mt-1">Sourcing campaigns running</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Quality Grade</CardTitle>
                <Shield className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">A- Grade</div>
                <p className="text-[10px] text-emerald-600 mt-1 font-medium">92% Compliance pass rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Sourcing Distribution and Recent actions */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Sourcing Category Division</CardTitle>
                <CardDescription className="text-xs">Shortlist allocation across wood/metal components</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Binh Duong Woodworks (Oakwood)', pct: '85%' },
                  { label: 'Dong Nai Metalware (Fasteners)', pct: '70%' },
                  { label: 'Long An Plastics (Cases)', pct: '45%' },
                  { label: 'Da Nang Electronics (Cables)', pct: '60%' }
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
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Recent Shortlists & Bids</CardTitle>
                <CardDescription className="text-xs">Latest supplier entries added to sourcing matrix</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {initialSuppliers.length === 0 ? (
                  <p className="text-xs text-slate-400">No suppliers registered.</p>
                ) : (
                  initialSuppliers.slice(0, 3).map((supplier, idx) => (
                    <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                      <button
                        onClick={() => {
                          setSubtab('workplace')
                        }}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {supplier.supplier_name}
                      </button>
                      <div className="flex-1 space-y-0.5">
                        <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                          Created at {new Date(supplier.created_at).toLocaleDateString()}
                        </p>
                        <p className="text-[10px] text-slate-400">Contact: {supplier.suppliers?.email || supplier.suppliers?.phone || 'N/A'}</p>
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
                  setSelectedOrderId(order.id)
                  setViewMode('order')
                  setSubtab('workplace')
                }}
                onStageChange={handleStageChange}
              />
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="suppliers" className="space-y-4 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
        <div className="flex items-center gap-3 justify-between">
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search suppliers by name or email..."
              value={supplierSearch}
              onChange={e => setSupplierSearch(e.target.value)}
              className="h-9 w-full rounded-lg pl-9 pr-4 text-xs bg-slate-50 border-slate-200 focus:bg-white dark:bg-slate-900 dark:border-slate-800"
            />
          </div>
          {isManageMode ? (
            <div className="flex items-center gap-2">
              <Button
                disabled={selectedSupplierIds.length === 0 || isDeletingBatch}
                onClick={handleConfirmBatchDelete}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:bg-red-600 text-white gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer"
              >
                {isDeletingBatch ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                <span>Delete Selected ({selectedSupplierIds.length})</span>
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsManageMode(false)
                  setSelectedSupplierIds([])
                }}
                className="h-9 px-4 rounded-lg text-xs font-semibold border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer text-xs font-semibold"
                >
                  <span>Add / Manage</span>
                  <ChevronDown size={12} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-md z-50">
                <DropdownMenuItem
                  onClick={() => {
                    setManualForm({
                      supplierName: '',
                      email: '',
                      phone: '',
                      address: '',
                      orderId: '',
                      website: '',
                      contactPerson: '',
                      taxId: '',
                      businessType: ''
                    })
                    setItemBids({})
                    setCapabilities([])
                    setErrorMessage(null)
                    setIsAddOpen(true)
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Plus size={12} className="text-[#5c59e9]" />
                  <span>Add Supplier</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => {
                    setCsvPreview([])
                    setImportStatus(null)
                    setPasteText('')
                    setPastePreview([])
                    setPasteImportStatus(null)
                    setPasteErrorMessage(null)
                    setImportTab('file')
                    setIsImportOpen(true)
                    setErrorMessage(null)
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Upload size={12} className="text-[#5c59e9]" />
                  <span>Import Excel/CSV</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => setIsManageMode(true)}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Trash2 size={12} className="text-red-500" />
                  <span>Select & Delete</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
          <CardContent className="p-0">
            {filteredUniqueSuppliers.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center gap-3 text-center min-h-[300px]">
                <Users2 size={36} className="text-slate-200 dark:text-slate-700" />
                <p className="text-sm text-slate-400 font-medium">No suppliers found</p>
              </div>
            ) : (
              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                      {isManageMode && (
                        <th className="px-6 py-4 w-12 text-center">
                          <input 
                            type="checkbox"
                            checked={filteredUniqueSuppliers.length > 0 && selectedSupplierIds.length === filteredUniqueSuppliers.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSupplierIds(filteredUniqueSuppliers.map(s => s.id))
                              } else {
                                setSelectedSupplierIds([])
                              }
                            }}
                            className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer"
                          />
                        </th>
                      )}
                      <th className="px-6 py-4">Supplier Name</th>
                      <th className="px-6 py-4">Website</th>
                      <th className="px-6 py-4">Contact Person</th>
                      <th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Phone</th>
                      <th className="px-6 py-4">Address</th>
                      <th className="px-6 py-4 text-center">Bids / Audits</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {filteredUniqueSuppliers.map(supplier => {
                      const isSelected = selectedSupplierIds.includes(supplier.id)
                      return (
                        <tr key={supplier.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/20 ${isSelected ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}>
                          {isManageMode && (
                            <td className="px-6 py-4 w-12 text-center">
                              <input 
                                type="checkbox"
                                checked={isSelected}
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
                          {/* Supplier Name */}
                          <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                            <a
                              href={`/management/supplier/${supplier.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold hover:text-[#5c59e9] hover:underline text-left cursor-pointer"
                            >
                              {supplier.name}
                            </a>
                          </td>

                          {/* Website Link */}
                          <td className="px-6 py-4">
                            {supplier.website ? (
                              <a 
                                href={supplier.website.startsWith('http') ? supplier.website : `https://${supplier.website}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-[#5c59e9] hover:underline flex items-center gap-1 font-semibold"
                              >
                                <Globe size={12} className="text-slate-400" />
                                <span>{supplier.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Contact Person */}
                          <td className="px-6 py-4 text-slate-700 dark:text-slate-355 font-semibold">
                            {supplier.contact_person || '—'}
                          </td>

                          {/* Email */}
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-450">
                            {supplier.email || '—'}
                          </td>

                          {/* Phone */}
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-450">
                            {supplier.phone || '—'}
                          </td>

                          {/* Address */}
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 truncate max-w-xs" title={supplier.address || ''}>
                            {supplier.address || '—'}
                          </td>

                          {/* Bids / Audits counts */}
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <Badge variant="outline" className="bg-blue-50/50 text-blue-600 border-blue-200/50 dark:bg-blue-955/20 dark:text-blue-400 dark:border-blue-900/50 font-medium text-[10px] px-2 py-0.5 rounded-md">
                                {supplier.bidsCount} Bid{supplier.bidsCount !== 1 ? 's' : ''}
                              </Badge>
                              <Badge variant="outline" className="bg-amber-50/50 text-amber-600 border-amber-200/50 dark:bg-amber-955/20 dark:text-amber-400 dark:border-amber-900/50 font-medium text-[10px] px-2 py-0.5 rounded-md">
                                {supplier.auditsCount} Audit{supplier.auditsCount !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          </td>

                          {/* View Profile Action */}
                          <td className="px-6 py-4 text-right">
                            <a
                              href={`/management/supplier/${supplier.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block"
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 px-2.5 border-slate-200 text-slate-600 hover:text-slate-700 dark:border-slate-800 hover:bg-slate-50/50 cursor-pointer gap-1 text-[11px]"
                              >
                                <span>View Profile</span>
                              </Button>
                            </a>
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
      </TabsContent>

      <TabsContent value="workplace" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
      {/* Main Content: Order List + Matrix / All Suppliers */}
      <div className="grid lg:grid-cols-[280px_1fr] -mx-8 -mt-8 -mb-8 h-[calc(100vh-4rem)] overflow-hidden">

        {/* Left column: Purchase Orders sidebar */}
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
            {/* All Suppliers button */}
            <div className="border-b border-slate-100 dark:border-slate-800/80">
              <button
                id="btn-all-suppliers"
                onClick={() => {
                  setSelectedOrderId(null);
                  setViewMode('all');
                }}
                className={`w-full text-left px-2.5 py-3 flex items-center justify-between gap-1 transition-colors cursor-pointer ${
                  viewMode === 'all'
                    ? 'bg-indigo-50 dark:bg-indigo-950/30'
                    : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Globe size={13} className={viewMode === 'all' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
                  <span className={`text-xs font-bold ${viewMode === 'all' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                    All Suppliers
                  </span>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  viewMode === 'all'
                    ? 'bg-indigo-200/50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                }`}>
                  {suppliers.length}
                </span>
              </button>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                No orders found.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.map(order => (
                  <li key={order.id}>
                    <button
                      id={`order-select-${order.id}`}
                      onClick={() => {
                        if (selectedOrderId === order.id) {
                          setSelectedOrderId(null);
                          setViewMode('all');
                        } else {
                          setSelectedOrderId(order.id);
                          setViewMode('order');
                        }
                      }}
                      className={`w-full text-left px-2.5 py-3 flex items-center justify-between gap-1 transition-colors cursor-pointer ${
                        viewMode === 'order' && selectedOrderId === order.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/30'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={13} className={viewMode === 'order' && selectedOrderId === order.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
                        <span className={`text-xs font-bold truncate ${
                          viewMode === 'order' && selectedOrderId === order.id
                            ? 'text-indigo-700 dark:text-indigo-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}>
                          {order.order_code}
                        </span>
                      </div>
                      <ChevronRight size={12} className={viewMode === 'order' && selectedOrderId === order.id ? 'text-indigo-500' : 'text-slate-300'} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column: main workplace panel */}
        <div className="flex flex-col h-full overflow-y-auto p-3">
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

                      {/* Always visible Add dropdown button (replacing separate import + actions buttons) */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer text-xs font-semibold"
                          >
                            <span>Add</span>
                            <ChevronDown size={12} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-md z-50">
                          {/* Add Supplier */}
                          <DropdownMenuItem
                            onClick={() => {
                              setManualForm({
                                supplierName: '',
                                email: '',
                                phone: '',
                                address: '',
                                orderId: '',
                                website: '',
                                contactPerson: '',
                                taxId: '',
                                businessType: ''
                              })
                              setItemBids({})
                              setCapabilities([])
                              setIsAddOpen(true)
                              setErrorMessage(null)
                            }}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300"
                          >
                            <Plus size={12} className="text-[#5c59e9]" />
                            <span>Add Supplier</span>
                          </DropdownMenuItem>

                          {/* Import Excel/CSV */}
                          <DropdownMenuItem
                            onClick={() => {
                              setCsvPreview([])
                              setImportStatus(null)
                              setPasteText('')
                              setPastePreview([])
                              setPasteImportStatus(null)
                              setPasteErrorMessage(null)
                              setImportTab('file')
                              setIsImportOpen(true)
                              setErrorMessage(null)
                            }}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-305"
                          >
                            <Upload size={12} className="text-[#5c59e9]" />
                            <span>Import Excel/CSV</span>
                          </DropdownMenuItem>

                          {/* Select & Delete */}
                          <DropdownMenuItem
                            onClick={() => setIsManageMode(true)}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-305"
                          >
                            <Trash2 size={12} className="text-red-500" />
                            <span>Select & Delete</span>
                          </DropdownMenuItem>

                          {/* Shortlisted Only filter */}
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
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                        {columnVisibility.supplierName && <th className="px-6 py-4">Supplier Name</th>}
                        {columnVisibility.email && <th className="px-6 py-4">Email</th>}
                        {columnVisibility.phone && <th className="px-6 py-4">Phone</th>}
                        {columnVisibility.address && <th className="px-6 py-4">Address</th>}
                        {columnVisibility.website && <th className="px-6 py-4">Website</th>}
                        {columnVisibility.contactPerson && <th className="px-6 py-4">Contact Person</th>}
                        {columnVisibility.taxId && <th className="px-6 py-4">Tax ID</th>}
                        {columnVisibility.businessType && <th className="px-6 py-4">Business Type</th>}
                        {columnVisibility.certifications && <th className="px-6 py-4">Certifications</th>}
                        {columnVisibility.associatedOrder && <th className="px-6 py-4">Associated Order</th>}
                        {columnVisibility.productItem && <th className="px-6 py-4">Product Item</th>}
                        {columnVisibility.quotedPrice && <th className="px-6 py-4">Quoted Price</th>}
                        {columnVisibility.leadTime && <th className="px-6 py-4">Lead Time</th>}
                        {columnVisibility.shortlistStatus && <th className="px-6 py-4 text-center">Shortlist Status</th>}
                        {columnVisibility.qcStatus && <th className="px-6 py-4">QC Status</th>}

                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {filteredAllSuppliers.map(supplier => {
                        const orderCode = supplier.orders?.order_code ?? '—'
                        // BUG 9 FIX: use single source of truth for order existence.
                        // A supplier has a "Deleted Order" only when order_id is set
                        // (so it's not unassigned) but the order is absent from both
                        // the server-joined data AND local state.
                        const linkedOrder = orders.find(o => o.id === supplier.order_id)
                        return (
                          <tr key={supplier.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/20 ${selectedSupplierIds.includes(supplier.id) ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}>
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
                            {columnVisibility.supplierName && (
                              <td className="px-6 py-4">
                                <a
                                  href={`/management/supplier/${supplier.supplier_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-slate-800 dark:text-slate-200 hover:text-[#5c59e9] dark:hover:text-[#818cf8] hover:underline cursor-pointer text-left focus:outline-none transition-colors"
                                >
                                  {supplier.supplier_name}
                                </a>
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
                            {columnVisibility.website && (
                              <td className="px-6 py-4">
                                {supplier.suppliers?.website ? (
                                  <a 
                                    href={supplier.suppliers.website.startsWith('http') ? supplier.suppliers.website : `https://${supplier.suppliers.website}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                                  >
                                    {supplier.suppliers.website}
                                  </a>
                                ) : '—'}
                              </td>
                            )}
                            {columnVisibility.contactPerson && (
                              <td className="px-6 py-4">
                                <div className="text-slate-600 dark:text-slate-400">
                                  {supplier.suppliers?.contact_person || '—'}
                                </div>
                              </td>
                            )}
                            {columnVisibility.taxId && (
                              <td className="px-6 py-4">
                                <div className="text-slate-600 dark:text-slate-400 font-mono">
                                  {supplier.suppliers?.tax_id || '—'}
                                </div>
                              </td>
                            )}
                            {columnVisibility.businessType && (
                              <td className="px-6 py-4">
                                <div className="text-slate-600 dark:text-slate-400">
                                  {supplier.suppliers?.business_type || '—'}
                                </div>
                              </td>
                            )}
                            {columnVisibility.certifications && (
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {supplier.suppliers?.certifications && supplier.suppliers.certifications.length > 0 ? (
                                    supplier.suppliers.certifications.map((cert, idx) => (
                                      <Badge key={idx} variant="outline" className="text-[10px] font-medium bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
                                        {cert}
                                      </Badge>
                                    ))
                                  ) : '—'}
                                </div>
                              </td>
                            )}
                            {columnVisibility.associatedOrder && (
                              <td className="px-6 py-4">
                                {!supplier.order_id ? (
                                  <Badge variant="outline" className="text-[10px] font-semibold bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900/10 dark:text-slate-500 dark:border-slate-800">
                                    Unassigned
                                  </Badge>
                                ) : (!linkedOrder && !supplier.orders?.order_code) ? (
                                  // BUG 9 FIX: only show "Deleted Order" when BOTH local state
                                  // AND the server-joined order_code are absent — prevents false
                                  // positives from stale client-side state
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
                                  disabled={isPending || audits.some(a => a.supplier_id === supplier.supplier_id && a.order_id === supplier.order_id)}
                                  title={audits.some(a => a.supplier_id === supplier.supplier_id && a.order_id === supplier.order_id) ? "Shortlist locked - Sent to QC" : undefined}
                                  className={`mx-auto flex h-7 w-7 items-center justify-center rounded-lg border transition-all cursor-pointer disabled:opacity-50 ${
                                    supplier.is_shortlisted
                                      ? 'bg-emerald-50 text-emerald-600 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-450 dark:border-emerald-800'
                                      : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 dark:border-slate-800'
                                  }`}
                                >
                                  <Check size={14} className={supplier.is_shortlisted ? 'opacity-100' : 'opacity-30'} />
                                </button>
                              </td>
                            )}
                            {columnVisibility.qcStatus && (() => {
                              const audit = audits.find(a => a.supplier_id === supplier.supplier_id && a.order_id === supplier.order_id)
                              if (!audit) {
                                return (
                                  <td className="px-6 py-4">
                                    <span className="text-slate-400 dark:text-slate-500">—</span>
                                  </td>
                                )
                              }
                              
                              let badgeStyle = "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                              let label = audit.audit_status
                              
                              if (audit.audit_status === 'Completed') {
                                if (audit.audit_verdict === 'PASS') {
                                  badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900"
                                  label = "QC PASS"
                                } else if (audit.audit_verdict === 'PASS WITH CONDITIONS') {
                                  badgeStyle = "bg-amber-50 text-amber-700 border-amber-250 dark:bg-amber-950/20 dark:text-amber-450 dark:border-amber-900"
                                  label = "QC PASS W/ COND"
                                } else {
                                  badgeStyle = "bg-rose-50 text-rose-700 border-rose-250 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900"
                                  label = "QC FAIL"
                                }
                              } else {
                                badgeStyle = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-450 dark:border-blue-900"
                                label = "QC In Progress"
                              }
                              
                              return (
                                <td className="px-6 py-4">
                                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
                                    {label}
                                  </span>
                                </td>
                              )
                            })()}
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
                                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                                  <th className="px-6 py-4">Product Item</th>
                                  <th className="px-6 py-4">Quantity</th>
                                  <th className="px-6 py-4">Classification</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                {selectedOrder.order_items.map((item) => {
                                  const currentVal = localTypes[item.id] || item.item_type || 'PENDING'
                                  return (
                                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                                      <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                                        {item.item_name}
                                      </td>
                                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-medium">
                                        {item.quantity}
                                      </td>
                                      <td className="px-6 py-4">
                                        <select
                                          value={currentVal}
                                          onChange={(e) => setLocalTypes(prev => ({ ...prev, [item.id]: e.target.value }))}
                                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-[#5c59e9] outline-none font-semibold text-slate-700 dark:text-slate-300"
                                        >
                                          <option value="PENDING">Pending</option>
                                          <option value="MATERIAL">Material</option>
                                          <option value="PRODUCT">Product</option>
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
                              <CardTitle className="text-base font-bold flex items-center gap-2">
                                Suppliers for {selectedOrder?.order_code}
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-455 dark:border-emerald-900/50">
                                  <Check size={10} className="stroke-[3]" /> Classified
                                </span>
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
                                  {/* Manage Table Dropdown */}
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

                                  {/* Add Dropdown */}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer text-xs font-semibold"
                                      >
                                        <span>Add</span>
                                        <ChevronDown size={12} />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-md z-50">
                                      {/* Add Supplier */}
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setManualForm({
                                            supplierName: '',
                                            email: '',
                                            phone: '',
                                            address: '',
                                            orderId: selectedOrderId || '',
                                            website: '',
                                            contactPerson: '',
                                            taxId: '',
                                            businessType: ''
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
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300"
                                      >
                                        <Plus size={12} className="text-[#5c59e9]" />
                                        <span>Add Supplier</span>
                                      </DropdownMenuItem>

                                      {/* Import Excel/CSV */}
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setCsvPreview([])
                                          setImportStatus(null)
                                          setPasteText('')
                                          setPastePreview([])
                                          setPasteImportStatus(null)
                                          setPasteErrorMessage(null)
                                          setImportTab('file')
                                          setIsImportOpen(true)
                                          setErrorMessage(null)
                                        }}
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-355"
                                      >
                                        <Upload size={12} className="text-[#5c59e9]" />
                                        <span>Import Excel/CSV</span>
                                      </DropdownMenuItem>

                                      <DropdownMenuSeparator className="my-1 border-t border-slate-100 dark:border-slate-800" />

                                      {/* Select & Delete */}
                                      <DropdownMenuItem
                                        onClick={() => setIsManageMode(true)}
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300"
                                      >
                                        <Trash2 size={12} className="text-red-500" />
                                        <span>Select & Delete</span>
                                      </DropdownMenuItem>

                                      {/* Shortlisted Only Toggle */}
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

                                      {/* Send Shortlist to QC */}
                                      <DropdownMenuItem
                                        disabled={
                                          isPending || 
                                          !orderSuppliers.some(s => s.is_shortlisted) ||
                                          orderSuppliers.filter(s => s.is_shortlisted).every(s => audits.some(a => a.supplier_id === s.supplier_id && a.order_id === s.order_id))
                                        }
                                        onClick={() => handleSendShortlistToQc(selectedOrderId)}
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-755 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {isPending ? (
                                          <Loader2 size={12} className="animate-spin" />
                                        ) : (
                                          <Send size={12} className="text-indigo-500" />
                                        )}
                                        <span>Send Shortlist to QC</span>
                                      </DropdownMenuItem>

                                      {/* Edit Classification */}
                                      <DropdownMenuItem
                                        onClick={() => setIsEditingClassification(true)}
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-750 dark:text-slate-300"
                                      >
                                        <Package size={12} className="text-emerald-500" />
                                        <span>Edit Classification</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
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
                                      orderId: selectedOrderId || '',
                                      website: '',
                                      contactPerson: '',
                                      taxId: '',
                                      businessType: ''
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
                                      <th className="px-6 py-4 w-12 text-center">
                                        <input 
                                          type="checkbox"
                                          checked={sortedOrderSuppliers.length > 0 && selectedSupplierIds.length === sortedOrderSuppliers.length}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              const allIds = sortedOrderSuppliers.map(s => s.id)
                                              setSelectedSupplierIds(allIds)
                                              const hasUnshortlisted = sortedOrderSuppliers.some(s => !s.is_shortlisted)
                                              if (hasUnshortlisted) {
                                                triggerToast("Selected an unshortlisted supplier. This will automatically shortlist them if sent to QC.")
                                              }
                                            } else {
                                              setSelectedSupplierIds([])
                                            }
                                          }}
                                          className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer"
                                        />
                                      </th>
                                      {orderColumnVisibility.supplierName && <th className="px-6 py-4">Supplier</th>}
                                      {orderColumnVisibility.email && <th className="px-6 py-4">Email</th>}
                                      {orderColumnVisibility.phone && <th className="px-6 py-4">Phone</th>}
                                      {orderColumnVisibility.address && <th className="px-6 py-4">Address</th>}
                                      {orderColumnVisibility.website && <th className="px-6 py-4">Website</th>}
                                      {orderColumnVisibility.contactPerson && <th className="px-6 py-4">Contact Person</th>}
                                      {orderColumnVisibility.taxId && <th className="px-6 py-4">Tax ID</th>}
                                      {orderColumnVisibility.businessType && <th className="px-6 py-4">Business Type</th>}
                                      {orderColumnVisibility.certifications && <th className="px-6 py-4">Certifications</th>}
                                      {orderColumnVisibility.productItem && <th className="px-6 py-4">Product Item</th>}
                                      {orderColumnVisibility.quotedPrice && <th className="px-6 py-4">Quoted Price</th>}
                                      {orderColumnVisibility.leadTime && <th className="px-6 py-4">Lead Time</th>}
                                      {orderColumnVisibility.shortlistStatus && <th className="px-6 py-4 text-center">Shortlist</th>}
                                      {orderColumnVisibility.qcStatus && <th className="px-6 py-4">QC Status</th>}
              
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                                    {sortedOrderSuppliers.map(supplier => {
                                      const isLowestPrice = supplier.order_item_id && bestPricePerItem[supplier.order_item_id] !== undefined && Number(supplier.quoted_price) === bestPricePerItem[supplier.order_item_id]
                                      const isFastestLead = supplier.order_item_id && bestLeadTimePerItem[supplier.order_item_id] !== undefined && supplier.lead_time_days === bestLeadTimePerItem[supplier.order_item_id]
                                      return (
                                        <tr key={supplier.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/20 ${selectedSupplierIds.includes(supplier.id) ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}>
                                           <td className="px-6 py-4 w-12 text-center">
                                             <input 
                                               type="checkbox"
                                               checked={selectedSupplierIds.includes(supplier.id)}
                                               onChange={(e) => {
                                                 if (e.target.checked) {
                                                   setSelectedSupplierIds(prev => [...prev, supplier.id])
                                                   if (!supplier.is_shortlisted) {
                                                     triggerToast("Selected an unshortlisted supplier. This will automatically shortlist them if sent to QC.")
                                                   }
                                                 } else {
                                                   setSelectedSupplierIds(prev => prev.filter(id => id !== supplier.id))
                                                 }
                                               }}
                                               className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer"
                                             />
                                           </td>
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
                                          {orderColumnVisibility.website && (
                                            <td className="px-6 py-4">
                                              {supplier.suppliers?.website ? (
                                                <a 
                                                  href={supplier.suppliers.website.startsWith('http') ? supplier.suppliers.website : `https://${supplier.suppliers.website}`}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
                                                >
                                                  {supplier.suppliers.website}
                                                </a>
                                              ) : '—'}
                                            </td>
                                          )}
                                          {orderColumnVisibility.contactPerson && (
                                            <td className="px-6 py-4">
                                              <div className="text-slate-600 dark:text-slate-400">
                                                {supplier.suppliers?.contact_person || '—'}
                                              </div>
                                            </td>
                                          )}
                                          {orderColumnVisibility.taxId && (
                                            <td className="px-6 py-4">
                                              <div className="text-slate-600 dark:text-slate-400 font-mono">
                                                {supplier.suppliers?.tax_id || '—'}
                                              </div>
                                            </td>
                                          )}
                                          {orderColumnVisibility.businessType && (
                                            <td className="px-6 py-4">
                                              <div className="text-slate-600 dark:text-slate-400">
                                                {supplier.suppliers?.business_type || '—'}
                                              </div>
                                            </td>
                                          )}
                                          {orderColumnVisibility.certifications && (
                                            <td className="px-6 py-4">
                                              <div className="flex flex-wrap gap-1">
                                                {supplier.suppliers?.certifications && supplier.suppliers.certifications.length > 0 ? (
                                                  supplier.suppliers.certifications.map((cert, idx) => (
                                                    <Badge key={idx} variant="outline" className="text-[10px] font-medium bg-slate-50 text-slate-600 dark:bg-slate-900/50 dark:text-slate-400">
                                                      {cert}
                                                    </Badge>
                                                  ))
                                                ) : '—'}
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
                                                 disabled={isPending || audits.some(a => a.supplier_id === supplier.supplier_id && a.order_id === supplier.order_id)}
                                                 title={audits.some(a => a.supplier_id === supplier.supplier_id && a.order_id === supplier.order_id) ? "Shortlist locked - Sent to QC" : undefined}
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
                                          {orderColumnVisibility.qcStatus && (() => {
                                            const audit = audits.find(a => a.supplier_id === supplier.supplier_id && a.order_id === supplier.order_id)
                                            if (!audit) {
                                              return (
                                                <td className="px-6 py-4">
                                                  <span className="text-slate-400 dark:text-slate-500">—</span>
                                                </td>
                                              )
                                            }
                                            
                                            let badgeStyle = "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                                            let label = audit.audit_status
                                            
                                            if (audit.audit_status === 'Completed') {
                                              if (audit.audit_verdict === 'PASS') {
                                                badgeStyle = "bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900"
                                                label = "QC PASS"
                                              } else if (audit.audit_verdict === 'PASS WITH CONDITIONS') {
                                                badgeStyle = "bg-amber-50 text-amber-700 border-amber-250 dark:bg-amber-950/20 dark:text-amber-450 dark:border-amber-900"
                                                label = "QC PASS W/ COND"
                                              } else {
                                                badgeStyle = "bg-rose-50 text-rose-700 border-rose-250 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900"
                                                label = "QC FAIL"
                                              }
                                            } else {
                                              badgeStyle = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-450 dark:border-blue-900"
                                              label = "QC In Progress"
                                            }

                                            const hasPassedQC = audit.audit_status === 'Completed' && 
                                            (audit.audit_verdict === 'PASS' || audit.audit_verdict === 'PASS WITH CONDITIONS')
                                            
                                            return (
                                              <td className="px-6 py-4 flex items-center gap-2">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeStyle}`}>
                                                  {label}
                                                </span>
                                              </td>
                                            )
                                          })()}
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
      </div>
      </TabsContent>
      </Tabs>

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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const headers = [
                      'Supplier Name*', 'Email', 'Phone', 'Address', 'Website', 'Contact Person', 'Tax ID', 'Business Type',
                      'Supplier Code', 'Legal Name', 'Year Founded', 'Company Size', 'Industry', 'Main Products (comma-separated)', 'Short Description',
                      'Primary Contact Name', 'Position', 'Alternative Contact', 'Street', 'District', 'City', 'Country', 'Postal Code', 'LinkedIn', 'Social Contact (Zalo/WeChat)',
                      'Payment Terms', 'Currency', 'Bank Info', 'Credit Limit', 'Tax Status', 'Business License', 'Certifications (comma-separated)',
                      'Sourcing Category', 'Lead Time Average (days)', 'MOQ', 'Pricing Tier', 'Quality Rating', 'Reliability Score (%)', 'On-Time Delivery Rate (%)', 'Defect Rate (%)', 'Last Sourced Date (YYYY-MM-DD)', 'Total Spend', 'Total Orders', 'Is Preferred (TRUE/FALSE)',
                      'Status (Prospect/Active/Inactive/Blacklisted)', 'Sourcing Stage', 'Approval Date (YYYY-MM-DD)', 'Reviewed By', 'Next Review Date (YYYY-MM-DD)', 'Risk Level (Low/Medium/High)', 'Risk Notes', 'Created By', 'Owner PIC', 'Tags (comma-separated)',
                      'ESG Score', 'Social Responsibility Notes', 'Max Monthly Capacity', 'Main Markets (comma-separated)', 'Competitors', 'Internal Notes', 'Communication History',
                      'Product 1 Name', 'Product 1 Price', 'Product 1 Lead Time (days)', 'Product 1 MOQ', 'Product 1 SKU', 'Product 1 Description',
                      'Product 2 Name', 'Product 2 Price', 'Product 2 Lead Time (days)', 'Product 2 MOQ', 'Product 2 SKU', 'Product 2 Description',
                    ]
                    const exampleRow = [
                      'Viet My Woodworking Ltd', 'contact@vietmy.com', '+84 901 234 567', '12 Industrial Zone, Binh Duong', 'https://vietmy.com', 'Nguyen Van A', '0123456789', 'Manufacturer',
                      'SUP-001', 'Cong Ty TNHH Viet My', '2010', '51-200', 'Furniture', 'Wooden Chair, Table, Cabinet', 'High quality furniture manufacturer with ISO 9001',
                      'Mr. Nguyen Van A', 'CEO', 'Ms. Le Thi B - +84 912 345 678', '12 Industrial Zone', 'Thu Dau Mot', 'Binh Duong', 'Vietnam', '820000', 'linkedin.com/company/vietmy', 'Zalo: 0901234567',
                      'Net 30', 'USD', 'VietcomBank - 1234567890 - BFTVVNVX', '50000', 'VAT Registered', 'BRC-001234', 'ISO 9001, BSCI, SEDEX',
                      'Furniture', '45', '500', 'Mid-range', 'A', '95', '98', '0.5', '2024-01-15', '250000', '12', 'FALSE',
                      'Active', 'Approved', '2023-06-01', 'John Doe', '2025-06-01', 'Low', '', 'Admin', 'Sarah Lee', 'wood, furniture, export',
                      '85', 'Factory audited 2024. BSCI certified.', '5000 units/month', 'US, EU, Australia', 'VN Wood Co., HaNoi Timber', 'Reliable long-term partner', '2024-02-10 Discussed new collection',
                      'Wooden Chair Model A', '25.00', '30', '200', 'CHR-A-001', 'Solid oak, natural finish',
                      'Dining Table 6-seat', '180.00', '45', '50', 'TBL-D-006', 'Teak wood, lacquer finish',
                    ]
                    const csvContent = '\uFEFF' + headers.map(h => `"${h}"`).join(',') + '\r\n' + exampleRow.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') + '\r\n'
                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = 'supplier_import_template.csv'
                    a.click()
                    URL.revokeObjectURL(url)
                  }}
                  title="Download Excel/CSV Template"
                  className="h-8 px-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/25 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors cursor-pointer"
                >
                  <Download size={13} />
                  <span>Template</span>
                </button>
                <button
                  onClick={() => { setIsAddOpen(false); setErrorMessage(null) }}
                  className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
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

                <div className="grid grid-cols-2 gap-3.5 pt-1.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-website" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Supplier Website
                    </Label>
                    <Input
                      id="supplier-website"
                      placeholder="e.g. www.vietmy.com"
                      value={manualForm.website}
                      onChange={e => setManualForm(f => ({ ...f, website: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-contact" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Contact Person
                    </Label>
                    <Input
                      id="supplier-contact"
                      placeholder="e.g. Nguyen Van A"
                      value={manualForm.contactPerson}
                      onChange={e => setManualForm(f => ({ ...f, contactPerson: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 pt-1.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-taxid" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Tax ID / Reg No.
                    </Label>
                    <Input
                      id="supplier-taxid"
                      placeholder="e.g. 0102030405"
                      value={manualForm.taxId}
                      onChange={e => setManualForm(f => ({ ...f, taxId: e.target.value }))}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-businesstype" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Business Type
                    </Label>
                    <select
                      id="supplier-businesstype"
                      value={manualForm.businessType}
                      onChange={e => setManualForm(f => ({ ...f, businessType: e.target.value }))}
                      className="flex w-full h-9 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer"
                    >
                      <option value="">Select Business Type</option>
                      <option value="Manufacturer">Manufacturer</option>
                      <option value="Distributor">Distributor</option>
                      <option value="Wholesaler">Wholesaler</option>
                      <option value="Agent / Trader">Agent / Trader</option>
                    </select>
                  </div>
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
                        { 
                          id: Math.random().toString(), 
                          productName: '', 
                          targetPrice: '',
                          leadTimeDays: '',
                          description: '',
                          moq: '',
                          sku: '',
                          monthlyCapacity: ''
                        }
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
                    <div className="space-y-3.5 max-h-80 overflow-y-auto pr-1">
                      {capabilities.map((cap, idx) => (
                        <div key={cap.id} className="p-3 border border-slate-100 dark:border-slate-800/80 rounded-xl bg-slate-50/20 dark:bg-slate-900/10 space-y-2.5 relative">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Product #{idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => setCapabilities(prev => prev.filter(c => c.id !== cap.id))}
                              className="h-5 w-5 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-955/20 rounded transition-colors cursor-pointer"
                              title="Delete capability"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>

                          {/* Grid 1: Name & SKU */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2 space-y-1">
                              <Label className="text-[9px] font-semibold text-slate-500">Product Name *</Label>
                              <Input 
                                placeholder="e.g. Dining Chair"
                                value={cap.productName}
                                onChange={e => setCapabilities(prev => prev.map(c => 
                                  c.id === cap.id ? { ...c, productName: e.target.value } : c
                                ))}
                                className="text-xs h-7"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-slate-500">Product SKU</Label>
                              <Input 
                                placeholder="e.g. DC-101"
                                value={cap.sku || ''}
                                onChange={e => setCapabilities(prev => prev.map(c => 
                                  c.id === cap.id ? { ...c, sku: e.target.value } : c
                                ))}
                                className="text-xs h-7"
                              />
                            </div>
                          </div>

                          {/* Grid 2: Price, Lead Time & MOQ */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-slate-500">Target Price ($) *</Label>
                              <Input 
                                type="number"
                                step="0.01"
                                placeholder="120.00"
                                value={cap.targetPrice}
                                onChange={e => setCapabilities(prev => prev.map(c => 
                                  c.id === cap.id ? { ...c, targetPrice: e.target.value } : c
                                ))}
                                className="text-xs h-7"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-slate-500">Lead Time (days)</Label>
                              <Input 
                                placeholder="e.g. 7-10"
                                value={cap.leadTimeDays || ''}
                                onChange={e => setCapabilities(prev => prev.map(c => 
                                  c.id === cap.id ? { ...c, leadTimeDays: e.target.value } : c
                                ))}
                                className="text-xs h-7"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-slate-500">Min Order (MOQ)</Label>
                              <Input 
                                type="number"
                                placeholder="e.g. 50"
                                value={cap.moq || ''}
                                onChange={e => setCapabilities(prev => prev.map(c => 
                                  c.id === cap.id ? { ...c, moq: e.target.value } : c
                                ))}
                                className="text-xs h-7"
                              />
                            </div>
                          </div>

                          {/* Grid 3: Capacity & Description */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[9px] font-semibold text-slate-500">Capacity</Label>
                              <Input 
                                placeholder="e.g. 1k/month"
                                value={cap.monthlyCapacity || ''}
                                onChange={e => setCapabilities(prev => prev.map(c => 
                                  c.id === cap.id ? { ...c, monthlyCapacity: e.target.value } : c
                                ))}
                                className="text-xs h-7"
                              />
                            </div>
                            <div className="col-span-2 space-y-1">
                              <Label className="text-[9px] font-semibold text-slate-500">Description</Label>
                              <Input 
                                placeholder="Material, specs..."
                                value={cap.description || ''}
                                onChange={e => setCapabilities(prev => prev.map(c => 
                                  c.id === cap.id ? { ...c, description: e.target.value } : c
                                ))}
                                className="text-xs h-7"
                              />
                            </div>
                          </div>
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

      {/* Confirm Supplier & Create PO Modal */}
      {poSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setPoSupplier(null)}
          />
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400 mb-4">
              <CheckCircle2 size={22} className="flex-shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Confirm Supplier &amp; Create PO</h3>
            </div>
            
            <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1 scrollbar-thin">
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                You are selecting <strong className="font-semibold text-slate-800 dark:text-slate-200">{poSupplier.supplier_name}</strong> as the final supplier for the item <strong className="font-semibold text-slate-800 dark:text-slate-200">{poSupplier.order_items?.item_name}</strong>.
              </p>

              <div className="bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 text-xs space-y-1.5 font-medium text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>Quoted Price:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-250">${Number(poSupplier.quoted_price).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Quantity:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-250">
                    {selectedOrder?.order_items?.find(item => item.id === poSupplier.order_item_id)?.quantity || 1}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Lead Time:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-250">{poSupplier.lead_time_days} days</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="po-contract-value" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Contract Value (USD)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <Input
                    id="po-contract-value"
                    type="number"
                    value={poContractValue || ''}
                    onChange={(e) => setPoContractValue(Number(e.target.value))}
                    className="pl-7 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm font-semibold rounded-xl"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Default calculated as: Quoted Price × Quantity. You can adjust this value as needed.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="po-delivery-date" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Target Delivery Date
                </Label>
                <Input
                  id="po-delivery-date"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={poTargetDeliveryDate}
                  onChange={(e) => setPoTargetDeliveryDate(e.target.value)}
                  className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm font-semibold rounded-xl"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="po-delivery-address" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Delivery Address
                </Label>
                <textarea
                  id="po-delivery-address"
                  value={poDeliveryAddress}
                  onChange={(e) => setPoDeliveryAddress(e.target.value)}
                  rows={2}
                  className="w-full text-sm font-medium p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5c59e9] dark:text-slate-100"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="po-contract-file" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Upload Signed Contract (PDF, Word, Image)
                </Label>
                <Input
                  id="po-contract-file"
                  type="file"
                  accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                  onChange={(e) => setPoContractFile(e.target.files?.[0] || null)}
                  className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs rounded-xl file:mr-4 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-[#5c59e9] hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 rounded-xl text-xs font-medium border border-red-200 dark:border-red-900/50 flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPoSupplier(null)}
                  className="flex-1 h-9 text-sm cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    isPoConfirming || 
                    !poContractValue || poContractValue <= 0 || 
                    !poTargetDeliveryDate || 
                    !poDeliveryAddress
                  }
                  onClick={async () => {
                    const activeOrderId = selectedOrderId || poSupplier.order_id
                    if (!activeOrderId || !poSupplier.supplier_id || !poSupplier.order_item_id) return
                    setIsPoConfirming(true)
                    setErrorMessage(null)
                    
                    const fd = new FormData()
                    fd.append('orderId', activeOrderId)
                    fd.append('selectedSupplierId', poSupplier.supplier_id)
                    fd.append('orderItemId', poSupplier.order_item_id)
                    fd.append('contractValue', String(poContractValue))
                    fd.append('targetDeliveryDate', poTargetDeliveryDate)
                    fd.append('deliveryAddress', poDeliveryAddress)
                    if (poContractFile) {
                      fd.append('contractFile', poContractFile)
                    }
                    
                    const res = await confirmSupplierAndCreatePoAction(fd)
                    setIsPoConfirming(false)
                    if (res.success) {
                      setPoSupplier(null)
                      router.refresh()
                    } else {
                      setErrorMessage(res.error || 'Failed to create PO')
                    }
                  }}
                  className="flex-1 h-9 text-sm bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer gap-2"
                >
                  {isPoConfirming ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Creating PO...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      Confirm &amp; Create PO
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV & Sheets Import Modal */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => { if (!isImporting && !isPasteImporting) { setIsImportOpen(false); setCsvPreview([]); setPastePreview([]); setImportStatus(null); setPasteImportStatus(null); } }}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-205">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Upload className="h-5 w-5 text-[#5c59e9]" />
                  <span>📥 Bulk Import Suppliers</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Import supplier information, quotes and capabilities from file or clipboard</p>
              </div>
              <button
                onClick={() => { if (!isImporting && !isPasteImporting) { setIsImportOpen(false); setCsvPreview([]); setPastePreview([]); setImportStatus(null); setPasteImportStatus(null); } }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Tab switcher inside the modal */}
            {!importStatus && !pasteImportStatus && (
              <div className="px-6 pt-4">
                <div className="flex border-b border-slate-200 dark:border-slate-800">
                  <button
                    onClick={() => {
                      setImportTab('file')
                      setCsvPreview([])
                      setPastePreview([])
                      setPasteErrorMessage(null)
                    }}
                    className={`pb-2.5 text-xs font-bold px-4 -mb-px transition-colors cursor-pointer border-b-2 ${
                      importTab === 'file'
                        ? 'border-[#5c59e9] text-[#5c59e9]'
                        : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Upload CSV/Excel File
                  </button>
                  <button
                    onClick={() => {
                      setImportTab('paste')
                      setCsvPreview([])
                      setPastePreview([])
                      setPasteErrorMessage(null)
                    }}
                    className={`pb-2.5 text-xs font-bold px-4 -mb-px transition-colors cursor-pointer border-b-2 ${
                      importTab === 'paste'
                        ? 'border-[#5c59e9] text-[#5c59e9]'
                        : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Paste from Sheets
                  </button>
                </div>
              </div>
            )}
            
            <div className="p-6 space-y-4">
              {importTab === 'file' ? (
                /* CSV file upload tab */
                importStatus ? (
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
                        <span className="text-[10px] text-slate-400">Columns: supplier_name, email, phone, address, product_name, quoted_price, lead_time (order_code is optional)</span>
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
                              } else if (res.duplicateDetected) {
                                setPendingActionType('csv')
                                setPendingPayload(csvPreview)
                                setConflictingDuplicates(res.duplicates)
                                setIsConflictDialogOpen(true)
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
                )
              ) : (
                /* Clipboard paste tab */
                pasteImportStatus ? (
                  <div className="space-y-4 text-center py-6">
                    {pasteImportStatus.success ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center text-emerald-600">
                          <Check size={24} />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Import Completed Successfully</h3>
                        <p className="text-xs text-slate-500 max-w-md">{pasteImportStatus.msg}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-950/30 flex items-center justify-center text-red-600">
                          <AlertCircle size={24} />
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Import Failed</h3>
                        <p className="text-xs text-red-600">{pasteImportStatus.error}</p>
                      </div>
                    )}
                    
                    <div className="pt-2">
                      <Button 
                        onClick={() => {
                          setIsImportOpen(false)
                          setPasteText('')
                          setPastePreview([])
                          setPasteImportStatus(null)
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
                    <div className="space-y-2">
                      <Label htmlFor="paste-textarea" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Paste Excel/Sheets data here (Ctrl+V):
                      </Label>
                      <textarea
                        id="paste-textarea"
                        placeholder="Click here and press Ctrl+V to paste cells copied from Excel/Google Sheets.&#10;&#10;Supported columns: Supplier Name, Email, Product Item, Quoted Price, Lead Time."
                        value={pasteText}
                        onPaste={handleClipboardPaste}
                        onChange={handlePasteTextChange}
                        rows={5}
                        className="w-full text-xs p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-55/20 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-[#5c59e9] dark:text-slate-100 resize-none font-medium animate-in fade-in"
                      />
                    </div>

                    {pasteErrorMessage && (
                      <div className="p-3 bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 rounded-xl text-xs font-medium border border-red-200 dark:border-red-900/50 flex items-center gap-2">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span>{pasteErrorMessage}</span>
                      </div>
                    )}

                    {pastePreview.length > 0 && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Parsed Preview ({pastePreview.length} rows):
                          </span>
                        </div>
                        <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-x-auto max-h-60">
                          <table className="w-full text-left border-collapse text-[10px]">
                            <thead>
                              <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 font-bold uppercase text-slate-500 sticky top-0">
                                <th className="px-4 py-2">Supplier Name</th>
                                <th className="px-4 py-2">Email</th>
                                <th className="px-4 py-2">Order Code</th>
                                <th className="px-4 py-2">Product Item</th>
                                <th className="px-4 py-2 text-right">Quoted Price</th>
                                <th className="px-4 py-2 text-right">Lead Time</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {pastePreview.map((row, idx) => (
                                <tr key={idx} className="text-slate-700 dark:text-slate-305 hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                                  <td className="px-4 py-2 font-semibold">{row.supplierName}</td>
                                  <td className="px-4 py-2">{row.email || '—'}</td>
                                  <td className="px-4 py-2 font-bold text-[#5c59e9]">{row.orderCode || '—'}</td>
                                  <td className="px-4 py-2 font-medium">{row.productName || '—'}</td>
                                  <td className="px-4 py-2 text-right font-bold text-slate-900 dark:text-white">
                                    ${Number(row.quotedPrice).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-4 py-2 text-right">{row.leadTime} days</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        <div className="flex gap-3 pt-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setPasteText('')
                              setPastePreview([])
                              setPasteErrorMessage(null)
                            }}
                            disabled={isPasteImporting}
                            className="flex-1 h-9 text-sm cursor-pointer"
                          >
                            Clear
                          </Button>
                          <Button
                            onClick={async () => {
                              setIsPasteImporting(true)
                              setPasteErrorMessage(null)
                              const res = await bulkImportSuppliersAction(pastePreview)
                              setIsPasteImporting(false)
                              if (res.success) {
                                setPasteImportStatus({
                                  success: true,
                                  msg: `Imported ${res.importedSuppliersCount} unique suppliers, ${res.importedBidsCount} active bids, and ${res.importedCapabilitiesCount} capability records.`
                                })
                              } else if (res.duplicateDetected) {
                                setPendingActionType('paste')
                                setPendingPayload(pastePreview)
                                setConflictingDuplicates(res.duplicates)
                                setIsConflictDialogOpen(true)
                              } else {
                                setPasteImportStatus({
                                  success: false,
                                  error: res.error || 'Import failed.'
                                })
                              }
                            }}
                            disabled={isPasteImporting}
                            className="flex-1 h-9 text-sm bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer gap-2"
                          >
                            {isPasteImporting ? (
                              <><Loader2 size={14} className="animate-spin" /> Appending...</>
                            ) : (
                              <>Append to Order</>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )
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
                  const deletedItems = suppliers.filter(s => selectedSupplierIds.includes(s.id))
                  const deletedSupplierIds = deletedItems.map(s => s.supplier_id)

                  const res = await deleteSuppliersBatchAction(selectedSupplierIds)
                  setIsBulkDeleting(false)
                  setIsBulkDeleteConfirmOpen(false)
                  if (res.success) {
                    setSuppliers(prev => prev.filter(s => 
                      !selectedSupplierIds.includes(s.id) && 
                      !deletedSupplierIds.includes(s.supplier_id)
                    ))
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
      {/* Send to QC Confirmation Modal */}
      {isSendToQcConfirmOpen && (() => {
        const checkedCount = selectedSupplierIds.length
        const checkedSuppliers = orderSuppliers.filter(s => selectedSupplierIds.includes(s.id))
        const unshortlisted = checkedSuppliers.filter(s => !s.is_shortlisted)
        
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => { if (!isSendingToQc) setIsSendToQcConfirmOpen(false); }}
            />
            <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
              <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 mb-4">
                <Send size={22} className="flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Send Suppliers to QC</h3>
              </div>
              
              <div className="text-xs text-slate-650 dark:text-slate-400 mb-6 space-y-3 leading-relaxed">
                <p>
                  {checkedCount > 0 ? (
                    <>You are about to send <strong className="font-semibold text-slate-800 dark:text-slate-200">{checkedCount} selected supplier(s)</strong> to the QA queue.</>
                  ) : (
                    <>You are about to send all <strong className="font-semibold text-slate-800 dark:text-slate-200">{orderSuppliers.filter(s => s.is_shortlisted).length} shortlisted supplier(s)</strong> to the QA queue.</>
                  )}
                </p>
                {checkedCount > 0 && unshortlisted.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-amber-700 dark:text-amber-400">
                    <p className="font-medium flex items-center gap-1.5 mb-1">
                      <AlertCircle size={14} /> Unshortlisted Suppliers Warning
                    </p>
                    <p className="text-[11px] leading-normal">
                      Note: Supplier(s) {unshortlisted.map(s => `'${s.supplier_name}'`).join(', ')} is not shortlisted and will be automatically updated upon confirmation.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsSendToQcConfirmOpen(false)}
                  className="flex-1 h-9 text-sm cursor-pointer"
                  disabled={isSendingToQc}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmSendToQc}
                  disabled={isSendingToQc}
                  className="flex-1 h-9 text-sm bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer gap-2"
                >
                  {isSendingToQc ? <><Loader2 size={13} className="animate-spin" /> Sending...</> : 'Confirm & Send'}
                </Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Toast notifications container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-3 rounded-xl shadow-lg border border-slate-800 dark:border-slate-200 text-xs font-semibold animate-in slide-in-from-bottom-5 fade-in duration-200"
          >
            <AlertCircle size={14} className="text-amber-500 flex-shrink-0" />
            <span className="flex-1 leading-normal">{t.message}</span>
            <button
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              className="text-slate-400 hover:text-white dark:text-slate-500 dark:hover:text-slate-900 ml-1 cursor-pointer flex-shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {/* Supplier Profile Modal */}
      {isProfileOpen && selectedSupplierId && (() => {
        const renderProfileField = (
          label: string,
          key: string,
          type: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date' = 'text',
          options?: string[]
        ) => {
          const val = (profileForm as any)[key]
          
          if (isProfileEditMode) {
            if (type === 'checkbox') {
              return (
                <div className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    id={`edit-${key}`}
                    checked={!!val}
                    onChange={e => setProfileForm(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-350 dark:border-slate-750 text-[#5c59e9] focus:ring-[#5c59e9]"
                  />
                  <Label htmlFor={`edit-${key}`} className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">{label}</Label>
                </div>
              )
            }

            if (type === 'select') {
              return (
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500 font-semibold">{label}</Label>
                  <select
                    value={val}
                    onChange={e => setProfileForm(prev => ({ ...prev, [key]: e.target.value }))}
                    className="flex w-full h-9 rounded-xl border border-slate-200 bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5c59e9] dark:border-slate-800 dark:bg-slate-950 cursor-pointer"
                  >
                    <option value="">Select {label}</option>
                    {options?.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              )
            }

            if (type === 'textarea') {
              return (
                <div className="space-y-1 col-span-full">
                  <Label className="text-xs text-slate-500 font-semibold">{label}</Label>
                  <textarea
                    value={val}
                    onChange={e => setProfileForm(prev => ({ ...prev, [key]: e.target.value }))}
                    rows={2}
                    className="flex w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 text-xs shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5c59e9] dark:border-slate-800 dark:bg-slate-950 resize-none font-medium"
                  />
                </div>
              )
            }

            return (
              <div className="space-y-1">
                <Label className="text-xs text-slate-500 font-semibold">{label}</Label>
                <Input
                  type={type}
                  value={val}
                  onChange={e => setProfileForm(prev => ({ ...prev, [key]: e.target.value }))}
                  className="h-9 text-xs rounded-xl"
                />
              </div>
            )
          }

          // View Mode
          if (type === 'checkbox') {
            return (
              <div className="flex items-center gap-2 py-2">
                <span className={`inline-flex items-center justify-center h-4 w-4 rounded border text-[10px] font-extrabold ${
                  val ? 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-900/50' : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-950/20 dark:border-slate-800'
                }`}>
                  {val ? '✓' : '✗'}
                </span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{label}</span>
              </div>
            )
          }

          let displayVal: React.ReactNode = val || '—'
          
          if (key === 'website' && val) {
            displayVal = (
              <a
                href={val.startsWith('http') ? val : `https://${val}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#5c59e9] hover:underline"
              >
                {val}
              </a>
            )
          }

          if (key === 'email' && val) {
            displayVal = (
              <a href={`mailto:${val}`} className="text-[#5c59e9] hover:underline">
                {val}
              </a>
            )
          }

          // Format numeric values for display
          if (type === 'number' && val) {
            if (key.toLowerCase().includes('spend') || key.toLowerCase().includes('limit')) {
              displayVal = `$${parseFloat(val).toLocaleString('en-US')}`
            } else if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('score')) {
              displayVal = `${val}${key.toLowerCase().includes('rate') ? '%' : ''}`
            } else {
              displayVal = parseFloat(val).toLocaleString('en-US')
            }
          }

          return (
            <div className={`space-y-1 ${type === 'textarea' ? 'col-span-full' : ''}`}>
              <Label className="text-xs text-slate-500 font-semibold">{label}</Label>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 bg-slate-55/40 dark:bg-slate-950/40 p-2.5 rounded-xl border border-slate-100/50 dark:border-slate-800/80 min-h-[36px] flex items-center leading-relaxed">
                {displayVal}
              </p>
            </div>
          )
        }

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
              className="absolute inset-0 cursor-pointer"
              onClick={() => {
                if (!isSavingProfile) setIsProfileOpen(false)
              }}
            />
            <div className="relative z-10 w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
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

              {/* Tab Bar */}
              <div className="flex border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 px-6 py-1 gap-1">
                {[
                  { id: 'overview', label: 'Overview & Contacts' },
                  { id: 'sourcing', label: 'Sourcing & Performance' },
                  { id: 'financials', label: 'Financials & Systems' },
                  { id: 'documents', label: 'Documents & ESG' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveProfileTab(tab.id as any)}
                    className={`px-3 py-2.5 text-xs font-bold transition-all relative border-b-2 -mb-[2px] cursor-pointer ${
                      activeProfileTab === tab.id
                        ? 'border-[#5c59e9] text-[#5c59e9]'
                        : 'border-transparent text-slate-450 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-250'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Modal Body (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {profileErrorMessage && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs rounded-xl flex items-center gap-2 font-medium">
                    <AlertCircle size={14} />
                    <span>{profileErrorMessage}</span>
                  </div>
                )}

                {/* Tab content */}
                {activeProfileTab === 'overview' && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Company Identity</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderProfileField('Legal Company Name', 'legalName')}
                        {renderProfileField('Supplier Unique Code', 'supplierCode')}
                        {renderProfileField('Year Founded', 'yearFounded', 'number')}
                        {renderProfileField('Company Size (Employees)', 'companySize', 'select', ['1-10', '11-50', '51-200', '201-500', '500+'])}
                        {renderProfileField('Industry / Sector', 'industry')}
                        {renderProfileField('Main Products / Services Offered (Comma Separated)', 'mainProducts')}
                        {renderProfileField('Short Description', 'shortDescription', 'textarea')}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Contact Channels</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderProfileField('Primary Contact Person', 'primaryContactName')}
                        {renderProfileField('Position / Title', 'position')}
                        {renderProfileField('Email Address', 'email')}
                        {renderProfileField('Phone Number', 'phone')}
                        {renderProfileField('Alternative Contact Info', 'alternativeContact')}
                        {renderProfileField('Website', 'website')}
                        {renderProfileField('Street Address', 'street')}
                        {renderProfileField('District / Ward', 'district')}
                        {renderProfileField('City / Province', 'city')}
                        {renderProfileField('Country', 'country')}
                        {renderProfileField('Postal Code', 'postalCode')}
                        {renderProfileField('LinkedIn Link', 'linkedin')}
                        {renderProfileField('Zalo / WeChat / WhatsApp ID', 'socialContact')}
                      </div>
                    </div>
                  </div>
                )}

                {activeProfileTab === 'sourcing' && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sourcing Metrics</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderProfileField('Sourcing Category', 'sourcingCategory')}
                        {renderProfileField('Lead Time Average (Days)', 'leadTimeAverage', 'number')}
                        {renderProfileField('Minimum Order Quantity (MOQ)', 'moq', 'number')}
                        {renderProfileField('Pricing Tier', 'pricingTier', 'select', ['Budget', 'Standard', 'Premium'])}
                        {renderProfileField('Preferred Supplier Status', 'isPreferred', 'checkbox')}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Performance Tracking</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderProfileField('Quality Rating (1-5)', 'qualityRating', 'select', ['1', '2', '3', '4', '5'])}
                        {renderProfileField('Reliability Score (0-100)', 'reliabilityScore', 'number')}
                        {renderProfileField('On-Time Delivery Rate (%)', 'onTimeDeliveryRate', 'number')}
                        {renderProfileField('Defect Rate (%)', 'defectRate', 'number')}
                        {renderProfileField('Total Orders Placed', 'totalOrders', 'number')}
                        {renderProfileField('Total Spend Accumulation ($)', 'totalSpend', 'number')}
                        {renderProfileField('Last Sourced Date', 'lastSourcedDate', 'date')}
                      </div>
                    </div>

                    {/* SECTION 2: Associated Order Details */}
                    {profileOrderDetails && (
                      <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Sourcing Context</h4>
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
                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
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
                                <div className="flex-1 flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-955/30 rounded-xl border border-slate-100/50 dark:border-slate-800 text-xs">
                                  <span className="font-semibold text-slate-700 dark:text-slate-305">{cap.productName}</span>
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
                )}

                {activeProfileTab === 'financials' && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Financial Setup</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderProfileField('Payment Terms', 'paymentTerms', 'select', ['Prepayment', 'COD', 'Net 15', 'Net 30', 'Net 45', 'Net 60', 'EOM'])}
                        {renderProfileField('Currency Code', 'currency', 'select', ['USD', 'VND', 'CNY', 'EUR'])}
                        {renderProfileField('Credit Limit ($)', 'creditLimit', 'number')}
                        {renderProfileField('Tax / VAT Status', 'taxStatus', 'select', ['Standard Taxable', 'Tax Exempt', 'Zero Rated'])}
                        {renderProfileField('Business Registration License', 'businessLicense')}
                        {renderProfileField('Bank Details (SWIFT, A/C Info)', 'bankInfo', 'textarea')}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Systems Tracking</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderProfileField('System Status', 'status', 'select', ['Prospect', 'Active', 'Suspended', 'Blacklisted'])}
                        {renderProfileField('Sourcing Stage', 'sourcingStage', 'select', ['New', 'Identified', 'Contacted', 'Negotiating', 'Approved', 'Rejected'])}
                        {renderProfileField('Risk Level Assessment', 'riskLevel', 'select', ['Low', 'Medium', 'High'])}
                        {renderProfileField('Approval Date', 'approvalDate', 'date')}
                        {renderProfileField('Reviewed By PIC', 'reviewedBy')}
                        {renderProfileField('Next Scheduled Review Date', 'nextReviewDate', 'date')}
                        {renderProfileField('Owner / Sourcing Manager PIC', 'ownerPic')}
                        {renderProfileField('Tags / Keywords (Comma Separated)', 'tags')}
                        {renderProfileField('Certifications Held (Comma Separated)', 'certifications')}
                        {renderProfileField('Risk Level Explanation Notes', 'riskNotes', 'textarea')}
                      </div>
                    </div>
                  </div>
                )}

                {activeProfileTab === 'documents' && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sustainability &amp; Capacity</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderProfileField('ESG Compliance Score (0-100)', 'esgScore', 'number')}
                        {renderProfileField('Monthly Manufacturing Capacity', 'maxCapacityMonthly')}
                        {renderProfileField('Primary Export Markets (Comma Separated)', 'mainMarkets')}
                        {renderProfileField('Major Competitors Recognized', 'competitors')}
                        {renderProfileField('Social Responsibility Assessment Notes', 'socialResponsibilityNotes', 'textarea')}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">File Attachments &amp; Folders</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {renderProfileField('Company Profile Link', 'docCompanyProfile')}
                        {renderProfileField('Product Catalog Link', 'docCatalog')}
                        {renderProfileField('Contract Document Link', 'docContract')}
                        {renderProfileField('NDA Agreement Link', 'docNda')}
                        {renderProfileField('ISO/Quality Certificates Links (Comma Separated)', 'docCertificates')}
                        {renderProfileField('Audit Reports Links (Comma Separated)', 'docAuditReports')}
                        {renderProfileField('Sample Approval Docs Links (Comma Separated)', 'docSampleApprovals')}
                      </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Supplier Context Notes</h4>
                      <div className="grid grid-cols-1 gap-4">
                        {renderProfileField('Internal Sourcing Comments', 'notes', 'textarea')}
                        {renderProfileField('Communication & Call History Log', 'communicationHistory', 'textarea')}
                      </div>
                    </div>
                  </div>
                )}
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
                          const sDetails: any = matched.suppliers || {}
                          setProfileForm({
                            name: matched.supplier_name || '',
                            email: sDetails.email || '',
                            phone: sDetails.phone || '',
                            address: sDetails.address || '',
                            website: sDetails.website || '',
                            contactPerson: sDetails.contact_person || '',
                            taxId: sDetails.tax_id || '',
                            businessType: sDetails.business_type || '',

                            // Basic Information
                            supplierCode: sDetails.supplier_code || '',
                            legalName: sDetails.legal_name || '',
                            yearFounded: sDetails.year_founded ? String(sDetails.year_founded) : '',
                            companySize: sDetails.company_size || '',
                            industry: sDetails.industry || '',
                            mainProducts: sDetails.main_products ? sDetails.main_products.join(', ') : '',
                            shortDescription: sDetails.short_description || '',

                            // Contact Information
                            primaryContactName: sDetails.primary_contact_name || '',
                            position: sDetails.position || '',
                            alternativeContact: sDetails.alternative_contact || '',
                            street: sDetails.street || '',
                            district: sDetails.district || '',
                            city: sDetails.city || '',
                            country: sDetails.country || '',
                            postalCode: sDetails.postal_code || '',
                            linkedin: sDetails.linkedin || '',
                            socialContact: sDetails.social_contact || '',

                            // Financial & Legal
                            paymentTerms: sDetails.payment_terms || '',
                            currency: sDetails.currency || '',
                            bankInfo: sDetails.bank_info || '',
                            creditLimit: sDetails.credit_limit ? String(sDetails.credit_limit) : '',
                            taxStatus: sDetails.tax_status || '',
                            businessLicense: sDetails.business_license || '',
                            certifications: sDetails.certifications ? sDetails.certifications.join(', ') : '',

                            // Sourcing & Performance
                            sourcingCategory: sDetails.sourcing_category || '',
                            leadTimeAverage: sDetails.lead_time_average ? String(sDetails.lead_time_average) : '',
                            moq: sDetails.moq ? String(sDetails.moq) : '',
                            pricingTier: sDetails.pricing_tier || '',
                            qualityRating: sDetails.quality_rating || '',
                            reliabilityScore: sDetails.reliability_score ? String(sDetails.reliability_score) : '',
                            onTimeDeliveryRate: sDetails.on_time_delivery_rate ? String(sDetails.on_time_delivery_rate) : '',
                            defectRate: sDetails.defect_rate ? String(sDetails.defect_rate) : '',
                            lastSourcedDate: sDetails.last_sourced_date || '',
                            totalSpend: sDetails.total_spend ? String(sDetails.total_spend) : '',
                            totalOrders: sDetails.total_orders ? String(sDetails.total_orders) : '',
                            isPreferred: sDetails.is_preferred || false,

                            // Metadata & Tracking
                            status: sDetails.status || 'Prospect',
                            sourcingStage: sDetails.sourcing_stage || 'New',
                            approvalDate: sDetails.approval_date ? sDetails.approval_date.substring(0, 10) : '',
                            reviewedBy: sDetails.reviewed_by || '',
                            nextReviewDate: sDetails.next_review_date || '',
                            riskLevel: sDetails.risk_level || '',
                            riskNotes: sDetails.risk_notes || '',
                            createdBy: sDetails.created_by || '',
                            ownerPic: sDetails.owner_pic || '',
                            tags: sDetails.tags ? sDetails.tags.join(', ') : '',

                            // Attachments
                            docCompanyProfile: sDetails.doc_company_profile || '',
                            docCatalog: sDetails.doc_catalog || '',
                            docContract: sDetails.doc_contract || '',
                            docCertificates: sDetails.doc_certificates ? sDetails.doc_certificates.join(', ') : '',
                            docAuditReports: sDetails.doc_audit_reports ? sDetails.doc_audit_reports.join(', ') : '',
                            docSampleApprovals: sDetails.doc_sample_approvals ? sDetails.doc_sample_approvals.join(', ') : '',
                            docNda: sDetails.doc_nda || '',

                            // Advanced
                            esgScore: sDetails.esg_score ? String(sDetails.esg_score) : '',
                            socialResponsibilityNotes: sDetails.social_responsibility_notes || '',
                            maxCapacityMonthly: sDetails.max_capacity_monthly || '',
                            mainMarkets: sDetails.main_markets ? sDetails.main_markets.join(', ') : '',
                            competitors: sDetails.competitors || '',
                            notes: sDetails.notes || '',
                            communicationHistory: sDetails.communication_history || ''
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
        )
      })()}

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

      {/* Duplicate Conflict Resolution Dialog */}
      {isConflictDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-all duration-300 animate-in fade-in">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!isResolvingDuplicates) {
                setIsConflictDialogOpen(false)
                setPendingActionType(null)
                setPendingPayload(null)
                setConflictingDuplicates([])
              }
            }}
          />
          <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400 mb-4">
              <AlertCircle size={24} className="flex-shrink-0" />
              <div>
                <h3 className="text-base font-bold text-slate-950 dark:text-white">Duplicate Supplier Records Detected</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  The following supplier configurations already exist for these specific order-item combinations.
                </p>
              </div>
            </div>

            {/* List of conflicting items */}
            <div className="flex-1 overflow-y-auto my-4 border border-slate-100 dark:border-slate-800 rounded-2xl max-h-60 bg-slate-50/20 dark:bg-slate-950/20">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800 font-bold uppercase text-slate-500 sticky top-0">
                    <th className="px-4 py-2.5">Supplier / Email</th>
                    <th className="px-4 py-2.5">Order</th>
                    <th className="px-4 py-2.5">Product Item</th>
                    <th className="px-4 py-2.5 text-right">Current Bid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {conflictingDuplicates.map((dup, idx) => (
                    <tr key={idx} className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                      <td className="px-4 py-2">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{dup.supplierName}</div>
                        <div className="text-[9px] text-slate-400">{dup.email}</div>
                      </td>
                      <td className="px-4 py-2 font-bold text-[#5c59e9]">{dup.orderCode || '—'}</td>
                      <td className="px-4 py-2 font-medium">{dup.productName}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="font-bold text-slate-950 dark:text-white">${Number(dup.quotedPrice).toLocaleString()}</div>
                        <div className="text-[9px] text-slate-400">{dup.leadTime} days</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-3 mt-auto border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsConflictDialogOpen(false)
                  setPendingActionType(null)
                  setPendingPayload(null)
                  setConflictingDuplicates([])
                }}
                disabled={isResolvingDuplicates}
                className="flex-1 h-9 text-xs font-semibold cursor-pointer border-slate-200 dark:border-slate-800 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => handleResolveDuplicates('skip')}
                disabled={isResolvingDuplicates}
                className="flex-1 h-9 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white cursor-pointer gap-1.5 rounded-xl"
              >
                {isResolvingDuplicates ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <span>Skip Duplicates</span>
                )}
              </Button>
              <Button
                type="button"
                onClick={() => handleResolveDuplicates('overwrite')}
                disabled={isResolvingDuplicates}
                className="flex-1 h-9 text-xs font-semibold bg-[#5c59e9] hover:bg-[#4a47d2] text-white cursor-pointer gap-1.5 rounded-xl shadow-md shadow-indigo-250/20 dark:shadow-none"
              >
                {isResolvingDuplicates ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <span>Overwrite / Update</span>
                )}
              </Button>
            </div>
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
