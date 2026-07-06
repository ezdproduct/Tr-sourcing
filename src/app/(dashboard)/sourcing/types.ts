// ─── Sourcing Module Types ─────────────────────────────────────────────────────

export interface DatabaseOrderItem {
  id: string
  item_name: string
  quantity: number
  item_type?: string
}

export interface DatabaseOrder {
  id: string
  order_code: string
  order_type: 'MATERIAL' | 'PRODUCT' | 'PENDING' | string
  stage: string
  order_date: string
  estimated_delivery_date: string | null
  order_items?: DatabaseOrderItem[]
  order_stage_timelines?: any[]
  deposit_email_sent?: boolean
  deposit_email_sent_at?: string | null
  shipment_reminder_sent?: boolean
}

export interface DatabaseSupplier {
  id: string
  order_id: string | null
  order_item_id: string | null
  supplier_name: string
  quoted_price: number
  lead_time_days: string | number
  is_shortlisted: boolean
  created_at: string
  created_by?: string | null
  supplier_id?: string | null
  is_bid?: boolean
  material_cost_percent?: number | null
  labor_cost_percent?: number | null
  overhead_cost_percent?: number | null
  profit_margin_percent?: number | null
  // Joined from orders table
  orders?: { order_code: string } | null
  order_items?: { item_name: string } | null
  suppliers?: {
    id?: string
    email: string | null
    phone: string | null
    address: string | null
    website?: string | null
    contact_person?: string | null
    tax_id?: string | null
    business_type?: string | null
    certifications?: string[] | null
    supplier_capabilities?: any[]
    main_products?: string[]
    created_by?: string | null
    [key: string]: any
  } | null
}

// Derived unique supplier profile (flattened from DatabaseSupplier.suppliers)
export interface UniqueSupplier {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  website?: string | null
  contact_person?: string | null
  tax_id?: string | null
  business_type?: string | null
  main_products?: string[]
  bidsCount: number
  auditsCount: number
  created_by?: string | null
  supplier_capabilities: any[]
  rawRecord: DatabaseSupplier
}

export type ViewMode = 'order' | 'all'
