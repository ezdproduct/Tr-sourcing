'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Users2,
  Package,
  TrendingUp,
  Search,
  ArrowUpDown,
  X,
  Star,
  Clock,
  ShieldAlert,
  FolderKanban,
  Award
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'

interface SupplierBid {
  id: string
  quoted_price: number
  lead_time_days: number
  is_shortlisted: boolean
  created_at: string
  created_by: string | null
  supplier_name: string
  supplier_id: string | null
  suppliers?: {
    quality_rating: string | null
    reliability_score: number | null
  } | null
}

interface MasterSupplier {
  id: string
  name: string
  created_by: string | null
  quality_rating: string | null
  reliability_score: number | null
  created_at: string
}

interface SourcingPerformanceProps {
  bids: SupplierBid[]
  masterSuppliers: MasterSupplier[]
}

interface AgentMetrics {
  agentEmail: string
  agentName: string
  totalSuppliers: number
  totalBids: number
  shortlistedBids: number
  shortlistRate: number
  avgLeadTime: number
  avgQuotedPrice: number
  avgReliability: number
  suppliersList: MasterSupplier[]
  bidsList: SupplierBid[]
}

const COLORS = ['#5c59e9', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export function SourcingPerformance({ bids, masterSuppliers }: SourcingPerformanceProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortField, setSortField] = useState<keyof AgentMetrics>('totalSuppliers')
  const [sortAsc, setSortAsc] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<AgentMetrics | null>(null)
  const [detailTab, setDetailTab] = useState<'suppliers' | 'bids'>('suppliers')

  // Aggregate Metrics per Sourcing Agent
  const agentsMetrics = useMemo(() => {
    const agentsMap: Record<
      string,
      {
        agentEmail: string
        agentName: string
        totalSuppliers: number
        totalBids: number
        shortlistedBids: number
        avgLeadTimeSum: number
        avgLeadTimeCount: number
        avgQuotedPriceSum: number
        avgQuotedPriceCount: number
        avgReliabilitySum: number
        avgReliabilityCount: number
        suppliersList: MasterSupplier[]
        bidsList: SupplierBid[]
      }
    > = {}

    const createEmptyAgent = (email: string) => {
      const name = email.includes('@') ? email.split('@')[0] : email
      return {
        agentEmail: email,
        agentName: name,
        totalSuppliers: 0,
        totalBids: 0,
        shortlistedBids: 0,
        avgLeadTimeSum: 0,
        avgLeadTimeCount: 0,
        avgQuotedPriceSum: 0,
        avgQuotedPriceCount: 0,
        avgReliabilitySum: 0,
        avgReliabilityCount: 0,
        suppliersList: [],
        bidsList: []
      }
    }

    // Process master suppliers
    masterSuppliers.forEach(s => {
      const email = s.created_by || 'system'
      if (!agentsMap[email]) {
        agentsMap[email] = createEmptyAgent(email)
      }
      const agent = agentsMap[email]
      agent.totalSuppliers += 1
      agent.suppliersList.push(s)
      if (typeof s.reliability_score === 'number' && s.reliability_score > 0) {
        agent.avgReliabilitySum += s.reliability_score
        agent.avgReliabilityCount += 1
      }
    })

    // Process bids
    bids.forEach(b => {
      const email = b.created_by || 'system'
      if (!agentsMap[email]) {
        agentsMap[email] = createEmptyAgent(email)
      }
      const agent = agentsMap[email]
      agent.totalBids += 1
      agent.bidsList.push(b)
      if (b.is_shortlisted) {
        agent.shortlistedBids += 1
      }
      if (typeof b.lead_time_days === 'number' && b.lead_time_days > 0) {
        agent.avgLeadTimeSum += b.lead_time_days
        agent.avgLeadTimeCount += 1
      }
      if (typeof b.quoted_price === 'number' && b.quoted_price > 0) {
        agent.avgQuotedPriceSum += b.quoted_price
        agent.avgQuotedPriceCount += 1
      }
    })

    return Object.values(agentsMap).map(agent => ({
      agentEmail: agent.agentEmail,
      agentName: agent.agentName,
      totalSuppliers: agent.totalSuppliers,
      totalBids: agent.totalBids,
      shortlistedBids: agent.shortlistedBids,
      shortlistRate: agent.totalBids > 0 ? (agent.shortlistedBids / agent.totalBids) * 100 : 0,
      avgLeadTime: agent.avgLeadTimeCount > 0 ? agent.avgLeadTimeSum / agent.avgLeadTimeCount : 0,
      avgQuotedPrice: agent.avgQuotedPriceCount > 0 ? agent.avgQuotedPriceSum / agent.avgQuotedPriceCount : 0,
      avgReliability: agent.avgReliabilityCount > 0 ? agent.avgReliabilitySum / agent.avgReliabilityCount : 0,
      suppliersList: agent.suppliersList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      bidsList: agent.bidsList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }))
  }, [bids, masterSuppliers])

  // Filter & Sort Agents List
  const filteredAgents = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    let result = agentsMetrics

    if (term) {
      result = result.filter(
        a =>
          a.agentEmail.toLowerCase().includes(term) ||
          a.agentName.toLowerCase().includes(term)
      )
    }

    result.sort((a, b) => {
      const valA = a[sortField]
      const valB = b[sortField]

      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA
      }
      return 0
    })

    return result
  }, [agentsMetrics, searchTerm, sortField, sortAsc])

  // Overall Sourcing KPIs
  const summaryKPIs = useMemo(() => {
    const activeAgents = agentsMetrics.filter(a => a.totalSuppliers > 0 || a.totalBids > 0)
    const totalSourcingBids = bids.length
    const totalShortlists = bids.filter(b => b.is_shortlisted).length
    const overallShortlistRate = totalSourcingBids > 0 ? (totalShortlists / totalSourcingBids) * 100 : 0

    // Find top agent by suppliers sourced
    let topVolumeAgent = '—'
    let maxSuppliers = 0
    agentsMetrics.forEach(a => {
      if (a.totalSuppliers > maxSuppliers && a.agentEmail !== 'system') {
        maxSuppliers = a.totalSuppliers
        topVolumeAgent = a.agentName
      }
    })

    // Find top agent by conversion rate (min 3 bids)
    let topConverterAgent = '—'
    let maxRate = 0
    agentsMetrics.forEach(a => {
      if (a.totalBids >= 3 && a.shortlistRate > maxRate && a.agentEmail !== 'system') {
        maxRate = a.shortlistRate
        topConverterAgent = `${a.agentName} (${a.shortlistRate.toFixed(0)}%)`
      }
    })

    return {
      totalAgents: activeAgents.length,
      topVolumeAgent,
      topConverterAgent,
      overallShortlistRate
    }
  }, [agentsMetrics, bids])

  const handleSort = (field: keyof AgentMetrics) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  // Chart Data preparation
  const chartData = useMemo(() => {
    return agentsMetrics
      .filter(a => a.totalSuppliers > 0 || a.totalBids > 0)
      .map(a => ({
        name: a.agentName,
        Suppliers: a.totalSuppliers,
        Bids: a.totalBids,
        Shortlisted: a.shortlistedBids
      }))
  }, [agentsMetrics])

  const pieChartData = useMemo(() => {
    return agentsMetrics
      .filter(a => a.totalBids > 0 && a.agentEmail !== 'system')
      .map(a => ({
        name: a.agentName,
        value: a.shortlistedBids
      }))
      .filter(d => d.value > 0)
  }, [agentsMetrics])

  return (
    <div className="space-y-6 w-full animate-in fade-in duration-200">
      {/* KPI Section */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Sourcing Agents</CardTitle>
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg">
              <Users2 className="h-4 w-4 text-[#5c59e9]" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{summaryKPIs.totalAgents}</div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">Sourcing accounts with activity</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Top Volume Sourcing</CardTitle>
            <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg">
              <Award className="h-4 w-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 truncate">{summaryKPIs.topVolumeAgent}</div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">Most supplier profiles created</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Best Shortlist Rate</CardTitle>
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg">
              <TrendingUp className="h-4 w-4 text-[#5c59e9]" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white truncate">{summaryKPIs.topConverterAgent}</div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">Highest bid-to-shortlist conversion</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Overall Shortlist Rate</CardTitle>
            <div className="p-1.5 bg-teal-50 dark:bg-teal-950/40 rounded-lg">
              <Package className="h-4 w-4 text-teal-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-900 dark:text-white">
              {summaryKPIs.overallShortlistRate.toFixed(1)}%
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">Shortlisted bids ratio overall</p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Sourcing Activity by Agent</CardTitle>
            <CardDescription className="text-xs">Comparison of supplier profiles created vs bids submitted</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">No activity data available</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      fontSize: '11px'
                    }}
                  />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="Suppliers" name="Sourced Suppliers" fill="#5c59e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Bids" name="Bids Submitted" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Shortlisted" name="Shortlists" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Shortlisted Share</CardTitle>
            <CardDescription className="text-xs">Distribution of shortlisted supplier bids by sourcing account</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px] flex flex-col justify-between">
            {pieChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs italic">No shortlisted bids available</div>
            ) : (
              <>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} shortlists`, 'Performance']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center pb-2">
                  {pieChartData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-[10px] font-semibold">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span className="text-slate-655 dark:text-slate-400">{entry.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard Table */}
      <Card className="border-slate-200/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <CardHeader className="pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 dark:text-white">Agent Performance Leaderboard</CardTitle>
            <CardDescription className="text-xs">Compare performance statistics and conversion rates across all agents</CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="Search agents..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="h-9 w-full rounded-lg pl-9 pr-4 text-xs bg-slate-50 border-slate-200 dark:bg-slate-950 dark:border-slate-800"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/50 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="px-6 py-3.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('agentName')}>
                    <div className="flex items-center gap-1.5">Agent Name <ArrowUpDown size={11} /></div>
                  </th>
                  <th className="px-6 py-3.5 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('totalSuppliers')}>
                    <div className="flex items-center justify-center gap-1.5">Sourced <ArrowUpDown size={11} /></div>
                  </th>
                  <th className="px-6 py-3.5 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('totalBids')}>
                    <div className="flex items-center justify-center gap-1.5">Bids Submitted <ArrowUpDown size={11} /></div>
                  </th>
                  <th className="px-6 py-3.5 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('shortlistedBids')}>
                    <div className="flex items-center justify-center gap-1.5">Shortlisted <ArrowUpDown size={11} /></div>
                  </th>
                  <th className="px-6 py-3.5 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('shortlistRate')}>
                    <div className="flex items-center justify-center gap-1.5">Shortlist Rate <ArrowUpDown size={11} /></div>
                  </th>
                  <th className="px-6 py-3.5 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('avgLeadTime')}>
                    <div className="flex items-center justify-center gap-1.5">Avg Lead Time <ArrowUpDown size={11} /></div>
                  </th>
                  <th className="px-6 py-3.5 text-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => handleSort('avgReliability')}>
                    <div className="flex items-center justify-center gap-1.5">Avg Reliability <ArrowUpDown size={11} /></div>
                  </th>
                  <th className="px-6 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredAgents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-slate-400 italic">No agents matching filter found.</td>
                  </tr>
                ) : (
                  filteredAgents.map(agent => (
                    <tr key={agent.agentEmail} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                      <td className="px-6 py-3.5 font-bold text-slate-900 dark:text-white">
                        <div className="flex flex-col">
                          <span>{agent.agentName}</span>
                          <span className="text-[10px] text-slate-400 font-medium">{agent.agentEmail}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-center font-semibold text-slate-900 dark:text-white">
                        {agent.totalSuppliers}
                      </td>
                      <td className="px-6 py-3.5 text-center font-semibold text-slate-900 dark:text-white">
                        {agent.totalBids}
                      </td>
                      <td className="px-6 py-3.5 text-center font-semibold text-slate-900 dark:text-white">
                        {agent.shortlistedBids}
                      </td>
                      <td className="px-6 py-3.5 text-center font-semibold">
                        <Badge
                          variant="outline"
                          className={`font-black rounded-full border-0 px-2 py-0.5 ${
                            agent.shortlistRate >= 50
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : agent.shortlistRate >= 20
                              ? 'bg-indigo-500/10 text-[#5c59e9]'
                              : agent.totalBids === 0
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                              : 'bg-amber-500/10 text-amber-600'
                          }`}
                        >
                          {agent.totalBids === 0 ? '—' : `${agent.shortlistRate.toFixed(1)}%`}
                        </Badge>
                      </td>
                      <td className="px-6 py-3.5 text-center text-slate-500 font-medium">
                        {agent.avgLeadTime === 0 ? '—' : `${agent.avgLeadTime.toFixed(1)} days`}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        {agent.avgReliability === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="flex items-center justify-center gap-1 font-bold text-indigo-600 dark:text-indigo-400">
                            <Star size={11} className="fill-indigo-500 text-indigo-500" />
                            <span>{agent.avgReliability.toFixed(1)}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={agent.totalSuppliers === 0 && agent.totalBids === 0}
                          onClick={() => {
                            setSelectedAgent(agent)
                            setDetailTab(agent.suppliersList.length > 0 ? 'suppliers' : 'bids')
                          }}
                          className="h-7.5 px-3 text-[11px] font-semibold border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Slide-out details drawer */}
      {selectedAgent && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-[100] transition-opacity duration-300"
            onClick={() => setSelectedAgent(null)}
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 right-0 w-full sm:w-[600px] bg-white dark:bg-slate-955 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-[101] animate-in slide-in-from-right duration-300 flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Agent Sourcing Activity
                  </h3>
                  <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-400 font-bold border-0">
                    {selectedAgent.agentName}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{selectedAgent.agentEmail}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedAgent(null)}
                className="h-8 w-8 rounded-full border border-slate-100 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </Button>
            </div>

            {/* Quick Agent KPIs */}
            <div className="p-6 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-4 text-center">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Sourced Suppliers</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">{selectedAgent.totalSuppliers}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Bids</span>
                <span className="text-lg font-black text-slate-900 dark:text-white">{selectedAgent.totalBids}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Shortlist Rate</span>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                  {selectedAgent.shortlistRate.toFixed(0)}%
                </span>
              </div>
            </div>

            {/* Drawer Tab Switcher */}
            <div className="px-6 pt-4 flex gap-1 border-b border-slate-150 dark:border-slate-800">
              <button
                onClick={() => setDetailTab('suppliers')}
                className={`pb-3 text-xs font-bold px-4 border-b-2 cursor-pointer transition-all ${
                  detailTab === 'suppliers'
                    ? 'border-[#5c59e9] text-[#5c59e9]'
                    : 'border-transparent text-slate-450 hover:text-slate-700'
                }`}
              >
                Sourced Suppliers ({selectedAgent.totalSuppliers})
              </button>
              <button
                onClick={() => setDetailTab('bids')}
                className={`pb-3 text-xs font-bold px-4 border-b-2 cursor-pointer transition-all ${
                  detailTab === 'bids'
                    ? 'border-[#5c59e9] text-[#5c59e9]'
                    : 'border-transparent text-slate-450 hover:text-slate-700'
                }`}
              >
                Pricing Bids ({selectedAgent.totalBids})
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {detailTab === 'suppliers' ? (
                <div className="space-y-4">
                  {selectedAgent.suppliersList.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 italic">No supplier profiles sourced yet.</div>
                  ) : (
                    selectedAgent.suppliersList.map(s => (
                      <Card key={s.id} className="border-slate-150 dark:border-slate-800/80 shadow-xs hover:border-slate-300 dark:hover:border-slate-750 transition-colors">
                        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                          <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                            {s.name}
                          </CardTitle>
                          <div className="flex items-center gap-1">
                            {s.quality_rating && (
                              <Badge className="bg-slate-50 dark:bg-slate-900 text-[10px] font-bold text-[#5c59e9] border border-[#5c59e9]/30">
                                Quality: {s.quality_rating}
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 text-[11px] text-slate-550 dark:text-slate-400 space-y-1.5">
                          <div className="flex justify-between">
                            <span>Reliability Score:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {s.reliability_score ? `${s.reliability_score}%` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Sourced Date:</span>
                            <span>{new Date(s.created_at).toLocaleDateString()}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedAgent.bidsList.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 italic">No pricing bids submitted yet.</div>
                  ) : (
                    selectedAgent.bidsList.map(b => (
                      <Card key={b.id} className="border-slate-150 dark:border-slate-800/80 shadow-xs hover:border-slate-300 dark:hover:border-slate-750 transition-colors">
                        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                          <CardTitle className="text-xs font-bold text-slate-900 dark:text-white">
                            {b.supplier_name}
                          </CardTitle>
                          <Badge
                            className={`border-0 font-bold text-[9px] px-2 py-0.5 rounded-full ${
                              b.is_shortlisted
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : 'bg-slate-100 dark:bg-slate-900 text-slate-400'
                            }`}
                          >
                            {b.is_shortlisted ? 'Shortlisted' : 'Submitted'}
                          </Badge>
                        </CardHeader>
                        <CardContent className="p-4 pt-0 text-[11px] text-slate-550 dark:text-slate-400 space-y-1.5">
                          <div className="flex justify-between">
                            <span>Quoted Price:</span>
                            <span className="font-bold text-slate-900 dark:text-white">
                              ${b.quoted_price.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Lead Time:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {b.lead_time_days} days
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Date Submitted:</span>
                            <span>{new Date(b.created_at).toLocaleDateString()}</span>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
