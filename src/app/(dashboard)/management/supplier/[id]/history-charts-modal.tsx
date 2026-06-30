'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Calendar, TrendingUp, Cpu, BarChart3, Database, ChevronDown } from 'lucide-react'
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { getSupplierProductHistoryAction } from '../../actions'

interface HistoryChartsModalProps {
  supplierId: string
  supplierName: string
  productName: string
  onClose: () => void
}

function parseCapacityValue(capacityStr: string | null | undefined): number {
  if (!capacityStr) return 0
  const cleanStr = (capacityStr || '').replace(/,/g, '')
  const match = cleanStr.match(/\d+/)
  return match ? parseInt(match[0], 10) : 0
}

export function HistoryChartsModal({ supplierId, supplierName, productName, onClose }: HistoryChartsModalProps) {
  const [activeTab, setActiveTab] = useState<'price' | 'capacity' | 'orders' | 'raw'>('price')
  const [historyData, setHistoryData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
    async function fetchHistory() {
      setIsLoading(true)
      try {
        const res = await getSupplierProductHistoryAction(supplierId, productName)
        if (res.success && res.history) {
          setHistoryData(res.history)
        } else {
          setError(res.error || 'Failed to load history data.')
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred.')
      } finally {
        setIsLoading(false)
      }
    }
    fetchHistory()
  }, [supplierId, productName])

  if (!isMounted) return null

  // Format data for Recharts
  const chartData = historyData.map(item => {
    const date = new Date(item.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit'
    })
    return {
      name: date,
      dateStr: date,
      price: Number(item.price),
      capacityText: item.capacity || '—',
      capacity: parseCapacityValue(item.capacity),
      ordered: Number(item.ordered_quantity || 0),
      eventType: item.event_type,
      createdBy: item.created_by ? item.created_by.split('@')[0] : 'System'
    }
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Content Card */}
      <div className="relative z-10 w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={16} className="text-[#5c59e9]" />
              <span>Product History Trends</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5 font-medium">
              Product: <span className="text-slate-700 dark:text-slate-300 font-bold">{productName}</span> | Supplier: <span className="text-slate-700 dark:text-slate-300 font-bold">{supplierName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="flex px-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20">
          {(
            [
              { id: 'price', label: 'Price Trend', icon: TrendingUp },
              { id: 'capacity', label: 'Capacity Trend', icon: Cpu },
              { id: 'orders', label: 'Order Volume', icon: BarChart3 },
              { id: 'raw', label: 'Raw Log', icon: Database }
            ] as const
          ).map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-[#5c59e9] text-[#5c59e9] dark:border-indigo-400 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 p-6 overflow-y-auto min-h-[350px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <Loader2 size={24} className="animate-spin text-[#5c59e9]" />
              <span className="text-xs text-slate-400">Loading history logs...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <span className="text-xs text-red-500 font-semibold">{error}</span>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Calendar size={32} className="text-slate-300 dark:text-slate-700 mb-2" />
              <span className="text-xs text-slate-400 font-medium">No history points recorded for this product yet.</span>
            </div>
          ) : (
            <div className="w-full h-full min-h-[300px]">
              {activeTab === 'price' && (
                <div className="w-full h-[300px] animate-in fade-in duration-200">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quoted Price History (USD)</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" tickFormatter={(v) => `$${v}`} />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: 'none',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '11px'
                        }}
                        formatter={(value: any, name: any, props: any) => [
                          `$${Number(value).toFixed(2)}`, 
                          `Price (Event: ${props.payload.eventType})`
                        ]}
                      />
                      <Line type="monotone" dataKey="price" stroke="#5c59e9" strokeWidth={2.5} activeDot={{ r: 6 }} dot={{ strokeWidth: 2, r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {activeTab === 'capacity' && (
                <div className="w-full h-[300px] animate-in fade-in duration-200">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Monthly Manufacturing Capacity History</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: 'none',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '11px'
                        }}
                        formatter={(value: any, name: any, props: any) => [
                          props.payload.capacityText,
                          `Capacity (Event: ${props.payload.eventType})`
                        ]}
                      />
                      <Line type="monotone" dataKey="capacity" stroke="#10b981" strokeWidth={2.5} activeDot={{ r: 6 }} dot={{ strokeWidth: 2, r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {activeTab === 'orders' && (
                <div className="w-full h-[300px] animate-in fade-in duration-200">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Historical Order Quantity Placed</span>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.filter(d => d.ordered > 0)} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          border: 'none',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '11px'
                        }}
                        formatter={(value: any) => [`${Number(value).toLocaleString()} units`, 'Quantity Ordered']}
                      />
                      <Bar dataKey="ordered" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {activeTab === 'raw' && (
                <div className="border border-slate-200 dark:border-slate-850 rounded-2xl overflow-hidden animate-in fade-in duration-200">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-950/40 border-b border-slate-150 dark:border-slate-850 text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider">
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5">Price</th>
                        <th className="px-4 py-2.5">Capacity</th>
                        <th className="px-4 py-2.5">Ordered Qty</th>
                        <th className="px-4 py-2.5">Event Type</th>
                        <th className="px-4 py-2.5">User</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-850/80">
                      {chartData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/30">
                          <td className="px-4 py-2.5 font-medium text-slate-500 dark:text-slate-400">{row.dateStr}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-800 dark:text-slate-200">${row.price.toFixed(2)}</td>
                          <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{row.capacityText}</td>
                          <td className="px-4 py-2.5 font-semibold text-purple-600 dark:text-purple-400">{row.ordered > 0 ? `${row.ordered.toLocaleString()} units` : '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-bold text-[9px] text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                              {row.eventType}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-medium text-slate-450">{row.createdBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
