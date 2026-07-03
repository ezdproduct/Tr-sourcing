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
  orderType: string
  userDepartment: string
  existingTimelines: StageTimeline[]
}

const DEPT_STAGES_MAP: Record<string, string[]> = {
  sourcing: ['Sourcing', 'Create PO', 'Supplier Production'],
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
  orderType,
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

  // Check if Production timeline setup is required first
  const dbType = (orderType || '').toUpperCase()
  const isMaterialOrMixed = dbType === 'MATERIAL' || dbType === 'MIXED'
  const productionTimeline = existingTimelines.find(t => t.stage_name.toLowerCase() === 'production')
  const isProductionSetup = !!(productionTimeline?.estimated_start_date && productionTimeline?.estimated_end_date)
  const isLockedAwaitingProduction = isMaterialOrMixed && userDepartment !== 'production' && !isProductionSetup

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
    if (isLockedAwaitingProduction) {
      setErrorMessage(`This is a Material/Mixed order. The Production department must propose the Production stage timeline first before other stages can be set.`)
      return
    }

    const input = stageInputs[stage]
    if (!input.start || !input.end) {
      setErrorMessage(`Please select start and end dates for Stage: ${stage}`)
      return
    }

    if (new Date(input.end) < new Date(input.start)) {
      setErrorMessage(`End date cannot be before start date for Stage: ${stage}`)
      return
    }

    // Validate overlap with existing timelines
    const proposedStart = new Date(input.start)
    proposedStart.setHours(0, 0, 0, 0)
    const proposedEnd = new Date(input.end)
    proposedEnd.setHours(0, 0, 0, 0)

    for (const t of existingTimelines) {
      if (t.stage_name.toLowerCase() === stage.toLowerCase()) continue
      if (t.stage_name.toLowerCase() === 'order' || t.stage_name.toLowerCase() === 'order done') continue
      if (!t.estimated_start_date || !t.estimated_end_date) continue

      const tStart = new Date(t.estimated_start_date)
      tStart.setHours(0, 0, 0, 0)
      const tEnd = new Date(t.estimated_end_date)
      tEnd.setHours(0, 0, 0, 0)

      if (proposedStart <= tEnd && proposedEnd >= tStart) {
        const formattedStart = t.estimated_start_date.split('T')[0]
        const formattedEnd = t.estimated_end_date.split('T')[0]
        setErrorMessage(`The proposed timeline overlaps with Stage: ${t.stage_name} (${formattedStart} to ${formattedEnd})`)
        return
      }
    }

    if (orderDate && estimatedDeliveryDate) {
      const getDateTimestamp = (d: string | Date) => {
        const date = new Date(d)
        date.setHours(0, 0, 0, 0)
        return date.getTime()
      }

      const proposedStartMs = getDateTimestamp(input.start)
      const proposedEndMs = getDateTimestamp(input.end)
      const orderStartMs = getDateTimestamp(orderDate)
      const orderEndMs = getDateTimestamp(estimatedDeliveryDate)

      if (proposedStartMs < orderStartMs) {
        setErrorMessage(`Start date cannot be before Order Date (${new Date(orderDate).toLocaleDateString()})`)
        return
      }
      if (proposedEndMs > orderEndMs) {
        setErrorMessage(`End date cannot be after Estimated Delivery Date (${new Date(estimatedDeliveryDate).toLocaleDateString()})`)
        return
      }

      const totalDurationMs = orderEndMs - orderStartMs
      const totalDays = Math.max(1, Math.round(totalDurationMs / (1000 * 60 * 60 * 24)) + 1)
      
      const proposedDurationMs = proposedEndMs - proposedStartMs
      const proposedDays = Math.max(1, Math.round(proposedDurationMs / (1000 * 60 * 60 * 24)) + 1)
      
      const maxAllowedDays = Math.max(1, Math.floor(totalDays * 0.5))

      if (proposedDays > maxAllowedDays) {
        setErrorMessage(`This stage duration (${proposedDays} days) exceeds 50% of the total order timeline (maximum allowed: ${maxAllowedDays} days out of ${totalDays} total days).`)
        return
      }
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
          Propose target timelines for your department&apos;s stages of order <span className="font-semibold text-slate-700 dark:text-slate-300">{orderCode}</span>. Projections must fall between the Order Date ({orderDate}) and Estimated Delivery Date ({estimatedDeliveryDate}).
        </CardDescription>
      </CardHeader>
      
      <CardContent className="p-4 space-y-4">
        {isLockedAwaitingProduction && (
          <div className="p-3 rounded-lg bg-amber-50 text-amber-800 text-xs flex items-start gap-2.5 font-medium border border-amber-250 dark:bg-amber-955/20 dark:text-amber-400">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">Production Schedule Lock Active</span>
              <span>This is a Material/Mixed order. The Production department must set up the Production timeline first to establish the manufacturing window. Other stages are temporarily locked.</span>
            </div>
          </div>
        )}
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
                        disabled={isLockedAwaitingProduction}
                        onChange={(e) => handleInputChange(stage, 'start', e.target.value)}
                        className="h-8.5 text-xs w-32 rounded-lg py-1 px-2.5 focus-visible:ring-indigo-500 disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <Label className="text-[9px] font-bold text-slate-400">End Date</Label>
                      <Input
                        type="date"
                        min={inputs.start || orderDate}
                        max={estimatedDeliveryDate}
                        value={inputs.end}
                        disabled={isLockedAwaitingProduction}
                        onChange={(e) => handleInputChange(stage, 'end', e.target.value)}
                        className="h-8.5 text-xs w-32 rounded-lg py-1 px-2.5 focus-visible:ring-indigo-500 disabled:opacity-50"
                      />
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSave(stage)}
                      disabled={isPending || !inputs.start || !inputs.end || isLockedAwaitingProduction}
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
