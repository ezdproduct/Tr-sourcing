'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useRef } from 'react'
import { X, Search, ChevronRight, ChevronDown, Download, AlertCircle, Loader2, Plus, Sparkles, Tag, Globe, Check } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DatabaseOrder, DatabaseSupplier, UniqueSupplier } from '../types'
import { getOrderTypeFromItems } from '../sourcing-client'

interface AssignSupplierModalProps {
  isOpen: boolean
  onClose: () => void
  orders: DatabaseOrder[]
  uniqueSuppliers: UniqueSupplier[]
  selectedOrderId: string | null
  viewMode: 'order' | 'all'
  subtab: 'overview' | 'suppliers' | 'workplace' | 'launches'
  onSuccess: () => Promise<void>
  addSupplierNormalizedAction: (payload: any, resolution?: 'skip' | 'overwrite' | null, isProfilesTab?: boolean) => Promise<any>
  onDuplicateDetected?: (duplicates: any[], payload: any) => void
  existingBids?: any[]
}

// Helper function to match product names using Keyword Intersection matching with a 60% threshold
// Incorporates a fallback to general category matching (e.g. matching "Round Chair" with any "Chair")
export const matchProductNames = (nameA: string, nameB: string): boolean => {
  const cleanA = (nameA || '').toLowerCase().trim()
  const cleanB = (nameB || '').toLowerCase().trim()
  
  if (!cleanA || !cleanB) return false

  // 1. Direct substring match (quick check)
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true

  // 2. Keyword Intersection check:
  // Split both names into words, filter out empty spaces and single character / common short noise words
  const wordsA = cleanA.split(/\s+/).filter(w => w.length > 1)
  const wordsB = cleanB.split(/\s+/).filter(w => w.length > 1)

  if (wordsA.length === 0 || wordsB.length === 0) return false

  // Check if at least 60% of the keywords of the shorter phrase are present in the longer phrase
  const shorter = wordsA.length < wordsB.length ? wordsA : wordsB
  const longer = wordsA.length < wordsB.length ? cleanB : cleanA

  const matchCount = shorter.filter(word => longer.includes(word)).length
  const matchRatio = matchCount / shorter.length

  if (matchRatio >= 0.6) return true

  // 3. Fallback: Category matching (handles English suffix nouns and Vietnamese prefix nouns)
  const lastWordA = wordsA[wordsA.length - 1]
  const lastWordB = wordsB[wordsB.length - 1]
  const firstWordA = wordsA[0]
  const firstWordB = wordsB[0]

  // English fallback: Check if the primary noun at the end of the phrase matches (e.g. "chair" and "armchair")
  if (lastWordA && lastWordB && (lastWordA.includes(lastWordB) || lastWordB.includes(lastWordA))) {
    return true
  }

  // Vietnamese fallback: Check if the category noun at the start of the phrase matches (e.g. "bàn", "ghế")
  const vnFurniturePrefixes = [
    'bàn', 'ban', 'ghế', 'ghe', 'tủ', 'tu', 'giường', 'giuong', 
    'kệ', 'ke', 'đèn', 'den', 'chậu', 'chau', 'sofa', 'nệm', 'nem'
  ]
  if (firstWordA && firstWordB && (firstWordA.includes(firstWordB) || firstWordB.includes(firstWordA))) {
    if (vnFurniturePrefixes.includes(firstWordA) || vnFurniturePrefixes.includes(firstWordB)) {
      return true
    }
  }

  return false
}

