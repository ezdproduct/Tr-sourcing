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
