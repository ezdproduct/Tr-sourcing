import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { SourcingClient } from './sourcing-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

async function SourcingLoader() {
  const supabase = await createClient()

  // Fetch all orders (with items for display)
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*, order_items(id, item_name, quantity, item_type)')
    .order('created_at', { ascending: false })

  if (ordersError) {
    console.error('Error fetching orders for sourcing:', ordersError.message)
  }

  // Fetch all supplier records joined with associated order_code, order_item, and basic contact info
  const { data: suppliers, error: suppliersError } = await supabase
    .from('order_suppliers')
    .select('*, orders(order_code), order_items(item_name), suppliers(email, phone, address)')
    .order('created_at', { ascending: false })

  if (suppliersError) {
    console.error('Error fetching suppliers:', suppliersError.message)
  }

  return (
    <SourcingClient
      initialOrders={(orders as any) || []}
      initialSuppliers={(suppliers as any) || []}
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
