'use client'

import React, { useState, useTransition, useEffect } from 'react'
import { createClient as createBrowserClient } from '@/supabase/client'
import { useSearchParams, useRouter } from 'next/navigation'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  toggleApprovalAction,
  updateUserRoleAndDeptAction,
  deleteUserAction,
  createUserAction,
  createSupplierAction,
  saveUserMappingAction,
  deleteUserMappingAction,
} from './actions'
import {
  bulkImportSuppliersAction,
  deleteSuppliersBatchAction,
} from '../sourcing/actions'
import {
  Users2,
  Check,
  X,
  ShieldAlert,
  Loader2,
  UserCheck,
  UserX,
  Shield,
  Briefcase,
  Database,
  Trash2,
  AlertCircle,
  Plus,
  Search,
  Eye,
  Mail,
  Phone,
  MapPin,
  Calendar,
  FileText,
  Award,
  Globe,
  User,
  Upload,
  ChevronDown,
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
  return lines.filter((r) => r.length > 0 && r.some((cell) => cell !== ''))
}

interface DatabaseProfile {
  id: string
  email: string
  role: string
  department: string
  is_approved: boolean
  updated_at: string
}

interface SheetsUserMapping {
  sheets_user_id: string
  sourcing_email: string
  notes?: string
  created_at?: string
}

interface ManagementClientProps {
  initialProfiles: DatabaseProfile[]
  initialSuppliers: any[]
  initialLogs?: any[]
  initialUserMappings?: SheetsUserMapping[]
  discoveredUserIds?: string[]
  sheetsProfiles?: any[]
}

const roleOptions = [
  { value: 'admin', label: 'Admin' },
  { value: 'boss', label: 'Boss' },
  { value: 'staff', label: 'Staff' },
]

const departmentOptions = [
  { value: 'all', label: 'All Departments' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'orders', label: 'Order Management' },
  { value: 'sourcing', label: 'Sourcing Management' },
  { value: 'audit', label: 'Quality Control' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'logistics', label: 'Logistics & Inventory' },
  { value: 'production', label: 'Production' },
]

