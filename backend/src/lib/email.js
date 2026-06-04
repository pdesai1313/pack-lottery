async function sendEmail({ to, subject, html }) {
  if (process.env.BREVO_API_KEY) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method:  'POST',
      headers: {
        'api-key':      process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender:      { name: 'Pack Lottery', email: process.env.EMAIL_FROM || 'pranayjinal@gmail.com' },
        to:          [{ email: to }],
        subject,
        htmlContent: html,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Brevo failed (${res.status}): ${body}`)
    }
    console.log(`[EMAIL] Sent via Brevo to ${to}`)
    return
  }

  const text     = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const urlMatch = text.match(/https?:\/\/\S+reset-password\S*/)
  console.log(`\n📧 [DEV EMAIL]`)
  console.log(`   To:      ${to}`)
  console.log(`   Subject: ${subject}`)
  if (urlMatch) console.log(`   Link:    ${urlMatch[0]}`)
  else          console.log(`   Body:    ${text}`)
  console.log()
}

module.exports = { sendEmail }
