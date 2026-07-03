'use server'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

export interface OrderItemInput {
  itemName: string
  quantity: number
  specFileUrl?: string
  itemType?: string
  uom?: string
}

export interface StageTimelineInput {
  stageName: string
  estimatedStartDate: string // YYYY-MM-DD
  estimatedEndDate: string // YYYY-MM-DD
}

export interface CreateOrderInput {
  // orderType is intentionally omitted: defaults to 'PENDING' until Sourcing classifies it
  orderDate: string // YYYY-MM-DD
  estimatedDeliveryDate: string // YYYY-MM-DD
  items: OrderItemInput[]
  stageTimelines?: StageTimelineInput[]
}

export interface UpdateOrderInput {
  orderId: string
  orderType: 'MATERIAL' | 'PRODUCT'
  orderDate: string // YYYY-MM-DD
  estimatedDeliveryDate: string // YYYY-MM-DD
  stage?: string
  items: OrderItemInput[]
  stageTimelines?: StageTimelineInput[]
}

export async function createOrderAction(input: CreateOrderInput) {
  try {
    const supabase = await createClient()

    // Map input items to format expected by PostgreSQL JSONB array elements
    const formattedItems = input.items.map((item) => ({
      item_name: item.itemName,
      quantity: item.quantity,
      spec_file_url: item.specFileUrl || '',
      item_type: item.itemType || 'MATERIAL',
      uom: item.uom || 'pcs'
    }))

    const hasMaterial = input.items.some(item => item.itemType === 'MATERIAL')
    const hasFinishedGoods = input.items.some(item => item.itemType === 'FINISHED_GOODS' || item.itemType === 'PRODUCT')
    
    let computedOrderType = 'PENDING'
    if (hasMaterial && hasFinishedGoods) computedOrderType = 'MIXED'
    else if (hasMaterial) computedOrderType = 'MATERIAL'
    else if (hasFinishedGoods) computedOrderType = 'PRODUCT'

    const { data, error } = await supabase.rpc('create_order_with_items', {
      p_order_type: computedOrderType,
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

    // Set stage to 'Order' after creation
    if (rpcResult.order_id) {
      await supabase
        .from('orders')
        .update({ stage: 'Order' })
        .eq('id', rpcResult.order_id)

      // Automatically initialize 9 stage timelines
      const stageNames = ['Order', 'Sourcing', 'QC', 'Create PO', 'Supplier Production', 'Inspection', 'Logistic', 'Production', 'Order Done']
      const timelinesToInsert = stageNames.map((name) => {
        let estStart: string | null = null
        let estEnd: string | null = null

        if (name === 'Order') {
          estStart = input.orderDate
          estEnd = input.orderDate
        } else if (name === 'Order Done') {
          estStart = input.estimatedDeliveryDate
          estEnd = input.estimatedDeliveryDate
        }

        return {
          order_id: rpcResult.order_id,
          stage_name: name,
          estimated_start_date: estStart,
          estimated_end_date: estEnd
        }
      })
      const { error: timelineError } = await supabase
        .from('order_stage_timelines')
        .insert(timelinesToInsert)
      if (timelineError) {
        console.error('Database timeline insert error:', timelineError.message)
      }
    }

    // Trigger Next.js App Router cache revalidation
    revalidatePath('/orders')
    revalidatePath('/sourcing')
    revalidatePath('/audit')
    revalidatePath('/inspection')
    revalidatePath('/logistics')
    revalidatePath('/production')

    return { success: true, orderCode: rpcResult.order_code, orderId: rpcResult.order_id }
  } catch (error: any) {
    console.error('Server Action uncaught error:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function proposeStageTimelineAction(
  orderId: string,
  stageName: string,
  estimatedStartDate: string,
  estimatedEndDate: string
) {
  try {
    const supabase = await createClient()
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('order_type, order_date, estimated_delivery_date')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return { success: false, error: 'Associated order not found.' }
    }

    const dbType = (order.order_type || '').toUpperCase()
    const isMaterialOrMixed = dbType === 'MATERIAL' || dbType === 'MIXED'
    
    if (isMaterialOrMixed && stageName.toLowerCase() !== 'production') {
      const { data: productionStage } = await supabase
        .from('order_stage_timelines')
        .select('estimated_start_date, estimated_end_date')
        .eq('order_id', orderId)
        .eq('stage_name', 'Production')
        .maybeSingle()

      const isProductionSetup = !!(productionStage?.estimated_start_date && productionStage?.estimated_end_date)
      if (!isProductionSetup) {
        return { success: false, error: 'For Material/Mixed orders, the Production department must set up the Production timeline first.' }
      }
    }

    // Fetch all existing stage timelines for this order to check for overlaps
    const { data: existingTimelines, error: timelinesError } = await supabase
      .from('order_stage_timelines')
      .select('stage_name, estimated_start_date, estimated_end_date')
      .eq('order_id', orderId)

    if (timelinesError) {
      return { success: false, error: `Failed to fetch existing timelines: ${timelinesError.message}` }
    }

    // Check overlap with any other stage timeline (excluding current stage, Order, and Order Done)
    const proposedStart = new Date(estimatedStartDate)
    proposedStart.setHours(0, 0, 0, 0)
    const proposedEnd = new Date(estimatedEndDate)
    proposedEnd.setHours(0, 0, 0, 0)

    if (existingTimelines) {
      for (const t of existingTimelines) {
        if (t.stage_name.toLowerCase() === stageName.toLowerCase()) continue
        if (t.stage_name.toLowerCase() === 'order' || t.stage_name.toLowerCase() === 'order done') continue
        if (!t.estimated_start_date || !t.estimated_end_date) continue

        const tStart = new Date(t.estimated_start_date)
        tStart.setHours(0, 0, 0, 0)
        const tEnd = new Date(t.estimated_end_date)
        tEnd.setHours(0, 0, 0, 0)

        if (proposedStart <= tEnd && proposedEnd >= tStart) {
          const formattedStart = t.estimated_start_date.split('T')[0]
          const formattedEnd = t.estimated_end_date.split('T')[0]
          return {
            success: false,
            error: `The proposed timeline overlaps with Stage: ${t.stage_name} (${formattedStart} to ${formattedEnd}).`
          }
        }
      }
    }

    const orderDate = order.order_date
    const estimatedDeliveryDate = order.estimated_delivery_date

    if (orderDate && estimatedDeliveryDate) {
      const getDateTimestamp = (d: string | Date) => {
        const date = new Date(d)
        date.setHours(0, 0, 0, 0)
        return date.getTime()
      }

      const proposedStartMs = getDateTimestamp(estimatedStartDate)
      const proposedEndMs = getDateTimestamp(estimatedEndDate)
      const orderStartMs = getDateTimestamp(orderDate)
      const orderEndMs = getDateTimestamp(estimatedDeliveryDate)

      if (proposedStartMs < orderStartMs) {
        return { success: false, error: `Start date cannot be before Order Date (${new Date(orderDate).toLocaleDateString()})` }
      }
      if (proposedEndMs > orderEndMs) {
        return { success: false, error: `End date cannot be after Estimated Delivery Date (${new Date(estimatedDeliveryDate).toLocaleDateString()})` }
      }

      const totalDurationMs = orderEndMs - orderStartMs
      const totalDays = Math.max(1, Math.round(totalDurationMs / (1000 * 60 * 60 * 24)) + 1)
      
      const proposedDurationMs = proposedEndMs - proposedStartMs
      const proposedDays = Math.max(1, Math.round(proposedDurationMs / (1000 * 60 * 60 * 24)) + 1)
      
      const maxAllowedDays = Math.max(1, Math.floor(totalDays * 0.5))

      if (proposedDays > maxAllowedDays) {
        return { 
          success: false, 
          error: `This stage duration (${proposedDays} days) exceeds 50% of the total order timeline (maximum allowed: ${maxAllowedDays} days out of ${totalDays} total days).` 
        }
      }
    }

    const { error } = await supabase
      .from('order_stage_timelines')
      .update({
        estimated_start_date: estimatedStartDate,
        estimated_end_date: estimatedEndDate,
        updated_at: new Date().toISOString()
      })
      .eq('order_id', orderId)
      .eq('stage_name', stageName)

    if (error) {
      console.error('Error proposing stage timeline:', error.message)
      return { success: false, error: error.message }
    }

    // Trigger Next.js App Router cache revalidation for all relevant pages
    revalidatePath('/orders')
    revalidatePath('/sourcing')
    revalidatePath('/audit')
    revalidatePath('/inspection')
    revalidatePath('/logistics')
    revalidatePath('/production')

    return { success: true }
  } catch (err: any) {
    console.error('Uncaught error proposing stage timeline:', err)
    return { success: false, error: err.message || 'An unexpected error occurred' }
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
      item_type: item.itemType || 'MATERIAL',
      uom: item.uom || 'pcs'
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

    // Update parent order stage if provided
    if (input.stage) {
      const { error: stageError } = await supabase
        .from('orders')
        .update({ stage: input.stage })
        .eq('id', input.orderId)
      if (stageError) {
        console.error('Database update stage error:', stageError.message)
      }
    }

    // Update stage timelines
    if (input.stageTimelines && input.stageTimelines.length > 0) {
      // Validate that stage timelines do not overlap with each other (excluding Order and Order Done)
      const userStages = input.stageTimelines.filter(
        st => st.stageName.toLowerCase() !== 'order' && st.stageName.toLowerCase() !== 'order done'
      )
      
      for (let i = 0; i < userStages.length; i++) {
        const a = userStages[i]
        if (!a.estimatedStartDate || !a.estimatedEndDate) continue
        const aStart = new Date(a.estimatedStartDate)
        aStart.setHours(0, 0, 0, 0)
        const aEnd = new Date(a.estimatedEndDate)
        aEnd.setHours(0, 0, 0, 0)

        for (let j = i + 1; j < userStages.length; j++) {
          const b = userStages[j]
          if (!b.estimatedStartDate || !b.estimatedEndDate) continue
          const bStart = new Date(b.estimatedStartDate)
          bStart.setHours(0, 0, 0, 0)
          const bEnd = new Date(b.estimatedEndDate)
          bEnd.setHours(0, 0, 0, 0)

          if (aStart <= bEnd && aEnd >= bStart) {
            const formattedAStart = a.estimatedStartDate.split('T')[0]
            const formattedAEnd = a.estimatedEndDate.split('T')[0]
            const formattedBStart = b.estimatedStartDate.split('T')[0]
            const formattedBEnd = b.estimatedEndDate.split('T')[0]
            return {
              success: false,
              error: `Timeline overlap detected between Stage: ${a.stageName} (${formattedAStart} to ${formattedAEnd}) and Stage: ${b.stageName} (${formattedBStart} to ${formattedBEnd}).`
            }
          }
        }
      }

      // Delete existing timelines
      await supabase
        .from('order_stage_timelines')
        .delete()
        .eq('order_id', input.orderId)

      // Re-insert timelines
      const timelinesToInsert = input.stageTimelines.map((st) => ({
        order_id: input.orderId,
        stage_name: st.stageName,
        estimated_start_date: st.estimatedStartDate,
        estimated_end_date: st.estimatedEndDate
      }))
      const { error: timelineError } = await supabase
        .from('order_stage_timelines')
        .insert(timelinesToInsert)
      if (timelineError) {
        console.error('Database timeline update error:', timelineError.message)
      }
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

    // Delete related supplier bids from order_suppliers
    const { error: deleteBidsError } = await supabase
      .from('order_suppliers')
      .delete()
      .eq('order_id', orderId)

    if (deleteBidsError) {
      console.warn('Could not delete some supplier bids:', deleteBidsError.message)
    }

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

export async function deleteOrdersBatchAction(orderIds: string[]) {
  try {
    const supabase = await createClient()

    // Delete related supplier bids from order_suppliers
    const { error: deleteBidsError } = await supabase
      .from('order_suppliers')
      .delete()
      .in('order_id', orderIds)

    if (deleteBidsError) {
      console.warn('Could not delete some supplier bids batch:', deleteBidsError.message)
    }

    const { error } = await supabase
      .from('orders')
      .delete()
      .in('id', orderIds)

    if (error) {
      console.error('Database batch delete error:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/orders')
    revalidatePath('/sourcing')
    return { success: true }
  } catch (error: any) {
    console.error('Server Action batch delete uncaught error:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function updateOrderStageAction(orderId: string, stage: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('orders')
      .update({ stage })
      .eq('id', orderId)

    if (error) {
      console.error('Database update stage error:', error.message)
      return { success: false, error: error.message }
    }

    // Trigger Next.js App Router cache revalidation for dependent pages
    revalidatePath('/orders')
    revalidatePath('/sourcing')
    revalidatePath('/dashboard')

    return { success: true }
  } catch (error: any) {
    console.error('Server Action update stage uncaught error:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

