import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { SourcingClient } from './sourcing-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

async function SourcingLoader() {
  const supabase = await createClient()

  // Fetch all orders with their items
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })

  if (ordersError) {
    console.error('Error fetching orders for sourcing:', ordersError.message)
  }

  // Fetch all factory audits to verify QC completion
  const { data: audits, error: auditsError } = await supabase
    .from('factory_audits')
    .select('*')

  if (auditsError) {
    console.error('Error fetching factory audits:', auditsError.message)
  }

  // Fetch all supplier records from the master suppliers table, and optionally join their bids if any
  const { data: dbSuppliers, error: suppliersError } = await supabase
    .from('suppliers')
    .select('*, order_suppliers(*, orders(order_code), order_items(item_name)), supplier_capabilities(*)')
    .order('created_at', { ascending: false })

  if (suppliersError) {
    console.error('Error fetching suppliers:', suppliersError.message)
  }

  // Transform to the flat structure expected by SourcingClient
  const transformedSuppliers: any[] = []
  if (dbSuppliers) {
    dbSuppliers.forEach((s: any) => {
      const validBids = s.order_suppliers || []

      if (validBids.length === 0) {
        transformedSuppliers.push({
          id: s.id, // master supplier ID (since they have no bids, this is unique)
          supplier_id: s.id,
          order_id: null,
          order_item_id: null,
          supplier_name: s.name,
          quoted_price: 0,
          lead_time_days: 0,
          is_shortlisted: false,
          is_bid: false, // Flag to indicate master profile
          created_at: s.created_at,
          created_by: s.created_by,
          orders: null,
          order_items: null,
          suppliers: {
            ...s,
            order_suppliers: undefined
          }
        })
      } else {
        validBids.forEach((bid: any) => {
          transformedSuppliers.push({
            id: bid.id, // unique bid ID
            supplier_id: s.id,
            order_id: bid.order_id,
            order_item_id: bid.order_item_id,
            supplier_name: s.name,
            quoted_price: bid.quoted_price,
            lead_time_days: bid.lead_time_days,
            is_shortlisted: bid.is_shortlisted,
            is_bid: true, // Flag to indicate bid record
            created_at: bid.created_at,
            created_by: bid.created_by || s.created_by,
            orders: bid.orders,
            order_items: bid.order_items,
            suppliers: {
              ...s,
              order_suppliers: undefined
            }
          })
        })
      }
    })
  }

  return (
    <SourcingClient
      initialOrders={(orders as any) || []}
      initialSuppliers={transformedSuppliers}
      initialAudits={audits || []}
    />
  )
}

export default function SupplierSourcingPage() {
  return (
    <Suspense fallback={<SourcingFallback />}>
      <SourcingLoader />
    </Suspense>
  )
}

function SourcingFallback() {
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
