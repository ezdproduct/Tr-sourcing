'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/supabase/client'
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
  TrendingUp,
  AlertTriangle,
  Settings,
  PlusCircle,
  X,
  ShieldCheck,
  FileCheck
} from 'lucide-react'

// Interfaces mapping to the new database schema
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
}

export function SourcingDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'suppliers' | 'rfqs' | 'bids'>('dashboard')
  const [showRfqDrawer, setShowRfqDrawer] = useState(true)
  const [selectedRfqId, setSelectedRfqId] = useState<string | null>(null)
  
  // Tab filters
  const [rfqFilterTab, setRfqFilterTab] = useState<'all' | 'raw_material' | 'finished_good'>('all')
  const [bidFilterTab, setBidFilterTab] = useState<'all' | 'reviewing' | 'awarded'>('all')

  // Search States
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Database Data States
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [rfqs, setRfqs] = useState<RFQ[]>([])
  const [bids, setBids] = useState<Bid[]>([])

  // Modal Dialog states
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [newSupplier, setNewSupplier] = useState({ company_name: '', tax_code: '', address: '', website: '', contact_name: '', contact_email: '', contact_phone: '' })

  const [showAddRfq, setShowAddRfq] = useState(false)
  const [newRfq, setNewRfq] = useState({
    rfq_code: '', title: '', item_type: 'raw_material' as 'raw_material' | 'finished_good', deadline: '', delivery_location: '',
    raw_material_spec: '', chemical_composition: '', finished_good_packaging: '', product_barcode: ''
  })

  const [showAddBid, setShowAddBid] = useState(false)
  const [newBid, setNewBid] = useState({
    rfq_id: '', supplier_id: '', unit_price: '', vat_percentage: '10.00', lead_time_days: '', supplier_notes: '',
    moq_offered: '', delivery_tolerance_pct: '', warranty_months: '', return_policy: ''
  })

  // Mock data fallbacks if DB connection fails/empty
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
    const supabase = createClient()
    try {
      const [suppliersRes, rfqsRes, bidsRes] = await Promise.all([
        supabase.from('suppliers').select('*'),
        supabase.from('rfqs').select('*'),
        supabase.from('bids').select('*')
      ])

      // Populate Suppliers
      if (suppliersRes.data && suppliersRes.data.length > 0) {
        setSuppliers(suppliersRes.data)
      } else {
        setSuppliers(mockSuppliers)
      }

      // Populate RFQs
      let dbRfqs: RFQ[] = []
      if (rfqsRes.data && rfqsRes.data.length > 0) {
        dbRfqs = rfqsRes.data
        setRfqs(rfqsRes.data)
      } else {
        dbRfqs = mockRfqs
        setRfqs(mockRfqs)
      }

      // Populate Bids and join supplier_name + rfq information manually from local states
      if (bidsRes.data && bidsRes.data.length > 0) {
        const joinedBids = bidsRes.data.map(bid => {
          const matchedSupplier = (suppliersRes.data || mockSuppliers).find(s => s.id === bid.supplier_id)
          const matchedRfq = dbRfqs.find(r => r.id === bid.rfq_id)
          return {
            ...bid,
            supplier_name: matchedSupplier ? matchedSupplier.company_name : 'Unknown Supplier',
            rfq_code: matchedRfq ? matchedRfq.rfq_code : 'N/A',
            rfq_title: matchedRfq ? matchedRfq.title : 'N/A'
          }
        })
        setBids(joinedBids)
      } else {
        setBids(mockBids)
      }

      // Set default selected RFQ
      if (dbRfqs.length > 0 && !selectedRfqId) {
        setSelectedRfqId(dbRfqs[0].id)
      }

    } catch (err) {
      console.error('Error fetching Supabase data:', err)
      setSuppliers(mockSuppliers)
      setRfqs(mockRfqs)
      setBids(mockBids)
      setSelectedRfqId('r-1')
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    fetchData()
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
      console.error('Error inserting supplier:', err)
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
        delivery_location: newRfq.delivery_location || 'Kho Tr-Sourcing'
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
        raw_material_spec: '', chemical_composition: '', finished_good_packaging: '', product_barcode: ''
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
        evaluation_score: 100
      }

      const matchedRfq = rfqs.find(r => r.id === newBid.rfq_id)
      if (matchedRfq?.item_type === 'raw_material') {
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
        moq_offered: '', delivery_tolerance_pct: '', warranty_months: '', return_policy: ''
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
        evaluation_score: 100,
        created_at: new Date().toISOString()
      } as unknown as Bid, ...prev])
      setShowAddBid(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter lists based on tab and search query
  const filteredRfqs = rfqs.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.rfq_code.toLowerCase().includes(searchQuery.toLowerCase())
    if (rfqFilterTab === 'raw_material') return matchesSearch && r.item_type === 'raw_material'
    if (rfqFilterTab === 'finished_good') return matchesSearch && r.item_type === 'finished_good'
    return matchesSearch
  })

  const filteredBids = bids.filter(b => {
    const matchesSearch = b.rfq_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          b.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase())
    if (bidFilterTab === 'reviewing') return matchesSearch && b.status === 'reviewing'
    if (bidFilterTab === 'awarded') return matchesSearch && b.status === 'awarded'
    return matchesSearch
  })

  // Selected RFQ details
  const activeRfq = rfqs.find(r => r.id === selectedRfqId) || rfqs[0]
  const activeRfqBids = bids.filter(b => b.rfq_id === (activeRfq?.id || ''))

  // Metrics calculation
  const totalBidsCount = bids.length
  const avgLeadTime = bids.reduce((acc, curr) => acc + curr.lead_time_days, 0) / (totalBidsCount || 1)
  const activeRfqCount = rfqs.length
  const awardedBidsCount = bids.filter(b => b.status === 'awarded').length

  const getStatusBadge = (status: Bid['status']) => {
    const styles = {
      draft: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
      reviewing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      awarded: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
    }
    const labels = {
      draft: 'Draft',
      reviewing: 'Reviewing',
      awarded: 'Awarded',
      rejected: 'Rejected'
    }
    return (
      <Badge className={`${styles[status]} border-0 font-medium hover:${styles[status]}`}>
        {labels[status]}
      </Badge>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full bg-[#f8fafc] text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      
      {/* Left Navigation Sidebar */}
      <aside className="hidden w-20 flex-col items-center border-r border-slate-200 bg-white py-6 dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-lg font-bold text-white shadow-md shadow-emerald-500/20">
          TR
        </div>
        <nav className="mt-12 flex flex-1 flex-col gap-5">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveTab('dashboard')}
            className={`h-11 w-11 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-slate-100 text-teal-600 dark:bg-slate-800 dark:text-teal-400' : 'text-slate-400 hover:text-slate-600'}`}
            title="Dashboard"
          >
            <ClipboardList size={22} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveTab('suppliers')}
            className={`h-11 w-11 rounded-xl transition-all ${activeTab === 'suppliers' ? 'bg-slate-100 text-teal-600 dark:bg-slate-800 dark:text-teal-400' : 'text-slate-400 hover:text-slate-600'}`}
            title="Suppliers"
          >
            <Building size={22} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveTab('rfqs')}
            className={`h-11 w-11 rounded-xl transition-all ${activeTab === 'rfqs' ? 'bg-slate-100 text-teal-600 dark:bg-slate-800 dark:text-teal-400' : 'text-slate-400 hover:text-slate-600'}`}
            title="RFQs"
          >
            <Package size={22} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveTab('bids')}
            className={`h-11 w-11 rounded-xl transition-all ${activeTab === 'bids' ? 'bg-slate-100 text-teal-600 dark:bg-slate-800 dark:text-teal-400' : 'text-slate-400 hover:text-slate-600'}`}
            title="Supplier Bids"
          >
            <Receipt size={22} />
          </Button>
        </nav>
        <div className="mt-auto flex flex-col gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchData}
            disabled={isSyncing}
            className="text-slate-400 hover:text-slate-600"
            title="Sync Database"
          >
            <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
          </Button>
          <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600" title="Settings">
            <Settings size={20} />
          </Button>
        </div>
      </aside>

      {/* Main Container */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        
        {/* Main Dashboard Panel */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          
          {/* Welcome Header */}
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
                {activeTab === 'dashboard' ? 'DASHBOARD' : activeTab === 'suppliers' ? 'Nhà cung cấp (Suppliers)' : activeTab === 'rfqs' ? 'Chiến dịch mời thầu (RFQs)' : 'Báo giá (Bids)'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Welcome back, <strong>Paul Smith</strong>. Here&apos;s what&apos;s happening with your procurement today.
              </p>
            </div>
            
            {activeTab === 'suppliers' && (
              <Button onClick={() => setShowAddSupplier(true)} className="bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm">
                <Plus size={16} className="mr-1" /> Thêm Nhà cung cấp
              </Button>
            )}

            {activeTab === 'rfqs' && (
              <Button onClick={() => setShowAddRfq(true)} className="bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm">
                <Plus size={16} className="mr-1" /> Tạo RFQ mời thầu
              </Button>
            )}

            {activeTab === 'bids' && (
              <Button onClick={() => setShowAddBid(true)} className="bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm">
                <Plus size={16} className="mr-1" /> Thêm Báo giá (Bid)
              </Button>
            )}
          </div>

          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                
                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs font-semibold tracking-wide uppercase text-slate-400">
                      Active Sourcing RFQs
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                      {activeRfqCount}
                    </div>
                    <p className="mt-2 text-xs text-teal-600 hover:underline cursor-pointer flex items-center gap-1 dark:text-teal-400" onClick={() => setActiveTab('rfqs')}>
                      View and manage RFQs <ChevronRight size={12} />
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs font-semibold tracking-wide uppercase text-slate-400">
                      Total Bids Received
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                      {totalBidsCount}
                    </div>
                    <p className="mt-2 text-xs text-teal-600 hover:underline cursor-pointer flex items-center gap-1 dark:text-teal-400" onClick={() => setActiveTab('bids')}>
                      View and evaluate bids <ChevronRight size={12} />
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs font-semibold tracking-wide uppercase text-slate-400">
                      Average Lead Time
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                      {avgLeadTime.toFixed(1)} Days
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      On-time delivery target: 10 days
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs font-semibold tracking-wide uppercase text-slate-400">
                      Awarded Bids
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                      {awardedBidsCount}
                    </div>
                    <p className="mt-2 text-xs text-teal-600 dark:text-teal-400">
                      Ready for Purchase Order creation
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Bottom Grid */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                
                {/* Active RFQs Timeline/List */}
                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div className="flex gap-4">
                      <button
                        onClick={() => setRfqFilterTab('all')}
                        className={`text-sm font-bold pb-2 border-b-2 transition-all ${rfqFilterTab === 'all' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        All RFQs <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">{rfqs.length}</span>
                      </button>
                      <button
                        onClick={() => setRfqFilterTab('raw_material')}
                        className={`text-sm font-bold pb-2 border-b-2 transition-all ${rfqFilterTab === 'raw_material' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Raw Materials <span className="ml-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">{rfqs.filter(r => r.item_type === 'raw_material').length}</span>
                      </button>
                      <button
                        onClick={() => setRfqFilterTab('finished_good')}
                        className={`text-sm font-bold pb-2 border-b-2 transition-all ${rfqFilterTab === 'finished_good' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Finished Goods <span className="ml-1 rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600 dark:bg-purple-950/40 dark:text-purple-400">{rfqs.filter(r => r.item_type === 'finished_good').length}</span>
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="relative border-l-2 border-slate-100 pl-6 space-y-6 dark:border-slate-800">
                      
                      {filteredRfqs.map(rfq => (
                        <div key={rfq.id} className="relative cursor-pointer group" onClick={() => { setSelectedRfqId(rfq.id); setShowRfqDrawer(true); }}>
                          <div className="absolute -left-[31px] mt-0.5 h-4 w-4 rounded-full border-4 border-white bg-slate-400 group-hover:bg-teal-500 dark:border-slate-900 transition-all" />
                          <span className="text-xs font-semibold text-slate-400">Deadline: {new Date(rfq.deadline).toLocaleDateString()}</span>
                          <div className="mt-1 flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Badge className={rfq.item_type === 'raw_material' ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-400' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400'}>
                                {rfq.item_type === 'raw_material' ? 'Raw Material' : 'Finished Good'}
                              </Badge>
                              <span className="text-sm font-bold text-slate-900 group-hover:text-teal-600 dark:text-white dark:group-hover:text-teal-400 transition-all">{rfq.title}</span>
                            </div>
                            <div className="text-xs text-slate-500 flex gap-4">
                              <span>Code: <strong className="font-mono">{rfq.rfq_code}</strong></span>
                              <span>Location: <strong>{rfq.delivery_location}</strong></span>
                            </div>
                          </div>
                        </div>
                      ))}

                      {filteredRfqs.length === 0 && (
                        <div className="py-6 text-center text-slate-400 text-sm">
                          Không tìm thấy chiến dịch RFQ nào phù hợp.
                        </div>
                      )}

                    </div>
                  </CardContent>
                </Card>

                {/* Donut Chart: Bids by Status */}
                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white uppercase flex items-center justify-between">
                      BIDS STATUS DISTRIBUTION <ChevronRight size={16} />
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Breakdown of supplier responses by status
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center py-6 sm:flex-row sm:gap-8">
                    
                    {/* SVG Donut */}
                    <div className="relative flex h-40 w-40 items-center justify-center">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" className="dark:stroke-slate-800" />
                        {/* Segment 1: Reviewing (e.g. 80%) */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#3b82f6" strokeWidth="3.5" strokeDasharray="80 20" strokeDashoffset="100" />
                        {/* Segment 2: Awarded (e.g. 20%) */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#10b981" strokeWidth="3.5" strokeDasharray="20 80" strokeDashoffset="20" />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Total Bids</span>
                        <span className="text-xs font-black text-slate-800 dark:text-white">{bids.length} submitted</span>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="mt-6 flex flex-col gap-2.5 sm:mt-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="h-3 w-3 rounded-full bg-blue-500" />
                        <span className="font-medium text-slate-500 dark:text-slate-400">Reviewing:</span>
                        <span className="font-bold text-slate-800 dark:text-white">
                          {bids.filter(b => b.status === 'reviewing').length} Bids ({((bids.filter(b => b.status === 'reviewing').length / (bids.length || 1)) * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="h-3 w-3 rounded-full bg-emerald-500" />
                        <span className="font-medium text-slate-500 dark:text-slate-400">Awarded:</span>
                        <span className="font-bold text-slate-800 dark:text-white">
                          {bids.filter(b => b.status === 'awarded').length} Bids ({((bids.filter(b => b.status === 'awarded').length / (bids.length || 1)) * 100).toFixed(0)}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="h-3 w-3 rounded-full bg-zinc-400" />
                        <span className="font-medium text-slate-500 dark:text-slate-400">Draft / Other:</span>
                        <span className="font-bold text-slate-800 dark:text-white">
                          {bids.filter(b => b.status !== 'reviewing' && b.status !== 'awarded').length} Bids
                        </span>
                      </div>
                    </div>

                  </CardContent>
                </Card>

              </div>
            </div>
          )}

          {/* Suppliers Tab */}
          {activeTab === 'suppliers' && (
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 animate-in fade-in">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                        <th className="pb-3 font-semibold uppercase text-xs">Tên nhà cung cấp</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Mã số thuế</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Người liên hệ</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Email</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Địa chỉ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {suppliers.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="py-4 font-semibold text-slate-900 dark:text-white">{s.company_name}</td>
                          <td className="py-4 font-mono text-xs">{s.tax_code}</td>
                          <td className="py-4 font-medium">{s.contact_name || 'N/A'}</td>
                          <td className="py-4 text-slate-500">{s.contact_email}</td>
                          <td className="py-4 text-slate-500 text-xs truncate max-w-[200px]">{s.address}</td>
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
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 animate-in fade-in">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                        <th className="pb-3 font-semibold uppercase text-xs">Mã chiến dịch</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Tiêu đề RFQ</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Loại vật liệu</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Hạn nộp</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Địa điểm nhận</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {rfqs.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 cursor-pointer" onClick={() => { setSelectedRfqId(r.id); setShowRfqDrawer(true); }}>
                          <td className="py-4 font-mono text-xs font-bold text-slate-900 dark:text-white">{r.rfq_code}</td>
                          <td className="py-4 font-semibold text-teal-600 dark:text-teal-400 hover:underline">{r.title}</td>
                          <td className="py-4">
                            <Badge className={r.item_type === 'raw_material' ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-400' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400'}>
                              {r.item_type === 'raw_material' ? 'Nguyên liệu thô' : 'Thành phẩm'}
                            </Badge>
                          </td>
                          <td className="py-4 text-slate-500 text-xs">{new Date(r.deadline).toLocaleDateString()}</td>
                          <td className="py-4 text-slate-500 text-xs truncate max-w-[200px]">{r.delivery_location}</td>
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
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900 animate-in fade-in">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                        <th className="pb-3 font-semibold uppercase text-xs">Mã RFQ</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Nhà cung cấp</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Đơn giá chào</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Thuế VAT</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Lead Time</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Điểm đánh giá</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {bids.map(b => (
                        <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="py-4 font-mono text-xs">{b.rfq_code}</td>
                          <td className="py-4 font-semibold text-slate-900 dark:text-white">{b.supplier_name}</td>
                          <td className="py-4 font-bold text-slate-900 dark:text-white">USD ${b.unit_price.toFixed(2)}</td>
                          <td className="py-4 text-slate-500">{b.vat_percentage}%</td>
                          <td className="py-4 text-slate-500">{b.lead_time_days} Ngày</td>
                          <td className="py-4 font-bold text-teal-600 dark:text-teal-400">{b.evaluation_score || 0} / 100</td>
                          <td className="py-4">{getStatusBadge(b.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

        </main>

        {/* Right Details Drawer: Shows bids for selected RFQ */}
        {showRfqDrawer && activeRfq && (
          <aside className="w-full border-t border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:w-96 lg:border-t-0 lg:border-l overflow-y-auto">
            
            {/* Drawer Header */}
            <div className="mb-6 flex items-center justify-between border-b pb-4">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowRfqDrawer(false)} className="text-slate-400 hover:text-slate-600 lg:hidden">
                  <X size={20} />
                </button>
                <div>
                  <span className="font-mono text-xs font-bold text-slate-400 block">{activeRfq.rfq_code}</span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                    {activeRfq.title}
                  </h3>
                </div>
              </div>
              <Badge className={activeRfq.item_type === 'raw_material' ? 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-400' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-400'}>
                {activeRfq.item_type === 'raw_material' ? 'Raw Material' : 'Finished Good'}
              </Badge>
            </div>

            {/* RFQ Special Details based on type */}
            <div className="mb-6 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-4 space-y-3 text-xs">
              <h4 className="font-bold text-slate-400 uppercase tracking-wide text-[10px]">Thông số yêu cầu đặc thù</h4>
              
              {activeRfq.item_type === 'raw_material' ? (
                <>
                  <div className="space-y-1">
                    <span className="text-slate-400 block">Thành phần kỹ thuật (Spec):</span>
                    <span className="font-medium text-slate-800 dark:text-white leading-relaxed block">{activeRfq.raw_material_spec || 'N/A'}</span>
                  </div>
                  <div className="space-y-1 border-t pt-2 dark:border-slate-700">
                    <span className="text-slate-400 block">Đặc tính lý hóa / Tạp chất:</span>
                    <span className="font-medium text-slate-800 dark:text-white leading-relaxed block">{activeRfq.chemical_composition || 'N/A'}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <span className="text-slate-400 block">Quy cách đóng gói thành phẩm:</span>
                    <span className="font-medium text-slate-800 dark:text-white leading-relaxed block">{activeRfq.finished_good_packaging || 'N/A'}</span>
                  </div>
                  <div className="space-y-1 border-t pt-2 dark:border-slate-700">
                    <span className="text-slate-400 block">Mã vạch sản phẩm (Barcode):</span>
                    <span className="font-mono text-sm font-bold text-slate-800 dark:text-white block">{activeRfq.product_barcode || 'N/A'}</span>
                  </div>
                </>
              )}

              <div className="space-y-1 border-t pt-2 dark:border-slate-700 flex justify-between">
                <span className="text-slate-400">Địa điểm nhận hàng:</span>
                <span className="font-bold text-slate-800 dark:text-white">{activeRfq.delivery_location}</span>
              </div>
            </div>

            {/* Bids received for this RFQ */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                  BÁO GIÁ ĐÃ NHẬN ({activeRfqBids.length})
                </h4>
                <Button onClick={() => { setNewBid(prev => ({ ...prev, rfq_id: activeRfq.id })); setShowAddBid(true); }} size="sm" variant="ghost" className="text-xs text-teal-600 flex items-center gap-1 dark:text-teal-400">
                  <Plus size={14} /> Thêm báo giá
                </Button>
              </div>

              {activeRfqBids.map(bid => (
                <div
                  key={bid.id}
                  className="border border-slate-100 rounded-xl p-4 bg-white dark:border-slate-800 dark:bg-slate-900/50 shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-slate-800 dark:text-white text-xs">{bid.supplier_name}</span>
                    {getStatusBadge(bid.status)}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Đơn giá chào:</span>
                      <span className="font-black text-slate-800 dark:text-white">USD ${bid.unit_price.toFixed(2)} (VAT {bid.vat_percentage}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Thời gian giao:</span>
                      <span className="font-semibold">{bid.lead_time_days} Ngày</span>
                    </div>
                    
                    {/* Raw Material spec response */}
                    {activeRfq.item_type === 'raw_material' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">MOQ tối thiểu:</span>
                          <span className="font-medium">{bid.moq_offered ? `${bid.moq_offered} Tấn` : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Dung sai giao hàng:</span>
                          <span className="font-medium">{bid.delivery_tolerance_pct ? `±${bid.delivery_tolerance_pct}%` : 'N/A'}</span>
                        </div>
                      </>
                    )}

                    {/* Finished Good spec response */}
                    {activeRfq.item_type === 'finished_good' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Thời gian bảo hành:</span>
                          <span className="font-medium">{bid.warranty_months ? `${bid.warranty_months} Tháng` : 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Chính sách đổi trả:</span>
                          <span className="font-medium text-slate-600 dark:text-slate-300 truncate max-w-[150px]">{bid.return_policy || 'N/A'}</span>
                        </div>
                      </>
                    )}

                    <div className="flex justify-between border-t border-slate-50 pt-2 mt-2 dark:border-slate-800/80">
                      <span className="text-slate-400">Điểm đánh giá kỹ thuật:</span>
                      <span className="font-bold text-teal-600 dark:text-teal-400">{bid.evaluation_score || 0} / 100</span>
                    </div>

                    {bid.supplier_notes && (
                      <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded text-[11px] text-slate-500 italic mt-2">
                        &ldquo;{bid.supplier_notes}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {activeRfqBids.length === 0 && (
                <div className="py-8 text-center text-slate-400 text-xs italic">
                  Chưa nhận được báo giá nào cho chiến dịch này.
                </div>
              )}
            </div>
          </aside>
        )}

      </div>

      {/* Floating Toggle Button for Drawer */}
      {!showRfqDrawer && activeRfq && (
        <Button
          onClick={() => setShowRfqDrawer(true)}
          className="fixed bottom-6 right-6 h-12 w-12 rounded-full bg-teal-600 text-white shadow-lg hover:bg-teal-700 shadow-teal-500/25 flex items-center justify-center"
          title="Xem chi tiết báo giá"
        >
          <ClipboardList size={22} />
        </Button>
      )}

      {/* ========================================================================= */}
      {/* MODALS FOR ADDING DATA */}
      {/* ========================================================================= */}

      {/* Add Supplier Modal */}
      {showAddSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg font-bold">Thêm Nhà cung cấp mới</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddSupplier(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[80vh] overflow-y-auto">
              <form onSubmit={handleAddSupplier} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="s_name">Tên nhà cung cấp / Công ty</Label>
                  <Input id="s_name" required placeholder="e.g. Gỗ Việt Mỹ" value={newSupplier.company_name} onChange={e => setNewSupplier({...newSupplier, company_name: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_tax">Mã số thuế (Tax Code)</Label>
                  <Input id="s_tax" required placeholder="e.g. 0102030405" value={newSupplier.tax_code} onChange={e => setNewSupplier({...newSupplier, tax_code: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_email">Email người liên hệ</Label>
                  <Input id="s_email" type="email" required placeholder="e.g. sales@govietmy.com" value={newSupplier.contact_email} onChange={e => setNewSupplier({...newSupplier, contact_email: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_contact">Tên người đại diện liên hệ</Label>
                  <Input id="s_contact" placeholder="e.g. Nguyễn Văn Hùng" value={newSupplier.contact_name} onChange={e => setNewSupplier({...newSupplier, contact_name: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_phone">Số điện thoại</Label>
                  <Input id="s_phone" placeholder="e.g. 0901234567" value={newSupplier.contact_phone} onChange={e => setNewSupplier({...newSupplier, contact_phone: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="s_address">Địa chỉ trụ sở</Label>
                  <Input id="s_address" required placeholder="e.g. KCN Sóng Thần, Bình Dương" value={newSupplier.address} onChange={e => setNewSupplier({...newSupplier, address: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddSupplier(false)}>Hủy</Button>
                  <Button type="submit" disabled={isLoading} className="bg-teal-600 text-white hover:bg-teal-700">
                    {isLoading ? 'Đang lưu...' : 'Lưu lại'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add RFQ Modal */}
      {showAddRfq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg font-bold">Tạo Chiến dịch RFQ mới</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddRfq(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[80vh] overflow-y-auto">
              <form onSubmit={handleAddRfq} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="rfq_c">Mã RFQ (VD: RFQ-RAW-2026-001)</Label>
                  <Input id="rfq_c" required placeholder="e.g. RFQ-RAW-2026-003" value={newRfq.rfq_code} onChange={e => setNewRfq({...newRfq, rfq_code: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rfq_t">Tiêu đề chiến dịch mua hàng</Label>
                  <Input id="rfq_t" required placeholder="e.g. Cung cấp Gỗ Sồi đỏ xẻ sấy" value={newRfq.title} onChange={e => setNewRfq({...newRfq, title: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rfq_type">Loại vật liệu</Label>
                  <select
                    id="rfq_type"
                    value={newRfq.item_type}
                    onChange={e => setNewRfq({...newRfq, item_type: e.target.value as any})}
                    className="w-full border-input bg-background h-9 rounded-md border px-3 text-sm focus:outline-none"
                  >
                    <option value="raw_material">Nguyên liệu thô (Raw Material)</option>
                    <option value="finished_good">Thành phẩm (Finished Good)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rfq_dl">Hạn chót nộp báo giá</Label>
                  <Input id="rfq_dl" type="datetime-local" required value={newRfq.deadline} onChange={e => setNewRfq({...newRfq, deadline: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rfq_loc">Địa điểm giao hàng</Label>
                  <Input id="rfq_loc" placeholder="e.g. Kho Tr-Sourcing, Đồng Nai" value={newRfq.delivery_location} onChange={e => setNewRfq({...newRfq, delivery_location: e.target.value})} />
                </div>

                {newRfq.item_type === 'raw_material' ? (
                  <>
                    <div className="space-y-1 border-t pt-2 dark:border-slate-800">
                      <Label htmlFor="rfq_rms">Đặc tính kỹ thuật nguyên liệu</Label>
                      <Input id="rfq_rms" placeholder="e.g. sấy độ ẩm 12-14%, không mắt lớn" value={newRfq.raw_material_spec} onChange={e => setNewRfq({...newRfq, raw_material_spec: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rfq_cc">Đặc tính lý hóa / Thành phần tạp chất</Label>
                      <Input id="rfq_cc" placeholder="e.g. tỷ lệ nứt đầu < 5%" value={newRfq.chemical_composition} onChange={e => setNewRfq({...newRfq, chemical_composition: e.target.value})} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1 border-t pt-2 dark:border-slate-800">
                      <Label htmlFor="rfq_fgp">Quy cách đóng gói thành phẩm</Label>
                      <Input id="rfq_fgp" placeholder="e.g. Đóng 50 cái/kiện, quấn màng PE" value={newRfq.finished_good_packaging} onChange={e => setNewRfq({...newRfq, finished_good_packaging: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="rfq_bc">Mã vạch Barcode (nếu có)</Label>
                      <Input id="rfq_bc" placeholder="e.g. 8931234567890" value={newRfq.product_barcode} onChange={e => setNewRfq({...newRfq, product_barcode: e.target.value})} />
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddRfq(false)}>Hủy</Button>
                  <Button type="submit" disabled={isLoading} className="bg-teal-600 text-white hover:bg-teal-700">
                    {isLoading ? 'Đang tạo...' : 'Tạo chiến dịch'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Bid Modal */}
      {showAddBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg font-bold">Thêm Báo giá Nhà cung cấp mới</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddBid(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent className="max-h-[80vh] overflow-y-auto">
              <form onSubmit={handleAddBid} className="space-y-4">
                
                <div className="space-y-1">
                  <Label htmlFor="b_rfq">Chọn Chiến dịch RFQ</Label>
                  <select
                    id="b_rfq"
                    value={newBid.rfq_id}
                    onChange={e => setNewBid({...newBid, rfq_id: e.target.value})}
                    className="w-full border-input bg-background h-9 rounded-md border px-3 text-sm focus:outline-none"
                    required
                  >
                    <option value="">-- Chọn chiến dịch RFQ --</option>
                    {rfqs.map(r => (
                      <option key={r.id} value={r.id}>{r.title} ({r.rfq_code})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="b_supp">Nhà cung cấp báo giá</Label>
                  <select
                    id="b_supp"
                    value={newBid.supplier_id}
                    onChange={e => setNewBid({...newBid, supplier_id: e.target.value})}
                    className="w-full border-input bg-background h-9 rounded-md border px-3 text-sm focus:outline-none"
                    required
                  >
                    <option value="">-- Chọn nhà cung cấp --</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.company_name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="b_price">Đơn giá chào (USD)</Label>
                    <Input id="b_price" type="number" step="0.01" required placeholder="e.g. 350.00" value={newBid.unit_price} onChange={e => setNewBid({...newBid, unit_price: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="b_vat">Thuế VAT (%)</Label>
                    <Input id="b_vat" type="number" step="0.01" value={newBid.vat_percentage} onChange={e => setNewBid({...newBid, vat_percentage: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="b_lead">Thời gian giao hàng (Số ngày)</Label>
                  <Input id="b_lead" type="number" required placeholder="e.g. 15" value={newBid.lead_time_days} onChange={e => setNewBid({...newBid, lead_time_days: e.target.value})} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="b_notes">Ghi chú của nhà cung cấp</Label>
                  <Input id="b_notes" placeholder="Ghi chú thêm về hàng hoặc thanh toán..." value={newBid.supplier_notes} onChange={e => setNewBid({...newBid, supplier_notes: e.target.value})} />
                </div>

                {/* Conditional Fields based on RFQ Type */}
                {rfqs.find(r => r.id === newBid.rfq_id)?.item_type === 'raw_material' ? (
                  <div className="border-t pt-3 space-y-3 dark:border-slate-800">
                    <h5 className="font-bold text-slate-400 uppercase tracking-wide text-[10px]">Đặc thù Nguyên liệu thô</h5>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label htmlFor="b_moq">MOQ Đề xuất (Tấn)</Label>
                        <Input id="b_moq" type="number" step="0.01" placeholder="e.g. 10.00" value={newBid.moq_offered} onChange={e => setNewBid({...newBid, moq_offered: e.target.value})} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="b_tol">Dung sai giao hàng (%)</Label>
                        <Input id="b_tol" type="number" step="0.01" placeholder="e.g. 2.00" value={newBid.delivery_tolerance_pct} onChange={e => setNewBid({...newBid, delivery_tolerance_pct: e.target.value})} />
                      </div>
                    </div>
                  </div>
                ) : rfqs.find(r => r.id === newBid.rfq_id)?.item_type === 'finished_good' ? (
                  <div className="border-t pt-3 space-y-3 dark:border-slate-800">
                    <h5 className="font-bold text-slate-400 uppercase tracking-wide text-[10px]">Đặc thù Thành phẩm</h5>
                    <div className="space-y-1">
                      <Label htmlFor="b_war">Thời gian bảo hành (Tháng)</Label>
                      <Input id="b_war" type="number" placeholder="e.g. 12" value={newBid.warranty_months} onChange={e => setNewBid({...newBid, warranty_months: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="b_ret">Chính sách đổi trả</Label>
                      <Input id="b_ret" placeholder="e.g. Đổi trả hàng lỗi trong vòng 30 ngày..." value={newBid.return_policy} onChange={e => setNewBid({...newBid, return_policy: e.target.value})} />
                    </div>
                  </div>
                ) : null}

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddBid(false)}>Hủy</Button>
                  <Button type="submit" disabled={isLoading} className="bg-teal-600 text-white hover:bg-teal-700">
                    {isLoading ? 'Đang tạo...' : 'Lưu báo giá'}
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
