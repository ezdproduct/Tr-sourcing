import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { redirect } from 'next/navigation'
import { ManagementClient } from './management-client'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Users2 } from 'lucide-react'

async function ManagementLoader() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()
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
          <h2 className="mb-2 text-lg font-bold text-slate-800 dark:text-white">
            Access Denied
          </h2>
          <p className="max-w-sm text-xs leading-relaxed text-slate-500">
            Only administrators are authorized to access the user management
            panel.
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
    .select(
      '*, order_suppliers(*, orders(order_code), order_items(item_name)), factory_audits(*)',
    )
    .order('name', { ascending: true })

  if (suppliersError) {
    console.error(
      'Error loading suppliers for management:',
      suppliersError.message,
    )
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
    console.error(
      'Error loading supplier product history logs:',
      productLogsError.message,
    )
  }

  const combinedLogs = [
    ...(logs || []).map((l) => ({ ...l, type: 'activity' })),
    ...(productLogs || []).map((pl) => ({
      id: pl.id,
      type: 'product_history',
      event_type: pl.event_type,
      product_name: pl.product_name,
      price: pl.price,
      created_at: pl.created_at,
      created_by: pl.created_by,
      supplier_name: pl.suppliers?.name || 'Unknown',
    })),
  ].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const { data: userMappings } = await supabase
    .from('sheets_user_mapping')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: rawUserIdsData } = await supabase
    .from('sheets_raw_suppliers')
    .select('raw_user_id')
    .not('raw_user_id', 'is', null)

  const uniqueRawUserIds = Array.from(
    new Set((rawUserIdsData || []).map((r) => r.raw_user_id)),
  )

  // Fetch Sheets App profiles if credentials are configured
  let sheetsProfiles: any[] = []
  const sheetsUrl = process.env.NEXT_PUBLIC_SHEETS_SUPABASE_URL
  const sheetsAnonKey = process.env.NEXT_PUBLIC_SHEETS_SUPABASE_ANON_KEY
  if (sheetsUrl && sheetsAnonKey) {
    try {
      const { createClient: createSimpleClient } =
        await import('@supabase/supabase-js')
      const sheetsSupabase = createSimpleClient(sheetsUrl, sheetsAnonKey)
      const { data } = await sheetsSupabase
        .from('profiles')
        .select('id, username, full_name')
      if (data) {
        sheetsProfiles = data
      }
    } catch (e) {
      console.error('Failed to fetch profiles from Sheets App:', e)
    }
  }

  return (
    <ManagementClient
      initialProfiles={profiles || []}
      initialSuppliers={suppliers || []}
      initialLogs={combinedLogs}
      initialUserMappings={userMappings || []}
      discoveredUserIds={uniqueRawUserIds}
      sheetsProfiles={sheetsProfiles}
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
      <Card className="border-slate-200/60 shadow-sm dark:border-slate-800">
        <CardHeader className="border-b border-slate-100 pb-3 dark:border-slate-800">
          <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
            <Users2 size={18} className="text-[#5c59e9]" />
            <span>Authorized System Profiles</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Connecting to user directory database...
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-3 p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <span className="text-xs font-medium text-slate-400">
            Loading user profiles...
          </span>
        </CardContent>
      </Card>
    </div>
  )
}
