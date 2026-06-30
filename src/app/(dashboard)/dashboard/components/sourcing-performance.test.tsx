import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { SourcingPerformance } from './sourcing-performance'
import { vi, describe, it, expect } from 'vitest'

// Mock recharts because responsive container fails in JSDOM environment
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
  Pie: () => <div data-testid="pie" />,
  Cell: () => null
}))

const mockBids = [
  {
    id: 'bid-1',
    quoted_price: 100,
    lead_time_days: 5,
    is_shortlisted: true,
    created_at: '2026-06-01T00:00:00Z',
    created_by: 'agent1@transformerrobotics.com',
    supplier_name: 'Supplier A',
    supplier_id: 'supplier-a'
  },
  {
    id: 'bid-2',
    quoted_price: 200,
    lead_time_days: 15,
    is_shortlisted: false,
    created_at: '2026-06-02T00:00:00Z',
    created_by: 'agent1@transformerrobotics.com',
    supplier_name: 'Supplier B',
    supplier_id: 'supplier-b'
  },
  {
    id: 'bid-3',
    quoted_price: 300,
    lead_time_days: 10,
    is_shortlisted: true,
    created_at: '2026-06-03T00:00:00Z',
    created_by: null, // System fallback
    supplier_name: 'Supplier C',
    supplier_id: 'supplier-c'
  }
]

const mockMasterSuppliers = [
  {
    id: 'supplier-a',
    name: 'Supplier A',
    created_by: 'agent1@transformerrobotics.com',
    quality_rating: 'A',
    reliability_score: 95,
    created_at: '2026-06-01T00:00:00Z'
  },
  {
    id: 'supplier-b',
    name: 'Supplier B',
    created_by: 'agent2@transformerrobotics.com',
    quality_rating: 'B',
    reliability_score: 85,
    created_at: '2026-06-02T00:00:00Z'
  }
]

describe('SourcingPerformance Component', () => {
  it('renders correct summary KPIs', () => {
    render(<SourcingPerformance bids={mockBids} masterSuppliers={mockMasterSuppliers} />)

    // Check if KPIs are calculated correctly
    // Total agents = 2 (agent1 and agent2. 'system' is excluded from active agents count if totalSourcingBids is computed)
    expect(screen.getByText('Active Sourcing Agents')).toBeInTheDocument()
    
    // Overall shortlist rate = 2/3 shortlisted = 66.7%
    expect(screen.getByText('66.7%')).toBeInTheDocument()
  })

  it('renders agent table records correctly', () => {
    render(<SourcingPerformance bids={mockBids} masterSuppliers={mockMasterSuppliers} />)

    // Check agent names display
    expect(screen.getAllByText('agent1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('agent2').length).toBeGreaterThan(0)
    expect(screen.getAllByText('system').length).toBeGreaterThan(0)

    // Agent 1: Sourced = 1, Bids = 2, Shortlisted = 1, Conversion = 50%
    expect(screen.getByText('50.0%')).toBeInTheDocument()
  })

  it('filters agent list based on search term', () => {
    render(<SourcingPerformance bids={mockBids} masterSuppliers={mockMasterSuppliers} />)

    const searchInput = screen.getByPlaceholderText('Search agents...')
    fireEvent.change(searchInput, { target: { value: 'agent2' } })

    // Agent 2 should be shown
    expect(screen.getAllByText('agent2').length).toBeGreaterThan(0)
    // Agent 1 email should not be in the document (filtered out of the table)
    expect(screen.queryByText('agent1@transformerrobotics.com')).not.toBeInTheDocument()
  })

  it('handles empty lists gracefully', () => {
    render(<SourcingPerformance bids={[]} masterSuppliers={[]} />)

    // Should display empty agent count
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('No agents matching filter found.')).toBeInTheDocument()
  })
})
