'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar, Check, Loader2, AlertCircle, Clock } from 'lucide-react'
import { proposeStageTimelineAction } from '@/app/(dashboard)/orders/actions'

interface StageTimeline {
  id: string
  stage_name: string
  estimated_start_date: string | null
  estimated_end_date: string | null
}

interface TimelineProposalCardProps {
  orderId: string
  orderCode: string
  orderDate: string
  estimatedDeliveryDate: string
  userDepartment: string
  existingTimelines: StageTimeline[]
}

const DEPT_STAGES_MAP: Record<string, string[]> = {
  sourcing: ['Sourcing', 'Create PO'],
  audit: ['QC'],
  inspection: ['Inspection'],
  logistics: ['Logistic'],
  production: ['Production']
}

export function TimelineProposalCard({
  orderId,
  orderCode,
  orderDate,
  estimatedDeliveryDate,
  userDepartment,
  existingTimelines
}: TimelineProposalCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Get stages owned by this department
  const stagesToPropose = DEPT_STAGES_MAP[userDepartment] || []

  // Initialize input state for owned stages
  const [stageInputs, setStageInputs] = useState<Record<string, { start: string; end: string }>>(() => {
    const initial: Record<string, { start: string; end: string }> = {}
    stagesToPropose.forEach(stage => {
      const match = existingTimelines.find(t => t.stage_name.toLowerCase() === stage.toLowerCase())
      initial[stage] = {
        start: match?.estimated_start_date ? new Date(match.estimated_start_date).toISOString().split('T')[0] : '',
        end: match?.estimated_end_date ? new Date(match.estimated_end_date).toISOString().split('T')[0] : ''
      }
    })
    return initial
  })

  if (stagesToPropose.length === 0) return null

  const handleInputChange = (stage: string, field: 'start' | 'end', value: string) => {
    setStageInputs(prev => ({
      ...prev,
      [stage]: {
        ...prev[stage],
        [field]: value
      }
    }))
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const handleSave = async (stage: string) => {
    const input = stageInputs[stage]
    if (!input.start || !input.end) {
      setErrorMessage(`Please select start and end dates for Stage: ${stage}`)
      return
    }

    if (new Date(input.end) < new Date(input.start)) {
      setErrorMessage(`End date cannot be before start date for Stage: ${stage}`)
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)

    startTransition(async () => {
      const res = await proposeStageTimelineAction(orderId, stage, input.start, input.end)
      if (res.success) {
        setSuccessMessage(`Successfully updated timeline for Stage: ${stage}`)
        router.refresh()
      } else {
        setErrorMessage(res.error || `Failed to update timeline for Stage: ${stage}`)
      }
    })
  }

  return (
    <Card className="border-indigo-100 dark:border-indigo-950/40 bg-indigo-50/15 dark:bg-indigo-950/5 shadow-sm rounded-xl overflow-hidden animate-in fade-in duration-300">
      <CardHeader className="pb-3 border-b border-indigo-100/30 dark:border-indigo-950/20">
        <CardTitle className="text-sm font-bold flex items-center gap-2 text-indigo-700 dark:text-indigo-400">
          <Clock size={16} className="text-indigo-600 dark:text-indigo-400" />
          <span>Timeline Proposal Required</span>
        </CardTitle>
        <CardDescription className="text-xs text-slate-500">
          Propose target timelines for your department's stages of order <span className="font-semibold text-slate-700 dark:text-slate-300">{orderCode}</span>. Projections must fall between the Order Date ({orderDate}) and Estimated Delivery Date ({estimatedDeliveryDate}).
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        {errorMessage && (
          <div className="p-2.5 rounded-lg bg-rose-50 text-rose-600 text-xs flex items-center gap-2 font-medium border border-rose-100/40 dark:bg-rose-950/20 dark:text-rose-455">
            <AlertCircle size={14} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs flex items-center gap-2 font-medium border border-emerald-100/40 dark:bg-emerald-950/20 dark:text-emerald-400">
            <Check size={14} className="shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <div className="space-y-4">
          {stagesToPropose.map((stage) => {
            const match = existingTimelines.find(t => t.stage_name.toLowerCase() === stage.toLowerCase())
            const isCompleted = !!(match?.estimated_start_date && match?.estimated_end_date)
            const inputs = stageInputs[stage]

            return (
              <div
                key={stage}
                className={`p-3.5 rounded-xl border transition-all duration-300 ${
                  isCompleted
                    ? 'border-emerald-100 bg-emerald-50/10 dark:border-emerald-950/30'
                    : 'border-slate-100 bg-white dark:border-slate-800/80 dark:bg-slate-900/30'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <span>{stage} Stage</span>
                      {isCompleted ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 text-[9px] py-0 px-1 font-semibold leading-none">
                          Proposed
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-955/30 dark:text-amber-400 text-[9px] py-0 px-1 font-semibold leading-none animate-pulse">
                          Pending Date
                        </Badge>
                      )}
                    </span>
                    <p className="text-[10px] text-slate-400">Set targeted start and end timeline</p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="space-y-0.5">
                      <Label className="text-[9px] font-bold text-slate-400">Start Date</Label>
                      <Input
                        type="date"
                        min={orderDate}
                        max={estimatedDeliveryDate}
                        value={inputs.start}
                        onChange={(e) => handleInputChange(stage, 'start', e.target.value)}
                        className="h-8.5 text-xs w-32 rounded-lg py-1 px-2.5 focus-visible:ring-indigo-500"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[9px] font-bold text-slate-400">End Date</Label>
                      <Input
                        type="date"
                        min={inputs.start || orderDate}
                        max={estimatedDeliveryDate}
                        value={inputs.end}
                        onChange={(e) => handleInputChange(stage, 'end', e.target.value)}
                        className="h-8.5 text-xs w-32 rounded-lg py-1 px-2.5 focus-visible:ring-indigo-500"
                      />
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSave(stage)}
                      disabled={isPending || !inputs.start || !inputs.end}
                      className={`h-8.5 self-end px-3 text-xs font-semibold rounded-lg shrink-0 cursor-pointer ${
                        isCompleted
                          ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                      }`}
                    >
                      {isPending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : isCompleted ? (
                        'Update'
                      ) : (
                        'Submit'
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
