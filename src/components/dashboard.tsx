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
  X
} from 'lucide-react'

// TS Interfaces for our database tables
interface Vendor {
  id: string
  name: string
  vendor_code: string
  rating: number
  status: 'Active' | 'Blacklist'
  phone?: string
  email?: string
}

interface Product {
  id: string
  name: string
  sku: string
  category: string
  uom: string
  last_purchase_price: number
}

interface Requisition {
  id: string
  requisition_number: string
  requester: string
  department: string
  notes?: string
  status: 'Draft' | 'Approved' | 'Rejected'
  created_at: string
}

interface PurchaseOrder {
  id: string
  po_number: string
  vendor_id: string
  order_date: string
  expected_delivery_date: string
  status: 'RFQ' | 'Confirmed' | 'Received' | 'Done' | 'Cancelled'
  total_amount: number
}

export function SourcingDashboard() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vendors' | 'products'>('dashboard')
  const [showRequisitionDrawer, setShowRequisitionDrawer] = useState(true)
  const [requisitionTab, setRequisitionTab] = useState<'all' | 'pending' | 'open'>('all')
  const [timelineTab, setTimelineTab] = useState<'overdue' | 'upcoming'>('overdue')
  
  // Search and Filter States
  const [reqSearch, setReqSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  // Database Data States
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [requisitions, setRequisitions] = useState<Requisition[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])

  // Form States for creating new items
  const [showAddVendor, setShowAddVendor] = useState(false)
  const [newVendor, setNewVendor] = useState({ name: '', vendor_code: '', email: '', phone: '', address: '' })
  
  const [showAddProduct, setShowAddProduct] = useState(false)
  const [newProduct, setNewProduct] = useState({ name: '', sku: '', category: 'Nguyên liệu gỗ', uom: 'Tấn', target_price: '' })

  const [showAddRequisition, setShowAddRequisition] = useState(false)
  const [newReq, setNewReq] = useState({ requester: 'Paul Smith', department: 'Procurement', notes: '', material_id: '', quantity: '1' })

  // Mock data fallbacks (based on reference image details) if DB is empty
  const mockRequisitions: Requisition[] = [
    { id: '1', requisition_number: 'R-00602', requester: 'Paul Smith', department: 'Office', notes: 'test multiple files on mobile', status: 'Approved', created_at: '2025-11-26' },
    { id: '2', requisition_number: 'R-00595', requester: 'Paul Smith', department: 'IT', notes: 'test', status: 'Approved', created_at: '2025-08-20' },
    { id: '3', requisition_number: 'R-00594', requester: 'Paul Smith', department: 'Supplies', notes: 'Mobile test', status: 'Approved', created_at: '2025-07-30' },
    { id: '4', requisition_number: 'R-00586', requester: 'Paul Smith', department: 'Accounting', notes: 'Testing supplier selection', status: 'Approved', created_at: '2025-02-21' },
    { id: '5', requisition_number: 'R-00584', requester: 'Paul Smith', department: 'IT', notes: 'Office chairs', status: 'Approved', created_at: '2025-01-15' }
  ]

  const mockPurchaseOrders: PurchaseOrder[] = [
    { id: '1', po_number: 'PO-HPO900-134382', vendor_id: 'v1', order_date: '2025-10-16', expected_delivery_date: '2025-10-25', status: 'Confirmed', total_amount: 4.00 },
    { id: '2', po_number: 'PO-HPO900-134381', vendor_id: 'v2', order_date: '2025-09-07', expected_delivery_date: '2025-09-15', status: 'Confirmed', total_amount: 23.00 },
    { id: '3', po_number: 'PO-HPO900-134371', vendor_id: 'v3', order_date: '2025-08-27', expected_delivery_date: '2025-09-05', status: 'Confirmed', total_amount: 46.00 },
    { id: '4', po_number: 'PO-HPO900-134130', vendor_id: 'v4', order_date: '2023-08-09', expected_delivery_date: '2023-08-20', status: 'Done', total_amount: 66.00 }
  ]

  const mockVendors: Vendor[] = [
    { id: 'v1', name: 'Gỗ Việt Nam JSC', vendor_code: 'VND-GVN', rating: 4.80, status: 'Active', email: 'sales@goviet.vn' },
    { id: 'v2', name: 'Hóa chất Đông Á', vendor_code: 'VND-HCDA', rating: 4.20, status: 'Active', email: 'contact@dongachems.com' },
    { id: 'v3', name: 'Vật tư Xây dựng miền Nam', vendor_code: 'VND-VTXT', rating: 3.50, status: 'Active', email: 'sales@vatlieumn.vn' }
  ]

  const mockProducts: Product[] = [
    { id: 'p1', name: 'Gỗ sồi tròn Mỹ', sku: 'OAK-ROUND-US', category: 'Nguyên liệu gỗ', uom: 'Tấn', last_purchase_price: 340.00 },
    { id: 'p2', name: 'Keo công nghiệp A-900', sku: 'GLUE-A900', category: 'Hóa chất', uom: 'Thùng', last_purchase_price: 45.00 },
    { id: 'p3', name: 'Đinh vít đóng gói', sku: 'SCREW-BOX', category: 'Vật tư', uom: 'Hộp', last_purchase_price: 12.00 }
  ]

  // Fetch real data from Supabase
  const fetchData = async () => {
    setIsSyncing(true)
    const supabase = createClient()
    try {
      const [vendorsRes, productsRes, requisitionsRes, poRes] = await Promise.all([
        supabase.from('vendors').select('*'),
        supabase.from('products').select('*'),
        supabase.from('purchase_requisitions').select('*'),
        supabase.from('purchase_orders').select('*')
      ])

      if (vendorsRes.data && vendorsRes.data.length > 0) setVendors(vendorsRes.data)
      else setVendors(mockVendors)

      if (productsRes.data && productsRes.data.length > 0) setProducts(productsRes.data)
      else setProducts(mockProducts)

      if (requisitionsRes.data && requisitionsRes.data.length > 0) setRequisitions(requisitionsRes.data)
      else setRequisitions(mockRequisitions)

      if (poRes.data && poRes.data.length > 0) setPurchaseOrders(poRes.data)
      else setPurchaseOrders(mockPurchaseOrders)

    } catch (err) {
      console.error('Error fetching Supabase data:', err)
      // Graceful fallback to mock data on error
      setVendors(mockVendors)
      setProducts(mockProducts)
      setRequisitions(mockRequisitions)
      setPurchaseOrders(mockPurchaseOrders)
    } finally {
      setIsSyncing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  // Add new Vendor to Supabase
  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newVendor.name || !newVendor.vendor_code) return

    setIsLoading(true)
    const supabase = createClient()
    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert([{
          name: newVendor.name,
          vendor_code: newVendor.vendor_code,
          type: 'Vendor',
          email: newVendor.email,
          phone: newVendor.phone,
          address: newVendor.address,
          status: 'Active',
          rating: 5.00
        }])
        .select()

      if (error) throw error
      if (data) setVendors(prev => [...data, ...prev])
      setNewVendor({ name: '', vendor_code: '', email: '', phone: '', address: '' })
      setShowAddVendor(false)
    } catch (err) {
      console.error('Error inserting vendor:', err)
      // Local fallback
      setVendors(prev => [{ id: String(Date.now()), ...newVendor, rating: 5.00, status: 'Active' } as Vendor, ...prev])
      setShowAddVendor(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Add new Product to Supabase
  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProduct.name || !newProduct.sku) return

    setIsLoading(true)
    const supabase = createClient()
    try {
      const { data, error } = await supabase
        .from('products')
        .insert([{
          name: newProduct.name,
          sku: newProduct.sku,
          category: newProduct.category,
          uom: newProduct.uom,
          last_purchase_price: Number(newProduct.target_price) || 0.00,
          can_be_purchased: true
        }])
        .select()

      if (error) throw error
      if (data) setProducts(prev => [...data, ...prev])
      setNewProduct({ name: '', sku: '', category: 'Nguyên liệu gỗ', uom: 'Tấn', target_price: '' })
      setShowAddProduct(false)
    } catch (err) {
      console.error('Error inserting product:', err)
      setProducts(prev => [{ id: String(Date.now()), name: newProduct.name, sku: newProduct.sku, category: newProduct.category, uom: newProduct.uom, last_purchase_price: Number(newProduct.target_price) || 0.00 } as Product, ...prev])
      setShowAddProduct(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Add new Requisition to Supabase
  const handleAddRequisition = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    const supabase = createClient()
    try {
      // 1. Insert Requisition header
      const { data: reqData, error: reqError } = await supabase
        .from('purchase_requisitions')
        .insert([{
          requester: newReq.requester,
          department: newReq.department,
          notes: newReq.notes,
          status: 'Draft'
        }])
        .select()

      if (reqError) throw reqError

      if (reqData && reqData[0] && newReq.material_id) {
        // 2. Insert Requisition line
        await supabase
          .from('purchase_requisition_lines')
          .insert([{
            requisition_id: reqData[0].id,
            product_id: newReq.material_id,
            quantity: Number(newReq.quantity) || 1,
            uom: 'Tấn'
          }])
      }

      await fetchData()
      setNewReq({ requester: 'Paul Smith', department: 'Procurement', notes: '', material_id: '', quantity: '1' })
      setShowAddRequisition(false)
    } catch (err) {
      console.error('Error inserting requisition:', err)
      const mockReqNum = `R-00${Math.floor(600 + Math.random() * 100)}`
      setRequisitions(prev => [{
        id: String(Date.now()),
        requisition_number: mockReqNum,
        requester: newReq.requester,
        department: newReq.department,
        notes: newReq.notes,
        status: 'Draft',
        created_at: new Date().toISOString().split('T')[0]
      } as Requisition, ...prev])
      setShowAddRequisition(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter Requisitions
  const filteredRequisitions = requisitions.filter(r => {
    const matchesSearch = r.requisition_number.toLowerCase().includes(reqSearch.toLowerCase()) || 
                          r.notes?.toLowerCase().includes(reqSearch.toLowerCase()) ||
                          r.requester.toLowerCase().includes(reqSearch.toLowerCase()) ||
                          r.department.toLowerCase().includes(reqSearch.toLowerCase())
    if (requisitionTab === 'pending') return matchesSearch && r.status === 'Draft'
    if (requisitionTab === 'open') return matchesSearch && r.status === 'Approved'
    return matchesSearch
  })

  // Pie chart department distribution mock data (represented as donut segments)
  const departments = [
    { name: 'Supplies', value: 95735.14, color: 'bg-teal-400', percentage: '71%' },
    { name: 'Accounting', value: 7952.87, color: 'bg-amber-400', percentage: '6%' },
    { name: 'IT', value: 24320.00, color: 'bg-purple-300', percentage: '18%' },
    { name: 'No Dept', value: 7549.51, color: 'bg-rose-300', percentage: '5%' }
  ]
  const totalDepartmentSpend = departments.reduce((acc, curr) => acc + curr.value, 0)

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full bg-[#f8fafc] text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      
      {/* 1. Left Navigation Sidebar */}
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
            onClick={() => setActiveTab('vendors')}
            className={`h-11 w-11 rounded-xl transition-all ${activeTab === 'vendors' ? 'bg-slate-100 text-teal-600 dark:bg-slate-800 dark:text-teal-400' : 'text-slate-400 hover:text-slate-600'}`}
            title="Vendors"
          >
            <Building size={22} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setActiveTab('products')}
            className={`h-11 w-11 rounded-xl transition-all ${activeTab === 'products' ? 'bg-slate-100 text-teal-600 dark:bg-slate-800 dark:text-teal-400' : 'text-slate-400 hover:text-slate-600'}`}
            title="Products"
          >
            <Package size={22} />
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
        
        {/* 2. Main Dashboard Panel */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          
          {/* Welcome Header */}
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase">
                {activeTab === 'dashboard' ? 'DASHBOARD' : activeTab === 'vendors' ? 'Nhà cung cấp (Vendors)' : 'Nguyên liệu (Products)'}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Welcome back, <strong>Paul Smith</strong>. Here&apos;s what&apos;s happening with your procurement today.
              </p>
            </div>
            
            {activeTab === 'vendors' && (
              <Button onClick={() => setShowAddVendor(true)} className="bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm">
                <Plus size={16} className="mr-1" /> Thêm Nhà cung cấp
              </Button>
            )}

            {activeTab === 'products' && (
              <Button onClick={() => setShowAddProduct(true)} className="bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm">
                <Plus size={16} className="mr-1" /> Thêm Nguyên liệu
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
                      Open Purchase Orders
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                      {purchaseOrders.filter(p => p.status === 'Confirmed' || p.status === 'Received').length || 856}
                    </div>
                    <p className="mt-2 text-xs text-teal-600 hover:underline cursor-pointer flex items-center gap-1 dark:text-teal-400">
                      View and close Purchase Orders <ChevronRight size={12} />
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs font-semibold tracking-wide uppercase text-slate-400">
                      Pending Approvals
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                      {requisitions.filter(r => r.status === 'Draft').length || 122}
                    </div>
                    <p className="mt-2 text-xs text-teal-600 hover:underline cursor-pointer flex items-center gap-1 dark:text-teal-400">
                      View and action pending approvals <ChevronRight size={12} />
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs font-semibold tracking-wide uppercase text-slate-400">
                      Overdue Items
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                      717
                    </div>
                    <p className="mt-2 text-xs text-rose-500 hover:underline cursor-pointer flex items-center gap-1">
                      View and close overdue items <ChevronRight size={12} />
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs font-semibold tracking-wide uppercase text-slate-400">
                      Total Spend
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                      USD ${totalDepartmentSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      -76.4% from last month
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Bottom Grid */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                
                {/* Timeline / Action List */}
                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div className="flex gap-4">
                      <button
                        onClick={() => setTimelineTab('overdue')}
                        className={`text-sm font-bold pb-2 border-b-2 transition-all ${timelineTab === 'overdue' ? 'border-rose-500 text-rose-600 dark:text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Overdue <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">717</span>
                      </button>
                      <button
                        onClick={() => setTimelineTab('upcoming')}
                        className={`text-sm font-bold pb-2 border-b-2 transition-all ${timelineTab === 'upcoming' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                      >
                        Upcoming <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">0</span>
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="relative border-l-2 border-slate-100 pl-6 space-y-6 dark:border-slate-800">
                      
                      {/* Timeline Item 1 */}
                      <div className="relative">
                        <div className="absolute -left-[31px] mt-0.5 h-4 w-4 rounded-full border-4 border-white bg-slate-400 dark:border-slate-900" />
                        <span className="text-xs font-semibold text-slate-400">October 16, 2025</span>
                        <div className="mt-1 flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 rounded px-1 py-0.5 uppercase dark:bg-slate-800 dark:text-slate-400">Requisition</span>
                            <span className="text-sm font-medium">New Employee Equipment (R-00598)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold bg-teal-100 text-teal-700 rounded px-1 py-0.5 uppercase dark:bg-teal-950/40 dark:text-teal-400">Purchase Order</span>
                            <span className="text-sm font-medium">New Employee Equipment (PO-HPO900-134382)</span>
                          </div>
                        </div>
                      </div>

                      {/* Timeline Item 2 */}
                      <div className="relative">
                        <div className="absolute -left-[31px] mt-0.5 h-4 w-4 rounded-full border-4 border-white bg-slate-400 dark:border-slate-900" />
                        <span className="text-xs font-semibold text-slate-400">September 7, 2025</span>
                        <div className="mt-1 flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold bg-slate-100 text-slate-600 rounded px-1 py-0.5 uppercase dark:bg-slate-800 dark:text-slate-400">Requisition</span>
                            <span className="text-sm font-medium">New employee test (R-00597)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold bg-teal-100 text-teal-700 rounded px-1 py-0.5 uppercase dark:bg-teal-950/40 dark:text-teal-400">Purchase Order</span>
                            <span className="text-sm font-medium">New employee test (PO-HPO900-134381)</span>
                          </div>
                        </div>
                      </div>

                      {/* Timeline Item 3 */}
                      <div className="relative">
                        <div className="absolute -left-[31px] mt-0.5 h-4 w-4 rounded-full border-4 border-white bg-slate-400 dark:border-slate-900" />
                        <span className="text-xs font-semibold text-slate-400">August 27, 2025</span>
                        <div className="mt-1 flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold bg-teal-100 text-teal-700 rounded px-1 py-0.5 uppercase dark:bg-teal-950/40 dark:text-teal-400">Purchase Order</span>
                            <span className="text-sm font-medium">Amazon Test2 24 April 25 (PO-HPO900-134371)</span>
                          </div>
                        </div>
                      </div>

                    </div>
                  </CardContent>
                </Card>

                {/* Donut Chart / Spend Department */}
                <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-bold text-slate-900 dark:text-white uppercase flex items-center justify-between">
                      SPEND PER DEPARTMENT <ChevronRight size={16} />
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Breakdown of spend by Department
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col items-center justify-center py-6 sm:flex-row sm:gap-8">
                    
                    {/* SVG Donut */}
                    <div className="relative flex h-40 w-40 items-center justify-center">
                      <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" className="dark:stroke-slate-800" />
                        {/* Segment 1: Supplies (71%) */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#2dd4bf" strokeWidth="3.5" strokeDasharray="71 29" strokeDashoffset="100" />
                        {/* Segment 2: IT (18%) */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#c084fc" strokeWidth="3.5" strokeDasharray="18 82" strokeDashoffset="29" />
                        {/* Segment 3: Accounting (6%) */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#fbbf24" strokeWidth="3.5" strokeDasharray="6 94" strokeDashoffset="11" />
                        {/* Segment 4: No Dept (5%) */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#fda4af" strokeWidth="3.5" strokeDasharray="5 95" strokeDashoffset="5" />
                      </svg>
                      <div className="absolute flex flex-col items-center justify-center text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Total Spend</span>
                        <span className="text-xs font-black text-slate-800 dark:text-white">USD $135,557.52</span>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="mt-6 flex flex-col gap-2.5 sm:mt-0">
                      {departments.map((dept, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs">
                          <span className={`h-3 w-3 rounded-full ${dept.color}`} />
                          <span className="font-medium text-slate-500 dark:text-slate-400">{dept.name}:</span>
                          <span className="font-bold text-slate-800 dark:text-white">USD ${dept.value.toLocaleString()} ({dept.percentage})</span>
                        </div>
                      ))}
                    </div>

                  </CardContent>
                </Card>

              </div>
            </div>
          )}

          {/* Vendors Tab */}
          {activeTab === 'vendors' && (
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                        <th className="pb-3 font-semibold uppercase text-xs">Tên nhà cung cấp</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Mã nhà cung cấp</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Trạng thái</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Điểm đánh giá</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Email</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {vendors.map(v => (
                        <tr key={v.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="py-4 font-semibold text-slate-900 dark:text-white">{v.name}</td>
                          <td className="py-4 font-mono text-xs">{v.vendor_code}</td>
                          <td className="py-4">
                            <Badge className={v.status === 'Active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}>
                              {v.status}
                            </Badge>
                          </td>
                          <td className="py-4 font-bold text-teal-600 dark:text-teal-400">{v.rating.toFixed(2)} ★</td>
                          <td className="py-4 text-slate-500">{v.email || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Products Tab */}
          {activeTab === 'products' && (
            <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 dark:border-slate-800">
                        <th className="pb-3 font-semibold uppercase text-xs">Tên nguyên liệu</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Mã SKU</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Danh mục</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Đơn vị</th>
                        <th className="pb-3 font-semibold uppercase text-xs">Giá mua gần nhất</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {products.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                          <td className="py-4 font-semibold text-slate-900 dark:text-white">{p.name}</td>
                          <td className="py-4 font-mono text-xs">{p.sku}</td>
                          <td className="py-4">{p.category}</td>
                          <td className="py-4">{p.uom}</td>
                          <td className="py-4 font-bold text-slate-900 dark:text-white">USD ${p.last_purchase_price.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

        </main>

        {/* 3. Right collapsible panel (Requisitions Drawer) */}
        {showRequisitionDrawer && (
          <aside className="w-full border-t border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900 lg:w-96 lg:border-t-0 lg:border-l">
            
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowRequisitionDrawer(false)} className="text-slate-400 hover:text-slate-600 lg:hidden">
                  <X size={20} />
                </button>
                <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase">
                  REQUISITIONS
                </h3>
              </div>
              <Button onClick={() => setShowAddRequisition(true)} size="icon" variant="ghost" className="h-8 w-8 text-slate-500 hover:text-teal-600">
                <PlusCircle size={22} />
              </Button>
            </div>

            {/* Requisitions Tabs */}
            <div className="mb-4 flex border-b border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setRequisitionTab('all')}
                className={`flex-1 text-center pb-2 text-xs font-bold border-b-2 transition-all ${requisitionTab === 'all' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                All (567)
              </button>
              <button
                onClick={() => setRequisitionTab('pending')}
                className={`flex-1 text-center pb-2 text-xs font-bold border-b-2 transition-all ${requisitionTab === 'pending' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Pending (20)
              </button>
              <button
                onClick={() => setRequisitionTab('open')}
                className={`flex-1 text-center pb-2 text-xs font-bold border-b-2 transition-all ${requisitionTab === 'open' ? 'border-teal-500 text-teal-600 dark:text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                Open (42)
              </button>
            </div>

            {/* Search and Filters */}
            <div className="mb-4 flex gap-2">
              <div className="relative flex-1">
                <Search className="text-slate-400 absolute top-2.5 left-2.5 h-4 w-4" />
                <Input
                  placeholder="Search..."
                  value={reqSearch}
                  onChange={(e) => setReqSearch(e.target.value)}
                  className="h-9 pl-9 text-xs"
                />
              </div>
              <Button size="icon" variant="outline" className="h-9 w-9 text-slate-500">
                <Filter size={15} />
              </Button>
            </div>

            {/* Requisitions List */}
            <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-16rem)] pr-1">
              {filteredRequisitions.map(req => (
                <div
                  key={req.id}
                  className="border border-slate-100 rounded-xl p-4 bg-white hover:bg-slate-50 transition-all dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-800/40 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge className="bg-teal-100 text-teal-800 text-[10px] font-semibold border-0 py-0.5 px-2 uppercase hover:bg-teal-100 dark:bg-teal-950 dark:text-teal-400">
                      {req.status === 'Approved' ? 'Open' : 'Pending'}
                    </Badge>
                    <span className="font-mono text-xs font-bold text-slate-400">
                      {req.requisition_number}
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Requisition Name:</span>
                      <span className="font-bold text-slate-800 dark:text-white truncate max-w-[150px]">{req.notes || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Requisitioner:</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">{req.requester}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Date Sent:</span>
                      <span className="text-slate-500">{req.created_at}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-50 pt-1.5 mt-1.5 dark:border-slate-800">
                      <span className="text-slate-400 font-semibold">Total:</span>
                      <span className="font-black text-slate-800 dark:text-white">USD $4.00</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        )}

      </div>

      {/* Floating Toggle Button for Drawer on Desktop */}
      {!showRequisitionDrawer && (
        <Button
          onClick={() => setShowRequisitionDrawer(true)}
          className="fixed bottom-6 right-6 h-12 w-12 rounded-full bg-teal-600 text-white shadow-lg hover:bg-teal-700 shadow-teal-500/25 flex items-center justify-center"
          title="Open Requisitions"
        >
          <ClipboardList size={22} />
        </Button>
      )}

      {/* ========================================================================= */}
      {/* 4. MODALS FOR ADDING DATA */}
      {/* ========================================================================= */}

      {/* Add Vendor Modal */}
      {showAddVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg font-bold">Thêm Nhà cung cấp mới</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddVendor(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddVendor} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="v_name">Tên nhà cung cấp</Label>
                  <Input id="v_name" required value={newVendor.name} onChange={e => setNewVendor({...newVendor, name: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="v_code">Mã nhà cung cấp (VD: VND-XXX)</Label>
                  <Input id="v_code" required value={newVendor.vendor_code} onChange={e => setNewVendor({...newVendor, vendor_code: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="v_email">Email liên hệ</Label>
                  <Input id="v_email" type="email" value={newVendor.email} onChange={e => setNewVendor({...newVendor, email: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="v_phone">Số điện thoại</Label>
                  <Input id="v_phone" value={newVendor.phone} onChange={e => setNewVendor({...newVendor, phone: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddVendor(false)}>Hủy</Button>
                  <Button type="submit" disabled={isLoading} className="bg-teal-600 text-white hover:bg-teal-700">
                    {isLoading ? 'Đang lưu...' : 'Lưu lại'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg font-bold">Thêm Nguyên liệu mới</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddProduct(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddProduct} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="p_name">Tên nguyên liệu / Sản phẩm</Label>
                  <Input id="p_name" required value={newProduct.name} onChange={e => setNewProduct({...newProduct, name: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p_sku">Mã SKU</Label>
                  <Input id="p_sku" required value={newProduct.sku} onChange={e => setNewProduct({...newProduct, sku: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p_category">Danh mục</Label>
                  <select
                    id="p_category"
                    value={newProduct.category}
                    onChange={e => setNewProduct({...newProduct, category: e.target.value})}
                    className="w-full border-input bg-background ring-offset-background h-9 rounded-md border px-3 text-sm focus:outline-none"
                  >
                    <option value="Nguyên liệu gỗ">Nguyên liệu gỗ</option>
                    <option value="Hóa chất">Hóa chất</option>
                    <option value="Vật tư">Vật tư</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p_price">Giá mua dự kiến (USD)</Label>
                  <Input id="p_price" type="number" value={newProduct.target_price} onChange={e => setNewProduct({...newProduct, target_price: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddProduct(false)}>Hủy</Button>
                  <Button type="submit" disabled={isLoading} className="bg-teal-600 text-white hover:bg-teal-700">
                    {isLoading ? 'Đang lưu...' : 'Lưu lại'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Requisition Modal */}
      {showAddRequisition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 dark:border-slate-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-lg font-bold">Tạo Yêu cầu mua hàng mới</CardTitle>
              <Button size="icon" variant="ghost" onClick={() => setShowAddRequisition(false)} className="h-8 w-8 text-slate-400">
                <X size={18} />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddRequisition} className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="r_req">Người yêu cầu</Label>
                  <Input id="r_req" required value={newReq.requester} onChange={e => setNewReq({...newReq, requester: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r_dept">Bộ phận</Label>
                  <Input id="r_dept" required value={newReq.department} onChange={e => setNewReq({...newReq, department: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r_material">Chọn Nguyên liệu / Sản phẩm</Label>
                  <select
                    id="r_material"
                    value={newReq.material_id}
                    onChange={e => setNewReq({...newReq, material_id: e.target.value})}
                    className="w-full border-input bg-background ring-offset-background h-9 rounded-md border px-3 text-sm focus:outline-none"
                  >
                    <option value="">-- Chọn nguyên liệu --</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r_qty">Số lượng yêu cầu</Label>
                  <Input id="r_qty" type="number" required value={newReq.quantity} onChange={e => setNewReq({...newReq, quantity: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="r_notes">Mô tả / Ghi chú yêu cầu</Label>
                  <Input id="r_notes" placeholder="e.g. mua gỗ sồi dự phòng" value={newReq.notes} onChange={e => setNewReq({...newReq, notes: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAddRequisition(false)}>Hủy</Button>
                  <Button type="submit" disabled={isLoading} className="bg-teal-600 text-white hover:bg-teal-700">
                    {isLoading ? 'Đang tạo...' : 'Tạo yêu cầu'}
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
