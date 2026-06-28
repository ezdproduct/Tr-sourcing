import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { OrdersClient } from './orders-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

async function OrdersLoader() {
  const supabase = await createClient()

  const { data: orders, error } = await supabase
    .from('orders')
    .select('*, order_items(*), order_stage_timelines(*)')
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
