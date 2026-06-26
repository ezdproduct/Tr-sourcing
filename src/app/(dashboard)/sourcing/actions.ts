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
        if (stage === 'Order Intake' || stage === 'Pending Classification' || !stage) {
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

    // 3. Update parent order stage to Sourcing if it was 'Order Intake' or 'Pending Classification'
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('stage')
      .eq('id', orderId)
      .single()

    if (!fetchError && order) {
      const stage = order.stage
      if (stage === 'Order Intake' || stage === 'Pending Classification' || !stage) {
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



