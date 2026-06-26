import { redirect } from 'next/navigation'
import { EnvVarWarning } from '@/components/env-var-warning'
import { hasEnvVars } from '@/utils/env'

export default function Home() {
  if (!hasEnvVars) {
    return (
      <main className="flex h-screen w-screen overflow-hidden bg-[#f8fafc] dark:bg-slate-950">
        <div className="flex flex-1 flex-col items-center justify-center p-8 gap-4">
          <EnvVarWarning />
        </div>
      </main>
    )
  }

  redirect('/dashboard')
}

