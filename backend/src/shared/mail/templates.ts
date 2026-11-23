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
  bookingConfirmed: (d: { name: string; code: string; place: string; address: string; vehicle: string; from: string; until: string; amount: string; link: string; qrDataUrl: string }) => ({
    subject: `Booking confirmed: ${d.code} at ${d.place}`,
    html: layout(`Booking confirmed`, `<p>Hi ${esc(d.name)}, your parking is booked.</p>
<table style="font-size:14px">${[['Booking', d.code], ['Place', d.place], ['Address', d.address], ['Vehicle', d.vehicle], ['From', d.from], ['Until', d.until], ['Paid', d.amount]].map(([k, v]) => `<tr><td style="color:#666;padding-right:12px">${k}</td><td><b>${esc(v!)}</b></td></tr>`).join('')}</table>
<p style="text-align:center"><img src="${d.qrDataUrl}" width="200" height="200" alt="Pass QR code"></p>
<p>Show this QR code at the gate, or open your pass:</p>${button(d.link, 'Open pass')}`),
    text: `Hi ${d.name}, booking ${d.code} is confirmed.\nPlace: ${d.place}, ${d.address}\nVehicle: ${d.vehicle}\nFrom ${d.from} until ${d.until}\nPaid ${d.amount}\nPass: ${d.link}`,
  }),
  bookingReminder: (d: { name: string; code: string; place: string; from: string; link: string }) => ({
    subject: `Reminder: parking at ${d.place} starts ${d.from}`,
    html: layout('Your parking starts soon', `<p>Hi ${esc(d.name)}, booking <b>${esc(d.code)}</b> at <b>${esc(d.place)}</b> starts ${esc(d.from)}.</p>${button(d.link, 'Open pass')}`),
    text: `Hi ${d.name}, booking ${d.code} at ${d.place} starts ${d.from}. Pass: ${d.link}`,
  }),
  planExpiring: (d: { name: string; code: string; place: string; until: string; link: string }) => ({
    subject: `Your pass at ${d.place} ends ${d.until}`,
    html: layout('Your pass is ending', `<p>Hi ${esc(d.name)}, pass <b>${esc(d.code)}</b> at <b>${esc(d.place)}</b> ends ${esc(d.until)}. Extend it to keep your spot.</p>${button(d.link, 'Extend')}`),
    text: `Hi ${d.name}, pass ${d.code} at ${d.place} ends ${d.until}. Extend: ${d.link}`,
  }),
  bookingCancelled: (d: { name: string; code: string; place: string; refund: string }) => ({
    subject: `Booking ${d.code} cancelled`,
    html: layout('Booking cancelled', `<p>Hi ${esc(d.name)}, booking <b>${esc(d.code)}</b> at <b>${esc(d.place)}</b> is cancelled. Refund: <b>${esc(d.refund)}</b>. Refunds reach your account in 5–7 working days.</p>`),
    text: `Hi ${d.name}, booking ${d.code} at ${d.place} is cancelled. Refund: ${d.refund}.`,
  }),
  ownerNewBooking: (d: { name: string; code: string; place: string; customer: string; vehicle: string; from: string; until: string; link: string }) => ({
    subject: `New booking ${d.code} at ${d.place}`,
    html: layout('New booking', `<p>Hi ${esc(d.name)}, ${esc(d.customer)} booked <b>${esc(d.place)}</b> for ${esc(d.vehicle)}, ${esc(d.from)} – ${esc(d.until)}.</p>${button(d.link, 'View bookings')}`),
    text: `New booking ${d.code} at ${d.place}: ${d.customer}, ${d.vehicle}, ${d.from} – ${d.until}. ${d.link}`,
  }),
  sessionReceipt: (d: { name: string; place: string; vehicle: string; action: 'entry' | 'exit'; at: string; extra: string }) => ({
    subject: `${d.action === 'entry' ? 'Entered' : 'Exited'} ${d.place}`,
    html: layout(d.action === 'entry' ? 'Welcome in' : 'Thanks for parking', `<p>Hi ${esc(d.name)}, ${esc(d.vehicle)} ${d.action === 'entry' ? 'entered' : 'left'} <b>${esc(d.place)}</b> at ${esc(d.at)}.${d.extra ? ` ${esc(d.extra)}` : ''}</p>`),
    text: `${d.vehicle} ${d.action === 'entry' ? 'entered' : 'left'} ${d.place} at ${d.at}. ${d.extra}`,
  }),
  kycDecision: (d: { name: string; approved: boolean; reason?: string; link: string }) => ({
    subject: d.approved ? 'Your Quick Park account is verified' : 'Your verification needs changes',
    html: layout(d.approved ? 'Verification approved' : 'Verification rejected', d.approved
      ? `<p>Hi ${esc(d.name)}, your business details are verified. You can now submit parking places for approval.</p>${button(d.link, 'Open dashboard')}`
      : `<p>Hi ${esc(d.name)}, we could not verify your details: <b>${esc(d.reason ?? '')}</b>. Please fix them and submit again.</p>${button(d.link, 'Update details')}`),
    text: d.approved ? `Your details are verified. ${d.link}` : `Verification rejected: ${d.reason}. Update: ${d.link}`,
  }),
  locationDecision: (d: { name: string; place: string; status: 'approved' | 'rejected' | 'suspended'; reason?: string; link: string }) => ({
    subject: `${d.place}: ${d.status}`,
    html: layout(`Parking place ${d.status}`, `<p>Hi ${esc(d.name)}, <b>${esc(d.place)}</b> was ${d.status}.${d.reason ? ` Reason: <b>${esc(d.reason)}</b>.` : ''}${d.status === 'approved' ? ' It is now live in search.' : ''}</p>${button(d.link, 'Open place')}`),
    text: `${d.place} was ${d.status}.${d.reason ? ` Reason: ${d.reason}.` : ''} ${d.link}`,
  }),
  disputeUpdate: (d: { name: string; code: string; status: string; resolution: string }) => ({
    subject: `Your issue with booking ${d.code}: ${d.status.toLowerCase()}`,
    html: layout('Issue update', `<p>Hi ${esc(d.name)}, your issue with booking <b>${esc(d.code)}</b> was ${esc(d.status.toLowerCase())}.</p><p>${esc(d.resolution)}</p>`),
    text: `Your issue with booking ${d.code} was ${d.status.toLowerCase()}: ${d.resolution}`,
  }),
} as const;

export type TemplateName = keyof typeof templates;
export type TemplateData<T extends TemplateName> = Parameters<(typeof templates)[T]>[0];
