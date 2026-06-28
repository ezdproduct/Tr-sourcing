'use server'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

async function reconcileWarehouseStockIn(supabase: any, orderId: string, productName: string) {
  // Fetch the specific order item being reconciled
  const { data: currentItem, error: itemError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .eq('item_name', productName)
    .single()

  if (itemError || !currentItem) {
    console.error('Error fetching order item for stock-in:', itemError?.message)
    return
  }

  const isMaterial = currentItem.item_type === 'MATERIAL'
  const qty = currentItem.verified_quantity || currentItem.quantity || 0

  if (isMaterial) {
    // 1. Mutate item status to IN_STOCK
    await supabase
      .from('order_items')
      .update({ item_status: 'IN_STOCK' })
      .eq('id', currentItem.id)

    // 2. Update material inventory table
    const { data: existingInv } = await supabase
      .from('material_inventory')
      .select('*')
      .eq('material_name', currentItem.item_name)
      .single()
    
    const existingQty = existingInv ? Number(existingInv.quantity_in_stock) : 0
    const newQty = existingQty + qty

    await supabase
      .from('material_inventory')
      .upsert({
        material_name: currentItem.item_name,
        quantity_in_stock: newQty,
        uom: currentItem.uom,
        updated_at: new Date().toISOString()
      }, { onConflict: 'material_name' })

    // 3. Unlock production batch as READY_TO_ASSEMBLE
    const { data: existingBatch } = await supabase
      .from('internal_production_batches')
      .select('*')
      .eq('order_id', orderId)
      .single()

    if (existingBatch) {
      await supabase
        .from('internal_production_batches')
        .update({
          production_status: 'READY_TO_ASSEMBLE',
          target_output_quantity: qty,
          updated_at: new Date().toISOString()
        })
        .eq('order_id', orderId)
    } else {
      await supabase
        .from('internal_production_batches')
        .insert({
          order_id: orderId,
          target_output_quantity: qty,
          current_assembled_quantity: 0,
          production_status: 'READY_TO_ASSEMBLE'
        })
    }
  } else {
    // PRODUCT Path
    // 1. Mutate item status directly to COMPLETED
    await supabase
      .from('order_items')
      .update({ item_status: 'COMPLETED' })
      .eq('id', currentItem.id)
  }

  // 4. Update parent order stage if all items are fully reconciled
  const { data: allItems } = await supabase
    .from('order_items')
    .select('item_type, item_status')
    .eq('order_id', orderId)

  const allReconciled = allItems && allItems.length > 0 && allItems.every(
    (i: any) => i.item_status === 'COMPLETED' || i.item_status === 'IN_STOCK'
  )

  const hasInStockMaterial = allItems?.some(
    (i: any) => i.item_type === 'MATERIAL' && i.item_status === 'IN_STOCK'
  )

  if (allReconciled) {
    if (hasInStockMaterial) {
      await supabase
        .from('orders')
        .update({ stage: 'Production' })
        .eq('id', orderId)
      
      await supabase
        .from('order_activities')
        .insert({
          order_id: orderId,
          activity_text: `Warehouse: All materials stock-in confirmed. Stage changed to Production.`
        })
    } else {
      await supabase
        .from('orders')
        .update({ stage: 'DELIVERED / COMPLETED' })
        .eq('id', orderId)
      
      await supabase
        .from('order_activities')
        .insert({
          order_id: orderId,
          activity_text: `Warehouse: All products delivery confirmed. Stage changed to DELIVERED / COMPLETED.`
        })
    }
  } else {
    // Log the partial matching progress
    await supabase
      .from('order_activities')
      .insert({
        order_id: orderId,
        activity_text: `Warehouse: Reconciled item '${currentItem.item_name}' (Status: ${isMaterial ? 'IN_STOCK' : 'COMPLETED'}). Waiting for remaining items.`
      })
  }
}

export async function matchLogisticsRecordAction(recordId: string) {
  try {
    const supabase = await createClient()

    // 1. Fetch record and order info
    const { data: record, error: fetchError } = await supabase
      .from('logistics_records')
      .select('order_id, product_name, orders(order_type)')
      .eq('id', recordId)
      .single()

    if (fetchError || !record) {
      console.error('Error fetching logistics record:', fetchError?.message)
      return { success: false, error: 'Record not found' }
    }

    // 2. Set status to matched
    const { error: updateError } = await supabase
      .from('logistics_records')
      .update({ status: 'matched' })
      .eq('id', recordId)

    if (updateError) {
      console.error('Error matching logistics record:', updateError.message)
      return { success: false, error: updateError.message }
    }

    // 3. Conditional split routing stock-in
    await reconcileWarehouseStockIn(supabase, record.order_id, record.product_name)

    revalidatePath('/logistics')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error matching logistics record:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function executeAllThreeWayMatchesAction() {
  try {
    const supabase = await createClient()

    // Fetch all pending/mismatched records
    const { data: records, error: fetchError } = await supabase
      .from('logistics_records')
      .select('id, order_id, product_name, orders(order_type)')
      .neq('status', 'matched')

    if (fetchError) {
      console.error('Error fetching pending logistics records:', fetchError.message)
      return { success: false, error: fetchError.message }
    }

    if (!records || records.length === 0) {
      return { success: true, count: 0 }
    }

    let successCount = 0
    for (const record of records) {
      // Update record to matched
      const { error: updateError } = await supabase
        .from('logistics_records')
        .update({ status: 'matched' })
        .eq('id', record.id)

      if (!updateError) {
        successCount++
        await reconcileWarehouseStockIn(supabase, record.order_id, record.product_name)
      }
    }

    revalidatePath('/logistics')
    revalidatePath('/orders')
    return { success: true, count: successCount }
  } catch (error: any) {
    console.error('Uncaught error executing 3-way matches:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}
