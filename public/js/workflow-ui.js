import { e,field,submit,dateFormat,empty } from './ui.js';
export const money = kobo => new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(kobo/100);
export const bankDetails = data => {
  const c=data.community;
  return `<div class="payment-details"><p class="eyebrow">Giving with purpose</p>${c.bankName&&c.accountName&&c.accountNumber ? `<dl class="detail-list"><div><dt>Bank</dt><dd>${e(c.bankName)}</dd></div><div><dt>Account name</dt><dd>${e(c.accountName)}</dd></div><div><dt>Account number</dt><dd><strong>${e(c.accountNumber)}</strong></dd></div></dl>` : '<p>Payment instructions are available from the church office.</p>'}<p>${e(c.givingNote)}</p><a href="${e(data.settings.whatsapp)}" class="text-link" target="_blank" rel="noopener noreferrer">Confirm payment instructions ↗</a></div>`;
};
export const recordDate = value => value ? dateFormat(value.includes('T') ? value : value+'Z',{year:'numeric'}) : '—';
export function renderConversation(thread,admin=false) {
  return `<div class="conversation"><div class="thread-info"><span class="badge">${e(thread.kind)} · ${e(thread.status)}</span><p>${admin?e(thread.name)+' · '+e(thread.email):'Conversation with the church team'}</p></div><div class="message-history">${thread.messages.map(message=>`<article class="message-bubble ${message.role==='admin'?'from-admin':''}"><small>${e(message.name)}${message.role==='admin'?' · Church team':''}</small><p>${e(message.body)}</p><time>${recordDate(message.created)}</time></article>`).join('')}</div><form id="reply-form" data-thread="${thread.id}">${field('Your reply','message','','textarea',true,'maxlength="4000"')}${submit('Send reply')}</form></div>`;
}
export function threadList(threads,admin=false) {
  return threads.map(thread=>`<button class="thread-card" data-open-thread="${thread.id}"><span class="thread-icon">${thread.kind==='Observation'?'◎':'✉'}</span><span><strong>${e(thread.subject)}</strong><small>${admin?e(thread.name)+' · ':''}${e(thread.kind)} · ${thread.messages.length} message${thread.messages.length===1?'':'s'}</small><p>${e(thread.messages.at(-1)?.body.slice(0,110)||'')}</p></span><span class="badge">${e(thread.status)}</span><span aria-hidden="true">↗</span></button>`).join('')||empty(admin?'Member messages and observations will appear here.':'Start a conversation. The church team can reply here.');
}
