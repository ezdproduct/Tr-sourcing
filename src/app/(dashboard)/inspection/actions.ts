'use server'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

export interface CreateInspectionInput {
  orderId: string
  portName: string
  containerNumber: string
  sealNumber: string
  defectRate: number
  inspector: string
}

export async function createInspectionAction(input: CreateInspectionInput) {
  try {
    const supabase = await createClient()

    const verdict = input.defectRate <= 2.5 ? 'Approved' : 'Rejected'

    // 1. Insert inspection record
    const { error: insertError } = await supabase
      .from('inspection_records')
      .insert({
        order_id: input.orderId,
        port_name: input.portName,
        container_number: input.containerNumber,
        seal_number: input.sealNumber,
        defect_rate: input.defectRate,
        verdict,
        inspector: input.inspector,
        date_checked: new Date().toISOString().split('T')[0]
      })

    if (insertError) {
      console.error('Error inserting inspection record:', insertError.message)
      return { success: false, error: insertError.message }
    }

    // 2. Fetch order code and contract value for creating logistics PO
    const { data: order, error: orderFetchError } = await supabase
      .from('orders')
      .select('order_code, contract_value, order_items(item_name, quantity)')
      .eq('id', input.orderId)
      .single()

    if (orderFetchError || !order) {
      console.error('Error fetching order for transition:', orderFetchError?.message)
      return { success: false, error: 'Order not found' }
    }

    // 3. If approved, transition stage to 'Logistic' and create a logistics record
    if (verdict === 'Approved') {
      const { error: stageError } = await supabase
        .from('orders')
        .update({ stage: 'Logistic' })
        .eq('id', input.orderId)

      if (stageError) {
        console.error('Error updating order stage to Logistic:', stageError.message)
      }

      // Generate GR and INV numbers
      const grNum = `GR-2026-${Math.floor(1000 + Math.random() * 9000)}`
      const invNum = `INV-${Math.floor(100000 + Math.random() * 900000)}`
      const prodName = order.order_items?.[0]?.item_name || 'Goods'
      const totalQty = order.order_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 100
      const contractValue = order.contract_value || 10000

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
          gr_qty: totalQty,
          po_price: contractValue,
          invoice_price: contractValue, // default matching
          status: 'pending'
        })

      if (logError) {
        console.error('Error creating logistics record:', logError.message)
      }
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
