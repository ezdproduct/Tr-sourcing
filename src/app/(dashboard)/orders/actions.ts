'use server'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

export interface OrderItemInput {
  itemName: string
  quantity: number
  specFileUrl?: string
  itemType?: string
}

export interface CreateOrderInput {
  // orderType is intentionally omitted: defaults to 'PENDING' until Sourcing classifies it
  orderDate: string // YYYY-MM-DD
  estimatedDeliveryDate: string // YYYY-MM-DD
  items: OrderItemInput[]
}

export interface UpdateOrderInput {
  orderId: string
  orderType: 'MATERIAL' | 'PRODUCT'
  orderDate: string // YYYY-MM-DD
  estimatedDeliveryDate: string // YYYY-MM-DD
  items: OrderItemInput[]
}

export async function createOrderAction(input: CreateOrderInput) {
  try {
    const supabase = await createClient()

    // Map input items to format expected by PostgreSQL JSONB array elements
    const formattedItems = input.items.map((item) => ({
      item_name: item.itemName,
      quantity: item.quantity,
      spec_file_url: item.specFileUrl || '',
      item_type: item.itemType || 'PENDING'
    }))

    // order_type defaults to 'PENDING' — Sourcing team will classify in Phase 2
    // stage defaults to 'Order Intake' — indicating it's not yet classified
    const { data, error } = await supabase.rpc('create_order_with_items', {
      p_order_type: 'PENDING',
      p_order_date: input.orderDate,
      p_estimated_delivery_date: input.estimatedDeliveryDate,
      p_items: formattedItems
    })

    if (error) {
      console.error('Database RPC function call error:', error.message)
      return { success: false, error: error.message }
    }

    const rpcResult = data as { success: boolean; order_id?: string; order_code?: string; error?: string }

    if (!rpcResult || !rpcResult.success) {
      const errMessage = rpcResult?.error || 'Database transaction failed.'
      console.error('Database transaction error:', errMessage)
      return { success: false, error: errMessage }
    }

    // Set stage to 'Order Intake' after creation
    if (rpcResult.order_id) {
      await supabase
        .from('orders')
        .update({ stage: 'Order Intake' })
        .eq('id', rpcResult.order_id)
    }

    // Trigger Next.js App Router cache revalidation
    revalidatePath('/orders')
    revalidatePath('/sourcing')

    return { success: true, orderCode: rpcResult.order_code, orderId: rpcResult.order_id }
  } catch (error: any) {
    console.error('Server Action uncaught error:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function updateOrderAction(input: UpdateOrderInput) {
  try {
    const supabase = await createClient()

    // Map input items to format expected by PostgreSQL JSONB array elements
    const formattedItems = input.items.map((item) => ({
      item_name: item.itemName,
      quantity: item.quantity,
      spec_file_url: item.specFileUrl || '',
      item_type: item.itemType || 'PENDING'
    }))

    // Call Supabase RPC function for dynamic transaction update
    const { data, error } = await supabase.rpc('update_order_with_items', {
      p_order_id: input.orderId,
      p_order_type: input.orderType,
      p_order_date: input.orderDate,
      p_estimated_delivery_date: input.estimatedDeliveryDate,
      p_items: formattedItems
    })

    if (error) {
      console.error('Database RPC update call error:', error.message)
      return { success: false, error: error.message }
    }

    const rpcResult = data as { success: boolean; error?: string }

    if (!rpcResult || !rpcResult.success) {
      const errMessage = rpcResult?.error || 'Database update transaction failed.'
      console.error('Database update transaction error:', errMessage)
      return { success: false, error: errMessage }
    }

    // Trigger Next.js App Router cache revalidation
    revalidatePath('/orders')

    return { success: true }
  } catch (error: any) {
    console.error('Server Action update uncaught error:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function deleteOrderAction(orderId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', orderId)

    if (error) {
      console.error('Database delete error:', error.message)
      return { success: false, error: error.message }
    }

    // Trigger Next.js App Router cache revalidation
    revalidatePath('/orders')
    revalidatePath('/sourcing')

    return { success: true }
  } catch (error: any) {
    console.error('Server Action delete uncaught error:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}
