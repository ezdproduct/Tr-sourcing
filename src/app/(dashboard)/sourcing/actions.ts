'use server'

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { Resend } from 'resend'
import { generateToken } from '@/app/api/orders/update-progress/route'
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
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error updating batch shortlist:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function deleteSupplierAction(supplierId: string) {
  try {
    const supabase = await createClient()

    // 1. Try to delete from order_suppliers first
    const { data: orderSupplier, error: fetchError } = await supabase
      .from('order_suppliers')
      .select('id, supplier_id')
      .eq('id', supplierId)
      .maybeSingle()

    const targetSupplierId = orderSupplier ? orderSupplier.supplier_id : supplierId

    // 2. Delete the supplier profile from suppliers table (will cascade delete order_suppliers bids)
    const { error: deleteError } = await supabase
      .from('suppliers')
      .delete()
      .eq('id', targetSupplierId)

    if (deleteError) {
      console.error('Error deleting supplier profile:', deleteError.message)
      return { success: false, error: deleteError.message }
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
          // Auto-create order if it doesn't exist
          const { data: newOrder, error: newOrderErr } = await supabase
            .from('orders')
            .insert({
              order_code: targetOrderCode,
              stage: 'sourcing',
              order_type: 'PRODUCT',
              order_date: new Date().toISOString().split('T')[0]
            })
            .select('id')
            .single()

          if (!newOrderErr && newOrder) {
            matchedOrder = { id: newOrder.id, order_items: [], isNew: true }
          } else {
            console.error('Error auto-creating order during import:', newOrderErr?.message)
          }
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
            is_shortlisted: false
          })

        if (!bidError) {
          importedBidsCount++
          orderMatched = true
        } else {
          console.error('Error inserting supplier bid:', bidError.message)
        }
      } else {
        // No match found in the target order's requirements: divert to unassigned!
        // 1. Create an unassigned order item first to hold the product name
        let orderItemId = null
        if (row.productName && row.productName.trim()) {
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
            is_shortlisted: false
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

    // 1. Get all supplier_ids associated with these order_suppliers bids
    const { data: bids } = await supabase
      .from('order_suppliers')
      .select('supplier_id')
      .in('id', ids)

    const supplierIds = new Set<string>()
    if (bids) {
      bids.forEach(b => {
        if (b.supplier_id) supplierIds.add(b.supplier_id)
      })
    }
    // Also add any IDs that are directly supplier profiles
    ids.forEach(id => supplierIds.add(id))

    // 2. Delete all these suppliers from the suppliers table (will cascade delete order_suppliers)
    const { error: sError } = await supabase
      .from('suppliers')
      .delete()
      .in('id', Array.from(supplierIds))

    if (sError) {
      console.error('Error batch deleting supplier profiles:', sError.message)
      return { success: false, error: sError.message }
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
      } else {
        console.warn('Supplier has no contact email. Skipping email notification.')
      }
      emailSent = true
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