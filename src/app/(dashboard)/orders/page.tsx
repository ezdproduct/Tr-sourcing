import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { OrdersClient } from './orders-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

async function OrdersLoader() {
  const supabase = await createClient()

  // Fetch orders and items from live Supabase database
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching orders from Supabase:', error.message)
  }

  return <OrdersClient initialOrders={(orders as any) || []} />
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersFallback />}>
      <OrdersLoader />
    </Suspense>
  )
}

function OrdersFallback() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Order Management
          </h1>
          <p className="text-sm text-slate-500">
            Phase 1: Monitor active supply chain purchase orders and ingest material specs
          </p>
        </div>
      </div>

      {/* Orders List Card Fallback */}
      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold">Active Purchase Orders</CardTitle>
          <CardDescription className="text-xs">
            Connecting to active Supabase storage...
          </CardDescription>
        </CardHeader>
        <CardContent className="p-12 flex flex-col justify-center items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <span className="text-xs text-slate-400 font-medium">Loading active purchase orders...</span>
        </CardContent>
      </Card>
    </div>
  )
}
