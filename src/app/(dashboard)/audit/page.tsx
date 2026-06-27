import { Suspense } from 'react'
import { createClient } from '@/supabase/server'
import { AuditClient } from './audit-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

async function AuditLoader() {
  const supabase = await createClient()

  // 1. Fetch shortlisted suppliers from order_suppliers
  const { data: shortlistedBids, error: bidsError } = await supabase
    .from('order_suppliers')
    .select('supplier_id, is_shortlisted, suppliers(id, name, phone, address)')
    .eq('is_shortlisted', true)

  if (bidsError) {
    console.error('Error fetching shortlisted suppliers:', bidsError.message)
  }

  // De-duplicate shortlisted suppliers by supplier_id
  const shortlistedSuppliersMap = new Map<string, any>()
  if (shortlistedBids) {
    shortlistedBids.forEach((bid: any) => {
      if (bid.suppliers && bid.supplier_id) {
        shortlistedSuppliersMap.set(bid.supplier_id, {
          id: bid.suppliers.id,
          name: bid.suppliers.name,
          phone: bid.suppliers.phone,
          address: bid.suppliers.address
        })
      }
    })
  }
  const shortlistedSuppliers = Array.from(shortlistedSuppliersMap.values())

  // 2. Fetch existing factory audits
  let audits: any[] = []
  let schemaMissing = false

  const { data: auditsData, error: auditsError } = await supabase
    .from('factory_audits')
    .select('*, suppliers(id, name, phone, address)')
    .order('audit_date', { ascending: false })

  if (auditsError) {
    console.error('Error fetching audits:', auditsError.message)
    const isTableMissing =
      auditsError.code === 'PGRST205' ||
      auditsError.message.includes('relation') ||
      auditsError.message.includes('does not exist') ||
      auditsError.message.includes('Could not find the table')
    
    if (isTableMissing) {
      schemaMissing = true
    }
  } else {
    audits = auditsData || []
  }

  return (
    <AuditClient
      initialShortlistedSuppliers={shortlistedSuppliers}
      initialAudits={audits}
      schemaMissing={schemaMissing}
    />
  )
}

export default function FactoryAuditPage() {
  return (
    <Suspense fallback={<AuditFallback />}>
      <AuditLoader />
    </Suspense>
  )
}

function AuditFallback() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Factory Auditing &amp; Quality Control
        </h1>
        <p className="text-sm text-slate-500">
          Phase 3: Log factory compliance checks, manufacturing capacity scorecards, and environmental certifications
        </p>
      </div>

      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold">Factory Audit Dashboard</CardTitle>
          <CardDescription className="text-xs">Connecting to Supabase...</CardDescription>
        </CardHeader>
        <CardContent className="p-12 flex flex-col justify-center items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
          <span className="text-xs text-slate-400 font-medium">Loading audit data...</span>
        </CardContent>
      </Card>
    </div>
  )
}
