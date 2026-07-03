'use client'

/* eslint-disable react-hooks/set-state-in-effect */

import { cn } from '@/utils/tailwind'
import { createClient } from '@/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ShoppingBag, Loader2, AlertCircle, Eye, EyeOff, Check } from 'lucide-react'

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRegistered, setIsRegistered] = useState(false)
  const [isUnauthorized, setIsUnauthorized] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('registered') === 'true') {
        setIsRegistered(true)
      }
      if (params.get('unauthorized') === 'true') {
        setIsUnauthorized(true)
      }
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) throw error

      if (data?.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_approved')
          .eq('id', data.user.id)
          .single()

        if (profileError) {
          console.error('Error fetching profile approval status:', profileError.message)
        } else if (profile && !profile.is_approved) {
          await supabase.auth.signOut()
          throw new Error('Your account is pending administrator approval. Please contact your admin.')
        }
      }

      router.push('/')
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
          Enter credentials below to access your sourcing matrix
        </p>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60 p-8 shadow-2xl backdrop-blur-md">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-purple-500/10 blur-3xl" />

        <form onSubmit={handleLogin} className="space-y-5 relative z-10">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-450 text-xs rounded-xl flex items-center gap-2 font-medium border border-rose-100/30">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isRegistered && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-450 text-xs rounded-xl flex items-center gap-2 font-semibold border border-emerald-100/30">
              <Check size={14} className="flex-shrink-0 stroke-[2.5]" />
              <span>Account created successfully! Please sign in below.</span>
            </div>
          )}

          {isUnauthorized && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-450 text-xs rounded-xl flex items-center gap-2 font-semibold border border-amber-100/30">
              <AlertCircle size={14} className="flex-shrink-0" />
              <span>Your session has been terminated or your account approval was revoked. Please contact your admin.</span>
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
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Password
              </Label>
              <Link
                href="/auth/forgot-password"
                className="text-[11px] font-semibold text-[#5c59e9] hover:underline"
              >
                Forgot your password?
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 text-xs rounded-xl border-slate-200/80 bg-white/50 focus:bg-white dark:border-slate-800 dark:bg-slate-950/50 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-10 rounded-xl bg-[#5c59e9] hover:bg-[#4a47d2] text-white font-semibold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-indigo-200/40 dark:shadow-none"
            disabled={isLoading}
          >
            {isLoading && <Loader2 size={13} className="animate-spin" />}
            <span>{isLoading ? 'Signing in...' : 'Sign In'}</span>
          </Button>

          <div className="pt-2 text-center text-xs text-slate-500 space-y-3">
            <div>
              Don&apos;t have an account?{' '}
              <Link
                href="/auth/sign-up"
                className="font-bold text-[#5c59e9] hover:underline"
              >
                Sign up
              </Link>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-400 dark:text-slate-500 flex justify-center gap-3">
              <Link href="/privacy-policy" className="hover:underline hover:text-[#5c59e9] dark:hover:text-indigo-400 font-medium">
                Privacy Policy
              </Link>
              <span>&bull;</span>
              <Link href="/terms-of-service" className="hover:underline hover:text-[#5c59e9] dark:hover:text-indigo-400 font-medium">
                Terms of Service
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
