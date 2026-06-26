'use client'

import React, { useState } from 'react'
import { useSourcing } from '@/providers/sourcing-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Anchor,
  FileText,
  Upload,
  User,
  PlusCircle,
  TrendingDown
} from 'lucide-react'

interface InspectionRecord {
  id: string
  portName: string
  containerNumber: string
  sealNumber: string
  defectRate: number
  verdict: 'Approved' | 'Rejected'
  inspector: string
  dateChecked: string
}

const initialInspections: InspectionRecord[] = [
  {
    id: 'insp-1',
    portName: 'Cat Lai Port, HCMC',
    containerNumber: 'TRSU-102948-2',
    sealNumber: 'SL-9921',
    defectRate: 0.8,
    verdict: 'Approved',
    inspector: 'John Carter (Sourcing Lead)',
    dateChecked: '2026-06-22'
  },
  {
    id: 'insp-2',
    portName: 'Hai Phong Port, Hai Phong',
    containerNumber: 'TRSU-887412-0',
    sealNumber: 'SL-8841',
    defectRate: 3.5,
    verdict: 'Rejected',
    inspector: 'Minh Nguyen (Port Sourcing)',
    dateChecked: '2026-06-25'
  }
]

export default function PortInspectionPage() {
  const { userRole } = useSourcing()
  const [inspections, setInspections] = useState<InspectionRecord[]>(initialInspections)
  const [showForm, setShowForm] = useState(false)
  const [newInsp, setNewInsp] = useState({
    portName: 'Cat Lai Port, HCMC',
    containerNumber: '',
    sealNumber: '',
    defectRate: '',
    inspector: ''
  })

  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  const handleCreateInspection = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newInsp.containerNumber || !newInsp.sealNumber || !newInsp.defectRate || !newInsp.inspector) return

    const rate = Number(newInsp.defectRate)
    const approved = rate <= 2.5 // Acceptable quality limit (AQL) is 2.5%

    const createdInsp: InspectionRecord = {
      id: `insp-${Date.now()}`,
      portName: newInsp.portName,
      containerNumber: newInsp.containerNumber,
      sealNumber: newInsp.sealNumber,
      defectRate: rate,
      verdict: approved ? 'Approved' : 'Rejected',
      inspector: newInsp.inspector,
      dateChecked: new Date().toISOString().split('T')[0]
    }

    setInspections([createdInsp, ...inspections])
    setNewInsp({ portName: 'Cat Lai Port, HCMC', containerNumber: '', sealNumber: '', defectRate: '', inspector: '' })
    setShowForm(false)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Port Loading & Inspection
          </h1>
          <p className="text-sm text-slate-500">
            Phase 4: Record shipping container seal numbers and actual loading quality check results at ports
          </p>
        </div>

        {isStaffOrAdmin && (
          <Button onClick={() => setShowForm(!showForm)} className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer">
            <PlusCircle size={16} />
            <span>New Inspection Entry</span>
          </Button>
        )}
      </div>

      {/* New Port Inspection Form */}
      {showForm && (
        <Card className="border-slate-200/60 dark:border-slate-800 animate-in fade-in-50 duration-200">
          <CardHeader>
            <CardTitle className="text-base font-bold">New Port Inspection Report</CardTitle>
            <CardDescription className="text-xs">Sourcing agents must fill in actual container seal checks and AQL defect rates</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateInspection} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="port" className="text-xs font-semibold">Loading Port</Label>
                  <select
                    id="port"
                    value={newInsp.portName}
                    onChange={e => setNewInsp({ ...newInsp, portName: e.target.value })}
                    className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950"
                  >
                    <option value="Cat Lai Port, HCMC">Cat Lai Port, HCMC</option>
                    <option value="Hai Phong Port, Hai Phong">Hai Phong Port, Hai Phong</option>
                    <option value="Da Nang Port, Da Nang">Da Nang Port, Da Nang</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="container" className="text-xs font-semibold">Container Number</Label>
                  <Input
                    id="container"
                    placeholder="e.g. TRSU-102948-2"
                    value={newInsp.containerNumber}
                    onChange={e => setNewInsp({ ...newInsp, containerNumber: e.target.value })}
                    required
                    className="h-9 text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="seal" className="text-xs font-semibold">Seal Number</Label>
                  <Input
                    id="seal"
                    placeholder="e.g. SL-9921"
                    value={newInsp.sealNumber}
                    onChange={e => setNewInsp({ ...newInsp, sealNumber: e.target.value })}
                    required
                    className="h-9 text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="defect" className="text-xs font-semibold">Measured Defect Rate (%)</Label>
                  <Input
                    id="defect"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 0.80"
                    value={newInsp.defectRate}
                    onChange={e => setNewInsp({ ...newInsp, defectRate: e.target.value })}
                    required
                    className="h-9 text-xs rounded-lg"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="inspectorName" className="text-xs font-semibold">Inspector Name</Label>
                  <Input
                    id="inspectorName"
                    placeholder="e.g. John Carter"
                    value={newInsp.inspector}
                    onChange={e => setNewInsp({ ...newInsp, inspector: e.target.value })}
                    required
                    className="h-9 text-xs rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="bg-[#5c59e9] hover:bg-[#4a47d2]">
                  Approved Report
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Inspection List Table */}
      <Card className="border-slate-200/60 dark:border-slate-800">
        <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800">
          <CardTitle className="text-base font-bold">Port Inspection Records</CardTitle>
          <CardDescription className="text-xs">Container seal audits. Defect limit AQL threshold is 2.5% max.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                  <th className="px-6 py-4">Port</th>
                  <th className="px-6 py-4">Container Details</th>
                  <th className="px-6 py-4">Seal Number</th>
                  <th className="px-6 py-4">Measured Defect Rate</th>
                  <th className="px-6 py-4">Verification Date</th>
                  <th className="px-6 py-4">AQL Verdict</th>
                  <th className="px-6 py-4 text-right">Report Document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {inspections.map((i) => (
                  <tr key={i.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                    <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <Anchor size={14} className="text-[#5c59e9]" />
                        <span>{i.portName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-mono">
                      {i.containerNumber}
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-mono">
                      {i.sealNumber}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {i.defectRate.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-slate-400">Limit: 2.50%</div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{i.dateChecked}</td>
                    <td className="px-6 py-4">
                      {i.verdict === 'Approved' ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400">
                          APPROVED
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-400">
                          REJECTED (AQL Fail)
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button size="sm" variant="outline" className="text-xs h-8 gap-1.5">
                        <FileText size={12} className="text-indigo-500" />
                        <span>View doc</span>
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