export function AssignSupplierModal({
  isOpen,
  onClose,
  orders,
  uniqueSuppliers,
  selectedOrderId,
  viewMode,
  subtab,
  onSuccess,
  addSupplierNormalizedAction,
  onDuplicateDetected,
  existingBids = []
}: AssignSupplierModalProps) {
  // Modal states
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Form states
  const [manualForm, setManualForm] = useState({
    supplierName: '',
    email: '',
    phone: '',
    address: '',
    orderId: '',
    website: '',
    contactPerson: '',
    taxId: '',
    mainProducts: ''
  })

  // Checklist of items: orderItemId -> { checked, price, leadTime, selectedCapId }
  const [itemBids, setItemBids] = useState<Record<string, { 
    checked: boolean; 
    price: string; 
    leadTime: string; 
    selectedCapId?: string;
  }>>({})

  // Check if a capability is already assigned to a specific item
  const isAlreadyAssigned = React.useCallback((supplierId: string, itemId: string, targetPrice?: number) => {
    return existingBids?.some(bid => 
      bid.order_id === manualForm.orderId &&
      (bid.supplier_id === supplierId || bid.supplier_name === manualForm.supplierName) &&
      bid.order_item_id === itemId &&
      (targetPrice === undefined || Number(bid.quoted_price) === Number(targetPrice))
    ) || false
  }, [existingBids, manualForm.orderId, manualForm.supplierName])

  // External Capabilities (Product Catalog)
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

  // Dropdown states
  const [orderSearchQuery, setOrderSearchQuery] = useState('')
  const [isOrderDropdownOpen, setIsOrderDropdownOpen] = useState(false)
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('')
  const [isSupplierDropdownOpen, setIsSupplierDropdownOpen] = useState(false)

  // Focus ref for accessibility close button
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Derive checked items and suggested suppliers
  const selectedOrder = orders.find(o => o.id === manualForm.orderId) || null

  const initializeChecklist = React.useCallback((orderId: string) => {
    const selectedOrd = orders.find(o => o.id === orderId)
    if (selectedOrd?.order_items) {
      const initialBids: Record<string, { 
        price: string; 
        leadTime: string; 
        selectedCapId?: string;
        checked: boolean;
      }> = {}
      selectedOrd.order_items.forEach(item => {
        initialBids[item.id] = { 
          checked: false, 
          price: '', 
          leadTime: '', 
          selectedCapId: ''
        }
      })
      setItemBids(initialBids)
    } else {
      setItemBids({})
    }
  }, [orders])

  // Initialize/Reset states on open
  useEffect(() => {
    if (isOpen) {
      const activeOrderId = selectedOrderId || ''
      setManualForm({
        supplierName: '',
        email: '',
        phone: '',
        address: '',
        orderId: activeOrderId,
        website: '',
        contactPerson: '',
        taxId: '',
        mainProducts: ''
      })
      setCapabilities([])
      setErrorMessage(null)
      setOrderSearchQuery('')
      setSupplierSearchQuery('')
      setIsOrderDropdownOpen(false)
      setIsSupplierDropdownOpen(false)

      if (activeOrderId) {
        initializeChecklist(activeOrderId)
      } else {
        setItemBids({})
      }

      // Auto-focus on close button or modal container for screen reader focus
      setTimeout(() => {
        closeButtonRef.current?.focus()
      }, 100)
    }
  }, [isOpen, selectedOrderId, initializeChecklist])

  // Auto-map capabilities when supplierName changes
  useEffect(() => {
    if (!manualForm.supplierName) return
    const matchedSupplier = uniqueSuppliers.find(sup => sup.name === manualForm.supplierName)
    if (!matchedSupplier) return

    setItemBids(prev => {
      const updated = { ...prev }
      let changed = false
      for (const [itemId, bid] of Object.entries(updated)) {
        if (bid.checked) {
          const orderItem = selectedOrder?.order_items?.find(item => item.id === itemId)
          if (orderItem) {
            const itemCaps = (matchedSupplier.supplier_capabilities as any[])?.filter((cap: any) => 
              matchProductNames(cap.product_name, orderItem.item_name)
            ) || []
            const firstUnassignedCap = itemCaps.find((cap: any) => 
              !isAlreadyAssigned(matchedSupplier?.id || '', orderItem.id, Number(cap.target_price))
            )
            if (firstUnassignedCap) {
              const capId = firstUnassignedCap.id || firstUnassignedCap.product_name
              if (bid.selectedCapId !== capId) {
                updated[itemId] = { ...bid, selectedCapId: capId }
                changed = true
              }
            } else if (itemCaps.length > 0) {
              const capId = itemCaps[0].id || itemCaps[0].product_name
              if (bid.selectedCapId !== capId) {
                updated[itemId] = { ...bid, selectedCapId: capId }
                changed = true
              }
            }
          }
        }
      }
      return changed ? updated : prev
    })
  }, [manualForm.supplierName, uniqueSuppliers, selectedOrder, isAlreadyAssigned])

  // Handle Associated Order change
  const handleSelectOrder = (orderId: string) => {
    setManualForm(prev => ({ ...prev, orderId }))
    setIsOrderDropdownOpen(false)
    setOrderSearchQuery('')
    if (orderId) {
      initializeChecklist(orderId)
    } else {
      setItemBids({})
    }
  }

  // Derive checked items and suggested suppliers
  const checkedItemNames = Object.entries(itemBids)
    .filter(([_, bidVal]) => bidVal.checked)
    .map(([itemId, _]) => {
      const orderItem = selectedOrder?.order_items?.find(item => item.id === itemId)
      return (orderItem?.item_name || '').toLowerCase().trim()
    })
    .filter(Boolean)

  const suggestedSuppliers = uniqueSuppliers.filter(sup => {
    if (checkedItemNames.length === 0) return false

    const hasMatchingCapability = (sup.supplier_capabilities as any[])?.some((cap: any) => 
      checkedItemNames.some(itemName => matchProductNames(cap.product_name, itemName))
    )

    const hasMatchingProduct = (sup.main_products as string[])?.some((prod: string) => 
      checkedItemNames.some(itemName => matchProductNames(prod, itemName))
    )

    return hasMatchingCapability || hasMatchingProduct
  })

  // Handle Form Submission
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { supplierName, email, phone, address, orderId, website, contactPerson, taxId, mainProducts } = manualForm

    if (!supplierName) {
      setErrorMessage('Supplier Name is required.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    // Construct bid array
    const bids: Array<{ 
      orderItemId: string; 
      quotedPrice: number; 
      leadTimeDays: string;
      materialCostPercent?: number;
      laborCostPercent?: number;
      overheadCostPercent?: number;
      profitMarginPercent?: number;
      selectedCapId?: string;
    }> = []
    if (orderId) {
      const matchedSupplier = uniqueSuppliers.find(sup => sup.name === supplierName)
      for (const [itemId, bidVal] of Object.entries(itemBids)) {
        if (bidVal.checked) {
          let priceNum = parseFloat(bidVal.price)
          let leadTimeStr = bidVal.leadTime ? String(bidVal.leadTime) : ''

          // Lookup capability
          let cap: any = null
          if (bidVal.selectedCapId && matchedSupplier) {
            cap = (matchedSupplier.supplier_capabilities as any[])?.find(
              (c: any) => (c.id || c.product_name) === bidVal.selectedCapId
            )
          }

          // Auto lookup capability price & lead time if left empty and supplier match exists
          if (!cap && (isNaN(priceNum) || !leadTimeStr) && matchedSupplier) {
            const orderItem = selectedOrder?.order_items?.find(item => item.id === itemId)
            if (orderItem) {
              cap = (matchedSupplier.supplier_capabilities as any[])?.find((c: any) => 
                matchProductNames(c.product_name, orderItem.item_name)
              )
            }
          }

          if (cap) {
            if (isNaN(priceNum)) priceNum = parseFloat(cap.target_price || 0)
            if (!leadTimeStr) leadTimeStr = cap.lead_time_days || ''
          }

          bids.push({
            orderItemId: itemId,
            quotedPrice: isNaN(priceNum) ? 0 : priceNum,
            leadTimeDays: leadTimeStr,
            selectedCapId: bidVal.selectedCapId
          })
        }
      }
    }

    // Clean capabilities array
    const caps = capabilities
      .filter(c => c.productName.trim() !== '')
      .map(c => ({
        productName: c.productName,
        targetPrice: parseFloat(c.targetPrice) || 0,
        leadTimeDays: c.leadTimeDays,
        description: c.description,
        moq: c.moq ? parseInt(c.moq) || undefined : undefined,
        sku: c.sku,
        monthlyCapacity: c.monthlyCapacity
      }))

    try {
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
        mainProducts
      }, null, subtab === 'suppliers')

      if (result.success) {
        await onSuccess()
        onClose()
      } else if (result.duplicateDetected && onDuplicateDetected) {
        onDuplicateDetected(result.duplicates, {
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
          mainProducts
        })
        onClose()
      } else {
        setErrorMessage(result.error || 'Failed to add supplier.')
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Capability row handlers
  const handleAddCapabilityRow = () => {
    setCapabilities(prev => [
      ...prev,
      { id: Math.random().toString(), productName: '', targetPrice: '' }
    ])
  }

  const handleUpdateCapabilityRow = (id: string, field: string, value: string) => {
    setCapabilities(prev =>
      prev.map(c => (c.id === id ? { ...c, [field]: value } : c))
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {viewMode === 'order' ? 'Assign Supplier' : 'Add Supplier'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {viewMode === 'order' && selectedOrder
                ? `For order ${selectedOrder.order_code}`
                : 'Add a new supplier to the system'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
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
              ref={closeButtonRef}
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {errorMessage && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-4 py-3">
              <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
              <span className="text-xs text-red-600 dark:text-red-400">{errorMessage}</span>
            </div>
          )}

          {/* SECTION 2: Order Selection & Product items mapping */}
          {subtab !== 'suppliers' && (
            <div className="space-y-3.5 border-b border-slate-100 dark:border-slate-800 pb-4">
              <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Order &amp; Capability Mapping</h3>

              {/* Searchable Order Combobox */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Associated Order
                </Label>
                <div className="relative">
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={isOrderDropdownOpen}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    onClick={() => setIsOrderDropdownOpen(!isOrderDropdownOpen)}
                  >
                    <span>
                      {manualForm.orderId
                        ? orders.find(o => o.id === manualForm.orderId)?.order_code
                        : "No Associated Order (Unassigned)"
                      }
                    </span>
                    <ChevronRight size={14} className="transform rotate-90" />
                  </button>

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
                      <ul role="listbox" className="divide-y divide-slate-100 dark:divide-slate-800">
                        <li
                          role="option"
                          aria-selected={manualForm.orderId === ''}
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
                              role="option"
                              aria-selected={manualForm.orderId === o.id}
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

              {/* Checklist of Order Items */}
              {manualForm.orderId && (
                <div className="space-y-2.5">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Select Product Item(s) to Quote
                  </Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {orders.find(o => o.id === manualForm.orderId)?.order_items?.map(item => {
                      const bid = itemBids[item.id] || { 
                        checked: false, 
                        price: '', 
                        leadTime: '', 
                        selectedCapId: ''
                      }
                      
                      // Find matching capabilities for this specific item
                      const matchedSupplier = uniqueSuppliers.find(sup => sup.name === manualForm.supplierName)
                      const itemCaps = matchedSupplier
                        ? (matchedSupplier.supplier_capabilities as any[])?.filter((cap: any) => 
                            matchProductNames(cap.product_name, item.item_name)
                          )
                        : []

                      const areAllCapsAssigned = itemCaps.length > 0 && itemCaps.every((cap: any) => 
                        isAlreadyAssigned(matchedSupplier?.id || '', item.id, Number(cap.target_price))
                      )
                      const isItemAssigned = itemCaps.length > 0 ? areAllCapsAssigned : isAlreadyAssigned(matchedSupplier?.id || '', item.id)

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border transition-all duration-200 ${
                            isItemAssigned
                              ? 'border-amber-100 bg-amber-50/5 dark:border-amber-900/30 dark:bg-amber-950/5 opacity-85'
                              : bid.checked
                              ? 'border-indigo-200 bg-indigo-50/20 dark:border-indigo-900/40 dark:bg-indigo-950/10'
                              : 'border-slate-200/60 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900/30'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`item-check-${item.id}`}
                              checked={bid.checked || isItemAssigned}
                              disabled={isItemAssigned}
                              onChange={e => {
                                const isChecked = e.target.checked
                                const firstUnassignedCap = itemCaps.find((cap: any) => 
                                  !isAlreadyAssigned(matchedSupplier?.id || '', item.id, Number(cap.target_price))
                                )
                                const defaultCapId = (isChecked && firstUnassignedCap) 
                                  ? (firstUnassignedCap.id || firstUnassignedCap.product_name) 
                                  : (isChecked && itemCaps.length > 0 ? (itemCaps[0].id || itemCaps[0].product_name) : '')

                                setItemBids(prev => ({
                                  ...prev,
                                  [item.id]: { ...bid, checked: isChecked, selectedCapId: defaultCapId }
                                }))
                              }}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer disabled:opacity-50"
                            />
                            <Label
                              htmlFor={`item-check-${item.id}`}
                              className={`text-xs font-semibold text-slate-800 dark:text-slate-200 truncate flex-1 ${isItemAssigned ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                            >
                              {item.item_name}
                            </Label>
                          </div>

                          {isItemAssigned && (
                            <div className="mt-1.5 pl-6">
                              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/30 px-1.5 py-0.5 rounded-md w-fit flex items-center gap-0.5 select-none">
                                <AlertCircle size={9} />
                                <span>Already Assigned</span>
                              </span>
                            </div>
                          )}

                          {bid.checked && itemCaps.length > 1 && (
                            <div className="mt-3.5 space-y-2.5 pl-6 border-t border-slate-100 dark:border-slate-800/60 pt-2.5">
                              <div className="space-y-1">
                                <Label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                  Select Matching Capability
                                </Label>
                                <select
                                  value={bid.selectedCapId || ''}
                                  onChange={e => setItemBids(prev => ({
                                    ...prev,
                                    [item.id]: { ...bid, selectedCapId: e.target.value }
                                  }))}
                                  className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-850 dark:border-slate-800 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                >
                                  <option value="">-- Choose matching product --</option>
                                  {itemCaps.map((cap: any) => {
                                    const isCapAssigned = isAlreadyAssigned(matchedSupplier?.id || '', item.id, Number(cap.target_price))
                                    return (
                                      <option 
                                        key={cap.id || cap.product_name} 
                                        value={cap.id || cap.product_name}
                                        disabled={isCapAssigned}
                                      >
                                        {cap.product_name} (${Number(cap.target_price).toFixed(2)}){isCapAssigned ? ' (Already Assigned)' : ''}
                                      </option>
                                    )
                                  })}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Suggested Suppliers Section based on checked items */}
              {suggestedSuppliers.length > 0 && (
                <div className="space-y-1.5 pt-1 animate-in fade-in duration-200">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-indigo-600 fill-indigo-600/20" />
                    <span>Suggested Suppliers for Selected Items</span>
                  </Label>

                  <div className="relative">
                    <button
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={isSupplierDropdownOpen}
                      className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 cursor-pointer text-left focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      onClick={() => setIsSupplierDropdownOpen(!isSupplierDropdownOpen)}
                    >
                      <span className="truncate font-semibold">
                        {manualForm.supplierName
                          ? manualForm.supplierName
                          : `Select Suggested Supplier (${suggestedSuppliers.length} matches)...`
                        }
                      </span>
                      <ChevronDown size={14} className="text-slate-400 animate-in duration-100" />
                    </button>

                    {isSupplierDropdownOpen && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
                        <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 relative max-h-[85vh] flex flex-col">
                          <button
                            type="button"
                            onClick={() => setIsSupplierDropdownOpen(false)}
                            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X size={18} />
                          </button>

                          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-1.5">
                            <Sparkles size={16} className="text-indigo-600 fill-indigo-600/20" />
                            <span>Select Suggested Supplier</span>
                          </h3>
                          <p className="text-sm text-slate-400 mb-4">
                            Select a supplier matched by capabilities and products for this order.
                          </p>

                          {/* Search Input */}
                          <div className="flex items-center border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 bg-slate-50 dark:bg-slate-950 mb-3 shrink-0">
                            <Search size={14} className="text-slate-400 mr-2" />
                            <input
                              type="text"
                              placeholder="Search suggested suppliers by name or products..."
                              value={supplierSearchQuery}
                              onChange={e => setSupplierSearchQuery(e.target.value)}
                              className="w-full bg-transparent text-sm outline-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                              autoFocus
                            />
                          </div>

                          {/* Suppliers List */}
                          <div className="overflow-y-auto flex-1 pr-1 -mr-1">
                            <ul role="listbox" className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800/80 rounded-lg overflow-hidden">
                              <li
                                role="option"
                                aria-selected={manualForm.supplierName === ''}
                                className="px-3 py-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 cursor-pointer transition-colors"
                                onClick={() => {
                                  setManualForm(f => ({
                                    ...f,
                                    supplierName: '',
                                    email: '',
                                    phone: '',
                                    address: '',
                                    website: '',
                                    contactPerson: '',
                                    taxId: '',
                                    mainProducts: ''
                                  }))
                                  setIsSupplierDropdownOpen(false)
                                }}
                              >
                                Clear Selection (Unassign)
                              </li>
                              {suggestedSuppliers
                                .filter(sup => 
                                  sup.name.toLowerCase().includes(supplierSearchQuery.toLowerCase()) ||
                                  (sup.main_products && sup.main_products.some(p => p.toLowerCase().includes(supplierSearchQuery.toLowerCase())))
                                )
                                .map(sup => {
                                  const matchingCaps = sup.supplier_capabilities?.filter((cap: any) => 
                                    checkedItemNames.some(itemName => matchProductNames(cap.product_name, itemName))
                                  ) || []

                                  const hasPrice = matchingCaps.length > 0
                                  const priceText = hasPrice
                                    ? ` ($${Number(matchingCaps[0].target_price).toFixed(2)})`
                                    : ' (Match)'

                                  return (
                                    <li
                                      key={sup.id}
                                      role="option"
                                      aria-selected={manualForm.supplierName === sup.name}
                                      className="px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer text-sm flex flex-col gap-1 transition-colors"
                                      onClick={() => {
                                        setManualForm(f => ({
                                          ...f,
                                          supplierName: sup.name,
                                          email: sup.email || '',
                                          phone: sup.phone || '',
                                          address: sup.address || '',
                                          website: sup.website || '',
                                          contactPerson: sup.contact_person || '',
                                          taxId: sup.tax_id || '',
                                          mainProducts: sup.main_products ? sup.main_products.join(', ') : ''
                                        }))
                                        setIsSupplierDropdownOpen(false)
                                        setSupplierSearchQuery('')
                                      }}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-slate-800 dark:text-slate-200">
                                          {sup.name}
                                          <span className="text-indigo-600 dark:text-indigo-400 font-bold">{priceText}</span>
                                        </span>
                                        {manualForm.supplierName === sup.name && (
                                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Selected</span>
                                        )}
                                      </div>
                                      <div className="text-xs text-slate-450 dark:text-slate-500 leading-normal">
                                        <span className="font-medium text-slate-400">Products: </span>
                                        {sup.main_products ? sup.main_products.join(', ') : 'N/A'}
                                      </div>
                                    </li>
                                  )
                                })
                              }
                            </ul>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                            <Button
                              type="button"
                              onClick={() => setIsSupplierDropdownOpen(false)}
                              className="h-8 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer"
                            >
                              Close
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 3: Supplier Basic Profile info */}
          <div className="space-y-3.5 pb-2">
            <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider">Basic Information</h3>

            {subtab === 'suppliers' && (
              <div className="space-y-1.5">
                <Label htmlFor="supplier-name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Supplier / Factory Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="supplier-name"
                  type="text"
                  required
                  value={manualForm.supplierName}
                  onChange={e => setManualForm(f => ({ ...f, supplierName: e.target.value }))}
                  className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-sm font-semibold rounded-xl focus:ring-indigo-500"
                />
              </div>
            )}

            {(subtab === 'suppliers' || manualForm.supplierName) && (
              <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Email Address</Label>
                    <Input
                      id="supplier-email"
                      type="email"
                      value={manualForm.email}
                      onChange={e => setManualForm(f => ({ ...f, email: e.target.value }))}
                      className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-phone" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Phone Number</Label>
                    <Input
                      id="supplier-phone"
                      type="text"
                      value={manualForm.phone}
                      onChange={e => setManualForm(f => ({ ...f, phone: e.target.value }))}
                      className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="supplier-address" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Office / Factory Address</Label>
                  <Input
                    id="supplier-address"
                    type="text"
                    value={manualForm.address}
                    onChange={e => setManualForm(f => ({ ...f, address: e.target.value }))}
                    className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs rounded-xl"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-website" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Website URL</Label>
                    <Input
                      id="supplier-website"
                      type="text"
                      value={manualForm.website}
                      onChange={e => setManualForm(f => ({ ...f, website: e.target.value }))}
                      className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-contact" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Key Contact Person</Label>
                    <Input
                      id="supplier-contact"
                      type="text"
                      value={manualForm.contactPerson}
                      onChange={e => setManualForm(f => ({ ...f, contactPerson: e.target.value }))}
                      className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-taxid" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Tax ID / Business Code</Label>
                    <Input
                      id="supplier-taxid"
                      type="text"
                      value={manualForm.taxId}
                      onChange={e => setManualForm(f => ({ ...f, taxId: e.target.value }))}
                      className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="supplier-main-products" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Main Product</Label>
                    <Input
                      id="supplier-main-products"
                      type="text"
                      value={manualForm.mainProducts}
                      onChange={e => setManualForm(f => ({ ...f, mainProducts: e.target.value }))}
                      className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs rounded-xl"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Product Capability Details Section */}
            {subtab !== 'suppliers' && manualForm.supplierName && (() => {
              const matchedSupplier = uniqueSuppliers.find(sup => sup.name === manualForm.supplierName)
              const matchingCapabilities = matchedSupplier
                ? (matchedSupplier.supplier_capabilities as any[])?.filter((cap: any) => 
                    checkedItemNames.some(itemName => matchProductNames(cap.product_name, itemName))
                  )
                : []

              if (matchingCapabilities.length === 0) return null

              return (
                <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Tag size={13} className="text-indigo-600" />
                    <span>Matching Product Capabilities</span>
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {matchingCapabilities.map((cap: any) => {
                      const mappingItem = orders.find(o => o.id === manualForm.orderId)?.order_items?.find(item => {
                        const bid = itemBids[item.id]
                        const isAssigned = isAlreadyAssigned(matchedSupplier?.id || '', item.id, Number(cap.target_price))
                        return bid?.checked && !isAssigned && bid.selectedCapId === (cap.id || cap.product_name)
                      })
                      const isSelected = !!mappingItem

                      // Find if this capability matches an already assigned order item
                      const assignedItem = orders.find(o => o.id === manualForm.orderId)?.order_items?.find(item => {
                        const isAssigned = isAlreadyAssigned(matchedSupplier?.id || '', item.id, Number(cap.target_price))
                        if (!isAssigned) return false
                        return matchProductNames(cap.product_name, item.item_name)
                      })

                      // Find checked order items that match this capability (excluding already assigned)
                      const matchedOrderItems = orders.find(o => o.id === manualForm.orderId)?.order_items?.filter(item => {
                        const bid = itemBids[item.id]
                        const isAssigned = isAlreadyAssigned(matchedSupplier?.id || '', item.id, Number(cap.target_price))
                        if (!bid?.checked || isAssigned) return false
                        
                        return matchProductNames(cap.product_name, item.item_name)
                      }) || []
                      const hasMatches = matchedOrderItems.length > 0

                      const handleCardClick = () => {
                        if (hasMatches) {
                          const targetItem = matchedOrderItems[0]
                          setItemBids(prev => ({
                            ...prev,
                            [targetItem.id]: {
                              ...prev[targetItem.id],
                              selectedCapId: cap.id || cap.product_name
                            }
                          }))
                        }
                      }

                      return (
                        <div
                          key={cap.id || cap.product_name}
                          onClick={hasMatches ? handleCardClick : undefined}
                          className={`p-3.5 rounded-xl border transition-all duration-200 space-y-2.5 flex flex-col justify-between select-none ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50/20 dark:border-indigo-500 dark:bg-indigo-950/10 shadow-sm'
                              : 'border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/5 dark:bg-indigo-950/5'
                          } ${
                            hasMatches 
                              ? 'cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-700 hover:bg-slate-50/10' 
                              : ''
                          }`}
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex flex-col gap-1">
                              <span className="font-bold text-slate-800 dark:text-slate-200 text-xs truncate max-w-[200px]">
                                {cap.product_name}
                              </span>
                              {isSelected && (
                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/20 px-1.5 py-0.5 rounded-md w-fit flex items-center gap-0.5">
                                  <Check size={9} />
                                  <span>Mapped: {mappingItem.item_name}</span>
                                </span>
                              )}
                              {assignedItem && !isSelected && (
                                <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-500/20 px-1.5 py-0.5 rounded-md w-fit flex items-center gap-0.5">
                                  <AlertCircle size={9} />
                                  <span>Already Assigned ({assignedItem.item_name})</span>
                                </span>
                              )}
                            </div>
                            {cap.sku && (
                              <span className="text-[9px] font-bold bg-indigo-150 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                {cap.sku}
                              </span>
                            )}
                          </div>

                        <div className="grid grid-cols-3 gap-2 py-1.5 border-t border-b border-indigo-50/30 text-xs text-slate-600 dark:text-slate-400">
                          <div className="flex flex-col gap-0.5 border-r border-indigo-50/20 pr-1.5">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Price</span>
                            <span className="text-slate-800 dark:text-slate-200 font-extrabold text-sm text-indigo-600">
                              ${Number(cap.target_price).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 border-r border-indigo-50/20 px-1.5">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Lead Time</span>
                            <span className="text-slate-800 dark:text-slate-200 font-bold">
                              {cap.lead_time_days ? `${cap.lead_time_days} days` : '—'}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 pl-1.5">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">MOQ</span>
                            <span className="text-slate-800 dark:text-slate-200 font-bold">
                              {cap.moq ? `${Number(cap.moq).toLocaleString()}` : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                          <div className="flex flex-col gap-0.5 border-r border-indigo-50/20 pr-1.5">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Type</span>
                            <span className="text-slate-800 dark:text-slate-200 font-bold truncate capitalize">
                              {(cap.item_type || 'Product').toLowerCase()}
                            </span>
                          </div>
                          <div className="flex flex-col gap-0.5 pl-1.5">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Capacity</span>
                            <span className="text-slate-800 dark:text-slate-200 font-bold">
                              {cap.monthly_capacity || '—'}
                            </span>
                          </div>
                        </div>

                        {cap.description && (
                          <div className="bg-white/50 dark:bg-slate-900/40 p-2.5 rounded-lg text-slate-500 border border-indigo-50/30">
                            <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider mb-0.5">Description</span>
                            <span className="text-xs italic leading-normal">
                              {cap.description}
                            </span>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                </div>
              )
            })()}
          </div>

          {/* SECTION 4: Product Capabilities Addition for Suppliers subtab */}
          {subtab === 'suppliers' && (
            <div className="space-y-3.5 border-t border-slate-100 dark:border-slate-800 pt-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe size={13} className="text-indigo-600" />
                  <span>External Capabilities (Product Catalog)</span>
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCapabilityRow}
                  className="h-7 text-[10px] px-2 gap-1 border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900/50 cursor-pointer"
                >
                  <Plus size={10} />
                  <span>Add Product Capability</span>
                </Button>
              </div>

              {capabilities.length === 0 ? (
                <div className="text-center py-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  <p className="text-xs text-slate-400 font-medium">No external product capabilities added.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {capabilities.map((cap, idx) => (
                    <div key={cap.id} className="p-3 border border-slate-200 dark:border-slate-800 rounded-xl relative bg-slate-50/30 dark:bg-slate-950/20 space-y-2">
                      <button
                        type="button"
                        onClick={() => setCapabilities(prev => prev.filter(c => c.id !== cap.id))}
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-500 rounded p-0.5 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">Product / Item Name *</Label>
                          <Input
                            type="text"
                            required
                            value={cap.productName}
                            onChange={e => handleUpdateCapabilityRow(cap.id, 'productName', e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">Target Price *</Label>
                          <Input
                            type="number"
                            required
                            step="0.01"
                            value={cap.targetPrice}
                            onChange={e => handleUpdateCapabilityRow(cap.id, 'targetPrice', e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">Lead Time (Days)</Label>
                          <Input
                            type="number"
                            value={cap.leadTimeDays || ''}
                            onChange={e => handleUpdateCapabilityRow(cap.id, 'leadTimeDays', e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">MOQ</Label>
                          <Input
                            type="number"
                            value={cap.moq || ''}
                            onChange={e => handleUpdateCapabilityRow(cap.id, 'moq', e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">SKU / Code</Label>
                          <Input
                            type="text"
                            value={cap.sku || ''}
                            onChange={e => handleUpdateCapabilityRow(cap.id, 'sku', e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">Monthly Capacity</Label>
                          <Input
                            type="text"
                            value={cap.monthlyCapacity || ''}
                            onChange={e => handleUpdateCapabilityRow(cap.id, 'monthlyCapacity', e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] font-bold text-slate-400 uppercase">Description / Material specs</Label>
                          <Input
                            type="text"
                            value={cap.description || ''}
                            onChange={e => handleUpdateCapabilityRow(cap.id, 'description', e.target.value)}
                            className="h-8 text-xs rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 h-9 text-sm cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 h-9 text-sm bg-indigo-600 hover:bg-indigo-700 cursor-pointer gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {viewMode === 'order' ? 'Assigning...' : 'Adding...'}
                </>
              ) : (
                <>
                  <Plus size={14} />
                  {viewMode === 'order' ? 'Assign Supplier' : 'Add Supplier'}
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
