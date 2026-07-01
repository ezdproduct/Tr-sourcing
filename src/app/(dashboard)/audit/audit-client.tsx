'use client'

import React, { useState, useTransition, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/ui/data-table'
import { useSourcing } from '@/providers/sourcing-provider'
import { updateOrderStageAction } from '@/app/(dashboard)/orders/actions'
import { KanbanBoard } from '@/app/(dashboard)/orders/kanban-board'
import { TimelineProposalCard } from '@/components/timeline-proposal-card'
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
  TrendingUp,
  FileText,
  Link,
  Upload
} from 'lucide-react'

export interface ShortlistedSupplier {
  id: string
  name: string
  phone: string | null
  address: string | null
  certifications?: string[]
  order_id?: string | null
  order_code?: string | null
  item_name?: string | null
  unique_key?: string | null
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
  audit_verdict?: 'PASS' | 'PASS WITH CONDITIONS' | 'FAIL' | null
  report_url?: string | null
  certifications?: string[] | null
  created_at: string
  suppliers: {
    id: string
    name: string
    phone: string | null
    address: string | null
    certifications?: string[] | null
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
  const { userRole } = useSourcing()
  const searchParams = useSearchParams()
  const initialSubtab = (searchParams.get('subtab') as 'overview' | 'workplace') || 'overview'
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>(initialSubtab)
  const [overviewMode, setOverviewMode] = useState<'analytics' | 'kanban'>('analytics')

  const subtabParam = searchParams.get('subtab')

  useEffect(() => {
    if (subtabParam === 'overview' || subtabParam === 'workplace') {
      setSubtab(subtabParam)
    } else {
      setSubtab('overview')
    }
  }, [subtabParam])

  const handleTabChange = (val: 'overview' | 'workplace') => {
    setSubtab(val)
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?subtab=${val}`
      window.history.pushState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
    }
  }
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<'suppliers' | 'logs'>('suppliers')

  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  const handleStageChange = async (orderId: string, newStage: string) => {
    const result = await updateOrderStageAction(orderId, newStage)
    if (!result.success) {
      alert(`Failed to update order stage: ${result.error}`)
      return false
    }
    return true
  }
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
    auditVerdict: '' as 'PASS' | 'PASS WITH CONDITIONS' | 'FAIL' | '',
    reportUrl: '',
    certifications: [] as string[],
    notes: ''
  })
  const [tagInput, setTagInput] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [sidebarOrderSearch, setSidebarOrderSearch] = useState('')

  const selectedOrder = initialOrders.find(o => o.id === selectedOrderId)

  const filteredOrders = initialOrders.filter(order => {
    const query = sidebarOrderSearch.toLowerCase()
    return order.order_code.toLowerCase().includes(query)
  })

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

  // Map audits by order_id + supplier_id for quick status lookup
  const auditByOrderAndSupplier = React.useMemo(() => {
    const map = new Map<string, FactoryAudit>()
    // Sort so the latest audit status takes precedence
    const sorted = [...initialAudits].sort((a, b) => {
      const aTime = a.audit_date ? new Date(a.audit_date).getTime() : new Date(a.created_at).getTime()
      const bTime = b.audit_date ? new Date(b.audit_date).getTime() : new Date(b.created_at).getTime()
      return aTime - bTime
    })
    sorted.forEach((audit) => {
      if (audit.order_id && audit.supplier_id) {
        map.set(`${audit.order_id}-${audit.supplier_id}`, audit)
      }
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

    const todayStr = new Date().toLocaleDateString('sv-SE')
    if (scheduleData.auditDate < todayStr) {
      setErrorMessage('Audit date cannot be in the past')
      return
    }

    setErrorMessage(null)
    startTransition(async () => {
      const res = await scheduleAuditAction({
        supplierId: selectedSupplier.id,
        orderId: selectedSupplier.order_id || null,
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
    if (!selectedAudit) return

    if (!resultData.auditVerdict) {
      setErrorMessage('Please select an Audit Verdict')
      return
    }

    setErrorMessage(null)
    startTransition(async () => {
      const formData = new FormData()
      formData.append('auditId', selectedAudit.id)
      formData.append('auditVerdict', resultData.auditVerdict)
      formData.append('notes', resultData.notes)
      formData.append('certifications', JSON.stringify(resultData.certifications))
      if (selectedFile) {
        formData.append('pdfFile', selectedFile)
      }

      const res = await submitAuditResultAction(formData)

      if (res.success) {
        setIsResultModalOpen(false)
        setResultData({
          auditVerdict: '',
          reportUrl: '',
          certifications: [],
          notes: ''
        })
        setTagInput("")
        setSelectedFile(null)
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
    <div className="space-y-6">
      {/* Controls Row */}
      {subtab === 'overview' && (
        <div className="flex justify-end items-center gap-4">
          <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800/80">
            <Button
              variant={overviewMode === 'analytics' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setOverviewMode('analytics')}
              className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
                overviewMode === 'analytics'
                  ? 'bg-white text-[#5c59e9] shadow-sm dark:bg-slate-800 dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <span>Analytics View</span>
            </Button>
            <Button
              variant={overviewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setOverviewMode('kanban')}
              className={`text-xs font-semibold px-4 py-1.5 h-8 rounded-lg cursor-pointer transition-all ${
                overviewMode === 'kanban'
                  ? 'bg-white text-[#5c59e9] shadow-sm dark:bg-slate-800 dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <span>Kanban Board</span>
            </Button>
          </div>
        </div>
      )}

      {/* Subtab Switcher */}
      <Tabs value={subtab} className="w-full space-y-6">

        <TabsContent value="overview" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">

          {overviewMode === 'analytics' ? (
            <div className="space-y-6 animate-in fade-in duration-300">
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
            <div className="animate-in fade-in duration-300">
              <KanbanBoard
                orders={initialOrders}
                isStaffOrAdmin={isStaffOrAdmin}
                onCardClick={(order) => {
                  // In Audit, clicking opens the order details sidebar
                  // We don't have selectedOrder state here but we can redirect or set workplace
                  setSubtab('workplace')
                }}
                onStageChange={handleStageChange}
              />
            </div>
          )}
        </TabsContent>

      <TabsContent value="workplace" className="space-y-6 mt-0 border-none p-0 focus-visible:ring-0 focus-visible:ring-offset-0">
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


      {/* Main Tabbed List */}
      <div className="grid lg:grid-cols-[280px_1fr] -mx-8 -mt-8 -mb-8 h-[calc(100vh-4rem)] overflow-hidden">
        {/* Left column: Purchase Orders sidebar */}
        <div className="border-r border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-950 flex flex-col h-full overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 space-y-1.5">
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">Purchase Orders</h3>
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search orders..."
                value={sidebarOrderSearch}
                onChange={(e) => setSidebarOrderSearch(e.target.value)}
                className="w-full pl-7.5 pr-2.5 py-0.5 text-[11px] rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredOrders.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-400">
                No orders found.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredOrders.map(order => (
                  <li key={order.id}>
                    <button
                      id={`order-select-${order.id}`}
                      onClick={() => {
                        if (selectedOrderId === order.id) {
                          setSelectedOrderId(null)
                        } else {
                          setSelectedOrderId(order.id)
                        }
                      }}
                      className={`w-full text-left px-2.5 py-3 flex items-center justify-between gap-1 transition-colors cursor-pointer ${
                        selectedOrderId === order.id
                          ? 'bg-indigo-50 dark:bg-indigo-950/30'
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={13} className={selectedOrderId === order.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
                        <span className={`text-xs font-bold truncate ${
                          selectedOrderId === order.id
                            ? 'text-indigo-700 dark:text-indigo-400'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}>
                          {order.order_code}
                        </span>
                        {(() => {
                          const timelines = order.order_stage_timelines
                          if (!timelines) return null
                          const stages = ['QC']
                          const isPending = stages.some(stageName => {
                            const match = timelines.find((t: any) => t.stage_name.toLowerCase() === stageName.toLowerCase())
                            return !match || !match.estimated_start_date || !match.estimated_end_date
                          })
                          if (!isPending) return null
                          return (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-955/20 dark:text-amber-400 shrink-0 select-none">
                              Setup
                            </span>
                          )
                        })()}
                      </div>
                      <ChevronRight size={12} className={selectedOrderId === order.id ? 'text-indigo-500' : 'text-slate-300'} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right column: main workplace card */}
        <div className="flex flex-col h-full overflow-y-auto p-3 space-y-4">
          {selectedOrder && (
            <TimelineProposalCard
              orderId={selectedOrder.id}
              orderCode={selectedOrder.order_code}
              orderDate={selectedOrder.order_date}
              estimatedDeliveryDate={selectedOrder.estimated_delivery_date || ''}
              userDepartment="audit"
              existingTimelines={selectedOrder.order_stage_timelines || []}
            />
          )}
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
            <DataTable
              headers={[
                'Order Code',
                'Product Item',
                'Supplier Name',
                'Phone Number',
                'Address',
                'Audit Status',
                <span key="actions" className="sr-only">Actions</span>
              ]}
              items={filteredSuppliers}
              emptyMessage="No shortlisted suppliers found. Go to the Sourcing Management page and add suppliers to your shortlist in Phase 2."
              renderRow={(supplier) => {
                const activeAudit = auditByOrderAndSupplier.get(`${supplier.order_id}-${supplier.id}`)
                const status = activeAudit ? activeAudit.audit_status : 'Not Requested'
                const reactKey = supplier.unique_key || `${supplier.order_id}-${supplier.id}`

                return (
                  <tr key={reactKey} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                      {supplier.order_code || '—'}
                    </td>
                    <td className="px-6 py-4 text-xs font-semibold text-slate-700 dark:text-slate-350">
                      {supplier.item_name || '—'}
                    </td>
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
                        <Badge className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900 font-semibold">
                          Scheduled
                        </Badge>
                      ) : status === 'In Progress' ? (
                        <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400 dark:border-indigo-900 font-semibold animate-pulse">
                          In Progress
                        </Badge>
                      ) : status === 'Completed' ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900 font-semibold">
                          Completed
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900 font-semibold">
                          Cancelled
                        </Badge>
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
                          disabled={status === 'Not Requested'}
                          title={status === 'Not Requested' ? "Shortlist not sent to QC yet" : undefined}
                          size="sm"
                          className="bg-[#5c59e9] hover:bg-[#4a47d2] font-semibold text-xs py-1.5 h-8 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {status === 'Pending QC Assignment' ? 'Assign & Schedule' : 'Schedule Audit'}
                        </Button>
                      ) : (status === 'Scheduled' || status === 'In Progress') ? (
                        <Button
                          onClick={() => {
                            setSelectedAudit(activeAudit!)
                            setResultData({
                              auditVerdict: '',
                              reportUrl: '',
                              certifications: activeAudit?.suppliers?.certifications || [],
                              notes: ''
                            })
                            setTagInput("")
                            setSelectedFile(null)
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
                              auditVerdict: (activeAudit?.audit_verdict || '') as any,
                              reportUrl: activeAudit?.report_url || '',
                              certifications: activeAudit?.certifications || activeAudit?.suppliers?.certifications || [],
                              notes: activeAudit?.audit_notes || ''
                            })
                            setTagInput("")
                            setSelectedFile(null)
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
              }}
            />
          ) : (
            /* Tab: Audit Logs & Reports */
            <DataTable
              headers={[
                'Supplier',
                'Audit Date',
                'QC Auditor',
                'Audit Verdict',
                'Factory Certifications',
                'Report',
                'Notes',
                <span key="actions" className="sr-only">Actions</span>
              ]}
              items={filteredAudits}
              emptyMessage="Schedule and log factory audits to populate the audit reports."
              renderRow={(audit) => (
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
                    {audit.audit_status === 'Completed' && audit.audit_verdict ? (
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold py-0.5 px-2.5 ${
                          audit.audit_verdict === 'PASS'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800'
                            : audit.audit_verdict === 'PASS WITH CONDITIONS'
                            ? 'bg-amber-50 text-amber-700 border-amber-250 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800'
                            : 'bg-rose-50 text-rose-700 border-rose-250 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-800'
                        }`}
                      >
                        {audit.audit_verdict}
                      </Badge>
                    ) : (
                      <span className="text-slate-400 italic">Pending Log</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {audit.certifications && audit.certifications.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {audit.certifications.map((cert) => (
                          <Badge
                            key={cert}
                            variant="secondary"
                            className="bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-[9px] py-0 px-1 border border-slate-200/50 dark:border-slate-800"
                          >
                            {cert}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[10px]">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {audit.audit_status === 'Completed' ? (
                      audit.report_url ? (
                        <a
                          href={audit.report_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800 cursor-pointer transition-colors"
                        >
                          <span>📄 View Report</span>
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800/50 dark:text-slate-500 dark:border-slate-800 select-none">
                          No Document Uploaded
                        </span>
                      )
                    ) : (
                      <span className="text-slate-400 italic text-xs">Pending Log</span>
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
                            setResultData({
                              auditVerdict: '',
                              reportUrl: '',
                              certifications: audit.suppliers?.certifications || [],
                              notes: ''
                            })
                            setTagInput("")
                            setSelectedFile(null)
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
              )}
            />
          )}
        </CardContent>
      </Card>
        </div> {/* Right column */}
      </div> {/* Grid container */}
      </TabsContent>
      </Tabs>

      {/* SCHEDULE AUDIT MODAL */}
      {isScheduleModalOpen && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] animate-in zoom-in-95 duration-200 max-h-[90vh]">
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
                    min={new Date().toLocaleDateString('sv-SE')}
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
      {isResultModalOpen && selectedAudit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-xl border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl rounded-2xl overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none] animate-in zoom-in-95 duration-200 max-h-[90vh]">
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

                {/* Group 1: Basic Info */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Supplier Name</Label>
                    <Input
                      value={selectedAudit?.suppliers?.name || '—'}
                      disabled
                      className="h-8.5 text-xs rounded-lg bg-slate-50/70 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 border-slate-200 dark:border-slate-700 font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Auditor Name</Label>
                    <Input
                      value={selectedAudit?.auditor_name || '—'}
                      disabled
                      className="h-8.5 text-xs rounded-lg bg-slate-50/70 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 border-slate-200 dark:border-slate-700 font-semibold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Audit Date</Label>
                    <Input
                      value={selectedAudit?.audit_date || '—'}
                      disabled
                      className="h-8.5 text-xs rounded-lg bg-slate-50/70 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400 border-slate-200 dark:border-slate-700 font-semibold"
                    />
                  </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />

                {/* Group 2: Audit Verdict */}
                <div className="space-y-1">
                  <Label htmlFor="auditVerdict" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Audit Verdict <span className="text-rose-500">*</span></Label>
                  <select
                    id="auditVerdict"
                    required
                    value={resultData.auditVerdict}
                    onChange={(e) => setResultData({ ...resultData, auditVerdict: e.target.value as any })}
                    className={`flex h-8.5 w-full rounded-lg border px-3 py-1.5 text-xs shadow-sm transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5c59e9] font-bold ${
                      resultData.auditVerdict === 'PASS'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-800'
                        : resultData.auditVerdict === 'PASS WITH CONDITIONS'
                        ? 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-800'
                        : resultData.auditVerdict === 'FAIL'
                        ? 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-800'
                        : 'bg-transparent border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <option value="" className="text-slate-500 bg-white dark:bg-slate-900 font-normal">-- Select Verdict --</option>
                    <option value="PASS" className="text-emerald-600 bg-white dark:bg-slate-900 font-bold">PASS</option>
                    <option value="PASS WITH CONDITIONS" className="text-amber-600 bg-white dark:bg-slate-900 font-bold">PASS WITH CONDITIONS</option>
                    <option value="FAIL" className="text-rose-600 bg-white dark:bg-slate-900 font-bold">FAIL</option>
                  </select>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />

                {/* Group 3: Dynamic Certifications Tag Input */}
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Factory Certifications</Label>
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-950/20 min-h-9 focus-within:ring-1 focus-within:ring-[#5c59e9] focus-within:border-[#5c59e9] transition-all">
                      {resultData.certifications.map((cert) => (
                        <Badge
                          key={cert}
                          variant="secondary"
                          className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1 py-0.5 pl-2 pr-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-[10px]"
                        >
                          <span>{cert}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const newCerts = resultData.certifications.filter((c) => c !== cert)
                              setResultData({ ...resultData, certifications: newCerts })
                            }}
                            className="text-slate-400 hover:text-slate-655 dark:hover:text-slate-200 cursor-pointer"
                          >
                            <X size={10} />
                          </button>
                        </Badge>
                      ))}
                      <input
                        type="text"
                        placeholder={resultData.certifications.length === 0 ? "Type standard & press Enter (e.g. ISO 9001, CE)" : "Add certification..."}
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const trimmed = tagInput.trim()
                            if (trimmed && !resultData.certifications.includes(trimmed)) {
                              setResultData(prev => ({
                                ...prev,
                                certifications: [...prev.certifications, trimmed]
                              }))
                            }
                            setTagInput("")
                          }
                        }}
                        className="flex-1 bg-transparent border-0 outline-none text-xs focus:ring-0 p-0.5 placeholder:text-slate-400 min-w-[120px]"
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium pl-1">
                      Press Enter to add a custom certification.
                    </div>
                  </div>
                </div>

                <hr className="border-slate-100 dark:border-slate-800" />

                {/* Group 4: Report Document Link & Detailed Audit Notes */}
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Report Document (PDF, DOCX, XLSX, IMAGES, Max 10MB)</Label>
                    <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/20 dark:bg-slate-950/20 transition-all hover:bg-slate-50/40 dark:hover:bg-slate-950/45 flex flex-col items-center justify-center gap-2">
                      {selectedFile ? (
                        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs w-full justify-between">
                          <div className="flex items-center gap-1.5 truncate">
                            <FileText size={14} className="shrink-0" />
                            <span className="font-semibold truncate">{selectedFile.name}</span>
                            <span className="text-[10px] opacity-70 shrink-0">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedFile(null)}
                            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-205 font-bold ml-1 cursor-pointer shrink-0"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : selectedAudit?.report_url ? (
                        <div className="flex flex-col gap-2 w-full">
                          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-750 text-xs w-full justify-between">
                            <div className="flex items-center gap-1.5 truncate">
                              <FileText size={14} className="shrink-0" />
                              <span className="font-semibold truncate">Current Uploaded Report</span>
                            </div>
                            <a
                              href={selectedAudit.report_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#5c59e9] hover:underline font-bold shrink-0 cursor-pointer"
                            >
                              View Report
                            </a>
                          </div>
                          <label className="flex items-center justify-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer transition-colors">
                            <Upload size={13} />
                            <span>Replace Report / Document</span>
                            <input
                              type="file"
                              accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                  const allowed = [
                                    'application/pdf',
                                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                    'image/jpeg',
                                    'image/png'
                                  ]
                                  if (!allowed.includes(file.type)) {
                                    alert('Unsupported file format. Please upload PDF, DOCX, XLSX, or Images.')
                                    return
                                  }
                                  if (file.size > 10 * 1024 * 1024) {
                                    alert('File size exceeds 10MB limit.')
                                    return
                                  }
                                  setSelectedFile(file)
                                }
                              }}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center cursor-pointer py-2.5 w-full">
                          <Upload className="text-slate-400 mb-2" size={24} />
                          <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold mb-0.5">Click to upload report / document</span>
                          <span className="text-[10px] text-slate-400">PDF, DOCX, XLSX, IMAGES up to 10MB</span>
                          <input
                            type="file"
                            accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                const allowed = [
                                  'application/pdf',
                                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                  'image/jpeg',
                                  'image/png'
                                ]
                                if (!allowed.includes(file.type)) {
                                  alert('Unsupported file format. Please upload PDF, DOCX, XLSX, or Images.')
                                  return
                                }
                                if (file.size > 10 * 1024 * 1024) {
                                  alert('File size exceeds 10MB limit.')
                                  return
                                }
                                setSelectedFile(file)
                              }
                            }}
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="notes" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Audit Notes / Inspector Notes</Label>
                    <textarea
                      id="notes"
                      placeholder="Provide details about machinery, clean environment compliance, labor standards, etc."
                      rows={2}
                      value={resultData.notes}
                      onChange={(e) => setResultData({ ...resultData, notes: e.target.value })}
                      className="flex w-full rounded-lg border border-slate-200 bg-transparent px-3 py-2 text-xs shadow-sm transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#5c59e9] dark:border-slate-800 dark:bg-slate-950 resize-none"
                    />
                  </div>
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
  )
}
