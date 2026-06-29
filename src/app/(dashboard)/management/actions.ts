'use server'

import { createClient } from '@/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleApprovalAction(id: string, isApproved: boolean) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: isApproved })
      .eq('id', id)

    if (error) throw error

    revalidatePath('/management')
    return { success: true }
  } catch (error: any) {
    console.error('Error in toggleApprovalAction:', error.message)
    return { success: false, error: error.message || 'Failed to update approval status' }
  }
}

export async function updateUserRoleAndDeptAction(id: string, role: string, department: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ role, department })
      .eq('id', id)

    if (error) throw error

    revalidatePath('/management')
    return { success: true }
  } catch (error: any) {
    console.error('Error in updateUserRoleAndDeptAction:', error.message)
    return { success: false, error: error.message || 'Failed to update user role and department' }
  }
}

export async function deleteUserAction(id: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('delete_user_by_admin', { user_id: id })

    if (error) throw error

    revalidatePath('/management')
    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteUserAction:', error.message)
    return { success: false, error: error.message || 'Failed to delete user account' }
  }
}

export async function createUserAction(email: string, password: string, role: string, department: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('create_user_by_admin', {
      user_email: email,
      user_password: password,
      user_role: role,
      user_department: department
    })

    if (error) throw error

    revalidatePath('/management')
    return { success: true, userId: data }
  } catch (error: any) {
    console.error('Error in createUserAction:', error.message)
    return { success: false, error: error.message || 'Failed to create user account' }
  }
}

export async function createSupplierAction(input: {
  name: string
  email?: string
  phone?: string
  address?: string
  website?: string
  contactPerson?: string
  taxId?: string
  businessType?: string
}) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        name: input.name.trim(),
        email: input.email ? input.email.trim() : null,
        phone: input.phone ? input.phone.trim() : null,
        address: input.address ? input.address.trim() : null,
        website: input.website ? input.website.trim() : null,
        contact_person: input.contactPerson ? input.contactPerson.trim() : null,
        tax_id: input.taxId ? input.taxId.trim() : null,
        business_type: input.businessType ? input.businessType.trim() : null
      })
      .select('*, order_suppliers(*, orders(order_code), order_items(item_name)), factory_audits(*)')
      .single()

    if (error) throw error

    revalidatePath('/management')
    return { success: true, supplier: data }
  } catch (error: any) {
    console.error('Error in createSupplierAction:', error.message)
    return { success: false, error: error.message || 'Failed to create supplier profile' }
  }
}

export async function addSupplierCapabilityAction(
  supplierId: string,
  productName: string,
  targetPrice: number,
  leadTimeDays: string,
  description?: string,
  moq?: number,
  sku?: string,
  monthlyCapacity?: string
) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('supplier_capabilities')
      .insert({
        supplier_id: supplierId,
        product_name: productName.trim(),
        target_price: targetPrice,
        lead_time_days: leadTimeDays.trim(),
        description: description?.trim() || null,
        moq: moq || null,
        sku: sku?.trim() || null,
        monthly_capacity: monthlyCapacity?.trim() || null
      })
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/management/supplier/${supplierId}`)
    return { success: true, capability: data }
  } catch (error: any) {
    console.error('Error in addSupplierCapabilityAction:', error.message)
    return { success: false, error: error.message || 'Failed to add product' }
  }
}

export async function updateSupplierCapabilityAction(
  supplierId: string,
  capabilityId: string,
  productName: string,
  targetPrice: number,
  leadTimeDays: string,
  description?: string,
  moq?: number,
  sku?: string,
  monthlyCapacity?: string
) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('supplier_capabilities')
      .update({
        product_name: productName.trim(),
        target_price: targetPrice,
        lead_time_days: leadTimeDays.trim(),
        description: description?.trim() || null,
        moq: moq || null,
        sku: sku?.trim() || null,
        monthly_capacity: monthlyCapacity?.trim() || null
      })
      .eq('id', capabilityId)
      .select()
      .single()

    if (error) throw error

    revalidatePath(`/management/supplier/${supplierId}`)
    return { success: true, capability: data }
  } catch (error: any) {
    console.error('Error in updateSupplierCapabilityAction:', error.message)
    return { success: false, error: error.message || 'Failed to update product' }
  }
}

export async function deleteSupplierCapabilityAction(supplierId: string, capabilityId: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('supplier_capabilities')
      .delete()
      .eq('id', capabilityId)

    if (error) throw error

    revalidatePath(`/management/supplier/${supplierId}`)
    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteSupplierCapabilityAction:', error.message)
    return { success: false, error: error.message || 'Failed to delete product' }
  }
}

