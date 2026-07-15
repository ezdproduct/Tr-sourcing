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
  mainProducts?: string
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
        business_type: input.businessType ? input.businessType.trim() : null,
        main_products: input.mainProducts ? input.mainProducts.split(',').map(p => p.trim()).filter(Boolean) : []
      })
      .select('*, order_suppliers(*, orders(order_code), order_items(item_name)), factory_audits(*)')
      .single()

    if (error) throw error

    // Log the creation
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const userEmail = user?.email || null

      await supabase
        .from('order_activities')
        .insert({
          activity_text: `Supplier Profile Created: Supplier "${data.name}" (ID: ${data.id}) was created by ${userEmail || 'System'}.`
        })
    } catch (logErr: any) {
      console.error('Error recording supplier creation log:', logErr.message || logErr)
    }

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
  leadTimeDays?: string,
  description?: string,
  moq?: number,
  sku?: string,
  monthlyCapacity?: string,
  materialCostPercent?: number,
  laborCostPercent?: number,
  overheadCostPercent?: number,
  profitMarginPercent?: number,
  itemType?: string,
  imageUrl?: string,
  drawingUrl?: string
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || null

    const { data, error } = await supabase
      .from('supplier_capabilities')
      .insert({
        supplier_id: supplierId,
        product_name: productName.trim(),
        target_price: targetPrice,
        lead_time_days: leadTimeDays?.trim() || null,
        description: description?.trim() || null,
        moq: moq || null,
        sku: sku?.trim() || null,
        monthly_capacity: monthlyCapacity?.trim() || null,
        material_cost_percent: materialCostPercent ?? null,
        labor_cost_percent: laborCostPercent ?? null,
        overhead_cost_percent: overheadCostPercent ?? null,
        profit_margin_percent: profitMarginPercent ?? null,
        item_type: itemType || 'PRODUCT',
        image_url: imageUrl || null,
        drawing_url: drawingUrl || null
      })
      .select()
      .single()

    if (error) throw error

    // Record to history
    await recordSupplierProductHistory(
      supabase,
      supplierId,
      productName,
      targetPrice,
      monthlyCapacity || null,
      0,
      'CAPABILITY_CREATE',
      userEmail
    )

    // Log to order_activities
    try {
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('name')
        .eq('id', supplierId)
        .single()
      const supplierName = supplier?.name || 'Unknown'
      await supabase
        .from('order_activities')
        .insert({
          activity_text: `Supplier Profile Updated: Product "${productName.trim()}" added to Supplier "${supplierName}" (ID: ${supplierId}) by ${userEmail || 'System'}.`
        })
    } catch (logErr) {
      console.error('Error logging capability add to order_activities:', logErr)
    }

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
  leadTimeDays?: string,
  description?: string,
  moq?: number,
  sku?: string,
  monthlyCapacity?: string,
  materialCostPercent?: number,
  laborCostPercent?: number,
  overheadCostPercent?: number,
  profitMarginPercent?: number,
  itemType?: string,
  imageUrl?: string,
  drawingUrl?: string
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const userEmail = user?.email || null

    const { data, error } = await supabase
      .from('supplier_capabilities')
      .update({
        product_name: productName.trim(),
        target_price: targetPrice,
        lead_time_days: leadTimeDays?.trim() || null,
        description: description?.trim() || null,
        moq: moq || null,
        sku: sku?.trim() || null,
        monthly_capacity: monthlyCapacity?.trim() || null,
        material_cost_percent: materialCostPercent ?? null,
        labor_cost_percent: laborCostPercent ?? null,
        overhead_cost_percent: overheadCostPercent ?? null,
        profit_margin_percent: profitMarginPercent ?? null,
        item_type: itemType || 'PRODUCT',
        image_url: imageUrl || null,
        drawing_url: drawingUrl || null
      })
      .eq('id', capabilityId)
      .select()
      .single()

    if (error) throw error

    // Record to history
    await recordSupplierProductHistory(
      supabase,
      supplierId,
      productName,
      targetPrice,
      monthlyCapacity || null,
      0,
      'CAPABILITY_UPDATE',
      userEmail
    )

    // Log to order_activities
    try {
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('name')
        .eq('id', supplierId)
        .single()
      const supplierName = supplier?.name || 'Unknown'
      await supabase
        .from('order_activities')
        .insert({
          activity_text: `Supplier Profile Updated: Product "${productName.trim()}" updated for Supplier "${supplierName}" (ID: ${supplierId}) by ${userEmail || 'System'}.`
        })
    } catch (logErr) {
      console.error('Error logging capability update to order_activities:', logErr)
    }

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

    // Fetch capability details first to get the product name & price
    const { data: capabilityData } = await supabase
      .from('supplier_capabilities')
      .select('product_name, target_price')
      .eq('id', capabilityId)
      .maybeSingle()

    const { error } = await supabase
      .from('supplier_capabilities')
      .delete()
      .eq('id', capabilityId)

    if (error) throw error

    if (capabilityData) {
      const { data: { user } } = await supabase.auth.getUser()
      const userEmail = user?.email || null
      await recordSupplierProductHistory(
        supabase,
        supplierId,
        capabilityData.product_name,
        capabilityData.target_price || 0,
        'DELETED',
        0,
        'CAPABILITY_DELETE',
        userEmail
      )

      // Log to order_activities
      try {
        const { data: supplier } = await supabase
          .from('suppliers')
          .select('name')
          .eq('id', supplierId)
          .single()
        const supplierName = supplier?.name || 'Unknown'
        await supabase
          .from('order_activities')
          .insert({
            activity_text: `Supplier Profile Updated: Product "${capabilityData.product_name}" deleted from Supplier "${supplierName}" (ID: ${supplierId}) by ${userEmail || 'System'}.`
          })
      } catch (logErr) {
        console.error('Error logging capability delete to order_activities:', logErr)
      }
    }

    revalidatePath(`/management/supplier/${supplierId}`)
    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteSupplierCapabilityAction:', error.message)
    return { success: false, error: error.message || 'Failed to delete product' }
  }
}

