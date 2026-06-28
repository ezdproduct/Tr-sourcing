'use client'

import React, { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Calendar, Filter, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TimeframeSelector() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentType = searchParams.get('timeframe') || 'all'
  const currentStart = searchParams.get('startDate') || ''
  const currentEnd = searchParams.get('endDate') || ''

  const [timeframe, setTimeframe] = useState(currentType)
  const [startDate, setStartDate] = useState(currentStart)
  const [endDate, setEndDate] = useState(currentEnd)

  const handleApply = (newTimeframe = timeframe, start = startDate, end = endDate) => {
    const params = new URLSearchParams()
    
    if (newTimeframe !== 'all') {
      params.set('timeframe', newTimeframe)
    }
    
    if (newTimeframe === 'custom') {
      if (start) params.set('startDate', start)
      if (end) params.set('endDate', end)
    }

    router.push(`/dashboard?${params.toString()}`)
  }

  const handleReset = () => {
    setTimeframe('all')
    setStartDate('')
    setEndDate('')
    router.push('/dashboard')
  }

  return (
    <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 p-3 rounded-2xl shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
        <Calendar size={14} className="text-indigo-500" />
        <span>Timeframe:</span>
      </div>

      {/* Preset Selectors */}
      <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-950 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => {
            setTimeframe('all')
            handleApply('all', '', '')
          }}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            timeframe === 'all'
              ? 'bg-white dark:bg-slate-850 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          All Time
        </button>
        <button
          type="button"
          onClick={() => {
            setTimeframe('30d')
            handleApply('30d', '', '')
          }}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            timeframe === '30d'
              ? 'bg-white dark:bg-slate-850 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Last 30 Days
        </button>
        <button
          type="button"
          onClick={() => {
            setTimeframe('7d')
            handleApply('7d', '', '')
          }}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            timeframe === '7d'
              ? 'bg-white dark:bg-slate-850 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Last 7 Days
        </button>
        <button
          type="button"
          onClick={() => setTimeframe('custom')}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
            timeframe === 'custom'
              ? 'bg-white dark:bg-slate-850 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Custom
        </button>
      </div>

      {/* Custom Date Range Picker */}
      {timeframe === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-250">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
          <span className="text-xs font-bold text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
          <Button
            size="sm"
            onClick={() => handleApply('custom')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-8 px-3 rounded-xl flex items-center gap-1.5"
          >
            <Filter size={12} />
            <span>Apply</span>
          </Button>
        </div>
      )}

      {/* Reset Button */}
      {(timeframe !== 'all' || startDate || endDate) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="text-xs font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-white h-8 px-2 rounded-xl flex items-center gap-1"
        >
          <RotateCcw size={12} />
          <span>Reset</span>
        </Button>
      )}
    </div>
  )
}
