import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { AuditClient } from './audit-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

async function AuditLoader() {
  const supabase = await createClient()

  // 1. Fetch shortlisted suppliers from order_suppliers with order links
  const { data: shortlistedBids, error: bidsError } = await supabase
    .from('order_suppliers')
    .select('order_id, supplier_id, is_shortlisted, order_items(item_name), suppliers(id, name, phone, address, certifications), orders(order_code)')
    .eq('is_shortlisted', true)

  if (bidsError) {
    console.error('Error fetching shortlisted suppliers:', bidsError.message)
  }

  // BUG 14 FIX: was .filter(s => s.id && s.order_id) which excluded ALL unassigned
  // shortlisted suppliers (order_id = null) from the audit queue. Changed to only
  // require the supplier id so unassigned shortlisted bids can enter the QC pipeline.
  const shortlistedSuppliers = shortlistedBids ? shortlistedBids.map((bid: any) => ({
    id: bid.suppliers?.id,
    name: bid.suppliers?.name,
    phone: bid.suppliers?.phone,
    address: bid.suppliers?.address,
    certifications: bid.suppliers?.certifications || [],
    order_id: bid.order_id,
    order_code: bid.orders?.order_code,
    item_name: bid.order_items?.item_name || '—',
    unique_key: `${bid.order_id}-${bid.suppliers?.id}`
  })).filter(s => s.id) : []

  // 2. Fetch all orders for the sidebar
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, order_code, order_type, stage, order_date')
    .order('created_at', { ascending: false })

  if (ordersError) {
    console.error('Error fetching orders:', ordersError.message)
  }

  // 3. Fetch existing factory audits
  let audits: any[] = []
  let schemaMissing = false

  const { data: auditsData, error: auditsError } = await supabase
    .from('factory_audits')
    .select('*, suppliers(id, name, phone, address, certifications)')
    .order('audit_date', { ascending: false })

  if (auditsError) {
    console.error('Error fetching audits:', auditsError.message)
    const isTableMissing =
      auditsError.code === 'PGRST205' ||
      auditsError.message.includes('relation') ||
      auditsError.message.includes('does not exist') ||
      auditsError.message.includes('Could not find the table')
    
    if (isTableMissing) {
      schemaMissing = true
    }
  } else {
    audits = auditsData || []
  }

  return (
    <AuditClient
      initialShortlistedSuppliers={shortlistedSuppliers}
      initialAudits={audits}
      initialOrders={orders || []}
      schemaMissing={schemaMissing}
    />
  )
}

export default function FactoryAuditPage() {
  return (
    <Suspense fallback={<AuditFallback />}>
      <AuditLoader />
    </Suspense>
  )
}

function AuditFallback() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Controls Row Skeleton */}
      <div className="flex justify-end gap-4">
        <div className="h-9 w-32 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
      </div>

      {/* Content Area Skeleton */}
      <div className="border border-slate-200/60 dark:border-slate-800 rounded-2xl p-6 space-y-4 bg-white/50 dark:bg-slate-900/10">
        <div className="h-8 w-1/4 bg-slate-150 dark:bg-slate-800 rounded-lg" />
        <div className="space-y-3 pt-4">
          <div className="h-4 w-full bg-slate-100 dark:bg-slate-800 rounded" />
          <div className="h-4 w-5/6 bg-slate-100 dark:bg-slate-800 rounded" />
          <div className="h-4 w-4/5 bg-slate-100 dark:bg-slate-800 rounded" />
        </div>
        <div className="flex justify-center items-center py-12 gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
          <span className="text-xs text-slate-400 font-medium">Loading data...</span>
        </div>
      </div>
    </div>
  )
}
