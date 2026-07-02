'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useTransition, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { suppliersQueryOptions, ordersQueryOptions, auditsQueryOptions } from './api/queries'
import { SourcingAnalytics } from './components/sourcing-analytics'
import { OrderSidebar } from './components/order-sidebar'
import { AssignSupplierModal } from './components/assign-supplier-modal'
import * as XLSX from 'xlsx'
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
import { TimelineProposalCard } from '@/components/timeline-proposal-card'
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
  ArrowUpDown,
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
  Sparkles,
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
  order_stage_timelines?: any[]
}

export interface DatabaseSupplier {
  id: string
  order_id: string | null
  order_item_id: string | null
  supplier_name: string
  quoted_price: number
  lead_time_days: string | number
  is_shortlisted: boolean
  created_at: string
  created_by?: string | null
  supplier_id?: string | null
  is_bid?: boolean
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

export function parseLeadTimeToNumber(lead: any): number {
  if (lead == null) return Infinity
  const num = Number(lead)
  if (!isNaN(num)) return num
  const match = String(lead).match(/\d+/)
  return match ? parseInt(match[0], 10) : Infinity
}

export function SourcingClient({ initialOrders, initialSuppliers, initialAudits = [] }: SourcingClientProps) {
  const { searchQuery, userRole } = useSourcing()
  const router = useRouter()

  const [overviewMode, setOverviewMode] = useState<'analytics' | 'kanban'>('analytics')
  const [audits, setAudits] = useState<any[]>(initialAudits || [])
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
  const [suppliers, setSuppliers] = useState<DatabaseSupplier[]>(initialSuppliers || [])
  // Local orders list to allow optimistic updates
  const [orders, setOrders] = useState<DatabaseOrder[]>(initialOrders || [])

  const queryClient = useQueryClient()

  // Invalidate all sourcing queries — replaces scattered invalidateSourcingData() calls
  const invalidateSourcingData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sourcing', 'suppliers'] }),
      queryClient.invalidateQueries({ queryKey: ['sourcing', 'orders'] }),
      queryClient.invalidateQueries({ queryKey: ['sourcing', 'audits'] }),
    ])
    router.refresh()
  }

  const { data: suppliersData } = useQuery({
    ...suppliersQueryOptions(),
    initialData: initialSuppliers && initialSuppliers.length > 0 ? initialSuppliers : undefined,
  })
  const { data: ordersData } = useQuery({
    ...ordersQueryOptions(),
    initialData: initialOrders && initialOrders.length > 0 ? initialOrders : undefined,
  })
  const { data: auditsData } = useQuery({
    ...auditsQueryOptions(),
    initialData: initialAudits && initialAudits.length > 0 ? initialAudits : undefined,
  })

  // Sync query data to state
  useEffect(() => {
    if (suppliersData) {
      setSuppliers(suppliersData)
    }
  }, [suppliersData])

  useEffect(() => {
    if (ordersData) {
      setOrders(ordersData)
    }
  }, [ordersData])

  useEffect(() => {
    if (auditsData) {
      setAudits(auditsData)
    }
  }, [auditsData])



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
  const [supplierSort, setSupplierSort] = useState<{ field: 'name' | 'created_by' | null; order: 'asc' | 'desc' }>({
    field: null,
    order: 'asc'
  })
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

  // Sheets paste grid state
  const [pasteGrid, setPasteGrid] = useState<any[]>(
    Array.from({ length: 5 }, () => ({
      supplierName: '',
      email: '',
      phone: '',
      address: '',
      productName: '',
      quotedPrice: '',
      leadTime: '',
      website: '',
      contactPerson: '',
      taxId: '',
      businessType: '',
      orderCode: ''
    }))
  )

  useEffect(() => {
    if (isImportOpen) {
      setPasteGrid(
        Array.from({ length: 5 }, () => ({
          supplierName: '',
          email: '',
          phone: '',
          address: '',
          productName: '',
          quotedPrice: '',
          leadTime: '',
          website: '',
          contactPerson: '',
          taxId: '',
          businessType: '',
          orderCode: ''
        }))
      )
      setPasteErrorMessage(null)
      setPasteImportStatus(null)
    }
  }, [isImportOpen])

  // Selection states for bulk delete in All Suppliers Overview
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
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
        const res = await addSupplierNormalizedAction(pendingPayload, resolution, subtab === 'suppliers')
        if (res.success) {
          setIsAddOpen(false)
          setIsConflictDialogOpen(false)
          setPendingActionType(null)
          setPendingPayload(null)
          setConflictingDuplicates([])
          await invalidateSourcingData()
        } else {
          setErrorMessage(res.error || 'Failed to add supplier.')
          setIsConflictDialogOpen(false)
        }
      } else if (pendingActionType === 'csv') {
        const res = await bulkImportSuppliersAction(pendingPayload, resolution, subtab === 'suppliers')
        if (res.success) {
          setImportStatus({
            success: true,
            msg: `Imported ${res.importedSuppliersCount} unique suppliers, ${res.importedBidsCount} active bids, and ${res.importedCapabilitiesCount} capability records (with resolution: ${resolution}).`
          })
          setIsConflictDialogOpen(false)
          setPendingActionType(null)
          setPendingPayload(null)
          setConflictingDuplicates([])
          await invalidateSourcingData()
        } else {
          setImportStatus({
            success: false,
            error: res.error || 'Failed to resolve and import.'
          })
          setIsConflictDialogOpen(false)
        }
      } else if (pendingActionType === 'paste') {
        const res = await bulkImportSuppliersAction(pendingPayload, resolution, subtab === 'suppliers')
        if (res.success) {
          setPasteImportStatus({
            success: true,
            msg: `Imported ${res.importedSuppliersCount} unique suppliers, ${res.importedBidsCount} active bids, and ${res.importedCapabilitiesCount} capability records (with resolution: ${resolution}).`
          })
          setIsConflictDialogOpen(false)
          setPendingActionType(null)
          setPendingPayload(null)
          setConflictingDuplicates([])
          await invalidateSourcingData()
        } else {
          setPasteImportStatus({
            success: false,
            error: res.error || 'Failed to resolve and import.'
          })
          setIsConflictDialogOpen(false)
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during resolution.')
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
    leadTimeDays: string | number
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
  const bestLeadTimeVal = orderSuppliers.length > 0
    ? Math.min(...orderSuppliers.map(s => parseLeadTimeToNumber(s.lead_time_days)).filter(n => n !== Infinity))
    : Infinity
  const bestLeadTime = bestLeadTimeVal === Infinity ? null : bestLeadTimeVal

  // ─── All Suppliers metrics ────────────────────────────────────────────────────
  const activeBids = suppliers.filter(s => s.is_bid)
  const totalEngaged = activeBids.length
  const totalShortlisted = activeBids.filter(s => s.is_shortlisted).length
  const parsedLeadTimes = activeBids
    .map(s => parseLeadTimeToNumber(s.lead_time_days))
    .filter(n => n !== Infinity)
  const avgLeadTime = parsedLeadTimes.length > 0
    ? Math.round(parsedLeadTimes.reduce((sum, val) => sum + val, 0) / parsedLeadTimes.length)
    : null

  // All suppliers with optional search/shortlist filter
  const filteredAllSuppliers = suppliers.filter(s => {
    // Only show bids/quotes in the Workplace tab (exclude master profiles with 0 bids/quotes)
    if (!s.is_bid) return false

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
          main_products: s.suppliers!.main_products,
          bidsCount: suppliers.filter(x => x.supplier_id === s.supplier_id && x.order_id).length,
          auditsCount: audits.filter(x => x.supplier_id === s.supplier_id).length,
          created_by: s.suppliers!.created_by || s.created_by || 'System',
          supplier_capabilities: s.suppliers!.supplier_capabilities || [],
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

  const sortedUniqueSuppliers = React.useMemo(() => {
    if (!supplierSort.field) return filteredUniqueSuppliers
    return [...filteredUniqueSuppliers].sort((a, b) => {
      let valA = ''
      let valB = ''
      if (supplierSort.field === 'name') {
        valA = (a.name || '').toLowerCase().trim()
        valB = (b.name || '').toLowerCase().trim()
      } else if (supplierSort.field === 'created_by') {
        valA = (a.created_by || '').toLowerCase().trim()
        valB = (b.created_by || '').toLowerCase().trim()
      }
      if (supplierSort.order === 'asc') {
        return valA.localeCompare(valB)
      } else {
        return valB.localeCompare(valA)
      }
    })
  }, [filteredUniqueSuppliers, supplierSort])

  const handleSort = (field: 'name' | 'created_by') => {
    setSupplierSort(prev => {
      if (prev.field !== field) {
        return { field, order: 'asc' }
      }
      if (prev.order === 'asc') {
        return { field, order: 'desc' }
      }
      return { field: null, order: 'asc' }
    })
  }

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


  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    const reader = new FileReader()

    const processRawRows = (rawRows: any[][]) => {
      if (rawRows.length < 2) {
        setErrorMessage('File must contain a header row and at least one data row.')
        return
      }
      
      const headers = rawRows[0].map(h => String(h || '').toLowerCase().trim().replace(/[^a-z0-9]/g, ''))
      
      const colMap = {
        supplierName: headers.findIndex(h => h.includes('supplier') || h.includes('name') || h.includes('ncc') || h.includes('nhacungcap')),
        email: headers.findIndex(h => h.includes('email') || h.includes('mail') || h.includes('thudientu')),
        phone: headers.findIndex(h => h.includes('phone') || h.includes('sdt') || h.includes('tel') || h.includes('dienthoai') || h.includes('mobile') || h.includes('contact')),
        address: headers.findIndex(h => h.includes('address') || h.includes('diachi')),
        orderCode: headers.findIndex(h => h.includes('ordercode') || h.includes('order') || h.includes('donhang') || h.includes('madon')),
        productName: headers.findIndex(h => h.includes('mainproduct') || h.includes('sanphamchinh') || h.includes('productname') || h.includes('product') || h.includes('item') || h.includes('sanpham') || h.includes('mathang')),
        quotedPrice: headers.findIndex(h => h.includes('price') || h.includes('quoted') || h.includes('cost') || h.includes('gia') || h.includes('dongia')),
        leadTime: headers.findIndex(h => h.includes('leadtime') || h.includes('lead') || h.includes('days') || h.includes('tiendo') || h.includes('thoigian')),
        website: headers.findIndex(h => h.includes('website') || h.includes('web') || h.includes('site')),
        contactPerson: headers.findIndex(h => h.includes('contactperson') || h.includes('representative') || h.includes('nguoilienhe')),
        taxId: headers.findIndex(h => h.includes('taxid') || h.includes('tax') || h.includes('mst') || h.includes('masothue')),
        businessType: headers.findIndex(h => h.includes('businesstype') || h.includes('type') || h.includes('loaihinh'))
      }

      if (colMap.supplierName === -1) colMap.supplierName = 0
      if (colMap.email === -1) colMap.email = -1
      if (colMap.phone === -1) colMap.phone = -1
      if (colMap.address === -1) colMap.address = -1
      if (colMap.orderCode === -1) colMap.orderCode = -1
      if (colMap.productName === -1) colMap.productName = -1
      if (colMap.quotedPrice === -1) colMap.quotedPrice = subtab === 'suppliers' ? -1 : 5
      if (colMap.leadTime === -1) colMap.leadTime = subtab === 'suppliers' ? -1 : 6
      if (colMap.website === -1) colMap.website = -1
      if (colMap.contactPerson === -1) colMap.contactPerson = -1
      if (colMap.taxId === -1) colMap.taxId = -1
      if (colMap.businessType === -1) colMap.businessType = -1

      const parsedData = rawRows.slice(1).map(row => {
        const getValue = (idx: number) => (idx !== -1 && idx < row.length ? String(row[idx] || '').trim() : '')
        
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
    }

    if (isExcel) {
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        try {
          const workbook = XLSX.read(data, { type: 'array' })
          const firstSheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[firstSheetName]
          const rawRows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' })
          processRawRows(rawRows)
        } catch (err: any) {
          setErrorMessage('Failed to parse Excel file: ' + err.message)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      reader.onload = (event) => {
        const text = event.target?.result as string
        if (!text) return
        
        try {
          const rawRows = parseCSV(text)
          processRawRows(rawRows)
        } catch (err: any) {
          setErrorMessage('Failed to parse CSV file: ' + err.message)
        }
      }
      reader.readAsText(file)
    }
  }

  const getColumnWidth = (key: string) => {
    switch (key) {
      case 'supplierName': return 'min-w-[220px] max-w-[220px]'
      case 'email': return 'min-w-[180px] max-w-[180px]'
      case 'phone': return 'min-w-[120px] max-w-[120px]'
      case 'address': return 'min-w-[240px] max-w-[240px]'
      case 'productName': return 'min-w-[200px] max-w-[200px]'
      case 'website': return 'min-w-[160px] max-w-[160px]'
      case 'contactPerson': return 'min-w-[150px] max-w-[150px]'
      case 'taxId': return 'min-w-[120px] max-w-[120px]'
      case 'businessType': return 'min-w-[130px] max-w-[130px]'
      case 'orderCode': return 'min-w-[140px] max-w-[140px]'
      case 'quotedPrice': return 'min-w-[110px] max-w-[110px]'
      case 'leadTime': return 'min-w-[110px] max-w-[110px]'
      default: return 'min-w-[120px] max-w-[120px]'
    }
  }

  const getGridColumns = () => {
    const isProfile = subtab === 'suppliers'
    if (isProfile) {
      return [
        { key: 'supplierName', label: 'Supplier Name *' },
        { key: 'email', label: 'Email *' },
        { key: 'phone', label: 'Phone' },
        { key: 'address', label: 'Address' },
        { key: 'website', label: 'Website' },
        { key: 'contactPerson', label: 'Contact Person' },
        { key: 'taxId', label: 'Tax ID' },
        { key: 'businessType', label: 'Business Type' },
        { key: 'productName', label: 'Main Products' }
      ]
    }
    return [
      { key: 'supplierName', label: 'Supplier Name *' },
      { key: 'email', label: 'Email *' },
      { key: 'phone', label: 'Phone' },
      { key: 'address', label: 'Address' },
      { key: 'productName', label: 'Main Products *' },
      { key: 'quotedPrice', label: 'Quoted Price *' },
      { key: 'leadTime', label: 'Lead Time (Days) *' },
      { key: 'website', label: 'Website' },
      { key: 'contactPerson', label: 'Contact Person' },
      { key: 'taxId', label: 'Tax ID' },
      { key: 'businessType', label: 'Business Type' },
      { key: 'orderCode', label: 'Order Code (Optional)' }
    ]
  }

  const handleGridCellPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, colKey: string) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData('text')
    if (!pastedText) return

    // Parse clipboard text (tab-separated columns, newline-separated rows)
    const rows = pastedText.split(/\r?\n/).map(row => row.split('\t').map(cell => cell.trim()))
    const validRows = rows.filter(r => r.length > 0 && r.some(cell => cell !== ''))
    if (validRows.length === 0) return

    const columnsList = getGridColumns().map(c => c.key)
    const colIndex = columnsList.indexOf(colKey)
    if (colIndex === -1) return

    setPasteGrid(prevGrid => {
      const newGrid = [...prevGrid]

      validRows.forEach((rowCells, rOffset) => {
        const targetRowIdx = rowIndex + rOffset
        // Expand the grid size if needed
        while (newGrid.length <= targetRowIdx) {
          newGrid.push({
            supplierName: '', email: '', phone: '', address: '', productName: '', quotedPrice: '',
            leadTime: '', website: '', contactPerson: '', taxId: '', businessType: '', orderCode: ''
          })
        }

        rowCells.forEach((cellVal, cOffset) => {
          const targetColIdx = colIndex + cOffset
          if (targetColIdx < columnsList.length) {
            const targetColKey = columnsList[targetColIdx]
            newGrid[targetRowIdx] = {
              ...newGrid[targetRowIdx],
              [targetColKey]: cellVal
            }
          }
        })
      })

      return newGrid
    })
  }

  const handleGridCellChange = (rowIndex: number, colKey: string, value: string) => {
    setPasteGrid(prevGrid => {
      const newGrid = [...prevGrid]
      newGrid[rowIndex] = {
        ...newGrid[rowIndex],
        [colKey]: value
      }
      return newGrid
    })
  }

  const handleAddGridRow = () => {
    setPasteGrid(prev => [
      ...prev,
      {
        supplierName: '', email: '', phone: '', address: '', productName: '', quotedPrice: '',
        leadTime: '', website: '', contactPerson: '', taxId: '', businessType: '', orderCode: ''
      }
    ])
  }

  const handleClearGrid = () => {
    setPasteGrid(
      Array.from({ length: 5 }, () => ({
        supplierName: '', email: '', phone: '', address: '', productName: '', quotedPrice: '',
        leadTime: '', website: '', contactPerson: '', taxId: '', businessType: '', orderCode: ''
      }))
    )
    setPasteErrorMessage(null)
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

    const result = await deleteSupplierAction(idToDelete, false) // deleteProfile is false (Workplace)
    setDeletingId(null)
    if (result.success) {
      setSuppliers(prev => prev.filter(s => s.id !== idToDelete))
    }
  }

  const handleConfirmBatchDelete = async () => {
    setIsDeletingBatch(true)
    const isProfilesTab = subtab === 'suppliers'
    const res = await deleteSuppliersBatchAction(selectedSupplierIds, isProfilesTab)
    setIsDeletingBatch(false)
    setIsBulkDeleteConfirmOpen(false)

    if (res.success) {
      if (isProfilesTab) {
        setSuppliers(prev => prev.filter(s => !selectedSupplierIds.includes(s.supplier_id || s.id)))
        triggerToast(`Successfully deleted ${selectedSupplierIds.length} supplier profiles.`)
      } else {
        setSuppliers(prev => prev.filter(s => !selectedSupplierIds.includes(s.id)))
        triggerToast(`Successfully removed ${selectedSupplierIds.length} supplier bids.`)
      }
      setSelectedSupplierIds([])
      setIsManageMode(false)
    } else {
      triggerToast(res.error || (isProfilesTab ? 'Failed to delete supplier profiles.' : 'Failed to remove supplier bids.'))
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
            <SourcingAnalytics
              suppliers={suppliers}
              orders={orders}
              setSubtab={setSubtab}
            />
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
                disabled={selectedSupplierIds.length === 0}
                onClick={() => setIsBulkDeleteConfirmOpen(true)}
                className="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:bg-red-600 text-white gap-1.5 h-9 px-4 rounded-lg text-xs font-semibold cursor-pointer"
              >
                <Trash2 size={12} />
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
                                      setIsAddOpen(true)
                                      setErrorMessage(null)
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
                  onClick={() => {
                    setPasteImportStatus(null)
                    setPasteErrorMessage(null)
                    setImportTab('paste')
                    setIsImportOpen(true)
                    setErrorMessage(null)
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300"
                >
                  <Clipboard size={12} className="text-[#5c59e9]" />
                  <span>Paste from Sheets</span>
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
            {sortedUniqueSuppliers.length === 0 ? (
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
                            checked={sortedUniqueSuppliers.length > 0 && selectedSupplierIds.length === sortedUniqueSuppliers.length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSupplierIds(sortedUniqueSuppliers.map(s => s.id))
                              } else {
                                setSelectedSupplierIds([])
                              }
                            }}
                            className="rounded text-[#5c59e9] focus:ring-[#5c59e9] h-3.5 w-3.5 cursor-pointer"
                          />
                        </th>
                      )}
                      <th 
                        className="px-6 py-4 w-[20%] min-w-[220px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-1">
                          <span>Supplier Name</span>
                          <ArrowUpDown size={12} className={supplierSort.field === 'name' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600 opacity-50'} />
                        </div>
                      </th>
                      <th className="px-6 py-4 w-[15%] min-w-[180px]">Email</th>
                      <th className="px-6 py-4 w-[10%] min-w-[130px]">Phone</th>
                      <th className="px-6 py-4 w-[12%] min-w-[150px]">Contact Person</th>
                      <th className="px-6 py-4 w-[12%] min-w-[150px]">Website</th>
                      <th className="px-6 py-4 w-[15%] min-w-[200px]">Address</th>
                      <th className="px-6 py-4 w-[16%] min-w-[200px]">Main Products</th>
                      <th 
                        className="px-6 py-4 w-[10%] min-w-[110px] text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                        onClick={() => handleSort('created_by')}
                      >
                        <div className="flex items-center justify-center gap-1 w-full">
                          <span>Upload By</span>
                          <ArrowUpDown size={12} className={supplierSort.field === 'created_by' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600 opacity-50'} />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {sortedUniqueSuppliers.map(supplier => {
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
                          <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200 w-[20%] min-w-[220px]">
                            <a
                              href={`/management/supplier/${supplier.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-semibold hover:text-[#5c59e9] hover:underline text-left cursor-pointer"
                            >
                              {supplier.name}
                            </a>
                          </td>

                          {/* Email */}
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-450 w-[15%] min-w-[180px]">
                            {supplier.email || '—'}
                          </td>

                          {/* Phone */}
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-450 w-[10%] min-w-[130px]">
                            {supplier.phone || '—'}
                          </td>

                          {/* Contact Person */}
                          <td className="px-6 py-4 text-slate-700 dark:text-slate-355 font-semibold w-[12%] min-w-[150px]">
                            {supplier.contact_person || '—'}
                          </td>

                          {/* Website Link */}
                          <td className="px-6 py-4 w-[12%] min-w-[150px]">
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

                          {/* Address */}
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 truncate max-w-xs w-[15%] min-w-[200px]" title={supplier.address || ''}>
                            {supplier.address || '—'}
                          </td>

                          {/* Main Products */}
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 truncate max-w-xs font-medium w-[16%] min-w-[200px]" title={supplier.main_products ? supplier.main_products.join(', ') : ''}>
                            {supplier.main_products && supplier.main_products.length > 0 ? supplier.main_products.join(', ') : '—'}
                          </td>

                          {/* Uploaded By */}
                          <td className="px-6 py-4 text-center w-[10%] min-w-[110px]">
                            <span 
                              className="text-slate-600 dark:text-slate-400 font-semibold text-[11px] bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1 rounded-md border border-slate-100 dark:border-slate-800/60"
                              title={supplier.created_by || 'System'}
                            >
                              {supplier.created_by ? supplier.created_by.split('@')[0] : 'System'}
                            </span>
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
        <OrderSidebar
          orders={orders}
          viewMode={viewMode}
          selectedOrderId={selectedOrderId}
          setViewMode={setViewMode}
          setSelectedOrderId={setSelectedOrderId}
          allSuppliersCount={suppliers.filter(s => s.is_bid).length}
        />

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
                          {/* Import Excel/CSV */}
                          <DropdownMenuItem
                            onClick={() => {
                              setCsvPreview([])
                              setImportStatus(null)
                              setImportTab('file')
                              setIsImportOpen(true)
                              setErrorMessage(null)
                            }}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-305"
                          >
                            <Upload size={12} className="text-[#5c59e9]" />
                            <span>Import Excel/CSV</span>
                          </DropdownMenuItem>

                          {/* Paste from Sheets */}
                          <DropdownMenuItem
                            onClick={() => {
                              setPasteImportStatus(null)
                              setPasteErrorMessage(null)
                              setImportTab('paste')
                              setIsImportOpen(true)
                              setErrorMessage(null)
                            }}
                            className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-305"
                          >
                            <Clipboard size={12} className="text-[#5c59e9]" />
                            <span>Paste from Sheets</span>
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
                {selectedOrder && (
                  <TimelineProposalCard
                    orderId={selectedOrder.id}
                    orderCode={selectedOrder.order_code}
                    orderDate={selectedOrder.order_date}
                    estimatedDeliveryDate={selectedOrder.estimated_delivery_date || ''}
                    orderType={selectedOrder.order_type || ''}
                    userDepartment="sourcing"
                    existingTimelines={selectedOrder.order_stage_timelines || []}
                  />
                )}
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
                          const lead = parseLeadTimeToNumber(s.lead_time_days)
                          if (lead !== Infinity) {
                            if (bestLeadTimePerItem[s.order_item_id] === undefined || lead < bestLeadTimePerItem[s.order_item_id]) {
                              bestLeadTimePerItem[s.order_item_id] = lead
                            }
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
                                      setIsAddOpen(true)
                                      setErrorMessage(null)
                                    }}
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-300"
                                      >
                                        <Plus size={12} className="text-[#5c59e9]" />
                                        <span>Assign Supplier</span>
                                      </DropdownMenuItem>
                                      {/* Import Excel/CSV */}
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setCsvPreview([])
                                          setImportStatus(null)
                                          setImportTab('file')
                                          setIsImportOpen(true)
                                          setErrorMessage(null)
                                        }}
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-355"
                                      >
                                        <Upload size={12} className="text-[#5c59e9]" />
                                        <span>Import Excel/CSV</span>
                                      </DropdownMenuItem>

                                      {/* Paste from Sheets */}
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setPasteImportStatus(null)
                                          setPasteErrorMessage(null)
                                          setImportTab('paste')
                                          setIsImportOpen(true)
                                          setErrorMessage(null)
                                        }}
                                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-slate-700 dark:text-slate-355"
                                      >
                                        <Clipboard size={12} className="text-[#5c59e9]" />
                                        <span>Paste from Sheets</span>
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

                                      {/* Create PO (Only visible when 1 supplier is selected and it has passed QC) */}
                                      {selectedSupplierIds.length === 1 && (() => {
                                        const supplier = suppliers.find(s => s.id === selectedSupplierIds[0])
                                        if (!supplier) return null
                                        const audit = audits.find(a => a.supplier_id === supplier.supplier_id && a.order_id === supplier.order_id)
                                        const hasPassedQC = audit && 
                                          audit.audit_status === 'Completed' && 
                                          (audit.audit_verdict === 'PASS' || audit.audit_verdict === 'PASS WITH CONDITIONS')

                                        return (
                                          <DropdownMenuItem
                                            disabled={!hasPassedQC || (selectedOrder?.stage !== 'Sourcing' && selectedOrder?.stage !== 'Ready for PO')}
                                            onClick={() => {
                                              setPoSupplier(supplier)
                                              const qty = selectedOrder?.order_items?.find(item => item.id === supplier.order_item_id)?.quantity || 1
                                              setPoContractValue(Number(supplier.quoted_price) * qty)
                                              setIsPoConfirming(false)
                                              setErrorMessage(null)
                                            }}
                                            className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-emerald-600 dark:text-emerald-450 disabled:opacity-50 disabled:cursor-not-allowed"
                                          >
                                            <CheckCircle2 size={12} className="text-emerald-500" />
                                            <span>Create PO</span>
                                          </DropdownMenuItem>
                                        )
                                      })()}

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
                                      setIsAddOpen(true)
                                      setErrorMessage(null)
                                    }}
                                  size="sm"
                                  className="mt-2 gap-1.5 bg-[#5c59e9] hover:bg-[#4a47d2]"
                                >
                                  <Plus size={14} />
                                  <span>Assign Supplier</span>
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
                                      const isFastestLead = supplier.order_item_id && bestLeadTimePerItem[supplier.order_item_id] !== undefined && parseLeadTimeToNumber(supplier.lead_time_days) === bestLeadTimePerItem[supplier.order_item_id]
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
      <AssignSupplierModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        orders={orders}
        uniqueSuppliers={uniqueSuppliers}
        selectedOrderId={selectedOrderId}
        viewMode={viewMode}
        subtab={subtab}
        onSuccess={invalidateSourcingData}
        addSupplierNormalizedAction={addSupplierNormalizedAction}
        onDuplicateDetected={(duplicates, payload) => {
          setPendingActionType('manual')
          setPendingPayload(payload)
          setConflictingDuplicates(duplicates)
          setIsConflictDialogOpen(true)
        }}
        existingBids={suppliers}
      />

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

              {!poSupplier.suppliers?.email && (
                <div className="p-3.5 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 rounded-xl text-xs font-semibold border border-red-200 dark:border-red-900/50 flex items-start gap-2.5">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>This supplier does not have an email address configured. You must set an email address for their profile in the Supplier Profiles tab before you can issue a Purchase Order.</span>
                </div>
              )}

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
                    !poDeliveryAddress ||
                    !poSupplier.suppliers?.email
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
                      await invalidateSourcingData()
                      if (res.emailSent) {
                        if (res.supplierEmail) {
                          triggerToast(`Purchase Order created successfully. Notification email sent to ${res.supplierEmail}.`)
                        } else {
                          triggerToast("Purchase Order created successfully. Email notification simulated.")
                        }
                      } else {
                        triggerToast("Purchase Order created, but email was skipped (supplier has no email address).")
                      }
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
          <div className={`relative z-10 w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-205 overflow-hidden ${
            importTab === 'paste' ? 'max-w-5xl' : 'max-w-2xl'
          }`}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {importTab === 'file' ? (
                    <>
                      <Upload className="h-5 w-5 text-[#5c59e9]" />
                      <span>📥 Import Excel/CSV File</span>
                    </>
                  ) : (
                    <>
                      <Clipboard className="h-5 w-5 text-[#5c59e9]" />
                      <span>📋 Paste from Sheets</span>
                    </>
                  )}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {importTab === 'file' 
                    ? 'Upload a CSV or Excel template file to import suppliers.'
                    : 'Paste cells copied from Excel/Sheets directly into the grid.'}
                </p>
              </div>
              <button
                onClick={() => { if (!isImporting && !isPasteImporting) { setIsImportOpen(false); setCsvPreview([]); setImportStatus(null); setPasteImportStatus(null); } }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
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
                          invalidateSourcingData()
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
                        accept=".csv, .xlsx, .xls"
                        id="csv-file-input"
                        onChange={handleCsvUpload}
                        className="hidden"
                      />
                      <label 
                        htmlFor="csv-file-input"
                        className="cursor-pointer flex flex-col items-center gap-2"
                      >
                        <Upload className="h-8 w-8 text-slate-400 hover:text-[#5c59e9] transition-colors" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Click to upload Excel or CSV file</span>
                        <span className="text-[10px] text-slate-400">
                          {subtab === 'suppliers'
                            ? 'Columns: supplier_name, email, phone, address, website, contact_person, tax_id, business_type, main_products'
                            : 'Columns: supplier_name, email, phone, address, main_products, quoted_price, lead_time (order_code is optional)'}
                        </span>
                      </label>
                    </div>

                    {csvPreview.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Previewing {Math.min(5, csvPreview.length)} of {csvPreview.length} rows:
                          </span>
                        </div>
                        <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-x-auto w-full max-w-full">
                          <table className="w-full text-left border-collapse text-[10px]">
                                                      <thead>
                                                        <tr className="bg-slate-50 dark:bg-slate-955 border-b border-slate-100 dark:border-slate-800 font-bold uppercase text-slate-500">
                                                          {getGridColumns().map(col => (
                                                            <th key={col.key} className={`px-4 py-2 bg-slate-50 dark:bg-slate-955 font-bold uppercase text-slate-500 ${getColumnWidth(col.key)}`}>
                                                              {col.label}
                                                            </th>
                                                          ))}
                                                        </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                        {csvPreview.slice(0, 5).map((row: any, idx) => (
                                                          <tr key={idx} className="text-slate-700 dark:text-slate-300">
                                                            {getGridColumns().map(col => {
                                                              const colKey = col.key
                                                              let val = row[colKey]
                                    
                                                              // Custom formatting for specific columns
                                                              if (colKey === 'quotedPrice') {
                                                                val = val ? `$${Number(val).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'
                                                              } else if (colKey === 'leadTime') {
                                                                val = val ? `${val} days` : '—'
                                                              } else if (!val || val === '-') {
                                                                val = '—'
                                                              }

                                                              return (
                                                                <td 
                                                                  key={colKey} 
                                                                  className={`px-4 py-2 ${getColumnWidth(colKey)} ${
                                                                    colKey === 'supplierName' ? 'font-semibold' :
                                                                    colKey === 'orderCode' ? 'font-bold text-[#5c59e9]' :
                                                                    colKey === 'quotedPrice' ? 'font-bold text-slate-900 dark:text-white' : ''
                                                                  } ${colKey === 'productName' ? 'truncate max-w-[200px]' : ''}`}
                                                                  title={colKey === 'productName' ? String(row[colKey] || '') : undefined}
                                                                >
                                                                  {val}
                                                                </td>
                                                              )
                                                            })}
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
                              const res = await bulkImportSuppliersAction(csvPreview, null, subtab === 'suppliers')
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
                          invalidateSourcingData()
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
                      <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Paste Excel/Google Sheets data or edit cells directly:
                      </Label>
                      <p className="text-[10px] text-slate-400">
                        Click on any cell and press <strong>Ctrl+V</strong> to paste copied data from Excel or Google Sheets. The columns will map 1-to-1 matching the CSV template order.
                      </p>

                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto overflow-x-auto shadow-sm">
                        <table className="w-full text-left border-collapse text-[10px]">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-955 border-b border-slate-200 dark:border-slate-850 font-bold uppercase text-slate-500 sticky top-0 z-10">
                              <th className="px-3 py-2 w-10 text-center text-slate-400 bg-slate-55 dark:bg-slate-950">#</th>
                              {getGridColumns().map(col => (
                                <th key={col.key} className={`px-3 py-2 bg-slate-50 dark:bg-slate-955 font-bold uppercase text-slate-500 ${getColumnWidth(col.key)}`}>
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {pasteGrid.map((row, rowIndex) => (
                              <tr key={rowIndex} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/5">
                                <td className="px-3 py-2 text-center font-bold text-slate-400 bg-slate-50/30 dark:bg-slate-950/20">{rowIndex + 1}</td>
                                {getGridColumns().map(col => col.key).map((colKey) => (
                                  <td key={colKey} className={`p-1 ${getColumnWidth(colKey)}`}>
                                    <input
                                      type="text"
                                      value={row[colKey] || ''}
                                      onChange={(e) => handleGridCellChange(rowIndex, colKey, e.target.value)}
                                      onPaste={(e) => handleGridCellPaste(e, rowIndex, colKey)}
                                      placeholder={
                                        colKey === 'supplierName' ? 'e.g. Acme Corp' :
                                        colKey === 'email' ? 'contact@acme.com' :
                                        colKey === 'productName' ? 'e.g. Cardboard Box' :
                                        colKey === 'quotedPrice' ? '0.00' :
                                        colKey === 'leadTime' ? '0' : ''
                                      }
                                      className="w-full text-xs px-2 py-1.5 rounded bg-transparent focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#5c59e9] border border-transparent focus:border-slate-200 dark:focus:border-slate-800 font-medium"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {pasteErrorMessage && (
                      <div className="p-3 bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 rounded-xl text-xs font-medium border border-red-200 dark:border-red-900/50 flex items-center gap-2 animate-in fade-in">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span>{pasteErrorMessage}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center gap-3 pt-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddGridRow}
                          className="h-8 text-xs font-semibold cursor-pointer border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-1"
                        >
                          <Plus size={12} />
                          <span>Add Row</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleClearGrid}
                          className="h-8 text-xs font-semibold cursor-pointer border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg"
                        >
                          <span>Clear Table</span>
                        </Button>
                      </div>
                      
                      <Button
                        onClick={async () => {
                          const validRows = pasteGrid
                            .map(r => {
                              const cleanPriceStr = String(r.quotedPrice || '').replace(/[^0-9.]/g, '')
                              const quotedPrice = parseFloat(cleanPriceStr) || 0
                              const cleanLeadTimeStr = String(r.leadTime || '').replace(/[^0-9]/g, '')
                              const leadTime = parseInt(cleanLeadTimeStr) || 0
                              
                              let orderCode = r.orderCode || ''
                              const isBlankOrder = !orderCode || orderCode.trim() === '' || orderCode.trim() === '-'
                              if (isBlankOrder && viewMode === 'order' && selectedOrder) {
                                const productName = r.productName || ''
                                const matchesActiveOrderItems = selectedOrder.order_items?.some(
                                  (item: any) => item.item_name.toLowerCase().trim() === productName.toLowerCase().trim()
                                )
                                if (matchesActiveOrderItems) {
                                  orderCode = selectedOrder.order_code
                                }
                              }

                                return {
                                supplierName: r.supplierName ? r.supplierName.trim() : '',
                                email: r.email ? r.email.trim() : '',
                                phone: r.phone ? r.phone.trim() : '',
                                address: r.address ? r.address.trim() : '',
                                productName: r.productName ? r.productName.trim() : '',
                                quotedPrice,
                                leadTime,
                                website: r.website ? r.website.trim() : '',
                                contactPerson: r.contactPerson ? r.contactPerson.trim() : '',
                                taxId: r.taxId ? r.taxId.trim() : '',
                                businessType: r.businessType ? r.businessType.trim() : '',
                                orderCode
                              }
                            })
                            .filter(r => r.supplierName !== '')

                          if (validRows.length === 0) {
                            setPasteErrorMessage('Please enter at least one supplier row with a Supplier Name.')
                            return
                          }

                          setIsPasteImporting(true)
                          setPasteErrorMessage(null)
                          const res = await bulkImportSuppliersAction(validRows, null, subtab === 'suppliers')
                          setIsPasteImporting(false)
                          
                          if (res.success) {
                            setPasteImportStatus({
                              success: true,
                              msg: `Imported ${res.importedSuppliersCount} unique suppliers, ${res.importedBidsCount} active bids, and ${res.importedCapabilitiesCount} capability records.`
                            })
                          } else if (res.duplicateDetected) {
                            setPendingActionType('paste')
                            setPendingPayload(validRows)
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
                        className="h-8 text-xs bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer gap-2 font-semibold px-4 rounded-lg"
                      >
                        {isPasteImporting ? (
                          <><Loader2 size={12} className="animate-spin" /> Appending...</>
                        ) : (
                          <>Append to Order ({pasteGrid.filter(r => r.supplierName !== '').length} rows)</>
                        )}
                      </Button>
                    </div>
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
            onClick={() => { if (!isDeletingBatch) setIsBulkDeleteConfirmOpen(false); }}
          />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <AlertCircle size={22} className="flex-shrink-0 text-red-600 dark:text-red-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {subtab === 'suppliers' ? 'Delete Selected Supplier Profiles' : 'Delete Selected Suppliers'}
              </h3>
            </div>
            
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
              {subtab === 'suppliers' ? (
                <>
                  Are you sure you want to delete the <strong className="font-semibold text-slate-800 dark:text-slate-200">{selectedSupplierIds.length}</strong> selected supplier profiles? This action cannot be undone and will permanently remove all their credentials, capabilities, and history.
                </>
              ) : (
                <>
                  Are you sure you want to delete the <strong className="font-semibold text-slate-800 dark:text-slate-200">{selectedSupplierIds.length}</strong> selected supplier quotes? This action cannot be undone and will remove them from all comparison matrices.
                </>
              )}
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="flex-1 h-9 text-sm cursor-pointer"
                disabled={isDeletingBatch}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmBatchDelete}
                disabled={isDeletingBatch}
                className="flex-1 h-9 text-sm bg-red-600 hover:bg-red-700 text-white cursor-pointer gap-2"
              >
                {isDeletingBatch ? <><Loader2 size={13} className="animate-spin" /> Deleting...</> : 'Delete'}
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