export function ManagementClient({
  initialProfiles,
  initialSuppliers,
  initialLogs = [],
  initialUserMappings = [],
  discoveredUserIds = [],
  sheetsProfiles = [],
}: ManagementClientProps) {
  const [profiles, setProfiles] = useState<DatabaseProfile[]>(initialProfiles)
  const [suppliers, setSuppliers] = useState<any[]>(initialSuppliers)
  const [logs, setLogs] = useState<any[]>(initialLogs)
  const [userMappings, setUserMappings] =
    useState<SheetsUserMapping[]>(initialUserMappings)

  const [selectedMappingEmails, setSelectedMappingEmails] = useState<
    Record<string, string>
  >({})
  const [notesInput, setNotesInput] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const [prevInitialUserMappings, setPrevInitialUserMappings] =
    useState(initialUserMappings)
  if (initialUserMappings !== prevInitialUserMappings) {
    setPrevInitialUserMappings(initialUserMappings)
    setUserMappings(initialUserMappings)
  }

  const [prevInitialProfiles, setPrevInitialProfiles] =
    useState(initialProfiles)
  if (initialProfiles !== prevInitialProfiles) {
    setPrevInitialProfiles(initialProfiles)
    setProfiles(initialProfiles)
  }

  const [prevInitialSuppliers, setPrevInitialSuppliers] =
    useState(initialSuppliers)
  if (initialSuppliers !== prevInitialSuppliers) {
    setPrevInitialSuppliers(initialSuppliers)
    setSuppliers(initialSuppliers)
  }

  const [prevInitialLogs, setPrevInitialLogs] = useState(initialLogs)
  if (initialLogs !== prevInitialLogs) {
    setPrevInitialLogs(initialLogs)
    setLogs(initialLogs)
  }

  const [isPending, startTransition] = useTransition()
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Subtab States
  const searchParams = useSearchParams()
  const subtabParam = searchParams.get('subtab')
  const [subtab, setSubtab] = useState<
    'system' | 'supplier-logs' | 'sheets-mapping'
  >(() => {
    if (subtabParam === 'supplier-logs') return 'supplier-logs'
    if (subtabParam === 'sheets-mapping') return 'sheets-mapping'
    return 'system'
  })

  const [prevSubtabParam, setPrevSubtabParam] = useState(subtabParam)
  if (subtabParam !== prevSubtabParam) {
    setPrevSubtabParam(subtabParam)
    setSubtab(
      subtabParam === 'supplier-logs'
        ? 'supplier-logs'
        : subtabParam === 'sheets-mapping'
          ? 'sheets-mapping'
          : 'system',
    )
  }

  // Helper to get Sheets User display name
  const getSheetsUserDisplayName = (sheetsUserId: string) => {
    const profile = sheetsProfiles.find((p) => p.id === sheetsUserId)
    if (profile) {
      const name = profile.full_name || profile.username || 'Unnamed'
      const username = profile.username ? `@${profile.username}` : ''
      return username ? `${name} (${username})` : name
    }
    return sheetsUserId
  }

  useEffect(() => {
    const supabase = createBrowserClient()

    const channel = supabase
      .channel('supplier_profile_logs_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_activities',
        },
        (payload) => {
          const newActivity = payload.new
          if (
            newActivity.activity_text &&
            newActivity.activity_text.startsWith('Supplier Profile')
          ) {
            setLogs((prev) => [{ ...newActivity, type: 'activity' }, ...prev])
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'supplier_product_history',
        },
        async (payload) => {
          const newLog = payload.new
          let supplierName = 'Unknown'
          try {
            const { data } = await supabase
              .from('suppliers')
              .select('name')
              .eq('id', newLog.supplier_id)
              .single()
            if (data) {
              supplierName = data.name
            }
          } catch (e) {
            console.error('Error fetching supplier name for realtime log:', e)
          }

          setLogs((prev) => [
            {
              id: newLog.id,
              type: 'product_history',
              event_type: newLog.event_type,
              product_name: newLog.product_name,
              price: newLog.price,
              created_at: newLog.created_at,
              created_by: newLog.created_by,
              supplier_name: supplierName,
            },
            ...prev,
          ])
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  // Supplier Search & Modal States
  const [supplierSearch, setSupplierSearch] = useState('')

  // Supplier Directory Manage & Batch Delete States
  const [isManageMode, setIsManageMode] = useState(false)
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([])
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
  const [isDeletingBatch, setIsDeletingBatch] = useState(false)

  // CSV Import States
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importTab, setImportTab] = useState<'file' | 'paste'>('file')
  const [csvPreview, setCsvPreview] = useState<any[]>([])
  const [pasteText, setPasteText] = useState('')
  const [pastePreview, setPastePreview] = useState<any[]>([])
  const [importStatus, setImportStatus] = useState<string | null>(null)
  const [pasteImportStatus, setPasteImportStatus] = useState<string | null>(
    null,
  )
  const [pasteErrorMessage, setPasteErrorMessage] = useState<string | null>(
    null,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isPasteImporting, setIsPasteImporting] = useState(false)

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
          setErrorMessage(
            'CSV file must contain a header row and at least one data row.',
          )
          return
        }

        const headers = rawRows[0].map((h) =>
          h
            .toLowerCase()
            .trim()
            .replace(/['"_\s]+/g, ''),
        )

        const colMap = {
          supplierName: headers.indexOf('suppliername'),
          email: headers.indexOf('email'),
          phone: headers.indexOf('phone'),
          address: headers.indexOf('address'),
          website: headers.indexOf('website'),
          contactPerson: headers.indexOf('contactperson'),
          taxId: headers.indexOf('taxid'),
          businessType: headers.indexOf('businesstype'),
          productName:
            headers.indexOf('productname') !== -1
              ? headers.indexOf('productname')
              : headers.indexOf('product'),
          quotedPrice:
            headers.indexOf('quotedprice') !== -1
              ? headers.indexOf('quotedprice')
              : headers.indexOf('price'),
          leadTime:
            headers.indexOf('leadtime') !== -1
              ? headers.indexOf('leadtime')
              : headers.indexOf('leadtimedays'),
        }

        if (colMap.supplierName === -1)
          colMap.supplierName = headers.findIndex(
            (h) => h.includes('supplier') || h.includes('name'),
          )
        if (colMap.email === -1) colMap.email = headers.indexOf('email')
        if (colMap.phone === -1) colMap.phone = headers.indexOf('phone')
        if (colMap.address === -1) colMap.address = headers.indexOf('address')
        if (colMap.website === -1)
          colMap.website = headers.findIndex(
            (h) => h.includes('website') || h.includes('site'),
          )
        if (colMap.contactPerson === -1)
          colMap.contactPerson = headers.findIndex(
            (h) => h.includes('contact') || h.includes('representative'),
          )
        if (colMap.taxId === -1)
          colMap.taxId = headers.findIndex(
            (h) => h.includes('tax') || h.includes('reg'),
          )
        if (colMap.businessType === -1)
          colMap.businessType = headers.findIndex(
            (h) => h.includes('business') || h.includes('type'),
          )
        if (colMap.productName === -1)
          colMap.productName = headers.findIndex(
            (h) => h.includes('product') || h.includes('item'),
          )
        if (colMap.quotedPrice === -1)
          colMap.quotedPrice = headers.findIndex(
            (h) => h.includes('price') || h.includes('quoted'),
          )
        if (colMap.leadTime === -1)
          colMap.leadTime = headers.findIndex(
            (h) =>
              h.includes('lead') || h.includes('time') || h.includes('days'),
          )

        if (colMap.supplierName === -1) colMap.supplierName = 0
        if (colMap.email === -1) colMap.email = 1
        if (colMap.phone === -1) colMap.phone = 2
        if (colMap.address === -1) colMap.address = 3
        if (colMap.website === -1) colMap.website = -1
        if (colMap.contactPerson === -1) colMap.contactPerson = -1
        if (colMap.taxId === -1) colMap.taxId = -1
        if (colMap.businessType === -1) colMap.businessType = -1
        if (colMap.productName === -1) colMap.productName = 4
        if (colMap.quotedPrice === -1) colMap.quotedPrice = 5
        if (colMap.leadTime === -1) colMap.leadTime = 6

        const parsedData = rawRows
          .slice(1)
          .map((row) => {
            const getValue = (idx: number) =>
              idx !== -1 && idx < row.length ? row[idx] : ''

            const supplierName = getValue(colMap.supplierName)
            const email = getValue(colMap.email)
            const phone = getValue(colMap.phone)
            const address = getValue(colMap.address)
            const website = getValue(colMap.website)
            const contactPerson = getValue(colMap.contactPerson)
            const taxId = getValue(colMap.taxId)
            const businessType = getValue(colMap.businessType)
            const productName = getValue(colMap.productName)
            const quotedPriceStr = getValue(colMap.quotedPrice)
            const leadTimeStr = getValue(colMap.leadTime)

            // Price: strip dollar sign, parse as float
            const cleanPriceStr = quotedPriceStr
              ? quotedPriceStr.replace(/[^0-9.]/g, '')
              : '0'
            const quotedPrice = parseFloat(cleanPriceStr) || 0

            // Lead Time: strip non-numeric characters, parse as integer
            const cleanLeadTimeStr = leadTimeStr
              ? leadTimeStr.replace(/[^0-9]/g, '')
              : '0'
            const leadTime = parseInt(cleanLeadTimeStr) || 0

            return {
              supplierName,
              email,
              phone,
              address,
              website,
              contactPerson,
              taxId,
              businessType,
              productName,
              quotedPrice,
              leadTime,
            }
          })
          .filter((item) => item.supplierName !== '')

        setCsvPreview(parsedData)
        setImportStatus(null)
      } catch (err: any) {
        setErrorMessage('Failed to parse CSV file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  const handleClipboardPaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => {
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
      const rawRows = text
        .split(/\r?\n/)
        .map((row) => row.split('\t').map((cell) => cell.trim()))
      const validRows = rawRows.filter(
        (r) => r.length > 0 && r.some((cell) => cell !== ''),
      )

      if (validRows.length === 0) {
        setPastePreview([])
        return
      }

      // Check if the first row is a header row
      const firstRow = validRows[0]
      const lowercaseFirstRow = firstRow.map((cell) =>
        cell
          .toLowerCase()
          .trim()
          .replace(/['"_\s]+/g, ''),
      )

      const hasHeaderIndicators = lowercaseFirstRow.some(
        (h) =>
          h.includes('supplier') ||
          h.includes('name') ||
          h.includes('email') ||
          h.includes('product') ||
          h.includes('item') ||
          h.includes('price') ||
          h.includes('quoted') ||
          h.includes('lead') ||
          h.includes('time') ||
          h.includes('days'),
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
        website: -1,
        contactPerson: -1,
        taxId: -1,
        businessType: -1,
      }

      if (hasHeaderIndicators) {
        dataRows = validRows.slice(1)
        colMap = {
          supplierName: lowercaseFirstRow.findIndex(
            (h) => h.includes('supplier') || h.includes('name'),
          ),
          email: lowercaseFirstRow.indexOf('email'),
          productName: lowercaseFirstRow.findIndex(
            (h) => h.includes('product') || h.includes('item'),
          ),
          quotedPrice: lowercaseFirstRow.findIndex(
            (h) => h.includes('price') || h.includes('quoted'),
          ),
          leadTime: lowercaseFirstRow.findIndex(
            (h) =>
              h.includes('lead') || h.includes('time') || h.includes('days'),
          ),
          phone: lowercaseFirstRow.indexOf('phone'),
          address: lowercaseFirstRow.indexOf('address'),
          website: lowercaseFirstRow.findIndex(
            (h) => h.includes('website') || h.includes('site'),
          ),
          contactPerson: lowercaseFirstRow.findIndex(
            (h) => h.includes('contact') || h.includes('representative'),
          ),
          taxId: lowercaseFirstRow.findIndex(
            (h) => h.includes('tax') || h.includes('reg'),
          ),
          businessType: lowercaseFirstRow.findIndex(
            (h) => h.includes('business') || h.includes('type'),
          ),
        }

        // Fallbacks if not found
        if (colMap.supplierName === -1) colMap.supplierName = 0
        if (colMap.email === -1) colMap.email = 1
        if (colMap.productName === -1) colMap.productName = 2
        if (colMap.quotedPrice === -1) colMap.quotedPrice = 3
        if (colMap.leadTime === -1) colMap.leadTime = 4
      }

      const parsedData = dataRows
        .map((row) => {
          const getValue = (idx: number) =>
            idx !== -1 && idx < row.length ? row[idx] : ''

          const supplierName = getValue(colMap.supplierName)
          const email = getValue(colMap.email)
          const phone = getValue(colMap.phone)
          const address = getValue(colMap.address)
          const website = getValue(colMap.website)
          const contactPerson = getValue(colMap.contactPerson)
          const taxId = getValue(colMap.taxId)
          const businessType = getValue(colMap.businessType)
          const productName = getValue(colMap.productName)
          const quotedPriceStr = getValue(colMap.quotedPrice)
          const leadTimeStr = getValue(colMap.leadTime)

          // Price: strip dollar sign, parse as float
          const cleanPriceStr = quotedPriceStr
            ? quotedPriceStr.replace(/[^0-9.]/g, '')
            : '0'
          const quotedPrice = parseFloat(cleanPriceStr) || 0

          // Lead Time: strip non-numeric characters, parse as integer
          const cleanLeadTimeStr = leadTimeStr
            ? leadTimeStr.replace(/[^0-9]/g, '')
            : '0'
          const leadTime = parseInt(cleanLeadTimeStr) || 0

          return {
            supplierName,
            email,
            phone,
            address,
            website,
            contactPerson,
            taxId,
            businessType,
            productName,
            quotedPrice,
            leadTime,
          }
        })
        .filter((item) => item.supplierName !== '')

      setPastePreview(parsedData)
      setPasteErrorMessage(null)
    } catch (err: any) {
      setPasteErrorMessage('Failed to parse clipboard data: ' + err.message)
    }
  }

  // Create User States
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('1')
  const [newRole, setNewRole] = useState('staff')
  const [newDept, setNewDept] = useState('orders')
  const [addError, setAddError] = useState<string | null>(null)
  const [isCreatingUser, setIsCreatingUser] = useState(false)

  // Create Supplier States
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierEmail, setSupplierEmail] = useState('')
  const [supplierPhone, setSupplierPhone] = useState('')
  const [supplierAddress, setSupplierAddress] = useState('')
  const [supplierWebsite, setSupplierWebsite] = useState('')
  const [supplierContactPerson, setSupplierContactPerson] = useState('')
  const [supplierTaxId, setSupplierTaxId] = useState('')
  const [supplierMainProducts, setSupplierMainProducts] = useState('')
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false)
  const [supplierError, setSupplierError] = useState<string | null>(null)

  const handleCreateSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supplierName.trim()) {
      setSupplierError('Supplier name is required.')
      return
    }

    setIsCreatingSupplier(true)
    setSupplierError(null)

    const res = await createSupplierAction({
      name: supplierName,
      email: supplierEmail,
      phone: supplierPhone,
      address: supplierAddress,
      website: supplierWebsite,
      contactPerson: supplierContactPerson,
      taxId: supplierTaxId,
      mainProducts: supplierMainProducts,
    })

    setIsCreatingSupplier(false)
    if (res.success && res.supplier) {
      setSuppliers((prev) =>
        [res.supplier, ...prev].sort((a, b) => a.name.localeCompare(b.name)),
      )
      setIsAddSupplierOpen(false)
      // Reset form
      setSupplierName('')
      setSupplierEmail('')
      setSupplierPhone('')
      setSupplierAddress('')
      setSupplierWebsite('')
      setSupplierContactPerson('')
      setSupplierTaxId('')
      setSupplierMainProducts('')
      setMessage({
        type: 'success',
        text: `Supplier "${res.supplier.name}" created successfully.`,
      })
    } else {
      setSupplierError(res.error || 'Failed to create supplier.')
    }
  }

  const router = useRouter()

  const handleConfirmBatchDelete = async () => {
    setIsDeletingBatch(true)
    const res = await deleteSuppliersBatchAction(selectedSupplierIds)
    setIsDeletingBatch(false)
    setIsBulkDeleteConfirmOpen(false)

    if (res.success) {
      setSuppliers((prev) =>
        prev.filter((s) => !selectedSupplierIds.includes(s.id)),
      )
      setSelectedSupplierIds([])
      setIsManageMode(false)
      setMessage({
        type: 'success',
        text: `Successfully deleted ${selectedSupplierIds.length} suppliers.`,
      })
    } else {
      setMessage({
        type: 'error',
        text: res.error || 'Failed to delete suppliers.',
      })
    }
  }

  const handleConfirmCsvImport = async () => {
    setIsImporting(true)
    setErrorMessage(null)
    setImportStatus(null)

    const res = await bulkImportSuppliersAction(csvPreview, 'overwrite')
    setIsImporting(false)

    if (res.success) {
      setImportStatus(`Imported ${res.importedSuppliersCount} suppliers.`)
      router.refresh()
      setTimeout(() => {
        setIsImportOpen(false)
        setCsvPreview([])
      }, 2000)
    } else {
      setErrorMessage(res.error || 'Import failed.')
    }
  }

  const handleConfirmPasteImport = async () => {
    setIsPasteImporting(true)
    setPasteErrorMessage(null)
    setPasteImportStatus(null)

    const res = await bulkImportSuppliersAction(pastePreview, 'overwrite')
    setIsPasteImporting(false)

    if (res.success) {
      setPasteImportStatus(`Imported ${res.importedSuppliersCount} suppliers.`)
      router.refresh()
      setTimeout(() => {
        setIsImportOpen(false)
        setPastePreview([])
        setPasteText('')
      }, 2000)
    } else {
      setPasteErrorMessage(res.error || 'Import failed.')
    }
  }

  const handleToggleApproval = (id: string, targetStatus: boolean) => {
    setUpdatingId(id)
    setMessage(null)

    startTransition(async () => {
      const res = await toggleApprovalAction(id, targetStatus)
      if (res.success) {
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, is_approved: targetStatus } : p,
          ),
        )
        setMessage({
          type: 'success',
          text: 'Approval status updated successfully.',
        })
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Failed to update approval status.',
        })
      }
      setUpdatingId(null)
    })
  }

  const handleRoleDeptChange = (id: string, role: string, dept: string) => {
    setUpdatingId(id)
    setMessage(null)

    startTransition(async () => {
      const res = await updateUserRoleAndDeptAction(id, role, dept)
      if (res.success) {
        setProfiles((prev) =>
          prev.map((p) => (p.id === id ? { ...p, role, department: dept } : p)),
        )
        setMessage({
          type: 'success',
          text: 'User permissions updated successfully.',
        })
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Failed to update user permissions.',
        })
      }
      setUpdatingId(null)
    })
  }

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError(null)
    setIsCreatingUser(true)

    try {
      const finalDept = newRole === 'staff' ? newDept : 'all'
      const res = await createUserAction(
        newEmail,
        newPassword,
        newRole,
        finalDept,
      )
      if (res.success) {
        const newUser: DatabaseProfile = {
          id: res.userId!,
          email: newEmail,
          role: newRole,
          department: finalDept,
          is_approved: true,
          updated_at: new Date().toISOString(),
        }
        setProfiles((prev) =>
          [...prev, newUser].sort((a, b) => a.email.localeCompare(b.email)),
        )
        setMessage({
          type: 'success',
          text: `Account for ${newEmail} created successfully.`,
        })
        setIsAddUserOpen(false)
        setNewEmail('')
        setNewPassword('1')
        setNewRole('staff')
        setNewDept('orders')
      } else {
        setAddError(res.error || 'Failed to create user account.')
      }
    } catch (err: any) {
      setAddError(err.message || 'An error occurred.')
    } finally {
      setIsCreatingUser(false)
    }
  }

  const handleDeleteUser = () => {
    if (!confirmDeleteId) return
    const idToDelete = confirmDeleteId
    setConfirmDeleteId(null)
    setUpdatingId(idToDelete)
    setMessage(null)

    startTransition(async () => {
      const res = await deleteUserAction(idToDelete)
      if (res.success) {
        setProfiles((prev) => prev.filter((p) => p.id !== idToDelete))
        setMessage({
          type: 'success',
          text: 'User account deleted successfully.',
        })
      } else {
        setMessage({
          type: 'error',
          text: res.error || 'Failed to delete user account.',
        })
      }
      setUpdatingId(null)
    })
  }

  const handleSaveMapping = async (sheetsUserId: string) => {
    const email = selectedMappingEmails[sheetsUserId] || ''
    if (!email) {
      alert('Please select a Sourcing Hub profile email to link.')
      return
    }

    setSavingId(sheetsUserId)
    setMessage(null)

    const note = notesInput[sheetsUserId] || ''
    const res = await saveUserMappingAction(sheetsUserId, email, note)
    setSavingId(null)

    if (res.success) {
      setUserMappings((prev) => {
        const idx = prev.findIndex((m) => m.sheets_user_id === sheetsUserId)
        const updated = {
          sheets_user_id: sheetsUserId,
          sourcing_email: email,
          notes: note,
          created_at: new Date().toISOString(),
        }
        if (idx !== -1) {
          const next = [...prev]
          next[idx] = updated
          return next
        }
        return [updated, ...prev]
      })
      setMessage({
        type: 'success',
        text: `Successfully linked Sheets User ID "${sheetsUserId}" to "${email}".`,
      })
    } else {
      setMessage({
        type: 'error',
        text: res.error || 'Failed to save mapping.',
      })
    }
  }

  const handleDeleteMapping = async (sheetsUserId: string) => {
    if (
      !confirm(
        'Are you sure you want to remove this mapping? This user will sync as sheets-sync@transformerrobotics.com.',
      )
    ) {
      return
    }

    setDeletingId(sheetsUserId)
    setMessage(null)

    const res = await deleteUserMappingAction(sheetsUserId)
    setDeletingId(null)

    if (res.success) {
      setUserMappings((prev) =>
        prev.filter((m) => m.sheets_user_id !== sheetsUserId),
      )
      setMessage({ type: 'success', text: 'Mapping deleted successfully.' })
    } else {
      setMessage({
        type: 'error',
        text: res.error || 'Failed to delete mapping.',
      })
    }
  }

  const filteredSuppliers = suppliers.filter((s) => {
    const q = supplierSearch.toLowerCase()
    return (
      (s.name || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`animate-in fade-in flex max-w-xl items-center gap-2 rounded-xl border p-3 text-xs font-semibold duration-200 ${
            message.type === 'success'
              ? 'border-emerald-100/30 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20'
              : 'border-rose-100/30 bg-rose-50 text-rose-600 dark:bg-rose-950/20'
          }`}
        >
          {message.type === 'success' ? (
            <Check size={14} />
          ) : (
            <ShieldAlert size={14} />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <Tabs value={subtab} className="w-full space-y-6">
        <TabsContent
          value="system"
          className="mt-0 space-y-6 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <Card className="border-slate-200/60 shadow-sm dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <Users2 size={18} className="text-[#5c59e9]" />
                  <span>Authorized System Profiles</span>
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  A list of all users registered. Approved users can log in to
                  their assigned tabs.
                </CardDescription>
              </div>
              <Button
                onClick={() => setIsAddUserOpen(true)}
                size="sm"
                className="h-8 cursor-pointer gap-1.5 rounded-lg bg-[#5c59e9] px-3 text-xs font-semibold text-white hover:bg-[#4a47d2]"
              >
                <Plus size={14} />
                <span>Add User</span>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {profiles.length === 0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-12 text-center">
                  <Users2
                    size={36}
                    className="text-slate-200 dark:text-slate-700"
                  />
                  <p className="text-sm font-medium text-slate-400">
                    No registered profiles found
                  </p>
                </div>
              ) : (
                <div className="min-h-[300px] overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold tracking-wider text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-900/50">
                        <th className="px-6 py-4">User Email</th>
                        <th className="px-6 py-4">System Role</th>
                        <th className="px-6 py-4">Assigned Department</th>
                        <th className="px-6 py-4 text-center">Status</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                      {profiles.map((profile) => {
                        const isUpdating = updatingId === profile.id
                        return (
                          <tr
                            key={profile.id}
                            className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20"
                          >
                            {/* Email */}
                            <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                              {profile.email}
                            </td>

                            {/* Role dropdown */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <Shield size={12} className="text-slate-400" />
                                <select
                                  value={profile.role}
                                  disabled={isUpdating || isPending}
                                  onChange={(e) => {
                                    const nextRole = e.target.value
                                    let nextDept = profile.department
                                    if (
                                      nextRole === 'staff' &&
                                      (nextDept === 'all' ||
                                        nextDept === 'dashboard')
                                    ) {
                                      nextDept = 'orders'
                                    } else if (nextRole === 'boss') {
                                      nextDept = 'dashboard'
                                    } else if (nextRole === 'admin') {
                                      nextDept = 'all'
                                    }
                                    handleRoleDeptChange(
                                      profile.id,
                                      nextRole,
                                      nextDept,
                                    )
                                  }}
                                  className="dark:bg-slate-955/50 h-8 cursor-pointer rounded-lg border border-slate-200 bg-white/50 px-2.5 text-xs font-medium text-slate-800 focus:ring-1 focus:ring-[#5c59e9]/30 focus:outline-none disabled:opacity-50 dark:border-slate-800"
                                >
                                  {roleOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>

                            {/* Department dropdown */}
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5">
                                <Briefcase
                                  size={12}
                                  className="text-slate-400"
                                />
                                <select
                                  value={profile.department}
                                  disabled={
                                    isUpdating ||
                                    isPending ||
                                    profile.role !== 'staff'
                                  }
                                  onChange={(e) =>
                                    handleRoleDeptChange(
                                      profile.id,
                                      profile.role,
                                      e.target.value,
                                    )
                                  }
                                  className="dark:bg-slate-955/50 h-8 cursor-pointer rounded-lg border border-slate-200 bg-white/50 px-2.5 text-xs font-medium text-slate-800 focus:ring-1 focus:ring-[#5c59e9]/30 focus:outline-none disabled:opacity-50 dark:border-slate-800"
                                >
                                  {departmentOptions
                                    .filter((opt) => {
                                      if (profile.role === 'staff') {
                                        return (
                                          opt.value !== 'all' &&
                                          opt.value !== 'dashboard'
                                        )
                                      }
                                      if (profile.role === 'boss') {
                                        return opt.value === 'dashboard'
                                      }
                                      if (profile.role === 'admin') {
                                        return opt.value === 'all'
                                      }
                                      return true
                                    })
                                    .map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </td>

                            {/* Status Badge */}
                            <td className="px-6 py-4 text-center">
                              {profile.is_approved ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-400"
                                >
                                  Approved
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="dark:bg-amber-955/30 rounded-full border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-900/60 dark:text-amber-400"
                                >
                                  Pending Approval
                                </Badge>
                              )}
                            </td>

                            {/* Toggle Approval and Delete Buttons */}
                            <td className="px-6 py-4 text-right font-semibold">
                              <div className="flex items-center justify-end gap-2">
                                {profile.is_approved ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={isUpdating || isPending}
                                    onClick={() =>
                                      handleToggleApproval(profile.id, false)
                                    }
                                    className="dark:border-slate-855 h-8 cursor-pointer gap-1 border-slate-200 px-2.5 text-amber-600 hover:bg-amber-50/30 hover:text-amber-700"
                                  >
                                    {isUpdating && updatingId === profile.id ? (
                                      <Loader2
                                        size={12}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <UserX size={12} />
                                    )}
                                    <span>Revoke</span>
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    disabled={isUpdating || isPending}
                                    onClick={() =>
                                      handleToggleApproval(profile.id, true)
                                    }
                                    className="h-8 cursor-pointer gap-1 bg-emerald-600 px-2.5 text-white hover:bg-emerald-500"
                                  >
                                    {isUpdating && updatingId === profile.id ? (
                                      <Loader2
                                        size={12}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <UserCheck size={12} />
                                    )}
                                    <span>Approve</span>
                                  </Button>
                                )}

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  disabled={isUpdating || isPending}
                                  onClick={() => setConfirmDeleteId(profile.id)}
                                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50/50 hover:text-rose-700 dark:hover:bg-rose-950/20"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
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

        <TabsContent
          value="supplier-logs"
          className="mt-0 space-y-6 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <Card className="border-slate-200/60 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <Database size={18} className="text-[#5c59e9]" />
                  <span>Supplier Profile Change Logs</span>
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Audit log trail of all modifications made to supplier profiles
                  across the platform.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {logs.length === 0 ? (
                <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 p-12 text-center">
                  <Database
                    size={36}
                    className="text-slate-200 dark:text-slate-700"
                  />
                  <span className="text-xs font-medium text-slate-400">
                    No supplier changes recorded yet.
                  </span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 font-extrabold tracking-wider text-slate-400 uppercase dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-500">
                        <th className="w-[180px] px-5 py-3">Date/Time</th>
                        <th className="w-[200px] px-5 py-3">Supplier Name</th>
                        <th className="px-5 py-3">Details</th>
                        <th className="w-[220px] px-5 py-3">Updated By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {logs.map((log) => {
                        let supplierName = 'Unknown'
                        let actor = 'System'
                        let details = ''

                        if (log.type === 'product_history') {
                          supplierName = log.supplier_name || 'Unknown'
                          actor = log.created_by || 'System'
                          if (log.event_type === 'PROFILE_UPDATE') {
                            details = 'Supplier profile fields were updated'
                          } else if (log.event_type === 'CAPABILITY_CREATE') {
                            details = `Product Added: ${log.product_name}${log.price > 0 ? ` (Price: $${log.price})` : ''}`
                          } else if (log.event_type === 'CAPABILITY_UPDATE') {
                            details = `Product Updated: ${log.product_name}${log.price > 0 ? ` (Price: $${log.price})` : ''}`
                          } else if (log.event_type === 'CAPABILITY_DELETE') {
                            details = `Product Deleted: ${log.product_name}`
                          } else {
                            details = `${log.event_type}: ${log.product_name}`
                          }
                        } else {
                          // Standard activity log
                          const match = log.activity_text
                            ? log.activity_text.match(
                                /Supplier Profile (Created|Updated|Deleted): Supplier "([^"]+)" \(ID: ([^)]+)\) was (created|updated|deleted) by ([^\s]+)/,
                              )
                            : null

                          details = log.activity_text || ''

                          if (match) {
                            supplierName = match[2]
                            actor = match[5].replace(/\.$/, '') // strip trailing period
                            const eventType = match[1]
                            if (eventType === 'Created') {
                              details = 'New supplier profile was created'
                            } else if (eventType === 'Updated') {
                              details = 'Supplier profile fields were updated'
                            } else if (eventType === 'Deleted') {
                              details = 'Supplier profile was deleted'
                            }
                          }
                        }

                        const dateStr = new Date(log.created_at).toLocaleString(
                          'en-US',
                          {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          },
                        )

                        return (
                          <tr
                            key={log.id}
                            className="dark:hover:bg-slate-850/10 transition-colors hover:bg-slate-50/50"
                          >
                            <td className="px-5 py-3 font-medium text-slate-500 dark:text-slate-400">
                              <span className="flex items-center gap-1.5">
                                <Calendar
                                  size={12}
                                  className="text-slate-400"
                                />
                                {dateStr}
                              </span>
                            </td>
                            <td className="px-5 py-3 font-bold text-slate-900 dark:text-white">
                              {supplierName}
                            </td>
                            <td className="px-5 py-3 font-medium text-slate-600 dark:text-slate-300">
                              {details}
                            </td>
                            <td className="text-slate-550 px-5 py-3 font-semibold dark:text-slate-400">
                              <span className="flex items-center gap-1.5">
                                <User size={12} className="text-slate-400" />
                                {actor}
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

        <TabsContent
          value="sheets-mapping"
          className="mt-0 space-y-6 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <Card className="border-slate-200/60 shadow-sm dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <Database size={18} className="text-[#5c59e9]" />
                  <span>Sheets User Integration Mapping</span>
                </CardTitle>
                <CardDescription className="mt-0.5 text-xs">
                  Link Sheets App user accounts (by their UUIDs) to Sourcing Hub
                  profiles to attribute synced suppliers correctly.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Unmapped Discovered Accounts Alert */}
              {(() => {
                const unmappedDiscoveredIds = discoveredUserIds.filter(
                  (id) => !userMappings.some((m) => m.sheets_user_id === id),
                )
                if (unmappedDiscoveredIds.length === 0) return null
                return (
                  <div className="dark:bg-amber-955/20 flex items-start gap-3 border-b border-amber-100 bg-amber-50 p-4 dark:border-amber-900/30">
                    <AlertCircle className="dark:text-amber-455 mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400">
                        Discovered {unmappedDiscoveredIds.length} Unmapped
                        Sheets User Account(s)
                      </h4>
                      <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-500">
                        The webhook has recently received uploads from the
                        following Sheets User IDs, but they are not linked to
                        any Sourcing Hub account yet.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {unmappedDiscoveredIds.map((id) => (
                          <Badge
                            key={id}
                            variant="outline"
                            className="border-amber-200 bg-white text-[10px] font-semibold text-amber-700 dark:border-amber-900 dark:bg-slate-900 dark:text-amber-400"
                          >
                            {getSheetsUserDisplayName(id)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Add New Custom Mapping Form */}
              <div className="border-b border-slate-100 bg-slate-50/50 p-6 dark:border-slate-800 dark:bg-slate-900/10">
                <h3 className="mb-3 text-xs font-bold tracking-wider text-slate-800 uppercase dark:text-slate-200">
                  Create New Manual Mapping
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fd = new FormData(e.currentTarget)
                    const sheetsId = (fd.get('sheets_id') as string) || ''
                    const email = (fd.get('email') as string) || ''
                    const note = (fd.get('note') as string) || ''
                    if (!sheetsId.trim() || !email.trim()) {
                      alert(
                        'Sheets User ID and Sourcing Hub email are required.',
                      )
                      return
                    }
                    setSelectedMappingEmails((prev) => ({
                      ...prev,
                      [sheetsId]: email,
                    }))
                    setNotesInput((prev) => ({ ...prev, [sheetsId]: note }))
                    handleSaveMapping(sheetsId)
                    e.currentTarget.reset()
                  }}
                  className="grid grid-cols-1 items-end gap-4 md:grid-cols-4"
                >
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="sheets_id"
                      className="text-[11px] font-bold text-slate-600 dark:text-slate-400"
                    >
                      Sheets User ID (UUID)
                    </Label>
                    <Input
                      id="sheets_id"
                      name="sheets_id"
                      placeholder="e.g. 6cede92c-ff9a..."
                      className="h-8.5 rounded-lg text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="email"
                      className="text-[11px] font-bold text-slate-600 dark:text-slate-400"
                    >
                      Sourcing Hub Profile
                    </Label>
                    <select
                      id="email"
                      name="email"
                      className="flex h-8.5 w-full cursor-pointer rounded-lg border border-slate-200 bg-white/50 px-3 py-1 text-xs shadow-sm transition-colors focus-visible:ring-1 focus-visible:ring-[#5c59e9] focus-visible:outline-none dark:border-slate-800 dark:bg-slate-950"
                      required
                    >
                      <option value="">Select an email...</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.email}>
                          {p.email} ({p.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="note"
                      className="text-[11px] font-bold text-slate-600 dark:text-slate-400"
                    >
                      Notes (User Name / Department)
                    </Label>
                    <Input
                      id="note"
                      name="note"
                      placeholder="e.g. Nguyen Van A - Sourcing Team"
                      className="h-8.5 rounded-lg text-xs"
                    />
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8.5 rounded-lg bg-[#5c59e9] text-xs font-semibold text-white hover:bg-[#4a47d2]"
                  >
                    Add Mapping
                  </Button>
                </form>
              </div>

              {/* Mapping List Table */}
              {userMappings.length === 0 &&
              discoveredUserIds.filter(
                (id) => !userMappings.some((m) => m.sheets_user_id === id),
              ).length === 0 ? (
                <div className="flex min-h-[250px] flex-col items-center justify-center gap-3 p-12 text-center">
                  <Database
                    size={36}
                    className="text-slate-200 dark:text-slate-700"
                  />
                  <span className="text-xs font-medium text-slate-400">
                    No account mappings created yet.
                  </span>
                </div>
              ) : (
                <div className="overflow-x-auto font-medium">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="dark:bg-slate-955/40 border-b border-slate-100 bg-slate-50 font-extrabold tracking-wider text-slate-400 uppercase dark:border-slate-800 dark:text-slate-500">
                        <th className="px-6 py-3.5">Sheets User ID (UUID)</th>
                        <th className="px-6 py-3.5">Sourcing Hub Account</th>
                        <th className="px-6 py-3.5">Notes</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {/* Render unmapped discovered user IDs first so they are easy to edit */}
                      {discoveredUserIds
                        .filter(
                          (id) =>
                            !userMappings.some((m) => m.sheets_user_id === id),
                        )
                        .map((id) => {
                          const isSaving = savingId === id
                          return (
                            <tr
                              key={id}
                              className="bg-amber-55/10 hover:bg-amber-55/20 dark:bg-amber-955/5 dark:hover:bg-amber-955/10"
                            >
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-0.5">
                                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500" />
                                    {getSheetsUserDisplayName(id)}
                                    <Badge
                                      variant="outline"
                                      className="scale-90 border-amber-200 bg-amber-50/50 px-1 py-0 text-[8px] text-amber-700"
                                    >
                                      Unlinked
                                    </Badge>
                                  </span>
                                  <span className="pl-3 font-mono text-[9px] text-slate-400">
                                    UUID: {id}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <select
                                  value={selectedMappingEmails[id] || ''}
                                  onChange={(e) =>
                                    setSelectedMappingEmails((prev) => ({
                                      ...prev,
                                      [id]: e.target.value,
                                    }))
                                  }
                                  className="h-8 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-950"
                                >
                                  <option value="">
                                    Select Sourcing Hub email...
                                  </option>
                                  {profiles.map((p) => (
                                    <option key={p.id} value={p.email}>
                                      {p.email}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-6 py-4">
                                <Input
                                  value={notesInput[id] || ''}
                                  onChange={(e) =>
                                    setNotesInput((prev) => ({
                                      ...prev,
                                      [id]: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. Sourcing Staff Name"
                                  className="h-8 w-48 rounded-lg text-xs"
                                />
                              </td>
                              <td className="px-6 py-4 text-right">
                                <Button
                                  size="sm"
                                  disabled={isSaving}
                                  onClick={() => handleSaveMapping(id)}
                                  className="h-8 cursor-pointer gap-1.5 rounded-lg bg-[#5c59e9] px-3 text-[11px] font-semibold text-white hover:bg-[#4a47d2]"
                                >
                                  {isSaving ? (
                                    <Loader2
                                      size={12}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Check size={12} />
                                  )}
                                  <span>Link Account</span>
                                </Button>
                              </td>
                            </tr>
                          )
                        })}

                      {/* Render existing mappings */}
                      {userMappings.map((mapping) => {
                        const id = mapping.sheets_user_id
                        const isSaving = savingId === id
                        const isDeleting = deletingId === id
                        const currentEmail =
                          selectedMappingEmails[id] !== undefined
                            ? selectedMappingEmails[id]
                            : mapping.sourcing_email
                        const currentNote =
                          notesInput[id] !== undefined
                            ? notesInput[id]
                            : mapping.notes || ''

                        return (
                          <tr
                            key={id}
                            className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/10"
                          >
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                  {getSheetsUserDisplayName(id)}
                                </span>
                                <span className="font-mono text-[9px] text-slate-400">
                                  UUID: {id}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={currentEmail}
                                onChange={(e) =>
                                  setSelectedMappingEmails((prev) => ({
                                    ...prev,
                                    [id]: e.target.value,
                                  }))
                                }
                                className="h-8 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 dark:border-slate-800 dark:bg-slate-950"
                              >
                                {profiles.map((p) => (
                                  <option key={p.id} value={p.email}>
                                    {p.email}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-6 py-4">
                              <Input
                                value={currentNote}
                                onChange={(e) =>
                                  setNotesInput((prev) => ({
                                    ...prev,
                                    [id]: e.target.value,
                                  }))
                                }
                                placeholder="Add notes..."
                                className="h-8 w-48 rounded-lg text-xs"
                              />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  disabled={isSaving || isDeleting}
                                  onClick={() => handleSaveMapping(id)}
                                  className="h-8 cursor-pointer gap-1.5 rounded-lg bg-indigo-50 px-3 text-[11px] font-semibold text-[#5c59e9] hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-400"
                                >
                                  {isSaving ? (
                                    <Loader2
                                      size={12}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Check size={12} />
                                  )}
                                  <span>Update</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={isSaving || isDeleting}
                                  onClick={() => handleDeleteMapping(id)}
                                  className="dark:hover:bg-rose-955/20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg p-0 text-rose-600 hover:bg-rose-50/50 hover:text-rose-700"
                                >
                                  {isDeleting ? (
                                    <Loader2
                                      size={12}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Trash2 size={14} />
                                  )}
                                </Button>
                              </div>
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
      </Tabs>

      {/* Delete User Confirmation Modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setConfirmDeleteId(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="dark:text-rose-455 mb-4 flex items-center gap-3 text-rose-600">
              <AlertCircle
                size={22}
                className="dark:text-rose-455 flex-shrink-0 text-rose-600"
              />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Delete User Account
              </h3>
            </div>

            <p className="mb-6 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Are you sure you want to permanently delete the account for{' '}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">
                {profiles.find((p) => p.id === confirmDeleteId)?.email}
              </strong>
              ? This action will remove all user records and access credentials.
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteId(null)}
                className="h-9 flex-1 cursor-pointer text-sm"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDeleteUser}
                className="h-9 flex-1 cursor-pointer gap-2 bg-rose-600 text-sm text-white hover:bg-rose-700"
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsAddUserOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Create User Account
              </h3>
              <button
                onClick={() => setIsAddUserOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="space-y-4">
              {addError && (
                <div className="dark:text-rose-455 flex items-center gap-2 rounded-xl border border-rose-100/30 bg-rose-50 p-3 text-xs font-medium text-rose-600 dark:bg-rose-950/20">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label
                  htmlFor="new-email"
                  className="text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Email Address
                </Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="name@transformerroboctic.com"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="h-9 rounded-xl border-slate-200/80 bg-white/50 text-xs focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="new-password"
                  className="text-xs font-bold text-slate-700 dark:text-slate-300"
                >
                  Password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Enter user password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-9 rounded-xl border-slate-200/80 bg-white/50 text-xs focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="new-role"
                    className="text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    System Role
                  </Label>
                  <select
                    id="new-role"
                    value={newRole}
                    onChange={(e) => {
                      const role = e.target.value
                      setNewRole(role)
                      if (role === 'boss') {
                        setNewDept('dashboard')
                      } else if (role === 'admin') {
                        setNewDept('all')
                      } else {
                        setNewDept('orders')
                      }
                    }}
                    className="h-9 w-full cursor-pointer rounded-xl border border-slate-200 bg-white/50 px-2.5 text-xs font-medium text-slate-800 focus:ring-1 focus:ring-[#5c59e9]/30 focus:outline-none dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    {roleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="new-dept"
                    className="text-xs font-bold text-slate-700 dark:text-slate-300"
                  >
                    Department
                  </Label>
                  <select
                    id="new-dept"
                    value={newDept}
                    disabled={newRole !== 'staff'}
                    onChange={(e) => setNewDept(e.target.value)}
                    className="h-9 w-full cursor-pointer rounded-xl border border-slate-200 bg-white/50 px-2.5 text-xs font-medium text-slate-800 focus:ring-1 focus:ring-[#5c59e9]/30 focus:outline-none disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950/50"
                  >
                    {departmentOptions
                      .filter((opt) => {
                        if (newRole === 'staff') {
                          return (
                            opt.value !== 'all' && opt.value !== 'dashboard'
                          )
                        }
                        if (newRole === 'boss') {
                          return opt.value === 'dashboard'
                        }
                        if (newRole === 'admin') {
                          return opt.value === 'all'
                        }
                        return true
                      })
                      .map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddUserOpen(false)}
                  className="h-9 flex-1 cursor-pointer text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingUser}
                  className="h-9 flex-1 cursor-pointer gap-2 bg-[#5c59e9] text-xs font-semibold text-white hover:bg-[#4a47d2]"
                >
                  {isCreatingUser && (
                    <Loader2 size={12} className="animate-spin" />
                  )}
                  <span>Create Account</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Supplier Modal */}
      {isAddSupplierOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setIsAddSupplierOpen(false)
              setSupplierError(null)
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Add Supplier
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Add a new supplier to the system
                </p>
              </div>
              <button
                onClick={() => {
                  setIsAddSupplierOpen(false)
                  setSupplierError(null)
                }}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={handleCreateSupplierSubmit}
              className="max-h-[85vh] space-y-4 overflow-y-auto p-6"
            >
              {supplierError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/25">
                  <AlertCircle
                    size={15}
                    className="mt-0.5 flex-shrink-0 text-red-500"
                  />
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {supplierError}
                  </span>
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="supplier-name"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Supplier Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="supplier-name"
                  placeholder="e.g. Viet My Woodworking Ltd"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="h-9 rounded-xl border-slate-200/80 bg-white/50 text-xs focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                  required
                />
              </div>

              {/* Contact Info (Grid) */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="supplier-email"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Email Address
                  </Label>
                  <Input
                    id="supplier-email"
                    type="email"
                    placeholder="contact@supplier.com"
                    value={supplierEmail}
                    onChange={(e) => setSupplierEmail(e.target.value)}
                    className="h-9 rounded-xl border-slate-200/80 bg-white/50 text-xs focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="supplier-phone"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Phone Number
                  </Label>
                  <Input
                    id="supplier-phone"
                    placeholder="+84 901 234 567"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    className="dark:bg-slate-955/50 h-9 rounded-xl border-slate-200/80 bg-white/50 text-xs focus:bg-white dark:border-slate-800"
                  />
                </div>
              </div>

              {/* Website / Contact Person (Grid) */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="supplier-website"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Website URL
                  </Label>
                  <Input
                    id="supplier-website"
                    placeholder="www.supplier.com"
                    value={supplierWebsite}
                    onChange={(e) => setSupplierWebsite(e.target.value)}
                    className="dark:bg-slate-955/50 h-9 rounded-xl border-slate-200/80 bg-white/50 text-xs focus:bg-white dark:border-slate-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="supplier-contact"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Contact Person
                  </Label>
                  <Input
                    id="supplier-contact"
                    placeholder="Nguyen Van A"
                    value={supplierContactPerson}
                    onChange={(e) => setSupplierContactPerson(e.target.value)}
                    className="dark:bg-slate-955/50 h-9 rounded-xl border-slate-200/80 bg-white/50 text-xs focus:bg-white dark:border-slate-800"
                  />
                </div>
              </div>

              {/* Main Product / Tax ID (Grid) */}
              <div className="grid grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="supplier-main-products"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Main Product
                  </Label>
                  <Input
                    id="supplier-main-products"
                    value={supplierMainProducts}
                    onChange={(e) => setSupplierMainProducts(e.target.value)}
                    className="dark:bg-slate-955/50 h-9 rounded-xl border-slate-200/80 bg-white/50 text-xs focus:bg-white dark:border-slate-800"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="supplier-tax"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Tax ID / Reg No.
                  </Label>
                  <Input
                    id="supplier-tax"
                    placeholder="Tax or business registration ID"
                    value={supplierTaxId}
                    onChange={(e) => setSupplierTaxId(e.target.value)}
                    className="dark:bg-slate-955/50 h-9 rounded-xl border-slate-200/80 bg-white/50 text-xs focus:bg-white dark:border-slate-800"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="supplier-address"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Factory / Office Address
                </Label>
                <textarea
                  id="supplier-address"
                  placeholder="e.g. 123 Industrial Zone, Binh Duong, Vietnam"
                  rows={2}
                  value={supplierAddress}
                  onChange={(e) => setSupplierAddress(e.target.value)}
                  className="flex w-full resize-none rounded-xl border border-slate-200 bg-white/50 px-3 py-2 text-xs shadow-sm transition-colors placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-[#5c59e9] focus-visible:outline-none dark:border-slate-800 dark:bg-slate-950"
                />
              </div>

              {/* Footer buttons */}
              <div className="flex gap-3 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddSupplierOpen(false)
                    setSupplierError(null)
                  }}
                  className="h-9 flex-1 cursor-pointer rounded-xl text-xs font-semibold"
                  disabled={isCreatingSupplier}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isCreatingSupplier}
                  className="h-9 flex-1 cursor-pointer gap-2 rounded-xl bg-[#5c59e9] text-xs font-semibold text-white hover:bg-[#4a47d2]"
                >
                  {isCreatingSupplier && (
                    <Loader2 size={12} className="animate-spin" />
                  )}
                  <span>Add Supplier</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {isBulkDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsBulkDeleteConfirmOpen(false)}
          />
          <div className="animate-in zoom-in-95 relative z-10 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl duration-150 dark:border-slate-800 dark:bg-slate-900">
            <div className="dark:text-rose-455 mb-4 flex items-center gap-3 text-rose-600">
              <AlertCircle
                size={22}
                className="text-rose-650 dark:text-rose-455 flex-shrink-0"
              />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Delete Selected Suppliers
              </h3>
            </div>

            <p className="mb-6 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              Are you sure you want to permanently delete the{' '}
              <strong className="font-semibold text-slate-800 dark:text-slate-200">
                {selectedSupplierIds.length}
              </strong>{' '}
              selected suppliers? This action cannot be undone.
            </p>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsBulkDeleteConfirmOpen(false)}
                className="h-9 flex-1 cursor-pointer rounded-xl text-xs font-semibold"
                disabled={isDeletingBatch}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmBatchDelete}
                disabled={isDeletingBatch}
                className="h-9 flex-1 cursor-pointer gap-1.5 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-700"
              >
                {isDeletingBatch && (
                  <Loader2 size={12} className="animate-spin" />
                )}
                <span>Delete ({selectedSupplierIds.length})</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel/CSV Dialog */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              if (!isImporting && !isPasteImporting) {
                setIsImportOpen(false)
                setCsvPreview([])
                setPastePreview([])
                setImportStatus(null)
                setPasteImportStatus(null)
              }
            }}
          />
          <div className="animate-in zoom-in-95 relative z-10 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl duration-150 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                  <Upload className="h-5 w-5 text-[#5c59e9]" />
                  <span>Bulk Import Suppliers</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Import supplier profiles and information from file or
                  clipboard
                </p>
              </div>
              <button
                onClick={() => {
                  if (!isImporting && !isPasteImporting) {
                    setIsImportOpen(false)
                    setCsvPreview([])
                    setPastePreview([])
                    setImportStatus(null)
                    setPasteImportStatus(null)
                  }
                }}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
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
                    className={`-mb-px cursor-pointer border-b-2 px-4 pb-2.5 text-xs font-bold transition-colors ${
                      importTab === 'file'
                        ? 'border-[#5c59e9] text-[#5c59e9]'
                        : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Upload CSV File
                  </button>
                  <button
                    onClick={() => {
                      setImportTab('paste')
                      setCsvPreview([])
                      setPastePreview([])
                      setPasteErrorMessage(null)
                    }}
                    className={`-mb-px cursor-pointer border-b-2 px-4 pb-2.5 text-xs font-bold transition-colors ${
                      importTab === 'paste'
                        ? 'border-[#5c59e9] text-[#5c59e9]'
                        : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Paste from Excel/Sheets
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4 p-6">
              {importTab === 'file' ? (
                /* CSV file upload tab */
                importStatus ? (
                  <div className="space-y-4 py-6 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/30">
                        <Check size={24} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        Import Completed
                      </h3>
                      <p className="max-w-md text-xs text-slate-500">
                        {importStatus}
                      </p>
                    </div>

                    <div className="pt-2">
                      <Button
                        onClick={() => {
                          setIsImportOpen(false)
                          setCsvPreview([])
                          setImportStatus(null)
                          router.refresh()
                        }}
                        className="cursor-pointer rounded-xl bg-[#5c59e9] px-6 hover:bg-[#4a47d2]"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="dark:bg-slate-955/10 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-6 text-center dark:border-slate-800">
                      <input
                        type="file"
                        accept=".csv"
                        id="csv-file-input"
                        onChange={handleCsvUpload}
                        className="hidden"
                      />
                      <label
                        htmlFor="csv-file-input"
                        className="flex cursor-pointer flex-col items-center gap-2"
                      >
                        <Upload className="h-8 w-8 text-slate-400 transition-colors hover:text-[#5c59e9]" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Click to upload CSV template
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Columns: supplier_name, email, phone, address,
                          website, contact_person, tax_id, business_type
                        </span>
                      </label>
                    </div>

                    {errorMessage && (
                      <div className="dark:bg-red-955/20 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600 dark:border-red-900/50 dark:text-red-400">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    {csvPreview.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Previewing {Math.min(5, csvPreview.length)} of{' '}
                            {csvPreview.length} rows:
                          </span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                          <table className="w-full border-collapse text-left text-[10px]">
                            <thead>
                              <tr className="border-b border-slate-100 bg-slate-50 font-bold text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-900">
                                <th className="px-4 py-2">Supplier Name</th>
                                <th className="px-4 py-2">Email</th>
                                <th className="px-4 py-2">Phone</th>
                                <th className="px-4 py-2">Website</th>
                                <th className="px-4 py-2">Contact</th>
                                <th className="px-4 py-2">Tax ID</th>
                                <th className="px-4 py-2">Business Type</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {csvPreview.slice(0, 5).map((row, idx) => (
                                <tr
                                  key={idx}
                                  className="text-slate-700 dark:text-slate-300"
                                >
                                  <td className="px-4 py-2 font-semibold">
                                    {row.supplierName}
                                  </td>
                                  <td className="px-4 py-2">
                                    {row.email || '—'}
                                  </td>
                                  <td className="px-4 py-2">
                                    {row.phone || '—'}
                                  </td>
                                  <td className="px-4 py-2 font-medium text-[#5c59e9]">
                                    {row.website || '—'}
                                  </td>
                                  <td className="px-4 py-2">
                                    {row.contactPerson || '—'}
                                  </td>
                                  <td className="px-4 py-2">
                                    {row.taxId || '—'}
                                  </td>
                                  <td className="px-4 py-2 font-semibold">
                                    {row.businessType || '—'}
                                  </td>
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
                            className="h-9 flex-1 cursor-pointer rounded-xl text-xs font-semibold"
                          >
                            Clear
                          </Button>
                          <Button
                            onClick={handleConfirmCsvImport}
                            disabled={isImporting}
                            className="h-9 flex-1 cursor-pointer gap-2 rounded-xl bg-[#5c59e9] text-xs font-semibold hover:bg-[#4a47d2]"
                          >
                            {isImporting ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />{' '}
                                Importing...
                              </>
                            ) : (
                              <>Confirm Import ({csvPreview.length} rows)</>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )
              ) : /* Clipboard paste tab */
              pasteImportStatus ? (
                <div className="space-y-4 py-6 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="dark:bg-emerald-955/30 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <Check size={24} />
                    </div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Import Completed
                    </h3>
                    <p className="max-w-md text-xs text-slate-500">
                      {pasteImportStatus}
                    </p>
                  </div>

                  <div className="pt-2">
                    <Button
                      onClick={() => {
                        setIsImportOpen(false)
                        setPasteText('')
                        setPastePreview([])
                        setPasteImportStatus(null)
                        router.refresh()
                      }}
                      className="cursor-pointer rounded-xl bg-[#5c59e9] px-6 hover:bg-[#4a47d2]"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label
                      htmlFor="paste-textarea"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Paste Excel/Sheets data here (Ctrl+V):
                    </Label>
                    <textarea
                      id="paste-textarea"
                      placeholder="Click here and press Ctrl+V to paste cells copied from Excel/Google Sheets.&#10;&#10;Expected columns: Supplier Name, Email, Phone, Address, Website, Contact Person, Tax ID, Business Type."
                      value={pasteText}
                      onPaste={handleClipboardPaste}
                      onChange={handlePasteTextChange}
                      rows={5}
                      className="animate-in fade-in w-full resize-none rounded-xl border border-slate-200 bg-slate-50/20 p-3 text-xs font-medium focus:ring-2 focus:ring-[#5c59e9] focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>

                  {pasteErrorMessage && (
                    <div className="text-red-650 dark:bg-red-955/20 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium dark:border-red-900/50 dark:text-red-400">
                      <AlertCircle size={14} className="flex-shrink-0" />
                      <span>{pasteErrorMessage}</span>
                    </div>
                  )}

                  {pastePreview.length > 0 && (
                    <div className="animate-in fade-in slide-in-from-top-2 space-y-2 duration-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Parsed Preview ({pastePreview.length} rows):
                        </span>
                      </div>
                      <div className="max-h-60 overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                        <table className="w-full border-collapse text-left text-[10px]">
                          <thead>
                            <tr className="sticky top-0 border-b border-slate-100 bg-slate-50 font-bold text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-900">
                              <th className="px-4 py-2">Supplier Name</th>
                              <th className="px-4 py-2">Email</th>
                              <th className="px-4 py-2">Phone</th>
                              <th className="px-4 py-2">Website</th>
                              <th className="px-4 py-2">Contact</th>
                              <th className="px-4 py-2">Tax ID</th>
                              <th className="px-4 py-2">Business Type</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {pastePreview.map((row, idx) => (
                              <tr
                                key={idx}
                                className="text-slate-700 hover:bg-slate-50/50 dark:text-slate-300 dark:hover:bg-slate-900/10"
                              >
                                <td className="px-4 py-2 font-semibold">
                                  {row.supplierName}
                                </td>
                                <td className="px-4 py-2">
                                  {row.email || '—'}
                                </td>
                                <td className="px-4 py-2">
                                  {row.phone || '—'}
                                </td>
                                <td className="px-4 py-2 font-medium text-[#5c59e9]">
                                  {row.website || '—'}
                                </td>
                                <td className="px-4 py-2">
                                  {row.contactPerson || '—'}
                                </td>
                                <td className="px-4 py-2">
                                  {row.taxId || '—'}
                                </td>
                                <td className="px-4 py-2 font-semibold">
                                  {row.businessType || '—'}
                                </td>
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
                          className="h-9 flex-1 cursor-pointer rounded-xl text-xs font-semibold"
                        >
                          Clear
                        </Button>
                        <Button
                          onClick={handleConfirmPasteImport}
                          disabled={isPasteImporting}
                          className="h-9 flex-1 cursor-pointer gap-2 rounded-xl bg-[#5c59e9] text-xs font-semibold hover:bg-[#4a47d2]"
                        >
                          {isPasteImporting ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />{' '}
                              Importing...
                            </>
                          ) : (
                            <>Confirm Import ({pastePreview.length} rows)</>
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
    </div>
  )
}
