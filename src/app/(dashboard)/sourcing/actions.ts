'use server'

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { Resend } from 'resend'
import { generateToken } from '@/app/api/orders/update-progress/route'
export type OrderType = 'MATERIAL' | 'PRODUCT'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'
import { recordSupplierProductHistory } from '../management/actions'
import type { DatabaseOrder, DatabaseSupplier } from './types'

// ─── Read Actions (used as TanStack Query queryFn) ────────────────────────────

export async function fetchSuppliersAction(): Promise<DatabaseSupplier[]> {
  const supabase = await createClient()
  const { data: dbSuppliers, error } = await supabase
    .from('suppliers')
    .select('*, order_suppliers(*, orders(order_code), order_items(item_name)), supplier_capabilities(*)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const transformed: DatabaseSupplier[] = []
  if (dbSuppliers) {
    dbSuppliers.forEach((s: any) => {
      const validBids = s.order_suppliers || []
      if (validBids.length === 0) {
        transformed.push({
          id: s.id,
          supplier_id: s.id,
          order_id: null,
          order_item_id: null,
          supplier_name: s.name,
          quoted_price: 0,
          lead_time_days: 0,
          is_shortlisted: false,
          is_bid: false,
          created_at: s.created_at,
          created_by: s.created_by,
          orders: null,
          order_items: null,
          suppliers: { ...s, order_suppliers: undefined },
        })
      } else {
        validBids.forEach((bid: any) => {
          transformed.push({
            id: bid.id,
            supplier_id: s.id,
            order_id: bid.order_id,
            order_item_id: bid.order_item_id,
            supplier_name: s.name,
            quoted_price: bid.quoted_price,
            lead_time_days: bid.lead_time_days,
            is_shortlisted: bid.is_shortlisted,
            is_bid: true,
            created_at: bid.created_at,
            created_by: bid.created_by || s.created_by,
            orders: bid.orders,
            order_items: bid.order_items,
            suppliers: { ...s, order_suppliers: undefined },
          })
        })
      }
    })
  }
  return transformed
}

export async function fetchOrdersAction(): Promise<DatabaseOrder[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), order_stage_timelines(*)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as DatabaseOrder[]) || []
}

export async function fetchAuditsAction(): Promise<any[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('factory_audits').select('*')
  if (error) throw new Error(error.message)
  return data || []
}

export interface AddSupplierInput {
  orderId: string | null
  orderItemId: string | null
  supplierName: string
  quotedPrice: number
  leadTimeDays: number
}

