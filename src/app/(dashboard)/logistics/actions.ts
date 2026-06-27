'use server'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

export async function matchLogisticsRecordAction(recordId: string) {
  try {
    const supabase = await createClient()

    // 1. Fetch record to get order_id
    const { data: record, error: fetchError } = await supabase
      .from('logistics_records')
      .select('order_id')
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

    // 3. Transition parent order to 'Closed'
    const { error: stageError } = await supabase
      .from('orders')
      .update({ stage: 'Closed' })
      .eq('id', record.order_id)

    if (stageError) {
      console.error('Error closing order:', stageError.message)
    }

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
      .select('id, order_id')
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
        // Close order
        await supabase
          .from('orders')
          .update({ stage: 'Closed' })
          .eq('id', record.order_id)
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
