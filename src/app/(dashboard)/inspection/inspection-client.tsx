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
import { DataTable } from '@/components/ui/data-table'
import {
  Anchor,
  FileText,
  PlusCircle,
  TrendingDown,
  CheckCircle,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Loader2
} from 'lucide-react'
import { createInspectionAction } from './actions'

export interface DatabaseInspectionRecord {
  id: string
  order_id: string
  port_name: string
  container_number: string
  seal_number: string
  defect_rate: number
  verdict: 'Approved' | 'Rejected'
  inspector: string
  date_checked: string
  orders?: {
    order_code: string
  }
}

export interface ActiveOrderForInspection {
  id: string
  order_code: string
  order_items?: Array<{
    item_name: string
  }>
}

interface InspectionClientProps {
  initialInspections: DatabaseInspectionRecord[]
  activeOrders: ActiveOrderForInspection[]
}

export function InspectionClient({ initialInspections, activeOrders }: InspectionClientProps) {
  const { userRole } = useSourcing()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [subtab, setSubtab] = useState<'overview' | 'workplace'>((searchParams.get('subtab') as 'overview' | 'workplace') || 'overview')
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [newInsp, setNewInsp] = useState({
    portName: 'Cat Lai Port, HCMC',
    containerNumber: '',
    sealNumber: '',
    defectRate: '',
    inspector: ''
  })

  const handleTabChange = (val: 'overview' | 'workplace') => {
    setSubtab(val)
    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?subtab=${val}`
      window.history.pushState({ ...window.history.state, as: newUrl, url: newUrl }, '', newUrl)
    }
  }

  const isStaffOrAdmin = userRole === 'staff' || userRole === 'admin'

  const handleCreateInspection = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrderId || !newInsp.containerNumber || !newInsp.sealNumber || !newInsp.defectRate || !newInsp.inspector) return

    startTransition(async () => {
      setErrorMessage(null)
      const res = await createInspectionAction({
        orderId: selectedOrderId,
        portName: newInsp.portName,
        containerNumber: newInsp.containerNumber,
        sealNumber: newInsp.sealNumber,
        defectRate: Number(newInsp.defectRate),
        inspector: newInsp.inspector
      })
      if (res.success) {
        setSelectedOrderId('')
        setNewInsp({ portName: 'Cat Lai Port, HCMC', containerNumber: '', sealNumber: '', defectRate: '', inspector: '' })
        setShowForm(false)
        router.refresh()
      } else {
        setErrorMessage(res.error || 'Failed to file inspection report')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Port Loading &amp; Inspection
          </h1>
        </div>

        {isStaffOrAdmin && (
          <Button onClick={() => setShowForm(!showForm)} className="gap-2 bg-[#5c59e9] hover:bg-[#4a47d2] cursor-pointer">
            <PlusCircle size={16} />
            <span>New Inspection Entry</span>
          </Button>
        )}
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
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Inspected Shipments</CardTitle>
                  <Anchor className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{initialInspections.length}</div>
                  <p className="text-[10px] text-slate-400 mt-1">Total cargo containers checked at port</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">AQL Pass Rate</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {(() => {
                      const approved = initialInspections.filter(i => i.verdict === 'Approved').length
                      if (initialInspections.length === 0) return '100%'
                      return `${((approved / initialInspections.length) * 100).toFixed(0)}%`
                    })()}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Defects below AQL 2.5% threshold</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Defect Rate</CardTitle>
                  <TrendingDown className="h-4 w-4 text-indigo-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">
                    {(() => {
                      if (initialInspections.length === 0) return '0%'
                      const sum = initialInspections.reduce((total, i) => total + Number(i.defect_rate), 0)
                      return `${(sum / initialInspections.length).toFixed(2)}%`
                    })()}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">Measured cargo quality deviation</p>
                </CardContent>
              </Card>

              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reports Filed</CardTitle>
                  <FileText className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-black text-slate-900 dark:text-white">{initialInspections.length}</div>
                  <p className="text-[10px] text-slate-400 mt-1">Digitized bill of lading documents</p>
                </CardContent>
              </Card>
            </div>

            {/* Port split & Recent inspections */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-slate-200/60 dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Loading Volumes by Port</CardTitle>
                  <CardDescription className="text-xs">Cargo allocation split across key transit ports</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: 'Cat Lai Port, HCMC', pct: '80%' },
                    { label: 'Hai Phong Port, Hai Phong', pct: '60%' },
                    { label: 'Da Nang Port, Da Nang', pct: '40%' }
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
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Recent Loading Inspection Logs</CardTitle>
                  <CardDescription className="text-xs">Latest port checks filed by logistics agents</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {initialInspections.length === 0 ? (
                    <p className="text-xs text-slate-400">No inspections logged yet.</p>
                  ) : (
                    initialInspections.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-900">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.verdict === 'Approved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400'
                            : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/20 dark:text-rose-450'
                        }`}>
                          {item.container_number}
                        </span>
                        <div className="flex-1 space-y-0.5">
                          <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                            Defect: {Number(item.defect_rate).toFixed(2)}% at {item.port_name}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Checked by {item.inspector} on {item.date_checked}
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
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="orderSelect" className="text-xs font-semibold">Select Order to Inspect</Label>
                      {activeOrders.length === 0 ? (
                        <p className="text-xs text-red-500 font-semibold">No orders currently waiting in Inspection stage.</p>
                      ) : (
                        <select
                          id="orderSelect"
                          value={selectedOrderId}
                          onChange={e => setSelectedOrderId(e.target.value)}
                          required
                          className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
                        >
                          <option value="">-- Choose Order --</option>
                          {activeOrders.map(o => (
                            <option key={o.id} value={o.id}>
                              {o.order_code} ({o.order_items?.[0]?.item_name || 'Goods'})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="port" className="text-xs font-semibold">Loading Port</Label>
                      <select
                        id="port"
                        value={newInsp.portName}
                        onChange={e => setNewInsp({ ...newInsp, portName: e.target.value })}
                        className="flex h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 dark:border-slate-800 dark:bg-slate-950 text-slate-700 dark:text-slate-300"
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
                    <Button type="submit" size="sm" disabled={isPending} className="bg-[#5c59e9] hover:bg-[#4a47d2] gap-1.5">
                      {isPending && <Loader2 size={13} className="animate-spin" />}
                      <span>Submit Report</span>
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
              <DataTable
                headers={[
                  'Port',
                  'Container Details',
                  'Seal Number',
                  'Measured Defect Rate',
                  'Verification Date',
                  'AQL Verdict',
                  <span key="doc" className="sr-only">Actions</span>
                ]}
                items={initialInspections}
                renderRow={(i) => (
                  <tr key={i.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                    <td className="px-6 py-4 font-semibold text-slate-800 dark:text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <Anchor size={14} className="text-[#5c59e9]" />
                        <span>{i.port_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-mono">
                      {i.container_number}
                    </td>
                    <td className="px-6 py-4 text-slate-700 dark:text-slate-300 font-mono">
                      {i.seal_number}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {Number(i.defect_rate).toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-slate-400">Limit: 2.50%</div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{i.date_checked}</td>
                    <td className="px-6 py-4">
                      {i.verdict === 'Approved' ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400">
                          APPROVED
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/20 dark:text-rose-450">
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
                )}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
