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

    revalidatePath('/audit')
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
