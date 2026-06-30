import React, { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { DashboardClient } from './dashboard-client'

// Define interfaces for typings
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
  po_number: string
  gr_number: string
  invoice_number: string
  product_name: string
  po_qty: number
  gr_qty: number
  po_price: number
  invoice_price: number
  status: string
  created_at: string
  orders: { order_code: string } | null
}

interface SearchParams {
  timeframe?: string
  startDate?: string
  endDate?: string
}

async function DashboardLoader({ searchParams }: { searchParams: SearchParams | Promise<SearchParams> }) {
  const supabase = await createClient()

  // 1. Fetch Orders with nested order items
  const { data: rawOrders } = await supabase
    .from('orders')
    .select(`
      id,
      order_code,
      order_type,
      stage,
      estimated_delivery_date,
      order_date,
      created_at,
      order_items (
        id,
        item_name,
        quantity,
        item_type,
        item_status,
        verified_quantity
      )
    `)
    .order('created_at', { ascending: false })

  // 2. Fetch Audits with nested suppliers & orders
  const { data: rawAudits } = await supabase
    .from('factory_audits')
    .select(`
      id,
      audit_status,
      audit_verdict,
      audit_date,
      created_at,
      suppliers (
        supplier_name
      ),
      orders (
        order_code
      )
    `)
    .order('created_at', { ascending: false })

  // 3. Fetch Inbound Inspections with nested orders
  const { data: rawInspections } = await supabase
    .from('inspection_records')
    .select(`
      id,
      verdict,
      quality_status,
      defect_rate,
      defect_notes,
      date_checked,
      created_at,
      orders (
        order_code
      )
    `)
    .order('created_at', { ascending: false })

  // 4. Fetch Production Batches with nested orders
  const { data: rawBatches } = await supabase
    .from('internal_production_batches')
    .select(`
      id,
      production_status,
      target_output_quantity,
      current_assembled_quantity,
      created_at,
      orders (
        order_code
      )
    `)
    .order('created_at', { ascending: false })

  // 5. Fetch all supplier bids from order_suppliers table
  const { data: rawSuppliers } = await supabase
    .from('order_suppliers')
    .select(`
      id,
      quoted_price,
      lead_time_days,
      is_shortlisted,
      created_at,
      created_by,
      supplier_name,
      supplier_id
    `)
    .order('created_at', { ascending: false })

  // 5.1 Fetch all master suppliers for performance metrics
  const { data: rawMasterSuppliers } = await supabase
    .from('suppliers')
    .select(`
      id,
      name,
      created_by,
      quality_rating,
      reliability_score,
      created_at
    `)
    .order('created_at', { ascending: false })

  // 6. Fetch logistics records
  const { data: rawLogistics } = await supabase
    .from('logistics_records')
    .select(`
      id,
      po_number,
      gr_number,
      invoice_number,
      product_name,
      po_qty,
      gr_qty,
      po_price,
      invoice_price,
      status,
      created_at,
      orders (
        order_code
      )
    `)
    .order('created_at', { ascending: false })

  const orders: Order[] = (rawOrders as any) || []
  const audits: Audit[] = (rawAudits as any) || []
  const inspections: Inspection[] = (rawInspections as any) || []
  const batches: ProductionBatch[] = (rawBatches as any) || []
  const suppliers: any[] = (rawSuppliers as any) || []
  const masterSuppliers: any[] = (rawMasterSuppliers as any) || []
  const logistics: LogisticsRecord[] = (rawLogistics as any) || []

  // --- Date Filtering Setup ---
  // BUG 7 FIX: was hard-coded to 2026-06-28 — all filters were frozen at that date.
  // Use the actual current date so timeframe filters (7d, 30d, custom) work correctly.
  const SYSTEM_DATE = new Date()
  let filterStart: Date | null = null
  let filterEnd: Date | null = new Date(new Date().toISOString().split('T')[0] + 'T23:59:59Z')

  const resolvedSearchParams = await Promise.resolve(searchParams)
  const timeframe = resolvedSearchParams?.timeframe || 'all'
  const startDateStr = resolvedSearchParams?.startDate || ''
  const endDateStr = resolvedSearchParams?.endDate || ''

  if (timeframe === '7d') {
    filterStart = new Date(SYSTEM_DATE.getTime() - 7 * 24 * 60 * 60 * 1000)
  } else if (timeframe === '30d') {
    filterStart = new Date(SYSTEM_DATE.getTime() - 30 * 24 * 60 * 60 * 1000)
  } else if (timeframe === 'custom') {
    if (startDateStr) filterStart = new Date(startDateStr + 'T00:00:00Z')
    if (endDateStr) filterEnd = new Date(endDateStr + 'T23:59:59Z')
  }

  const isWithinFilterRange = (createdAtStr: string | null | undefined) => {
    if (!createdAtStr) return false
    const d = new Date(createdAtStr)
    if (isNaN(d.getTime())) return false
    if (filterStart && d < filterStart) return false
    if (filterEnd && d > filterEnd) return false
    return true
  }

  // Apply range filtering
  const filteredOrders = orders.filter(o => isWithinFilterRange(o.created_at || o.order_date))
  const filteredSuppliers = suppliers.filter(s => isWithinFilterRange(s.created_at))
  const filteredMasterSuppliers = masterSuppliers.filter(s => isWithinFilterRange(s.created_at))
  const filteredAudits = audits.filter(a => isWithinFilterRange(a.created_at || a.audit_date))
  const filteredInspections = inspections.filter(i => isWithinFilterRange(i.created_at || i.date_checked))
  const filteredBatches = batches.filter(b => isWithinFilterRange(b.created_at))
  const filteredLogistics = logistics.filter(l => isWithinFilterRange(l.created_at))

  // --- 1. Compute 8 KPI Metrics ---
  const activePoStages = [
    'PO ISSUED',
    'PARTIAL PO ISSUED',
    'PO CONFIRMED',
    'ARRIVED - AWAITING INSPECTION',
    'INSPECTION PASSED',
    'Logistic',
    'Production',
    'PRODUCTION IN PROGRESS',
    'MATERIALS IN STOCK'
  ]
  
  const totalActiveOrders = filteredOrders.filter(o => !['closed', 'completed', 'done', 'Order Done'].includes(o.stage.toLowerCase())).length
  const suppliersEvaluated = filteredSuppliers.length
  const shortlistedSuppliers = filteredSuppliers.filter(s => s.is_shortlisted).length
  const posConfirmed = filteredOrders.filter(o => activePoStages.includes(o.stage)).length

  const completedAudits = filteredAudits.filter(a => a.audit_status === 'Completed')
  const passedAudits = completedAudits.filter(a => 
    a.audit_verdict === 'PASS' || a.audit_verdict === 'PASS WITH CONDITIONS'
  )
  const qaPassRate = completedAudits.length > 0 
    ? (passedAudits.length / completedAudits.length) * 100 
    : 85.0

  const totalInspections = filteredInspections.length
  const passedInspections = filteredInspections.filter(i => i.quality_status === 'PASS' || i.verdict === 'Approved')
  const inspectionComplianceRate = totalInspections > 0 
    ? (passedInspections.length / totalInspections) * 100 
    : 96.8

  const inspectionsWithDefects = filteredInspections.filter(i => typeof i.defect_rate === 'number')
  const avgDefectRate = inspectionsWithDefects.length > 0
    ? inspectionsWithDefects.reduce((acc, i) => acc + Number(i.defect_rate), 0) / inspectionsWithDefects.length
    : 1.4

  const totalTargetQty = filteredBatches.reduce((acc, b) => acc + (b.target_output_quantity || 0), 0)
  const totalAssembledQty = filteredBatches.reduce((acc, b) => acc + (b.current_assembled_quantity || 0), 0)
  const mfgCompletionRate = totalTargetQty > 0 
    ? (totalAssembledQty / totalTargetQty) * 100 
    : 92.5

  // --- 2. Module Health Setup ---
  const ordersHealth = totalActiveOrders > 10 ? 'Warning' : 'Healthy'
  const sourcingHealth = shortlistedSuppliers === 0 && suppliersEvaluated > 0 ? 'Warning' : 'Healthy'
  const auditsHealth = filteredAudits.some(a => a.audit_verdict === 'FAIL') ? 'Critical' : 'Healthy'
  const inspectionsHealth = filteredInspections.some(i => i.quality_status === 'FAIL' || i.verdict === 'Rejected') ? 'Critical' : 'Healthy'
  const logisticsHealth = filteredLogistics.some(l => l.status === 'mismatched') ? 'Critical' : filteredLogistics.some(l => l.status === 'pending') ? 'Warning' : 'Healthy'
  const productionHealth = 'Healthy'

  // --- 3. Risk & Escalations Setup ---
  const failedAudits = filteredAudits.filter(a => a.audit_verdict === 'FAIL')
  const failedInspections = filteredInspections.filter(i => i.quality_status === 'FAIL' || i.verdict === 'Rejected')
  // BUG 7 FIX (part 2): the comparison date was also hard-coded to '2026-06-28'
  const todayStr = new Date().toISOString().split('T')[0]
  const delayedShipments = filteredOrders.filter(o => 
    o.stage !== 'Order Done' && 
    o.estimated_delivery_date && 
    o.estimated_delivery_date < todayStr
  )
  const mismatchedLogistics = filteredLogistics.filter(l => l.status === 'mismatched')

  return (
    <DashboardClient
      orders={orders as any}
      audits={audits as any}
      inspections={inspections as any}
      batches={batches as any}
      suppliers={suppliers}
      masterSuppliers={masterSuppliers}
      logistics={logistics as any}
      filteredOrders={filteredOrders as any}
      filteredSuppliers={filteredSuppliers}
      filteredMasterSuppliers={filteredMasterSuppliers}
      filteredAudits={filteredAudits as any}
      filteredInspections={filteredInspections as any}
      filteredBatches={filteredBatches as any}
      filteredLogistics={filteredLogistics as any}
      totalActiveOrders={totalActiveOrders}
      suppliersEvaluated={suppliersEvaluated}
      shortlistedSuppliers={shortlistedSuppliers}
      posConfirmed={posConfirmed}
      qaPassRate={qaPassRate}
      inspectionComplianceRate={inspectionComplianceRate}
      avgDefectRate={avgDefectRate}
      mfgCompletionRate={mfgCompletionRate}
      ordersHealth={ordersHealth}
      sourcingHealth={sourcingHealth}
      auditsHealth={auditsHealth}
      inspectionsHealth={inspectionsHealth}
      logisticsHealth={logisticsHealth}
      productionHealth={productionHealth}
      failedAudits={failedAudits as any}
      failedInspections={failedInspections as any}
      delayedShipments={delayedShipments as any}
      mismatchedLogistics={mismatchedLogistics}
    />
  )
}