export async function recordSupplierProductHistory(
  supabase: any,
  supplierId: string,
  productName: string,
  price: number,
  capacity: string | null,
  orderedQuantity: number,
  eventType: string,
  userEmail: string | null
) {
  try {
    const { error } = await supabase
      .from('supplier_product_history')
      .insert({
        supplier_id: supplierId,
        product_name: productName.trim(),
        price: price,
        capacity: capacity ? capacity.trim() : null,
        ordered_quantity: orderedQuantity,
        event_type: eventType,
        created_by: userEmail
      })

    if (error) {
      console.error('Error inserting supplier product history:', error.message)
    }
  } catch (err: any) {
    console.error('Uncaught error recording supplier product history:', err)
  }
}

export async function getSupplierProductHistoryAction(supplierId: string, productName: string) {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('supplier_product_history')
      .select('price, capacity, ordered_quantity, event_type, created_at, created_by')
      .eq('supplier_id', supplierId)
      .eq('product_name', productName.trim())
      .order('created_at', { ascending: true })

    if (error) throw error

    return { success: true, history: data }
  } catch (error: any) {
    console.error('Error fetching supplier product history:', error.message)
    return { success: false, error: error.message || 'Failed to fetch product history' }
  }
}

export async function saveUserMappingAction(sheetsUserId: string, sourcingEmail: string, notes?: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('sheets_user_mapping')
      .upsert({
        sheets_user_id: sheetsUserId.trim(),
        sourcing_email: sourcingEmail.trim(),
        notes: notes ? notes.trim() : null
      }, { onConflict: 'sheets_user_id' })

    if (error) throw error

    revalidatePath('/management')
    return { success: true }
  } catch (error: any) {
    console.error('Error in saveUserMappingAction:', error.message)
    return { success: false, error: error.message || 'Failed to save account mapping' }
  }
}

export async function deleteUserMappingAction(sheetsUserId: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('sheets_user_mapping')
      .delete()
      .eq('sheets_user_id', sheetsUserId)

    if (error) throw error

    revalidatePath('/management')
    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteUserMappingAction:', error.message)
    return { success: false, error: error.message || 'Failed to delete account mapping' }
  }
}


