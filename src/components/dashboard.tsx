'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/supabase/client'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Search,
  Plus,
  Database,
  Info,
  Package,
  DollarSign,
  Users,
  Clock,
  ClipboardList,
  CheckCircle2,
  RefreshCw,
  ChevronRight,
  FileText,
} from 'lucide-react'

// Define interfaces
interface SourcingItem {
  id: string
  title: string
  category: string
  quantity: number
  targetPrice: number
  status: 'draft' | 'reviewing' | 'sent' | 'completed'
  suppliersCount: number
  dateCreated: string
}

interface DBNote {
  id: number
  title: string
}

export function SourcingDashboard() {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [isDbLoading, setIsDbLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)

  // Real DB Data (Notes)
  const [dbNotes, setDbNotes] = useState<DBNote[]>([])
  const [newNoteTitle, setNewNoteTitle] = useState('')

  // Sourcing Items (Stateful Mock Data)
  const [sourcingItems, setSourcingItems] = useState<SourcingItem[]>([
    {
      id: 'src-001',
      title: 'Premium Oak Dining Tables (Set of 4)',
      category: 'Furniture',
      quantity: 120,
      targetPrice: 240,
      status: 'sent',
      suppliersCount: 8,
      dateCreated: '2026-06-20',
    },
    {
      id: 'src-002',
      title: 'Modular Velvet Sectional Sofas',
      category: 'Furniture',
      quantity: 45,
      targetPrice: 850,
      status: 'reviewing',
      suppliersCount: 4,
      dateCreated: '2026-06-21',
    },
    {
      id: 'src-003',
      title: 'Ergonomic Mesh Office Chairs',
      category: 'Office',
      quantity: 350,
      targetPrice: 75,
      status: 'completed',
      suppliersCount: 12,
      dateCreated: '2026-06-18',
    },
    {
      id: 'src-004',
      title: 'Outdoor Teak Sun loungers',
      category: 'Garden',
      quantity: 80,
      targetPrice: 160,
      status: 'draft',
      suppliersCount: 0,
      dateCreated: '2026-06-23',
    },
    {
      id: 'src-005',
      title: 'Smart LED Standing Desk Lamps',
      category: 'Lighting',
      quantity: 500,
      targetPrice: 22,
      status: 'sent',
      suppliersCount: 6,
      dateCreated: '2026-06-22',
    },
  ])

  // New Sourcing Item Form State
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newQuantity, setNewQuantity] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  // Fetch real data from Supabase
  const fetchDbNotes = async () => {
    setIsDbLoading(true)
    setDbError(null)
    const supabase = createClient()
    try {
      const { data, error } = await supabase.from('notes').select('*')
      if (error) {
        setDbError(error.message)
      } else {
        setDbNotes(data || [])
      }
    } catch (err: any) {
      setDbError(err.message || 'An error occurred connecting to Supabase.')
    } finally {
      setIsDbLoading(false)
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDbNotes()
  }, [])

  // Add new note to Supabase
  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newNoteTitle.trim()) return

    setIsLoading(true)
    const supabase = createClient()
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert([{ title: newNoteTitle }])
        .select()

      if (error) {
        setDbError(error.message)
      } else {
        setNewNoteTitle('')
        if (data) {
          setDbNotes((prev) => [...prev, ...data])
        } else {
          // If inserting works but doesn't return data (due to policy), refetch
          fetchDbNotes()
        }
      }
    } catch (err: any) {
      setDbError(err.message || 'Error inserting note.')
    } finally {
      setIsLoading(false)
    }
  }

  // Add new Sourcing Item
  const handleAddSourcingItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    const newItem: SourcingItem = {
      id: `src-${Math.floor(100 + Math.random() * 900)}`,
      title: newTitle,
      category: newCategory || 'General',
      quantity: Number(newQuantity) || 1,
      targetPrice: Number(newPrice) || 0,
      status: 'draft',
      suppliersCount: 0,
      dateCreated: new Date().toISOString().split('T')[0],
    }

    setSourcingItems((prev) => [newItem, ...prev])
    setNewTitle('')
    setNewCategory('')
    setNewQuantity('')
    setNewPrice('')
    setShowAddForm(false)
  }

  // Filter items
  const filteredItems = sourcingItems.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Summary Metrics
  const totalValue = sourcingItems.reduce(
    (acc, curr) => acc + curr.quantity * curr.targetPrice,
    0,
  )
  const activeSourcingCount = sourcingItems.filter(
    (item) => item.status !== 'completed' && item.status !== 'draft',
  ).length
  const totalItemsCount = sourcingItems.length

  const getStatusBadge = (status: SourcingItem['status']) => {
    const styles = {
      draft: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300',
      reviewing:
        'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      sent: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
      completed:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    }
    const label = {
      draft: 'Draft',
      reviewing: 'Reviewing',
      sent: 'Sent to Suppliers',
      completed: 'Completed',
    }
    return (
      <Badge
        className={`${styles[status]} border-0 font-medium hover:${styles[status]}`}
      >
        {label[status]}
      </Badge>
    )
  }

  const sqlSnippet = `CREATE TABLE public.notes (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access" ON public.notes FOR SELECT USING (true);

-- Allow public insert access for demo purposes
CREATE POLICY "Allow public insert" ON public.notes FOR INSERT WITH CHECK (true);`

  return (
    <div className="w-full space-y-8 pb-12">
      {/* Dashboard Top Header */}
      <div className="flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-center">
        <div>
          <h1 className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent">
            Tr-Sourcing Management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Monitor and manage product procurement, RFQs, and supplier
            interactions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Plus size={16} /> Create Request
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-600 dark:bg-emerald-500/20">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">
                Sourcing Items
              </p>
              <h3 className="mt-0.5 text-2xl font-bold">{totalItemsCount}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-2xl bg-blue-500/10 p-3 text-blue-600 dark:bg-blue-500/20">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">
                Active RFQs
              </p>
              <h3 className="mt-0.5 text-2xl font-bold">
                {activeSourcingCount}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-600 dark:bg-amber-500/20">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">
                Est. Target Value
              </p>
              <h3 className="mt-0.5 text-2xl font-bold">
                ${totalValue.toLocaleString()}
              </h3>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-2xl bg-teal-500/10 p-3 text-teal-600 dark:bg-teal-500/20">
              <Users className="h-6 w-6" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">
                Suppliers Connected
              </p>
              <h3 className="mt-0.5 text-2xl font-bold">
                {sourcingItems.reduce(
                  (acc, curr) => acc + curr.suppliersCount,
                  0,
                )}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Data & Side Actions */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Columns (Sourcing Items) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Add Sourcing Item Modal Form inline */}
          {showAddForm && (
            <Card className="animate-in fade-in slide-in-from-top-4 border-emerald-500/30 bg-emerald-500/5 duration-350">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package size={18} className="text-emerald-600" /> New
                  Sourcing Requirement
                </CardTitle>
                <CardDescription>
                  Specify the details of the product you want to source.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddSourcingItem} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="title">Product Name</Label>
                      <Input
                        id="title"
                        required
                        placeholder="e.g. Ceramic Floor Tiles"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <Input
                        id="category"
                        placeholder="e.g. Building Materials"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="quantity">Quantity Required</Label>
                      <Input
                        id="quantity"
                        type="number"
                        placeholder="e.g. 100"
                        value={newQuantity}
                        onChange={(e) => setNewQuantity(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="price">Target Price per Unit ($)</Label>
                      <Input
                        id="price"
                        type="number"
                        placeholder="e.g. 45"
                        value={newPrice}
                        onChange={(e) => setNewPrice(e.target.value)}
                        className="bg-background"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setShowAddForm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      Create Draft Request
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Sourcing List Card */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <CardTitle className="text-xl">
                    Sourcing & Procurements
                  </CardTitle>
                  <CardDescription>
                    Track all sourcing items and Request for Quotations (RFQs).
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
                    <Input
                      placeholder="Search items..."
                      className="bg-background h-9 w-[180px] pl-8 text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <option value="all">All Status</option>
                    <option value="draft">Draft</option>
                    <option value="reviewing">Reviewing</option>
                    <option value="sent">Sent</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredItems.length === 0 ? (
                <div className="py-12 text-center">
                  <Package className="text-muted-foreground/50 mx-auto h-12 w-12" />
                  <h3 className="mt-4 text-lg font-semibold">
                    No requests found
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm">
                    No sourcing requests matches your search filter.
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredItems.map((item) => (
                    <div
                      key={item.id}
                      className="hover:bg-muted/30 flex flex-col justify-between gap-4 rounded-lg px-2 py-4 transition first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-xs font-bold">
                            {item.id}
                          </span>
                          <h4 className="text-foreground text-sm font-semibold">
                            {item.title}
                          </h4>
                        </div>
                        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <span>
                            Category:{' '}
                            <strong className="text-foreground/80">
                              {item.category}
                            </strong>
                          </span>
                          <span>
                            Quantity:{' '}
                            <strong className="text-foreground/80">
                              {item.quantity}
                            </strong>
                          </span>
                          <span>
                            Target Unit Price:{' '}
                            <strong className="text-foreground/80">
                              ${item.targetPrice}
                            </strong>
                          </span>
                          <span>
                            Total Target:{' '}
                            <strong className="text-foreground/80">
                              $
                              {(
                                item.quantity * item.targetPrice
                              ).toLocaleString()}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 self-end sm:self-center">
                        <div className="flex flex-col items-end gap-1.5">
                          {getStatusBadge(item.status)}
                          <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
                            <Users size={10} /> {item.suppliersCount} suppliers
                            contacted
                          </span>
                        </div>
                        <ChevronRight className="text-muted-foreground/50 hidden h-5 w-5 sm:block" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Supabase Connection & Live DB Data */}
        <div className="space-y-6">
          {/* Supabase Synchronization Panel */}
          <Card className="border-teal-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Database className="h-5 w-5 text-teal-500" /> Supabase
                Connection
              </CardTitle>
              <CardDescription>
                Live data synced with table{' '}
                <code className="bg-muted rounded px-1 py-0.5 text-[11px]">
                  public.notes
                </code>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Database Error / Warning Block */}
              {dbError && (
                <div className="bg-destructive/10 text-destructive space-y-2 rounded-lg p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Table &quot;notes&quot; not initialized yet
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed">
                        To fetch and save real-time data, execute the SQL below
                        in your Supabase SQL editor. We are currently showing
                        local mock states.
                      </p>
                    </div>
                  </div>
                  <details className="border-destructive/20 mt-2 cursor-pointer border-t pt-2">
                    <summary className="font-medium outline-none">
                      Show SQL schema script
                    </summary>
                    <pre className="text-foreground mt-2 max-h-40 overflow-auto rounded bg-black/10 p-2 font-mono text-[10px] selection:bg-teal-500/30 dark:bg-black/40">
                      {sqlSnippet}
                    </pre>
                  </details>
                </div>
              )}

              {/* Form to insert new DB Data */}
              <form onSubmit={handleAddNote} className="space-y-2">
                <Label htmlFor="db-note" className="text-xs">
                  Add Database Note
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="db-note"
                    placeholder="Enter notes title..."
                    className="h-9 text-xs"
                    value={newNoteTitle}
                    onChange={(e) => setNewNoteTitle(e.target.value)}
                  />
                  <Button
                    type="submit"
                    disabled={isLoading || isDbLoading}
                    size="sm"
                    className="h-9 bg-teal-600 text-white hover:bg-teal-700"
                  >
                    {isLoading ? 'Saving...' : 'Add'}
                  </Button>
                </div>
              </form>

              {/* DB Notes List */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-muted-foreground flex items-center gap-1 text-xs font-semibold tracking-wider uppercase">
                    <FileText size={12} /> Notes Database ({dbNotes.length})
                  </h4>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={fetchDbNotes}
                    disabled={isDbLoading}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isDbLoading ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </div>

                {isDbLoading ? (
                  <div className="text-muted-foreground py-4 text-center text-xs">
                    Loading database notes...
                  </div>
                ) : dbError ? (
                  <div className="text-muted-foreground/70 py-4 text-center text-xs italic">
                    Using mock data fallback (Notes DB offline).
                  </div>
                ) : dbNotes.length === 0 ? (
                  <div className="text-muted-foreground py-4 text-center text-xs">
                    No notes in database yet. Add one above!
                  </div>
                ) : (
                  <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1 font-sans text-xs">
                    {dbNotes.map((note) => (
                      <div
                        key={note.id}
                        className="bg-card hover:bg-accent/40 group flex items-center justify-between rounded-lg border p-2.5 transition duration-150"
                      >
                        <span className="truncate pr-2 font-medium">
                          {note.title}
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[9px] opacity-60"
                        >
                          ID: {note.id}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
