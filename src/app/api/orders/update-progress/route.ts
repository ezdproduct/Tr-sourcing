import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/supabase/server'
import crypto from 'crypto'
import { sendGmail } from '@/lib/gmail'

const SECRET = process.env.NEXTAUTH_SECRET || process.env.R2_SECRET_ACCESS_KEY || 'sourcing-hub-secret-key-123'

// Token helpers
export function generateToken(orderId: string): string {
  const hmac = crypto.createHmac('sha256', SECRET)
  hmac.update(orderId)
  return `${orderId}:${hmac.digest('hex')}`
}

function verifyToken(token: string): string | null {
  try {
    const [orderId, signature] = token.split(':')
    if (!orderId || !signature) return null
    const hmac = crypto.createHmac('sha256', SECRET)
    hmac.update(orderId)
    const expectedSignature = hmac.digest('hex')
    if (crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
      return orderId
    }
  } catch (e) {
    return null
  }
  return null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const action = searchParams.get('action')
  const orderItemId = searchParams.get('orderItemId')

  try {
    if (!token || !action) {
      return new NextResponse(renderHtmlError('Missing required parameters.'), {
        headers: { 'Content-Type': 'text/html' },
        status: 400,
      })
    }

    const orderId = verifyToken(token)
    if (!orderId) {
      return new NextResponse(renderHtmlError('Invalid or expired secure token.'), {
        headers: { 'Content-Type': 'text/html' },
        status: 403,
      })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const supabase = await createClient()

    // 1. Fetch current order info
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, stage, order_code, target_delivery_date, delivery_address, contract_file_url, selected_supplier_id')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      return new NextResponse(renderHtmlError('Order not found or has been deleted.'), {
        headers: { 'Content-Type': 'text/html' },
        status: 404,
      })
    }

    let actionDescription = ''
    
    // 2. Perform DB mutations depending on action type
    if (action === 'confirm_deposit') {
      actionDescription = 'Confirmed Deposit Received & Started Supplier Production'
      
      // Update orders stage to 'Supplier Production' and log actual deposit date
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          stage: 'Supplier Production',
          deposit_confirmed_at: new Date().toISOString()
        })
        .eq('id', orderId)

      if (updateError) {
        throw new Error(`Failed to update order stage: ${updateError.message}`)
      }

      // Add to order_activities
      const { error: activityError } = await supabase
        .from('order_activities')
        .insert({
          order_id: orderId,
          activity_text: 'Automated System: Supplier confirmed deposit received. Supplier Production stage started.'
        })

      if (activityError) {
        console.error('Failed to log activity:', activityError.message)
      }
    } 
    else if (action === 'weekly_check_on_track') {
      actionDescription = 'Confirmed Production is ON-TRACK'

      // Add to order_activities
      const { error: activityError } = await supabase
        .from('order_activities')
        .insert({
          order_id: orderId,
          activity_text: 'Automated System: Supplier confirmed production is on-track via weekly email pulse.'
        })

      if (activityError) {
        throw new Error(`Failed to log activity: ${activityError.message}`)
      }
    } 
    else if (action === 'weekly_check_delayed') {
      actionDescription = 'Reported Production DELAYS'

      // Update order stage or add note if needed, but primarily log activity
      const { error: activityError } = await supabase
        .from('order_activities')
        .insert({
          order_id: orderId,
          activity_text: 'Automated System: Supplier reported delays in production via weekly email pulse.'
        })

      if (activityError) {
        throw new Error(`Failed to log activity: ${activityError.message}`)
      }
    } 
    else if (action === 'confirm_shipped' || action === 'shipped') {
      const allowedStages = ['po issued', 'partial po issued', 'po confirmed', 'arrived - awaiting inspection', 'production']
      if (!allowedStages.includes(order.stage.toLowerCase())) {
        return new NextResponse(renderHtmlError(`Action rejected: Order must be in PO ISSUED or PO CONFIRMED status (current: ${order.stage}) before marking as shipped.`), {
          headers: { 'Content-Type': 'text/html' },
          status: 400,
        })
      }

      actionDescription = 'Confirmed Shipped / Dispatched'

      // Update specific order item status if orderItemId is provided
      if (orderItemId) {
        const { error: itemError } = await supabase
          .from('order_items')
          .update({ item_status: 'ARRIVED' })
          .eq('id', orderItemId)
        if (itemError) {
          console.error('Error updating order item to ARRIVED:', itemError.message)
        }
      } else {
        const { error: itemsError } = await supabase
          .from('order_items')
          .update({ item_status: 'ARRIVED' })
          .eq('order_id', orderId)
        if (itemsError) {
          console.error('Error updating order items to ARRIVED:', itemsError.message)
        }
      }

      // Update orders stage to ARRIVED - AWAITING INSPECTION
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          stage: 'ARRIVED - AWAITING INSPECTION'
        })
        .eq('id', orderId)

      if (updateError) {
        throw new Error(`Failed to update order stage: ${updateError.message}`)
      }

      // Add to order_activities
      const { error: activityError } = await supabase
        .from('order_activities')
        .insert({
          order_id: orderId,
          activity_text: 'Automated System: Supplier confirmed order shipment. Status changed to ARRIVED - AWAITING INSPECTION.'
        })

      if (activityError) {
        console.error('Failed to log activity:', activityError.message)
      }
    }
    else if (action === 'confirm_po') {
      actionDescription = 'Confirmed & Accepted Purchase Order'

      // Update specific order item status to is_po_confirmed = true
      if (orderItemId) {
        const { error: itemUpdateError } = await supabase
          .from('order_items')
          .update({ is_po_confirmed: true })
          .eq('id', orderItemId)
        if (itemUpdateError) {
          console.error('Error updating order item PO confirmation:', itemUpdateError.message)
        }
      } else {
        const { error: itemsUpdateError } = await supabase
          .from('order_items')
          .update({ is_po_confirmed: true })
          .eq('order_id', orderId)
        if (itemsUpdateError) {
          console.error('Error updating order items PO confirmation:', itemsUpdateError.message)
        }
      }

      // Record history snapshots for confirmed items
      try {
        const itemsToRecord: any[] = []
        if (orderItemId) {
          const { data: item } = await supabase
            .from('order_items')
            .select('item_name, quantity, selected_supplier_id')
            .eq('id', orderItemId)
            .single()
          if (item) itemsToRecord.push(item)
        } else {
          const { data: items } = await supabase
            .from('order_items')
            .select('item_name, quantity, selected_supplier_id')
            .eq('order_id', orderId)
          if (items) itemsToRecord.push(...items)
        }

        // Fetch order supplier to fallback
        const { data: orderData } = await supabase
          .from('orders')
          .select('selected_supplier_id')
          .eq('id', orderId)
          .single()
        const orderSupplierId = orderData?.selected_supplier_id

        for (const item of itemsToRecord) {
          const supplierId = item.selected_supplier_id || orderSupplierId
          if (!supplierId) continue

          // Find quoted price from order_suppliers
          const { data: bid } = await supabase
            .from('order_suppliers')
            .select('quoted_price')
            .eq('supplier_id', supplierId)
            .eq('order_item_id', orderItemId || '')
            .maybeSingle()

          // Find capability price & capacity
          const { data: cap } = await supabase
            .from('supplier_capabilities')
            .select('target_price, monthly_capacity')
            .eq('supplier_id', supplierId)
            .eq('product_name', item.item_name)
            .maybeSingle()

          const price = bid?.quoted_price || cap?.target_price || 0
          const capacity = cap?.monthly_capacity || null

          // Insert into supplier_product_history
          await supabase
            .from('supplier_product_history')
            .insert({
              supplier_id: supplierId,
              product_name: item.item_name,
              price: price,
              capacity: capacity,
              ordered_quantity: item.quantity || 0,
              event_type: 'PO_CONFIRMED',
              created_by: 'Automated System'
            })
        }
      } catch (historyErr: any) {
        console.error('Failed to record PO confirmed history snapshots:', historyErr.message)
      }

      // Check if all items in this order are confirmed
      const { data: allItems } = await supabase
        .from('order_items')
        .select('is_po_confirmed')
        .eq('order_id', orderId)

      const allConfirmed = allItems && allItems.length > 0 && allItems.every((item: any) => item.is_po_confirmed)

      // Update orders stage to PO CONFIRMED or keep as PARTIAL PO ISSUED
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          stage: allConfirmed ? 'PO CONFIRMED' : 'PARTIAL PO ISSUED'
        })
        .eq('id', orderId)

      if (updateError) {
        throw new Error(`Failed to update order stage: ${updateError.message}`)
      }

      // Add to order_activities
      const { error: activityError } = await supabase
        .from('order_activities')
        .insert({
          order_id: orderId,
          activity_text: 'Automated System: Supplier confirmed and accepted the Purchase Order. Stage changed to PO CONFIRMED.'
        })

      if (activityError) {
        console.error('Failed to log activity:', activityError.message)
      }

      // Send a new email notifying supplier that production is started and they can mark as shipped when ready
      if (order.selected_supplier_id) {
        const { data: supplier } = await supabase
          .from('suppliers')
          .select('name, email')
          .eq('id', order.selected_supplier_id)
          .single()

        if (supplier && supplier.email) {
          let prodName = 'Goods'
          if (orderItemId) {
            const { data: item } = await supabase
              .from('order_items')
              .select('item_name')
              .eq('id', orderItemId)
              .single()
            if (item) {
              prodName = item.item_name
            }
          } else {
            const { data: items } = await supabase
              .from('order_items')
              .select('item_name')
              .eq('order_id', orderId)
            prodName = items?.[0]?.item_name || 'Goods'
          }

          const systemAgentId = process.env.GMAIL_SYSTEM_AGENT_ID ? parseInt(process.env.GMAIL_SYSTEM_AGENT_ID, 10) : 1
            const displayOrderId = order.order_code || `PO-${orderId.substring(0, 8).toUpperCase()}`
            const secureToken = generateToken(orderId)
            const confirmPoActionUrl = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=confirm_po&orderItemId=${orderItemId || ''}`
            const shipmentActionUrl = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=shipped&orderItemId=${orderItemId || ''}`
            const fullContractUrl = order.contract_file_url ? `${appUrl}${order.contract_file_url}` : ''

            const emailHtml = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <title>Production Started &amp; PO Confirmed</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
                  .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                  .header { border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px; text-align: center; }
                  .logo { font-size: 20px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.05em; }
                  h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 12px; text-align: center; }
                  p { font-size: 14px; color: #475569; margin-top: 0; margin-bottom: 16px; }
                  .details-box { background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px; margin-bottom: 24px; }
                  .detail-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 12px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 10px; }
                  .detail-row:last-child { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
                  .detail-label { color: #64748b; font-weight: 600; }
                  .detail-value { color: #0f172a; font-weight: 700; text-align: right; }
                  .button-group { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
                  .btn-emerald { display: block; background-color: #10b981; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(16,185,129,0.2); }
                  .btn-emerald:hover { background-color: #059669; }
                  .btn-indigo { display: block; background-color: #4f46e5; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(79,70,229,0.2); }
                  .btn-indigo:hover { background-color: #4338ca; }
                  .btn-slate { display: block; background-color: #64748b; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(100,116,139,0.2); }
                  .btn-slate:hover { background-color: #475569; }
                  .btn-disabled { display: block; background-color: #f1f5f9; color: #94a3b8 !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0; cursor: not-allowed; }
                  .footer { border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <div class="logo">TR Sourcing Hub</div>
                  </div>
                  <h1>Production Started &amp; PO Confirmed</h1>
                  <p>Dear <strong>${supplier.name}</strong> Team,</p>
                  <p>Thank you for confirming and accepting the Purchase Order. Your order status has been updated to <strong>PO Confirmed</strong> and production has officially started. Please save this email; once the production run is complete and cargo is ready for dispatch, please use the <strong>Mark as Shipped</strong> option below:</p>
                  
                  <div class="details-box">
                    <div class="detail-row">
                      <span class="detail-label">Order ID:</span>
                      <span class="detail-value">${displayOrderId}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Product Item:</span>
                      <span class="detail-value">${prodName}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Target Delivery Date:</span>
                      <span class="detail-value">${order.target_delivery_date || 'N/A'}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Delivery Address:</span>
                      <span class="detail-value">${order.delivery_address || 'N/A'}</span>
                    </div>
                  </div>
                  
                  <p style="margin-bottom: 24px;">Manage your order progress and shipment using the options below:</p>
                  
                  <div class="button-group">
                    <!-- Single Table Layout ensuring strict vertical structure in all email clients -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
                      <!-- Row 1: Immediate Action Group -->
                      <tr>
                        <td width="48%" valign="top">
                          <div class="btn-disabled">Confirm & Accept PO</div>
                        </td>
                        <td width="4%"></td>
                        <td width="48%" valign="top">
                          ${fullContractUrl ? `
                          <a href="${fullContractUrl}" class="btn-indigo" target="_blank">View Signed Contract</a>
                          ` : `
                          <div class="btn-disabled">View Signed Contract</div>
                          `}
                        </td>
                      </tr>
                      <!-- Spacer Row -->
                      <tr>
                        <td colspan="3" style="height: 16px; font-size: 16px; line-height: 16px;">&nbsp;</td>
                      </tr>
                      <!-- Row 2: Delayed Action Group -->
                      <tr>
                        <td colspan="3" valign="top">
                          <a href="${shipmentActionUrl}" class="btn-slate" target="_blank">Mark as Shipped</a>
                        </td>
                      </tr>
                    </table>
                  </div>
                  
                  <p style="margin-top: 28px;">Should you have any questions or require further clarification, please do not hesitate to contact our Sourcing team.</p>
                  
                  <div class="footer">
                    This is an automated notification from TR Sourcing Hub. Please do not reply directly to this email.
                  </div>
                </div>
              </body>
              </html>
            `

            try {
              await sendGmail({
                agentId: systemAgentId,
                toEmail: supplier.email,
                subject: `[TR Sourcing] Production Started - Order ID: ${displayOrderId}`,
                html: emailHtml,
              })
            } catch (gmailErr: any) {
              console.error('Failed to send confirmation email to supplier:', gmailErr)
            }
        }
      }
    }
    else {
      return new NextResponse(renderHtmlError('Unsupported interactive action type.'), {
        headers: { 'Content-Type': 'text/html' },
        status: 400,
      })
    }

    const orderCode = order.order_code || `PO-${orderId.substring(0, 8).toUpperCase()}`
    return new NextResponse(renderHtmlSuccess(orderId, actionDescription, orderCode), {
      headers: { 'Content-Type': 'text/html' },
      status: 200,
    })
  } catch (error: any) {
    console.error('Interactive update error:', error)
    return new NextResponse(renderHtmlError(error.message || 'Internal server error occurred.'), {
      headers: { 'Content-Type': 'text/html' },
      status: 500,
    })
  }
}

function renderHtmlSuccess(orderId: string, actionDescription: string, orderCode: string) {
  const secureToken = generateToken(orderId)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const shipmentActionUrl = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=shipped`
  const showShipButton = actionDescription === 'Confirmed & Accepted Purchase Order'

  let displayTitle = 'Your feedback has been successfully recorded'
  let stepItems: string[] = []

  if (actionDescription === 'Confirmed & Accepted Purchase Order') {
    displayTitle = 'The Purchase Order has been successfully confirmed'
    stepItems = [
      'The supplier reviews specifications and initiates production.',
      'Sourcing team tracks weekly production metrics and delays.',
      'Once ready, supplier uses the "Mark as Shipped" action to register cargo.'
    ]
  } else if (actionDescription === 'Confirmed Shipped / Dispatched') {
    displayTitle = 'Your Cargo has been successfully marked as shipped'
    stepItems = [
      'Cargo arrives at port container depot for logistics processing.',
      'QC officers perform physical port inspections and sealing check.',
      'Approved items are transferred directly to digital inventory.'
    ]
  } else if (actionDescription === 'Confirmed Deposit Received') {
    displayTitle = 'Your Deposit receipt has been successfully confirmed'
    stepItems = [
      'Production run starts on factory assembly lines.',
      'Weekly progress check is tracked by procurement coordinators.',
      'Materials will be dispatched based on target completion date.'
    ]
  } else {
    stepItems = [
      'Our operations team has been notified of the update.',
      'The master order stage was updated in the secure tracking database.',
      'Subsequent milestones and weekly reports will automatically pulse.'
    ]
  }

  // Format the current timestamp like: 03/07/26 13:40
  const formattedDate = new Date().toLocaleString('en-US', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace(',', '')

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Update Confirmed - TR Sourcing Hub</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
          background-color: #f8fafc;
          color: #0f172a;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 24px;
          box-sizing: border-box;
        }
        .card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 32px;
          padding: 40px 32px;
          text-align: center;
          max-width: 440px;
          width: 100%;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.03), 0 8px 10px -6px rgba(0, 0, 0, 0.03);
          animation: scaleUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes scaleUp {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .header-container {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          margin-bottom: 28px;
        }
        .logo-container {
          width: 72px;
          display: flex;
          justify-content: flex-start;
          animation: fadeIn 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .logo-container svg {
          height: 72px;
          width: 72px;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(207, 69, 69, 0.1);
        }
        .success-badge {
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: popIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes popIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .success-badge svg {
          width: 100%;
          height: 100%;
        }
        .header-spacer {
          width: 72px;
        }
        h1 {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 24px;
          color: #0f172a;
          line-height: 1.35;
          letter-spacing: -0.015em;
        }
        .details-card {
          background: #fafafa;
          border: 1px solid #f1f5f9;
          border-radius: 20px;
          padding: 16px 20px;
          margin-bottom: 24px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #f1f5f9;
          font-size: 13.5px;
        }
        .detail-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .detail-row:first-child {
          padding-top: 0;
        }
        .detail-label {
          color: #64748b;
          font-weight: 500;
        }
        .detail-value {
          color: #0f172a;
          font-weight: 600;
          text-align: right;
        }
        .detail-value.success {
          color: #10b981;
        }
        .action-btn {
          display: block;
          width: 100%;
          background: #0f172a;
          color: #ffffff !important;
          text-decoration: none;
          font-size: 14.5px;
          font-weight: 600;
          padding: 14px 24px;
          border-radius: 14px;
          margin-top: 8px;
          text-align: center;
          box-sizing: border-box;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .action-btn:hover {
          background: #1e293b;
        }
        .action-btn:active {
          transform: scale(0.985);
        }
        .next-steps-container {
          margin-top: 28px;
          padding-top: 24px;
          border-top: 1px solid #f1f5f9;
          text-align: left;
        }
        .section-title {
          font-size: 11px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 16px;
        }
        .step-row {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 13px;
          line-height: 1.45;
          color: #64748b;
        }
        .step-row:last-child {
          margin-bottom: 0;
        }
        .step-num {
          width: 20px;
          height: 20px;
          background: #eff6ff;
          color: #2563eb;
          font-size: 10px;
          font-weight: 700;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header-container">
          <div class="logo-container">
          <svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048">
            <rect fill="#cf4545" width="2048" height="2048"/>
            <path fill="#fff8f8" d="M623.1,839.06v370.67H252.43v-370.67h370.67ZM586.35,875.81h-297.17v297.17h297.17v-297.17Z"/>
            <path fill="#fff8f8" d="M1453.9,908.56l29.55.81.4,6.38c13.43-12.04,35.91-11.49,49.52.02,1.79,1.52,5.83,7.19,7.2,7.18,11.63-20.69,43.91-20.8,58.7-3.58,4.39,5.11,9.61,16.42,9.61,23.14v63.51h-30.36v-58.72c0-3.2-4.14-8.93-6.92-10.65-4.16-2.57-12.5-2.49-16.8-.3-1.76.9-8.23,6.9-8.23,8.55v61.11h-30.36v-57.92c0-.27-1.17-4.36-1.42-4.97-3.93-9.64-16.79-10.78-24.54-5.01-1.08.8-5.99,5.88-5.99,6.79v61.11h-30.36v-97.46Z"/>
            <path fill="#fff8f8" d="M960.21,1041.97v46.33c29.2-21.71,68.3-.39,72.6,34.04,5.3,42.44-36.59,75.22-73.39,49.04v7.19h-29.57v-136.6h30.36ZM974.38,1107.67c-4.43.75-12.48,5.68-13.81,10.16-.78,2.62-.83,21.41-.2,24.23,1.39,6.14,11.97,10.6,17.77,10.98,33.66,2.2,32.55-51.5-3.77-45.37Z"/>
            <path fill="#fff8f8" d="M963.01,1006.02c-.39-.12-.94-.87-1.08-1.33-.68-2.1,1.56-5.07-.5-5.05-33.07,24.31-75.69-7.19-73.01-45.84,2.42-34.79,43.3-61.47,72.99-38.06l.39-6.38c10.02-.89,20.38-1.55,30.36,0v95.46l-1.2,1.2h-27.96ZM936.04,935.11c-20.13,3.4-22.98,35.88-4.02,43.58,9.57,3.89,23.96,1.64,29.26-7.97l-.18-26.63c-4.86-8.08-16.27-10.47-25.06-8.98Z"/>
            <path fill="#fff8f8" d="M889.11,1179.37l.8-6.38c-4.12.91-6.94,4.34-11.19,5.97-29.48,11.3-61.41-14.85-63.13-44.69-2.04-35.36,34.35-66.57,67.67-49.29,2.09,1.08,4.1,3.43,5.47,4.12,1.67.84.75-.9.78-1.19.14-1.69.19-3.54-.39-5.18l28.55-.65,1.73,1.15-.73,96.16h-29.56ZM868.74,1107.93c-30.6.3-29.51,47.37,1.62,45.92,4.33-.2,15.6-4.16,17.36-8.23.97-2.25,1.1-23.99.64-27.4-.9-6.73-13.77-10.34-19.61-10.29Z"/>
            <path fill="#fff8f8" d="M1717.53,966.08h-68.7c9.11,20.1,38.04,19.24,51.92,4.8l11.77,23.57c-23.92,22.14-71.56,17.45-88.06-11.58-16.06-28.27-1.48-65.28,29.98-73.9,37.67-10.32,69.53,19.13,63.1,57.11ZM1648.82,944.51h39.94c-4.46-19.42-34.07-17.99-39.94,0Z"/>
            <path fill="#fff8f8" d="M1186.29,1138.63h-69.5c9.45,19.51,36.98,19.44,51.44,5.63l12.35,22.61c-29.1,27.38-90.45,13.33-94.17-30.21-5.33-62.3,78.16-77.61,96.7-26.4.75,2.08,3.18,9.55,3.18,11.19v17.18ZM1156.73,1117.06c-3.57-19.43-34.66-18.29-39.14,0h39.14Z"/>
            <path fill="#fff8f8" d="M1313.94,907.2c74.82-6.75,78.22,101.87,5.29,101.08-68.18-.74-70.88-95.16-5.29-101.08ZM1314.71,935.13c-8.46,1.24-16.24,9.33-17.3,17.86-4.17,33.86,39.45,35.41,43.78,10.23,3.01-17.45-8.54-30.71-26.49-28.09Z"/>
            <polygon fill="#fff8f8" points="836.39 871.02 836.39 899.77 792.45 899.77 792.45 1006.02 760.5 1006.02 760.5 899.77 716.56 899.77 716.56 871.02 836.39 871.02"/>
            <polygon fill="#fff8f8" points="836.39 1043.57 836.39 1072.33 792.45 1072.33 792.45 1178.57 760.5 1178.57 760.5 1072.33 716.56 1072.33 716.56 1043.57 836.39 1043.57"/>
            <path fill="#fff8f8" d="M1097.61,1006.02h-30.36v-60.31c0-1.44-3.49-6.79-4.84-7.94-5.26-4.5-14.57-3.9-20.19-.32-1.51.97-6.92,6.97-6.92,8.26v60.31h-30.36v-97.46h29.55s.02,7.99.02,7.99c18.68-17.22,50.27-10.64,60.05,13.04.75,1.83,3.05,8.23,3.05,9.73v66.7Z"/>
            <path fill="#fff8f8" d="M1188.68,909.36c6.32-1.9,12.98.19,19.18-.81-2.28-30.11,23.42-45.21,51.16-39.58,3.18.65,18.54,6,18.21,9.48l-11.07,22.12c-9.13-9.29-29.26-8.41-27.86,7.91l28.67.88v24.37l-1.2,1.2h-27.56v71.1h-30.36l-1.2-71.1h-16.78l-1.2-1.2v-24.37Z"/>
            <path fill="#fff8f8" d="M1181.39,916.67l-11.09,23.85c-4.9-6.08-26.69-13.52-31.19-6.05-5.41,8.98,15.67,10.77,20.65,12.21,11.16,3.22,22.92,10.65,24.73,23.2,5.64,39.04-41.12,44.39-67.98,32.83-2.11-.91-11.75-5.56-11.36-7.91l12.05-22.32c8,7.31,22.26,13.62,33.17,10.79,3.36-.87,5.96-4.11,4.37-7.59-2.17-4.74-19.1-7.55-24.57-9.8-16.14-6.62-26.37-20.65-19.66-38.45,9.57-25.36,51.98-24.83,70.89-10.77Z"/>
            <rect fill="#fff8f8" x="1045.69" y="1041.97" width="30.36" height="136.6"/>
            <path fill="#fff8f8" d="M1728.71,909.76c.18-.58,1.27-1.27,2-1.2l29.07.89.09,7.9c11.43-5.04,23.57-3.73,35.15.01l-11.22,27.15c-9.56-4.21-18.74.11-23.17,9.16l-1.56,52.36h-30.36v-96.26Z"/>
            <path fill="#fff8f8" d="M1411.56,908.56v8.78c11.22-4.18,25.3-5.3,35.88,1.19l-11.12,25.98c-6.88-3.12-15.91-1.51-20.78,4.38-.75.91-3.98,7.29-3.98,8v49.13h-30.36v-96.66c.78.26,1.73-.8,2-.8h28.36Z"/>
            <path fill="#fff8f8" d="M857.16,908.56v8.78c11.22-4.18,25.3-5.3,35.88,1.19l-11.88,25.63c-6.86-2.74-15.89-.88-20.35,5.19-.66.9-3.65,6.93-3.65,7.54v49.13h-30.36v-97.46h30.36Z"/>
            <polygon fill="#fff8f8" points="548.8 950.9 548.8 987.65 512.05 987.65 512.05 1098.69 475.31 1098.69 475.31 987.65 400.21 987.65 400.21 1098.69 364.27 1098.69 364.27 987.65 326.72 987.65 326.72 950.9 548.8 950.9"/>
          </svg>
        </div>
        
        <div class="success-badge">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C11.3 2 10.6 2.4 10.3 3.1L9.7 4.5C9.5 4.9 9.1 5.2 8.7 5.3L7.2 5.6C6.5 5.7 5.9 6.2 5.7 6.9L5.3 8.4C5.2 8.8 4.9 9.2 4.5 9.4L3.1 10C2.4 10.3 2 11 2 11.7V12.3C2 13 2.4 13.7 3.1 14L4.5 14.6C4.9 14.8 5.2 15.2 5.3 15.6L5.7 17.1C5.9 17.8 6.5 18.3 7.2 18.4L8.7 18.7C9.1 18.8 9.5 19.1 9.7 19.5L10.3 20.9C10.6 21.6 11.3 22 12 22C12.7 22 13.4 21.6 13.7 20.9L14.3 19.5C14.5 19.1 14.9 18.8 15.3 18.7L16.8 18.4C17.5 18.3 18.1 17.8 18.3 17.1L18.7 15.6C18.8 15.2 19.1 14.8 19.5 14.6L20.9 14C21.6 13.7 22 13 22 12.3V11.7C22 11 21.6 10.3 20.9 10L19.5 9.4C19.1 9.2 18.8 8.8 18.7 8.4L18.3 6.9C18.1 6.2 17.5 5.7 16.8 5.6L15.3 5.3C14.9 5.2 14.5 4.9 14.3 4.5L13.7 3.1C13.4 2.4 12.7 2 12 2Z" fill="#d1fae5"/>
            <path d="M9 12L11 14L15 10" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="header-spacer"></div>
      </div>

        <h1>${displayTitle}</h1>

        <div class="details-card">
          <div class="detail-row">
            <span class="detail-label">Order Code</span>
            <span class="detail-value">${orderCode}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Action</span>
            <span class="detail-value">${actionDescription}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Date & Time</span>
            <span class="detail-value">${formattedDate}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Status</span>
            <span class="detail-value success">Success</span>
          </div>
        </div>





      </div>
  </body>
    </html>
  `
}

function renderHtmlError(errorMessage: string) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Authentication Error - TR Sourcing Hub</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
          background: radial-gradient(circle at top, #0f172a 0%, #020617 100%);
          color: #f8fafc;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 20px;
          box-sizing: border-box;
        }
        .card {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-radius: 24px;
          padding: 40px;
          text-align: center;
          max-width: 460px;
          width: 100%;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          animation: scaleUp 0.4s ease-out;
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .icon-circle {
          width: 72px;
          height: 72px;
          background: rgba(239, 68, 68, 0.1);
          border: 2px solid rgba(239, 68, 68, 0.4);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          color: #ef4444;
          box-shadow: 0 0 20px rgba(239, 68, 68, 0.15);
        }
        .icon-circle svg {
          width: 36px;
          height: 36px;
          stroke-width: 2.5;
        }
        h1 {
          font-size: 24px;
          font-weight: 800;
          margin: 0 0 12px;
          letter-spacing: -0.025em;
          background: linear-gradient(to right, #ffffff, #fca5a5);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        p {
          color: #94a3b8;
          font-size: 15px;
          line-height: 1.6;
          margin: 0 0 24px;
        }
        .error-details {
          background: rgba(239, 68, 68, 0.05);
          border: 1px solid rgba(239, 68, 68, 0.1);
          border-radius: 16px;
          padding: 16px;
          color: #fca5a5;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 24px;
          text-align: left;
        }
        .footer-text {
          font-size: 12px;
          color: #475569;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon-circle">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        </div>
        <h1>Verification Failed</h1>
        <p>We were unable to verify your secure handshake link. Please request a fresh update link from your Sourcing team.</p>
        
        <div class="error-details">
          <strong>Error Description:</strong><br>
          ${errorMessage}
        </div>

        <div class="footer-text">
          TR Sourcing System Portal &bull; Secure Encrypted Handshake
        </div>
      </div>
    </body>
    </html>
  `
}
