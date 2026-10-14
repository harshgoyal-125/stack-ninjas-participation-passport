// Sends mail through the Brevo HTTPS API (Render free blocks SMTP ports). Enabled only when BREVO_API_KEY and MAIL_FROM are set.
function mailEnabled() { return !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM); }
async function sendMail({ to, subject, text }) {
  if (!mailEnabled()) return false;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ sender: { name: 'CampusTrace', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, textContent: text }), signal: AbortSignal.timeout(10000) });
    return r.ok;
  } catch { return false; }
}
module.exports = { mailEnabled, sendMail };
