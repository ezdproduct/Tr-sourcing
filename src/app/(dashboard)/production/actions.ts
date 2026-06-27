'use server'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

export interface UpdateProductionJobInput {
  jobId: string
  outputQty: number
  defectRate: number
}

export async function updateProductionJobProgressAction(input: UpdateProductionJobInput) {
  try {
    const supabase = await createClient()

    const { data: job, error: fetchError } = await supabase
      .from('production_jobs')
      .select('target_qty')
      .eq('id', input.jobId)
      .single()

    if (fetchError || !job) {
      console.error('Error fetching job for progress update:', fetchError?.message)
      return { success: false, error: 'Job not found' }
    }

    const progressPct = Math.min(100, Math.max(0, (input.outputQty / job.target_qty) * 100))

    const { error } = await supabase
      .from('production_jobs')
      .update({
        output_qty: input.outputQty,
        defect_rate: input.defectRate,
        progress_pct: Number(progressPct.toFixed(2))
      })
      .eq('id', input.jobId)

    if (error) {
      console.error('Error updating production progress:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/production')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error updating production progress:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function finalizeProductionJobAction(jobId: string) {
  try {
    const supabase = await createClient()

    // 1. Fetch current job
    const { data: job, error: jobError } = await supabase
      .from('production_jobs')
      .select('*, orders(order_code)')
      .eq('id', jobId)
      .single()

    if (jobError || !job) {
      console.error('Error fetching production job:', jobError?.message)
      return { success: false, error: 'Production job not found' }
    }

    // 2. Update job status to completed
    const { error: updateError } = await supabase
      .from('production_jobs')
      .update({
        status: 'completed',
        output_qty: job.target_qty,
        progress_pct: 100.00,
      })
      .eq('id', jobId)

    if (updateError) {
      console.error('Error updating production job:', updateError.message)
      return { success: false, error: updateError.message }
    }

    // 3. Transition parent order stage to 'Inspection'
    const { error: orderError } = await supabase
      .from('orders')
      .update({ stage: 'Inspection' })
      .eq('id', job.order_id)

    if (orderError) {
      console.error('Error updating order stage to Inspection:', orderError.message)
    }

    // 4. Create an inspection record automatically
    const containerNum = `TRSU-${Math.floor(100000 + Math.random() * 900000)}-${Math.floor(Math.random() * 9)}`
    const sealNum = `SL-${Math.floor(1000 + Math.random() * 9000)}`
    
    const { error: inspectError } = await supabase
      .from('inspection_records')
      .insert({
        order_id: job.order_id,
        port_name: 'Cat Lai Port, HCMC',
        container_number: containerNum,
        seal_number: sealNum,
        defect_rate: job.defect_rate || 0.8,
        verdict: (job.defect_rate || 0.8) <= 2.5 ? 'Approved' : 'Rejected',
        inspector: 'John Carter (Sourcing Lead)',
        date_checked: new Date().toISOString().split('T')[0]
      })

    if (inspectError) {
      console.error('Error creating auto-inspection record:', inspectError.message)
    }

    revalidatePath('/production')
    revalidatePath('/inspection')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error finalizing production job:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}
