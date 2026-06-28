import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { ProductionClient } from './production-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

async function ProductionLoader() {
  const supabase = await createClient()

  // Fetch internal production batches from DB
  const { data: batches, error } = await supabase
    .from('internal_production_batches')
    .select('*, orders(order_code, order_items(item_name))')
    .order('created_at', { ascending: false })

  // Fetch all orders with their items for the Kanban board
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false })

  if (ordersError) {
    console.error('Error fetching orders for production:', ordersError.message)
  }

  return <ProductionClient initialBatches={batches || []} initialOrders={orders || []} />
}

export default function ProductionPage() {
  return (
    <Suspense fallback={<ProductionFallback />}>
      <ProductionLoader />
    </Suspense>
  )
}

function ProductionFallback() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Active Production Runs
        </h1>
      </div>
      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold">Production Runs</CardTitle>
          <CardDescription className="text-xs">Loading...</CardDescription>
        </CardHeader>
        <CardContent className="p-12 flex flex-col justify-center items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <span className="text-xs text-slate-400 font-medium">Connecting to Supabase...</span>
        </CardContent>
      </Card>
    </div>
  )
}
