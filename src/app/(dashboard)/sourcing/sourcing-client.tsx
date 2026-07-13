'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useTransition, useEffect, useRef } from 'react'
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
  confirmSupplierAndCreatePoAction,
  saveGmailAgentIdAction,
  fetchEmailTemplatesAction,
  updateEmailTemplateAction,
  resetEmailTemplateAction,
  sendDepositEmailAction
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
  AlertTriangle,
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
  Edit,
  RotateCcw,
  Bold,
  Italic,
  Link,
  List,
  Save
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

// Helper to compute ordering gap risk alerts for Launches
function computeGapAlert(order: any, allSuppliers: any[]) {
  const sourcingTimeline = order.order_stage_timelines?.find((t: any) => t.stage_name === 'Sourcing')
  const orderBids = allSuppliers.filter(s => s.order_id === order.id)
  const hasShortlisted = orderBids.some(s => s.is_shortlisted)
  
  const postSourcingStages = ['Create PO', 'Supplier Production', 'QC', 'Logistics', 'Final Production', 'Completed', 'Done']
  const isPOConfirmed = postSourcingStages.includes(order.stage)
  
  if (isPOConfirmed) {
    return { status: 'po-confirmed', label: 'PO Confirmed', color: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-950/30 border-indigo-200/50' }
  }
  
  if (hasShortlisted) {
    return { status: 'on-track', label: 'On Track (Shortlisted)', color: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-955/20 border-emerald-200/50' }
  }
  
  if (sourcingTimeline?.estimated_end_date) {
    const deadline = new Date(sourcingTimeline.estimated_end_date)
    const today = new Date()
    const diffTime = deadline.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays < 0) {
      return { status: 'gap-risk', label: 'Gap Risk (Deadline Passed)', color: 'bg-rose-500/10 text-rose-600 dark:bg-rose-955/20 border-rose-200/50 animate-pulse' }
    } else if (diffDays <= 5) {
      return { status: 'at-risk', label: `At Risk (${diffDays} days left)`, color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-955/20 border-amber-200/50' }
    }
  }
  
  return { status: 'on-track', label: 'On Track', color: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-955/20 border-emerald-200/50' }
}

function formatDateShort(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const r = String(d.getDate()).padStart(2, '0')
  return `${m}/${r}`
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
  deposit_email_sent?: boolean
  deposit_email_sent_at?: string | null
  shipment_reminder_sent?: boolean
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
  material_cost_percent?: number | null
  labor_cost_percent?: number | null
  overhead_cost_percent?: number | null
  profit_margin_percent?: number | null
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
  const [isSendingDepositEmail, setIsSendingDepositEmail] = useState(false)

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

  const handleSendDepositEmail = async (orderId: string) => {
    setIsSendingDepositEmail(true)
    try {
      const res = await sendDepositEmailAction(orderId)
      if (res.success) {
        await invalidateSourcingData()
      } else {
        alert(res.error || 'Failed to send deposit email.')
      }
    } catch (err) {
      console.error(err)
      alert('An unexpected error occurred.')
    } finally {
      setIsSendingDepositEmail(false)
    }
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
  const initialSubtab = (searchParams.get('subtab') as 'overview' | 'suppliers' | 'workplace' | 'email-templates' | 'launches') || 'overview'
  const [subtab, setSubtab] = useState<'overview' | 'suppliers' | 'workplace' | 'email-templates' | 'launches'>(initialSubtab)
  const [supplierSearch, setSupplierSearch] = useState('')
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [supplierSort, setSupplierSort] = useState<{ field: 'name' | 'created_by' | 'reliability' | 'quality' | 'leadTime' | null; order: 'asc' | 'desc' }>({
    field: null,
    order: 'asc'
  })
  const [isDeletingBatch, setIsDeletingBatch] = useState(false)

  const [isInlineAdding, setIsInlineAdding] = useState(false)
  const [inlineSupplier, setInlineSupplier] = useState({
    name: '',
    email: '',
    phone: '',
    contactPerson: '',
    website: '',
    address: '',
    mainProducts: ''
  })
  const [isSavingInline, setIsSavingInline] = useState(false)
  const [isInlineProductsModalOpen, setIsInlineProductsModalOpen] = useState(false)
  const [inlineCapabilities, setInlineCapabilities] = useState(() => [
    { id: Math.random().toString(), productName: '', targetPrice: '', leadTimeDays: '' }
  ])

  const subtabParam = searchParams.get('subtab')

  useEffect(() => {
    if (subtabParam === 'overview' || subtabParam === 'suppliers' || subtabParam === 'workplace' || subtabParam === 'email-templates' || subtabParam === 'launches') {
      setSubtab(subtabParam)
      setIsInlineAdding(false)
    } else {
      setSubtab('overview')
    }
  }, [subtabParam])

  const handleTabChange = (val: 'overview' | 'suppliers' | 'workplace' | 'email-templates' | 'launches') => {
    setSubtab(val)
    setSelectedSupplierIds([])
    setIsManageMode(false)
    setIsInlineAdding(false)
    setInlineSupplier({
      name: '',
      email: '',
      phone: '',
      contactPerson: '',
      website: '',
      address: '',
      mainProducts: ''
    })
    setInlineCapabilities([
      { id: Math.random().toString(), productName: '', targetPrice: '', leadTimeDays: '' }
    ])
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?subtab=${val}`
      window.history.pushState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
    }
  }

  // Email Templates management states
  const { data: emailTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => fetchEmailTemplatesAction(),
    enabled: subtab === 'email-templates'
  })

  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('purchase_order')
  const activeTemplate = emailTemplates?.find((t: any) => t.key === selectedTemplateKey)
  const [editedSubject, setEditedSubject] = useState<string>('')
  const [editedBody, setEditedBody] = useState<string>('')
  const [isSavingTemplate, setIsSavingTemplate] = useState<boolean>(false)
  const [isResettingTemplate, setIsResettingTemplate] = useState<boolean>(false)
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false)

  const editorRef = useRef<HTMLDivElement>(null)

  // Converts text with {{tag}} into HTML with visual pill spans and <br/>
  const convertTextToHtml = (text: string) => {
    if (!text) return ''
    // Escape HTML characters
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    
    // Replace {{Placeholder}} with visual pill spans
    html = html.replace(/{{([^{}]+)}}/g, (match, tag) => {
      const trimmedTag = tag.trim()
      return `<span contenteditable="false" class="visual-pill inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-[#5c59e9] dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 font-bold text-xs select-none mx-0.5" data-tag="${trimmedTag}">${trimmedTag}</span>`
    })

    // Convert newlines to <br/>
    html = html.replace(/\n/g, '<br/>')
    return html
  }

  // Converts HTML with visual pill spans and <br/>/divs back to text with {{tag}}
  const convertHtmlToText = (html: string) => {
    if (typeof document === 'undefined') return html
    const temp = document.createElement('div')
    temp.innerHTML = html
    
    // Find all visual-pill spans
    const pills = temp.querySelectorAll('.visual-pill')
    pills.forEach((pill) => {
      const tag = pill.getAttribute('data-tag') || pill.textContent || ''
      pill.replaceWith(`{{${tag}}}`)
    })
    
    // Convert <br>, <div>, <p> to newlines
    let text = temp.innerHTML
    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<\/div>/gi, '\n')
    text = text.replace(/<div[^>]*>/gi, '')
    text = text.replace(/<p[^>]*>/gi, '')
    text = text.replace(/<\/p>/gi, '\n')
    
    // Decode HTML entities
    const decoder = document.createElement('textarea')
    decoder.innerHTML = text
    return decoder.value
  }

  // Initialize editor HTML only when activeTemplate changes or is loaded
  useEffect(() => {
    if (editorRef.current && activeTemplate) {
      const parsedHtml = convertTextToHtml(activeTemplate.body || '')
      if (editorRef.current.innerHTML !== parsedHtml) {
        editorRef.current.innerHTML = parsedHtml
      }
    }
  }, [selectedTemplateKey, activeTemplate])

  const handleEditorInput = (e: React.FormEvent<HTMLDivElement>) => {
    const html = e.currentTarget.innerHTML
    setEditedBody(convertHtmlToText(html))
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    
    const editor = editorRef.current
    if (!editor || !editor.contains(range.commonAncestorContainer)) return
    
    range.deleteContents()
    const textNode = document.createTextNode(text)
    range.insertNode(textNode)
    
    // Collapse range to end of inserted text
    range.setStartAfter(textNode)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    
    setEditedBody(convertHtmlToText(editor.innerHTML))
  }

  const insertPlaceholder = (tag: string) => {
    const editor = editorRef.current
    if (!editor) {
      setEditedBody((prev) => prev + ` {{${tag}}}`)
      return
    }

    editor.focus()
    const selection = window.getSelection()
    if (!selection) return

    let range: Range
    if (selection.rangeCount > 0) {
      range = selection.getRangeAt(0)
      if (!editor.contains(range.commonAncestorContainer)) {
        range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
      }
    } else {
      range = document.createRange()
      range.selectNodeContents(editor)
      range.collapse(false)
    }

    range.deleteContents()

    // Create visual pill element
    const pill = document.createElement('span')
    pill.setAttribute('contenteditable', 'false')
    pill.className = 'visual-pill inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-[#5c59e9] dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 font-bold text-xs select-none mx-0.5'
    pill.setAttribute('data-tag', tag)
    pill.textContent = tag

    range.insertNode(pill)

    // Insert a space after the pill for easy typing
    const space = document.createTextNode('\u00A0')
    range.collapse(false)
    range.insertNode(space)

    // Move cursor after the space
    const newRange = document.createRange()
    newRange.setStartAfter(space)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    setEditedBody(convertHtmlToText(editor.innerHTML))
  }

  const wrapSelectionWithTag = (openTag: string, closeTag: string, defaultPlaceholder: string) => {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) return

    const selectedText = range.toString()
    if (!selectedText) {
      const span = document.createElement('span')
      span.innerHTML = `${openTag}${defaultPlaceholder}${closeTag}`
      range.insertNode(span)
    } else {
      const fragment = range.extractContents()
      const wrapper = document.createElement('span')
      wrapper.innerHTML = `${openTag}${fragment.textContent || ''}${closeTag}`
      range.insertNode(wrapper)
    }

    setEditedBody(convertHtmlToText(editor.innerHTML))
  }

  const insertBulletPoint = () => {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) return

    range.deleteContents()
    const bulletNode = document.createTextNode('•\u00A0')
    range.insertNode(bulletNode)

    const newRange = document.createRange()
    newRange.setStartAfter(bulletNode)
    newRange.collapse(true)
    selection.removeAllRanges()
    selection.addRange(newRange)

    setEditedBody(convertHtmlToText(editor.innerHTML))
  }

  useEffect(() => {
    if (activeTemplate) {
      setEditedSubject(activeTemplate.subject || '')
      setEditedBody(activeTemplate.body || '')
    }
  }, [activeTemplate, selectedTemplateKey])

  // Mock variables for email live previews
  const mockVariablesPo: Record<string, string> = {
    'Supplier Name': 'Acme Manufacturing Corp',
    'Order Code': 'PO-2026-089',
    'Item Name': 'Premium Silk Fabric - Grade A',
    'Contract Value': '24,500.00',
    'Target Delivery Date': '2026-08-15',
    'Delivery Address': '123 Supply Chain Road, Logistics Hub, SG'
  }

  const mockVariablesRfq: Record<string, string> = {
    'Supplier Name': 'Acme Manufacturing Corp',
    'Item Name': 'Premium Silk Fabric - Grade A',
    'Target Price': '5.50'
  }

  const mockVariables = selectedTemplateKey === 'purchase_order' ? mockVariablesPo : mockVariablesRfq

  const previewSubject = (() => {
    let subject = editedSubject
    for (const [key, val] of Object.entries(mockVariables)) {
      const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      subject = subject.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), val)
    }
    return subject
  })()

  const previewBodyHtml = (() => {
    let body = editedBody
    for (const [key, val] of Object.entries(mockVariables)) {
      const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      body = body.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), `<strong>${val}</strong>`)
    }
    return body
      .split('\n\n')
      .map(para => `<p style="margin-bottom: 12px; margin-top: 0;">${para.replace(/\n/g, '<br/>')}</p>`)
      .join('')
  })()

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSaveInlineSupplier = async () => {
    if (!inlineSupplier.name.trim()) {
      setErrorMessage('Supplier Name is required.')
      return
    }

    setIsSavingInline(true)
    setErrorMessage(null)

    try {
      const result = await addSupplierNormalizedAction({
        supplierName: inlineSupplier.name.trim(),
        email: inlineSupplier.email.trim(),
        phone: inlineSupplier.phone.trim(),
        address: inlineSupplier.address.trim(),
        orderId: null,
        items: [],
        capabilities: inlineCapabilities
          .filter(c => c.productName.trim() !== '')
          .map(c => ({
            productName: c.productName.trim(),
            targetPrice: parseFloat(c.targetPrice) || 0,
            leadTimeDays: c.leadTimeDays.trim(),
            description: '',
            moq: undefined,
            sku: '',
            monthlyCapacity: ''
          })),
        website: inlineSupplier.website.trim(),
        contactPerson: inlineSupplier.contactPerson.trim(),
        taxId: '',
        mainProducts: inlineSupplier.mainProducts.trim()
      }, null, subtab === 'suppliers')

      if (result.success) {
        await invalidateSourcingData()
        setIsInlineAdding(false)
        setInlineSupplier({
          name: '',
          email: '',
          phone: '',
          contactPerson: '',
          website: '',
          address: '',
          mainProducts: ''
        })
        setInlineCapabilities([
          { id: Math.random().toString(), productName: '', targetPrice: '', leadTimeDays: '' }
        ])
      } else {
        setErrorMessage(result.error || 'Failed to add supplier.')
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.')
    } finally {
      setIsSavingInline(false)
    }
  }
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  
  // PO creation states
  const [poSupplier, setPoSupplier] = useState<DatabaseSupplier | null>(null)
  const [poContractValue, setPoContractValue] = useState<number>(0)
  const [isPoConfirming, setIsPoConfirming] = useState(false)
  const [poTargetDeliveryDate, setPoTargetDeliveryDate] = useState<string>('')
  const [poDeliveryAddress, setPoDeliveryAddress] = useState<string>('')
  const [poContractFile, setPoContractFile] = useState<File | null>(null)
  const [gmailNotConnected, setGmailNotConnected] = useState(false)
  const [gmailAuthUrl, setGmailAuthUrl] = useState('')



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

  // Handle Gmail API OAuth Redirect Callback to automatically link agent_id
  useEffect(() => {
    const agentIdParam = searchParams.get('agent_id')
    if (agentIdParam) {
      const agentId = parseInt(agentIdParam, 10)
      if (!isNaN(agentId)) {
        saveGmailAgentIdAction(agentId).then((res) => {
          if (res.success) {
            triggerToast('Gmail account successfully linked to your profile!')
            // Clean query parameters from URL
            const url = new URL(window.location.href)
            url.searchParams.delete('agent_id')
            url.searchParams.delete('email')
            window.history.replaceState({}, '', url.pathname + url.search)
            invalidateSourcingData()
          } else {
            console.error('Failed to link Gmail account:', res.error)
          }
        })
      }
    }
  }, [searchParams])

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

  // Column Visibility State for Supplier Profiles tab
  const [supplierColumnVisibility, setSupplierColumnVisibility] = useState<Record<string, boolean>>({
    supplierName: true,
    email: false,
    phone: false,
    contactPerson: true,
    website: false,
    address: false,
    mainProducts: true,
    reliability: true,
    quality: true,
    leadTime: true,
    uploadedBy: false
  })

  const supplierToggleableColumns = [
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'mainProducts', label: 'Products & Pricing' },
    { key: 'reliability', label: 'Reliability Score' },
    { key: 'quality', label: 'Quality Rating' },
    { key: 'leadTime', label: 'Avg Lead Time' },
    { key: 'contactPerson', label: 'Contact Person' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'website', label: 'Website' },
    { key: 'address', label: 'Address' },
    { key: 'uploadedBy', label: 'Uploaded By' }
  ]

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
    costBreakdown: true,
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
    { key: 'costBreakdown', label: 'Cost Breakdown' },
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
          reliability_score: s.suppliers!.reliability_score,
          quality_rating: s.suppliers!.quality_rating,
          lead_time_average: s.suppliers!.lead_time_average,
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
      let valA: any = ''
      let valB: any = ''
      let isNumeric = false
      if (supplierSort.field === 'name') {
        valA = (a.name || '').toLowerCase().trim()
        valB = (b.name || '').toLowerCase().trim()
      } else if (supplierSort.field === 'created_by') {
        valA = (a.created_by || '').toLowerCase().trim()
        valB = (b.created_by || '').toLowerCase().trim()
      } else if (supplierSort.field === 'reliability') {
        valA = a.reliability_score ?? -1
        valB = b.reliability_score ?? -1
        isNumeric = true
      } else if (supplierSort.field === 'quality') {
        valA = parseFloat(a.quality_rating || '0')
        valB = parseFloat(b.quality_rating || '0')
        isNumeric = true
      } else if (supplierSort.field === 'leadTime') {
        valA = a.lead_time_average ?? 999999
        valB = b.lead_time_average ?? 999999
        isNumeric = true
      }
      
      if (isNumeric) {
        return supplierSort.order === 'asc' ? valA - valB : valB - valA
      }
      if (supplierSort.order === 'asc') {
        return valA.localeCompare(valB)
      } else {
        return valB.localeCompare(valA)
      }
    })
  }, [filteredUniqueSuppliers, supplierSort])

  const handleSort = (field: 'name' | 'created_by' | 'reliability' | 'quality' | 'leadTime') => {
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
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer text-xs font-semibold"
                  >
                    <SlidersHorizontal size={12} />
                    <span>Manage Columns</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-md z-50">
                  <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Toggle Columns
                  </div>
                  {supplierToggleableColumns.map(col => (
                    <DropdownMenuCheckboxItem
                      key={col.key}
                      checked={supplierColumnVisibility[col.key]}
                      onCheckedChange={(checked) => {
                        setSupplierColumnVisibility(prev => ({ ...prev, [col.key]: !!checked }))
                      }}
                      onSelect={(e) => e.preventDefault()}
                      className="text-xs rounded-lg cursor-pointer py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer text-xs font-semibold"
                  >
                    <span>Add</span>
                    <ChevronDown size={12} />
                  </Button>
                </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-1 shadow-md z-50">
                <DropdownMenuItem
                  onClick={() => {
                    setIsInlineAdding(true)
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
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 p-3 rounded-lg text-xs font-semibold flex items-center gap-2 mb-4">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="ml-auto hover:opacity-85 text-red-500 font-bold">Close</button>
          </div>
        )}

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
                      {supplierColumnVisibility.supplierName && (
                        <th 
                          className="px-6 py-4 w-[15%] min-w-[180px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                          onClick={() => handleSort('name')}
                        >
                          <div className="flex items-center gap-1">
                            <span>Supplier Name</span>
                            <ArrowUpDown size={12} className={supplierSort.field === 'name' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600 opacity-50'} />
                          </div>
                        </th>
                      )}
                      {supplierColumnVisibility.mainProducts && <th className="px-6 py-4 w-[25%] min-w-[250px]">Products & Pricing</th>}
                      {supplierColumnVisibility.reliability && (
                        <th 
                          className="px-6 py-4 w-[10%] min-w-[110px] text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                          onClick={() => handleSort('reliability')}
                        >
                          <div className="flex items-center justify-center gap-1 w-full">
                            <span>Reliability</span>
                            <ArrowUpDown size={12} className={supplierSort.field === 'reliability' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600 opacity-50'} />
                          </div>
                        </th>
                      )}
                      {supplierColumnVisibility.quality && (
                        <th 
                          className="px-6 py-4 w-[10%] min-w-[110px] text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                          onClick={() => handleSort('quality')}
                        >
                          <div className="flex items-center justify-center gap-1 w-full">
                            <span>Quality</span>
                            <ArrowUpDown size={12} className={supplierSort.field === 'quality' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600 opacity-50'} />
                          </div>
                        </th>
                      )}
                      {supplierColumnVisibility.leadTime && (
                        <th 
                          className="px-6 py-4 w-[10%] min-w-[110px] text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                          onClick={() => handleSort('leadTime')}
                        >
                          <div className="flex items-center justify-center gap-1 w-full">
                            <span>Avg Lead Time</span>
                            <ArrowUpDown size={12} className={supplierSort.field === 'leadTime' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600 opacity-50'} />
                          </div>
                        </th>
                      )}
                      {supplierColumnVisibility.contactPerson && <th className="px-6 py-4 w-[12%] min-w-[150px]">Contact Person</th>}
                      {supplierColumnVisibility.email && <th className="px-6 py-4 w-[15%] min-w-[180px]">Email</th>}
                      {supplierColumnVisibility.phone && <th className="px-6 py-4 w-[10%] min-w-[130px]">Phone</th>}
                      {supplierColumnVisibility.website && <th className="px-6 py-4 w-[12%] min-w-[150px]">Website</th>}
                      {supplierColumnVisibility.address && <th className="px-6 py-4 w-[15%] min-w-[200px]">Address</th>}
                      {supplierColumnVisibility.uploadedBy && (
                        <th 
                          className="px-6 py-4 w-[10%] min-w-[110px] text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                          onClick={() => handleSort('created_by')}
                        >
                          <div className="flex items-center justify-center gap-1 w-full">
                            <span>Upload By</span>
                            <ArrowUpDown size={12} className={supplierSort.field === 'created_by' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-600 opacity-50'} />
                          </div>
                        </th>
                      )}
                      <th className="px-6 py-4 w-[10%] min-w-[110px] text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {isInlineAdding && (
                      <tr className="bg-indigo-50/10 dark:bg-indigo-950/5 border-b border-indigo-100 dark:border-indigo-900/40">
                        {isManageMode && <td />}
                        
                        {/* Supplier Name */}
                        {supplierColumnVisibility.supplierName && (
                          <td className="px-6 py-3 w-[20%] min-w-[220px]">
                            <Input
                              type="text"
                              placeholder="Supplier Name *"
                              value={inlineSupplier.name}
                              onChange={(e) => setInlineSupplier(prev => ({ ...prev, name: e.target.value }))}
                              className="h-8 text-xs px-2 focus-visible:ring-[#5c59e9] border-slate-200 dark:border-slate-800"
                              autoFocus
                            />
                          </td>
                        )}
                        
                        {/* Main Products */}
                        {supplierColumnVisibility.mainProducts && (
                          <td className="px-6 py-3 w-[16%] min-w-[200px]">
                            <div className="relative">
                              <Input
                                type="text"
                                readOnly
                                placeholder="Click to configure..."
                                value={inlineSupplier.mainProducts || (inlineCapabilities.filter(c => c.productName.trim() !== '').map(c => c.productName.trim()).join(', '))}
                                onClick={() => setIsInlineProductsModalOpen(true)}
                                className="h-8 text-xs pl-2 pr-8 focus-visible:ring-[#5c59e9] border-slate-200 dark:border-slate-800 cursor-pointer bg-slate-50/50 hover:bg-slate-50 truncate"
                              />
                              <Edit 
                                size={12} 
                                className="absolute right-2.5 top-2.5 text-slate-400 pointer-events-none" 
                              />
                            </div>
                          </td>
                        )}

                        {/* Performance columns (render empty cells to keep alignment) */}
                        {supplierColumnVisibility.reliability && <td className="px-6 py-3" />}
                        {supplierColumnVisibility.quality && <td className="px-6 py-3" />}
                        {supplierColumnVisibility.leadTime && <td className="px-6 py-3" />}
                        
                        {/* Contact Person */}
                        {supplierColumnVisibility.contactPerson && (
                          <td className="px-6 py-3 w-[12%] min-w-[150px]">
                            <Input
                              type="text"
                              placeholder="Contact Person"
                              value={inlineSupplier.contactPerson}
                              onChange={(e) => setInlineSupplier(prev => ({ ...prev, contactPerson: e.target.value }))}
                              className="h-8 text-xs px-2 focus-visible:ring-[#5c59e9] border-slate-200 dark:border-slate-800"
                            />
                          </td>
                        )}

                        {/* Email */}
                        {supplierColumnVisibility.email && (
                          <td className="px-6 py-3 w-[15%] min-w-[180px]">
                            <Input
                              type="email"
                              placeholder="Email"
                              value={inlineSupplier.email}
                              onChange={(e) => setInlineSupplier(prev => ({ ...prev, email: e.target.value }))}
                              className="h-8 text-xs px-2 focus-visible:ring-[#5c59e9] border-slate-200 dark:border-slate-800"
                            />
                          </td>
                        )}
                        
                        {/* Phone */}
                        {supplierColumnVisibility.phone && (
                          <td className="px-6 py-3 w-[10%] min-w-[130px]">
                            <Input
                              type="text"
                              placeholder="Phone"
                              value={inlineSupplier.phone}
                              onChange={(e) => setInlineSupplier(prev => ({ ...prev, phone: e.target.value }))}
                              className="h-8 text-xs px-2 focus-visible:ring-[#5c59e9] border-slate-200 dark:border-slate-800"
                            />
                          </td>
                        )}
                        
                        {/* Website */}
                        {supplierColumnVisibility.website && (
                          <td className="px-6 py-3 w-[12%] min-w-[150px]">
                            <Input
                              type="text"
                              placeholder="Website"
                              value={inlineSupplier.website}
                              onChange={(e) => setInlineSupplier(prev => ({ ...prev, website: e.target.value }))}
                              className="h-8 text-xs px-2 focus-visible:ring-[#5c59e9] border-slate-200 dark:border-slate-800"
                            />
                          </td>
                        )}
                        
                        {/* Address */}
                        {supplierColumnVisibility.address && (
                          <td className="px-6 py-3 w-[15%] min-w-[200px]">
                            <Input
                              type="text"
                              placeholder="Address"
                              value={inlineSupplier.address}
                              onChange={(e) => setInlineSupplier(prev => ({ ...prev, address: e.target.value }))}
                              className="h-8 text-xs px-2 focus-visible:ring-[#5c59e9] border-slate-200 dark:border-slate-800"
                            />
                          </td>
                        )}
                        
                        {/* Uploaded By */}
                        {supplierColumnVisibility.uploadedBy && (
                          <td className="px-6 py-3 text-center w-[10%] min-w-[110px] text-slate-400 text-[10px]">
                            You
                          </td>
                        )}
                        
                        {/* Actions */}
                        <td className="px-6 py-3 text-center w-[10%] min-w-[110px]">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              type="button"
                              disabled={isSavingInline}
                              onClick={handleSaveInlineSupplier}
                              className="h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1"
                            >
                              {isSavingInline ? (
                                <Loader2 size={10} className="animate-spin" />
                              ) : (
                                <Check size={10} />
                              )}
                              <span>Save</span>
                            </Button>
                            <Button
                              type="button"
                              disabled={isSavingInline}
                              onClick={() => {
                                setIsInlineAdding(false)
                                setInlineSupplier({
                                  name: '',
                                  email: '',
                                  phone: '',
                                  contactPerson: '',
                                  website: '',
                                  address: '',
                                  mainProducts: ''
                                })
                                setInlineCapabilities([
                                  { id: Math.random().toString(), productName: '', targetPrice: '', leadTimeDays: '' }
                                ])
                              }}
                              className="h-7 px-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1"
                            >
                              <X size={10} />
                              <span>Cancel</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
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
                          {supplierColumnVisibility.supplierName && (
                            <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200 w-[20%] min-w-[220px]">
                              <a
                                href={`/management/supplier/${supplier.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-2.5 py-1 rounded bg-[#5c59e9]/10 text-[#5c59e9] hover:bg-[#5c59e9]/20 dark:bg-[#5c59e9]/20 dark:text-indigo-350 dark:hover:bg-[#5c59e9]/30 transition-colors font-semibold"
                              >
                                {supplier.name}
                              </a>
                            </td>
                          )}

                          {/* Products & Pricing */}
                          {supplierColumnVisibility.mainProducts && (
                            <td className="px-6 py-4 w-[25%] min-w-[250px]">
                              <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto no-scrollbar">
                                {supplier.supplier_capabilities && supplier.supplier_capabilities.length > 0 ? (
                                  supplier.supplier_capabilities.map((cap: any) => (
                                    <div key={cap.id} className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 rounded-lg text-[10px] font-bold shadow-2xs">
                                      {cap.image_url ? (
                                        <img
                                          src={cap.image_url}
                                          alt={cap.product_name}
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setLightboxImage(cap.image_url || null)
                                          }}
                                          className="h-6 w-6 rounded-md object-cover cursor-zoom-in hover:scale-110 transition-transform duration-200 border border-slate-200/50"
                                        />
                                      ) : (
                                        <div className="h-6 w-6 rounded-md bg-slate-150 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                                          <Package size={12} />
                                        </div>
                                      )}
                                      <div className="flex flex-col">
                                        <span className="text-slate-700 dark:text-slate-350 truncate max-w-[80px]" title={cap.product_name}>{cap.product_name}</span>
                                        <span className="text-[#5c59e9] dark:text-indigo-400 font-extrabold">${parseFloat(String(cap.target_price || 0)).toFixed(2)}</span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-slate-400 italic font-normal text-[11px]">— No products</span>
                                )}
                              </div>
                            </td>
                          )}

                          {/* Reliability Score */}
                          {supplierColumnVisibility.reliability && (
                            <td className="px-6 py-4 text-center w-[10%] min-w-[110px]">
                              {supplier.reliability_score != null ? (
                                <div className="flex flex-col items-center gap-1">
                                  <Badge className={`text-[10px] font-bold rounded-lg px-2 py-0.5 border-0 ${
                                    supplier.reliability_score >= 90 
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-955/20' 
                                      : supplier.reliability_score >= 75 
                                      ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-955/20' 
                                      : 'bg-rose-500/10 text-rose-600 dark:bg-rose-955/20'
                                  }`}>
                                    {supplier.reliability_score}%
                                  </Badge>
                                  <div className="w-12 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full rounded-full ${
                                        supplier.reliability_score >= 90 ? 'bg-emerald-500' : supplier.reliability_score >= 75 ? 'bg-amber-500' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${supplier.reliability_score}%` }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          )}

                          {/* Quality Rating */}
                          {supplierColumnVisibility.quality && (
                            <td className="px-6 py-4 text-center w-[10%] min-w-[110px]">
                              {supplier.quality_rating ? (
                                <div className="flex items-center justify-center gap-0.5 text-amber-500 dark:text-amber-400 font-extrabold text-[11px] bg-amber-500/5 px-2 py-1 rounded-md border border-amber-500/10 max-w-fit mx-auto">
                                  <Star size={11} className="fill-current text-amber-500" />
                                  <span>{parseFloat(supplier.quality_rating).toFixed(1)}</span>
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          )}

                          {/* Avg Lead Time */}
                          {supplierColumnVisibility.leadTime && (
                            <td className="px-6 py-4 text-center w-[10%] min-w-[110px] font-bold text-slate-700 dark:text-slate-300">
                              {supplier.lead_time_average != null ? `${supplier.lead_time_average} days` : '—'}
                            </td>
                          )}

                          {/* Contact Person */}
                          {supplierColumnVisibility.contactPerson && (
                            <td className="px-6 py-4 text-slate-700 dark:text-slate-355 font-semibold w-[12%] min-w-[150px]">
                              {supplier.contact_person || '—'}
                            </td>
                          )}

                          {/* Email */}
                          {supplierColumnVisibility.email && (
                            <td className="px-6 py-4 text-slate-600 dark:text-slate-450 w-[15%] min-w-[180px]">
                              {supplier.email || '—'}
                            </td>
                          )}

                          {/* Phone */}
                          {supplierColumnVisibility.phone && (
                            <td className="px-6 py-4 text-slate-600 dark:text-slate-455 w-[10%] min-w-[130px]">
                              {supplier.phone || '—'}
                            </td>
                          )}

                          {/* Website Link */}
                          {supplierColumnVisibility.website && (
                            <td className="px-6 py-4 w-[12%] min-w-[150px]">
                              {supplier.website ? (
                                <a 
                                  href={supplier.website.startsWith('http') ? supplier.website : `https://${supplier.website}`}
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800/80 text-[#5c59e9] dark:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-semibold"
                                >
                                  <Globe size={12} className="text-slate-400" />
                                  <span>{supplier.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          )}

                          {/* Address */}
                          {supplierColumnVisibility.address && (
                            <td className="px-6 py-4 text-slate-500 dark:text-slate-400 truncate max-w-xs w-[15%] min-w-[200px]" title={supplier.address || ''}>
                              {supplier.address || '—'}
                            </td>
                          )}

                          {/* Uploaded By */}
                          {supplierColumnVisibility.uploadedBy && (
                            <td className="px-6 py-4 text-center w-[10%] min-w-[110px]">
                              <span 
                                className="text-slate-600 dark:text-slate-400 font-semibold text-[11px] bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1 rounded-md border border-slate-100 dark:border-slate-800/60"
                                title={supplier.created_by || 'System'}
                              >
                                {supplier.created_by ? supplier.created_by.split('@')[0] : 'System'}
                              </span>
                            </td>
                          )}

                          {/* Actions */}
                          <td className="px-6 py-4 text-center w-[10%] min-w-[110px]">
                            <Button
                              type="button"
                              onClick={() => {
                                handleOpenProfile(supplier.rawRecord)
                                setIsProfileEditMode(true)
                              }}
                              className="h-7 px-2.5 bg-[#5c59e9] hover:bg-[#4a47d2] text-white rounded-lg text-[10px] font-semibold cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Edit size={10} />
                              <span>Update</span>
                            </Button>
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
                                  className="inline-flex items-center px-2.5 py-1 rounded bg-[#5c59e9]/10 text-[#5c59e9] hover:bg-[#5c59e9]/20 dark:bg-[#5c59e9]/20 dark:text-indigo-350 dark:hover:bg-[#5c59e9]/30 transition-colors font-semibold"
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
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-semibold"
                                  >
                                    <Globe size={12} className="text-slate-400 dark:text-slate-500" />
                                    <span>{supplier.suppliers.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
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
                        <div className="space-y-6 animate-in fade-in duration-300">
                          {selectedOrder?.stage === 'PO CONFIRMED' && (
                            <Card className="border-indigo-150 bg-indigo-50/20 dark:border-indigo-950/30 dark:bg-indigo-950/10">
                              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="space-y-1">
                                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                                    {selectedOrder.deposit_email_sent ? (
                                      <>
                                        <Clock size={16} className="text-indigo-500" />
                                        <span>Deposit Notification Email Sent</span>
                                      </>
                                    ) : (
                                      <span>Purchase Order Confirmed by Supplier</span>
                                    )}
                                  </h4>
                                  <p className="text-xs text-slate-500 max-w-xl">
                                    {selectedOrder.deposit_email_sent ? (
                                      <>
                                        Email sent on {selectedOrder.deposit_email_sent_at ? new Date(selectedOrder.deposit_email_sent_at).toLocaleString() : 'N/A'}. Awaiting supplier's deposit confirmation.
                                      </>
                                    ) : (
                                      <span>The supplier has accepted the PO. Next step is to pay the deposit and click below to notify the supplier and request their confirmation.</span>
                                    )}
                                  </p>
                                </div>
                                <Button
                                  onClick={() => handleSendDepositEmail(selectedOrder.id)}
                                  disabled={isSendingDepositEmail}
                                  className={`font-semibold text-xs px-4 h-9 rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0 ${
                                    selectedOrder.deposit_email_sent
                                      ? 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-350 dark:hover:bg-slate-800'
                                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                                  }`}
                                >
                                  {isSendingDepositEmail ? (
                                    <><Loader2 size={12} className="animate-spin" /> Sending...</>
                                  ) : (
                                    <>
                                      <Send size={12} />
                                      <span>{selectedOrder.deposit_email_sent ? 'Resend Deposit Sent Email' : 'Send Deposit Sent Email'}</span>
                                    </>
                                  )}
                                </Button>
                              </CardContent>
                            </Card>
                          )}

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
                                          audit.audit_verdict === 'PASS'

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
                                       {orderColumnVisibility.costBreakdown && <th className="px-6 py-4 text-center">Cost Breakdown</th>}
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
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800/80 text-indigo-600 dark:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-semibold"
                                  >
                                    <Globe size={12} className="text-slate-400 dark:text-slate-500" />
                                    <span>{supplier.suppliers.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
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
                                           {orderColumnVisibility.costBreakdown && (
                                             <td className="px-6 py-4 text-center">
                                               {supplier.material_cost_percent ? (
                                                 <div className="flex items-center justify-center gap-1.5 font-bold flex-wrap text-[9px] text-slate-500 dark:text-slate-400">
                                                   <span className="text-rose-600 dark:text-rose-450 bg-rose-50 dark:bg-rose-955/20 px-2 py-0.5 rounded-lg border border-rose-100 dark:border-rose-900/30">Mat: {supplier.material_cost_percent}%</span>
                                                   <span className="text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-955/20 px-2 py-0.5 rounded-lg border border-amber-100 dark:border-amber-900/30">Lab: {supplier.labor_cost_percent}%</span>
                                                   <span className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-955/20 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-900/30">Over: {supplier.overhead_cost_percent}%</span>
                                                   <span className="text-emerald-600 dark:text-emerald-500 bg-emerald-50 dark:bg-emerald-955/20 px-2 py-0.5 rounded-lg border border-emerald-100 dark:border-emerald-900/30">Prof: {supplier.profit_margin_percent}%</span>
                                                 </div>
                                               ) : (
                                                 <span className="text-slate-350 dark:text-slate-600 font-medium italic">—</span>
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
                                              } else {
                                                badgeStyle = "bg-rose-50 text-rose-700 border-rose-250 dark:bg-rose-950/20 dark:text-rose-450 dark:border-rose-900"
                                                label = "QC FAIL"
                                              }
                                            } else {
                                              badgeStyle = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-450 dark:border-blue-900"
                                              label = "QC In Progress"
                                            }

                                            const hasPassedQC = audit.audit_status === 'Completed' && 
                                            audit.audit_verdict === 'PASS'
                                            
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
                      </div>
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

      <TabsContent value="email-templates" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-300">
          {/* Left panel: Template Selector list (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="rounded-2xl border-slate-200/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/10 backdrop-blur-md shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-800 dark:text-white">Email Templates Manager</CardTitle>
                <CardDescription className="text-xs text-slate-400 dark:text-slate-500">
                  Select a template from the list below to edit its content and subject directly inside the preview on the right.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Template Selector */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500 font-bold dark:text-slate-400">Select Template</Label>
                  <div className="flex flex-col gap-2">
                    {emailTemplates?.map((t: any) => (
                      <button
                        key={t.key}
                        onClick={() => setSelectedTemplateKey(t.key)}
                        className={`text-left p-3.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer flex flex-col gap-1.5 ${
                          selectedTemplateKey === t.key
                            ? 'bg-[#5c59e9]/5 border-[#5c59e9] text-[#5c59e9] dark:bg-indigo-950/20 dark:border-indigo-500 dark:text-indigo-400 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-650 hover:border-slate-350 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-400'
                        }`}
                      >
                        <div className="font-bold">{t.name}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 line-clamp-2 leading-relaxed">
                          {(() => {
                            if (t.key === 'purchase_order') return 'Sent automatically to the selected supplier when their bid is confirmed.'
                            if (t.key === 'rfq') return 'Sent to suppliers to invite them to bid on new sourcing requirements.'
                            if (t.key === 'deposit_check') return 'Sent automatically to the supplier 48 hours after PO issuance to request deposit receipt confirmation.'
                            if (t.key === 'production_pulse') return 'Sent weekly to active suppliers to report current production status.'
                            if (t.key === 'production_started') return 'Sent on PO acceptance to notify that production has started and allow shipment mark.'
                            return t.description || 'Email Template'
                          })()}
                        </div>
                      </button>
                    ))}
                    {!emailTemplates && (
                      <div className="text-center text-xs text-slate-400 py-6">Loading templates...</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right panel: Live Editor & Preview (lg:col-span-8) */}
          <div className="lg:col-span-8">
            <Card className="rounded-2xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col h-full min-h-[550px]">
              <div className="bg-slate-100 dark:bg-slate-955 px-4 py-2.5 border-b border-slate-200/60 dark:border-slate-850 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Interactive Template Editor &amp; Preview</div>
                
                {/* Reset & Save Buttons */}
                {activeTemplate && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isResettingTemplate}
                      onClick={async () => {
                        setIsResetConfirmOpen(true)
                      }}
                      className="border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 text-[10px] font-bold px-2.5 h-7 rounded-lg cursor-pointer gap-1 flex items-center bg-white dark:bg-slate-900"
                    >
                      {isResettingTemplate ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <RotateCcw size={10} />
                      )}
                      <span>Reset</span>
                    </Button>
                    
                    <Button
                      type="button"
                      size="sm"
                      disabled={isSavingTemplate}
                      onClick={async () => {
                        setIsSavingTemplate(true)
                        const res = await updateEmailTemplateAction(activeTemplate.id, editedSubject, editedBody)
                        setIsSavingTemplate(false)
                        if (res.success) {
                          triggerToast('Email template updated successfully!')
                          refetchTemplates()
                        } else {
                          triggerToast(`Failed to save template: ${res.error}`)
                        }
                      }}
                      className="bg-[#5c59e9] hover:bg-indigo-600 text-white text-[10px] font-bold px-2.5 h-7 rounded-lg cursor-pointer gap-1 flex items-center"
                    >
                      {isSavingTemplate ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        <Save size={10} />
                      )}
                      <span>Save</span>
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-955 border-b border-slate-200/50 dark:border-slate-850 space-y-1.5 text-xs text-slate-500 dark:text-slate-400">
                <div>
                  <span className="font-bold text-slate-400">From:</span> TR Sourcing Hub &lt;sourcing@tr.com&gt;
                </div>
                <div>
                  <span className="font-bold text-slate-400">To:</span> contact@supplier-acme.com
                </div>
                {activeTemplate && (
                  <div className="flex gap-1.5 items-center w-full">
                    <span className="font-bold text-slate-400 shrink-0">Subject:</span>
                    <input
                      type="text"
                      value={editedSubject}
                      onChange={(e) => setEditedSubject(e.target.value)}
                      className="bg-transparent border-none p-0 text-xs font-semibold text-slate-850 dark:text-slate-150 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 w-full hover:bg-slate-200/30 dark:hover:bg-slate-800/30 rounded px-1 transition-colors py-0.5"
                      placeholder="Enter email subject..."
                    />
                  </div>
                )}
              </div>

              {activeTemplate ? (
                <div className="flex-1 p-6 bg-slate-100 dark:bg-slate-955 overflow-y-auto max-h-[650px] flex flex-col gap-4">
                  {/* Sleek Toolbar docked at the top of the preview scroll area */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
                    {/* Formatting buttons */}
                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 p-1 rounded-lg border border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => wrapSelectionWithTag('<strong>', '</strong>', 'Bold text')}
                        title="Bold"
                        className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-550 hover:text-slate-755 dark:text-slate-450 dark:hover:text-slate-205 transition-all cursor-pointer shadow-sm border border-transparent hover:border-slate-200/60 dark:hover:border-slate-800"
                      >
                        <Bold size={13} className="stroke-[2.5]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => wrapSelectionWithTag('<em>', '</em>', 'Italic text')}
                        title="Italic"
                        className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-550 hover:text-slate-755 dark:text-slate-450 dark:hover:text-slate-205 transition-all cursor-pointer shadow-sm border border-transparent hover:border-slate-200/60 dark:hover:border-slate-800"
                      >
                        <Italic size={13} className="stroke-[2.5]" />
                      </button>
                      <button
                        type="button"
                        onClick={() => wrapSelectionWithTag('<a href="https://example.com">', '</a>', 'Link text')}
                        title="Insert Link"
                        className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-550 hover:text-slate-755 dark:text-slate-450 dark:hover:text-slate-205 transition-all cursor-pointer shadow-sm border border-transparent hover:border-slate-200/60 dark:hover:border-slate-800"
                      >
                        <Link size={13} className="stroke-[2.5]" />
                      </button>
                      <button
                        type="button"
                        onClick={insertBulletPoint}
                        title="Bullet List"
                        className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-900 text-slate-550 hover:text-slate-755 dark:text-slate-450 dark:hover:text-slate-205 transition-all cursor-pointer shadow-sm border border-transparent hover:border-slate-200/60 dark:hover:border-slate-800"
                      >
                        <List size={13} className="stroke-[2.5]" />
                      </button>
                    </div>

                    {/* Placeholders chip selector */}
                    <div className="flex flex-wrap items-center gap-1.5 justify-end">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Insert:</span>
                      {activeTemplate.placeholders?.map((tag: string) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => insertPlaceholder(tag)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 text-[#5c59e9] dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30 hover:bg-[#5c59e9] hover:text-white dark:hover:bg-indigo-600 dark:hover:text-white text-[10px] font-bold cursor-pointer transition-all duration-200 shadow-sm"
                        >
                          <Plus size={8} className="stroke-[3]" />
                          <span>{tag}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Email Envelope Container */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-8 max-w-[600px] mx-auto shadow-sm w-full">
                    {/* Header */}
                    <div className="border-b-2 border-slate-100 dark:border-slate-800/80 pb-4 mb-6 text-center">
                      <div className="text-lg font-extrabold text-[#5c59e9] dark:text-indigo-400 uppercase tracking-wider font-sans">
                        TR Sourcing Hub
                      </div>
                    </div>
                    
                    {/* Title */}
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-0 mb-4 text-center font-sans">
                      {(() => {
                        if (selectedTemplateKey === 'purchase_order') return 'Purchase Order Confirmation'
                        if (selectedTemplateKey === 'rfq') return 'Request for Quote'
                        if (selectedTemplateKey === 'deposit_check') return 'Confirm Deposit Received'
                        if (selectedTemplateKey === 'production_pulse') return 'Production Progress Pulse'
                        if (selectedTemplateKey === 'production_started') return 'Production Started & PO Confirmed'
                        return 'Email Notification'
                      })()}
                    </h1>

                    {/* Editable Body Editor */}
                    <div className="relative group border border-transparent hover:border-slate-200/85 focus-within:border-[#5c59e9] dark:hover:border-slate-800 dark:focus-within:border-indigo-500 rounded-xl p-3 -mx-3 transition-all duration-200">
                      <div
                        ref={editorRef}
                        contentEditable
                        onInput={handleEditorInput}
                        onPaste={handlePaste}
                        className="w-full bg-transparent border-0 p-0 text-sm text-slate-650 dark:text-slate-355 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:outline-none min-h-[180px] font-sans leading-relaxed outline-none select-text before:content-[attr(data-placeholder)] before:text-slate-450 dark:before:text-slate-500 before:absolute before:pointer-events-none empty:before:block before:hidden relative"
                        data-placeholder="Dear {{Supplier Name}} Team, ..."
                        style={{ outline: 'none' }}
                      />
                      <div className="absolute right-3 bottom-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity text-[10px] text-slate-400 dark:text-slate-500 pointer-events-none flex items-center gap-1">
                        <span>Click to edit directly</span>
                      </div>
                    </div>

                    {/* Details Box */}
                    {(selectedTemplateKey === 'purchase_order' || selectedTemplateKey === 'production_started') ? (
                      <div className="bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-100 dark:border-slate-800/80 p-5 mt-6 mb-6 font-sans">
                        <div className="flex justify-between font-sans text-xs mb-2.5 border-b border-dashed border-slate-200/60 dark:border-slate-800 pb-2.5">
                          <span className="text-slate-400 dark:text-slate-500 font-semibold">Order ID:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-bold text-right">{mockVariables['Order Code'] || 'PO-2026-089'}</span>
                        </div>
                        <div className="flex justify-between font-sans text-xs mb-2.5 border-b border-dashed border-slate-200/60 dark:border-slate-800 pb-2.5">
                          <span className="text-slate-400 dark:text-slate-500 font-semibold">Product Item:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-bold text-right">{mockVariables['Item Name'] || 'Premium Silk Fabric - Grade A'}</span>
                        </div>
                        <div className="flex justify-between font-sans text-xs mb-2.5 border-b border-dashed border-slate-200/60 dark:border-slate-800 pb-2.5">
                          <span className="text-slate-400 dark:text-slate-500 font-semibold">Contract Value:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-bold text-right">${mockVariables['Contract Value'] || '24,500.00'} USD</span>
                        </div>
                        <div className="flex justify-between font-sans text-xs mb-2.5 border-b border-dashed border-slate-200/60 dark:border-slate-800 pb-2.5">
                          <span className="text-slate-400 dark:text-slate-500 font-semibold">Target Delivery Date:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-bold text-right">{mockVariables['Target Delivery Date'] || '2026-08-15'}</span>
                        </div>
                        <div className="flex justify-between font-sans text-xs pb-0">
                          <span className="text-slate-400 dark:text-slate-500 font-semibold">Delivery Address:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-bold text-right">{mockVariables['Delivery Address'] || '123 Supply Chain Road, Logistics Hub, SG'}</span>
                        </div>
                      </div>
                    ) : selectedTemplateKey === 'rfq' ? (
                      <div className="bg-slate-50 dark:bg-slate-955 rounded-xl border border-slate-100 dark:border-slate-800/80 p-5 mt-6 mb-6 font-sans">
                        <div className="flex justify-between font-sans text-xs mb-2.5 border-b border-dashed border-slate-200/60 dark:border-slate-800 pb-2.5">
                          <span className="text-slate-400 dark:text-slate-500 font-semibold">Product Item:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-bold text-right">{mockVariables['Item Name'] || 'Premium Silk Fabric - Grade A'}</span>
                        </div>
                        <div className="flex justify-between font-sans text-xs pb-0">
                          <span className="text-slate-400 dark:text-slate-500 font-semibold">Target Price:</span>
                          <span className="text-slate-800 dark:text-slate-200 font-bold text-right">${mockVariables['Target Price'] || '5.50'} USD</span>
                        </div>
                      </div>
                    ) : null}

                    {/* Buttons */}
                    <div className="mt-6 font-sans">
                      {(() => {
                        if (selectedTemplateKey === 'purchase_order') {
                          return (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold text-center py-3 rounded-lg shadow-sm cursor-pointer select-none">
                                Confirm & Accept PO
                              </div>
                              <div className="bg-[#5c59e9] hover:bg-indigo-600 text-white text-xs font-bold text-center py-3 rounded-lg shadow-sm cursor-pointer select-none">
                                View Signed Contract
                              </div>
                            </div>
                          )
                        }
                        if (selectedTemplateKey === 'rfq') {
                          return (
                            <div className="bg-[#5c59e9] hover:bg-indigo-600 text-white text-xs font-bold text-center py-3 rounded-lg shadow-sm cursor-pointer select-none">
                              Submit Proposal Quote
                            </div>
                          )
                        }
                        if (selectedTemplateKey === 'deposit_check') {
                          return (
                            <div className="bg-[#5c59e9] hover:bg-indigo-600 text-white text-xs font-bold text-center py-3 rounded-lg shadow-sm cursor-pointer select-none">
                              Confirm Deposit Received & Start Production
                            </div>
                          )
                        }
                        if (selectedTemplateKey === 'production_pulse') {
                          return (
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold text-center py-3 rounded-lg shadow-sm cursor-pointer select-none">
                                Yes, Production is On-Track
                              </div>
                              <div className="bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold text-center py-3 rounded-lg shadow-sm cursor-pointer select-none">
                                No, We are experiencing Delays
                              </div>
                            </div>
                          )
                        }
                        if (selectedTemplateKey === 'production_started') {
                          return (
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 text-xs font-bold text-center py-3 rounded-lg cursor-not-allowed select-none">
                                  Confirm & Accept PO
                                </div>
                                <div className="bg-[#5c59e9] hover:bg-indigo-600 text-white text-xs font-bold text-center py-3 rounded-lg shadow-sm cursor-pointer select-none">
                                  View Signed Contract
                                </div>
                              </div>
                              <div className="bg-slate-500 hover:bg-slate-600 text-white text-xs font-bold text-center py-3 rounded-lg shadow-sm cursor-pointer select-none">
                                Mark as Shipped
                              </div>
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>

                    <p className="mt-7 font-sans text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                      Should you have any questions or require further clarification, please do not hesitate to contact our Sourcing team.
                    </p>
                    
                    <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-6 text-[10px] text-slate-400 dark:text-slate-500 text-center font-sans">
                      This is an automated notification from TR Sourcing Hub. Please do not reply directly to this email.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400 p-6">
                  Select a template to begin editing.
                </div>
              )}
            </Card>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="launches" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
        <div className="grid lg:grid-cols-[280px_1fr] -mx-8 -mt-8 -mb-8 h-[calc(100vh-4rem)] overflow-hidden">
          
          {/* Left column: Purchase Orders sidebar */}
          <OrderSidebar
            orders={orders}
            viewMode={viewMode}
            selectedOrderId={selectedOrderId}
            setViewMode={setViewMode}
            setSelectedOrderId={setSelectedOrderId}
            allSuppliersCount={suppliers.filter(s => s.is_bid).length}
            hideAllButton={true}
          />

          {/* Right column: main launches panel */}
          <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-800 dark:text-white">Launches &amp; Sourcing Timelines</h3>
                <p className="text-xs text-slate-500 mt-1">Track stage gates and prevent gaps in raw material ordering for new launches.</p>
              </div>
              
              <div className="relative w-full sm:w-64">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search launches by code or item..."
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  className="h-9 w-full rounded-lg pl-9 pr-4 text-xs bg-slate-50 border-slate-200 focus:bg-white dark:bg-slate-900 dark:border-slate-800"
                />
              </div>
            </div>

            {/* Launches list */}
            <div className="space-y-4">
              {orders
                .filter(order => {
                  if (viewMode === 'order') {
                    return order.id === selectedOrderId
                  }
                  return (
                    supplierSearch === '' ||
                    order.order_code.toLowerCase().includes(supplierSearch.toLowerCase()) ||
                    order.order_items?.some(item => item.item_name.toLowerCase().includes(supplierSearch.toLowerCase()))
                  )
                })
                .map(order => {
                  const alert = computeGapAlert(order, suppliers)
                  const stages = [
                    { name: 'Order' },
                    { name: 'Sourcing' },
                    { name: 'QC' },
                    { name: 'Create PO' },
                    { name: 'Supplier Production' },
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
                    if (s.includes('supplier production') || s.includes('supplier_production')) return 4
                    if (s.includes('inspection passed') || s.includes('inspection_passed')) return 6
                    if (s.includes('inspection') || s.includes('port')) return 5
                    if (s.includes('logistics') || s.includes('inbound') || s.includes('logistic')) return 6
                    if (s.includes('production') || s.includes('run') || s.includes('stock') || s.includes('assemble')) return 7
                    if (s.includes('closed') || s.includes('completed') || s.includes('done')) return 8
                    return 1
                  }
                  
                  const activeIdx = getStageIndex(order.stage)
                  const stageProgressPct = (activeIdx / (stages.length - 1)) * 100

                  return (
                    <Card key={order.id} className="rounded-2xl border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow duration-300">
                      <CardContent className="p-6">
                        {/* Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-extrabold text-slate-900 dark:text-white">{order.order_code}</span>
                              <Badge className="text-[9px] px-2 py-0.5 border-0 font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                {order.order_type === 'MATERIAL' ? 'Material' : 'Finished Product'}
                              </Badge>
                            </div>
                            <p className="text-xs font-semibold text-slate-400">
                              Launch Date: {new Date(order.order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Badge className={`text-xs px-2.5 py-1 font-extrabold border rounded-lg ${alert.color}`}>
                              {alert.label}
                            </Badge>
                          </div>
                        </div>

                        {/* Progress visualizer */}
                        <div className="py-6 overflow-x-auto no-scrollbar">
                          <span className="text-slate-450 block mb-6 font-bold text-[10px] uppercase tracking-wider">Order Sourcing &amp; Delivery Timeline</span>
                          
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
                                
                                const timelines = order.order_stage_timelines
                                
                                const matchingTimeline = timelines ? timelines.find(
                                  t => t.stage_name.toLowerCase() === stage.name.toLowerCase()
                                ) : null

                                return (
                                  <div key={idx} className="relative flex flex-col items-center z-10 w-20 pt-2">
                                    {matchingTimeline && matchingTimeline.estimated_start_date && matchingTimeline.estimated_end_date && (
                                      <span className="absolute -top-4 text-[9px] font-extrabold text-indigo-600 dark:text-indigo-405 whitespace-nowrap bg-indigo-50/80 dark:bg-indigo-950/80 px-1 py-0.5 rounded border border-indigo-100/50 dark:border-indigo-900/50 scale-90">
                                        {formatDateShort(matchingTimeline.estimated_start_date)} - {formatDateShort(matchingTimeline.estimated_end_date)}
                                      </span>
                                    )}
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
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Sourcing details & milestones */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Launch Items</span>
                            <div className="space-y-1.5">
                              {order.order_items && order.order_items.length > 0 ? (
                                order.order_items.map(item => (
                                  <div key={item.id} className="flex items-center justify-between bg-slate-50 dark:bg-slate-950/20 p-2.5 rounded-xl border border-slate-100/50 dark:border-slate-850/60 font-semibold text-slate-700 dark:text-slate-355">
                                    <span>{item.item_name}</span>
                                    <span className="text-[10px] bg-slate-200/50 dark:bg-slate-800 px-2 py-0.5 rounded-md text-slate-500">Qty: {item.quantity}</span>
                                  </div>
                                ))
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">— No items</span>
                              )}
                            </div>
                          </div>

                          <div className="lg:col-span-2">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Stage Gate Milestones</span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {['Order', 'Sourcing', 'QC', 'Create PO', 'Supplier Production', 'Inspection', 'Logistic', 'Production', 'Order Done'].map(stg => {
                                const t = order.order_stage_timelines?.find((x: any) => x.stage_name.toLowerCase() === stg.toLowerCase())
                                const isPast = activeIdx > getStageIndex(stg)
                                const isNow = getStageIndex(order.stage) === getStageIndex(stg)

                                return (
                                  <div key={stg} className={`p-2.5 rounded-xl border ${
                                    isNow 
                                      ? 'border-indigo-150 bg-indigo-50/20 dark:border-indigo-900/20 dark:bg-indigo-950/10' 
                                      : isPast 
                                      ? 'border-emerald-100 bg-emerald-50/5 dark:border-emerald-955/10' 
                                      : 'border-slate-100 bg-slate-50/20 dark:border-slate-800/40'
                                  }`}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-bold text-slate-700 dark:text-slate-300">{stg}</span>
                                      {isPast && <CheckCircle2 size={11} className="text-emerald-500" />}
                                      {isNow && <Loader2 size={11} className="animate-spin text-[#5c59e9]" />}
                                    </div>
                                    <div className="space-y-0.5 text-[10px]">
                                      <div className="flex justify-between text-slate-450">
                                        <span>Target:</span>
                                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                                          {t?.estimated_end_date 
                                            ? new Date(t.estimated_end_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) 
                                            : '—'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between text-slate-450">
                                        <span>Actual:</span>
                                        <span className={`font-semibold ${t?.actual_end_date ? 'text-emerald-600 font-bold' : ''}`}>
                                          {t?.actual_end_date 
                                            ? new Date(t.actual_end_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) 
                                            : '—'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
            </div>
          </div>
        </div>
      </TabsContent>

      </Tabs>

      {/* Inline products & capabilities configuration modal */}
      {isInlineProductsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsInlineProductsModalOpen(false)}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800/80 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles size={16} className="text-[#5c59e9] animate-pulse" />
                <span>Configure Products & Capabilities</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsInlineProductsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Main Products Input */}
              <div className="space-y-1">
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Main Products (Comma separated) *</Label>
                <Input
                  type="text"
                  value={inlineSupplier.mainProducts}
                  onChange={(e) => setInlineSupplier(prev => ({ ...prev, mainProducts: e.target.value }))}
                  className="h-9 text-xs focus-visible:ring-[#5c59e9] rounded-lg"
                />
                <p className="text-[10px] text-slate-400">Specify general main products directory categories.</p>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Product Capabilities</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setInlineCapabilities(prev => [...prev, { id: Math.random().toString(), productName: '', targetPrice: '', leadTimeDays: '' }])}
                    className="h-7 text-[10px] px-2 gap-1 border-indigo-200 text-indigo-600 hover:bg-indigo-55 dark:border-indigo-900/50 cursor-pointer rounded-lg"
                  >
                    <Plus size={10} />
                    <span>Add Product Capability</span>
                  </Button>
                </div>

                {inlineCapabilities.length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    <p className="text-xs text-slate-400 font-medium">No capability items added yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {inlineCapabilities.map((cap, idx) => (
                      <div key={cap.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl relative bg-slate-50/30 dark:bg-slate-950/20 space-y-2">
                        <button
                          type="button"
                          onClick={() => setInlineCapabilities(prev => prev.filter(c => c.id !== cap.id))}
                          className="absolute top-2 right-2 text-slate-400 hover:text-red-500 rounded p-0.5 cursor-pointer transition-colors"
                        >
                          <X size={12} />
                        </button>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-[10px] font-bold text-slate-450 uppercase">Product Name *</Label>
                            <Input
                              type="text"
                              value={cap.productName}
                              onChange={e => {
                                const val = e.target.value
                                setInlineCapabilities(prev => prev.map(c => c.id === cap.id ? { ...c, productName: val } : c))
                              }}
                              className="h-8 text-xs rounded-lg focus-visible:ring-[#5c59e9]"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-slate-455 uppercase">Target Price ($) *</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={cap.targetPrice}
                                onChange={e => {
                                  const val = e.target.value
                                  setInlineCapabilities(prev => prev.map(c => c.id === cap.id ? { ...c, targetPrice: val } : c))
                                }}
                                className="h-8 text-xs rounded-lg focus-visible:ring-[#5c59e9]"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-bold text-slate-455 uppercase">Lead Time (Days)</Label>
                              <Input
                                type="number"
                                value={cap.leadTimeDays}
                                onChange={e => {
                                  const val = e.target.value
                                  setInlineCapabilities(prev => prev.map(c => c.id === cap.id ? { ...c, leadTimeDays: val } : c))
                                }}
                                className="h-8 text-xs rounded-lg focus-visible:ring-[#5c59e9]"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-2 mt-4 shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsInlineProductsModalOpen(false)}
                className="h-8 px-4 rounded-lg text-xs font-semibold cursor-pointer border-slate-200 dark:border-slate-800"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const invalid = inlineCapabilities.some(c => c.productName.trim() !== '' && (isNaN(parseFloat(c.targetPrice)) || parseFloat(c.targetPrice) <= 0))
                  if (invalid) {
                    alert('Please enter a valid positive Target Price for all configured capabilities.')
                    return
                  }
                  
                  if (!inlineSupplier.mainProducts.trim()) {
                    const names = inlineCapabilities.map(c => c.productName.trim()).filter(Boolean)
                    if (names.length > 0) {
                      setInlineSupplier(prev => ({ ...prev, mainProducts: names.join(', ') }))
                    }
                  }
                  
                  setIsInlineProductsModalOpen(false)
                }}
                className="h-8 px-4 rounded-lg bg-[#5c59e9] hover:bg-[#4a47d2] text-white text-xs font-semibold cursor-pointer"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Template Confirmation Modal */}
      {isResetConfirmOpen && activeTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsResetConfirmOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-500 dark:text-amber-400 mb-4">
              <RotateCcw size={22} className="flex-shrink-0" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Reset Template</h3>
            </div>
            
            <p className="text-xs text-slate-650 dark:text-slate-400 mb-6 leading-relaxed font-medium">
              Are you sure you want to reset <strong className="font-semibold text-slate-850 dark:text-slate-200">{activeTemplate.name}</strong> to its default settings? This will overwrite your current changes.
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsResetConfirmOpen(false)}
                className="flex-1 h-9 text-xs font-semibold cursor-pointer border-slate-200 dark:border-slate-800"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  setIsResetConfirmOpen(false)
                  setIsResettingTemplate(true)
                  const res = await resetEmailTemplateAction(activeTemplate.id)
                  setIsResettingTemplate(false)
                  if (res.success) {
                    triggerToast('Email template reset to default!')
                    refetchTemplates()
                  } else {
                    triggerToast(`Failed to reset template: ${res.error}`)
                  }
                }}
                className="flex-1 h-9 text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white cursor-pointer"
              >
                Reset Default
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      <AssignSupplierModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        orders={orders}
        uniqueSuppliers={uniqueSuppliers}
        selectedOrderId={selectedOrderId}
        viewMode={viewMode}
        subtab={subtab === 'email-templates' ? 'workplace' : subtab}
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
            onClick={() => {
              setPoSupplier(null)
              setGmailNotConnected(false)
              setGmailAuthUrl('')
              setErrorMessage(null)
            }}
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

              {gmailNotConnected && (
                <div className="p-4 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-400 rounded-xl text-xs border border-amber-200 dark:border-amber-900/50 space-y-3">
                  <div className="flex items-start gap-2.5 font-bold">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-500" />
                    <span>Gmail Account Not Linked</span>
                  </div>
                  <p className="leading-relaxed">
                    Your Gmail account is not linked to Sourcing Hub. Would you like to proceed and send this PO notification email using the system fallback Gmail account?
                  </p>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400 rounded-xl text-xs font-medium border border-red-200 dark:border-red-900/50 flex items-center gap-2">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {gmailNotConnected ? (
                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    type="button"
                    disabled={isPoConfirming}
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
                      fd.append('useSystemGmail', 'true')
                      
                      const res = await confirmSupplierAndCreatePoAction(fd)
                      setIsPoConfirming(false)
                      if (res.success) {
                        setPoSupplier(null)
                        setGmailNotConnected(false)
                        setGmailAuthUrl('')
                        await invalidateSourcingData()
                        if (res.emailSent) {
                          if (res.supplierEmail) {
                            triggerToast(`Purchase Order created successfully. Notification email sent via System Gmail to ${res.supplierEmail}.`)
                          } else {
                            triggerToast("Purchase Order created successfully. Email notification simulated.")
                          }
                        } else {
                          triggerToast("Purchase Order created, but email was skipped.")
                        }
                      } else {
                        setErrorMessage(res.error || 'Failed to create PO')
                        setGmailNotConnected(false)
                      }
                    }}
                    className="w-full h-9 text-sm bg-amber-600 hover:bg-amber-700 text-white cursor-pointer gap-2"
                  >
                    {isPoConfirming ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Creating PO...
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        Send via System Gmail
                      </>
                    )}
                  </Button>
                  
                  {gmailAuthUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        window.location.href = gmailAuthUrl
                      }}
                      className="w-full h-9 text-sm border-indigo-200 dark:border-indigo-900 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 cursor-pointer gap-2"
                    >
                      <Globe size={14} />
                      Log in / Link your Gmail
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setGmailNotConnected(false)
                      setErrorMessage(null)
                    }}
                    className="w-full h-9 text-xs text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    Go back to edit
                  </Button>
                </div>
              ) : (
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPoSupplier(null)
                      setGmailNotConnected(false)
                      setGmailAuthUrl('')
                      setErrorMessage(null)
                    }}
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
                        setGmailNotConnected(false)
                        setGmailAuthUrl('')
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
                        if (res.errorType === 'GMAIL_NOT_CONNECTED') {
                          setGmailNotConnected(true)
                          setGmailAuthUrl(res.authUrl || '')
                        } else {
                          setErrorMessage(res.error || 'Failed to create PO')
                        }
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
              )}
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
      {/* Product Image Lightbox Modal */}
      {lightboxImage && (
        <div 
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-all duration-300 animate-in fade-in"
          onClick={() => setLightboxImage(null)}
        >
          <div 
            className="relative max-w-3xl max-h-[85vh] p-2 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200" 
            onClick={e => e.stopPropagation()}
          >
            <img src={lightboxImage} alt="Product Zoom" className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-sm" />
            <button 
              onClick={() => setLightboxImage(null)}
              className="absolute -top-3 -right-3 h-8 w-8 flex items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-lg"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
