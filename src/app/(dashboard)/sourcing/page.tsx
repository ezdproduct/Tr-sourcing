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
    .select('*, order_suppliers(*, orders(order_code), order_items(item_name))')
    .order('created_at', { ascending: false })

  if (suppliersError) {
    console.error('Error fetching suppliers:', suppliersError.message)
  }

  // Transform to the flat structure expected by SourcingClient
  const transformedSuppliers: any[] = []
  if (dbSuppliers) {
    dbSuppliers.forEach((s: any) => {
      const validBids = s.order_suppliers ? s.order_suppliers.filter((b: any) => b.order_id !== null) : []

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
          orders: null,
          order_items: null,
          suppliers: {
            email: s.email,
            phone: s.phone,
            address: s.address
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
            orders: bid.orders,
            order_items: bid.order_items,
            suppliers: {
              email: s.email,
              phone: s.phone,
              address: s.address
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
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Supplier Sourcing &amp; Matrix
        </h1>
      </div>

      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold">Factory Comparison Matrix</CardTitle>
          <CardDescription className="text-xs">Connecting to Supabase...</CardDescription>
        </CardHeader>
        <CardContent className="p-12 flex flex-col justify-center items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <span className="text-xs text-slate-400 font-medium">Loading sourcing data...</span>
        </CardContent>
      </Card>
    </div>
  )
}
