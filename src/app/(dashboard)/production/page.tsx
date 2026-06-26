'use client'

import React, { useState } from 'react'
import { useSourcing } from '@/providers/sourcing-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  Settings,
  AlertCircle,
  TrendingDown,
  CheckCircle,
  Play
} from 'lucide-react'

interface ProductionJob {
  id: string
  poNumber: string
  factoryName: string
  itemName: string
  outputQty: number
  targetQty: number
  progressPct: number
  defectRate: number
  status: 'running' | 'completed' | 'paused'
}

const initialJobs: ProductionJob[] = [
  {
    id: 'job-1',
    poNumber: 'PO-2026-901',
    factoryName: 'Viet My Woodworking Ltd',
    itemName: 'Oak dining table legs',
    outputQty: 85,
    targetQty: 100,
    progressPct: 85,
    defectRate: 0.4,
    status: 'running'
  },
  {
    id: 'job-2',
    poNumber: 'PO-2026-902',
    factoryName: 'HAGL Furniture Factory',
    itemName: 'Bonded wood shelves',
    outputQty: 1200,
    targetQty: 1200,
    progressPct: 100,
    defectRate: 0.9,
    status: 'completed'
  }
]

export default function ProductionRunPage() {
  const { userRole } = useSourcing()
  const [jobs, setJobs] = useState<ProductionJob[]>(initialJobs)

  const isBossOrAdmin = userRole === 'boss' || userRole === 'admin'

  const handleCloseJob = (id: string) => {
    if (!confirm('Are you sure you want to finalize this production run and close the PO?')) return
    setJobs(
      jobs.map(j => j.id === id ? { ...j, status: 'completed', progressPct: 100 } : j)
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Active Production Runs
        </h1>
        <p className="text-sm text-slate-500">
          Phase 7: Monitor real-time factory floor outputs, inspect product defects, and finalize/close orders
        </p>
      </div>

      {/* Production List Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {jobs.map((job) => (
          <Card key={job.id} className="border-slate-200/60 dark:border-slate-800">
            <CardHeader className="pb-3 flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base font-bold text-slate-900 dark:text-white">
                  {job.itemName}
                </CardTitle>
                <CardDescription className="text-xs">
                  {job.factoryName} · <span className="font-semibold text-indigo-600 dark:text-indigo-400">{job.poNumber}</span>
                </CardDescription>
              </div>
              <div>
                {job.status === 'running' ? (
                  <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 animate-pulse">
                    Running
                  </Badge>
                ) : job.status === 'completed' ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400">
                    Closed & Done
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
                    {job.outputQty} / {job.targetQty} units ({job.progressPct}%)
                  </span>
                </div>
                <div className="h-2 w-full bg-slate-100 rounded-full dark:bg-slate-900">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      job.status === 'completed' ? 'bg-emerald-500' : 'bg-[#5c59e9]'
                    }`}
                    style={{ width: `${job.progressPct}%` }}
                  />
                </div>
              </div>

              {/* Stats & Quality */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 dark:bg-slate-900/40 p-3 rounded-xl">
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Defect Rate</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {job.defectRate}%
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-semibold">Quality Threshold</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                    <CheckCircle size={14} /> Normal
                  </div>
                </div>
              </div>

              {/* Close Button Action */}
              {job.status === 'running' && (
                <div className="flex justify-end gap-2 pt-2">
                  {isBossOrAdmin ? (
                    <Button
                      onClick={() => handleCloseJob(job.id)}
                      className="w-full text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer font-semibold gap-1.5"
                    >
                      <CheckCircle size={14} />
                      <span>Finalize & Close Order</span>
                    </Button>
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
        ))}
      </div>
    </div>
  )
}
