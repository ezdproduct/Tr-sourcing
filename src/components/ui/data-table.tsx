import React from 'react'

interface DataTableProps<T> {
  headers: React.ReactNode[]
  items: T[]
  renderRow: (item: T, index: number) => React.ReactNode
  emptyMessage?: string
}

export function DataTable<T>({
  headers,
  items,
  renderRow,
  emptyMessage = 'No records found.'
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
            {headers.map((header, idx) => (
              <th key={idx} className="px-6 py-4">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {items.length === 0 ? (
            <tr>
              <td colSpan={headers.length} className="px-6 py-8 text-center text-slate-400">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            items.map((item, idx) => renderRow(item, idx))
          )}
        </tbody>
      </table>
    </div>
  )
}
