'use server'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ScheduleAuditInput {
  supplierId: string
  auditDate: string
  auditorName: string
}

export async function scheduleAuditAction(input: ScheduleAuditInput) {
  try {
    const supabase = await createClient()

    const { data: existing, error: existingError } = await supabase
      .from('factory_audits')
      .select('id, audit_status')
      .eq('supplier_id', input.supplierId)
      .neq('audit_status', 'Completed')
      .maybeSingle()

    let queryResult;
    if (existing) {
      queryResult = await supabase
        .from('factory_audits')
        .update({
          audit_date: input.auditDate,
          auditor_name: input.auditorName.trim(),
          audit_status: 'Scheduled'
        })
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      queryResult = await supabase
        .from('factory_audits')
        .insert({
          supplier_id: input.supplierId,
          audit_date: input.auditDate,
          auditor_name: input.auditorName.trim(),
          audit_status: 'Scheduled'
        })
        .select()
        .single()
    }

    const { data, error } = queryResult

    if (error) {
      console.error('Error scheduling audit:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/audit')
    return { success: true, audit: data }
  } catch (error: any) {
    console.error('Uncaught error scheduling audit:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export interface SubmitAuditResultInput {
  auditId: string
  qcScore: number
  capacityScore: number
  notes: string
}

export async function submitAuditResultAction(input: SubmitAuditResultInput) {
  try {
    const supabase = await createClient()

    if (input.qcScore < 1 || input.qcScore > 5 || input.capacityScore < 1 || input.capacityScore > 5) {
      return { success: false, error: 'Scores must be between 1 and 5' }
    }

    const totalScore = (input.qcScore + input.capacityScore) / 2.0

    // Fetch the supplier_id and order_id for this audit first to find related orders
    const { data: auditRecord, error: fetchAuditError } = await supabase
      .from('factory_audits')
      .select('supplier_id, order_id')
      .eq('id', input.auditId)
      .single()

    if (fetchAuditError) {
      console.error('Error fetching audit for update:', fetchAuditError.message)
    }

    const { error } = await supabase
      .from('factory_audits')
      .update({
        quality_control_score: input.qcScore,
        production_capacity_score: input.capacityScore,
        total_score: totalScore,
        audit_notes: input.notes.trim(),
        audit_status: 'Completed'
      })
      .eq('id', input.auditId)

    if (error) {
      console.error('Error submitting audit result:', error.message)
      return { success: false, error: error.message }
    }

    // Handover back to Sourcing department by updating order stage to Sourcing
    if (auditRecord && auditRecord.order_id) {
      const { error: stageError } = await supabase
        .from('orders')
        .update({ stage: 'Sourcing' })
        .eq('id', auditRecord.order_id)
      if (stageError) {
        console.error('Error updating order stage back to Sourcing:', stageError.message)
      }
    } else if (auditRecord && auditRecord.supplier_id) {
      // Fallback for older legacy audits without direct order_id
      const { data: bids } = await supabase
        .from('order_suppliers')
        .select('order_id')
        .eq('supplier_id', auditRecord.supplier_id)
        .eq('is_shortlisted', true)

      if (bids && bids.length > 0) {
        const orderIds = Array.from(new Set(bids.map(b => b.order_id).filter(Boolean)))
        for (const orderId of orderIds) {
          const { error: stageError } = await supabase
            .from('orders')
            .update({ stage: 'Sourcing' })
            .eq('id', orderId)
          if (stageError) {
            console.error('Error updating order stage back to Sourcing:', stageError.message)
          }
        }
      }
    }

    revalidatePath('/audit')
    revalidatePath('/sourcing')
    revalidatePath('/orders')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error submitting audit result:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}

export async function deleteAuditAction(auditId: string) {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('factory_audits')
      .delete()
      .eq('id', auditId)

    if (error) {
      console.error('Error deleting audit:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/audit')
    return { success: true }
  } catch (error: any) {
    console.error('Uncaught error deleting audit:', error)
    return { success: false, error: error.message || 'An unexpected error occurred' }
  }
}
