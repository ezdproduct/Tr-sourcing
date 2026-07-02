import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { redirect } from 'next/navigation'
import { SupplierDetailClient } from './supplier-detail-client'
import { Loader2 } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

async function SupplierLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Auth check
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect('/auth/login')
  }

  // 2. Fetch supplier details with associated bids, audits & capabilities
  const { data: supplier, error } = await supabase
    .from('suppliers')
    .select('*, order_suppliers(*, orders(order_code), order_items(item_name)), factory_audits(*), supplier_capabilities(*), supplier_product_history(*)')
    .eq('id', id)
    .single()

  if (error || !supplier) {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Supplier Not Found</h2>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
            The supplier profile you are trying to view does not exist or has been deleted.
          </p>
        </div>
      </div>
    )
  }

  return <SupplierDetailClient supplier={supplier} />
}

export default function Page({ params }: PageProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] w-full items-center justify-center gap-2 text-slate-500 text-sm">
          <Loader2 className="animate-spin" size={16} />
          <span>Loading supplier details...</span>
        </div>
      }
    >
      <SupplierLoader params={params} />
    </Suspense>
  )
}
