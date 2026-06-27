import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { LogisticsClient } from './logistics-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

async function LogisticsLoader() {
  const supabase = await createClient()

  // Fetch logistics records from DB
  const { data: records, error } = await supabase
    .from('logistics_records')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching logistics records:', error.message)
  }

  return <LogisticsClient initialRecords={records || []} />
}

export default function LogisticsInboundPage() {
  return (
    <Suspense fallback={<LogisticsFallback />}>
      <LogisticsLoader />
    </Suspense>
  )
}

function LogisticsFallback() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Logistics &amp; Inbound Reconciliation
        </h1>
      </div>
      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold">3-Way Match Verification Grid</CardTitle>
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
