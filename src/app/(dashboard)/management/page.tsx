import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { redirect } from 'next/navigation'
import { ManagementClient } from './management-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Users2 } from 'lucide-react'

async function ManagementLoader() {
  const supabase = await createClient()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    redirect('/auth/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex h-[60vh] w-full items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Access Denied</h2>
          <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
            Only administrators are authorized to access the user management panel.
          </p>
        </div>
      </div>
    )
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('email', { ascending: true })

  if (error) {
    console.error('Error loading profiles:', error.message)
  }

  const { data: suppliers, error: suppliersError } = await supabase
    .from('suppliers')
    .select('*, order_suppliers(*, orders(order_code), order_items(item_name)), factory_audits(*)')
    .order('name', { ascending: true })

  if (suppliersError) {
    console.error('Error loading suppliers for management:', suppliersError.message)
  }

  const { data: logs, error: logsError } = await supabase
    .from('order_activities')
    .select('*')
    .ilike('activity_text', 'Supplier Profile%')
    .order('created_at', { ascending: false })

  if (logsError) {
    console.error('Error loading supplier logs:', logsError.message)
  }

  const { data: productLogs, error: productLogsError } = await supabase
    .from('supplier_product_history')
    .select('*, suppliers(name)')
    .order('created_at', { ascending: false })

  if (productLogsError) {
    console.error('Error loading supplier product history logs:', productLogsError.message)
  }

  const combinedLogs = [
    ...(logs || []).map(l => ({ ...l, type: 'activity' })),
    ...(productLogs || []).map(pl => ({
      id: pl.id,
      type: 'product_history',
      event_type: pl.event_type,
      product_name: pl.product_name,
      price: pl.price,
      created_at: pl.created_at,
      created_by: pl.created_by,
      supplier_name: pl.suppliers?.name || 'Unknown'
    }))
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const { data: userMappings } = await supabase
    .from('sheets_user_mapping')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: rawUserIdsData } = await supabase
    .from('sheets_raw_suppliers')
    .select('raw_user_id')
    .not('raw_user_id', 'is', null)

  const uniqueRawUserIds = Array.from(new Set((rawUserIdsData || []).map((r) => r.raw_user_id)))

  return (
    <ManagementClient
      initialProfiles={profiles || []}
      initialSuppliers={suppliers || []}
      initialLogs={combinedLogs}
      initialUserMappings={userMappings || []}
      discoveredUserIds={uniqueRawUserIds}
    />
  )
}

export default function ManagementPage() {
  return (
    <Suspense fallback={<ManagementFallback />}>
      <ManagementLoader />
    </Suspense>
  )
}

function ManagementFallback() {
  return (
    <div className="space-y-6">

      <Card className="border-slate-200/60 dark:border-slate-800 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Users2 size={18} className="text-[#5c59e9]" />
            <span>Authorized System Profiles</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Connecting to user directory database...
          </CardDescription>
        </CardHeader>
        <CardContent className="p-12 flex flex-col justify-center items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <span className="text-xs text-slate-400 font-medium">Loading user profiles...</span>
        </CardContent>
      </Card>
    </div>
  )
}
