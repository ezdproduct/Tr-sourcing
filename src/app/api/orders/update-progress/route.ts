import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/supabase/server'
import crypto from 'crypto'
import { Resend } from 'resend'

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
  try {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get('token')
    const action = searchParams.get('action')
    const orderItemId = searchParams.get('orderItemId')

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
      actionDescription = 'Confirmed Deposit Received & Started Production'
      
      // Update orders stage to 'Production' and log actual deposit date
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          stage: 'Production',
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
          activity_text: 'Automated System: Supplier confirmed deposit received. Production stage started.'
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

          const resendApiKey = process.env.RESEND_API_KEY
          if (resendApiKey) {
            const resend = new Resend(resendApiKey)
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

            await resend.emails.send({
              from: 'Sourcing Hub <onboarding@resend.dev>',
              to: supplier.email,
              subject: `[TR Sourcing] Production Started - Order ID: ${displayOrderId}`,
              html: emailHtml,
            })
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

    return new NextResponse(renderHtmlSuccess(orderId, actionDescription), {
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

function renderHtmlSuccess(orderId: string, actionDescription: string) {
  const secureToken = generateToken(orderId)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const shipmentActionUrl = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=shipped`
  const showShipButton = actionDescription === 'Confirmed & Accepted Purchase Order'

  let boxTitle = 'Update Confirmed'
  let boxDesc = 'Your supply chain update feedback has been recorded successfully.'
  let statusThemeClass = 'theme-blue'
  let boxIcon = `
    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
    </svg>
  `
  let stepItems = [
    'Our operations team has been notified of the update.',
    'The master order stage was updated in the secure tracking database.',
    'Subsequent milestones and weekly reports will automatically pulse.'
  ]

  if (actionDescription === 'Confirmed & Accepted Purchase Order') {
    boxTitle = 'Purchase Order Confirmed'
    boxDesc = 'The Purchase Order is now officially confirmed. Production is active.'
    boxIcon = `
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
    `
    stepItems = [
      'The supplier reviews specifications and initiates production.',
      'Sourcing team tracks weekly production metrics and delays.',
      'Once ready, supplier uses the "Mark as Shipped" action to register cargo.'
    ]
  } else if (actionDescription === 'Confirmed Shipped / Dispatched') {
    boxTitle = 'Cargo Marked as Shipped'
    boxDesc = 'The order has been marked as shipped and is routing to the port.'
    statusThemeClass = 'theme-emerald'
    boxIcon = `
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>
      </svg>
    `
    stepItems = [
      'Cargo arrives at port container depot for logistics processing.',
      'QC officers perform physical port inspections and sealing check.',
      'Approved items are transferred directly to digital inventory.'
    ]
  } else if (actionDescription === 'Confirmed Deposit Received') {
    boxTitle = 'Deposit Confirmed'
    boxDesc = 'The deposit receipt is confirmed. Order moves to active production.'
    statusThemeClass = 'theme-indigo'
    boxIcon = `
      <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 16V5"></path>
      </svg>
    `
    stepItems = [
      'Production run starts on factory assembly lines.',
      'Weekly progress check is tracked by procurement coordinators.',
      'Materials will be dispatched based on target completion date.'
    ]
  }

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
          padding: 40px;
          text-align: center;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.05);
          animation: scaleUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes scaleUp {
          from { transform: scale(0.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .icon-circle {
          width: 64px;
          height: 64px;
          background: #d1fae5;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          color: #10b981;
        }
        .icon-circle svg {
          width: 32px;
          height: 32px;
          stroke-width: 2.5;
        }
        h1 {
          font-size: 26px;
          font-weight: 800;
          margin: 0 0 8px;
          color: #0f172a;
          letter-spacing: -0.02em;
        }
        .subtitle {
          color: #64748b;
          font-size: 14.5px;
          line-height: 1.5;
          margin: 0 0 28px;
        }
        .status-box {
          border-radius: 20px;
          padding: 24px 20px;
          margin-bottom: 28px;
          text-align: center;
        }
        .status-box.theme-blue {
          background: #f0f9ff;
          border: 1px solid #e0f2fe;
        }
        .status-box.theme-blue .status-icon {
          background: #ffffff;
          color: #0284c7;
          border: 1px solid #e0f2fe;
        }
        .status-box.theme-blue .status-title {
          color: #0369a1;
        }
        .status-box.theme-blue .status-desc {
          color: #0284c7;
        }
        .status-box.theme-emerald {
          background: #f0fdf4;
          border: 1px solid #dcfce7;
        }
        .status-box.theme-emerald .status-icon {
          background: #ffffff;
          color: #16a34a;
          border: 1px solid #dcfce7;
        }
        .status-box.theme-emerald .status-title {
          color: #15803d;
        }
        .status-box.theme-emerald .status-desc {
          color: #16a34a;
        }
        .status-box.theme-indigo {
          background: #eef2ff;
          border: 1px solid #e0e7ff;
        }
        .status-box.theme-indigo .status-icon {
          background: #ffffff;
          color: #4f46e5;
          border: 1px solid #e0e7ff;
        }
        .status-box.theme-indigo .status-title {
          color: #4338ca;
        }
        .status-box.theme-indigo .status-desc {
          color: #4f46e5;
        }
        .status-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 14px;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02);
        }
        .status-title {
          font-size: 16px;
          font-weight: 700;
          margin: 0 0 6px;
        }
        .status-desc {
          font-size: 13px;
          line-height: 1.5;
          margin: 0;
        }
        .action-btn {
          display: inline-block;
          background: #4f46e5;
          color: #ffffff !important;
          text-decoration: none;
          font-size: 14px;
          font-weight: 700;
          padding: 12px 24px;
          border-radius: 10px;
          margin-top: 14px;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
          transition: background 0.2s;
        }
        .action-btn:hover {
          background: #4338ca;
        }
        .order-info {
          background: #f8fafc;
          border: 1px solid #f1f5f9;
          border-radius: 16px;
          padding: 16px;
          margin-bottom: 28px;
          font-size: 13px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
        }
        .info-row:last-child {
          margin-bottom: 0;
        }
        .info-label {
          color: #64748b;
          font-weight: 500;
        }
        .info-value {
          color: #1e293b;
          font-weight: 600;
        }
        .section-title {
          font-size: 11px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 16px;
          text-align: left;
        }
        .step-row {
          display: flex;
          gap: 12px;
          margin-bottom: 14px;
          text-align: left;
          font-size: 13.5px;
          line-height: 1.5;
          color: #475569;
        }
        .step-row:last-child {
          margin-bottom: 0;
        }
        .step-num {
          width: 22px;
          height: 22px;
          background: #eff6ff;
          color: #3b82f6;
          font-size: 11px;
          font-weight: 800;
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
        <div class="icon-circle">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h1>Thank You!</h1>
        <div class="subtitle">Your confirmation has been received.</div>

        <div class="status-box ${statusThemeClass}">
          <div class="status-icon">
            ${boxIcon}
          </div>
          <div class="status-title">${boxTitle}</div>
          <div class="status-desc">${boxDesc}</div>
          ${showShipButton ? `
            <a href="${shipmentActionUrl}" class="action-btn">Mark as Shipped</a>
          ` : ''}
        </div>
 
        <div class="order-info">
          <div class="info-row">
            <span class="info-label">Order Code</span>
            <span class="info-value">ORD-${orderId.substring(0, 8).toUpperCase()}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Source</span>
            <span class="info-value">Interactive Email Pulse</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status</span>
            <span class="info-value" style="color: #10b981;">Success</span>
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
