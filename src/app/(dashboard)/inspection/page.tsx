import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { InspectionClient } from './inspection-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

async function InspectionLoader() {
  const supabase = await createClient()

  // 1. Fetch inspection records
  const { data: inspections, error: inspError } = await supabase
    .from('inspection_records')
    .select('*, orders(order_code)')
    .order('created_at', { ascending: false })

  if (inspError) {
    console.error('Error fetching inspections:', inspError.message)
  }

  // 2. Fetch active order items waiting for inspection (item_status = 'ARRIVED')
  const { data: arrivedItems, error: orderError } = await supabase
    .from('order_items')
    .select('id, item_name, quantity, uom, item_status, order_id, orders(order_code)')
    .eq('item_status', 'ARRIVED')

  if (orderError) {
    console.error('Error fetching active inspection orders:', orderError.message)
  }

  const activeOrders = arrivedItems ? arrivedItems.map((item: any) => ({
    id: item.order_id,
    order_code: item.orders?.order_code || 'N/A',
    order_items: [{
      id: item.id,
      item_name: item.item_name,
      quantity: item.quantity,
      uom: item.uom
    }]
  })) : []

  // 3. Fetch all orders for the sidebar
  const { data: orders, error: allOrdersError } = await supabase
    .from('orders')
    .select('id, order_code, order_type, stage, order_date, estimated_delivery_date, order_stage_timelines(*)')
    .order('created_at', { ascending: false })

  if (allOrdersError) {
    console.error('Error fetching all orders:', allOrdersError.message)
  }

  return (
    <InspectionClient
      initialInspections={inspections || []}
      activeOrders={activeOrders || []}
      initialOrders={orders || []}
    />
  )
}

export default function PortInspectionPage() {
  return (
    <Suspense fallback={<InspectionFallback />}>
      <InspectionLoader />
    </Suspense>
  )
}

function InspectionFallback() {
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
