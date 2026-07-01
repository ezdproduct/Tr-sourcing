'use client'

import React, { useState } from 'react'
import { Search, Globe, FileText, ChevronRight } from 'lucide-react'
import { DatabaseOrder } from '../types'
import { getOrderTypeFromItems } from '../sourcing-client'

interface OrderSidebarProps {
  orders: DatabaseOrder[]
  viewMode: 'order' | 'all'
  selectedOrderId: string | null
  setViewMode: (mode: 'order' | 'all') => void
  setSelectedOrderId: (id: string | null) => void
  allSuppliersCount: number
}

export function OrderSidebar({
  orders,
  viewMode,
  selectedOrderId,
  setViewMode,
  setSelectedOrderId,
  allSuppliersCount
}: OrderSidebarProps) {
  const [sidebarOrderSearch, setSidebarOrderSearch] = useState('')

  // Filter orders by search query (for sidebar)
  const filteredOrders = orders.filter(o => {
    const type = getOrderTypeFromItems(o.order_items)
    return (
      o.order_code.toLowerCase().includes(sidebarOrderSearch.toLowerCase()) ||
      type.toLowerCase().includes(sidebarOrderSearch.toLowerCase()) ||
      (o.order_items && o.order_items.some(item =>
        item.item_name.toLowerCase().includes(sidebarOrderSearch.toLowerCase())
      ))
    )
  })

  return (
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
        {/* All Suppliers button */}
        <div className="border-b border-slate-100 dark:border-slate-800/80">
          <button
            id="btn-all-suppliers"
            onClick={() => {
              setSelectedOrderId(null)
              setViewMode('all')
            }}
            className={`w-full text-left px-2.5 py-3 flex items-center justify-between gap-1 transition-colors cursor-pointer ${
              viewMode === 'all'
                ? 'bg-indigo-50 dark:bg-indigo-950/30'
                : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Globe size={13} className={viewMode === 'all' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
              <span className={`text-xs font-bold ${viewMode === 'all' ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                All Suppliers
              </span>
            </div>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
              viewMode === 'all'
                ? 'bg-indigo-200/50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              {allSuppliersCount}
            </span>
          </button>
        </div>

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
                      setViewMode('all')
                    } else {
                      setSelectedOrderId(order.id)
                      setViewMode('order')
                    }
                  }}
                  className={`w-full text-left px-2.5 py-3 flex items-center justify-between gap-1 transition-colors cursor-pointer ${
                    viewMode === 'order' && selectedOrderId === order.id
                      ? 'bg-indigo-50 dark:bg-indigo-950/30'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-900/20'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText size={13} className={viewMode === 'order' && selectedOrderId === order.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'} />
                    <span className={`text-xs font-bold truncate ${
                      viewMode === 'order' && selectedOrderId === order.id
                        ? 'text-indigo-700 dark:text-indigo-400'
                        : 'text-slate-800 dark:text-slate-200'
                    }`}>
                      {order.order_code}
                    </span>
                    {(() => {
                      const timelines = order.order_stage_timelines
                      if (!timelines) return null
                      const stages = ['Sourcing', 'Create PO']
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
                  <ChevronRight size={12} className={viewMode === 'order' && selectedOrderId === order.id ? 'text-indigo-500' : 'text-slate-300'} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
