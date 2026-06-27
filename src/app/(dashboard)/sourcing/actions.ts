'use server'

export type OrderType = 'MATERIAL' | 'PRODUCT'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

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

    const { data, error } = await supabase
      .from('order_suppliers')
      .insert({
        order_id: input.orderId,
        order_item_id: input.orderItemId,
        supplier_name: input.supplierName,
        quoted_price: input.quotedPrice,
        lead_time_days: input.leadTimeDays,
        is_shortlisted: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding supplier:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/sourcing')
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
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error updating shortlist:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function deleteSupplierAction(supplierId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('order_suppliers')
      .delete()
      .eq('id', supplierId)

    if (error) {
      console.error('Error deleting supplier:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/sourcing')
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

    // 3. Update parent order stage to Sourcing if it was 'Order', 'Order Intake' or 'Pending Classification'
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('stage')
      .eq('id', orderId)
      .single()

    if (!fetchError && order) {
      const stage = order.stage
      if (stage === 'Order' || stage === 'Order Intake' || stage === 'Pending Classification' || !stage) {
        await supabase
          .from('orders')
          .update({ stage: 'Sourcing' })
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
}

export async function bulkImportSuppliersAction(rows: BulkSupplierRow[]) {
  try {
    const supabase = await createClient()

    let importedSuppliersCount = 0
    let importedBidsCount = 0
    let importedCapabilitiesCount = 0

    // Cache supplier IDs by name in this batch to prevent duplicate checks
    const supplierCache: Record<string, string> = {}

    for (const row of rows) {
      if (!row.supplierName) continue

      let supplierId = supplierCache[row.supplierName]

      if (!supplierId) {
        const { data: supplier, error: supplierError } = await supabase
          .from('suppliers')
          .upsert({
            name: row.supplierName.trim(),
            email: row.email ? row.email.trim() : null,
            phone: row.phone ? row.phone.trim() : null,
            address: row.address ? row.address.trim() : null
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

      let orderMatched = false
      if (row.orderCode && row.orderCode.trim()) {
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .select('id, order_items(id, item_name)')
          .eq('order_code', row.orderCode.trim())

        // Use find first matches
        if (!orderError && order && order.length > 0) {
          const matchedOrder = order[0]
          const matchItem = matchedOrder.order_items?.find(
            (item: any) => item.item_name.toLowerCase().trim() === row.productName.toLowerCase().trim()
          )

          if (matchItem) {
            const { error: bidError } = await supabase
              .from('order_suppliers')
              .insert({
                order_id: matchedOrder.id,
                order_item_id: matchItem.id,
                supplier_id: supplierId,
                supplier_name: row.supplierName.trim(),
                quoted_price: row.quotedPrice,
                lead_time_days: row.leadTime,
                is_shortlisted: false
              })

            if (!bidError) {
              importedBidsCount++
              orderMatched = true
            } else {
              console.error('Error inserting supplier bid:', bidError.message)
            }
          }
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
        } else {
          console.error('Error inserting supplier capability:', capError.message)
        }
      }
    }

    revalidatePath('/sourcing')
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
}

export interface ManualNormalizedInput {
  supplierName: string
  email: string
  phone: string
  address: string
  orderId: string | null
  items: ManualNormalizedItemBid[]
  capabilities: ManualNormalizedCapability[]
}

export async function addSupplierNormalizedAction(input: ManualNormalizedInput) {
  try {
    const supabase = await createClient()

    // 1. Upsert supplier basic details
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .upsert({
        name: input.supplierName.trim(),
        email: input.email ? input.email.trim() : null,
        phone: input.phone ? input.phone.trim() : null,
        address: input.address ? input.address.trim() : null
      }, { onConflict: 'name' })
      .select('id')
      .single()

    if (supplierError) {
      console.error('Error upserting supplier in manual entry:', supplierError.message)
      return { success: false, error: supplierError.message }
    }

    const supplierId = supplier.id

    // 2. Insert order items bids
    if (input.orderId && input.items.length > 0) {
      const bidsToInsert = input.items.map(item => ({
        order_id: input.orderId,
        order_item_id: item.orderItemId,
        supplier_id: supplierId,
        supplier_name: input.supplierName.trim(),
        quoted_price: item.quotedPrice,
        lead_time_days: item.leadTimeDays,
        is_shortlisted: false
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
        target_price: cap.targetPrice
      }))

      const { error: capsError } = await supabase
        .from('supplier_capabilities')
        .insert(capsToInsert)

      if (capsError) {
        console.error('Error inserting manual capabilities:', capsError.message)
        return { success: false, error: capsError.message }
      }
    }

    revalidatePath('/sourcing')
    return { success: true, supplierId }
  } catch (error: any) {
    console.error('Manual normalized add supplier uncaught error:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function deleteSuppliersBatchAction(ids: string[]) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('order_suppliers')
      .delete()
      .in('id', ids)

    if (error) {
      console.error('Error batch deleting suppliers:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/sourcing')
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
  email: string
  phone: string
  address: string
  capabilities: UpdateSupplierCapabilitiesInput[]
}

export async function updateSupplierProfileAction(input: UpdateSupplierProfileInput) {
  try {
    const supabase = await createClient()

    // 1. Update basic contact info in 'suppliers'
    const { error: supplierError } = await supabase
      .from('suppliers')
      .update({
        email: input.email.trim() || null,
        phone: input.phone.trim() || null,
        address: input.address.trim() || null
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

export interface ConfirmSupplierAndCreatePoInput {
  orderId: string
  selectedSupplierId: string
  contractValue: number
}

export async function confirmSupplierAndCreatePoAction(input: ConfirmSupplierAndCreatePoInput) {
  try {
    const supabase = await createClient()

    // 1. Fetch supplier name
    const { data: supplier, error: supplierError } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', input.selectedSupplierId)
      .single()

    if (supplierError || !supplier) {
      console.error('Error fetching supplier name:', supplierError?.message)
      return { success: false, error: 'Supplier not found' }
    }

    // 2. Fetch order items
    const { data: items, error: itemsError } = await supabase
      .from('order_items')
      .select('item_name, quantity')
      .eq('order_id', input.orderId)

    if (itemsError) {
      console.error('Error fetching order items:', itemsError.message)
      return { success: false, error: itemsError.message }
    }

    // 3. Update parent order details & stage to Production
    const { error: orderUpdateError } = await supabase
      .from('orders')
      .update({
        selected_supplier_id: input.selectedSupplierId,
        contract_value: input.contractValue,
        stage: 'Production'
      })
      .eq('id', input.orderId)

    if (orderUpdateError) {
      console.error('Error updating order to Production stage:', orderUpdateError.message)
      return { success: false, error: orderUpdateError.message }
    }

    // 4. Create production jobs for each item
    if (items && items.length > 0) {
      // Clear any existing production jobs for this order to prevent duplicates on retry
      await supabase
        .from('production_jobs')
        .delete()
        .eq('order_id', input.orderId)

      const jobsToInsert = items.map(item => ({
        order_id: input.orderId,
        supplier_id: input.selectedSupplierId,
        factory_name: supplier.name,
        item_name: item.item_name,
        target_qty: item.quantity,
        output_qty: 0,
        progress_pct: 0.00,
        defect_rate: 0.00,
        status: 'running'
      }))

      const { error: jobsError } = await supabase
        .from('production_jobs')
        .insert(jobsToInsert)

      if (jobsError) {
        console.error('Error inserting production jobs:', jobsError.message)
      }
    }

    revalidatePath('/sourcing')
    revalidatePath('/orders')
    revalidatePath('/production')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error confirming supplier & PO:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}
