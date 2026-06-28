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
    .select('id, order_code, order_type, stage, order_date')
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Port Loading &amp; Inspection
        </h1>
      </div>
      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold">Port Inspection Records</CardTitle>
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
