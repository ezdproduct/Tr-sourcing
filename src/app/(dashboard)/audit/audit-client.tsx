'use client'

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { 
  scheduleAuditAction, 
  submitAuditResultAction, 
  deleteAuditAction 
} from './actions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  FileCheck2,
  Calendar,
  User,
  Search,
  Plus,
  Trash2,
  X,
  AlertCircle,
  Loader2,
  Star,
  CheckCircle2,
  Building2,
  Activity,
  ClipboardList,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  FileCode2,
  Users2,
  TrendingUp
} from 'lucide-react'

export interface ShortlistedSupplier {
  id: string
  name: string
  phone: string | null
  address: string | null
  order_id?: string | null
  order_code?: string | null
}

export interface FactoryAudit {
  id: string
  supplier_id: string
  order_id?: string | null
  audit_date: string | null
  auditor_name: string | null
  quality_control_score: number | null
  production_capacity_score: number | null
  total_score: number | null
  audit_status: 'Not Requested' | 'Pending QC Assignment' | 'Scheduled' | 'In Progress' | 'Completed'
  audit_notes: string | null
  created_at: string
  suppliers: {
    id: string
    name: string
    phone: string | null
    address: string | null
  } | null
}

interface AuditClientProps {
  initialShortlistedSuppliers: ShortlistedSupplier[]
  initialAudits: FactoryAudit[]
  initialOrders: any[]
  schemaMissing: boolean
}

const StarRating = ({
  value,
  onChange,
  label
}: {
  value: number
  onChange: (v: number) => void
  label: string
}) => (
  <div className="space-y-2">
    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">{label}</Label>
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="text-slate-300 hover:text-amber-400 focus:outline-none transition-colors cursor-pointer"
        >
          <Star
            size={28}
            className={`${
              star <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-700'
            }`}
          />
        </button>
      ))}
      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-2">
        {value > 0 ? `${value} / 5` : 'Rate (Required)'}
      </span>
    </div>
  </div>
)

