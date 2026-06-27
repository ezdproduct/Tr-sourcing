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

  return (
    <ManagementClient initialProfiles={profiles || []} />
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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Management System
        </h1>
        <p className="text-sm text-slate-500">
          Review pending user signups, authorize account requests, and assign system permissions.
        </p>
      </div>

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
