'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSourcing } from '@/providers/sourcing-provider'
import { KanbanBoard } from '@/app/(dashboard)/orders/kanban-board'
import { updateOrderStageAction } from '@/app/(dashboard)/orders/actions'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  Package,
  ShieldCheck,
  CheckCircle2,
  Activity,
  AlertTriangle,
  Clock,
  ShoppingBag,
  Calendar,
  AlertCircle,
  TrendingDown,
  Warehouse,
  Truck,
  Handshake
} from 'lucide-react'
import { TimeframeSelector } from './timeframe-selector'
import { SourcingPerformance } from './components/sourcing-performance'

interface OrderItem {
  id: string
  item_name: string
  quantity: number
  item_type: string
  item_status: string
  verified_quantity: number
}

interface Order {
  id: string
  order_code: string
  order_type: string
  stage: string
  estimated_delivery_date: string
  order_date: string
  created_at: string
  order_items: OrderItem[]
}

interface Audit {
  id: string
  audit_status: string
  audit_verdict: string
  audit_date: string
  created_at: string
  suppliers: { supplier_name: string } | null
  orders: { order_code: string } | null
}

interface Inspection {
  id: string
  verdict: string
  quality_status: string
  defect_rate: number
  defect_notes: string | null
  date_checked: string
  created_at: string
  orders: { order_code: string } | null
}

interface ProductionBatch {
  id: string
  production_status: string
  target_output_quantity: number
  current_assembled_quantity: number
  created_at: string
  orders: { order_code: string } | null
}

interface LogisticsRecord {
  id: string
  status: string
  created_at: string
}

interface DashboardClientProps {
  orders: Order[]
  audits: Audit[]
  inspections: Inspection[]
  batches: ProductionBatch[]
  suppliers: any[]
  masterSuppliers: any[]
  logistics: LogisticsRecord[]
  
  // Filtered lists
  filteredOrders: Order[]
  filteredSuppliers: any[]
  filteredMasterSuppliers: any[]
  filteredAudits: Audit[]
  filteredInspections: Inspection[]
  filteredBatches: ProductionBatch[]
  filteredLogistics: LogisticsRecord[]

  // Computed metrics
  totalActiveOrders: number
  suppliersEvaluated: number
  shortlistedSuppliers: number
  posConfirmed: number
  qaPassRate: number
  inspectionComplianceRate: number
  avgDefectRate: number
  mfgCompletionRate: number
  
  // Health
  ordersHealth: string
  sourcingHealth: string
  auditsHealth: string
  inspectionsHealth: string
  logisticsHealth: string
  productionHealth: string
  
  // Risks
  failedAudits: Audit[]
  failedInspections: Inspection[]
  delayedShipments: Order[]
  mismatchedLogistics: any[]
}