export async function addSupplierAction(input: AddSupplierInput) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || null

    const { data, error } = await supabase
      .from('order_suppliers')
      .insert({
        order_id: input.orderId,
        order_item_id: input.orderItemId,
        supplier_name: input.supplierName,
        quoted_price: input.quotedPrice,
        lead_time_days: input.leadTimeDays,
        is_shortlisted: false,
        created_by: userEmail
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding supplier:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true, supplier: data }
  } catch (error: any) {
    console.error('Uncaught error adding supplier:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function updateShortlistAction(supplierId: string, isShortlisted: boolean) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('order_suppliers')
      .update({ is_shortlisted: isShortlisted })
      .eq('id', supplierId)

    if (error) {
      console.error('Error updating shortlist:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error updating shortlist:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function updateShortlistBatchAction(supplierIds: string[], isShortlisted: boolean) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('order_suppliers')
      .update({ is_shortlisted: isShortlisted })
      .in('id', supplierIds)

    if (error) {
      console.error('Error updating batch shortlist:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error updating batch shortlist:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function deleteSupplierAction(id: string, deleteProfile: boolean = false) {
  try {
    const supabase = await createClient()

    if (deleteProfile) {
      // 1. Delete the master supplier profile from suppliers table (will cascade delete order_suppliers bids)
      const { error: deleteError } = await supabase
        .from('suppliers')
        .delete()
        .eq('id', id)

      if (deleteError) {
        console.error('Error deleting supplier profile:', deleteError.message)
        return { success: false, error: deleteError.message }
      }
    } else {
      // 2. Delete only the bid from order_suppliers table
      const { error: deleteError } = await supabase
        .from('order_suppliers')
        .delete()
        .eq('id', id)

      if (deleteError) {
        console.error('Error deleting supplier bid:', deleteError.message)
        return { success: false, error: deleteError.message }
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error deleting supplier:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function classifyOrderAction(orderId: string, orderType: OrderType) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('orders')
      .update({
        order_type: orderType,
        stage: 'Sourcing'
      })
      .eq('id', orderId)

    if (error) {
      console.error('Error classifying order:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error classifying order:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function classifyOrderItemAction(orderItemId: string, itemType: string) {
  try {
    const supabase = await createClient()

    // 1. Update the order item's classification
    const { data: updatedItem, error: updateError } = await supabase
      .from('order_items')
      .update({ item_type: itemType })
      .eq('id', orderItemId)
      .select('order_id')
      .single()

    if (updateError) {
      console.error('Error classifying order item:', updateError.message)
      return { success: false, error: updateError.message }
    }

    if (updatedItem && updatedItem.order_id) {
      const orderId = updatedItem.order_id
      
      // 2. Fetch current order stage
      const { data: order, error: fetchError } = await supabase
        .from('orders')
        .select('stage')
        .eq('id', orderId)
        .single()

      if (!fetchError && order) {
        const stage = order.stage
        if (stage === 'Order' || stage === 'Order Intake' || stage === 'Pending Classification' || !stage) {
          // Update order stage to Sourcing
          await supabase
            .from('orders')
            .update({ stage: 'Sourcing' })
            .eq('id', orderId)
        }
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error classifying order item:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export interface BatchClassificationItem {
  id: string
  itemType: string
}

export async function classifyOrderItemsBatchAction(items: BatchClassificationItem[], orderId: string) {
  try {
    const supabase = await createClient()

    // 1. Map to DB expected JSON format (array of { id, item_type })
    const formattedItems = items.map(item => ({
      id: item.id,
      item_type: item.itemType
    }))

    // 2. Call Supabase RPC function for dynamic batch update
    const { error } = await supabase.rpc('classify_order_items', {
      p_items: formattedItems
    })

    if (error) {
      console.error('Error in classify_order_items RPC:', error.message)
      return { success: false, error: error.message }
    }

    // 3. Update parent order stage and order_type based on items
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('stage')
      .eq('id', orderId)
      .single()

    if (!fetchError && order) {
      const stage = order.stage
      const updateData: any = {}
      
      if (stage === 'Order' || stage === 'Order Intake' || stage === 'Pending Classification' || !stage) {
        updateData.stage = 'Sourcing'
      }

      // Query the item types for this order to determine parent order_type
      const { data: updatedItems } = await supabase
        .from('order_items')
        .select('item_type')
        .eq('order_id', orderId)

      if (updatedItems && updatedItems.length > 0) {
        const hasMaterial = updatedItems.some((item: any) => item.item_type === 'MATERIAL')
        const hasProduct = updatedItems.some((item: any) => item.item_type === 'PRODUCT')
        updateData.order_type = (hasMaterial && hasProduct) ? 'MIXED' : hasMaterial ? 'MATERIAL' : 'PRODUCT'
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('orders')
          .update(updateData)
          .eq('id', orderId)
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error in classifyOrderItemsBatchAction:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

// ─── Normalization & Bulk Import Actions ─────────────────────────────────────

export interface BulkSupplierRow {
  supplierName: string
  email: string
  phone: string
  address: string
  orderCode?: string
  productName: string
  quotedPrice: number
  leadTime: number
  website?: string
  contactPerson?: string
  taxId?: string
  businessType?: string
}

function normalizeEmail(email: string | null | undefined): string {
  return email ? email.trim().toLowerCase() : ''
}

function normalizeOrderCode(code: string | null | undefined): string {
  if (!code) return ''
  const c = code.trim().toLowerCase()
  if (c === '—' || c === '-' || c === 'unassigned' || c === 'potential') return ''
  return c
}

function normalizeProductName(name: string | null | undefined): string {
  return name ? name.trim().toLowerCase() : ''
}

export interface DuplicateRecord {
  id: string
  supplierName: string
  email: string
  orderCode: string
  productName: string
  quotedPrice: number
  leadTime: number
  incomingIndex: number
}

async function detectDuplicates(
  supabase: any,
  incomingRows: { email: string; orderCode: string; productName: string }[]
): Promise<DuplicateRecord[]> {
  const { data: existingBids, error } = await supabase
    .from('order_suppliers')
    .select(`
      id,
      supplier_name,
      quoted_price,
      lead_time_days,
      suppliers(email),
      orders(order_code),
      order_items(item_name)
    `)

  if (error || !existingBids) {
    console.error('Error fetching bids for duplicate check:', error?.message)
    return []
  }

  const duplicates: DuplicateRecord[] = []

  incomingRows.forEach((incoming, idx) => {
    const incEmail = normalizeEmail(incoming.email)
    const incOrderCode = normalizeOrderCode(incoming.orderCode)
    const incProductName = normalizeProductName(incoming.productName)

    if (!incEmail || !incProductName) return

    const match = existingBids.find((existing: any) => {
      const extEmail = normalizeEmail(existing.suppliers?.email)
      const extOrderCode = normalizeOrderCode(existing.orders?.order_code)
      const extProductName = normalizeProductName(existing.order_items?.item_name)

      return extEmail === incEmail && extOrderCode === incOrderCode && extProductName === incProductName
    })

    if (match) {
      duplicates.push({
        id: match.id,
        supplierName: match.supplier_name,
        email: match.suppliers?.email || '',
        orderCode: match.orders?.order_code || '',
        productName: match.order_items?.item_name || '',
        quotedPrice: match.quoted_price,
        leadTime: match.lead_time_days,
        incomingIndex: idx
      })
    }
  })

  return duplicates
}

export async function bulkImportSuppliersAction(
  rows: BulkSupplierRow[], 
  resolution?: 'skip' | 'overwrite' | null,
  isProfilesTab?: boolean
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || null

    const incomingRows = rows.map(r => ({
      email: r.email,
      orderCode: r.orderCode || '',
      productName: r.productName || ''
    }))

    const duplicates = isProfilesTab ? [] : await detectDuplicates(supabase, incomingRows)

    if (resolution === undefined || resolution === null) {
      if (!isProfilesTab && duplicates.length > 0) {
        return {
          success: false,
          duplicateDetected: true,
          duplicates
        }
      }
    }

    let rowsToProcess = rows

    if (resolution === 'skip') {
      const duplicateIndices = new Set(duplicates.map(d => d.incomingIndex))
      rowsToProcess = rows.filter((_, idx) => !duplicateIndices.has(idx))
    } else if (resolution === 'overwrite') {
      const duplicateMap = new Map<number, DuplicateRecord>()
      duplicates.forEach(d => {
        duplicateMap.set(d.incomingIndex, d)
      })

      // Overwrite the duplicates
      for (const [incomingIndex, dup] of duplicateMap.entries()) {
        const row = rows[incomingIndex]
        const { error: updateErr } = await supabase
          .from('order_suppliers')
          .update({
            quoted_price: row.quotedPrice,
            lead_time_days: row.leadTime
          })
          .eq('id', dup.id)
        if (updateErr) {
          console.error(`Error overwriting duplicate for ${row.supplierName}:`, updateErr.message)
        }
      }

      // Filter out overwritten rows so they are not inserted
      const duplicateIndices = new Set(duplicates.map(d => d.incomingIndex))
      rowsToProcess = rows.filter((_, idx) => !duplicateIndices.has(idx))
    }

    let importedSuppliersCount = 0
    let importedBidsCount = 0
    let importedCapabilitiesCount = 0

    // Cache supplier IDs by name in this batch to prevent duplicate checks
    const supplierCache: Record<string, string> = {}

    for (const row of rowsToProcess) {
      if (!row.supplierName) continue

      let supplierId = supplierCache[row.supplierName]

      if (!supplierId) {
        // Find existing supplier by name
        const { data: existingSupplier } = await supabase
          .from('suppliers')
          .select('id')
          .eq('name', row.supplierName.trim())
          .maybeSingle()

        if (existingSupplier) {
          supplierId = existingSupplier.id
          supplierCache[row.supplierName] = supplierId
        } else {
          // If we are not in the profiles tab, creating new supplier profiles is forbidden!
          if (!isProfilesTab) {
            console.warn(`Bulk import: supplier '${row.supplierName}' does not exist. Skipping row.`)
            continue // Skip this row entirely
          }

          // Otherwise, in the profiles tab, we can create the supplier
          const { data: supplier, error: supplierError } = await supabase
            .from('suppliers')
            .upsert({
              name: row.supplierName.trim(),
              email: row.email ? row.email.trim() : null,
              phone: row.phone ? row.phone.trim() : null,
              address: row.address ? row.address.trim() : null,
              website: row.website ? row.website.trim() : null,
              contact_person: row.contactPerson ? row.contactPerson.trim() : null,
              tax_id: row.taxId ? row.taxId.trim() : null,
              business_type: row.businessType ? row.businessType.trim() : null,
              main_products: row.productName ? row.productName.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean) : [],
              created_by: userEmail
            }, { onConflict: 'name' })
            .select('id')
            .single()

          if (supplierError) {
            console.error(`Error upserting supplier ${row.supplierName}:`, supplierError.message)
            continue
          }

          supplierId = supplier.id
          supplierCache[row.supplierName] = supplierId
          importedSuppliersCount++
        }
      }

      if (isProfilesTab) {
        if (row.productName && row.productName.trim()) {
          const { error: capError } = await supabase
            .from('supplier_capabilities')
            .insert({
              supplier_id: supplierId,
              product_name: row.productName.trim(),
              target_price: row.quotedPrice || 0
            })

          if (!capError) {
            importedCapabilitiesCount++
            await recordSupplierProductHistory(
              supabase,
              supplierId,
              row.productName.trim(),
              row.quotedPrice || 0,
              null,
              0,
              'IMPORT',
              userEmail
            )
          } else {
            console.error('Error inserting supplier capability:', capError.message)
          }
        }
        continue
      }

      let orderMatched = false
      const hasOrderCode = row.orderCode && row.orderCode.trim() && row.orderCode.trim() !== '-'

      let matchedOrder: { id: string; order_items: any[]; isNew?: boolean } | null = null

      if (hasOrderCode) {
        const targetOrderCode = row.orderCode!.trim()

        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('id, order_items(id, item_name)')
          .eq('order_code', targetOrderCode)

        if (!orderError && order && order.length > 0) {
          matchedOrder = order[0] as any
        } else {
          // BUG 8 FIX: do NOT auto-create phantom orders when the code isn't found.
          // A typo in the CSV would silently create garbage orders. Instead, skip
          // the order-binding step — the row will fall through to "unassigned".
          console.warn(
            `Bulk import: order_code '${targetOrderCode}' not found in database. Row for supplier '${row.supplierName}' will be saved as unassigned.`
          )
        }
      }

      let matchItem: any = null
      if (matchedOrder) {
        matchItem = matchedOrder.order_items?.find(
          (item: any) => item.item_name.toLowerCase().trim() === row.productName.toLowerCase().trim()
        )

        // If the item doesn't exist in the order, but the order is newly created in this import,
        // it's safe to auto-create it under the new order.
        // Otherwise, if the order already existed, we DO NOT create the item under it,
        // and we will leave matchItem as null so it gets diverted to unassigned.
        if (!matchItem && matchedOrder.isNew && row.productName && row.productName.trim()) {
          const { data: newOrderItem, error: newOrderItemErr } = await supabase
            .from('order_items')
            .insert({
              order_id: matchedOrder.id,
              item_name: row.productName.trim(),
              quantity: 100, // default placeholder quantity
              item_type: 'PRODUCT',
              item_status: 'PENDING'
            })
            .select('id, item_name')
            .single()

          if (!newOrderItemErr && newOrderItem) {
            matchItem = newOrderItem
          } else {
            console.error('Error auto-creating order item during import:', newOrderItemErr?.message)
          }
        }
      }

      // If we matched the order AND a required item in that order, bind it!
      if (matchedOrder && matchItem) {
        const { error: bidError } = await supabase
          .from('order_suppliers')
          .insert({
            order_id: matchedOrder.id,
            order_item_id: matchItem.id,
            supplier_id: supplierId,
            supplier_name: row.supplierName.trim(),
            quoted_price: row.quotedPrice,
            lead_time_days: row.leadTime,
            is_shortlisted: false,
            created_by: userEmail
          })

        if (!bidError) {
          importedBidsCount++
          orderMatched = true
        } else {
          console.error('Error inserting supplier bid:', bidError.message)
        }
      } else {
        // No match found in the target order's requirements: divert to unassigned!
        // BUG 4 FIX: instead of always inserting a new order_items row (which creates
        // orphaned duplicates on every re-import), upsert by item_name where order_id IS NULL.
        // This prevents the DB from accumulating duplicate unassigned items.
        let orderItemId = null
        if (row.productName && row.productName.trim()) {
          // Check if an unassigned order_item with this name already exists
          const { data: existingItem } = await supabase
            .from('order_items')
            .select('id')
            .is('order_id', null)
            .eq('item_name', row.productName.trim())
            .maybeSingle()

          if (existingItem) {
            // Reuse the existing unassigned item — no duplicate
            orderItemId = existingItem.id
          } else {
            // Create a new unassigned item only when it truly doesn't exist yet
            const { data: newOrderItem, error: newOrderItemErr } = await supabase
              .from('order_items')
              .insert({
                order_id: null,
                item_name: row.productName.trim(),
                quantity: 100, // default placeholder quantity
                item_type: 'PRODUCT',
                item_status: 'PENDING'
              })
              .select('id')
              .single()

            if (!newOrderItemErr && newOrderItem) {
              orderItemId = newOrderItem.id
            } else {
              console.error('Error auto-creating unassigned order item during import:', newOrderItemErr?.message)
            }
          }
        }

        // 2. Create the supplier bid with order_id = null
        const { error: bidError } = await supabase
          .from('order_suppliers')
          .insert({
            order_id: null,
            order_item_id: orderItemId,
            supplier_id: supplierId,
            supplier_name: row.supplierName.trim(),
            quoted_price: row.quotedPrice,
            lead_time_days: row.leadTime,
            is_shortlisted: false,
            created_by: userEmail
          })

        if (!bidError) {
          importedBidsCount++
          orderMatched = true
        } else {
          console.error('Error inserting unassigned supplier bid:', bidError.message)
        }
      }

      if (!orderMatched && row.productName && row.productName.trim()) {
        const { error: capError } = await supabase
          .from('supplier_capabilities')
          .insert({
            supplier_id: supplierId,
            product_name: row.productName.trim(),
            target_price: row.quotedPrice
          })

        if (!capError) {
          importedCapabilitiesCount++
          await recordSupplierProductHistory(
            supabase,
            supplierId,
            row.productName.trim(),
            row.quotedPrice || 0,
            null,
            0,
            'IMPORT',
            userEmail
          )
        } else {
          console.error('Error inserting supplier capability:', capError.message)
        }
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return {
      success: true,
      importedSuppliersCount,
      importedBidsCount,
      importedCapabilitiesCount
    }
  } catch (error: any) {
    console.error('Bulk import uncaught error:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export interface ManualNormalizedItemBid {
  orderItemId: string
  quotedPrice: number
  leadTimeDays: number
}

export interface ManualNormalizedCapability {
  productName: string
  targetPrice: number
  leadTimeDays?: string
  description?: string
  moq?: number
  sku?: string
  monthlyCapacity?: string
}

export interface ManualNormalizedInput {
  supplierName: string
  email: string
  phone: string
  address: string
  orderId: string | null
  items: ManualNormalizedItemBid[]
  capabilities: ManualNormalizedCapability[]
  website?: string
  contactPerson?: string
  taxId?: string
  businessType?: string
}

export async function addSupplierNormalizedAction(input: ManualNormalizedInput, resolution?: 'skip' | 'overwrite' | null, isProfilesTab: boolean = false) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || null

    // 1. Resolve orderCode and itemNames
    let orderCode = ''
    if (input.orderId) {
      const { data: order } = await supabase
        .from('orders')
        .select('order_code')
        .eq('id', input.orderId)
        .single()
      orderCode = order?.order_code || ''
    }

    const itemIds = input.items.map(item => item.orderItemId)
    let itemNames: Record<string, string> = {}
    if (itemIds.length > 0) {
      const { data: items } = await supabase
        .from('order_items')
        .select('id, item_name')
        .in('id', itemIds)
      if (items) {
        items.forEach((item: any) => {
          itemNames[item.id] = item.item_name
        })
      }
    }

    const incomingRows = input.items.map(item => ({
      email: input.email,
      orderCode,
      productName: itemNames[item.orderItemId] || ''
    }))

    const duplicates = await detectDuplicates(supabase, incomingRows)

    if (resolution === undefined || resolution === null) {
      if (duplicates.length > 0) {
        return {
          success: false,
          duplicateDetected: true,
          duplicates
        }
      }
    }

    let itemsToProcess = input.items

    if (resolution === 'skip') {
      const duplicateIndices = new Set(duplicates.map(d => d.incomingIndex))
      itemsToProcess = input.items.filter((_, idx) => !duplicateIndices.has(idx))
    } else if (resolution === 'overwrite') {
      const duplicateMap = new Map<number, DuplicateRecord>()
      duplicates.forEach(d => {
        duplicateMap.set(d.incomingIndex, d)
      })

      // Overwrite the duplicates
      for (const [incomingIndex, dup] of duplicateMap.entries()) {
        const item = input.items[incomingIndex]
        const { error: updateErr } = await supabase
          .from('order_suppliers')
          .update({
            quoted_price: item.quotedPrice,
            lead_time_days: item.leadTimeDays
          })
          .eq('id', dup.id)
        if (updateErr) {
          console.error(`Error overwriting manual duplicate:`, updateErr.message)
        }
      }

      // Filter out overwritten items from itemsToProcess so they are not inserted as duplicates
      const duplicateIndices = new Set(duplicates.map(d => d.incomingIndex))
      itemsToProcess = input.items.filter((_, idx) => !duplicateIndices.has(idx))
    }

    let supplierId: string | null = null

    // Find existing supplier by name
    const { data: existingSupplier } = await supabase
      .from('suppliers')
      .select('id')
      .eq('name', input.supplierName.trim())
      .maybeSingle()

    if (isProfilesTab) {
      if (existingSupplier) {
        return {
          success: false,
          error: `A supplier profile with the name "${input.supplierName.trim()}" already exists.`
        }
      }

      // Create new supplier profile
      const { data: supplier, error: supplierError } = await supabase
        .from('suppliers')
        .insert({
          name: input.supplierName.trim(),
          email: input.email ? input.email.trim() : null,
          phone: input.phone ? input.phone.trim() : null,
          address: input.address ? input.address.trim() : null,
          website: input.website ? input.website.trim() : null,
          contact_person: input.contactPerson ? input.contactPerson.trim() : null,
          tax_id: input.taxId ? input.taxId.trim() : null,
          business_type: input.businessType ? input.businessType.trim() : null,
          created_by: userEmail
        })
        .select('id')
        .single()

      if (supplierError) {
        console.error('Error inserting supplier in manual entry:', supplierError.message)
        return { success: false, error: supplierError.message }
      }
      supplierId = supplier.id
    } else {
      if (existingSupplier) {
        supplierId = existingSupplier.id
      } else {
        // Create new supplier profile on-the-fly
        const { data: supplier, error: supplierError } = await supabase
          .from('suppliers')
          .insert({
            name: input.supplierName.trim(),
            email: input.email ? input.email.trim() : null,
            phone: input.phone ? input.phone.trim() : null,
            address: input.address ? input.address.trim() : null,
            website: input.website ? input.website.trim() : null,
            contact_person: input.contactPerson ? input.contactPerson.trim() : null,
            tax_id: input.taxId ? input.taxId.trim() : null,
            business_type: input.businessType ? input.businessType.trim() : null,
            created_by: userEmail
          })
          .select('id')
          .single()

        if (supplierError) {
          console.error('Error inserting supplier on-the-fly:', supplierError.message)
          return { success: false, error: supplierError.message }
        }
        supplierId = supplier.id
      }
    }

    if (!supplierId) {
      return { success: false, error: 'Failed to resolve supplier.' }
    }

    // Check if supplier is already assigned to any of these order items
    if (input.orderId && itemsToProcess.length > 0) {
      const orderItemIds = itemsToProcess.map(item => item.orderItemId)
      const { data: existingAssignments } = await supabase
        .from('order_suppliers')
        .select('order_item_id, quoted_price')
        .eq('order_id', input.orderId)
        .eq('supplier_id', supplierId)
        .in('order_item_id', orderItemIds)

      if (existingAssignments && existingAssignments.length > 0) {
        for (const item of itemsToProcess) {
          const duplicate = existingAssignments.find(assign => 
            assign.order_item_id === item.orderItemId && 
            Number(assign.quoted_price) === Number(item.quotedPrice)
          )
          if (duplicate) {
            const duplicateItemName = itemNames[item.orderItemId] || 'this item'
            return {
              success: false,
              error: `Supplier "${input.supplierName.trim()}" is already assigned to "${duplicateItemName}" with a price of $${Number(item.quotedPrice).toFixed(2)}.`
            }
          }
        }
      }
    }

    // 2. Insert order items bids
    if (input.orderId && itemsToProcess.length > 0) {
      const bidsToInsert = itemsToProcess.map(item => ({
        order_id: input.orderId,
        order_item_id: item.orderItemId,
        supplier_id: supplierId,
        supplier_name: input.supplierName.trim(),
        quoted_price: item.quotedPrice,
        lead_time_days: item.leadTimeDays,
        is_shortlisted: false,
        created_by: userEmail
      }))

      const { error: bidsError } = await supabase
        .from('order_suppliers')
        .insert(bidsToInsert)

      if (bidsError) {
        console.error('Error inserting manual bids:', bidsError.message)
        return { success: false, error: bidsError.message }
      }
    }

    // 3. Insert capabilities (repeating rows)
    if (input.capabilities.length > 0) {
      const capsToInsert = input.capabilities.map(cap => ({
        supplier_id: supplierId,
        product_name: cap.productName.trim(),
        target_price: cap.targetPrice,
        lead_time_days: cap.leadTimeDays?.trim() || null,
        description: cap.description?.trim() || null,
        moq: cap.moq || null,
        sku: cap.sku?.trim() || null,
        monthly_capacity: cap.monthlyCapacity?.trim() || null
      }))

      const { error: capsError } = await supabase
        .from('supplier_capabilities')
        .insert(capsToInsert)

      if (capsError) {
        console.error('Error inserting manual capabilities:', capsError.message)
        return { success: false, error: capsError.message }
      }

      // Record to history
      for (const cap of input.capabilities) {
        await recordSupplierProductHistory(
          supabase,
          supplierId,
          cap.productName,
          cap.targetPrice,
          cap.monthlyCapacity || null,
          0,
          'CAPABILITY_CREATE',
          userEmail
        )
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true, supplierId }
  } catch (error: any) {
    console.error('Manual normalized add supplier uncaught error:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}
export async function deleteSuppliersBatchAction(ids: string[], deleteProfile: boolean = false) {
  try {
    const supabase = await createClient()

    if (deleteProfile) {
      // Delete master supplier profiles from suppliers table
      const { error: sError } = await supabase
        .from('suppliers')
        .delete()
        .in('id', ids)

      if (sError) {
        console.error('Error batch deleting supplier profiles:', sError.message)
        return { success: false, error: sError.message }
      }
    } else {
      // Delete bids from order_suppliers table only
      const { error: bidsError } = await supabase
        .from('order_suppliers')
        .delete()
        .in('id', ids)

      if (bidsError) {
        console.error('Error batch deleting supplier bids:', bidsError.message)
        return { success: false, error: bidsError.message }
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error in batch delete:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function sendShortlistToQcAction(orderId?: string | null) {
  try {
    const supabase = await createClient()

    // 1. Fetch shortlisted order_suppliers (optionally filtered by orderId)
    let query = supabase
      .from('order_suppliers')
      .select('supplier_id')
      .eq('is_shortlisted', true)

    if (orderId) {
      query = query.eq('order_id', orderId)
    }

    const { data: shortlistedBids, error: bidsError } = await query

    if (bidsError) {
      console.error('Error fetching shortlist:', bidsError.message)
      return { success: false, error: bidsError.message }
    }

    if (!shortlistedBids || shortlistedBids.length === 0) {
      return { success: false, error: orderId 
        ? 'No shortlisted suppliers found for this specific order. Please shortlist some suppliers in the order matrix first.'
        : 'No shortlisted suppliers found. Please shortlist some suppliers in Phase 2 first.'
      }
    }

    // Extract unique supplier IDs
    const supplierIds = Array.from(new Set(shortlistedBids.map(b => b.supplier_id).filter(Boolean))) as string[]

    if (supplierIds.length === 0) {
      return { success: false, error: 'No valid supplier records found for the shortlisted items.' }
    }

    // 2. Insert or update records in factory_audits to 'Pending QC Assignment'
    let successCount = 0

    for (const supplierId of supplierIds) {
      let queryBuilder = supabase
        .from('factory_audits')
        .select('id, audit_status')
        .eq('supplier_id', supplierId)

      if (orderId) {
        queryBuilder = queryBuilder.eq('order_id', orderId)
      } else {
        queryBuilder = queryBuilder.is('order_id', null)
      }

      const { data: existingAudit, error: fetchError } = await queryBuilder.maybeSingle()

      if (!fetchError && existingAudit) {
        // If an audit already exists, only update it if it hasn't been scheduled or completed
        if (
          existingAudit.audit_status !== 'Scheduled' &&
          existingAudit.audit_status !== 'In Progress' &&
          existingAudit.audit_status !== 'Completed'
        ) {
          const { error: updateError } = await supabase
            .from('factory_audits')
            .update({ audit_status: 'Pending QC Assignment' })
            .eq('id', existingAudit.id)
          
          if (!updateError) successCount++
        } else {
          // Already scheduled or further in the process, count as success/skipped without overwriting
          successCount++
        }
      } else {
        // Insert new audit in 'Pending QC Assignment' status
        const { error: insertError } = await supabase
          .from('factory_audits')
          .insert({
            supplier_id: supplierId,
            order_id: orderId || null,
            audit_status: 'Pending QC Assignment'
          })

        if (!insertError) successCount++
      }
    }

    if (orderId) {
      const { error: stageError } = await supabase
        .from('orders')
        .update({ stage: 'QC' })
        .eq('id', orderId)
      if (stageError) {
        console.error('Error updating order stage to QC:', stageError.message)
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/audit')
    revalidatePath('/orders')
    return { success: true, count: successCount }
  } catch (error: any) {
    console.error('Uncaught error sending shortlist to QC:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function fetchSupplierCapabilitiesAction(supplierId: string) {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('supplier_capabilities')
      .select('*')
      .eq('supplier_id', supplierId)

    if (error) {
      console.error('Error fetching supplier capabilities:', error.message)
      return { success: false, error: error.message }
    }

    return { success: true, capabilities: data || [] }
  } catch (error: any) {
    console.error('Uncaught error fetching capabilities:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export interface UpdateSupplierCapabilitiesInput {
  productName: string
  targetPrice: number
}

export interface UpdateSupplierProfileInput {
  supplierId: string
  name?: string
  email: string
  phone: string
  address: string
  capabilities: UpdateSupplierCapabilitiesInput[]
  website?: string
  contactPerson?: string
  taxId?: string
  businessType?: string
  logoUrl?: string

  // Basic Information
  supplierCode?: string
  legalName?: string
  yearFounded?: number
  companySize?: string
  industry?: string
  mainProducts?: string[]
  shortDescription?: string

  // Contact Information
  primaryContactName?: string
  position?: string
  alternativeContact?: string
  street?: string
  district?: string
  city?: string
  country?: string
  postalCode?: string
  linkedin?: string
  socialContact?: string

  // Financial & Legal
  paymentTerms?: string
  currency?: string
  bankInfo?: string
  creditLimit?: number
  taxStatus?: string
  businessLicense?: string
  certifications?: string[]

  // Sourcing & Performance
  sourcingCategory?: string
  leadTimeAverage?: number
  moq?: number
  pricingTier?: string
  qualityRating?: string
  reliabilityScore?: number
  onTimeDeliveryRate?: number
  defectRate?: number
  lastSourcedDate?: string
  totalSpend?: number
  totalOrders?: number
  isPreferred?: boolean

  // Metadata & Tracking
  status?: string
  sourcingStage?: string
  approvalDate?: string
  reviewedBy?: string
  nextReviewDate?: string
  riskLevel?: string
  riskNotes?: string
  createdBy?: string
  ownerPic?: string
  tags?: string[]

  // Attachments
  docCompanyProfile?: string
  docCatalog?: string
  docContract?: string
  docCertificates?: string[]
  docAuditReports?: string[]
  docSampleApprovals?: string[]
  docNda?: string

  // Advanced
  esgScore?: number
  socialResponsibilityNotes?: string
  maxCapacityMonthly?: string
  mainMarkets?: string[]
  competitors?: string
  notes?: string
  communicationHistory?: string
}

export async function updateSupplierProfileAction(input: UpdateSupplierProfileInput) {
  try {
    const supabase = await createClient()

    // 1. Update basic contact info and extended columns in 'suppliers'
    const { error: supplierError } = await supabase
      .from('suppliers')
      .update({
        name: input.name?.trim() || undefined,
        email: input.email.trim() || null,
        phone: input.phone.trim() || null,
        address: input.address.trim() || null,
        website: input.website?.trim() || null,
        contact_person: input.contactPerson?.trim() || null,
        tax_id: input.taxId?.trim() || null,
        business_type: input.businessType?.trim() || null,
        logo_url: input.logoUrl?.trim() || null,

        supplier_code: input.supplierCode?.trim() || null,
        legal_name: input.legalName?.trim() || null,
        year_founded: input.yearFounded || null,
        company_size: input.companySize?.trim() || null,
        industry: input.industry?.trim() || null,
        main_products: input.mainProducts || [],
        short_description: input.shortDescription?.trim() || null,

        primary_contact_name: input.primaryContactName?.trim() || null,
        position: input.position?.trim() || null,
        alternative_contact: input.alternativeContact?.trim() || null,
        street: input.street?.trim() || null,
        district: input.district?.trim() || null,
        city: input.city?.trim() || null,
        country: input.country?.trim() || null,
        postal_code: input.postalCode?.trim() || null,
        linkedin: input.linkedin?.trim() || null,
        social_contact: input.socialContact?.trim() || null,

        payment_terms: input.paymentTerms?.trim() || null,
        currency: input.currency?.trim() || null,
        bank_info: input.bankInfo?.trim() || null,
        credit_limit: input.creditLimit || null,
        tax_status: input.taxStatus?.trim() || null,
        business_license: input.businessLicense?.trim() || null,
        certifications: input.certifications || [],

        sourcing_category: input.sourcingCategory?.trim() || null,
        lead_time_average: input.leadTimeAverage || null,
        moq: input.moq || null,
        pricing_tier: input.pricingTier?.trim() || null,
        quality_rating: input.qualityRating?.trim() || null,
        reliability_score: input.reliabilityScore || null,
        on_time_delivery_rate: input.onTimeDeliveryRate || null,
        defect_rate: input.defectRate || null,
        last_sourced_date: input.lastSourcedDate || null,
        total_spend: input.totalSpend || null,
        total_orders: input.totalOrders || null,
        is_preferred: input.isPreferred !== undefined ? input.isPreferred : false,

        status: input.status?.trim() || 'Prospect',
        sourcing_stage: input.sourcingStage?.trim() || 'New',
        approval_date: input.approvalDate || null,
        reviewed_by: input.reviewedBy?.trim() || null,
        next_review_date: input.nextReviewDate || null,
        risk_level: input.riskLevel?.trim() || null,
        risk_notes: input.riskNotes?.trim() || null,
        created_by: input.createdBy?.trim() || null,
        owner_pic: input.ownerPic?.trim() || null,
        tags: input.tags || [],

        doc_company_profile: input.docCompanyProfile?.trim() || null,
        doc_catalog: input.docCatalog?.trim() || null,
        doc_contract: input.docContract?.trim() || null,
        doc_certificates: input.docCertificates || [],
        doc_audit_reports: input.docAuditReports || [],
        doc_sample_approvals: input.docSampleApprovals || [],
        doc_nda: input.docNda?.trim() || null,

        esg_score: input.esgScore || null,
        social_responsibility_notes: input.socialResponsibilityNotes?.trim() || null,
        max_capacity_monthly: input.maxCapacityMonthly?.trim() || null,
        main_markets: input.mainMarkets || [],
        competitors: input.competitors?.trim() || null,
        notes: input.notes?.trim() || null,
        communication_history: input.communicationHistory?.trim() || null
      })
      .eq('id', input.supplierId)

    if (supplierError) {
      console.error('Error updating supplier contact info:', supplierError.message)
      return { success: false, error: supplierError.message }
    }

    // 2. Clear old capabilities and write new ones
    const { error: deleteError } = await supabase
      .from('supplier_capabilities')
      .delete()
      .eq('supplier_id', input.supplierId)

    if (deleteError) {
      console.error('Error clearing old capabilities:', deleteError.message)
      return { success: false, error: deleteError.message }
    }

    if (input.capabilities.length > 0) {
      const capsToInsert = input.capabilities.map(cap => ({
        supplier_id: input.supplierId,
        product_name: cap.productName.trim(),
        target_price: cap.targetPrice
      }))

      const { error: insertError } = await supabase
        .from('supplier_capabilities')
        .insert(capsToInsert)

      if (insertError) {
        console.error('Error inserting new capabilities:', insertError.message)
        return { success: false, error: insertError.message }
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/audit')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error updating supplier profile:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function confirmSupplierAndCreatePoAction(formData: FormData) {
  try {
    const supabase = await createClient()

    const orderId = formData.get('orderId') as string
    const selectedSupplierId = formData.get('selectedSupplierId') as string
    const orderItemId = formData.get('orderItemId') as string
    const contractValue = Number(formData.get('contractValue'))
    const targetDeliveryDate = formData.get('targetDeliveryDate') as string
    const deliveryAddress = formData.get('deliveryAddress') as string
    const contractFile = formData.get('contractFile') as File | null

    if (!orderId || !selectedSupplierId || !targetDeliveryDate || !deliveryAddress || !orderItemId) {
      return { success: false, error: 'Missing required fields' }
    }

    // 1. Fetch supplier name and email
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('name, email')
      .eq('id', selectedSupplierId)
      .single()

    if (supplierError || !supplier) {
      console.error('Error fetching supplier info:', supplierError?.message)
      return { success: false, error: 'Supplier not found' }
    }

    if (!supplier.email || supplier.email.trim() === '') {
      return { success: false, error: 'Supplier has no contact email configured. Please add an email in their profile first.' }
    }

    // 2. Update selected_supplier_id for this specific order item
    const { error: itemUpdateError } = await supabase
      .from('order_items')
      .update({ selected_supplier_id: selectedSupplierId })
      .eq('id', orderItemId)

    if (itemUpdateError) {
      console.error('Error updating order item supplier:', itemUpdateError.message)
      return { success: false, error: itemUpdateError.message }
    }

    // 3. Query all order items to see if all have selected suppliers
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('id, item_name, quantity, selected_supplier_id')
      .eq('order_id', orderId)

    if (itemsError) {
      console.error('Error fetching all order items:', itemsError.message)
      return { success: false, error: itemsError.message }
    }

    const allConfirmed = items && items.length > 0 && items.every((item: any) => item.selected_supplier_id !== null)

    // Find the specific item being confirmed from the list of items
    const currentItem = items?.find((item: any) => item.id === orderItemId)

    // 4. Handle Cloudflare R2 Upload for signed contract file
    let contractFileUrl = null
    if (contractFile && contractFile.size > 0) {
      const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png'
      ]

      if (!allowedMimeTypes.includes(contractFile.type)) {
        return { success: false, error: 'Unsupported file format. Please upload PDF, DOCX, or Images.' }
      }

      if (contractFile.size > 10 * 1024 * 1024) {
        return { success: false, error: 'Contract file size exceeds 10MB limit' }
      }

      const buffer = Buffer.from(await contractFile.arrayBuffer())
      const sanitizedFilename = `${Date.now()}-${contractFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const filenameKey = `contracts/order-${orderId}/${sanitizedFilename}`

      const s3Client = new S3Client({
        endpoint: process.env.R2_ENDPOINT_URL,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
        region: 'auto',
      })

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME || 'sourcinghub',
          Key: filenameKey,
          Body: buffer,
          ContentType: contractFile.type,
        })
      )

      contractFileUrl = `/api/images?key=${filenameKey}`
    }

    // 5. Update parent order details, stage, and new fields
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({
        selected_supplier_id: selectedSupplierId,
        contract_value: contractValue,
        stage: allConfirmed ? 'PO ISSUED' : 'PARTIAL PO ISSUED',
        target_delivery_date: targetDeliveryDate,
        delivery_address: deliveryAddress,
        contract_file_url: contractFileUrl
      })
      .eq('id', orderId)

    if (orderUpdateError) {
      console.error('Error updating order details:', orderUpdateError.message)
      return { success: false, error: orderUpdateError.message }
    }

    // 6. Create production job for the current confirmed item
    if (currentItem) {
      // Clear any existing production job for this item to prevent duplicates
      await supabase
        .from('production_jobs')
        .delete()
        .eq('order_id', orderId)
        .eq('item_name', currentItem.item_name)

      const { error: jobInsertError } = await supabase
        .from('production_jobs')
        .insert({
          order_id: orderId,
          supplier_id: selectedSupplierId,
          factory_name: supplier.name,
          item_name: currentItem.item_name,
          target_qty: currentItem.quantity,
          output_qty: 0,
          progress_pct: 0.00,
          defect_rate: 0.00,
          status: 'running'
        })

      if (jobInsertError) {
        console.error('Error inserting production job:', jobInsertError.message)
      }
    }

    // 7. Send automated email notification via Resend
    let emailSent = false
    const resendApiKey = process.env.RESEND_API_KEY
    if (resendApiKey && supplier.email) {
      try {
        const resend = new Resend(resendApiKey)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const fullContractUrl = contractFileUrl ? `${appUrl}${contractFileUrl}` : ''
        
        // Fetch order code for clean display
        const { data: orderData } = await supabase
          .from('orders')
          .select('order_code')
          .eq('id', orderId)
          .single()
        
        const displayOrderId = orderData?.order_code || `PO-${orderId.substring(0, 8).toUpperCase()}`
        const secureToken = generateToken(orderId)
        const confirmPoActionUrl = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=confirm_po&orderItemId=${orderItemId}`
        const shipmentActionUrl = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=shipped&orderItemId=${orderItemId}`

        const isPoIssued = true
        const isPoConfirmed = false

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <title>Purchase Order Confirmation</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
              .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
              .header { border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px; text-align: center; }
              .logo { font-size: 20px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.05em; }
              h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px; text-align: center; }
              p { font-size: 14px; color: #475569; margin-top: 0; margin-bottom: 16px; }
              .details-box { background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px; margin-bottom: 24px; }
              .detail-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 12px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 10px; }
              .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
              .detail-label { color: #64748b; font-weight: 600; }
              .detail-value { color: #0f172a; font-weight: 700; text-align: right; }
              .button-group { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
              .btn-emerald { display: block; background-color: #10b981; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(16,185,129,0.2); }
              .btn-emerald:hover { background-color: #059669; }
              .btn-indigo { display: block; background-color: #4f46e5; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(79,70,229,0.2); }
              .btn-indigo:hover { background-color: #4338ca; }
              .btn-slate { display: block; background-color: #64748b; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(100,116,139,0.2); }
              .btn-slate:hover { background-color: #475569; }
              .btn-disabled { display: block; background-color: #f1f5f9; color: #94a3b8 !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0; cursor: not-allowed; }
              .footer { border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="logo">TR Sourcing Hub</div>
              </div>
              <h1>Purchase Order Confirmation</h1>
              <p>Dear <strong>${supplier.name}</strong> Team,</p>
              <p>We are pleased to inform you that we have finalized our sourcing selection and officially issued a Purchase Order. Please find the details of the purchase order below:</p>
              
              <div class="details-box">
                <div class="detail-row">
                  <span class="detail-label">Order ID:</span>
                  <span class="detail-value">${displayOrderId}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Product Item:</span>
                  <span class="detail-value">${currentItem?.item_name || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Contract Value:</span>
                  <span class="detail-value">$${Number(contractValue).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Target Delivery Date:</span>
                  <span class="detail-value">${targetDeliveryDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Delivery Address:</span>
                  <span class="detail-value">${deliveryAddress}</span>
                </div>
              </div>
              
              <p style="margin-bottom: 24px;">Please review the contract and perform the required steps for our supply chain workflow by using the options below:</p>
              
              <div class="button-group">
                <!-- Single Table Layout ensuring strict vertical structure in all email clients -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                  <!-- Row 1: Immediate Action Group -->
                  <tr>
                    <td width="48%" valign="top">
                      ${isPoIssued ? `
                      <a href="${confirmPoActionUrl}" class="btn-emerald" target="_blank">Confirm & Accept PO</a>
                      ` : `
                      <div class="btn-disabled">Confirm & Accept PO</div>
                      `}
                    </td>
                    <td width="4%"></td>
                    <td width="48%" valign="top">
                      ${fullContractUrl && isPoIssued ? `
                      <a href="${fullContractUrl}" class="btn-indigo" target="_blank">View Signed Contract</a>
                      ` : `
                      <div class="btn-disabled">View Signed Contract</div>
                      `}
                    </td>
                  </tr>
                  <!-- Spacer Row -->
                  <tr>
                    <td colspan="3" style="height: 16px; font-size: 16px; line-height: 16px;">&nbsp;</td>
                  </tr>
                  <!-- Row 2: Delayed Action Group -->
                  <tr>
                    <td colspan="3" valign="top">
                      ${isPoConfirmed ? `
                      <a href="${shipmentActionUrl}" class="btn-slate" target="_blank">Mark as Shipped</a>
                      ` : `
                      <div class="btn-disabled">Mark as Shipped</div>
                      `}
                    </td>
                  </tr>
                </table>
              </div>
              
              <p style="margin-top: 28px;">Should you have any questions or require further clarification, please do not hesitate to contact our Sourcing team.</p>
              
              <div class="footer">
                This is an automated notification from TR Sourcing Hub. Please do not reply directly to this email.
              </div>
            </div>
          </body>
          </html>
        `

        await resend.emails.send({
          from: 'Sourcing Hub <onboarding@resend.dev>',
          to: supplier.email,
          subject: `[TR Sourcing] Purchase Order Issued - Order ID: ${displayOrderId}`,
          html: emailHtml,
        })
        emailSent = true
        console.log(`PO confirmation email successfully sent to ${supplier.email}`)
      } catch (emailErr) {
        console.error('Failed to send PO confirmation email via Resend:', emailErr)
      }
    } else {
      if (!resendApiKey) {
        console.warn('RESEND_API_KEY is not configured. Simulating successful email send for local testing.')
        emailSent = true
      } else {
        console.warn('Supplier has no contact email. Skipping email notification.')
        emailSent = false
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    revalidatePath('/production')
    return { success: true, emailSent, supplierEmail: supplier.email }
  } catch (error: any) {
    console.error('Uncaught error confirming supplier & PO:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}