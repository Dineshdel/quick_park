/** Email templates. Each returns subject + html + text; all user data is HTML-escaped. */

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const layout = (title: string, body: string) => `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;background:#f6f7f9;padding:24px">
<div style="max-width:520px;margin:auto;background:#fff;border-radius:8px;padding:24px">
<h2 style="margin-top:0">${esc(title)}</h2>${body}
<p style="color:#888;font-size:12px;margin-top:32px">Quick Park</p></div></body></html>`;

const button = (href: string, label: string) =>
  `<p><a href="${esc(href)}" style="display:inline-block;background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${esc(label)}</a></p>
<p style="font-size:12px;color:#666">Or open this link: ${esc(href)}</p>`;

export const templates = {
  verifyEmail: (d: { name: string; link: string }) => ({
    subject: 'Verify your email',
    html: layout(`Hi ${d.name}`, `<p>Confirm your email to finish creating your account. This link is valid for 24 hours.</p>${button(d.link, 'Verify email')}`),
    text: `Hi ${d.name},\n\nVerify your email (valid 24 hours): ${d.link}`,
  }),
  resetPassword: (d: { name: string; link: string }) => ({
    subject: 'Reset your password',
    html: layout(`Hi ${d.name}`, `<p>Use this link to set a new password. It is valid for 30 minutes and can be used once. If you did not ask for this, ignore this email.</p>${button(d.link, 'Reset password')}`),
    text: `Hi ${d.name},\n\nReset your password (valid 30 minutes): ${d.link}\nIf you did not ask for this, ignore this email.`,
  }),
  welcome: (d: { name: string; link: string }) => ({
    subject: 'Welcome to Quick Park',
    html: layout(`Welcome, ${d.name}`, `<p>Your email is verified. You can now sign in.</p>${button(d.link, 'Sign in')}`),
    text: `Welcome, ${d.name}! Your email is verified. Sign in: ${d.link}`,
  }),
  adminInvite: (d: { link: string }) => ({
    subject: 'You are invited as a Quick Park administrator',
    html: layout('Admin invitation', `<p>You have been invited to administer Quick Park. This link is valid for 72 hours.</p>${button(d.link, 'Accept invitation')}`),
    text: `You have been invited to administer Quick Park (valid 72 hours): ${d.link}`,
  }),
} as const;

export type TemplateName = keyof typeof templates;
export type TemplateData<T extends TemplateName> = Parameters<(typeof templates)[T]>[0];
