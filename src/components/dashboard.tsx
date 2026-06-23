'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/supabase/client'
import { ThemeSwitcher } from '@/components/theme-switcher'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Search,
  Plus,
  Database,
  Info,
  Package,
  DollarSign,
  Users,
  Clock,
  ClipboardList,
  CheckCircle2,
  RefreshCw,
  ChevronRight,
  FileText,
  Building,
  Receipt,
  Calendar,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Settings,
  PlusCircle,
  X,
  User,
  LogOut,
  HelpCircle,
  FileCheck2,
  ChevronDown,
  AlertTriangle,
  Shield
} from 'lucide-react'

// TS interfaces mapping to our Supabase database schema
interface Supplier {
  id: string
  company_name: string
  tax_code: string
  address: string
  website?: string
  contact_name?: string
  contact_email: string
  contact_phone?: string
  supply_type?: 'raw_material' | 'finished_good' | 'both'
  created_at: string
}

interface RFQ {
  id: string
  rfq_code: string
  title: string
  item_type: 'raw_material' | 'finished_good'
  deadline: string
  delivery_location: string
  raw_material_spec?: string
  chemical_composition?: string
  finished_good_packaging?: string
  product_barcode?: string
  created_at: string
  // New Boss visual sourcing fields
  product_images?: string[]
  sourcing_note?: string
  assigned_to?: string
}

interface Bid {
  id: string
  rfq_id: string
  supplier_id: string
  unit_price: number
  vat_percentage: number
  lead_time_days: number
  supplier_notes?: string
  moq_offered?: number
  delivery_tolerance_pct?: number
  warranty_months?: number
  return_policy?: string
  evaluation_score?: number
  status: 'draft' | 'reviewing' | 'awarded' | 'rejected'
  created_at: string
  // Joins
  supplier_name?: string
  rfq_code?: string
  rfq_title?: string
  // New employee sourcing fields
  supplier_source_url?: string
  supplier_product_image?: string
  // Note fields
  note?: string
  note_history?: { note: string; updated_at: string; updated_by: string }[]
}

