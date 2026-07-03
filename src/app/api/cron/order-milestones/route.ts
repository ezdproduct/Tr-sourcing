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

    // ────────────────────────────────────────────────────────────────────────
    // MILESTONE 1: Deposit Check (48h after PO email is issued, stage = 'PO ISSUED')
    // ────────────────────────────────────────────────────────────────────────
    const threshold48h = new Date()
    threshold48h.setHours(threshold48h.getHours() - 48)

    const { data: poIssuedOrders, error: poIssuedError } = await supabase
      .from('orders')
      .select('id, created_at, selected_supplier_id, suppliers(name, email)')
      .in('stage', ['PO ISSUED', 'PO CONFIRMED'])
      .eq('deposit_email_sent', false)
      .lte('created_at', threshold48h.toISOString())

    if (poIssuedError) {
      console.error('Error fetching PO Issued orders for Milestone 1:', poIssuedError.message)
    } else if (poIssuedOrders && poIssuedOrders.length > 0) {
      for (const order of poIssuedOrders) {
        const supplier = order.suppliers as any
        if (supplier && supplier.email) {
          const secureToken = generateToken(order.id)
          const actionLink = `${appUrl}/api/orders/update-progress?token=${secureToken}&action=confirm_deposit`

          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Confirm Deposit & Start Production</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 40px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px; }
                p { font-size: 14px; color: #475569; margin-bottom: 24px; }
                .btn { display: inline-block; background-color: #4f46e5; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(79,70,229,0.2); }
                .btn:hover { background-color: #4338ca; }
                .footer { border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Confirm Deposit Received</h1>
                <p>Dear <strong>${supplier.name}</strong> Team,</p>
                <p>Our records show that the Purchase Order was issued 48 hours ago. Please click the button below to confirm that you have received the deposit. This will automatically transition your order to the active Production phase in our tracking system:</p>
                
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${actionLink}" class="btn" target="_blank">Confirm Deposit Received & Start Production</a>
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
            subject: `[Milestone Check] Deposit Confirmation Required - Order ID: ${order.id}`,
            html: emailHtml,
          })

          // Mark deposit email as sent in database
          await supabase
            .from('orders')
            .update({ deposit_email_sent: true })
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
                .btn-group { display: flex; gap: 16px; justify-content: center; margin: 32px 0; }
                .btn-yes { display: inline-block; background-color: #10b981; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(16,185,129,0.2); }
                .btn-yes:hover { background-color: #059669; }
                .btn-no { display: inline-block; background-color: #ef4444; color: #ffffff !important; font-size: 14px; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 8px; text-align: center; box-shadow: 0 4px 6px -1px rgba(239,68,68,0.2); }
                .btn-no:hover { background-color: #dc2626; }
                .footer { border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 32px; font-size: 11px; color: #94a3b8; text-align: center; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Production Progress Pulse</h1>
                <p>Dear <strong>${supplier.name}</strong> Team,</p>
                <p>This is our automated weekly progress check. Please click one of the options below to report the current status of production directly to our dashboard:</p>
                
                <div class="btn-group">
                  <a href="${onTrackLink}" class="btn-yes" target="_blank">Yes, Production is On-Track</a>
                  <a href="${delayedLink}" class="btn-no" target="_blank">No, We are experiencing Delays</a>
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
            subject: `[Progress Pulse] Production Status Check - Order ID: ${order.id}`,
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

    return NextResponse.json({ success: true, message: 'Cron milestones completed successfully.' }, { status: 200 })
  } catch (error: any) {
    console.error('Cron milestones error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
