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
  Settings,
  PlusCircle,
  X,
  User,
  LogOut,
  HelpCircle,
  FileCheck2,
  ChevronDown,
  AlertTriangle
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
  // New Sếp visual sourcing fields
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
}

export function SourcingDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'rfqs' | 'suppliers' | 'bids' | 'settings'>('dashboard')
  const [user, setUser] = useState<any>(null)
  
  // Search and Loading States
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)

  // Database Data States
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [rfqs, setRfqs] = useState<RFQ[]>([])
  const [bids, setBids] = useState<Bid[]>([])

  // Modal / Form trigger states
  const [showAddRfq, setShowAddRfq] = useState(false)
  const [showAddBid, setShowAddBid] = useState(false)
  const [showAddSupplier, setShowAddSupplier] = useState(false)

  // Form States
  const [newRfq, setNewRfq] = useState({
    rfq_code: '', title: '', item_type: 'raw_material' as 'raw_material' | 'finished_good', deadline: '', delivery_location: '',
    raw_material_spec: '', chemical_composition: '', finished_good_packaging: '', product_barcode: '',
    product_images: [] as string[], sourcing_note: '', assigned_to: ''
  })

  const [newBid, setNewBid] = useState({
    rfq_id: '', supplier_id: '', unit_price: '', vat_percentage: '10.00', lead_time_days: '', supplier_notes: '',
    moq_offered: '', delivery_tolerance_pct: '', warranty_months: '', return_policy: '',
    supplier_source_url: '', supplier_product_image: ''
  })

  const [newSupplier, setNewSupplier] = useState({
    company_name: '', tax_code: '', address: '', website: '', contact_name: '', contact_email: '', contact_phone: ''
  })

  // Selected RFQ type for dynamic bid submission form
  const selectedRfqForBid = rfqs.find(r => r.id === newBid.rfq_id)

  // Mock data fallbacks if DB is completely empty or offline
  const mockSuppliers: Supplier[] = [
    { id: 's-1', company_name: 'Công ty Gỗ Việt Mỹ', tax_code: '0102030405', address: 'Khu Công Nghiệp Sóng Thần, Bình Dương', website: 'https://govietmy.com', contact_name: 'Nguyễn Văn Hùng', contact_email: 'hung.nguyen@govietmy.com', contact_phone: '0901234567', created_at: '2026-06-20' },
    { id: 's-2', company_name: 'Bao Bì Xanh Group', tax_code: '0304050607', address: 'Khu Công Nghiệp Tân Bình, TP. HCM', website: 'https://baobixanh.vn', contact_name: 'Trần Thị Mai', contact_email: 'mai.tran@baobixanh.vn', contact_phone: '0918765432', created_at: '2026-06-21' }
  ]

  const mockRfqs: RFQ[] = [
    { id: 'r-1', rfq_code: 'RFQ-RAW-2026-001', title: 'Cung cấp 100 tấn Gỗ Sồi đỏ xẻ sấy', item_type: 'raw_material', deadline: '2026-07-07', delivery_location: 'Kho gỗ Tr-Sourcing, Đồng Nai', raw_material_spec: 'Gỗ sồi đỏ Mỹ, sấy đạt độ ẩm 12-14%, không mắt đen lớn.', chemical_composition: 'Tạp chất vỏ gỗ < 2%, tỷ lệ nứt đầu < 5%', created_at: '2026-06-23' },
    { id: 'r-2', rfq_code: 'RFQ-FIN-2026-002', title: 'Cung cấp 50,000 Thùng Carton 5 lớp thương hiệu', item_type: 'finished_good', deadline: '2026-07-03', delivery_location: 'Nhà máy Tr-Sourcing, Bình Dương', finished_good_packaging: 'Đóng gói 50 thùng/kiện, quấn màng PE bảo vệ bên ngoài.', product_barcode: '8931234567890', created_at: '2026-06-23' }
  ]

  const mockBids: Bid[] = [
    { id: 'b-1', rfq_id: 'r-1', rfq_code: 'RFQ-RAW-2026-001', rfq_title: 'Cung cấp 100 tấn Gỗ Sồi đỏ xẻ sấy', supplier_id: 's-1', supplier_name: 'Công ty Gỗ Việt Mỹ', unit_price: 350.00, vat_percentage: 10.00, lead_time_days: 15, supplier_notes: 'Chúng tôi đảm bảo gỗ sấy chất lượng cao đạt tiêu chuẩn xuất khẩu.', moq_offered: 10.00, delivery_tolerance_pct: 2.00, evaluation_score: 85, status: 'reviewing', created_at: '2026-06-23' },
    { id: 'b-2', rfq_id: 'r-2', rfq_code: 'RFQ-FIN-2026-002', rfq_title: 'Cung cấp 50,000 Thùng Carton 5 lớp thương hiệu', supplier_id: 's-2', supplier_name: 'Bao Bì Xanh Group', unit_price: 1.20, vat_percentage: 8.00, lead_time_days: 7, supplier_notes: 'Bao bì in offset chất lượng cao, mực in thân thiện môi trường.', warranty_months: 6, return_policy: 'Đổi trả 1-1 đối với sản phẩm rách, lỗi in ấn trong vòng 30 ngày.', evaluation_score: 90, status: 'reviewing', created_at: '2026-06-23' }
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
    }
    checkUser()
  }, [])

  // Create Supplier
  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
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
      setNewSupplier({ company_name: '', tax_code: '', address: '', website: '', contact_name: '', contact_email: '', contact_phone: '' })
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
        sourcing_note: newRfq.sourcing_note,
        assigned_to: newRfq.assigned_to
      }

      if (newRfq.item_type === 'raw_material') {
        payload.raw_material_spec = newRfq.raw_material_spec
        payload.chemical_composition = newRfq.chemical_composition
      } else {
        payload.finished_good_packaging = newRfq.finished_good_packaging
        payload.product_barcode = newRfq.product_barcode
      }

      const { data, error } = await supabase
        .from('rfqs')
        .insert([payload])
        .select()

      if (error) throw error
      await fetchData()
      setNewRfq({
        rfq_code: '', title: '', item_type: 'raw_material', deadline: '', delivery_location: '',
        raw_material_spec: '', chemical_composition: '', finished_good_packaging: '', product_barcode: '',
        product_images: [], sourcing_note: '', assigned_to: ''
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

  // Create Bid
  const handleAddBid = async (e: React.FormEvent) => {
    e.preventDefault()
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
        supplier_product_image: newBid.supplier_product_image || null
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
        supplier_source_url: '', supplier_product_image: ''
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

  const filteredBids = bids.filter(b =>
    b.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.rfq_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.rfq_title?.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
            <span>Chiến dịch RFQs</span>
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === 'suppliers' ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20' : 'hover:bg-[#1a173d] hover:text-white'}`}
          >
            <Building size={18} />
            <span>Nhà cung cấp</span>
          </button>
          <button
            onClick={() => setActiveTab('bids')}
            className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === 'bids' ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20' : 'hover:bg-[#1a173d] hover:text-white'}`}
          >
            <Receipt size={18} />
            <span>Báo giá đã nhận</span>
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-semibold transition-all cursor-pointer ${activeTab === 'settings' ? 'bg-[#5c59e9] text-white shadow-sm shadow-[#5c59e9]/20' : 'hover:bg-[#1a173d] hover:text-white'}`}
          >
            <Settings size={18} />
            <span>Cài đặt hệ thống</span>
          </button>
        </nav>

        {/* Sync & Footer info */}
        <div className="border-t border-[#1e1b4b] p-4 space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Database size={12} className="text-teal-500" /> Database Live
            </span>
            <button onClick={fetchData} disabled={isSyncing} className="hover:text-white transition cursor-pointer">
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
              placeholder={`Tìm kiếm trong ${activeTab}...`}
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
                  title="Đăng xuất"
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
                <p className="font-bold">Supabase Database Offline / Không thể đồng bộ hóa bảng mới</p>
                <p className="mt-1 leading-relaxed text-amber-700/90 dark:text-amber-400/90">
                  Hệ thống không tìm thấy các bảng `suppliers`, `rfqs`, hoặc `bids` trên Supabase (hoặc kết nối bị từ chối). 
                  Chúng tôi hiện đang sử dụng **dữ liệu mô phỏng cao cấp (Premium Mock Data)** hiển thị động ở localhost để bạn test giao diện.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              
              {/* 1. KHỐI TỔNG QUAN (OVERVIEW CARDS) */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                
                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                      Tổng số chiến dịch RFQs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                      {totalRfqsCount}
                    </div>
                    <p className="mt-2 text-[11px] text-[#5c59e9] hover:underline cursor-pointer flex items-center gap-0.5" onClick={() => setActiveTab('rfqs')}>
                      Quản lý chiến dịch <ChevronRight size={12} />
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                      RFQ Nguyên liệu thô
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
                      RFQ Thành phẩm
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
                      Tổng số báo giá đã nhận
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                      {totalBidsCount}
                    </div>
                    <p className="mt-2 text-[11px] text-[#5c59e9] hover:underline cursor-pointer flex items-center gap-0.5" onClick={() => setActiveTab('bids')}>
                      Đánh giá báo giá <ChevronRight size={12} />
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Grid 2: RFQ Table list & Side Forms */}
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                
                {/* 2. KHỐI QUẢN LÝ ĐỀ XUẤT (INTERNAL RFQS) */}
                <div className="lg:col-span-2 space-y-6">
                  <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <CardTitle className="text-lg font-bold">Danh sách Chiến dịch RFQ</CardTitle>
                        <CardDescription className="text-xs">Theo dõi các chiến dịch mua nguyên liệu và thành phẩm đang chạy</CardDescription>
                      </div>
                      <Button onClick={() => setShowAddRfq(true)} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-8 rounded-lg shadow-sm">
                        <Plus size={14} className="mr-1" /> Tạo RFQ mới
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 bg-slate-50/50 dark:bg-slate-800/10">
                              <th className="py-3 px-6 font-semibold uppercase">Mã RFQ</th>
                              <th className="py-3 px-6 font-semibold uppercase">Tiêu đề chiến dịch</th>
                              <th className="py-3 px-6 font-semibold uppercase">Ảnh sếp giao</th>
                              <th className="py-3 px-6 font-semibold uppercase">Người giao</th>
                              <th className="py-3 px-6 font-semibold uppercase">Loại hàng</th>
                              <th className="py-3 px-6 font-semibold uppercase">Hạn chót</th>
                              <th className="py-3 px-6 font-semibold uppercase">Địa điểm nhận</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {filteredRfqs.map(rfq => (
                              <tr key={rfq.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition">
                                <td className="py-4 px-6 font-mono font-bold text-slate-900 dark:text-white">{rfq.rfq_code}</td>
                                <td className="py-4 px-6 font-medium text-slate-800 dark:text-slate-200">{rfq.title}</td>
                                <td className="py-4 px-6">
                                  <div className="flex gap-1 overflow-x-auto max-w-[120px]">
                                    {rfq.product_images && rfq.product_images.map((img, idx) => (
                                      <a key={idx} href={img} target="_blank" rel="noreferrer" className="shrink-0">
                                        <img src={img} className="h-8 w-8 object-cover rounded border border-slate-200 dark:border-slate-700 hover:scale-105 transition" alt="sếp giao" />
                                      </a>
                                    ))}
                                    {(!rfq.product_images || rfq.product_images.length === 0) && <span className="text-slate-400 italic text-[10px]">Không có</span>}
                                  </div>
                                </td>
                                <td className="py-4 px-6 text-slate-600 dark:text-slate-400 font-semibold">{rfq.assigned_to || 'N/A'}</td>
                                <td className="py-4 px-6">{getRfqItemTypeBadge(rfq.item_type)}</td>
                                <td className="py-4 px-6 text-slate-500">{new Date(rfq.deadline).toLocaleDateString()}</td>
                                <td className="py-4 px-6 text-slate-500">{rfq.delivery_location}</td>
                              </tr>
                            ))}

                            {filteredRfqs.length === 0 && (
                              <tr>
                                <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                                  Chưa có chiến dịch RFQ nào. Tạo ngay ở nút phía trên!
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* 3. KHỐI NHÀ CUNG CẤP BÁO GIÁ (SUPPLIER BID SUBMISSION) */}
                <div className="space-y-6">
                  <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden border-t-4 border-t-[#5c59e9]">
                    <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <FileCheck2 className="text-[#5c59e9] h-5 w-5" /> Nộp Báo giá Nhà cung cấp
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Dành cho nhà cung cấp tham gia nộp bảng báo giá chào thầu động
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      
                      <form onSubmit={handleAddBid} className="space-y-4">
                        
                        <div className="space-y-1">
                          <Label htmlFor="bid_rfq_sel" className="text-xs font-semibold">Chọn Chiến dịch RFQ</Label>
                          <select
                            id="bid_rfq_sel"
                            value={newBid.rfq_id}
                            onChange={e => setNewBid({...newBid, rfq_id: e.target.value})}
                            className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                            required
                          >
                            <option value="">-- Chọn chiến dịch RFQ --</option>
                            {rfqs.map(r => (
                              <option key={r.id} value={r.id}>{r.title} ({r.rfq_code})</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="bid_supp_sel" className="text-xs font-semibold">Nhà cung cấp báo giá</Label>
                          <select
                            id="bid_supp_sel"
                            value={newBid.supplier_id}
                            onChange={e => setNewBid({...newBid, supplier_id: e.target.value})}
                            className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                            required
                          >
                            <option value="">-- Chọn nhà cung cấp --</option>
                            {suppliers.map(s => (
                              <option key={s.id} value={s.id}>{s.company_name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor="b_prc" className="text-xs font-semibold">Đơn giá chào (USD)</Label>
                            <Input id="b_prc" type="number" step="0.01" required placeholder="e.g. 350.00" value={newBid.unit_price} onChange={e => setNewBid({...newBid, unit_price: e.target.value})} className="h-9 text-xs rounded-lg" />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="b_v_pct" className="text-xs font-semibold">Thuế VAT (%)</Label>
                            <Input id="b_v_pct" type="number" step="0.01" value={newBid.vat_percentage} onChange={e => setNewBid({...newBid, vat_percentage: e.target.value})} className="h-9 text-xs rounded-lg" />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="b_time" className="text-xs font-semibold">Thời gian giao (Số ngày)</Label>
                          <Input id="b_time" type="number" required placeholder="e.g. 15" value={newBid.lead_time_days} onChange={e => setNewBid({...newBid, lead_time_days: e.target.value})} className="h-9 text-xs rounded-lg" />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="b_note_text" className="text-xs font-semibold">Ghi chú từ NCC</Label>
                          <Input id="b_note_text" placeholder="Ghi chú kỹ thuật hoặc thanh toán..." value={newBid.supplier_notes} onChange={e => setNewBid({...newBid, supplier_notes: e.target.value})} className="h-9 text-xs rounded-lg" />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="b_source_url" className="text-xs font-semibold">Link nguồn sản phẩm tìm được (Alibaba, 1688...)</Label>
                          <Input id="b_source_url" placeholder="https://vietnamese.alibaba.com/product-detail/..." value={newBid.supplier_source_url || ''} onChange={e => setNewBid({...newBid, supplier_source_url: e.target.value})} className="h-9 text-xs rounded-lg" />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="b_prod_img" className="text-xs font-semibold">Link ảnh sản phẩm thực tế từ NCC</Label>
                          <Input id="b_prod_img" placeholder="https://example.com/supplier-image.jpg" value={newBid.supplier_product_image || ''} onChange={e => setNewBid({...newBid, supplier_product_image: e.target.value})} className="h-9 text-xs rounded-lg" />
                        </div>

                        {/* ================= DYNAMIC BID FIELDS BASED ON SELECTED RFQ TYPE ================= */}
                        {selectedRfqForBid && (
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl space-y-3 border border-slate-100 dark:border-slate-800 animate-in fade-in duration-200">
                            <h5 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">
                              Phản hồi đặc thù: {selectedRfqForBid.item_type === 'raw_material' ? 'Nguyên liệu thô' : 'Thành phẩm'}
                            </h5>

                            {selectedRfqForBid.item_type === 'raw_material' ? (
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label htmlFor="b_moq_off" className="text-[10px] font-semibold">MOQ Đề xuất (Tấn)</Label>
                                  <Input id="b_moq_off" type="number" placeholder="10.00" value={newBid.moq_offered} onChange={e => setNewBid({...newBid, moq_offered: e.target.value})} className="h-8 text-xs rounded-lg bg-white" />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="b_tol_off" className="text-[10px] font-semibold">Dung sai (%)</Label>
                                  <Input id="b_tol_off" type="number" placeholder="2.0" value={newBid.delivery_tolerance_pct} onChange={e => setNewBid({...newBid, delivery_tolerance_pct: e.target.value})} className="h-8 text-xs rounded-lg bg-white" />
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div className="space-y-1">
                                  <Label htmlFor="b_warr" className="text-[10px] font-semibold">Bảo hành (Số tháng)</Label>
                                  <Input id="b_warr" type="number" placeholder="12" value={newBid.warranty_months} onChange={e => setNewBid({...newBid, warranty_months: e.target.value})} className="h-8 text-xs rounded-lg bg-white" />
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor="b_ret_pol" className="text-[10px] font-semibold">Chính sách đổi trả</Label>
                                  <Input id="b_ret_pol" placeholder="Đổi trả hàng lỗi trong..." value={newBid.return_policy} onChange={e => setNewBid({...newBid, return_policy: e.target.value})} className="h-8 text-xs rounded-lg bg-white" />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <Button type="submit" disabled={isLoading} className="w-full bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg mt-2">
                          {isLoading ? 'Đang nộp báo giá...' : 'Nộp Báo giá Chào thầu'}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>

              </div>
            </div>
          )}

          {/* Suppliers Tab */}
          {activeTab === 'suppliers' && (
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 bg-slate-50/50 dark:bg-slate-800/10">
                        <th className="py-3 px-6 font-semibold uppercase">Tên nhà cung cấp</th>
                        <th className="py-3 px-6 font-semibold uppercase">Mã số thuế</th>
                        <th className="py-3 px-6 font-semibold uppercase">Người đại diện</th>
                        <th className="py-3 px-6 font-semibold uppercase">Email liên hệ</th>
                        <th className="py-3 px-6 font-semibold uppercase">Địa chỉ</th>
                        <th className="py-3 px-6 font-semibold uppercase">Website</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredSuppliers.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition">
                          <td className="py-4 px-6 font-semibold text-slate-900 dark:text-white">{s.company_name}</td>
                          <td className="py-4 px-6 font-mono font-bold">{s.tax_code}</td>
                          <td className="py-4 px-6">{s.contact_name || 'N/A'}</td>
                          <td className="py-4 px-6 text-slate-500">{s.contact_email}</td>
                          <td className="py-4 px-6 text-slate-500 max-w-[200px] truncate">{s.address}</td>
                          <td className="py-4 px-6 text-slate-500">
                            {s.website ? (
                              <a href={s.website} target="_blank" rel="noreferrer" className="text-[#5c59e9] hover:underline">
                                Link
                              </a>
                            ) : 'N/A'}
                          </td>
                        </tr>
                      ))}
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
                        <th className="py-3 px-6 font-semibold uppercase">Mã RFQ</th>
                        <th className="py-3 px-6 font-semibold uppercase">Tiêu đề RFQ</th>
                        <th className="py-3 px-6 font-semibold uppercase">Ảnh sếp giao</th>
                        <th className="py-3 px-6 font-semibold uppercase">Giao việc cho</th>
                        <th className="py-3 px-6 font-semibold uppercase">Loại chiến dịch</th>
                        <th className="py-3 px-6 font-semibold uppercase">Hạn nộp</th>
                        <th className="py-3 px-6 font-semibold uppercase">Thông số kỹ thuật/Đóng gói</th>
                        <th className="py-3 px-6 font-semibold uppercase">Lý hóa/Barcode</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredRfqs.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition">
                          <td className="py-4 px-6 font-mono font-bold text-slate-900 dark:text-white">{r.rfq_code}</td>
                          <td className="py-4 px-6 font-semibold text-[#5c59e9] hover:underline cursor-pointer" onClick={() => { setNewBid(prev => ({ ...prev, rfq_id: r.id })); setActiveTab('dashboard'); }}>{r.title}</td>
                          <td className="py-4 px-6">
                            <div className="flex gap-1 overflow-x-auto max-w-[120px]">
                              {r.product_images && r.product_images.map((img, idx) => (
                                <a key={idx} href={img} target="_blank" rel="noreferrer" className="shrink-0">
                                  <img src={img} className="h-8 w-8 object-cover rounded border border-slate-200 dark:border-slate-700 hover:scale-105 transition" alt="sếp giao" />
                                </a>
                              ))}
                              {(!r.product_images || r.product_images.length === 0) && <span className="text-slate-400 italic text-[10px]">Không có</span>}
                            </div>
                          </td>
                          <td className="py-4 px-6 text-slate-600 dark:text-slate-400 font-semibold">{r.assigned_to || 'N/A'}</td>
                          <td className="py-4 px-6">{getRfqItemTypeBadge(r.item_type)}</td>
                          <td className="py-4 px-6 text-slate-500">{new Date(r.deadline).toLocaleDateString()}</td>
                          <td className="py-4 px-6 text-slate-500 max-w-[200px] truncate">
                            {r.item_type === 'raw_material' ? r.raw_material_spec : r.finished_good_packaging}
                          </td>
                          <td className="py-4 px-6 text-slate-500 max-w-[150px] truncate">
                            {r.item_type === 'raw_material' ? r.chemical_composition : r.product_barcode}
                          </td>
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
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 bg-slate-50/50 dark:bg-slate-800/10">
                        <th className="py-3 px-6 font-semibold uppercase">Mã RFQ</th>
                        <th className="py-3 px-6 font-semibold uppercase">Nhà cung cấp</th>
                        <th className="py-3 px-6 font-semibold uppercase">Đơn giá</th>
                        <th className="py-3 px-6 font-semibold uppercase">VAT</th>
                        <th className="py-3 px-6 font-semibold uppercase">Thời gian giao</th>
                        <th className="py-3 px-6 font-semibold uppercase">Nguồn tìm kiếm</th>
                        <th className="py-3 px-6 font-semibold uppercase">Ảnh thực tế NCC</th>
                        <th className="py-3 px-6 font-semibold uppercase">Điểm đánh giá</th>
                        <th className="py-3 px-6 font-semibold uppercase">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredBids.map(b => (
                        <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition">
                          <td className="py-4 px-6 font-mono text-xs">{b.rfq_code}</td>
                          <td className="py-4 px-6 font-semibold text-slate-900 dark:text-white">{b.supplier_name}</td>
                          <td className="py-4 px-6 font-bold text-slate-900 dark:text-white">USD ${b.unit_price.toFixed(2)}</td>
                          <td className="py-4 px-6 text-slate-500">{b.vat_percentage}%</td>
                          <td className="py-4 px-6 text-slate-500">{b.lead_time_days} Ngày</td>
                          <td className="py-4 px-6 text-slate-500">
                            {b.supplier_source_url ? (
                              <a href={b.supplier_source_url} target="_blank" rel="noreferrer" className="text-[#5c59e9] hover:underline font-semibold">
                                Alibaba/1688...
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">Không có</span>
                            )}
                          </td>
                          <td className="py-4 px-6 text-slate-500">
                            {b.supplier_product_image ? (
                              <a href={b.supplier_product_image} target="_blank" rel="noreferrer">
                                <img src={b.supplier_product_image} className="h-8 w-8 object-cover rounded border border-slate-200 dark:border-slate-700 hover:scale-105 transition" alt="NCC cung cấp" />
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">Không có</span>
                            )}
                          </td>
                          <td className="py-4 px-6 font-bold text-teal-600 dark:text-teal-400">{b.evaluation_score} / 100</td>
                          <td className="py-4 px-6">{getBidStatusBadge(b.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 rounded-2xl overflow-hidden p-6 max-w-xl">
              <h3 className="text-base font-bold mb-4">Cài đặt Hệ thống Sourcing</h3>
              <div className="space-y-4 text-xs">
                <div className="flex justify-between border-b pb-3 items-center">
                  <div>
                    <p className="font-semibold">Bản quyền phần mềm</p>
                    <p className="text-slate-400 text-[10px]">Tr-Sourcing Enterprise Edition</p>
                  </div>
                  <Badge className="bg-teal-50 text-teal-700">v1.2.0 Active</Badge>
                </div>
                <div className="flex justify-between border-b pb-3 items-center">
                  <div>
                    <p className="font-semibold">Mã token liên kết Supabase</p>
                    <p className="text-slate-400 text-[10px]">sbp_43b2cf63...5a5b07c31b3d</p>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700">Đã cấu hình</Badge>
                </div>
              </div>
            </Card>
          )}

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MODALS FOR ADDING DATA */}
      {/* ========================================================================= */}

      {/* Add RFQ Modal */}
      {showAddRfq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <CardTitle className="text-base font-bold">Tạo chiến dịch mời thầu RFQ mới</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddRfq(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[85vh] overflow-y-auto pt-4">
              <form onSubmit={handleAddRfq} className="space-y-4">
                
                <div className="space-y-1">
                  <Label htmlFor="new_rfq_c" className="text-xs font-semibold">Mã chiến dịch RFQ (VD: RFQ-RAW-2026-003)</Label>
                  <Input id="new_rfq_c" required placeholder="e.g. RFQ-RAW-2026-003" value={newRfq.rfq_code} onChange={e => setNewRfq({...newRfq, rfq_code: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_t" className="text-xs font-semibold">Tiêu đề RFQ</Label>
                  <Input id="new_rfq_t" required placeholder="e.g. Cung cấp Gỗ Sồi đỏ xẻ sấy" value={newRfq.title} onChange={e => setNewRfq({...newRfq, title: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_type" className="text-xs font-semibold">Loại chiến dịch mời thầu</Label>
                  <select
                    id="new_rfq_type"
                    value={newRfq.item_type}
                    onChange={e => setNewRfq({...newRfq, item_type: e.target.value as any})}
                    className="w-full border border-slate-200 bg-background h-9 rounded-lg px-3 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none"
                  >
                    <option value="raw_material">Nguyên liệu thô (Raw Material)</option>
                    <option value="finished_good">Thành phẩm (Finished Good)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_dead" className="text-xs font-semibold">Hạn chót nộp báo giá</Label>
                  <Input id="new_rfq_dead" type="datetime-local" required value={newRfq.deadline} onChange={e => setNewRfq({...newRfq, deadline: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_loc" className="text-xs font-semibold">Địa điểm nhận hàng</Label>
                  <Input id="new_rfq_loc" required placeholder="e.g. Kho Tr-Sourcing, Đồng Nai" value={newRfq.delivery_location} onChange={e => setNewRfq({...newRfq, delivery_location: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_images" className="text-xs font-semibold">Ảnh mẫu của Sếp (Link URL, phân cách bằng dấu phẩy)</Label>
                  <Input id="new_rfq_images" placeholder="https://example.com/image1.jpg, ..." value={newRfq.product_images.join(', ')} onChange={e => setNewRfq({...newRfq, product_images: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} className="h-9 text-xs rounded-lg" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_note" className="text-xs font-semibold">Ghi chú/yêu cầu tìm nguồn của Sếp</Label>
                  <textarea id="new_rfq_note" placeholder="Yêu cầu cụ thể từ sếp về xuất xứ, chất lượng..." value={newRfq.sourcing_note || ''} onChange={e => setNewRfq({...newRfq, sourcing_note: e.target.value})} className="w-full min-h-[60px] border border-slate-200 bg-background rounded-lg p-2 text-xs focus:ring-[#5c59e9] focus:border-[#5c59e9] focus:outline-none" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="new_rfq_assign" className="text-xs font-semibold">Giao việc cho nhân viên (Tên/Email)</Label>
                  <Input id="new_rfq_assign" placeholder="e.g. Nguyễn Văn B" value={newRfq.assigned_to || ''} onChange={e => setNewRfq({...newRfq, assigned_to: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>

                {/* ================= DYNAMIC FORM FIELDS BASED ON RFQ ITEM TYPE ================= */}
                {newRfq.item_type === 'raw_material' ? (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl space-y-3 border border-slate-100 dark:border-slate-800">
                    <h5 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Đặc tính cho Nguyên liệu thô</h5>
                    
                    <div className="space-y-1">
                      <Label htmlFor="new_rfq_spec" className="text-[10px] font-semibold">Thông số kỹ thuật/Hàm lượng (raw_material_spec)</Label>
                      <Input id="new_rfq_spec" placeholder="Ví dụ: sấy đạt độ ẩm 12-14%..." value={newRfq.raw_material_spec} onChange={e => setNewRfq({...newRfq, raw_material_spec: e.target.value})} className="h-8 text-xs rounded-lg bg-white" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new_rfq_cc" className="text-[10px] font-semibold">Đặc tính lý hóa (chemical_composition)</Label>
                      <Input id="new_rfq_cc" placeholder="Ví dụ: tỷ lệ nứt đầu < 5%" value={newRfq.chemical_composition} onChange={e => setNewRfq({...newRfq, chemical_composition: e.target.value})} className="h-8 text-xs rounded-lg bg-white" />
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl space-y-3 border border-slate-100 dark:border-slate-800">
                    <h5 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Đặc tính cho Thành phẩm</h5>
                    
                    <div className="space-y-1">
                      <Label htmlFor="new_rfq_pkg" className="text-[10px] font-semibold">Quy cách đóng gói thành phẩm (finished_good_packaging)</Label>
                      <Input id="new_rfq_pkg" placeholder="Ví dụ: 50 cái/kiện, quấn màng PE..." value={newRfq.finished_good_packaging} onChange={e => setNewRfq({...newRfq, finished_good_packaging: e.target.value})} className="h-8 text-xs rounded-lg bg-white" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="new_rfq_bc" className="text-[10px] font-semibold">Mã vạch sản phẩm (product_barcode)</Label>
                      <Input id="new_rfq_bc" placeholder="Ví dụ: 8931234567890" value={newRfq.product_barcode} onChange={e => setNewRfq({...newRfq, product_barcode: e.target.value})} className="h-8 text-xs rounded-lg bg-white" />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button type="button" variant="outline" onClick={() => setShowAddRfq(false)}>Hủy</Button>
                  <Button type="submit" disabled={isLoading} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg">
                    {isLoading ? 'Đang tạo...' : 'Tạo RFQ mới'}
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
              <CardTitle className="text-base font-bold">Thêm Nhà cung cấp mới</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddSupplier(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[85vh] overflow-y-auto pt-4">
              <form onSubmit={handleAddSupplier} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="s_cn" className="text-xs font-semibold">Tên công ty / nhà cung cấp</Label>
                  <Input id="s_cn" required placeholder="Công ty TNHH Gỗ Việt Mỹ" value={newSupplier.company_name} onChange={e => setNewSupplier({...newSupplier, company_name: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_tc" className="text-xs font-semibold">Mã số thuế</Label>
                  <Input id="s_tc" required placeholder="0102030405" value={newSupplier.tax_code} onChange={e => setNewSupplier({...newSupplier, tax_code: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_ad" className="text-xs font-semibold">Địa chỉ trụ sở</Label>
                  <Input id="s_ad" required placeholder="Bình Dương, TP. HCM..." value={newSupplier.address} onChange={e => setNewSupplier({...newSupplier, address: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="s_cnm" className="text-xs font-semibold">Tên người đại diện</Label>
                    <Input id="s_cnm" placeholder="Nguyễn Văn A" value={newSupplier.contact_name} onChange={e => setNewSupplier({...newSupplier, contact_name: e.target.value})} className="h-9 text-xs rounded-lg" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="s_cph" className="text-xs font-semibold">Số điện thoại</Label>
                    <Input id="s_cph" placeholder="0901234567" value={newSupplier.contact_phone} onChange={e => setNewSupplier({...newSupplier, contact_phone: e.target.value})} className="h-9 text-xs rounded-lg" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_cem" className="text-xs font-semibold">Email người liên hệ</Label>
                  <Input id="s_cem" type="email" required placeholder="sales@govietmy.com" value={newSupplier.contact_email} onChange={e => setNewSupplier({...newSupplier, contact_email: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_web" className="text-xs font-semibold">Website (nếu có)</Label>
                  <Input id="s_web" placeholder="https://govietmy.com" value={newSupplier.website} onChange={e => setNewSupplier({...newSupplier, website: e.target.value})} className="h-9 text-xs rounded-lg" />
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Button type="button" variant="outline" onClick={() => setShowAddSupplier(false)}>Hủy</Button>
                  <Button type="submit" disabled={isLoading} className="bg-[#5c59e9] hover:bg-[#4b48d1] text-white text-xs font-semibold h-9 rounded-lg">
                    {isLoading ? 'Đang tạo...' : 'Thêm nhà cung cấp'}
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