function DashboardFallback() {
  return (
    <div className="space-y-8 w-full animate-pulse">
      {/* Title Header Skeleton */}
      <div className="flex flex-col md:flex-row md:items-center justify-end gap-3 pb-4">
        <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-xl w-36" />
        <div className="h-8 bg-slate-150 dark:bg-slate-800 rounded-xl w-48" />
      </div>

      {/* Top Cards Skeleton */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array(4).fill(0).map((_, idx) => (
          <div key={idx} className="border border-slate-200/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 p-6 rounded-2xl space-y-4">
            <div className="flex justify-between items-center">
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
              <div className="h-7 w-7 bg-slate-150 dark:bg-slate-855 rounded-lg" />
            </div>
            <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
            <div className="h-3 bg-slate-150 dark:bg-slate-855 rounded w-2/3" />
          </div>
        ))}
      </div>

      {/* Two Column Grid Skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        {Array(2).fill(0).map((_, idx) => (
          <div key={idx} className="border border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 rounded-2xl space-y-4 min-h-[350px]">
            <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-1/3" />
            <div className="h-4 bg-slate-150 dark:bg-slate-855 rounded w-1/2" />
            <div className="space-y-3 pt-4">
              <div className="h-10 bg-slate-50 dark:bg-slate-950/40 rounded-lg w-full" />
              <div className="h-10 bg-slate-50 dark:bg-slate-950/40 rounded-lg w-full" />
              <div className="h-10 bg-slate-50 dark:bg-slate-950/40 rounded-lg w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardLoader searchParams={searchParams} />
    </Suspense>
  )
}
