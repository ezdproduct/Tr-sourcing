import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/supabase/server'
import { generateToken } from '@/app/api/orders/update-progress/route'
import { sendGmail } from '@/lib/gmail'
import { headers } from 'next/headers'

export async function GET(req: NextRequest) {
  await headers()
  try {
    const supabase = await createClient()
    const systemAgentId = process.env.GMAIL_SYSTEM_AGENT_ID ? parseInt(process.env.GMAIL_SYSTEM_AGENT_ID, 10) : 1
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const now = new Date()

    // Fetch email templates from database
    const { data: templates } = await supabase
      .from('email_templates')
      .select('*')

    const depositTemplate = templates?.find((t: any) => t.key === 'deposit_check')
    const pulseTemplate = templates?.find((t: any) => t.key === 'production_pulse')

    // ────────────────────────────────────────────────────────────────────────
    // MILESTONE 1: Deposit Check (48h after PO email is issued, stage = 'PO ISSUED')
    // ────────────────────────────────────────────────────────────────────────
    const threshold48h = new Date()
    threshold48h.setHours(threshold48h.getHours() - 48)

    const { data: pendingDepositOrders, error: pendingDepositError } = await supabase
      .from('orders')
      .select('id, order_code, selected_supplier_id, target_delivery_date, delivery_address, deposit_email_sent_at, suppliers(name, email), order_items(item_name)')
      .eq('stage', 'PO CONFIRMED')
      .eq('deposit_email_sent', true)
      .is('deposit_confirmed_at', null)
      .lte('deposit_email_sent_at', threshold48h.toISOString())

    if (pendingDepositError) {
      console.error('Error fetching pending deposit orders for Milestone 1:', pendingDepositError.message)
    } else if (pendingDepositOrders && pendingDepositOrders.length > 0) {
      for (const order of pendingDepositOrders) {
        const supplier = order.suppliers as any
        if (supplier && supplier.email) {
          const secureToken = generateToken(order.id)
          const actionLink = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=confirm_deposit`

          // Parse Template 3 (deposit_check)
          const displayOrderId = order.order_code || `PO-${order.id.substring(0, 8).toUpperCase()}`
          let emailSubject = `[Milestone Check] Deposit Confirmation Required - Order ID: ${displayOrderId}`
          let emailBodyText = `We have processed and transferred the deposit for your Purchase Order. Please click the button below to confirm that you have received the deposit. This will automatically transition your order to the active Production phase in our tracking system:`

          if (depositTemplate) {
            const templateSubject = depositTemplate.subject || ''
            const templateBody = depositTemplate.body || ''
            const orderItems = order.order_items as any[] || []
            const prodName = orderItems[0]?.item_name || 'Goods'

            const variables: Record<string, string> = {
              'Supplier Name': supplier.name || 'Supplier',
              'Order Code': displayOrderId,
              'Item Name': prodName,
              'Target Delivery Date': order.target_delivery_date || 'N/A',
              'Delivery Address': order.delivery_address || 'N/A'
            }
            
            let parsedSubject = templateSubject
            let parsedBody = templateBody

            for (const [k, v] of Object.entries(variables)) {
              const escapedKey = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
              parsedSubject = parsedSubject.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), v)
              parsedBody = parsedBody.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), v)
            }
            emailSubject = parsedSubject
            emailBodyText = parsedBody
          }

          // Format paragraph breaks
          const formattedBodyHtml = emailBodyText
            .split('\n\n')
            .map(para => `<p style="margin-bottom: 24px; margin-top: 0; font-size: 14px; color: #475569;">${para.replace(/\n/g, '<br/>')}</p>`)
            .join('')

          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Confirm Deposit & Start Production</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px; text-align: center; }
                p { font-size: 14px; color: #475569; margin-bottom: 24px; }
                .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(79,70,229,0.2); }
                .btn:hover { background-color: #4338ca; }
                .footer { border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; }
              </style>
            </head>
            <body>
              <div class="container">
                <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px; text-align: center;">
                  <div style="font-size: 18px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.05em; font-family: sans-serif;">TR Sourcing Hub</div>
                </div>
                <h1>Confirm Deposit Received</h1>
                ${formattedBodyHtml}
                
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${actionLink}" class="btn" target="_blank">Confirm Deposit Received</a>
                </div>
                
                <p>Thank you for your cooperation.</p>
                <div class="footer">
                  Automated Procurement Operations &bull; TR Sourcing Hub
                </div>
              </div>
            </body>
            </html>
          `

          await sendGmail({
            agentId: systemAgentId,
            toEmail: supplier.email,
            subject: emailSubject,
            html: emailHtml,
          })

          // Update deposit_email_sent_at to now() to reset the 48h reminder window
          await supabase
            .from('orders')
            .update({ deposit_email_sent_at: new Date().toISOString() })
            .eq('id', order.id)
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // MILESTONE 2: Weekly Progress Pulse (every 7 days, stage = 'Production')
    // ────────────────────────────────────────────────────────────────────────
    const threshold7d = new Date()
    threshold7d.setDate(threshold7d.getDate() - 7)

    // Fetch orders in 'Production' where last pulse is either NULL or older than 7 days
    const { data: productionOrders, error: productionError } = await supabase
      .from('orders')
      .select('id, selected_supplier_id, last_weekly_pulse_sent_at, suppliers(name, email)')
      .eq('stage', 'Production')

    if (productionError) {
      console.error('Error fetching Production orders for Milestone 2:', productionError.message)
    } else if (productionOrders && productionOrders.length > 0) {
      for (const order of productionOrders) {
        const lastSent = order.last_weekly_pulse_sent_at ? new Date(order.last_weekly_pulse_sent_at) : null
        
        // Skip if sent within the last 7 days
        if (lastSent && lastSent > threshold7d) {
          continue
        }

        const supplier = order.suppliers as any
        if (supplier && supplier.email) {
          const secureToken = generateToken(order.id)
          const onTrackLink = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=weekly_check_on_track`
          const delayedLink = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=weekly_check_delayed`
          const shipmentActionUrl = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=shipped`

          // Parse Template 4 (production_pulse)
          let emailSubject = `[Progress Pulse] Production Status Check - Order ID: ${order.id}`
          let emailBodyText = `This is our automated weekly progress check. Please click one of the options below to report the current status of production directly to our dashboard:`

          if (pulseTemplate) {
            const templateSubject = pulseTemplate.subject || ''
            const templateBody = pulseTemplate.body || ''
            const variables: Record<string, string> = {
              'Supplier Name': supplier.name || 'Supplier',
              'Order Code': order.id
            }
            
            let parsedSubject = templateSubject
            let parsedBody = templateBody

            for (const [k, v] of Object.entries(variables)) {
              const escapedKey = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
              parsedSubject = parsedSubject.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), v)
              parsedBody = parsedBody.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), v)
            }
            emailSubject = parsedSubject
            emailBodyText = parsedBody
          }

          // Format paragraph breaks
          const formattedBodyHtml = emailBodyText
            .split('\n\n')
            .map(para => `<p style="margin-bottom: 24px; margin-top: 0;">${para.replace(/\n/g, '<br/>')}</p>`)
            .join('')

          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Weekly Production Progress Pulse</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px; }
                p { font-size: 14px; color: #475569; margin-bottom: 24px; }
                .btn-group { display: flex; gap: 12px; justify-content: center; margin: 32px 0; flex-wrap: wrap; }
                .btn-yes { display: inline-block; background-color: #10b981; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(16,185,129,0.2); }
                .btn-yes:hover { background-color: #059669; }
                .btn-no { display: inline-block; background-color: #ef4444; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(239,68,68,0.2); }
                .btn-no:hover { background-color: #dc2626; }
                .btn-ship { display: inline-block; background-color: #64748b; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 20px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(100,116,139,0.2); }
                .btn-ship:hover { background-color: #475569; }
                .footer { border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; }
              </style>
            </head>
            <body>
              <div class="container">
                <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px; text-align: center;">
                  <div style="font-size: 18px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.05em; font-family: sans-serif;">TR Sourcing Hub</div>
                </div>
                <h1>Production Progress Pulse</h1>
                ${formattedBodyHtml}
                
                <div class="btn-group">
                  <a href="${onTrackLink}" class="btn-yes" target="_blank">On-Track</a>
                  <a href="${delayedLink}" class="btn-no" target="_blank">Delayed</a>
                  <a href="${shipmentActionUrl}" class="btn-ship" target="_blank">Mark as Shipped</a>
                </div>
                
                <p>Thank you for keeping us updated.</p>
                <div class="footer">
                  Automated Procurement Operations &bull; TR Sourcing Hub
                </div>
              </div>
            </body>
            </html>
          `

          await sendGmail({
            agentId: systemAgentId,
            toEmail: supplier.email,
            subject: emailSubject,
            html: emailHtml,
          })

          // Update last weekly pulse sent date in database
          await supabase
            .from('orders')
            .update({ last_weekly_pulse_sent_at: now.toISOString() })
            .eq('id', order.id)
        }
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // MILESTONE 4: Shipment Reminder Check (2 days before target delivery date)
    // ────────────────────────────────────────────────────────────────────────
    const threshold2Days = new Date()
    threshold2Days.setDate(threshold2Days.getDate() + 2)

    // Fetch the shipment_reminder template
    const reminderTemplate = templates?.find((t: any) => t.key === 'shipment_reminder')

    const { data: reminderOrders, error: reminderError } = await supabase
      .from('orders')
      .select('id, order_code, selected_supplier_id, target_delivery_date, delivery_address, suppliers(name, email), order_items(item_name)')
      .in('stage', ['Production', 'Supplier Production'])
      .eq('shipment_reminder_sent', false)
      .not('target_delivery_date', 'is', null)
      .lte('target_delivery_date', threshold2Days.toISOString().split('T')[0])

    if (reminderError) {
      console.error('Error fetching orders for Milestone 4:', reminderError.message)
    } else if (reminderOrders && reminderOrders.length > 0) {
      for (const order of reminderOrders) {
        const supplier = order.suppliers as any
        if (supplier && supplier.email) {
          const secureToken = generateToken(order.id)
          const displayOrderId = order.order_code || `PO-${order.id.substring(0, 8).toUpperCase()}`
          const shipmentActionUrl = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=shipped`

          let emailSubject = `[Action Required] Ready to Ship? Mark Order ${displayOrderId} as Shipped`
          let emailBodyText = `Our records show that the target delivery date for your order (${displayOrderId}) is approaching in 2 days. If production is completed and the cargo is ready for dispatch, please click the button below to mark it as shipped and initiate logistics processing:`

          const orderItems = order.order_items as any[] || []
          const prodName = orderItems[0]?.item_name || 'Goods'

          if (reminderTemplate) {
            const templateSubject = reminderTemplate.subject || ''
            const templateBody = reminderTemplate.body || ''
            const variables: Record<string, string> = {
              'Supplier Name': supplier.name || 'Supplier',
              'Order Code': displayOrderId,
              'Item Name': prodName,
              'Target Delivery Date': order.target_delivery_date || 'N/A',
              'Delivery Address': order.delivery_address || 'N/A'
            }

            let parsedSubject = templateSubject
            let parsedBody = templateBody

            for (const [k, v] of Object.entries(variables)) {
              const escapedKey = k.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
              parsedSubject = parsedSubject.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), v)
              parsedBody = parsedBody.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), v)
            }
            emailSubject = parsedSubject
            emailBodyText = parsedBody
          }

          // Format paragraph breaks
          const formattedBodyHtml = emailBodyText
            .split('\n\n')
            .map(para => `<p style="margin-bottom: 24px; margin-top: 0; font-size: 14px; color: #475569;">${para.replace(/\n/g, '<br/>')}</p>`)
            .join('')

          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Shipment Confirmation Reminder</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px; text-align: center; }
                p { font-size: 14px; color: #475569; margin-bottom: 24px; }
                .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(79,70,229,0.2); }
                .btn:hover { background-color: #4338ca; }
                .footer { border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; }
              </style>
            </head>
            <body>
              <div class="container">
                <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 16px; margin-bottom: 24px; text-align: center;">
                  <div style="font-size: 18px; font-weight: 800; color: #4f46e5; text-transform: uppercase; letter-spacing: 0.05em; font-family: sans-serif;">TR Sourcing Hub</div>
                </div>
                <h1>Ready to Ship?</h1>
                ${formattedBodyHtml}
                
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${shipmentActionUrl}" class="btn" target="_blank">Mark as Shipped</a>
                </div>
                
                <p>Thank you for your cooperation.</p>
                <div class="footer">
                  Automated Procurement Operations &bull; TR Sourcing Hub
                </div>
              </div>
            </body>
            </html>
          `

          await sendGmail({
            agentId: systemAgentId,
            toEmail: supplier.email,
            subject: emailSubject,
            html: emailHtml,
          })

          // Mark shipment reminder as sent in database
          await supabase
            .from('orders')
            .update({ shipment_reminder_sent: true })
            .eq('id', order.id)
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Cron milestones completed successfully.' }, { status: 200 })
  } catch (error: any) {
    console.error('Cron milestones error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