export function AuditClient({
  initialShortlistedSuppliers,
  initialAudits,
  initialOrders,
  schemaMissing
}: AuditClientProps) {
  const router = useRouter()
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>('overview')
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)

  const getStageBadge = (stage: string) => {
    switch (stage.toLowerCase()) {
      case 'order':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-400 dark:border-purple-900'
      case 'sourcing':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900'
      case 'qc':
        return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900'
      case 'inspection':
        return 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/20 dark:text-teal-400 dark:border-teal-900'
      case 'logistic':
        return 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-900'
      case 'production':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900'
      case 'closed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-400'
    }
  }
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<'suppliers' | 'logs'>('suppliers')
  const [searchQuery, setSearchQuery] = useState('')

  // Modals state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [selectedSupplier, setSelectedSupplier] = useState<ShortlistedSupplier | null>(null)
  const [scheduleData, setScheduleData] = useState({
    auditDate: new Date().toISOString().split('T')[0],
    auditorName: ''
  })

  const [isResultModalOpen, setIsResultModalOpen] = useState(false)
  const [selectedAudit, setSelectedAudit] = useState<FactoryAudit | null>(null)
  const [resultData, setResultData] = useState({
    qcScore: 0,
    capacityScore: 0,
    notes: ''
  })

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  // Map audits by supplier_id for quick status lookup
  const auditBySupplierId = React.useMemo(() => {
    const map = new Map<string, FactoryAudit>()
    // Sort so the latest audit status takes precedence
    const sorted = [...initialAudits].sort((a, b) => {
      const aTime = a.audit_date ? new Date(a.audit_date).getTime() : new Date(a.created_at).getTime()
      const bTime = b.audit_date ? new Date(b.audit_date).getTime() : new Date(b.created_at).getTime()
      return aTime - bTime
    })
    sorted.forEach((audit) => {
      map.set(audit.supplier_id, audit)
    })
    return map
  }, [initialAudits])

  // Filter Shortlisted Suppliers
  const filteredSuppliers = React.useMemo(() => {
    return initialShortlistedSuppliers.filter((s) => {
      const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesOrder = !selectedOrderId || s.order_id === selectedOrderId
      return matchesSearch && matchesOrder
    })
  }, [initialShortlistedSuppliers, searchQuery, selectedOrderId])

  // Filter Audits
  const filteredAudits = React.useMemo(() => {
    return initialAudits.filter((a) => {
      // Only include audits that are Scheduled, In Progress, or Completed in this log list
      if (a.audit_status === 'Not Requested' || a.audit_status === 'Pending QC Assignment') {
        return false
      }
      const supplierName = a.suppliers?.name || 'Unknown'
      const matchesSearch = 
        supplierName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (a.auditor_name || '').toLowerCase().includes(searchQuery.toLowerCase())
      const matchesOrder = !selectedOrderId || a.order_id === selectedOrderId
      return matchesSearch && matchesOrder
    })
  }, [initialAudits, searchQuery, selectedOrderId])

  // Calculate Metrics
  const metrics = React.useMemo(() => {
    const totalShortlisted = initialShortlistedSuppliers.length
    const scheduled = initialAudits.filter((a) => a.audit_status === 'Scheduled').length
    const completed = initialAudits.filter((a) => a.audit_status === 'Completed').length
    
    const completedAudits = initialAudits.filter((a) => a.audit_status === 'Completed' && a.total_score !== null)
    const avgQcScore = completedAudits.length > 0 
      ? (completedAudits.reduce((acc, curr) => acc + Number(curr.total_score || 0), 0) / completedAudits.length).toFixed(1)
      : '0.0'

    return { totalShortlisted, scheduled, completed, avgQcScore }
  }, [initialShortlistedSuppliers, initialAudits])

  // SQL Script to copy
  const sqlScript = `CREATE TABLE IF NOT EXISTS public.factory_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
    audit_date DATE, -- Allow NULL initially for pending requests
    auditor_name TEXT, -- Allow NULL initially for pending requests
    quality_control_score INT CHECK (quality_control_score >= 1 AND quality_control_score <= 5), -- Allow NULL until audit is completed
    production_capacity_score INT CHECK (production_capacity_score >= 1 AND production_capacity_score <= 5), -- Allow NULL until audit is completed
    total_score NUMERIC(3,2), -- Allow NULL
    audit_status TEXT NOT NULL DEFAULT 'Not Requested' CHECK (audit_status IN ('Not Requested', 'Pending QC Assignment', 'Scheduled', 'In Progress', 'Completed')),
    audit_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);`

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlScript)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  // Handle Schedule Audit Submission
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSupplier || !scheduleData.auditDate || !scheduleData.auditorName.trim()) return

    setErrorMessage(null)
    startTransition(async () => {
      const res = await scheduleAuditAction({
        supplierId: selectedSupplier.id,
        auditDate: scheduleData.auditDate,
        auditorName: scheduleData.auditorName
      })

      if (res.success) {
        setIsScheduleModalOpen(false)
        setScheduleData({ auditDate: new Date().toISOString().split('T')[0], auditorName: '' })
        setSelectedSupplier(null)
        router.refresh()
      } else {
        setErrorMessage(res.error || 'Failed to schedule audit')
      }
    })
  }

  // Handle Submit Audit Result
  const handleResultSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAudit || resultData.qcScore === 0 || resultData.capacityScore === 0) {
      setErrorMessage('Please provide ratings for both QC and Capacity')
      return
    }

    setErrorMessage(null)
    startTransition(async () => {
      const res = await submitAuditResultAction({
        auditId: selectedAudit.id,
        qcScore: resultData.qcScore,
        capacityScore: resultData.capacityScore,
        notes: resultData.notes
      })

      if (res.success) {
        setIsResultModalOpen(false)
        setResultData({ qcScore: 0, capacityScore: 0, notes: '' })
        setSelectedAudit(null)
        router.refresh()
      } else {
        setErrorMessage(res.error || 'Failed to submit audit results')
      }
    })
  }

  // Handle Delete Audit
  const handleDeleteAudit = async (auditId: string) => {
    if (!confirm('Are you sure you want to delete this audit record?')) return

    startTransition(async () => {
      const res = await deleteAuditAction(auditId)
      if (res.success) {
        router.refresh()
      } else {
        alert(res.error || 'Failed to delete audit record')
      }
    })
  }



  return (
    <div className="-m-8 flex h-[calc(100vh-4rem)] overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Left Column: Purchase Orders sub-sidebar */}
      <aside className="w-64 h-full flex flex-col border-r border-slate-200/80 bg-white dark:border-slate-800/80 dark:bg-slate-950 flex-shrink-0 select-none">
        <div className="flex h-16 items-center px-6 border-b border-slate-200/60 dark:border-slate-800/80 flex-shrink-0">
          <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Purchase Orders</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <button
            onClick={() => setSelectedOrderId(null)}
            className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors cursor-pointer rounded-xl ${
              selectedOrderId === null
                ? 'bg-indigo-50 text-[#5c59e9] font-bold dark:bg-indigo-950/30 dark:text-white border border-indigo-100/50 dark:border-indigo-950'
                : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20 text-slate-700 dark:text-slate-355'
            }`}
          >
            <span className="text-xs font-semibold">All Orders</span>
            <Badge variant="outline" className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 border-none">
              {initialOrders.length}
            </Badge>
          </button>

          {initialOrders.map(order => (
            <button
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              className={`w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors cursor-pointer rounded-xl ${
                selectedOrderId === order.id
                  ? 'bg-indigo-50 text-[#5c59e9] font-bold dark:bg-indigo-950/30 dark:text-white border border-indigo-100/50 dark:border-indigo-950'
                  : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20 text-slate-700 dark:text-slate-355'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-mono text-xs font-bold">{order.order_code}</span>
                <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border inline-block ${getStageBadge(order.stage)}`}>
                  {order.stage}
                </span>
              </div>
              <span className="text-[10px] text-slate-400">{order.order_date}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Right Column: Main Content area */}
      <div className="flex-1 h-full overflow-y-auto p-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <FileCheck2 size={24} className="text-[#5c59e9]" />
          <span>Factory Auditing &amp; Quality Control</span>
        </h1>
        <p className="text-sm text-slate-500">
          Phase 3: Log factory compliance checks, manufacturing capacity scorecards, and environmental certifications
        </p>
      </div>

      {/* Subtab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setSubtab('overview')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            subtab === 'overview'
              ? 'border-[#5c59e9] text-[#5c59e9]'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setSubtab('workplace')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            subtab === 'workplace'
              ? 'border-[#5c59e9] text-[#5c59e9]'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          Workplace
        </button>
      </div>

      {subtab === 'overview' ? (
        <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Audited Factories</CardTitle>
                <FileCheck2 className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {new Set(initialAudits.filter(a => a.audit_status === 'Completed').map(a => a.supplier_id)).size}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Unique factories with completed audits</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Quality Score</CardTitle>
                <Star className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {(() => {
                    const completed = initialAudits.filter(a => a.quality_control_score !== null)
                    if (completed.length === 0) return '0 / 5'
                    const avg = completed.reduce((sum, a) => sum + (a.quality_control_score || 0), 0) / completed.length
                    return `${avg.toFixed(1)} / 5`
                  })()}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Average quality inspection rating</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Capacity Score</CardTitle>
                <TrendingUp className="h-4 w-4 text-indigo-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {(() => {
                    const completed = initialAudits.filter(a => a.production_capacity_score !== null)
                    if (completed.length === 0) return '0 / 5'
                    const avg = completed.reduce((sum, a) => sum + (a.production_capacity_score || 0), 0) / completed.length
                    return `${avg.toFixed(1)} / 5`
                  })()}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Average manufacturing capacity score</p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending Audits</CardTitle>
                <AlertCircle className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-black text-slate-900 dark:text-white">
                  {initialAudits.filter(a => a.audit_status === 'Scheduled' || a.audit_status === 'In Progress').length}
                </div>
                <p className="text-[10px] text-amber-600 mt-1 font-medium">Scheduled factory site visits</p>
              </CardContent>
            </Card>
          </div>

          {/* Compliance & Recent Audits charts */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Compliance Standard Audit Checks</CardTitle>
                <CardDescription className="text-xs">Safety and production compliance breakdown</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Workplace Safety Standards', pct: '90%' },
                  { label: 'Fair Labor & Wages Compliance', pct: '85%' },
                  { label: 'Waste & Environmental Controls', pct: '75%' },
                  { label: 'Equipment & Maintenance checks', pct: '80%' }
                ].map((item, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                      <span className="text-[#5c59e9] dark:text-indigo-400">{item.pct}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full dark:bg-slate-900">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: item.pct }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200/60 dark:border-slate-800">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Latest Completed Audits</CardTitle>
                <CardDescription className="text-xs">Timeline of factory visit inspection scores</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {initialAudits.filter(a => a.audit_status === 'Completed').length === 0 ? (
                  <p className="text-xs text-slate-400">No completed audits logged yet.</p>
                ) : (
                  initialAudits
                    .filter(a => a.audit_status === 'Completed')
                    .slice(0, 3)
                    .map((audit, idx) => (
                      <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                        <button
                          onClick={() => {
                            setSubtab('workplace')
                            setActiveTab('logs')
                            setSelectedAudit(audit)
                          }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          {audit.suppliers?.name || 'Factory'}
                        </button>
                        <div className="flex-1 space-y-0.5">
                          <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                            QC: {audit.quality_control_score}/5 | Capacity: {audit.production_capacity_score}/5
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Audited by {audit.auditor_name || 'N/A'} on {audit.audit_date ? new Date(audit.audit_date).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                      </div>
                    ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <>
          {/* Database Schema Missing Warning Banner */}
          {schemaMissing && (
            <Card className="border-rose-200 dark:border-rose-950/60 bg-rose-50/50 dark:bg-rose-950/10 overflow-hidden animate-in fade-in-50 duration-200">
          <CardHeader className="pb-3 flex flex-row items-start gap-4">
            <div className="p-2 bg-rose-100 dark:bg-rose-950 rounded-xl text-rose-600 dark:text-rose-400">
              <ShieldCheck size={24} />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-base font-bold text-rose-900 dark:text-rose-400">
                Supabase Schema Installation Required
              </CardTitle>
              <CardDescription className="text-xs text-rose-700/80 dark:text-rose-500/80">
                The database table <code className="font-mono bg-rose-100 dark:bg-rose-950 px-1 py-0.5 rounded text-rose-800 dark:text-rose-300">factory_audits</code> does not exist yet. Please run the SQL command below in your Supabase SQL editor to initialize it.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 px-6 pb-6">
            <div className="relative">
              <pre className="p-3 bg-slate-900 dark:bg-slate-950 text-slate-200 rounded-lg text-[10px] font-mono overflow-x-auto border border-slate-800 max-h-40">
                {sqlScript}
              </pre>
              <Button 
                onClick={handleCopySql} 
                size="sm"
                className="absolute top-2 right-2 bg-slate-800 text-white hover:bg-slate-700 text-[10px] h-7 px-2.5 rounded"
              >
                {isCopied ? 'Copied!' : 'Copy SQL'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Shortlisted Suppliers</span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                {metrics.totalShortlisted}
              </h3>
            </div>
            <div className="h-10 w-10 bg-indigo-50 dark:bg-indigo-950/20 text-[#5c59e9] rounded-xl flex items-center justify-center">
              <Building2 size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Audits Scheduled</span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                {metrics.scheduled}
              </h3>
            </div>
            <div className="h-10 w-10 bg-amber-50 dark:bg-amber-950/20 text-amber-600 rounded-xl flex items-center justify-center">
              <Calendar size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Audits Completed</span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                {metrics.completed}
              </h3>
            </div>
            <div className="h-10 w-10 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800">
          <CardContent className="p-6 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Average QC Rating</span>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                {metrics.avgQcScore} <span className="text-xs font-medium text-slate-400">/ 5.0</span>
              </h3>
            </div>
            <div className="h-10 w-10 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-xl flex items-center justify-center">
              <Activity size={20} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabbed List */}
      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl w-fit">
              <button
                onClick={() => { setActiveTab('suppliers'); setSearchQuery(''); }}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'suppliers'
                    ? 'bg-white dark:bg-slate-800 text-[#5c59e9] shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Shortlisted Suppliers ({filteredSuppliers.length})
              </button>
              <button
                onClick={() => { setActiveTab('logs'); setSearchQuery(''); }}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'logs'
                    ? 'bg-white dark:bg-slate-800 text-[#5c59e9] shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
                disabled={schemaMissing}
              >
                Audit Logs &amp; Reports ({schemaMissing ? 0 : filteredAudits.length})
              </button>
            </div>

            {/* Search filter */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder={
                  activeTab === 'suppliers'
                    ? 'Search supplier name...'
                    : 'Search supplier or auditor...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-xs rounded-xl"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {activeTab === 'suppliers' ? (
            /* Tab: Shortlisted Suppliers */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                    <th className="px-6 py-4">Supplier Name</th>
                    <th className="px-6 py-4">Phone Number</th>
                    <th className="px-6 py-4">Address</th>
                    <th className="px-6 py-4">Audit Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Building2 size={24} className="opacity-40" />
                          <span className="font-semibold text-slate-500">No shortlisted suppliers found</span>
                          <span className="text-[11px] max-w-xs text-slate-400">
                            Go to the Supplier Sourcing page and add suppliers to your shortlist in Phase 2.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((supplier) => {
                      const activeAudit = auditBySupplierId.get(supplier.id)
                      const status = activeAudit ? activeAudit.audit_status : 'Not Requested'

                      return (
                        <tr key={supplier.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                          <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                            {supplier.name}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                            {supplier.phone || '—'}
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={supplier.address || ''}>
                            {supplier.address || '—'}
                          </td>
                          <td className="px-6 py-4">
                            {status === 'Not Requested' ? (
                              <Badge className="bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-800 font-semibold">
                                Not Requested
                              </Badge>
                            ) : status === 'Pending QC Assignment' ? (
                              <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900 font-semibold animate-pulse">
                                Pending QC Assignment
                              </Badge>
                            ) : status === 'Scheduled' ? (
                              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900 font-semibold animate-pulse">
                                Scheduled ({activeAudit?.audit_date})
                              </Badge>
                            ) : status === 'In Progress' ? (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900 font-semibold animate-pulse">
                                In Progress
                              </Badge>
                            ) : (
                              <div className="flex flex-col gap-1">
                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900 font-semibold w-fit">
                                  Audit Completed
                                </Badge>
                                {activeAudit?.total_score && (
                                  <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold">
                                    <Star size={10} className="fill-amber-400 text-amber-400" />
                                    <span>{activeAudit.total_score} / 5.0</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {schemaMissing ? (
                              <span className="text-[10px] text-rose-500 font-bold">Schema Missing</span>
                            ) : (status === 'Not Requested' || status === 'Pending QC Assignment') ? (
                              <Button
                                onClick={() => {
                                  setSelectedSupplier(supplier)
                                  setIsScheduleModalOpen(true)
                                }}
                                size="sm"
                                className="bg-[#5c59e9] hover:bg-[#4a47d2] font-semibold text-xs py-1.5 h-8 rounded-lg cursor-pointer"
                              >
                                {status === 'Pending QC Assignment' ? 'Assign & Schedule' : 'Schedule Audit'}
                              </Button>
                            ) : (status === 'Scheduled' || status === 'In Progress') ? (
                              <Button
                                onClick={() => {
                                  setSelectedAudit(activeAudit!)
                                  setIsResultModalOpen(true)
                                }}
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-1.5 h-8 rounded-lg cursor-pointer"
                              >
                                Log Results
                              </Button>
                            ) : (
                              <Button
                                onClick={() => {
                                  setSelectedAudit(activeAudit!)
                                  setResultData({
                                    qcScore: activeAudit?.quality_control_score || 0,
                                    capacityScore: activeAudit?.production_capacity_score || 0,
                                    notes: activeAudit?.audit_notes || ''
                                  })
                                  setIsResultModalOpen(true)
                                }}
                                variant="outline"
                                size="sm"
                                className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 font-semibold text-xs py-1.5 h-8 rounded-lg cursor-pointer"
                              >
                                Edit Results
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* Tab: Audit Logs & Reports */
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                    <th className="px-6 py-4">Supplier</th>
                    <th className="px-6 py-4">Audit Date</th>
                    <th className="px-6 py-4">QC Auditor</th>
                    <th className="px-6 py-4">Scores (QC / Capacity)</th>
                    <th className="px-6 py-4">Total Rating</th>
                    <th className="px-6 py-4">Notes</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredAudits.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <ClipboardList size={24} className="opacity-40" />
                          <span className="font-semibold text-slate-500">No audit records found</span>
                          <span className="text-[11px] text-slate-400">
                            Schedule and log factory audits to populate the audit reports.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAudits.map((audit) => (
                      <tr key={audit.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800 dark:text-slate-200">
                            {audit.suppliers?.name || 'Unknown Supplier'}
                          </div>
                          {audit.audit_status === 'Scheduled' && (
                            <Badge className="mt-1 bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900 font-semibold text-[9px] py-0 px-1">
                              Scheduled
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={13} className="text-slate-400" />
                            <span>{audit.audit_date}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <User size={13} className="text-slate-400" />
                            <span>{audit.auditor_name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {audit.audit_status === 'Completed' ? (
                            <div className="space-y-0.5">
                              <div>
                                <span className="font-semibold text-slate-500">QC:</span>{' '}
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {audit.quality_control_score} / 5
                                </span>
                              </div>
                              <div>
                                <span className="font-semibold text-slate-500">Cap:</span>{' '}
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {audit.production_capacity_score} / 5
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Pending Log</span>
                          )}
                        </td>
                        <td className="px-6 py-4 font-black">
                          {audit.total_score ? (
                            <div className="flex items-center gap-1 text-amber-500 font-bold">
                              <Star size={14} className="fill-amber-400 text-amber-400" />
                              <span>{audit.total_score} <span className="text-[10px] text-slate-400 font-medium">/ 5.0</span></span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-normal italic">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 max-w-xs truncate" title={audit.audit_notes || ''}>
                          {audit.audit_notes || <span className="italic opacity-60">No notes provided</span>}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {audit.audit_status === 'Scheduled' && (
                              <Button
                                onClick={() => {
                                  setSelectedAudit(audit)
                                  setIsResultModalOpen(true)
                                }}
                                size="sm"
                                className="bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs h-8 px-2.5 rounded-lg cursor-pointer"
                              >
                                Log
                              </Button>
                            )}
                            <Button
                              onClick={() => handleDeleteAudit(audit.id)}
                              variant="outline"
                              size="sm"
                              className="border-slate-200 text-rose-600 hover:bg-rose-50 hover:border-rose-200 dark:border-slate-800 dark:text-rose-400 dark:hover:bg-rose-950/20 font-semibold text-xs h-8 px-2.5 rounded-lg cursor-pointer"
                            >
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}

      {/* SCHEDULE AUDIT MODAL */}
      {isScheduleModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-black text-slate-900 dark:text-white">
                  Schedule Factory Audit
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Assign dates and QC inspectors for onsite evaluation
                </CardDescription>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </CardHeader>

            <form onSubmit={handleScheduleSubmit}>
              <CardContent className="p-6 space-y-4">
                {errorMessage && (
                  <div className="p-3 rounded-lg bg-rose-50 text-rose-600 text-xs flex items-center gap-2 font-medium">
                    <AlertCircle size={14} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Supplier Name</Label>
                  <Input
                    value={selectedSupplier.name}
                    disabled
                    className="h-9 text-xs rounded-lg bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="auditDate" className="text-xs font-bold text-slate-700 dark:text-slate-300">Audit Date</Label>
                  <Input
                    id="auditDate"
                    type="date"
                    required
                    value={scheduleData.auditDate}
                    onChange={(e) => setScheduleData({ ...scheduleData, auditDate: e.target.value })}
                    className="h-9 text-xs rounded-lg border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="auditorName" className="text-xs font-bold text-slate-700 dark:text-slate-300">QC Auditor Name</Label>
                  <Input
                    id="auditorName"
                    placeholder="e.g. Kenji Sato (QC Auditor)"
                    required
                    value={scheduleData.auditorName}
                    onChange={(e) => setScheduleData({ ...scheduleData, auditorName: e.target.value })}
                    className="h-9 text-xs rounded-lg border-slate-200 dark:border-slate-700"
                  />
                </div>
              </CardContent>

              <div className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="rounded-lg font-semibold text-xs h-9 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending}
                  className="bg-[#5c59e9] hover:bg-[#4a47d2] text-white rounded-lg font-semibold text-xs h-9 cursor-pointer flex items-center gap-1.5"
                >
                  {isPending && <Loader2 size={13} className="animate-spin" />}
                  <span>Schedule Audit</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* LOG RESULTS MODAL */}
      {isResultModalOpen && (selectedAudit || (selectedAudit === null && resultData.qcScore !== 0)) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-md border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-black text-slate-900 dark:text-white">
                  Log Factory Audit Results
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Input scorecards and inspector observations
                </CardDescription>
              </div>
              <button
                onClick={() => setIsResultModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </CardHeader>

            <form onSubmit={handleResultSubmit}>
              <CardContent className="p-6 space-y-5">
                {errorMessage && (
                  <div className="p-3 rounded-lg bg-rose-50 text-rose-600 text-xs flex items-center gap-2 font-medium">
                    <AlertCircle size={14} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Supplier Name</Label>
                  <Input
                    value={selectedAudit?.suppliers?.name || '—'}
                    disabled
                    className="h-9 text-xs rounded-lg bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Auditor Name</Label>
                    <Input
                      value={selectedAudit?.auditor_name || '—'}
                      disabled
                      className="h-9 text-xs rounded-lg bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700 dark:text-slate-300">Audit Date</Label>
                    <Input
                      value={selectedAudit?.audit_date || '—'}
                      disabled
                      className="h-9 text-xs rounded-lg bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                    />
                  </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />

                {/* Scorecards */}
                <StarRating
                  value={resultData.qcScore}
                  onChange={(v) => setResultData({ ...resultData, qcScore: v })}
                  label="Quality Control Score"
                />

                <StarRating
                  value={resultData.capacityScore}
                  onChange={(v) => setResultData({ ...resultData, capacityScore: v })}
                  label="Production Capacity Score"
                />

                {/* Average live preview */}
                {resultData.qcScore > 0 && resultData.capacityScore > 0 && (
                  <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/10 rounded-xl border border-emerald-100 dark:border-emerald-950 flex items-center justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-400 font-semibold">Calculated Total Score:</span>
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <Star size={14} className="fill-emerald-500 text-emerald-500" />
                      <span>{((resultData.qcScore + resultData.capacityScore) / 2.0).toFixed(2)} / 5.0</span>
                    </span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs font-bold text-slate-700 dark:text-slate-300">Audit Notes / Inspector Notes</Label>
                  <textarea
                    id="notes"
                    placeholder="Provide details about machinery, clean environment compliance, labor standards, etc."
                    rows={3}
                    value={resultData.notes}
                    onChange={(e) => setResultData({ ...resultData, notes: e.target.value })}
                    className="flex w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-xs shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5c59e9] dark:border-slate-800 dark:bg-slate-950 resize-none"
                  />
                </div>
              </CardContent>

              <div className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsResultModalOpen(false)}
                  className="rounded-lg font-semibold text-xs h-9 cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs h-9 cursor-pointer flex items-center gap-1.5"
                >
                  {isPending && <Loader2 size={13} className="animate-spin" />}
                  <span>Save Results</span>
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
      </div>
    </div>
  )
}
