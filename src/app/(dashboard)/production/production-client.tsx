'use client'

import React, { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSourcing } from '@/providers/sourcing-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Settings,
  AlertCircle,
  TrendingDown,
  CheckCircle,
  Play,
  CheckCircle2,
  TrendingUp,
  Loader2
} from 'lucide-react'
import { finalizeProductionJobAction, updateProductionJobProgressAction } from './actions'

export interface DatabaseProductionJob {
  id: string
  order_id: string
  supplier_id: string
  factory_name: string
  item_name: string
  output_qty: number
  target_qty: number
  progress_pct: number
  defect_rate: number
  status: 'running' | 'completed' | 'paused'
  orders?: {
    order_code: string
  }
}

interface ProductionClientProps {
  initialJobs: DatabaseProductionJob[]
}

export function ProductionClient({ initialJobs }: ProductionClientProps) {
  const { userRole } = useSourcing()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>((searchParams.get('subtab') as 'overview' | 'workplace') || 'overview')
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Progress update form states
  const [editJobId, setEditJobId] = useState<string | null>(null)
  const [editOutputQty, setEditOutputQty] = useState<string>('')
  const [editDefectRate, setEditDefectRate] = useState<string>('')
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false)

  const handleTabChange = (val: 'overview' | 'workplace') => {
    setSubtab(val)
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?subtab=${val}`
      window.history.pushState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
    }
  }

  const isBossOrAdmin = userRole === 'boss' || userRole === 'admin'

  const handleFinalizeJob = (id: string) => {
    if (!confirm('Are you sure you want to finalize this production run and move this order to Inspection?')) return
    startTransition(async () => {
      setErrorMessage(null)
      const res = await finalizeProductionJobAction(id)
      if (res.success) {
        router.refresh()
      } else {
        setErrorMessage(res.error || 'Failed to finalize job')
      }
    })
  }

  const handleUpdateProgressSubmit = async (e: React.FormEvent, jobId: string) => {
    e.preventDefault()
    if (editOutputQty === '' || editDefectRate === '') return

    setIsUpdatingProgress(true)
    setErrorMessage(null)
    const res = await updateProductionJobProgressAction({
      jobId,
      outputQty: Number(editOutputQty),
      defectRate: Number(editDefectRate)
    })
    setIsUpdatingProgress(false)
    if (res.success) {
      setEditJobId(null)
      router.refresh()
    } else {
      setErrorMessage(res.error || 'Failed to update progress')
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Active Production Runs
        </h1>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 text-red-650 rounded-xl text-xs font-medium border border-red-200 flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Subtab Switcher */}
      <Tabs value={subtab} onValueChange={(v) => handleTabChange(v as 'overview' | 'workplace')} className="w-full space-y-6">
        <TabsList className="bg-slate-100 dark:bg-slate-950 p-1 rounded-xl w-fit flex gap-1">
          <TabsTrigger value="overview" className="px-4 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
            Overview
          </TabsTrigger>
          <TabsTrigger value="workplace" className="px-4 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900">
            Workplace
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="space-y-6">
            {/* KPI Grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Jobs</CardTitle>
                  <Settings className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {initialJobs.filter(j => j.status === 'running').length}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Factories with active machinery run</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Progress</CardTitle>
                  <TrendingUp className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {(() => {
                      if (initialJobs.length === 0) return '0%'
                      const sum = initialJobs.reduce((total, j) => total + Number(j.progress_pct), 0)
                      return `${(sum / initialJobs.length).toFixed(0)}%`
                    })()}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Average order production progress</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Defect Deviation</CardTitle>
                  <TrendingDown className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {(() => {
                      if (initialJobs.length === 0) return '0%'
                      const sum = initialJobs.reduce((total, j) => total + Number(j.defect_rate), 0)
                      return `${(sum / initialJobs.length).toFixed(2)}%`
                    })()}
                  </div>
                  <p className="text-[10px] text-emerald-600 mt-1 font-medium">Under AQL 1.0% limit</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Completed Runs</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {initialJobs.filter(j => j.status === 'completed').length}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Finalized & closed PO runs</p>
                </CardContent>
              </Card>
            </div>

            {/* Sourcing/Production chart details */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Production Line Efficiency</CardTitle>
                  <CardDescription className="text-xs">Capacity output metrics against factory floor targets</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {initialJobs.length === 0 ? (
                    <p className="text-xs text-slate-450">No production jobs logged yet.</p>
                  ) : (
                    initialJobs.map((item, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-700 dark:text-slate-300">{item.factory_name} ({item.item_name})</span>
                          <span className="text-indigo-600 dark:text-indigo-400">{item.progress_pct}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full dark:bg-slate-900">
                          <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${item.progress_pct}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Live Factory Floor Updates</CardTitle>
                  <CardDescription className="text-xs">Timeline of current production updates</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {initialJobs.length === 0 ? (
                    <p className="text-xs text-slate-400">No active production runs.</p>
                  ) : (
                    initialJobs.map((job, idx) => (
                      <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          job.status === 'running'
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
                        }`}>
                          {job.orders?.order_code || 'PO'}
                        </span>
                        <div className="flex-1 space-y-0.5">
                          <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                            {job.item_name} at {job.factory_name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Output: {job.output_qty} / {job.target_qty} | Defects: {job.defect_rate}%
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="workplace" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
          <div className="grid gap-6 md:grid-cols-2">
            {initialJobs.length === 0 ? (
              <div className="col-span-2 p-12 text-center text-slate-400 bg-white dark:bg-slate-900 border rounded-2xl">
                No active production runs currently in progress. Select a supplier in Sourcing to start production.
              </div>
            ) : (
              initialJobs.map((job) => (
                <Card key={job.id} className="border-slate-200/60 dark:border-slate-800">
                  <CardHeader className="pb-3 flex flex-row items-start justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                        {job.item_name}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {job.factory_name} · <span className="font-semibold text-indigo-600 dark:text-indigo-400">{job.orders?.order_code}</span>
                      </CardDescription>
                    </div>
                    <div>
                      {job.status === 'running' ? (
                        <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 animate-pulse">
                          Running
                        </Badge>
                      ) : job.status === 'completed' ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400">
                          Closed &amp; Done
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-400">
                          Paused
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-500">Production Output</span>
                        <span className="text-slate-900 dark:text-white">
                          {job.output_qty} / {job.target_qty} units ({job.progress_pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full dark:bg-slate-900">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            job.status === 'completed' ? 'bg-emerald-500' : 'bg-[#5c59e9]'
                          }`}
                          style={{ width: `${job.progress_pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats & Quality */}
                    <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl">
                      <div>
                        <div className="text-slate-400 text-[10px] uppercase font-semibold">Defect Rate</div>
                        <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                          {job.defect_rate}%
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[10px] uppercase font-semibold">Quality Threshold</div>
                        <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                          <CheckCircle size={14} /> Normal
                        </div>
                      </div>
                    </div>

                    {/* Inline edit progress form */}
                    {job.status === 'running' && isBossOrAdmin && editJobId === job.id && (
                      <form onSubmit={(e) => handleUpdateProgressSubmit(e, job.id)} className="space-y-3 p-3 bg-slate-50 dark:bg-slate-950/20 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label htmlFor={`output-${job.id}`} className="text-[10px] font-bold">Output Qty</Label>
                            <Input
                              id={`output-${job.id}`}
                              type="number"
                              min="0"
                              max={job.target_qty}
                              value={editOutputQty}
                              onChange={(e) => setEditOutputQty(e.target.value)}
                              className="h-8 text-xs bg-white dark:bg-slate-900"
                              required
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`defect-${job.id}`} className="text-[10px] font-bold">Defect Rate (%)</Label>
                            <Input
                              id={`defect-${job.id}`}
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={editDefectRate}
                              onChange={(e) => setEditDefectRate(e.target.value)}
                              className="h-8 text-xs bg-white dark:bg-slate-900"
                              required
                            />
                          </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditJobId(null)}
                            className="h-7 text-[10px]"
                          >
                            Cancel
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            disabled={isUpdatingProgress}
                            className="h-7 text-[10px] bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                          >
                            {isUpdatingProgress ? 'Saving...' : 'Save Update'}
                          </Button>
                        </div>
                      </form>
                    )}

                    {/* Actions buttons */}
                    {job.status === 'running' && (
                      <div className="flex gap-2 pt-2">
                        {isBossOrAdmin ? (
                          <>
                            {editJobId !== job.id && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setEditJobId(job.id)
                                  setEditOutputQty(String(job.output_qty))
                                  setEditDefectRate(String(job.defect_rate))
                                }}
                                className="flex-1 text-xs h-9 font-semibold"
                              >
                                Update Progress
                              </Button>
                            )}
                            <Button
                              onClick={() => handleFinalizeJob(job.id)}
                              disabled={isPending}
                              className="flex-1 text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer font-semibold gap-1.5"
                            >
                              {isPending ? (
                                <Loader2 size={13} className="animate-spin" />
                              ) : (
                                <CheckCircle size={14} />
                              )}
                              <span>Finalize &amp; Send to Inspect</span>
                            </Button>
                          </>
                        ) : (
                          <Button
                            disabled
                            title="Only Admin or Boss can finalize production runs"
                            className="w-full text-xs h-9 bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 cursor-not-allowed"
                          >
                            <span>Write-access Restricted</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
