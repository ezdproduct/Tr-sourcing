export interface SendGmailPayload {
  agentId: number;
  toEmail: string;
  subject: string;
  html: string;
}

export async function sendGmail({ agentId, toEmail, subject, html }: SendGmailPayload) {
  const baseUrl = process.env.GMAIL_API_BASE_URL || 'https://sent-gmail-api.transformerrobotics.com';
  const apiKey = process.env.GMAIL_API_KEY || 'TransformerRobotics-api-key-2026';

  const res = await fetch(`${baseUrl}/api/v1/emails/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      agent_id: agentId,
      to_email: toEmail,
      subject,
      body_html: html,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Gmail API Service returned status ${res.status}`);
  }

  return res.json();
}
