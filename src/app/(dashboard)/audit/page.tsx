'use client'

import React, { useState } from 'react'
import { useSourcing } from '@/providers/sourcing-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ShieldCheck,
  ClipboardCheck,
  User,
  PlusCircle,
  Calendar,
  AlertCircle
} from 'lucide-react'

interface AuditRecord {
  id: string
  factoryName: string
  auditorName: string
  score: number
  complianceGrade: 'Grade-A' | 'Grade-B' | 'Grade-C'
  dateAudited: string
  status: 'passed' | 'failed'
}

const initialAudits: AuditRecord[] = [
  {
    id: 'aud-1',
    factoryName: 'Viet My Woodworking Ltd',
    auditorName: 'David Lee (Senior QC)',
    score: 94,
    complianceGrade: 'Grade-A',
    dateAudited: '2026-06-21',
    status: 'passed'
  },
  {
    id: 'aud-2',
    factoryName: 'HAGL Furniture Factory',
    auditorName: 'Sophia Tran (QC Lead)',
    score: 96,
    complianceGrade: 'Grade-A',
    dateAudited: '2026-06-23',
    status: 'passed'
  },
  {
    id: 'aud-3',
    factoryName: 'Dongguan Timber Craft Co',
    auditorName: 'Kenji Sato (QC Auditor)',
    score: 72,
    complianceGrade: 'Grade-C',
    dateAudited: '2026-06-24',
    status: 'failed'
  }
]

export default function FactoryAuditPage() {
  const { userRole } = useSourcing()
  const [audits, setAudits] = useState<AuditRecord[]>(initialAudits)
  const [showForm, setShowForm] = useState(false)
  const [newAudit, setNewAudit] = useState({
    factoryName: '',
    auditorName: '',
    score: '',
    grade: 'Grade-A' as AuditRecord['complianceGrade']
  })

  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  const handleCreateAudit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAudit.factoryName || !newAudit.auditorName || !newAudit.score) return

    const scoreNum = Number(newAudit.score)
    const passed = scoreNum >= 75

    const createdAudit: AuditRecord = {
      // eslint-disable-next-line react-hooks/purity
      id: `aud-${Date.now()}`,
      factoryName: newAudit.factoryName,
      auditorName: newAudit.auditorName,
      score: scoreNum,
      complianceGrade: newAudit.grade,
      dateAudited: new Date().toISOString().split('T')[0],
      status: passed ? 'passed' : 'failed'
    }

    setOrders([createdAudit, ...audits])
    setNewAudit({ factoryName: '', auditorName: '', score: '', grade: 'Grade-A' })
    setShowForm(false)
  }

  const setOrders = (arr: AuditRecord[]) => {
    setAudits(arr)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Factory Auditing & Quality Control
          </h1>
          <p className="text-sm text-slate-500">
            Phase 3: Log factory compliance checks, manufacturing capacity scorecards, and environmental certifications
          </p>
        </div>

        {isStaffOrAdmin && (
          <Button onClick={() => setShowForm(!showForm)} className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer">
            <PlusCircle size={16} />
            <span>Submit Audit Report</span>
          </Button>
        )}
      </div>

      {/* Submit Audit Form */}
      {showForm && (
        <Card className="border-slate-200/60 dark:border-slate-800 animate-in fade-in-50 duration-200">
          <CardHeader>
            <CardTitle className="text-base font-bold">New Factory Audit Entry</CardTitle>
            <CardDescription className="text-xs">QC inspectors must log raw scoring and compliance grades below</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAudit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="facName" className="text-xs font-semibold">Factory Name</Label>
                  <Input
                    id="facName"
                    placeholder="e.g. Binh Duong Woodworks"
                    value={newAudit.factoryName}
                    onChange={e => setNewAudit({ ...newAudit, factoryName: e.target.value })}
                    required
                    className="h-9 text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="audName" className="text-xs font-semibold">QC Auditor Name</Label>
                  <Input
                    id="audName"
                    placeholder="e.g. David Lee (QC)"
                    value={newAudit.auditorName}
                    onChange={e => setNewAudit({ ...newAudit, auditorName: e.target.value })}
                    required
                    className="h-9 text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="score" className="text-xs font-semibold">Audit Score (1-100)</Label>
                  <Input
                    id="score"
                    type="number"
                    min="1"
                    max="100"
                    placeholder="e.g. 95"
                    value={newAudit.score}
                    onChange={e => setNewAudit({ ...newAudit, score: e.target.value })}
                    required
                    className="h-9 text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="grade" className="text-xs font-semibold">Compliance Grade</Label>
                  <select
                    id="grade"
                    value={newAudit.grade}
                    onChange={e => setNewAudit({ ...newAudit, grade: e.target.value as AuditRecord['complianceGrade'] })}
                    className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <option value="Grade-A">Grade-A (FSC / Social Compliant)</option>
                    <option value="Grade-B">Grade-B (Minor Compliance issues)</option>
                    <option value="Grade-C">Grade-C (Critical Compliance issues)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-[#5c59e9] hover:bg-[#4a47d2]">
                  Submit Audit
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Audit Log List */}
      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold">QC Factory Audit Logs</CardTitle>
          <CardDescription className="text-xs">Historical audit passes and failures. Grade-A required for production runs.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                  <th className="px-6 py-4">Factory</th>
                  <th className="px-6 py-4">QC Inspector</th>
                  <th className="px-6 py-4">Score</th>
                  <th className="px-6 py-4">Social/Env Grade</th>
                  <th className="px-6 py-4">Date Audited</th>
                  <th className="px-6 py-4">Decision</th>
                  <th className="px-6 py-4 text-right">Certificate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {audits.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                    <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                      {a.factoryName}
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-slate-400" />
                        <span>{a.auditorName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                      {a.score}/100
                    </td>
                    <td className="px-6 py-4">
                      {a.complianceGrade === 'Grade-A' ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400">
                          Grade-A (FSC)
                        </Badge>
                      ) : a.complianceGrade === 'Grade-B' ? (
                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400">
                          Grade-B
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400">
                          Grade-C (Critical)
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={13} className="text-slate-400" />
                        <span>{a.dateAudited}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {a.status === 'passed' ? (
                        <Badge className="bg-emerald-600 text-white border-0">
                          PASSED
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-600 text-white border-0">
                          REJECTED
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5" disabled={a.status === 'failed'}>
                        <ClipboardCheck size={12} className="text-teal-500" />
                        <span>View report</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
