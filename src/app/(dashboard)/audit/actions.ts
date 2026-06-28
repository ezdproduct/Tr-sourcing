'use server'

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

export interface ScheduleAuditInput {
  supplierId: string
  orderId: string | null
  auditDate: string
  auditorName: string
}

export async function scheduleAuditAction(input: ScheduleAuditInput) {
  try {
    const supabase = await createClient()

    // Find the pending QC assignment audit record for this supplier and order
    let query = supabase
      .from('factory_audits')
      .select('id, audit_status')
      .eq('supplier_id', input.supplierId)
      .neq('audit_status', 'Completed')

    if (input.orderId) {
      query = query.eq('order_id', input.orderId)
    } else {
      query = query.is('order_id', null)
    }

    const { data: existing, error: existingError } = await query.maybeSingle()

    if (existingError) {
      console.error('Error checking for existing audit:', existingError.message)
    }

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
      // Fallback: insert new Scheduled audit record if no pending QC record was found
      queryResult = await supabase
        .from('factory_audits')
        .insert({
          supplier_id: input.supplierId,
          order_id: input.orderId,
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

export async function submitAuditResultAction(formData: FormData) {
  try {
    const supabase = await createClient()

    const auditId = formData.get('auditId') as string
    const auditVerdict = formData.get('auditVerdict') as 'PASS' | 'PASS WITH CONDITIONS' | 'FAIL'
    const notes = (formData.get('notes') as string) || ''
    const certificationsJson = formData.get('certifications') as string
    const certifications = certificationsJson ? (JSON.parse(certificationsJson) as string[]) : []
    const pdfFile = formData.get('pdfFile') as File | null

    if (!auditId) {
      return { success: false, error: 'Audit ID is required' }
    }

    if (!auditVerdict) {
      return { success: false, error: 'Audit verdict is required' }
    }

    // 1. Fetch the supplier_id, order_id and existing report_url for this audit
    const { data: auditRecord, error: fetchAuditError } = await supabase
      .from('factory_audits')
      .select('supplier_id, order_id, report_url')
      .eq('id', auditId)
      .single()

    if (fetchAuditError) {
      console.error('Error fetching audit for update:', fetchAuditError.message)
    }

    const supplierId = auditRecord?.supplier_id

    // 2. Handle Direct Cloudflare R2 Upload if a file is provided
    let reportUrl = auditRecord?.report_url || null

    if (pdfFile && pdfFile.size > 0 && supplierId) {
      const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png'
      ]

      if (!allowedMimeTypes.includes(pdfFile.type)) {
        return { success: false, error: 'Unsupported file format. Please upload PDF, DOCX, XLSX, or Images.' }
      }

      if (pdfFile.size > 10 * 1024 * 1024) {
        return { success: false, error: 'File size exceeds 10MB limit' }
      }

      const buffer = Buffer.from(await pdfFile.arrayBuffer())
      const sanitizedFilename = `${Date.now()}-${pdfFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const filenameKey = `qc-audits/supplier-${supplierId}/${sanitizedFilename}`

      const s3Client = new S3Client({
        endpoint: process.env.R2_ENDPOINT_URL,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
        },
        region: 'auto',
      })

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME || 'sourcinghub',
          Key: filenameKey,
          Body: buffer,
          ContentType: pdfFile.type,
        })
      )

      reportUrl = `/api/images?key=${filenameKey}`
    }

    // 3. Update 'factory_audits' row
    const { error } = await supabase
      .from('factory_audits')
      .update({
        quality_control_score: null,
        production_capacity_score: null,
        total_score: null,
        audit_notes: notes.trim(),
        audit_verdict: auditVerdict,
        report_url: reportUrl,
        certifications: certifications,
        audit_status: 'Completed'
      })
      .eq('id', auditId)

    if (error) {
      console.error('Error submitting audit result:', error.message)
      return { success: false, error: error.message }
    }

    // 4. Update the global 'suppliers' table with the new certifications profile
    if (supplierId) {
      const { error: supplierUpdateError } = await supabase
        .from('suppliers')
        .update({ certifications })
        .eq('id', supplierId)
      if (supplierUpdateError) {
        console.error('Error updating supplier certifications:', supplierUpdateError.message)
      }
    }

    // Determine the next stage based on the QC Verdict
    const nextStage = (auditVerdict === 'PASS' || auditVerdict === 'PASS WITH CONDITIONS')
      ? 'Ready for PO'
      : 'QC Failed - Re-Route'

    if (auditRecord && auditRecord.order_id) {
      const { error: stageError } = await supabase
        .from('orders')
        .update({ stage: nextStage })
        .eq('id', auditRecord.order_id)
      if (stageError) {
        console.error(`Error updating order stage back to ${nextStage}:`, stageError.message)
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
            .update({ stage: nextStage })
            .eq('id', orderId)
          if (stageError) {
            console.error(`Error updating order stage back to ${nextStage}:`, stageError.message)
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
