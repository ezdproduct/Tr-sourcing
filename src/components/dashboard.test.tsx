import { render, screen, fireEvent, waitFor } from '@/test/test-utils'
import { SourcingDashboard } from './dashboard'
import { vi } from 'vitest'

// Mock the Supabase client
vi.mock('@/supabase/client', () => {
  return {
    createClient: () => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { email: 'admin@sourcing.com' } } }),
        signOut: vi.fn().mockResolvedValue({}),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ data: [], error: null }),
        update: vi.fn().mockResolvedValue({ data: [], error: null }),
        delete: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  }
})

describe('<SourcingDashboard />', () => {
  it('renders the dashboard with overview cards and default admin role', async () => {
    render(<SourcingDashboard />)
    
    // Check if key layout elements render
    expect(screen.getByText('Tr-Sourcing Pro')).toBeInTheDocument()
    expect(screen.getByText('Total RFQ Campaigns')).toBeInTheDocument()
    expect(screen.getByText('Total Received Bids')).toBeInTheDocument()
    
    // Check that Role Switcher shows Admin by default
    const roleSelect = screen.getByTitle('Change role (testing)')
    expect(roleSelect).toBeInTheDocument()
    expect((roleSelect as HTMLSelectElement).value).toBe('admin')
  })

  it('allows changing the role to boss and updates UI accordingly', async () => {
    render(<SourcingDashboard />)
    
    const roleSelect = screen.getByTitle('Change role (testing)')
    fireEvent.change(roleSelect, { target: { value: 'boss' } })
    
    expect((roleSelect as HTMLSelectElement).value).toBe('boss')
    
    // In Boss mode: Boss can create RFQs, so Create RFQ button should show
    await waitFor(() => {
      expect(screen.getByText('Create RFQ')).toBeInTheDocument()
    })
  })

  it('allows changing the role to staff and updates UI accordingly', async () => {
    render(<SourcingDashboard />)
    
    const roleSelect = screen.getByTitle('Change role (testing)')
    fireEvent.change(roleSelect, { target: { value: 'staff' } })
    
    expect((roleSelect as HTMLSelectElement).value).toBe('staff')
    
    // In Staff mode, System Settings menu item should be hidden (not rendered)
    expect(screen.queryByText('System Settings')).not.toBeInTheDocument()
    
    // In Staff mode, Create RFQ button should be hidden (not rendered)
    expect(screen.queryByText('Create RFQ')).not.toBeInTheDocument()
  })
})
