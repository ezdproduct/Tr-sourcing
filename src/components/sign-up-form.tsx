'use client'

import { cn } from '@/utils/tailwind'
import { createClient } from '@/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ShoppingBag, Loader2, AlertCircle } from 'lucide-react'

export function SignUpForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    if (password !== repeatPassword) {
      setError('Passwords do not match')
      setIsLoading(false)
      return
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      })
      if (error) throw error
      router.push('/auth/login?registered=true')
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={cn('flex flex-col gap-6 w-full max-w-md mx-auto', className)} {...props}>
      <div className="flex flex-col items-center gap-2 text-center mb-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-[#5c59e9] dark:bg-indigo-950/40 dark:text-indigo-400 shadow-sm border border-indigo-100/30">
          <ShoppingBag size={22} className="stroke-[2.2]" />
        </div>
        <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
          TR Sourcing Hub
        </h1>
        <p className="text-xs text-slate-500 max-w-[240px]">
          Create a new account to evaluate factories and suppliers
        </p>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl" />

        <form onSubmit={handleSignUp} className="space-y-4 relative z-10">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 text-xs rounded-xl flex items-center gap-2 font-medium border border-rose-100/30">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 text-xs rounded-xl border-slate-200/80 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 text-xs rounded-xl border-slate-200/80 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="repeatPassword" className="text-xs font-bold text-slate-700 dark:text-slate-300">
              Repeat Password
            </Label>
            <Input
              id="repeatPassword"
              type="password"
              required
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              className="h-10 text-xs rounded-xl border-slate-200/80 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-10 rounded-xl bg-[#5c59e9] hover:bg-[#4a47d2] text-white font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-200/40 dark:shadow-none"
            disabled={isLoading}
          >
            {isLoading && <Loader2 size={13} className="animate-spin" />}
            <span>{isLoading ? 'Creating account...' : 'Create Account'}</span>
          </Button>

          <div className="pt-2 text-center text-xs text-slate-500">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="font-bold text-[#5c59e9] hover:underline"
            >
              Sign In
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
