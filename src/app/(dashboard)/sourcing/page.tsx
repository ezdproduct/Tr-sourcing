import { Suspense } from 'react'
import { HydrationBoundary, dehydrate } from '@tanstack/react-query'
import { getQueryClient } from '@/utils/query-client'
import { SourcingClient } from './sourcing-client'
import { suppliersQueryOptions, ordersQueryOptions, auditsQueryOptions } from './api/queries'
import {
  fetchSuppliersAction,
  fetchOrdersAction,
  fetchAuditsAction,
} from './actions'

async function SourcingLoader() {
  const queryClient = getQueryClient()

  // Fetch/prefetch data on the server
  // Using Promise.all to fetch in parallel and avoid sequential waterfalls
  await Promise.all([
    queryClient.prefetchQuery(suppliersQueryOptions()),
    queryClient.prefetchQuery(ordersQueryOptions()),
    queryClient.prefetchQuery(auditsQueryOptions()),
  ])

  // Get initial values to pass as fallback props to SourcingClient
  // (to guarantee immediate render before hydration if JS is slow)
  const initialSuppliers = queryClient.getQueryData<any[]>(suppliersQueryOptions().queryKey) || []
  const initialOrders = queryClient.getQueryData<any[]>(ordersQueryOptions().queryKey) || []
  const initialAudits = queryClient.getQueryData<any[]>(auditsQueryOptions().queryKey) || []

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SourcingClient
        initialOrders={initialOrders}
        initialSuppliers={initialSuppliers}
        initialAudits={initialAudits}
      />
    </HydrationBoundary>
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
