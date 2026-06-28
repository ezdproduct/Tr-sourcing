'use server'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

export interface CreateInspectionInput {
  orderId: string
  orderItemId: string
  portName: string
  containerNumber: string
  sealNumber: string
  defectRate: number
  inspector: string
  verifiedQuantity: number
  qualityStatus: 'PASS' | 'FAIL'
  defectNotes?: string
}

export async function createInspectionAction(input: CreateInspectionInput) {
  try {
    const supabase = await createClient()

    const verdict = input.qualityStatus === 'PASS' ? 'Approved' : 'Rejected'

    // 1. Insert inspection record
    const { error: insertError } = await supabase
      .from('inspection_records')
      .insert({
        order_id: input.orderId,
        order_item_id: input.orderItemId,
        port_name: input.portName,
        container_number: input.containerNumber,
        seal_number: input.sealNumber,
        defect_rate: input.defectRate,
        verdict,
        inspector: input.inspector,
        date_checked: new Date().toISOString().split('T')[0],
        verified_quantity: input.verifiedQuantity,
        quality_status: input.qualityStatus,
        defect_notes: input.defectNotes || null
      })

    if (insertError) {
      console.error('Error inserting inspection record:', insertError.message)
      return { success: false, error: insertError.message }
    }

    // 2. Fetch order code and contract value
    const { data: order, error: orderFetchError } = await supabase
      .from('orders')
      .select('order_code, contract_value')
      .eq('id', input.orderId)
      .single()

    if (orderFetchError || !order) {
      console.error('Error fetching order for transition:', orderFetchError?.message)
      return { success: false, error: 'Order not found' }
    }

    // 3. Update specific order item status and verified_quantity
    const { error: itemError } = await supabase
      .from('order_items')
      .update({
        item_status: input.qualityStatus === 'PASS' ? 'INSPECTION_PASSED' : 'ARRIVED',
        verified_quantity: input.verifiedQuantity
      })
      .eq('id', input.orderItemId)

    if (itemError) {
      console.error('Error updating order item status:', itemError.message)
    }

    // 4. Query all order items to see if all are fully inspected
    const { data: allItems } = await supabase
      .from('order_items')
      .select('item_status')
      .eq('order_id', input.orderId)

    const allInspected = allItems && allItems.length > 0 && allItems.every(
      (item: any) => item.item_status === 'INSPECTION_PASSED' || 
                     item.item_status === 'IN_STOCK' || 
                     item.item_status === 'COMPLETED'
    )

    if (input.qualityStatus === 'PASS') {
      // SUCCESS: set stage to 'INSPECTION PASSED' if all are inspected, else keep awaiting
      const { error: stageError } = await supabase
        .from('orders')
        .update({ stage: allInspected ? 'INSPECTION PASSED' : 'ARRIVED - AWAITING INSPECTION' })
        .eq('id', input.orderId)

      if (stageError) {
        console.error('Error updating order stage:', stageError.message)
      }

      // Add activity log
      await supabase
        .from('order_activities')
        .insert({
          order_id: input.orderId,
          activity_text: `Automated System: Port Inspection passed for item. Quantity verified: ${input.verifiedQuantity}. Released to Logistics & Inbound.`
        })

      // Generate GR and INV numbers
      const grNum = `GR-2026-${Math.floor(1000 + Math.random() * 9000)}`
      const invNum = `INV-${Math.floor(100000 + Math.random() * 900000)}`

      // Fetch current item details
      const { data: currentItem } = await supabase
        .from('order_items')
        .select('item_name, quantity')
        .eq('id', input.orderItemId)
        .single()

      const prodName = currentItem?.item_name || 'Goods'
      const totalQty = currentItem?.quantity || 100

      // Get shortlisted supplier bid's price
      const { data: bid } = await supabase
        .from('order_suppliers')
        .select('quoted_price')
        .eq('order_item_id', input.orderItemId)
        .eq('is_shortlisted', true)
        .single()

      const itemPrice = bid ? (Number(bid.quoted_price) * totalQty) : (order.contract_value || 10000)

      // Insert logistics record
      const { error: logError } = await supabase
        .from('logistics_records')
        .insert({
          order_id: input.orderId,
          po_number: order.order_code,
          gr_number: grNum,
          invoice_number: invNum,
          product_name: prodName,
          po_qty: totalQty,
          gr_qty: input.verifiedQuantity,
          po_price: itemPrice,
          invoice_price: itemPrice,
          status: 'pending'
        })

      if (logError) {
        console.error('Error creating logistics record:', logError.message)
      }
    } else {
      // FAILURE: set stage to 'INSPECTION FAILED', dispute_flag = true
      const { error: stageError } = await supabase
        .from('orders')
        .update({ 
          stage: 'INSPECTION FAILED',
          dispute_flag: true 
        })
        .eq('id', input.orderId)

      if (stageError) {
        console.error('Error updating order stage to INSPECTION FAILED:', stageError.message)
      }

      // Add activity log
      await supabase
        .from('order_activities')
        .insert({
          order_id: input.orderId,
          activity_text: 'Automated System: Port Inspection failed. Inbound process blocked, order state frozen, and supplier dispute flag logged.'
        })
    }

    revalidatePath('/inspection')
    revalidatePath('/logistics')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error creating inspection:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}