const highlightText = (text: string | undefined | null, search: string) => {
  if (!text) return ''
  if (!search) return text
  
  try {
    const regex = new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    
    return (
      <>
        {parts.map((part, index) => 
          regex.test(part) ? (
            <mark key={index} className="bg-yellow-100 text-yellow-900 dark:bg-yellow-900/60 dark:text-yellow-100 rounded-sm px-0.5">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    )
  } catch (e) {
    return text
  }
}

export type UserRole = 'admin' | 'boss' | 'staff'

export function SourcingDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rfqs' | 'suppliers' | 'bids' | 'settings'>('dashboard')
  const [user, setUser] = useState<any>(null)
  const [userRole, setUserRole] = useState<UserRole>('admin')
  
  // Search and Loading States
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)

  // Database Data States
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [rfqs, setRfqs] = useState<RFQ[]>([])
  const [bids, setBids] = useState<Bid[]>([])

  // Modal / Form trigger states
  const [showAddRfq, setShowAddRfq] = useState(false)
  const [showAddBid, setShowAddBid] = useState(false)
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [selectedSupplierForBid, setSelectedSupplierForBid] = useState<Supplier | null>(null)
  const [viewingRfq, setViewingRfq] = useState<RFQ | null>(null)
  const [editingRfq, setEditingRfq] = useState<RFQ | null>(null)
  const [showEditRfqModal, setShowEditRfqModal] = useState(false)
  const [editRfq, setEditRfq] = useState({
    id: '',
    rfq_code: '',
    title: '',
    item_type: 'raw_material' as RFQ['item_type'],
    deadline: '',
    delivery_location: '',
    raw_material_spec: '',
    chemical_composition: '',
    finished_good_packaging: '',
    product_barcode: '',
    sourcing_note: '',
    product_images: [] as string[]
  })

  // Bids CRUD states
  const [editingBid, setEditingBid] = useState<Bid | null>(null)
  const [viewingBid, setViewingBid] = useState<Bid | null>(null)
  const [showUpdateBidModal, setShowUpdateBidModal] = useState(false)
  const [editBid, setEditBid] = useState({
    id: '', rfq_id: '', supplier_id: '', unit_price: '', vat_percentage: '10.00', lead_time_days: '', supplier_notes: '',
    moq_offered: '', delivery_tolerance_pct: '', warranty_months: '', return_policy: '',
    supplier_source_url: '', supplier_product_image: '', status: 'draft' as Bid['status'],
    note: '', note_history: [] as { note: string; updated_at: string; updated_by: string }[]
  })

  // Update Bid
  const handleUpdateBid = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editBid.id || !editBid.rfq_id || !editBid.supplier_id || !editBid.unit_price || !editBid.lead_time_days) return

    setIsLoading(true)
    const supabase = createClient()
    try {
      const selectedRfq = rfqs.find(r => r.id === editBid.rfq_id)
      
      const originalNote = editingBid?.note || ''
      const newNote = editBid.note || ''
      let updatedHistory = [...(editingBid?.note_history || [])]

      if (newNote !== originalNote) {
        updatedHistory.push({
          note: newNote,
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'staff'
        })
      }

      const isBoss = userRole === 'boss'
      const isStaff = userRole === 'staff'
      const originalStatus = editingBid?.status || 'draft'
      const statusToSave = isStaff ? originalStatus : editBid.status

      const payload: any = {
        status: statusToSave,
      }

      if (!isBoss) {
        payload.rfq_id = editBid.rfq_id
        payload.supplier_id = editBid.supplier_id
        payload.unit_price = Number(editBid.unit_price)
        payload.vat_percentage = Number(editBid.vat_percentage) || 10.00
        payload.lead_time_days = Number(editBid.lead_time_days)
        payload.supplier_notes = editBid.supplier_notes || null
        payload.supplier_source_url = editBid.supplier_source_url || null
        payload.supplier_product_image = editBid.supplier_product_image || null
        payload.note = newNote || null
        payload.note_history = updatedHistory

        if (selectedRfq?.item_type === 'raw_material') {
          payload.moq_offered = Number(editBid.moq_offered) || null
          payload.delivery_tolerance_pct = Number(editBid.delivery_tolerance_pct) || null
          payload.warranty_months = null
          payload.return_policy = null
        } else {
          payload.moq_offered = null
          payload.delivery_tolerance_pct = null
          payload.warranty_months = Number(editBid.warranty_months) || null
          payload.return_policy = editBid.return_policy || null
        }
      }

      const { data, error } = await supabase
        .from('bids')
        .update(payload)
        .eq('id', editBid.id)
        .select()

      if (error) throw error
      await fetchData()
      setEditingBid(null)
      setShowUpdateBidModal(false)
    } catch (err) {
      console.error('Error updating Bid:', err)
      const matchedSupplier = suppliers.find(s => s.id === editBid.supplier_id)
      const matchedRfq = rfqs.find(r => r.id === editBid.rfq_id)
      
      const originalNote = editingBid?.note || ''
      const newNote = editBid.note || ''
      let updatedHistory = [...(editingBid?.note_history || [])]

      if (newNote !== originalNote) {
        updatedHistory.push({
          note: newNote,
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'staff'
        })
      }

      const isBoss = userRole === 'boss'
      const isStaff = userRole === 'staff'
      const originalStatus = editingBid?.status || 'draft'
      const statusToSave = isStaff ? originalStatus : editBid.status

      setBids(prev => prev.map(b => b.id === editBid.id ? ({
        ...b,
        status: statusToSave,
        ...(!isBoss ? {
          rfq_id: editBid.rfq_id,
          supplier_id: editBid.supplier_id,
          unit_price: Number(editBid.unit_price),
          vat_percentage: Number(editBid.vat_percentage),
          lead_time_days: Number(editBid.lead_time_days),
          supplier_notes: editBid.supplier_notes,
          moq_offered: editBid.moq_offered ? Number(editBid.moq_offered) : null,
          delivery_tolerance_pct: editBid.delivery_tolerance_pct ? Number(editBid.delivery_tolerance_pct) : null,
          warranty_months: editBid.warranty_months ? Number(editBid.warranty_months) : null,
          return_policy: editBid.return_policy,
          supplier_name: matchedSupplier ? matchedSupplier.company_name : b.supplier_name,
          rfq_code: matchedRfq ? matchedRfq.rfq_code : b.rfq_code,
          rfq_title: matchedRfq ? matchedRfq.title : b.rfq_title,
          supplier_source_url: editBid.supplier_source_url || null,
          supplier_product_image: editBid.supplier_product_image || null,
          note: newNote,
          note_history: updatedHistory
        } : {})
      } as unknown as Bid) : b))
      setEditingBid(null)
      setShowUpdateBidModal(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Delete Bid
  const handleDeleteBid = async (bidId: string) => {
    if (userRole === 'staff') return
    if (!window.confirm('Are you sure you want to delete this bid? This action cannot be undone.')) return

    setIsLoading(true)
    const supabase = createClient()
    try {
      const { error } = await supabase
        .from('bids')
        .delete()
        .eq('id', bidId)

      if (error) throw error
      await fetchData()
      setShowUpdateBidModal(false)
    } catch (err) {
      console.error('Error deleting Bid:', err)
      setBids(prev => prev.filter(b => b.id !== bidId))
      setShowUpdateBidModal(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Suppliers tab sort & filter states
  const [supplierTypeFilter, setSupplierTypeFilter] = useState<string>('all')
  const [supplierSortField, setSupplierSortField] = useState<'company_name' | 'tax_code' | 'supply_type' | 'created_at'>('company_name')
  const [supplierSortOrder, setSupplierSortOrder] = useState<'asc' | 'desc'>('asc')

  // Bids tab sort states
  const [bidSortField, setBidSortField] = useState<'rfq_code' | 'rfq_title' | 'supplier_name' | 'unit_price' | 'vat_percentage' | 'lead_time_days' | 'status' | 'note'>('rfq_code')
  const [bidSortOrder, setBidSortOrder] = useState<'asc' | 'desc'>('asc')

  // Form States
  const [newRfq, setNewRfq] = useState({
    rfq_code: '', title: '', item_type: 'raw_material' as 'raw_material' | 'finished_good', deadline: '', delivery_location: 'Kho Tr-Sourcing',
    product_images: [] as string[], sourcing_note: ''
  })

  const [newBid, setNewBid] = useState({
    rfq_id: '', supplier_id: '', unit_price: '', vat_percentage: '10.00', lead_time_days: '', supplier_notes: '',
    moq_offered: '', delivery_tolerance_pct: '', warranty_months: '', return_policy: '',
    supplier_source_url: '', supplier_product_image: '',
    note: ''
  })

  const [newSupplier, setNewSupplier] = useState({
    company_name: '', tax_code: '', address: '', website: '', contact_name: '', contact_email: '', contact_phone: '', supply_type: 'both' as 'raw_material' | 'finished_good' | 'both'
  })

  // Selected RFQ type for dynamic bid submission form
  const selectedRfqForBid = rfqs.find(r => r.id === newBid.rfq_id)

  // Mock data fallbacks if DB is completely empty or offline
  const mockSuppliers: Supplier[] = [
    { id: 's-1', company_name: 'Viet My Wood Company', tax_code: '0102030405', address: 'Song Than Industrial Park, Binh Duong', website: 'https://govietmy.com', contact_name: 'Nguyen Van Hung', contact_email: 'hung.nguyen@govietmy.com', contact_phone: '0901234567', supply_type: 'raw_material', created_at: '2026-06-20' },
    { id: 's-2', company_name: 'Green Packaging Group', tax_code: '0304050607', address: 'Tan Binh Industrial Park, Ho Chi Minh City', website: 'https://baobixanh.vn', contact_name: 'Tran Thi Mai', contact_email: 'mai.tran@baobixanh.vn', contact_phone: '0918765432', supply_type: 'finished_good', created_at: '2026-06-21' }
  ]

  const mockRfqs: RFQ[] = [
    { id: 'r-1', rfq_code: 'RFQ-RAW-2026-001', title: 'Supply 100 tons of kiln-dried red oak', item_type: 'raw_material', deadline: '2026-07-07', delivery_location: 'Tr-Sourcing Wood Warehouse, Dong Nai', raw_material_spec: 'US Red Oak, kiln-dried to 12-14% moisture content, no large black knots.', chemical_composition: 'Wood bark impurities < 2%, head splitting rate < 5%', created_at: '2026-06-23' },
    { id: 'r-2', rfq_code: 'RFQ-FIN-2026-002', title: 'Supply 50,000 branded 5-layer carton boxes', item_type: 'finished_good', deadline: '2026-07-03', delivery_location: 'Tr-Sourcing Factory, Binh Duong', finished_good_packaging: 'Packaged 50 boxes/bundle, wrapped with protective PE stretch film.', product_barcode: '8931234567890', created_at: '2026-06-23' }
  ]

  const mockBids: Bid[] = [
    { id: 'b-1', rfq_id: 'r-1', rfq_code: 'RFQ-RAW-2026-001', rfq_title: 'Supply 100 tons of kiln-dried red oak', supplier_id: 's-1', supplier_name: 'Viet My Wood Company', unit_price: 350.00, vat_percentage: 10.00, lead_time_days: 15, supplier_notes: 'We guarantee high-quality kiln-dried wood meeting export standards.', moq_offered: 10.00, delivery_tolerance_pct: 2.00, evaluation_score: 85, status: 'reviewing', note: 'Good price but delivery is slightly slow.', note_history: [{ note: 'Good price but delivery is slightly slow.', updated_at: '2026-06-23T10:00:00.000Z', updated_by: 'admin@sourcing.com' }], created_at: '2026-06-23' },
    { id: 'b-2', rfq_id: 'r-2', rfq_code: 'RFQ-FIN-2026-002', rfq_title: 'Supply 50,000 branded 5-layer carton boxes', supplier_id: 's-2', supplier_name: 'Green Packaging Group', unit_price: 1.20, vat_percentage: 8.00, lead_time_days: 7, supplier_notes: 'High-quality offset printing packaging, eco-friendly inks.', warranty_months: 6, return_policy: '1-to-1 replacement for torn or misprinted products within 30 days.', evaluation_score: 90, status: 'reviewing', note: 'Good printing quality.', note_history: [{ note: 'Good printing quality.', updated_at: '2026-06-23T10:15:00.000Z', updated_by: 'staff@sourcing.com' }], created_at: '2026-06-23' }
  ]

  // Fetch real data from Supabase
  const fetchData = async () => {
    setIsSyncing(true)
    setDbError(null)
    const supabase = createClient()
    try {
      const [suppliersRes, rfqsRes, bidsRes] = await Promise.all([
        supabase.from('suppliers').select('*'),
        supabase.from('rfqs').select('*'),
        supabase.from('bids').select('*')
      ])

      if (suppliersRes.error) throw suppliersRes.error
      if (rfqsRes.error) throw rfqsRes.error
      if (bidsRes.error) throw bidsRes.error

      const dbSuppliers = (suppliersRes.data && suppliersRes.data.length > 0) ? suppliersRes.data : mockSuppliers
      const dbRfqs = (rfqsRes.data && rfqsRes.data.length > 0) ? rfqsRes.data : mockRfqs
      
      let dbBids = []
      if (bidsRes.data && bidsRes.data.length > 0) {
        dbBids = bidsRes.data.map(bid => {
          const matchedSupplier = dbSuppliers.find(s => s.id === bid.supplier_id)
          const matchedRfq = dbRfqs.find(r => r.id === bid.rfq_id)
          return {
            ...bid,
            supplier_name: matchedSupplier ? matchedSupplier.company_name : 'N/A',
            rfq_code: matchedRfq ? matchedRfq.rfq_code : 'N/A',
            rfq_title: matchedRfq ? matchedRfq.title : 'N/A'
          }
        })
      } else {
        dbBids = mockBids
      }

      setSuppliers(dbSuppliers)
      setRfqs(dbRfqs)
      setBids(dbBids)

    } catch (err: any) {
      console.error('Error fetching Supabase data:', err)
      setDbError(err.message || 'An error occurred connecting to Supabase database. Falling back to mock data.')
      setSuppliers(mockSuppliers)
      setRfqs(mockRfqs)
      setBids(mockBids)
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    fetchData()
    const checkUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user?.email) {
        const email = user.email.toLowerCase()
        if (email.includes('admin')) {
          setUserRole('admin')
        } else if (email.includes('boss') || email.includes('sep')) {
          setUserRole('boss')
        } else {
          setUserRole('staff')
        }
      } else {
        setUserRole('admin')
      }
    }
    checkUser()
  }, [])

  useEffect(() => {
    if (userRole === 'staff' && activeTab === 'settings') {
      setActiveTab('dashboard')
    }
  }, [userRole, activeTab])

  // Helper to generate a random RFQ Campaign Code
  const generateRandomRfqCode = (itemType: 'raw_material' | 'finished_good') => {
    const prefix = itemType === 'raw_material' ? 'RFQ-RAW' : 'RFQ-FIN'
    const year = new Date().getFullYear()
    const randomNum = Math.floor(1000 + Math.random() * 9000)
    return `${prefix}-${year}-${randomNum}`
  }

  // Upload RFQ Image helper
  const handleRfqImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    try {
      const uploadedUrls: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (data.url) {
          uploadedUrls.push(data.url)
        }
      }
      setNewRfq(prev => ({
        ...prev,
        product_images: [...(prev.product_images || []), ...uploadedUrls]
      }))
    } catch (err) {
      console.error('RFQ Image upload failed:', err)
    } finally {
      setIsUploading(false)
    }
  }

  const removeRfqImage = (indexToRemove: number) => {
    setNewRfq(prev => ({
      ...prev,
      product_images: (prev.product_images || []).filter((_, idx) => idx !== indexToRemove)
    }))
  }

  // Upload Bid Image helper
  const handleBidImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    try {
      const file = files[0]
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.url) {
        setNewBid(prev => ({
          ...prev,
          supplier_product_image: data.url
        }))
      }
    } catch (err) {
      console.error('Bid image upload failed:', err)
    } finally {
      setIsUploading(false)
    }
  }

  // Create Supplier
  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (userRole === 'boss') return
    if (!newSupplier.company_name || !newSupplier.tax_code || !newSupplier.contact_email) return

    setIsLoading(true)
    const supabase = createClient()
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert([newSupplier])
        .select()

      if (error) throw error
      await fetchData()
      setNewSupplier({ company_name: '', tax_code: '', address: '', website: '', contact_name: '', contact_email: '', contact_phone: '', supply_type: 'both' })
      setShowAddSupplier(false)
    } catch (err) {
      console.error('Error creating supplier:', err)
      setSuppliers(prev => [{ id: String(Date.now()), ...newSupplier, created_at: new Date().toISOString() } as Supplier, ...prev])
      setShowAddSupplier(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Create RFQ
  const handleAddRfq = async (e: React.FormEvent) => {
    e.preventDefault()
    if (userRole === 'staff') return
    if (!newRfq.title || !newRfq.rfq_code || !newRfq.deadline) return

    setIsLoading(true)
    const supabase = createClient()
    try {
      const payload: any = {
        rfq_code: newRfq.rfq_code,
        title: newRfq.title,
        item_type: newRfq.item_type,
        deadline: newRfq.deadline,
        delivery_location: newRfq.delivery_location || 'Kho Tr-Sourcing',
        product_images: newRfq.product_images,
        sourcing_note: newRfq.sourcing_note
      }

      const { data, error } = await supabase
        .from('rfqs')
        .insert([payload])
        .select()

      if (error) throw error
      await fetchData()
      setNewRfq({
        rfq_code: '', title: '', item_type: 'raw_material', deadline: '', delivery_location: 'Kho Tr-Sourcing',
        product_images: [], sourcing_note: ''
      })
      setShowAddRfq(false)
    } catch (err) {
      console.error('Error inserting RFQ:', err)
      setRfqs(prev => [{ id: String(Date.now()), ...newRfq, created_at: new Date().toISOString() } as RFQ, ...prev])
      setShowAddRfq(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Update RFQ
  const handleUpdateRfq = async (e: React.FormEvent) => {
    e.preventDefault()
    if (userRole === 'staff') return
    if (!editRfq.id || !editRfq.title || !editRfq.deadline) return

    setIsLoading(true)
    const supabase = createClient()
    try {
      const payload: any = {
        title: editRfq.title,
        item_type: editRfq.item_type,
        deadline: editRfq.deadline,
        delivery_location: editRfq.delivery_location || 'Kho Tr-Sourcing',
        product_images: editRfq.product_images,
        sourcing_note: editRfq.sourcing_note
      }

      if (editRfq.item_type === 'raw_material') {
        payload.raw_material_spec = editRfq.raw_material_spec || null
        payload.chemical_composition = editRfq.chemical_composition || null
        payload.finished_good_packaging = null
        payload.product_barcode = null
      } else {
        payload.raw_material_spec = null
        payload.chemical_composition = null
        payload.finished_good_packaging = editRfq.finished_good_packaging || null
        payload.product_barcode = editRfq.product_barcode || null
      }

      const { data, error } = await supabase
        .from('rfqs')
        .update(payload)
        .eq('id', editRfq.id)
        .select()

      if (error) throw error
      await fetchData()
      setEditingRfq(null)
      setShowEditRfqModal(false)
    } catch (err: any) {
      console.error('Error updating RFQ:', err)
      setRfqs(prev => prev.map(r => r.id === editRfq.id ? { ...r, ...editRfq } as RFQ : r))
      setEditingRfq(null)
      setShowEditRfqModal(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleEditRfqImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    try {
      const uploadedUrls: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (data.url) {
          uploadedUrls.push(data.url)
        }
      }
      setEditRfq(prev => ({
        ...prev,
        product_images: [...(prev.product_images || []), ...uploadedUrls]
      }))
    } catch (err) {
      console.error(err)
    } finally {
      setIsUploading(false)
    }
  }

  const removeEditRfqImage = (index: number) => {
    setEditRfq(prev => ({
      ...prev,
      product_images: (prev.product_images || []).filter((_, idx) => idx !== index)
    }))
  }

  // Create Bid
  const handleAddBid = async (e: React.FormEvent) => {
    e.preventDefault()
    if (userRole === 'boss') return
    if (!newBid.rfq_id || !newBid.supplier_id || !newBid.unit_price || !newBid.lead_time_days) return

    setIsLoading(true)
    const supabase = createClient()
    try {
      const payload: any = {
        rfq_id: newBid.rfq_id,
        supplier_id: newBid.supplier_id,
        unit_price: Number(newBid.unit_price),
        vat_percentage: Number(newBid.vat_percentage) || 10.00,
        lead_time_days: Number(newBid.lead_time_days),
        supplier_notes: newBid.supplier_notes,
        status: 'draft',
        evaluation_score: 80, // Default technical evaluation score
        supplier_source_url: newBid.supplier_source_url || null,
        supplier_product_image: newBid.supplier_product_image || null,
        note: newBid.note || null,
        note_history: newBid.note ? [
          {
            note: newBid.note,
            updated_at: new Date().toISOString(),
            updated_by: user?.email || 'staff'
          }
        ] : []
      }

      if (selectedRfqForBid?.item_type === 'raw_material') {
        payload.moq_offered = Number(newBid.moq_offered) || null
        payload.delivery_tolerance_pct = Number(newBid.delivery_tolerance_pct) || null
      } else {
        payload.warranty_months = Number(newBid.warranty_months) || null
        payload.return_policy = newBid.return_policy
      }

      const { data, error } = await supabase
        .from('bids')
        .insert([payload])
        .select()

      if (error) throw error
      await fetchData()
      setNewBid({
        rfq_id: '', supplier_id: '', unit_price: '', vat_percentage: '10.00', lead_time_days: '', supplier_notes: '',
        moq_offered: '', delivery_tolerance_pct: '', warranty_months: '', return_policy: '',
        supplier_source_url: '', supplier_product_image: '',
        note: ''
      })
      setShowAddBid(false)
    } catch (err) {
      console.error('Error inserting Bid:', err)
      const matchedSupplier = suppliers.find(s => s.id === newBid.supplier_id)
      const matchedRfq = rfqs.find(r => r.id === newBid.rfq_id)
      setBids(prev => [{
        id: String(Date.now()),
        ...newBid,
        unit_price: Number(newBid.unit_price),
        vat_percentage: Number(newBid.vat_percentage),
        lead_time_days: Number(newBid.lead_time_days),
        supplier_name: matchedSupplier ? matchedSupplier.company_name : 'Unknown',
        rfq_code: matchedRfq ? matchedRfq.rfq_code : 'N/A',
        rfq_title: matchedRfq ? matchedRfq.title : 'N/A',
        status: 'draft',
        evaluation_score: 80,
        note: newBid.note || null,
        note_history: newBid.note ? [
          {
            note: newBid.note,
            updated_at: new Date().toISOString(),
            updated_by: user?.email || 'staff'
          }
        ] : [],
        created_at: new Date().toISOString()
      } as unknown as Bid, ...prev])
      setShowAddBid(false)
    } finally {
      setIsLoading(false)
    }
  }



  // Filter datasets based on Search
  const filteredRfqs = rfqs.filter(r => 
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.rfq_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.delivery_location.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredSuppliers = suppliers.filter(s =>
    s.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.tax_code.includes(searchQuery) ||
    s.contact_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const processedSuppliers = suppliers
    .filter(s => {
      const matchesSearch = s.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.tax_code.includes(searchQuery) ||
        (s.contact_name && s.contact_name.toLowerCase().includes(searchQuery.toLowerCase()))
      
      const matchesType = supplierTypeFilter === 'all' || 
        s.supply_type === supplierTypeFilter ||
        (supplierTypeFilter === 'raw_material' && s.supply_type === 'both') ||
        (supplierTypeFilter === 'finished_good' && s.supply_type === 'both')
      
      return matchesSearch && matchesType
    })
    .sort((a, b) => {
      let fieldA = a[supplierSortField] || ''
      let fieldB = b[supplierSortField] || ''
      
      if (typeof fieldA === 'string') {
        fieldA = fieldA.toLowerCase()
        fieldB = fieldB.toLowerCase()
      }
      
      if (fieldA < fieldB) return supplierSortOrder === 'asc' ? -1 : 1
      if (fieldA > fieldB) return supplierSortOrder === 'asc' ? 1 : -1
      return 0
    })

  const handleSupplierSort = (field: 'company_name' | 'tax_code' | 'supply_type' | 'created_at') => {
    if (supplierSortField === field) {
      setSupplierSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSupplierSortField(field)
      setSupplierSortOrder('asc')
    }
  }

  const renderSupplierSortIcon = (field: 'company_name' | 'tax_code' | 'supply_type' | 'created_at') => {
    if (supplierSortField === field) {
      return supplierSortOrder === 'asc' ? <ArrowUp size={11} className="inline ml-1" /> : <ArrowDown size={11} className="inline ml-1" />
    }
    return <ArrowUpDown size={11} className="inline ml-1 opacity-40 hover:opacity-100 animate-in fade-in" />
  }

  const handleBidSort = (field: typeof bidSortField) => {
    if (bidSortField === field) {
      setBidSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setBidSortField(field)
      setBidSortOrder('asc')
    }
  }

  const renderBidSortIcon = (field: typeof bidSortField) => {
    if (bidSortField === field) {
      return bidSortOrder === 'asc' ? <ArrowUp size={11} className="inline ml-1" /> : <ArrowDown size={11} className="inline ml-1" />
    }
    return <ArrowUpDown size={11} className="inline ml-1 opacity-40 hover:opacity-100 animate-in fade-in" />
  }

  const getSupplierSupplyTypeBadge = (supplyType?: string) => {
    if (supplyType === 'raw_material') {
      return <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-0 rounded-full font-medium py-0.5 px-2 text-[10px]">Raw Material</Badge>
    }
    if (supplyType === 'finished_good') {
      return <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-0 rounded-full font-medium py-0.5 px-2 text-[10px]">Finished Good</Badge>
    }
    return <Badge className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-0 rounded-full font-medium py-0.5 px-2 text-[10px]">Both</Badge>
  }

  const filteredBids = bids.filter(b =>
    b.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.rfq_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.rfq_title?.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    let valA = a[bidSortField]
    let valB = b[bidSortField]

    if (valA === undefined || valA === null) valA = ''
    if (valB === undefined || valB === null) valB = ''

    if (typeof valA === 'string' && typeof valB === 'string') {
      const cmp = valA.localeCompare(valB, 'vi', { sensitivity: 'base' })
      return bidSortOrder === 'asc' ? cmp : -cmp
    }

    if (typeof valA === 'number' && typeof valB === 'number') {
      return bidSortOrder === 'asc' ? valA - valB : valB - valA
    }

    if (valA < valB) return bidSortOrder === 'asc' ? -1 : 1
    if (valA > valB) return bidSortOrder === 'asc' ? 1 : -1
    return 0
  })

  // Calculations for Overview Cards
  const totalRfqsCount = rfqs.length
  const rawMaterialRfqsCount = rfqs.filter(r => r.item_type === 'raw_material').length
  const finishedGoodRfqsCount = rfqs.filter(r => r.item_type === 'finished_good').length
  const totalBidsCount = bids.length

  const getRfqItemTypeBadge = (type: RFQ['item_type']) => {
    return type === 'raw_material' ? (
      <Badge className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-0 rounded-full font-medium py-0.5 px-2.5">
        Raw Material
      </Badge>
    ) : (
      <Badge className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border-0 rounded-full font-medium py-0.5 px-2.5">
        Finished Good
      </Badge>
    )
  }

  const getBidStatusBadge = (status: Bid['status']) => {
    const styles = {
      draft: 'bg-zinc-50 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400 border-0 rounded-full font-semibold py-0.5 px-2.5',
      reviewing: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border-0 rounded-full font-semibold py-0.5 px-2.5',
      awarded: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-0 rounded-full font-semibold py-0.5 px-2.5',
      rejected: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border-0 rounded-full font-semibold py-0.5 px-2.5'
    }
    const labels = {
      draft: 'Draft',
      reviewing: 'Reviewing',
      awarded: 'Awarded',
      rejected: 'Rejected'
    }
    return (
      <Badge className={styles[status]}>
        {labels[status]}
      </Badge>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f8fafc] text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      
      {/* 1. Sidebar Panel (Fixed left sidebar in deep indigo tone) */}
      <aside className="hidden w-64 flex-col border-r border-[#1e1b4b] bg-[#100e2b] text-slate-200 dark:border-indigo-950/40 dark:bg-[#09081a] md:flex">
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 px-6 border-b border-[#1e1b4b]">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#5c59e9] text-sm font-black text-white shadow-md shadow-[#5c59e9]/30">
            S
          </span>
          <span className="text-base font-black tracking-tight text-white">Tr-Sourcing Pro</span>
        </div>

        {/* Navigation Menus */}
        <nav className="flex-1 space-y-1.5 px-4 py-6">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20' : 'hover:bg-[#1a173d] hover:text-white'}`}
          >
            <ClipboardList size={18} />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('rfqs')}
            className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === 'rfqs' ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20' : 'hover:bg-[#1a173d] hover:text-white'}`}
          >
            <Package size={18} />
            <span>RFQ Campaigns</span>
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === 'suppliers' ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20' : 'hover:bg-[#1a173d] hover:text-white'}`}
          >
            <Building size={18} />
            <span>Suppliers</span>
          </button>
          <button
            onClick={() => setActiveTab('bids')}
            className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === 'bids' ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20' : 'hover:bg-[#1a173d] hover:text-white'}`}
          >
            <Receipt size={18} />
            <span>Received Bids</span>
          </button>
          {userRole !== 'staff' && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === 'settings' ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20' : 'hover:bg-[#1a173d] hover:text-white'}`}
            >
              <Settings size={18} />
              <span>System Settings</span>
            </button>
          )}
        </nav>

        {/* Sync & Footer info */}
        <div className="border-t border-[#1e1b4b] p-4 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Database size={12} className="text-teal-500" /> Database Live
            </span>
            <button
              onClick={fetchData}
              disabled={isSyncing || userRole === 'boss'}
              className={`hover:text-white transition cursor-pointer ${userRole === 'boss' ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={userRole === 'boss' ? 'Boss is not allowed to sync database' : 'Sync database'}
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-[#1a173d]/50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#5c59e9]/15 text-sm font-bold text-[#5c59e9]">
              {user ? user.email?.substring(0, 2).toUpperCase() : 'PS'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-white">{user ? user.email?.split('@')[0] : 'Paul Smith'}</p>
              <p className="truncate text-[10px] text-slate-400">{user ? 'Authorized User' : 'Procurement Dir.'}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content body container */}
      <div className="flex flex-1 flex-col overflow-hidden">
        
        {/* Top Header Bar */}
        <header className="flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="relative w-72">
            <Search className="text-slate-400 absolute top-2.5 left-2.5 h-4 w-4" />
            <Input
              placeholder={`Search in ${activeTab}...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-9 w-full pl-9 text-xs rounded-lg border-slate-200 bg-slate-50/50 focus-visible:bg-white focus-visible:ring-[#5c59e9] focus-visible:border-[#5c59e9]"
            />
          </div>
          <div className="flex items-center gap-4">
            {dbError && (
              <Badge className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-medium text-[10px] dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-900/30">
                Mock Mode Active
              </Badge>
            )}
            
            <ThemeSwitcher />

            {/* Role Switcher Widget */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2 py-1 shadow-sm select-none">
              <Shield size={12} className={
                userRole === 'admin' ? 'text-rose-500' :
                userRole === 'boss' ? 'text-purple-500' :
                'text-sky-500'
              } />
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as UserRole)}
                className="bg-transparent border-0 text-slate-700 dark:text-slate-200 font-bold text-[10px] uppercase focus:outline-none cursor-pointer pr-1"
                title="Change role (testing)"
              >
                <option value="admin" className="text-rose-600 bg-white dark:bg-slate-900 font-semibold">Admin</option>
                <option value="boss" className="text-purple-600 bg-white dark:bg-slate-900 font-semibold">Boss</option>
                <option value="staff" className="text-sky-600 bg-white dark:bg-slate-900 font-semibold">Staff</option>
              </select>
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                userRole === 'admin' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] animate-pulse' :
                userRole === 'boss' ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)] animate-pulse' :
                'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)] animate-pulse'
              }`} />
            </div>

            <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-800">
              <div className="text-right hidden sm:block">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {user ? user.email?.split('@')[0] : 'Paul Smith'}
                </span>
                <span className="block text-[10px] text-slate-400">
                  {user ? user.email : 'paul.smith@tr.com'}
                </span>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#5c59e9]/10 text-xs font-bold text-[#5c59e9] border border-[#5c59e9]/20 shadow-sm">
                {user ? user.email?.substring(0, 2).toUpperCase() : 'PS'}
              </span>
              
              {user && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={async () => {
                    const supabase = createClient()
                    await supabase.auth.signOut()
                    window.location.reload()
                  }} 
                  className="h-8 w-8 text-slate-400 hover:text-rose-500 rounded-lg cursor-pointer"
                  title="Log out"
                >
                  <LogOut size={16} />
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Workspace panel */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          
          {/* Supabase Connection offline warning banner */}
          {dbError && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl bg-amber-50/80 border border-amber-100 p-4 text-xs text-amber-800 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-bold">Supabase Database Offline / Cannot sync new tables</p>
                <p className="mt-1 leading-relaxed text-amber-700/90 dark:text-amber-400/90">
                  The system did not find tables 'suppliers', 'rfqs', or 'bids' on Supabase (or the connection was refused). 
                  We are currently using **Premium Mock Data** dynamically on localhost for you to test the user interface.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              
              {/* 1. OVERVIEW PANEL (OVERVIEW CARDS) */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                
                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                      Total RFQ Campaigns
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                      {totalRfqsCount}
                    </div>
                    <p className="mt-2 text-[11px] text-[#5c59e9] hover:underline cursor-pointer flex items-center gap-0.5" onClick={() => setActiveTab('rfqs')}>
                      Manage campaigns <ChevronRight size={12} />
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                      RFQ Raw Material
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                      {rawMaterialRfqsCount}
                    </div>
                    <span className="mt-2 text-[10px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-full px-2 py-0.5 inline-block">
                      Raw Materials
                    </span>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                      RFQ Finished Good
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                      {finishedGoodRfqsCount}
                    </div>
                    <span className="mt-2 text-[10px] font-bold text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-full px-2 py-0.5 inline-block">
                      Finished Goods
                    </span>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                      Total Received Bids
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                      {totalBidsCount}
                    </div>
                    <p className="mt-2 text-[11px] text-[#5c59e9] hover:underline cursor-pointer flex items-center gap-0.5" onClick={() => setActiveTab('bids')}>
                      Evaluate bids <ChevronRight size={12} />
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Grid 2: RFQ Table list & Side Forms */}
              <div>
                
                {/* 2. CAMPAIGNS MANAGEMENT PANEL (INTERNAL RFQS) */}
                <div className="space-y-6">
                  <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <CardTitle className="text-lg font-bold">RFQ Campaigns List</CardTitle>
                        <CardDescription className="text-xs">Track raw materials and finished goods campaigns currently running</CardDescription>
                      </div>
                      {userRole !== 'staff' && (
                        <Button
                          onClick={() => {
                            const initialType = 'raw_material'
                            setNewRfq({
                              rfq_code: generateRandomRfqCode(initialType),
                              title: '',
                              item_type: initialType,
                              deadline: '',
                              delivery_location: 'Kho Tr-Sourcing',
                              product_images: [],
                              sourcing_note: ''
                            })
                            setShowAddRfq(true)
                          }}
                          className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-8 rounded-lg shadow-sm"
                        >
                          <Plus size={14} className="mr-1" /> Create RFQ
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 bg-slate-50/50 dark:bg-slate-800/10">
                              <th className="py-3 px-6 font-semibold uppercase">RFQ Code</th>
                              <th className="py-3 px-6 font-semibold uppercase">Campaign Title</th>
                                                            <th className="py-3 px-6 font-semibold uppercase">Sample Images</th>
                              <th className="py-3 px-6 font-semibold uppercase">Item Type</th>
                              <th className="py-3 px-6 font-semibold uppercase text-center">Suppliers</th>
                              <th className="py-3 px-6 font-semibold uppercase text-center">Bids</th>
                              <th className="py-3 px-6 font-semibold uppercase">Deadline</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredRfqs.map(rfq => (
                              <tr
                                key={rfq.id}
                                className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition cursor-pointer"
                                onClick={() => setViewingRfq(rfq)}
                              >
                                <td className="py-4 px-6 font-mono font-bold text-slate-900 dark:text-white">{highlightText(rfq.rfq_code, searchQuery)}</td>
                                <td className="py-4 px-6 font-medium text-slate-800 dark:text-slate-200">{highlightText(rfq.title, searchQuery)}</td>
                                <td className="py-4 px-6">
                                  <div className="flex gap-1 overflow-x-auto max-w-[120px]">
                                    {rfq.product_images && rfq.product_images.map((img, idx) => (
                                      <a
                                        key={idx}
                                        href={img}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <img src={img} className="h-8 w-8 object-cover rounded border border-slate-200 dark:border-slate-700 hover:scale-105 transition" alt="Boss request" />
                                      </a>
                                    ))}
                                    {(!rfq.product_images || rfq.product_images.length === 0) && <span className="text-slate-400 italic text-[10px]">None</span>}
                                  </div>
                                </td>
                                <td className="py-4 px-6">{getRfqItemTypeBadge(rfq.item_type)}</td>
                                {(() => {
                                  const rfqBids = bids.filter(b => b.rfq_id === rfq.id)
                                  const suppliersCount = new Set(rfqBids.map(b => b.supplier_id)).size
                                  const bidsCount = rfqBids.length
                                  return (
                                    <>
                                      <td className="py-4 px-6 text-center font-bold text-slate-700 dark:text-slate-350">{suppliersCount}</td>
                                      <td className="py-4 px-6 text-center font-bold text-[#5c59e9]">{bidsCount}</td>
                                    </>
                                  )
                                })()}
                                <td className="py-4 px-6 text-slate-500">{new Date(rfq.deadline).toLocaleDateString()}</td>
                              </tr>
                            ))}

                            {filteredRfqs.length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                                  No RFQ campaigns yet. Create one with the button above!
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>


                </div>

              </div>
            </div>
          )}

          {/* Suppliers Tab */}
          {activeTab === 'suppliers' && (
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <CardTitle className="text-lg font-bold">Suppliers List</CardTitle>
                  <CardDescription className="text-xs">Manage and view details of partner suppliers</CardDescription>
                </div>
                {userRole !== 'boss' && (
                  <Button onClick={() => setShowAddSupplier(true)} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-8 rounded-lg shadow-sm">
                    <Plus size={14} className="mr-1" /> Add Supplier
                  </Button>
                )}
              </CardHeader>
              
              <div className="flex flex-col sm:flex-row gap-3 p-4 bg-slate-50/50 dark:bg-slate-800/10 border-b border-slate-100 dark:border-slate-800 text-xs">
                {/* Search box for Suppliers */}
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    type="search"
                    placeholder="Search by name or Tax Code..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 h-9 rounded-lg text-xs"
                  />
                </div>
                
                {/* Filter dropdown */}
                <div className="flex items-center gap-2">
                  <Label htmlFor="supp_type_filt" className="text-xs font-semibold text-slate-500 shrink-0">Item Type:</Label>
                  <select
                    id="supp_type_filt"
                    value={supplierTypeFilter}
                    onChange={e => setSupplierTypeFilter(e.target.value)}
                    className="border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none min-w-[140px]"
                  >
                    <option value="all">All Supply Types</option>
                    <option value="raw_material">Raw Material</option>
                    <option value="finished_good">Finished Good</option>
                    <option value="both">Both</option>
                  </select>
                </div>
              </div>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 bg-slate-50/50 dark:bg-slate-800/10 select-none">
                        <th onClick={() => handleSupplierSort('company_name')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition">
                          Supplier Name {renderSupplierSortIcon('company_name')}
                        </th>
                        <th onClick={() => handleSupplierSort('tax_code')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition">
                          Tax Code {renderSupplierSortIcon('tax_code')}
                        </th>
                        <th onClick={() => handleSupplierSort('supply_type')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition">
                          Supply type {renderSupplierSortIcon('supply_type')}
                        </th>
                        <th className="py-3 px-6 font-semibold uppercase">Representative</th>
                        <th className="py-3 px-6 font-semibold uppercase">Contact Email</th>
                        <th className="py-3 px-6 font-semibold uppercase">Address</th>
                        <th className="py-3 px-6 font-semibold uppercase">Website</th>
                        <th onClick={() => handleSupplierSort('created_at')} className="py-3 px-6 font-semibold uppercase text-right cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition">
                          Created Date {renderSupplierSortIcon('created_at')}
                        </th>
                        <th className="py-3 px-6 font-semibold uppercase text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {processedSuppliers.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition">
                          <td className="py-4 px-6 font-semibold text-[#5c59e9] hover:underline cursor-pointer" onClick={() => setSelectedSupplierForBid(s)}>{highlightText(s.company_name, searchQuery)}</td>
                          <td className="py-4 px-6 font-mono font-bold">{highlightText(s.tax_code, searchQuery)}</td>
                          <td className="py-4 px-6">{getSupplierSupplyTypeBadge(s.supply_type)}</td>
                          <td className="py-4 px-6">{s.contact_name ? highlightText(s.contact_name, searchQuery) : 'N/A'}</td>
                          <td className="py-4 px-6 text-slate-500">{s.contact_email}</td>
                          <td className="py-4 px-6 text-slate-500 max-w-[150px] truncate">{s.address}</td>
                          <td className="py-4 px-6 text-slate-500">
                            {s.website ? (
                              <a href={s.website} target="_blank" rel="noreferrer" className="text-[#5c59e9] hover:underline">
                                Link
                              </a>
                            ) : 'N/A'}
                          </td>
                          <td className="py-4 px-6 text-right text-slate-400 font-mono text-[10px]">
                            {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <Button
                              onClick={() => setSelectedSupplierForBid(s)}
                              className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-[10px] font-semibold h-7 px-3 rounded-lg shadow-sm"
                            >
                              Update Bid
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {processedSuppliers.length === 0 && (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                            No suppliers match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* RFQs Tab */}
          {activeTab === 'rfqs' && (
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 bg-slate-50/50 dark:bg-slate-800/10">
                        <th className="py-3 px-6 font-semibold uppercase">RFQ Code</th>
                        <th className="py-3 px-6 font-semibold uppercase">RFQ Title</th>
                        <th className="py-3 px-6 font-semibold uppercase">Sample Images</th>
                        <th className="py-3 px-6 font-semibold uppercase">Campaign type</th>
                        <th className="py-3 px-6 font-semibold uppercase text-center">Suppliers</th>
                        <th className="py-3 px-6 font-semibold uppercase text-center">Bids</th>
                        <th className="py-3 px-6 font-semibold uppercase">Submission Deadline</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredRfqs.map(r => (
                        <tr
                          key={r.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition cursor-pointer"
                          onClick={() => setViewingRfq(r)}
                        >
                          <td className="py-4 px-6 font-mono font-bold text-slate-900 dark:text-white">{highlightText(r.rfq_code, searchQuery)}</td>
                          <td className="py-4 px-6 font-semibold text-[#5c59e9] hover:underline cursor-pointer" onClick={(e) => { e.stopPropagation(); setNewBid(prev => ({ ...prev, rfq_id: r.id })); setActiveTab('dashboard'); }}>{highlightText(r.title, searchQuery)}</td>
                          <td className="py-4 px-6">
                            <div className="flex gap-1 overflow-x-auto max-w-[120px]">
                              {r.product_images && r.product_images.map((img, idx) => (
                                <a
                                  key={idx}
                                  href={img}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <img src={img} className="h-8 w-8 object-cover rounded border border-slate-200 dark:border-slate-700 hover:scale-105 transition" alt="Boss request" />
                                </a>
                              ))}
                              {(!r.product_images || r.product_images.length === 0) && <span className="text-slate-400 italic text-[10px]">None</span>}
                            </div>
                          </td>
                          <td className="py-4 px-6">{getRfqItemTypeBadge(r.item_type)}</td>
                          {(() => {
                            const rfqBids = bids.filter(b => b.rfq_id === r.id)
                            const suppliersCount = new Set(rfqBids.map(b => b.supplier_id)).size
                            const bidsCount = rfqBids.length
                            return (
                              <>
                                <td className="py-4 px-6 text-center font-bold text-slate-700 dark:text-slate-350">{suppliersCount}</td>
                                <td className="py-4 px-6 text-center font-bold text-[#5c59e9]">{bidsCount}</td>
                              </>
                            )
                          })()}
                          <td className="py-4 px-6 text-slate-500">{new Date(r.deadline).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bids Tab */}
          {activeTab === 'bids' && (
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <CardTitle className="text-lg font-bold">List of Received Bids</CardTitle>
                  <CardDescription className="text-xs">Track, edit, and manage supplier bids</CardDescription>
                </div>
                {userRole !== 'boss' && (
                  <div className="flex gap-2">
                    <Button onClick={() => setShowAddBid(true)} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-8 rounded-lg shadow-sm cursor-pointer">
                      <Plus size={14} className="mr-1" /> Add New Bid
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 bg-slate-50/50 dark:bg-slate-800/10">
                        <th onClick={() => handleBidSort('rfq_code')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition select-none">
                          RFQ Code {renderBidSortIcon('rfq_code')}
                        </th>
                        <th onClick={() => handleBidSort('rfq_title')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition select-none">
                          Product Name {renderBidSortIcon('rfq_title')}
                        </th>
                        <th onClick={() => handleBidSort('supplier_name')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition select-none">
                          Supplier {renderBidSortIcon('supplier_name')}
                        </th>
                        <th onClick={() => handleBidSort('unit_price')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition select-none">
                          Unit Price {renderBidSortIcon('unit_price')}
                        </th>
                        <th onClick={() => handleBidSort('vat_percentage')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition select-none">
                          VAT {renderBidSortIcon('vat_percentage')}
                        </th>
                        <th onClick={() => handleBidSort('lead_time_days')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition select-none">
                          Delivery Time {renderBidSortIcon('lead_time_days')}
                        </th>
                        <th className="py-3 px-6 font-semibold uppercase select-none">Search Source</th>
                        <th className="py-3 px-6 font-semibold uppercase select-none">Actual Vendor Images</th>
                        <th onClick={() => handleBidSort('note')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition select-none">
                          Internal Note {renderBidSortIcon('note')}
                        </th>
                        <th onClick={() => handleBidSort('status')} className="py-3 px-6 font-semibold uppercase cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition select-none">
                          Status {renderBidSortIcon('status')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredBids.map(b => (
                        <tr
                          key={b.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition cursor-pointer"
                          onClick={() => {
                            setEditBid({
                              id: b.id,
                              rfq_id: b.rfq_id,
                              supplier_id: b.supplier_id,
                              unit_price: String(b.unit_price),
                              vat_percentage: String(b.vat_percentage),
                              lead_time_days: String(b.lead_time_days),
                              supplier_notes: b.supplier_notes || '',
                              moq_offered: b.moq_offered ? String(b.moq_offered) : '',
                              delivery_tolerance_pct: b.delivery_tolerance_pct ? String(b.delivery_tolerance_pct) : '',
                              warranty_months: b.warranty_months ? String(b.warranty_months) : '',
                              return_policy: b.return_policy || '',
                              supplier_source_url: b.supplier_source_url || '',
                              supplier_product_image: b.supplier_product_image || '',
                              status: b.status,
                              note: b.note || '',
                              note_history: b.note_history || []
                            })
                            setEditingBid(b)
                            setShowUpdateBidModal(true)
                          }}
                        >
                          <td className="py-4 px-6 font-mono text-xs">{highlightText(b.rfq_code, searchQuery)}</td>
                          <td className="py-4 px-6 font-medium text-slate-700 dark:text-slate-350 max-w-[200px] truncate" title={b.rfq_title}>
                            {highlightText(b.rfq_title, searchQuery)}
                          </td>
                          <td className="py-4 px-6 font-semibold text-slate-900 dark:text-white">{highlightText(b.supplier_name, searchQuery)}</td>
                          <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">USD ${b.unit_price.toFixed(2)}</td>
                          <td className="py-4 px-6 text-slate-500">{b.vat_percentage}%</td>
                          <td className="py-4 px-6 text-slate-500">{b.lead_time_days} Days</td>
                          <td className="py-4 px-6 text-slate-500">
                            {b.supplier_source_url ? (
                              <a href={b.supplier_source_url} target="_blank" rel="noreferrer" className="text-[#5c59e9] hover:underline font-semibold" onClick={e => e.stopPropagation()}>
                                Alibaba/1688...
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-slate-500">
                            {b.supplier_product_image ? (
                              <a href={b.supplier_product_image} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                <img src={b.supplier_product_image} className="h-8 w-8 object-cover rounded border border-slate-200 dark:border-slate-700 hover:scale-105 transition" alt="Supplier actual" />
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">None</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-slate-500 max-w-[150px] truncate">
                            {b.note ? (
                              <span>{b.note}</span>
                            ) : (
                              <span className="text-slate-400 italic">No notes yet</span>
                            )}
                          </td>
                          <td className="py-4 px-6">{getBidStatusBadge(b.status)}</td>
                        </tr>
                      ))}
                      {filteredBids.length === 0 && (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-slate-400 italic">
                            No bids received yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden p-6 max-w-xl">
              <h3 className="text-base font-bold mb-4">Sourcing System Settings</h3>
              <div className="space-y-4 text-xs">
                <div className="flex justify-between border-b pb-3 items-center">
                  <div>
                    <p className="font-semibold">Software License</p>
                    <p className="text-slate-400 text-[10px]">Tr-Sourcing Enterprise Edition</p>
                  </div>
                  <Badge className="bg-teal-50 text-teal-700">v1.2.0 Active</Badge>
                </div>
                <div className="flex justify-between border-b pb-3 items-center">
                  <div>
                    <p className="font-semibold">Linked Supabase Token</p>
                    <p className="text-slate-400 text-[10px]">sbp_43b2cf63...5a5b07c31b3d</p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700">Configured</Badge>
                </div>
              </div>
            </Card>
          )}

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODALS FOR ADDING DATA */}
      {/* ========================================================================= */}

      {/* Supplier Detail & Add Bid Modal */}
      {selectedSupplierForBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className={`w-full ${userRole !== 'boss' ? 'max-w-4xl' : 'max-w-md'} border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg bg-white dark:bg-slate-900 overflow-hidden`}>
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <CardTitle className="text-base font-bold">Supplier Details & Update Bids</CardTitle>
                <CardDescription className="text-xs">{selectedSupplierForBid.company_name}</CardDescription>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSelectedSupplierForBid(null)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[80vh] overflow-y-auto pt-4 p-6">
              <div className={`grid grid-cols-1 ${userRole !== 'boss' ? 'md:grid-cols-2 gap-6 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800' : ''}`}>
                
                {/* Left column: Supplier Information & Bid History */}
                <div className="space-y-6 pb-6 md:pb-0">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Contact Information</h4>
                    <div className="space-y-2 text-xs">
                      <div><span className="font-semibold text-slate-500">Tax Code:</span> <span className="font-mono font-bold">{selectedSupplierForBid.tax_code}</span></div>
                      <div><span className="font-semibold text-slate-500">Contact Person:</span> {selectedSupplierForBid.contact_name || 'N/A'}</div>
                      <div><span className="font-semibold text-slate-500">Email:</span> {selectedSupplierForBid.contact_email}</div>
                      <div><span className="font-semibold text-slate-500">Phone:</span> {selectedSupplierForBid.contact_phone || 'N/A'}</div>
                      <div><span className="font-semibold text-slate-500">Address:</span> {selectedSupplierForBid.address}</div>
                      <div>
                        <span className="font-semibold text-slate-500">Website:</span>{' '}
                        {selectedSupplierForBid.website ? (
                          <a href={selectedSupplierForBid.website} target="_blank" rel="noreferrer" className="text-[#5c59e9] hover:underline">
                            {selectedSupplierForBid.website}
                          </a>
                        ) : 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Supplier Bid History</h4>
                    <div className="overflow-x-auto max-h-[220px] border rounded-lg bg-slate-50/50 dark:bg-slate-800/10">
                      <table className="w-full text-left border-collapse text-[10px]">
                        <thead>
                          <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 bg-slate-50 dark:bg-slate-800/20">
                            <th className="py-2 px-3 font-semibold">RFQ Code</th>
                            <th className="py-2 px-3 font-semibold text-right">Unit Price</th>
                            <th className="py-2 px-3 font-semibold text-center">Duration</th>
                            <th className="py-2 px-3 font-semibold text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {bids.filter(b => b.supplier_id === selectedSupplierForBid.id).map(b => (
                            <tr key={b.id} className="hover:bg-slate-100/55 dark:hover:bg-slate-850/55 transition">
                              <td className="py-2 px-3 font-mono font-semibold">{b.rfq_code}</td>
                              <td className="py-2 px-3 font-bold text-right text-slate-900 dark:text-white">USD ${b.unit_price.toFixed(2)}</td>
                              <td className="py-2 px-3 text-center text-slate-500">{b.lead_time_days} days</td>
                              <td className="py-2 px-3 text-right">{getBidStatusBadge(b.status)}</td>
                            </tr>
                          ))}
                          {bids.filter(b => b.supplier_id === selectedSupplierForBid.id).length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-4 text-center text-slate-400 italic">No bids from this supplier yet.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {userRole !== 'boss' && (
                  /* Right column: Form to submit new bid */
                  <div className="pt-6 md:pt-0 md:pl-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Add New Bid</h4>
                    <form onSubmit={async (e) => {
                      newBid.supplier_id = selectedSupplierForBid.id
                      await handleAddBid(e)
                      setSelectedSupplierForBid(null)
                    }} className="space-y-3">
                      
                      <div className="space-y-1">
                        <Label htmlFor="bid_rfq_sel" className="text-xs font-semibold">Select RFQ Campaign</Label>
                        <select
                          id="bid_rfq_sel"
                          value={newBid.rfq_id}
                          onChange={e => setNewBid({...newBid, rfq_id: e.target.value})}
                          className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                          required
                        >
                          <option value="">-- Select RFQ campaign --</option>
                          {rfqs.map(r => (
                            <option key={r.id} value={r.id}>{r.title} ({r.rfq_code})</option>
                          ))}
                        </select>
                      </div>

                      {/* Display sample images from Boss for reference */}
                      {selectedRfqForBid && (
                        <div className="space-y-1">
                          <Label className="text-[10px] font-semibold text-slate-500 block">Product sample images from Boss (reference)</Label>
                          <div className="flex flex-wrap items-center gap-2 border p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                            {selectedRfqForBid.product_images && selectedRfqForBid.product_images.map((img, idx) => (
                              <a key={idx} href={img} target="_blank" rel="noreferrer" className="shrink-0">
                                <img src={img} className="h-10 w-10 object-cover rounded border border-slate-200 dark:border-slate-700" alt="Boss request" />
                              </a>
                            ))}
                            {(!selectedRfqForBid.product_images || selectedRfqForBid.product_images.length === 0) && (
                              <span className="text-slate-400 italic text-[10px]">No sample images</span>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label htmlFor="b_prc" className="text-xs font-semibold">Offered unit price (USD)</Label>
                          <Input id="b_prc" type="number" step="0.01" required placeholder="e.g. 350.00" value={newBid.unit_price} onChange={e => setNewBid({...newBid, unit_price: e.target.value})} className="h-9 text-xs rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="b_v_pct" className="text-xs font-semibold">VAT Rate (%)</Label>
                          <Input id="b_v_pct" type="number" step="0.01" value={newBid.vat_percentage} onChange={e => setNewBid({...newBid, vat_percentage: e.target.value})} className="h-9 text-xs rounded-lg" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="b_time" className="text-xs font-semibold">Delivery lead time (Days)</Label>
                        <Input id="b_time" type="number" required placeholder="e.g. 15" value={newBid.lead_time_days} onChange={e => setNewBid({...newBid, lead_time_days: e.target.value})} className="h-9 text-xs rounded-lg" />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="b_note_text" className="text-xs font-semibold">Notes from Supplier</Label>
                        <Input id="b_note_text" placeholder="Technical or payment notes..." value={newBid.supplier_notes} onChange={e => setNewBid({...newBid, supplier_notes: e.target.value})} className="h-9 text-xs rounded-lg" />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="b_source_url" className="text-xs font-semibold">Product source link (Alibaba, 1688...)</Label>
                        <Input id="b_source_url" placeholder="https://vietnamese.alibaba.com/product-detail/..." value={newBid.supplier_source_url || ''} onChange={e => setNewBid({...newBid, supplier_source_url: e.target.value})} className="h-9 text-xs rounded-lg" />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="b_prod_img" className="text-xs font-semibold">Actual images from Supplier</Label>
                        <div className="flex items-center gap-3">
                          <input
                            type="file"
                            id="b_prod_img_modal"
                            accept="image/*"
                            onChange={handleBidImageUpload}
                            className="hidden"
                            disabled={isUploading}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById('b_prod_img_modal')?.click()}
                            className="h-9 text-xs rounded-lg cursor-pointer flex items-center gap-1.5 border-dashed"
                            disabled={isUploading}
                          >
                            <PlusCircle size={14} /> Select actual image
                          </Button>
                          {newBid.supplier_product_image && (
                            <div className="relative group h-9 w-9 border rounded overflow-hidden shadow-sm shrink-0">
                              <img src={newBid.supplier_product_image} className="h-full w-full object-cover" alt="Actual supplier" />
                              <button
                                type="button"
                                onClick={() => setNewBid(prev => ({ ...prev, supplier_product_image: '' }))}
                                className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          )}
                          {isUploading && !newBid.supplier_product_image && (
                            <div className="h-9 w-9 flex items-center justify-center border rounded bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 animate-pulse">
                              <RefreshCw size={14} className="animate-spin text-slate-400" />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="b_internal_note" className="text-xs font-semibold">Internal Note</Label>
                        <textarea
                          id="b_internal_note"
                          placeholder="Internal notes (evaluations, working with supplier...)"
                          value={newBid.note || ''}
                          onChange={e => setNewBid({...newBid, note: e.target.value})}
                          className="w-full min-h-[70px] border border-slate-200 bg-background rounded-lg p-2 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                        />
                      </div>

                      <Button type="submit" disabled={isLoading} className="w-full bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg mt-3">
                        {isLoading ? 'Submitting bid...' : 'Submit Bid'}
                      </Button>
                    </form>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODALS FOR ADDING DATA */}
      {/* ========================================================================= */}

      {/* Add RFQ Modal */}
      {showAddRfq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold">Create New RFQ Campaign</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddRfq(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[85vh] overflow-y-auto pt-4">
              <form onSubmit={handleAddRfq} className="space-y-4">
                
                <div className="space-y-1">
                  <Label htmlFor="new_rfq_c" className="text-xs font-semibold">RFQ Campaign Code (Auto-generated)</Label>
                  <Input id="new_rfq_c" readOnly placeholder="Auto-generated RFQ code..." value={newRfq.rfq_code} className="h-9 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 cursor-not-allowed font-mono font-bold" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_t" className="text-xs font-semibold">RFQ Title</Label>
                  <Input id="new_rfq_t" required placeholder="e.g. Supply of kiln-dried red oak" value={newRfq.title} onChange={e => setNewRfq({...newRfq, title: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'staff'} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_type" className="text-xs font-semibold">RFQ Campaign Type</Label>
                  <select
                    id="new_rfq_type"
                    value={newRfq.item_type}
                    onChange={e => {
                      const nextType = e.target.value as 'raw_material' | 'finished_good'
                      setNewRfq(prev => ({
                        ...prev,
                        item_type: nextType,
                        rfq_code: generateRandomRfqCode(nextType)
                      }))
                    }}
                    className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                    disabled={userRole === 'staff'}
                  >
                    <option value="raw_material">Raw Material (Raw Material)</option>
                    <option value="finished_good">Finished Good (Finished Good)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_dead" className="text-xs font-semibold">Quotation submission deadline</Label>
                  <Input id="new_rfq_dead" type="datetime-local" required value={newRfq.deadline} onChange={e => setNewRfq({...newRfq, deadline: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'staff'} />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold block">Sample Images</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="file"
                      id="new_rfq_images"
                      multiple
                      accept="image/*"
                      onChange={handleRfqImageUpload}
                      className="hidden"
                      disabled={isUploading || userRole === 'staff'}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('new_rfq_images')?.click()}
                      className="h-9 text-xs rounded-lg cursor-pointer flex items-center gap-1.5 border-dashed"
                      disabled={isUploading || userRole === 'staff'}
                    >
                      <PlusCircle size={14} /> Upload image
                    </Button>
                    
                    {newRfq.product_images && newRfq.product_images.map((img, idx) => (
                      <div key={idx} className="relative group h-9 w-9 border rounded overflow-hidden shadow-sm shrink-0">
                        <img src={img} className="h-full w-full object-cover" alt="sample image" />
                        <button
                          type="button"
                          onClick={() => removeRfqImage(idx)}
                          className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                          disabled={userRole === 'staff'}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    
                    {isUploading && (
                      <div className="h-9 w-9 flex items-center justify-center border rounded bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 animate-pulse">
                        <RefreshCw size={14} className="animate-spin text-slate-400" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_note" className="text-xs font-semibold">Requirements</Label>
                  <textarea id="new_rfq_note" placeholder="Specific requirements from Boss about origin, quality..." value={newRfq.sourcing_note || ''} onChange={e => setNewRfq({...newRfq, sourcing_note: e.target.value})} className="w-full min-h-[60px] border border-slate-200 bg-background rounded-lg p-2 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none" disabled={userRole === 'staff'} />
                </div>





                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button type="button" variant="outline" onClick={() => setShowAddRfq(false)}>Cancel</Button>
                  <Button type="submit" disabled={isLoading || userRole === 'staff'} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg">
                    {isLoading ? 'Creating...' : 'Create RFQ'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold">Add New Supplier</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddSupplier(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[85vh] overflow-y-auto pt-4">
              <form onSubmit={handleAddSupplier} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="s_cn" className="text-xs font-semibold">Company / Supplier Name</Label>
                  <Input id="s_cn" required placeholder="Viet My Wood Co., Ltd" value={newSupplier.company_name} onChange={e => setNewSupplier({...newSupplier, company_name: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_tc" className="text-xs font-semibold">Tax Code</Label>
                  <Input id="s_tc" required placeholder="0102030405" value={newSupplier.tax_code} onChange={e => setNewSupplier({...newSupplier, tax_code: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_ad" className="text-xs font-semibold">Headquarters address</Label>
                  <Input id="s_ad" required placeholder="Binh Duong, HCMC..." value={newSupplier.address} onChange={e => setNewSupplier({...newSupplier, address: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="s_cnm" className="text-xs font-semibold">Representative Name</Label>
                    <Input id="s_cnm" placeholder="Nguyen Van A" value={newSupplier.contact_name} onChange={e => setNewSupplier({...newSupplier, contact_name: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="s_cph" className="text-xs font-semibold">Phone Number</Label>
                    <Input id="s_cph" placeholder="0901234567" value={newSupplier.contact_phone} onChange={e => setNewSupplier({...newSupplier, contact_phone: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_cem" className="text-xs font-semibold">Contact Email</Label>
                  <Input id="s_cem" type="email" required placeholder="sales@govietmy.com" value={newSupplier.contact_email} onChange={e => setNewSupplier({...newSupplier, contact_email: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_web" className="text-xs font-semibold">Website (optional)</Label>
                  <Input id="s_web" placeholder="https://govietmy.com" value={newSupplier.website} onChange={e => setNewSupplier({...newSupplier, website: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_stype" className="text-xs font-semibold">Supply type</Label>
                  <select
                    id="s_stype"
                    value={newSupplier.supply_type || 'both'}
                    onChange={e => setNewSupplier({...newSupplier, supply_type: e.target.value as any})}
                    className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                    disabled={userRole === 'boss'}
                  >
                    <option value="both">Both (Raw Material & Finished Good)</option>
                    <option value="raw_material">Raw Material (Raw Material)</option>
                    <option value="finished_good">Finished Good (Finished Good)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button type="button" variant="outline" onClick={() => setShowAddSupplier(false)}>Cancel</Button>
                  <Button type="submit" disabled={isLoading || userRole === 'boss'} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg">
                    {isLoading ? 'Creating...' : 'Add Supplier'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Bid Modal from Scratch */}
      {showAddBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg bg-white dark:bg-slate-900">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold">Add New Bid</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddBid(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[85vh] overflow-y-auto pt-4">
              <form onSubmit={handleAddBid} className="space-y-4">
                
                <div className="space-y-1">
                  <Label htmlFor="add_bid_supp" className="text-xs font-semibold">Select Supplier</Label>
                  <select
                    id="add_bid_supp"
                    value={newBid.supplier_id}
                    onChange={e => setNewBid({...newBid, supplier_id: e.target.value})}
                    className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                    required
                    disabled={userRole === 'boss'}
                  >
                    <option value="">-- Select supplier --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.company_name} (MST: {s.tax_code})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add_bid_rfq" className="text-xs font-semibold">Select RFQ Campaign</Label>
                  <select
                    id="add_bid_rfq"
                    value={newBid.rfq_id}
                    onChange={e => setNewBid({...newBid, rfq_id: e.target.value})}
                    className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                    required
                    disabled={userRole === 'boss'}
                  >
                    <option value="">-- Select RFQ campaign --</option>
                    {rfqs.map(r => (
                      <option key={r.id} value={r.id}>{r.title} ({r.rfq_code})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="add_b_prc" className="text-xs font-semibold">Offered unit price (USD)</Label>
                    <Input id="add_b_prc" type="number" step="0.01" required placeholder="e.g. 350.00" value={newBid.unit_price} onChange={e => setNewBid({...newBid, unit_price: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="add_b_v_pct" className="text-xs font-semibold">VAT Rate (%)</Label>
                    <Input id="add_b_v_pct" type="number" step="0.01" value={newBid.vat_percentage} onChange={e => setNewBid({...newBid, vat_percentage: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add_b_time" className="text-xs font-semibold">Delivery lead time (Days)</Label>
                  <Input id="add_b_time" type="number" required placeholder="e.g. 15" value={newBid.lead_time_days} onChange={e => setNewBid({...newBid, lead_time_days: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add_b_note_text" className="text-xs font-semibold">Notes from Supplier</Label>
                  <Input id="add_b_note_text" placeholder="Technical or payment notes..." value={newBid.supplier_notes} onChange={e => setNewBid({...newBid, supplier_notes: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add_b_source_url" className="text-xs font-semibold">Product source link</Label>
                  <Input id="add_b_source_url" placeholder="https://vietnamese.alibaba.com/..." value={newBid.supplier_source_url || ''} onChange={e => setNewBid({...newBid, supplier_source_url: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add_b_prod_img" className="text-xs font-semibold">Actual images from Supplier</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      id="add_b_prod_img_input"
                      accept="image/*"
                      onChange={handleBidImageUpload}
                      className="hidden"
                      disabled={isUploading || userRole === 'boss'}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('add_b_prod_img_input')?.click()}
                      className="h-9 text-xs rounded-lg cursor-pointer flex items-center gap-1.5 border-dashed"
                      disabled={isUploading || userRole === 'boss'}
                    >
                      <PlusCircle size={14} /> Select actual image
                    </Button>
                    {newBid.supplier_product_image && (
                      <div className="relative group h-9 w-9 border rounded overflow-hidden shadow-sm shrink-0">
                        <img src={newBid.supplier_product_image} className="h-full w-full object-cover" alt="Actual supplier" />
                        <button
                          type="button"
                          onClick={() => setNewBid(prev => ({ ...prev, supplier_product_image: '' }))}
                          className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                          disabled={userRole === 'boss'}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    {isUploading && !newBid.supplier_product_image && (
                      <div className="h-9 w-9 flex items-center justify-center border rounded bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 animate-pulse">
                        <RefreshCw size={14} className="animate-spin text-slate-400" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="add_b_internal_note" className="text-xs font-semibold">Internal Note</Label>
                  <textarea
                    id="add_b_internal_note"
                    placeholder="Internal notes (evaluations, working with supplier...)"
                    value={newBid.note || ''}
                    onChange={e => setNewBid({...newBid, note: e.target.value})}
                    className="w-full min-h-[70px] border border-slate-200 bg-background rounded-lg p-2 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                    disabled={userRole === 'boss'}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button type="button" variant="outline" onClick={() => setShowAddBid(false)}>Cancel</Button>
                  <Button type="submit" disabled={isLoading || userRole === 'boss'} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg">
                    {isLoading ? 'Creating...' : 'Add Bid'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Update Bid Modal */}
      {showUpdateBidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg bg-white dark:bg-slate-900">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold">Update Bid Information</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowUpdateBidModal(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[85vh] overflow-y-auto pt-4">
              <form onSubmit={handleUpdateBid} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="edit_bid_supp" className="text-xs font-semibold">Supplier</Label>
                  <select
                    id="edit_bid_supp"
                    value={editBid.supplier_id}
                    className="w-full border border-slate-200 bg-slate-50 dark:bg-slate-800 h-9 rounded-lg px-3 text-xs cursor-not-allowed"
                    disabled
                  >
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.company_name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_bid_rfq" className="text-xs font-semibold">RFQ Campaign</Label>
                  <select
                    id="edit_bid_rfq"
                    value={editBid.rfq_id}
                    className="w-full border border-slate-200 bg-slate-50 dark:bg-slate-800 h-9 rounded-lg px-3 text-xs cursor-not-allowed"
                    disabled
                  >
                    {rfqs.map(r => (
                      <option key={r.id} value={r.id}>{r.title} ({r.rfq_code})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="edit_b_prc" className="text-xs font-semibold">Offered unit price (USD)</Label>
                    <Input id="edit_b_prc" type="number" step="0.01" required placeholder="e.g. 350.00" value={editBid.unit_price} onChange={e => setEditBid({...editBid, unit_price: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="edit_b_v_pct" className="text-xs font-semibold">VAT Rate (%)</Label>
                    <Input id="edit_b_v_pct" type="number" step="0.01" value={editBid.vat_percentage} onChange={e => setEditBid({...editBid, vat_percentage: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_b_time" className="text-xs font-semibold">Delivery lead time (Days)</Label>
                  <Input id="edit_b_time" type="number" required placeholder="e.g. 15" value={editBid.lead_time_days} onChange={e => setEditBid({...editBid, lead_time_days: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_b_note_text" className="text-xs font-semibold">Notes from Supplier</Label>
                  <Input id="edit_b_note_text" placeholder="Technical or payment notes..." value={editBid.supplier_notes} onChange={e => setEditBid({...editBid, supplier_notes: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_bid_status" className="text-xs font-semibold">Bid Status</Label>
                  <select
                    id="edit_bid_status"
                    value={editBid.status}
                    onChange={e => setEditBid({...editBid, status: e.target.value as any})}
                    className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                    required
                    disabled={userRole === 'staff'}
                  >
                    <option value="draft">Draft</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="awarded">Awarded</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_b_source_url" className="text-xs font-semibold">Product source link</Label>
                  <Input id="edit_b_source_url" placeholder="https://vietnamese.alibaba.com/..." value={editBid.supplier_source_url || ''} onChange={e => setEditBid({...editBid, supplier_source_url: e.target.value})} className="h-9 text-xs rounded-lg" disabled={userRole === 'boss'} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_b_prod_img" className="text-xs font-semibold">Actual images from Supplier</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      id="edit_b_prod_img_input"
                      accept="image/*"
                      onChange={async (e) => {
                        const files = e.target.files
                        if (!files || files.length === 0) return
                        setIsUploading(true)
                        try {
                          const file = files[0]
                          const formData = new FormData()
                          formData.append('file', file)
                          const res = await fetch('/api/upload', { method: 'POST', body: formData })
                          const data = await res.json()
                          if (data.url) {
                            setEditBid(prev => ({ ...prev, supplier_product_image: data.url }))
                          }
                        } catch (err) {
                          console.error('Bid image upload failed:', err)
                        } finally {
                          setIsUploading(false)
                        }
                      }}
                      className="hidden"
                      disabled={isUploading || userRole === 'boss'}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('edit_b_prod_img_input')?.click()}
                      className="h-9 text-xs rounded-lg cursor-pointer flex items-center gap-1.5 border-dashed"
                      disabled={isUploading || userRole === 'boss'}
                    >
                      <PlusCircle size={14} /> Change image
                    </Button>
                    {editBid.supplier_product_image && (
                      <div className="relative group h-9 w-9 border rounded overflow-hidden shadow-sm shrink-0">
                        <img src={editBid.supplier_product_image} className="h-full w-full object-cover" alt="Actual supplier" />
                        <button
                          type="button"
                          onClick={() => setEditBid(prev => ({ ...prev, supplier_product_image: '' }))}
                          className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                          disabled={userRole === 'boss'}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                    {isUploading && !editBid.supplier_product_image && (
                      <div className="h-9 w-9 flex items-center justify-center border rounded bg-slate-50 border-slate-200 dark:bg-slate-800/10 dark:border-slate-750 animate-pulse">
                        <RefreshCw size={14} className="animate-spin text-slate-400" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_b_internal_note" className="text-xs font-semibold">Internal Note</Label>
                  <textarea
                    id="edit_b_internal_note"
                    placeholder="Internal notes (evaluations, working with supplier...)"
                    value={editBid.note || ''}
                    onChange={e => setEditBid({...editBid, note: e.target.value})}
                    className="w-full min-h-[70px] border border-slate-200 bg-background rounded-lg p-2 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                    disabled={userRole === 'boss'}
                  />
                </div>

                {editBid.note_history && editBid.note_history.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-900 dark:text-white">Note Edit History</Label>
                    <div className="border border-slate-100/70 dark:border-slate-800/70 rounded-xl p-4 max-h-44 overflow-y-auto space-y-3.5 bg-slate-50/40 dark:bg-slate-900/40 text-xs">
                      {editBid.note_history.slice().reverse().map((hist, index) => {
                        const displayName = hist.updated_by ? hist.updated_by.split('@')[0] : 'staff'
                        let displayDate = hist.updated_at
                        try {
                          const d = new Date(hist.updated_at)
                          if (!isNaN(d.getTime())) {
                            const hh = String(d.getHours()).padStart(2, '0')
                            const mm = String(d.getMinutes()).padStart(2, '0')
                            const ss = String(d.getSeconds()).padStart(2, '0')
                            const dd = d.getDate()
                            const MM = d.getMonth() + 1
                            const yyyy = d.getFullYear()
                            displayDate = `${hh}:${mm}:${ss} ${dd}/${MM}/${yyyy}`
                          }
                        } catch (e) {}

                        return (
                          <div key={index} className="border-b border-slate-100/60 dark:border-slate-800/60 last:border-0 pb-3 last:pb-0">
                            <div className="flex justify-between text-[10px] text-slate-400 dark:text-slate-500 mb-1.5 font-normal">
                              <span>{displayName}</span>
                              <span>{displayDate}</span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 font-medium break-all whitespace-pre-wrap text-xs">{hist.note || '(Delete note)'}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                  {userRole !== 'staff' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        handleDeleteBid(editBid.id)
                      }}
                      className="text-rose-600 hover:text-rose-750 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-xs font-semibold h-9 rounded-lg cursor-pointer"
                    >
                      Delete Bid
                    </Button>
                  ) : <div />}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setShowUpdateBidModal(false)}>Cancel</Button>
                    <Button type="submit" disabled={isLoading} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg">
                      {isLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View detailed Bid Modal */}
      {viewingBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg bg-white dark:bg-slate-900">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <CardTitle className="text-base font-bold">Bid Details</CardTitle>
                <CardDescription className="text-xs">Viewing: {viewingBid.rfq_code}</CardDescription>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setViewingBid(null)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[85vh] overflow-y-auto pt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-semibold text-slate-400 block text-[10px] uppercase">Supplier</span>
                  <span className="font-bold text-slate-850 dark:text-slate-100">{viewingBid.supplier_name}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 block text-[10px] uppercase">RFQ Campaign</span>
                  <span className="font-bold text-slate-850 dark:text-slate-100">{viewingBid.rfq_title}</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 border-t pt-3 border-slate-100 dark:border-slate-800">
                <div>
                  <span className="font-semibold text-slate-400 block text-[10px] uppercase">Offered unit price</span>
                  <span className="font-bold text-base text-[#5c59e9]">USD ${viewingBid.unit_price.toFixed(2)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 block text-[10px] uppercase">VAT</span>
                  <span className="font-semibold text-slate-850 dark:text-slate-200">{viewingBid.vat_percentage}%</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-3 border-slate-100 dark:border-slate-800">
                <div>
                  <span className="font-semibold text-slate-400 block text-[10px] uppercase">Delivery Time</span>
                  <span className="font-semibold text-slate-850 dark:text-slate-200">{viewingBid.lead_time_days} days</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-400 block text-[10px] uppercase">Status</span>
                  <span>{getBidStatusBadge(viewingBid.status)}</span>
                </div>
              </div>

              <div className="border-t pt-3 border-slate-100 dark:border-slate-800 space-y-1">
                <span className="font-semibold text-slate-400 block text-[10px] uppercase">Search Source (Sourcing)</span>
                {viewingBid.supplier_source_url ? (
                  <a href={viewingBid.supplier_source_url} target="_blank" rel="noreferrer" className="text-[#5c59e9] hover:underline font-semibold break-all">
                    {viewingBid.supplier_source_url}
                  </a>
                ) : (
                  <span className="text-slate-400 italic">No source link</span>
                )}
              </div>

              {viewingBid.supplier_product_image && (
                <div className="border-t pt-3 border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="font-semibold text-slate-400 block text-[10px] uppercase">Actual images from Supplier</span>
                  <a href={viewingBid.supplier_product_image} target="_blank" rel="noreferrer" className="block max-w-[120px]">
                    <img src={viewingBid.supplier_product_image} className="w-full h-auto object-cover rounded-lg border hover:scale-105 transition" alt="Actual supplier" />
                  </a>
                </div>
              )}

              <div className="border-t pt-3 border-slate-100 dark:border-slate-800 space-y-1">
                <span className="font-semibold text-slate-400 block text-[10px] uppercase">Notes from Supplier</span>
                <p className="bg-slate-50 dark:bg-slate-800/20 p-2.5 rounded-lg text-slate-700 dark:text-slate-350 italic min-h-[40px]">
                  {viewingBid.supplier_notes || 'No notes.'}
                </p>
              </div>


              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button onClick={() => setViewingBid(null)} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg px-4">
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View detailed RFQ Modal */}
      {viewingRfq && (() => {
        const now = new Date()
        const deadlineDate = new Date(viewingRfq.deadline)
        const isExpired = deadlineDate < now
        const timeDiff = deadlineDate.getTime() - now.getTime()
        const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24))

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) setViewingRfq(null)
            }}
          >
            <Card className="w-full max-w-lg border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/10">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#5c59e9]/10 rounded-lg text-[#5c59e9]">
                    <ClipboardList size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">RFQ Campaign Details</CardTitle>
                    <CardDescription className="text-[11px] font-mono font-bold text-[#5c59e9] mt-0.5">{viewingRfq.rfq_code}</CardDescription>
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setViewingRfq(null)} className="h-8 w-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
                  <X size={18} />
                </Button>
              </CardHeader>

              <CardContent className="max-h-[75vh] overflow-y-auto pt-5 pb-5 px-6 space-y-4 text-xs">
                {/* 1. Basic Info */}
                <div className="space-y-3.5">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Campaign Title</span>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 leading-snug">{viewingRfq.title}</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-[10px] block mb-1">Commodity Type</span>
                      {getRfqItemTypeBadge(viewingRfq.item_type)}
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-[10px] block mb-1">Quotation Deadline</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {new Date(viewingRfq.deadline).toLocaleDateString('vi-VN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                        {isExpired ? (
                          <Badge className="bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-0 rounded-full font-medium py-0 px-2 text-[10px]">
                            Expired
                          </Badge>
                        ) : daysLeft <= 3 ? (
                          <Badge className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-0 rounded-full font-medium py-0 px-2 text-[10px]">
                            Urgent ({daysLeft} days)
                          </Badge>
                        ) : (
                          <Badge className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-0 rounded-full font-medium py-0 px-2 text-[10px]">
                            Remaining {daysLeft} days
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Delivery Location</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">{viewingRfq.delivery_location || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Creation Date</span>
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                        {new Date(viewingRfq.created_at).toLocaleDateString('vi-VN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                </div>



                {/* 3. Sourcing notes / Boss instruction */}
                {viewingRfq.sourcing_note && (
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2">
                    <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-[10px]">Special Requirements (from Boss)</span>
                    <div className="bg-slate-50 dark:bg-slate-800/20 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      <p className="text-slate-700 dark:text-slate-350 leading-relaxed whitespace-pre-wrap">{viewingRfq.sourcing_note}</p>
                    </div>
                  </div>
                )}

                {/* 4. Product images */}
                {viewingRfq.product_images && viewingRfq.product_images.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-2">
                    <span className="text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider text-[10px] block">Product Sample Images</span>
                    <div className="grid grid-cols-4 gap-2.5">
                      {viewingRfq.product_images.map((img, idx) => (
                        <a
                          key={idx}
                          href={img}
                          target="_blank"
                          rel="noreferrer"
                          className="aspect-square rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-800 hover:scale-105 transition hover:shadow-md cursor-pointer block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <img src={img} className="w-full h-full object-cover" alt={`Sample Image ${idx + 1}`} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {userRole !== 'staff' && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditRfq({
                          id: viewingRfq.id,
                          rfq_code: viewingRfq.rfq_code,
                          title: viewingRfq.title,
                          item_type: viewingRfq.item_type,
                          deadline: viewingRfq.deadline ? new Date(viewingRfq.deadline).toISOString().slice(0, 16) : '',
                          delivery_location: viewingRfq.delivery_location || 'Kho Tr-Sourcing',
                          raw_material_spec: viewingRfq.raw_material_spec || '',
                          chemical_composition: viewingRfq.chemical_composition || '',
                          finished_good_packaging: viewingRfq.finished_good_packaging || '',
                          product_barcode: viewingRfq.product_barcode || '',
                          sourcing_note: viewingRfq.sourcing_note || '',
                          product_images: viewingRfq.product_images || []
                        })
                        setEditingRfq(viewingRfq)
                        setActiveTab('rfqs')
                        setShowEditRfqModal(true)
                        setViewingRfq(null)
                      }}
                      className="border-slate-200 dark:border-slate-800 text-xs font-semibold h-9 px-4 rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Settings size={14} /> Edit Campaign
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={() => setViewingRfq(null)}
                    className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 px-5 rounded-lg shadow-sm cursor-pointer"
                  >
                    Close Window
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {/* Edit RFQ Modal */}
      {showEditRfqModal && editRfq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg bg-white dark:bg-slate-900">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-white">Chỉnh sửa Chiến dịch RFQ</CardTitle>
                <CardDescription className="text-xs font-mono font-bold text-[#5c59e9] mt-0.5">{editRfq.rfq_code}</CardDescription>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setShowEditRfqModal(false)} className="h-8 w-8 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[80vh] overflow-y-auto pt-4">
              <form onSubmit={handleUpdateRfq} className="space-y-4">
                
                <div className="space-y-1">
                  <Label htmlFor="edit_rfq_t" className="text-xs font-semibold">Tiêu đề RFQ</Label>
                  <Input id="edit_rfq_t" required placeholder="e.g. Cung cấp Gỗ Sồi đỏ xẻ sấy" value={editRfq.title} onChange={e => setEditRfq({...editRfq, title: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_rfq_type" className="text-xs font-semibold">Loại chiến dịch mời thầu</Label>
                  <select
                    id="edit_rfq_type"
                    value={editRfq.item_type}
                    onChange={e => setEditRfq({...editRfq, item_type: e.target.value as any})}
                    className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                  >
                    <option value="raw_material">Nguyên liệu thô (Raw Material)</option>
                    <option value="finished_good">Thành phẩm (Finished Good)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_rfq_dead" className="text-xs font-semibold">Hạn chót nộp báo giá</Label>
                  <Input id="edit_rfq_dead" type="datetime-local" required value={editRfq.deadline} onChange={e => setEditRfq({...editRfq, deadline: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_rfq_loc" className="text-xs font-semibold">Địa điểm bàn giao</Label>
                  <Input id="edit_rfq_loc" placeholder="Kho Tr-Sourcing" value={editRfq.delivery_location} onChange={e => setEditRfq({...editRfq, delivery_location: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>

                {/* Conditional Fields based on item_type */}
                {editRfq.item_type === 'raw_material' ? (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="edit_rfq_spec" className="text-xs font-semibold">Quy cách gỗ / vật tư kỹ thuật</Label>
                      <textarea id="edit_rfq_spec" placeholder="Hàm lượng ẩm, kích thước, phẩm cấp..." value={editRfq.raw_material_spec} onChange={e => setEditRfq({...editRfq, raw_material_spec: e.target.value})} className="w-full min-h-[60px] border border-slate-200 bg-background rounded-lg p-2 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit_rfq_chem" className="text-xs font-semibold">Thành phần hóa lý / tạp chất</Label>
                      <textarea id="edit_rfq_chem" placeholder="Độ co ngót, tỷ lệ khuyết tật tối đa..." value={editRfq.chemical_composition} onChange={e => setEditRfq({...editRfq, chemical_composition: e.target.value})} className="w-full min-h-[60px] border border-slate-200 bg-background rounded-lg p-2 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label htmlFor="edit_rfq_pack" className="text-xs font-semibold">Quy cách đóng gói</Label>
                      <textarea id="edit_rfq_pack" placeholder="Bọc màng co, thùng carton 5 lớp..." value={editRfq.finished_good_packaging} onChange={e => setEditRfq({...editRfq, finished_good_packaging: e.target.value})} className="w-full min-h-[60px] border border-slate-200 bg-background rounded-lg p-2 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit_rfq_barcode" className="text-xs font-semibold">Mã vạch sản phẩm (Barcode)</Label>
                      <Input id="edit_rfq_barcode" placeholder="EAN-13, UPC..." value={editRfq.product_barcode} onChange={e => setEditRfq({...editRfq, product_barcode: e.target.value})} className="h-9 text-xs rounded-lg" />
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <Label className="text-xs font-semibold block">Ảnh mẫu sản phẩm</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="file"
                      id="edit_rfq_images"
                      multiple
                      accept="image/*"
                      onChange={handleEditRfqImageUpload}
                      className="hidden"
                      disabled={isUploading}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('edit_rfq_images')?.click()}
                      className="h-9 text-xs rounded-lg cursor-pointer flex items-center gap-1.5 border-dashed"
                      disabled={isUploading}
                    >
                      <PlusCircle size={14} /> Tải ảnh lên
                    </Button>
                    
                    {editRfq.product_images && editRfq.product_images.map((img, idx) => (
                      <div key={idx} className="relative group h-9 w-9 border rounded overflow-hidden shadow-sm shrink-0">
                        <img src={img} className="h-full w-full object-cover" alt="ảnh mẫu" />
                        <button
                          type="button"
                          onClick={() => removeEditRfqImage(idx)}
                          className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    
                    {isUploading && (
                      <div className="h-9 w-9 flex items-center justify-center border rounded bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 animate-pulse">
                        <RefreshCw size={14} className="animate-spin text-slate-400" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit_rfq_note" className="text-xs font-semibold">Yêu cầu của Sếp</Label>
                  <textarea id="edit_rfq_note" placeholder="Yêu cầu cụ thể từ sếp về xuất xứ, chất lượng..." value={editRfq.sourcing_note || ''} onChange={e => setEditRfq({...editRfq, sourcing_note: e.target.value})} className="w-full min-h-[60px] border border-slate-200 bg-background rounded-lg p-2 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none" />
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button type="button" variant="outline" onClick={() => setShowEditRfqModal(false)}>Hủy</Button>
                  <Button type="submit" disabled={isLoading} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg">
                    {isLoading ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  )
}