export function DashboardClient(props: DashboardClientProps) {
  const router = useRouter()
  const { userRole } = useSourcing()
  const [viewMode, setViewMode] = useState<'analytics' | 'kanban' | 'performance'>('analytics')

  // Boss, admin, and staff can drag and drop stages on the dashboard
  const isWriteAllowed = userRole === 'admin' || userRole === 'boss' || userRole === 'staff'

  const handleStageChange = async (orderId: string, newStage: string) => {
    const result = await updateOrderStageAction(orderId, newStage)
    if (!result.success) {
      alert(`Failed to update order stage: ${result.error}`)
      return false
    }
    router.refresh()
    return true
  }

  // Helper to map order stage text
  const getItemProgressStatus = (item: OrderItem, orderStage: string) => {
    const stage = orderStage.toLowerCase()
    const status = item.item_status || ''
    const type = item.item_type || 'PRODUCT'
    
    if (status === 'INSPECTION_PASSED') return 'Stocked In'
    if (status === 'ARRIVED') return 'Awaiting Inspection'
    
    if (stage.includes('production') || stage.includes('stock') || stage.includes('assemble')) {
      return type === 'MATERIAL' ? 'In Assembly Line' : 'Production Ops'
    }
    
    if (stage.includes('po') || stage.includes('inspection') || stage.includes('logistics')) {
      return 'In Inbound Transit'
    }
    
    return 'Sourcing'
  }

  return (
    <div className="space-y-8 w-full">
      {/* 1. Header (Timeframe Selector left + View Mode toggle right) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/50 dark:border-slate-800 pb-4">
        {/* Left Side: Timeframe selector and Reference Date */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 bg-slate-100/50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 px-2.5 py-1 rounded-xl">
            <Calendar size={11} className="text-indigo-500" />
            <span>Ref Date: June 28, 2026</span>
          </div>
          <TimeframeSelector />
        </div>

        {/* Right Side: Analytics vs Kanban View Toggle */}
        <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/80 self-start md:self-center">
          <Button
            variant={viewMode === 'analytics' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('analytics')}
            className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
              viewMode === 'analytics'
                ? 'bg-white text-[#5c59e9] shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Analytics
          </Button>
          <Button
            variant={viewMode === 'performance' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('performance')}
            className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
              viewMode === 'performance'
                ? 'bg-white text-[#5c59e9] shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Sourcing Performance
          </Button>
          <Button
            variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('kanban')}
            className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
              viewMode === 'kanban'
                ? 'bg-white text-[#5c59e9] shadow-xs dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Kanban Board
          </Button>
        </div>
      </div>

      {/* 2. Content view routing */}
      {viewMode === 'analytics' ? (
        <div className="space-y-8 animate-in fade-in duration-250">
          {/* Top Metrics Row */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Volume & Pipeline</h3>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 mb-6">
              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Active Orders</CardTitle>
                  <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg"><Package className="h-4 w-4 text-indigo-500" /></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{props.totalActiveOrders}</div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Orders in workflow</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Suppliers</CardTitle>
                  <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg"><Handshake className="h-4 w-4 text-indigo-500" /></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{props.masterSuppliers.length}</div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">
                    {props.filteredMasterSuppliers.length !== props.masterSuppliers.length 
                      ? `${props.filteredMasterSuppliers.length} added in timeframe`
                      : 'Master database'}
                  </p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Suppliers Evaluated</CardTitle>
                  <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg"><ShoppingBag className="h-4 w-4 text-indigo-500" /></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{props.suppliersEvaluated}</div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Bids in system</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Shortlisted Suppliers</CardTitle>
                  <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{props.shortlistedSuppliers}</div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Qualified candidates</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">POs Confirmed</CardTitle>
                  <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{props.posConfirmed}</div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Purchase orders active</p>
                </CardContent>
              </Card>
            </div>

            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Quality & Operations</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">QA Factory Pass Rate</CardTitle>
                  <div className="p-1.5 bg-teal-50 dark:bg-teal-950/40 rounded-lg"><ShieldCheck className="h-4 w-4 text-teal-500" /></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{props.qaPassRate.toFixed(1)}%</div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Audit clearance score</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Inbound Compliance</CardTitle>
                  <div className="p-1.5 bg-teal-50 dark:bg-teal-950/40 rounded-lg"><ShieldCheck className="h-4 w-4 text-teal-500" /></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{props.inspectionComplianceRate.toFixed(1)}%</div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Compliance at port</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Avg Defect Rate</CardTitle>
                  <div className="p-1.5 bg-rose-50 dark:bg-rose-950/40 rounded-lg"><TrendingDown className="h-4 w-4 text-rose-500" /></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{props.avgDefectRate.toFixed(2)}%</div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Lower is better (target &lt; 2.5%)</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/50 dark:bg-slate-900/40 shadow-xs">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Mfg Assembly Progress</CardTitle>
                  <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg"><Activity className="h-4 w-4 text-indigo-500" /></div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{props.mfgCompletionRate.toFixed(1)}%</div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">Units assembled vs target</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Module Health Overview Grid */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Module Status & Health Overview</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Orders */}
              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Package size={14} className="text-indigo-500" />
                      <span>Order Management</span>
                    </span>
                    <Badge variant="outline" className={`text-[9px] font-bold rounded-full border-0 px-2 py-0.5 ${props.ordersHealth === 'Healthy' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                      {props.ordersHealth}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex justify-between"><span className="font-semibold">Total Orders:</span> <span>{props.orders.length}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Active Orders:</span> <span>{props.totalActiveOrders}</span></div>
                </CardContent>
              </Card>

              {/* Sourcing */}
              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <ShoppingBag size={14} className="text-indigo-500" />
                      <span>Sourcing Management</span>
                    </span>
                    <Badge variant="outline" className={`text-[9px] font-bold rounded-full border-0 px-2 py-0.5 ${props.sourcingHealth === 'Healthy' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                      {props.sourcingHealth}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex justify-between"><span className="font-semibold">Total Suppliers:</span> <span>{props.masterSuppliers.length}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Bids Evaluated:</span> <span>{props.suppliersEvaluated}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Shortlisted:</span> <span>{props.shortlistedSuppliers}</span></div>
                </CardContent>
              </Card>

              {/* Quality Audit */}
              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-teal-500" />
                      <span>Quality Control</span>
                    </span>
                    <Badge variant="outline" className={`text-[9px] font-bold rounded-full border-0 px-2 py-0.5 ${props.auditsHealth === 'Healthy' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                      {props.auditsHealth}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex justify-between"><span className="font-semibold">Scheduled Audits:</span> <span>{props.filteredAudits.filter(a => a.audit_status === 'Scheduled').length}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Completed Audits:</span> <span>{props.filteredAudits.filter(a => a.audit_status === 'Completed').length}</span></div>
                </CardContent>
              </Card>

              {/* Port Inspection */}
              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Warehouse size={14} className="text-teal-500" />
                      <span>Inspection</span>
                    </span>
                    <Badge variant="outline" className={`text-[9px] font-bold rounded-full border-0 px-2 py-0.5 ${props.inspectionsHealth === 'Healthy' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'}`}>
                      {props.inspectionsHealth}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex justify-between"><span className="font-semibold">Total Inspected:</span> <span>{props.filteredInspections.length}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Defects (AQL):</span> <span>{props.avgDefectRate.toFixed(2)}%</span></div>
                </CardContent>
              </Card>

              {/* Logistics */}
              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Truck size={14} className="text-amber-500" />
                      <span>Logistics & Inventory</span>
                    </span>
                    <Badge variant="outline" className={`text-[9px] font-bold rounded-full border-0 px-2 py-0.5 ${props.logisticsHealth === 'Healthy' ? 'bg-emerald-500/10 text-emerald-600' : props.logisticsHealth === 'Warning' ? 'bg-amber-500/10 text-amber-600' : 'bg-rose-500/10 text-rose-600'}`}>
                      {props.logisticsHealth}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex justify-between"><span className="font-semibold">Matched Matches:</span> <span>{props.filteredLogistics.filter(l => l.status === 'matched').length}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Discrepancies:</span> <span>{props.filteredLogistics.filter(l => l.status === 'mismatched').length}</span></div>
                </CardContent>
              </Card>

              {/* Production */}
              <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 shadow-xs">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity size={14} className="text-indigo-500" />
                      <span>Production</span>
                    </span>
                    <Badge variant="outline" className="text-[9px] font-bold rounded-full border-0 px-2 py-0.5 bg-emerald-500/10 text-emerald-600">
                      {props.productionHealth}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="flex justify-between"><span className="font-semibold">Running Lines:</span> <span>{props.filteredBatches.filter(b => b.production_status === 'IN_PROGRESS').length}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Completed Runs:</span> <span>{props.filteredBatches.filter(b => b.production_status === 'COMPLETED').length}</span></div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Two-Column Critical Intelligence Hub */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Risk & Escalation Radar */}
            <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xs flex flex-col">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" />
                  <span>Risk & Escalation Radar</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Warnings across audits, ports, logistics discrepancies, and late shipments.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1 max-h-[480px] overflow-y-auto pr-1">
                {props.failedAudits.map(audit => (
                  <div key={audit.id} className="flex items-start gap-2.5 bg-rose-500/5 border border-rose-500/15 p-3 rounded-xl text-xs">
                    <AlertCircle className="text-rose-500 mt-0.5 flex-shrink-0" size={14} />
                    <div className="flex-1">
                      <div className="flex justify-between items-center"><span className="font-bold text-slate-900 dark:text-white">[AUDIT FAIL] {audit.suppliers?.supplier_name}</span> <span className="text-[10px] text-slate-400">{audit.audit_date}</span></div>
                      <p className="text-slate-500 mt-0.5">QC verdict rejected for Order Ref: <strong className="font-semibold">{audit.orders?.order_code}</strong></p>
                    </div>
                  </div>
                ))}

                {props.failedInspections.map(ins => (
                  <div key={ins.id} className="flex items-start gap-2.5 bg-rose-500/5 border border-rose-500/15 p-3 rounded-xl text-xs">
                    <AlertCircle className="text-rose-500 mt-0.5 flex-shrink-0" size={14} />
                    <div className="flex-1">
                      <div className="flex justify-between items-center"><span className="font-bold text-slate-900 dark:text-white">[PORT REJECTED] Order: {ins.orders?.order_code}</span> <span className="text-[10px] text-slate-400">{ins.date_checked}</span></div>
                      <p className="text-slate-500 mt-0.5">Defect rate: <strong className="text-rose-500 font-bold">{ins.defect_rate}%</strong>. {ins.defect_notes ? `Notes: ${ins.defect_notes}` : ''}</p>
                    </div>
                  </div>
                ))}

                {props.delayedShipments.map(ord => (
                  <div key={ord.id} className="flex items-start gap-2.5 bg-amber-500/5 border border-amber-500/15 p-3 rounded-xl text-xs">
                    <Clock className="text-amber-500 mt-0.5 flex-shrink-0" size={14} />
                    <div className="flex-1">
                      <div className="flex justify-between items-center"><span className="font-bold text-slate-900 dark:text-white">[LATE SHIPMENT] Order: {ord.order_code}</span> <span className="text-[10px] text-amber-500 font-bold">Due: {ord.estimated_delivery_date}</span></div>
                      <p className="text-slate-500 mt-0.5">Order stage: <strong className="font-medium text-slate-650">{ord.stage}</strong> has missed its estimated timeline.</p>
                    </div>
                  </div>
                ))}

                {props.mismatchedLogistics.map(l => (
                  <div key={l.id} className="flex items-start gap-2.5 bg-rose-500/5 border border-rose-500/15 p-3 rounded-xl text-xs">
                    <AlertTriangle className="text-rose-500 mt-0.5 flex-shrink-0" size={14} />
                    <div className="flex-1">
                      <div className="flex justify-between items-center"><span className="font-bold text-slate-900 dark:text-white">[3-WAY MISMATCH] PO: {l.po_number}</span> <span className="text-[10px] text-slate-400">Logistics Log</span></div>
                      <p className="text-slate-500 mt-0.5">Discrepancy in Quantity (PO {l.po_qty} vs GR {l.gr_qty}) or Price (PO ${l.po_price} vs Inv ${l.invoice_price}) for {l.product_name}.</p>
                    </div>
                  </div>
                ))}

                {props.failedAudits.length === 0 && props.failedInspections.length === 0 && props.delayedShipments.length === 0 && props.mismatchedLogistics.length === 0 && (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-600 h-full min-h-[250px]">
                    <ShieldCheck size={28} className="mb-2 text-emerald-500/40" />
                    <p className="text-xs font-semibold">Zero critical risks or discrepancies detected.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Order Activity Feed */}
            <Card className="border-slate-200/60 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-xs flex flex-col">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity size={16} className="text-indigo-500" />
                  <span>Recent Order Activity</span>
                </CardTitle>
                <CardDescription className="text-xs">
                  Visual list of the last 8 orders updated within this timeframe.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 max-h-[480px] overflow-y-auto pr-1">
                {props.filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 dark:text-slate-655 h-full min-h-[250px]">
                    <Package size={28} className="mb-2 text-slate-200 dark:text-slate-800" />
                    <p className="text-xs italic">No orders found in the selected timeframe.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {props.filteredOrders.slice(0, 8).map(order => (
                      <div key={order.id} className="py-3 flex items-center justify-between text-xs hover:bg-slate-50/50 dark:hover:bg-slate-850/20 px-1 rounded-lg transition-colors">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{order.order_code}</span>
                            <Badge variant="outline" className={`text-[8px] font-black px-1.5 py-0.25 rounded-md ${
                              order.order_type === 'MATERIAL' 
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900' 
                                : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-955/20 dark:text-blue-400 dark:border-blue-900'
                            }`}>
                              {order.order_type || 'PENDING'}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-slate-450 dark:text-slate-400 font-medium">
                            Opened: {order.order_date || 'N/A'}
                          </div>
                        </div>
                        <div>
                          <Badge variant="outline" className="text-[9px] font-bold border-slate-250 text-slate-600 bg-slate-50/50 dark:border-slate-800 dark:text-slate-355 dark:bg-slate-900/40">
                            {order.stage}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : viewMode === 'performance' ? (
        <div className="animate-in fade-in duration-250">
          <SourcingPerformance
            bids={props.filteredSuppliers}
            masterSuppliers={props.filteredMasterSuppliers}
          />
        </div>
      ) : (
        /* Kanban View Mode */
        <div className="animate-in fade-in duration-250">
          <KanbanBoard
            orders={props.orders}
            isStaffOrAdmin={isWriteAllowed}
            onStageChange={handleStageChange}
            onCardClick={() => {}}
          />
        </div>
      )}
    </div>
  )
}
