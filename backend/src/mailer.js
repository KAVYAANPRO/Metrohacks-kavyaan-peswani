// Outgoing email (Gmail SMTP via nodemailer). If SMTP is not configured we never throw:
// callers get { sent: 0, error: 'SMTP not configured' } and the record stays visible in the admin inbox.
import nodemailer from 'nodemailer';
import { env } from './config.js';

const SEND_TIMEOUT_MS = 10000;
let transport = null;

export const mailConfigured = () => Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }
  return transport;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function withTimeout(p, ms) {
  let t;
  return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('SMTP timeout')), ms); })]).finally(() => clearTimeout(t));
}

// Send one message to each recipient separately (admins don't see each other's addresses).
// Returns { sent: number, sent_to: [emails], error: string|null }.
export async function sendMail(to, subject, text, html) {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).filter(Boolean))];
  if (!recipients.length) return { sent: 0, sent_to: [], error: 'no recipients' };
  if (!mailConfigured()) {
    console.warn(`[mail] SMTP not configured - not sending "${subject}"`);
    return { sent: 0, sent_to: [], error: 'SMTP not configured' };
  }
  const results = await Promise.allSettled(
    recipients.map((r) => withTimeout(getTransport().sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to: r, subject, text, html }), SEND_TIMEOUT_MS))
  );
  const sent_to = recipients.filter((_, i) => results[i].status === 'fulfilled');
  const errs = results.filter((r) => r.status === 'rejected').map((r) => String(r.reason?.message || r.reason).slice(0, 200));
  if (errs.length) console.warn('[mail] send failed:', errs[0]);
  return { sent: sent_to.length, sent_to, error: errs.length ? errs[0] : null };
}

const layout = (title, inner) => `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f5f6f8;padding:24px;color:#1b1f24">
<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e3e6ea">
<h2 style="margin:0 0 16px;font-size:18px">${esc(title)}</h2>${inner}
<p style="margin-top:24px;font-size:12px;color:#6b7280">Yieldline - metro retail &amp; ad yield</p></div></body></html>`;

const row = (k, v) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(v || '-')}</td></tr>`;
const button = (href, label) => `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">${esc(label)}</a></p>`;

export function applicationEmail(appl, roleName) {
  const link = `${env.APP_URL}/#/admin`;
  const fields = [
    ['Name', appl.name], ['Email', appl.email], ['Requested username', appl.username],
    ['Organisation', appl.organisation], ['Requested role', roleName], ['Reason', appl.reason], ['Submitted', appl.created_at],
  ];
  const subject = `Yieldline access request: ${appl.name}`;
  const text = `A new access request was submitted to Yieldline.\n\n${fields.map(([k, v]) => `${k}: ${v || '-'}`).join('\n')}\n\nReview it in the admin inbox: ${link}\n`;
  const html = layout('New access request', `<p>A new access request was submitted to Yieldline.</p>
<table style="border-collapse:collapse;font-size:14px">${fields.map(([k, v]) => row(k, v)).join('')}</table>
${button(link, 'Review in admin inbox')}<p style="font-size:12px;color:#6b7280">${esc(link)}</p>`);
  return { subject, text, html };
}

export function approvalEmail({ name, username, tempPassword, roleName }) {
  const link = `${env.APP_URL}/`; // unauthenticated visitors land on the sign-in screen
  const subject = 'Your Yieldline access has been approved';
  const text = `Hi ${name || username},\n\nYour request for Yieldline access has been approved${roleName ? ` (role: ${roleName})` : ''}.\n\nUsername: ${username}\nTemporary password: ${tempPassword}\n\nSign in at ${link} - you will be asked to choose a new password on first login.\n`;
  const html = layout('Access approved', `<p>Hi ${esc(name || username)},</p>
<p>Your request for Yieldline access has been approved${roleName ? ` (role: <b>${esc(roleName)}</b>)` : ''}.</p>
<table style="border-collapse:collapse;font-size:14px">${row('Username', username)}${row('Temporary password', tempPassword)}</table>
${button(link, 'Sign in to Yieldline')}<p style="font-size:13px;color:#6b7280">You will be asked to choose a new password on first login.</p>`);
  return { subject, text, html };
}
