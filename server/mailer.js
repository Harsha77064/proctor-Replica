// Outgoing email (exam invitations). Works only when SMTP_* settings are present.
import nodemailer from 'nodemailer';
import { config } from './config.js';

let transport = null;
export const emailEnabled = () => !!(config.smtp.host && config.smtp.from);

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transport;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendInviteEmail({ to, name, examTitle, startTime, duration, link, code, orgName, supportEmail }) {
  const when = new Date(startTime).toUTCString();
  const text = [
    `Hello ${name},`,
    '',
    `You have been invited to take "${examTitle}" with ${orgName}.`,
    `Scheduled: ${when} · Duration: ${duration} minutes`,
    '',
    `Exam link: ${link}`,
    `Access code: ${code}`,
    '',
    'The exam is live proctored: you will need a working webcam and microphone, and you must stay in full screen.',
    'Keep this code private. It can only be used by you.',
    supportEmail ? `Questions? Contact ${supportEmail}.` : '',
  ].join('\n');
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;color:#111827">
    <p>Hello ${esc(name)},</p>
    <p>You have been invited to take <b>${esc(examTitle)}</b> with ${esc(orgName)}.</p>
    <p style="color:#4b5563">Scheduled: ${esc(when)} · Duration: ${esc(duration)} minutes</p>
    <p><a href="${esc(link)}" style="display:inline-block;background:#5b5bf0;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Open your exam</a></p>
    <p>Access code: <b style="font-size:20px;letter-spacing:3px">${esc(code)}</b></p>
    <p style="color:#4b5563;font-size:13px">This exam is live proctored. You will need a working webcam and microphone and must stay in full screen. Keep this code private.</p>
    ${supportEmail ? `<p style="color:#4b5563;font-size:13px">Questions? Contact ${esc(supportEmail)}.</p>` : ''}
  </div>`;
  await getTransport().sendMail({ from: config.smtp.from, to, subject: `Your exam invitation: ${examTitle}`, text, html });
}
