import {hsbToHex} from './hsb-palettes.js';
import {fontStyles,applyFont} from './fonts.js';
import {palettes,themeNames,applyPalette} from './palettes.js';
export {themeNames} from './palettes.js';
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const e = escapeHTML;
export async function request(path, data, method = 'POST') {
  const response = await fetch(`/api${path}`, data === undefined ? { credentials: 'same-origin' } : { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to complete your request.');
  return result;
}
let toastTimer;
export function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 5000); }
export function modal(title, content) {
  $('#modal-body').innerHTML = `<p class="eyebrow">The Love Channels</p><h2 id="modal-title">${e(title)}</h2>${content}`;
  if (!$('#modal').open) $('#modal').showModal();
}
export const closeModal = () => $('#modal').close();
export const arrow = '<span aria-hidden="true">↗</span>';
export function field(label, name, value = '', type = 'text', required = false, extra = '') {
  const id = `field-${name}`;
  if(type==='password')return `<label class="field" for="${id}"><span>${e(label)}</span><span class="password-wrap"><input id="${id}" name="${e(name)}" type="password" value="${e(value)}" ${required?'required':''} ${extra}><button type="button" class="password-eye" data-password-toggle aria-controls="${id}" aria-label="Show password" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="eye-slash" d="m3 3 18 18"/></svg></button></span></label>`;

  return `<label class="field" for="${id}"><span>${e(label)}</span>${type === 'textarea' ? `<textarea id="${id}" name="${e(name)}" rows="4" ${required ? 'required' : ''} ${extra}>${e(value)}</textarea>` : `<input id="${id}" name="${e(name)}" type="${type}" value="${e(value)}" ${required ? 'required' : ''} ${extra}>`}</label>`;
}
export function selectField(label, name, options, selected = '') {
  return `<label class="field"><span>${e(label)}</span><select name="${e(name)}">${options.map(([value,text]) => `<option value="${e(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${e(text)}</option>`).join('')}</select></label>`;
}
export function submit(label = 'Save changes') { return `<p class="form-error" role="alert"></p><button class="button" type="submit">${e(label)} ${arrow}</button>`; }
export function handleForm(form, handler) {
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('[type="submit"]'); button.disabled = true;
    const error = form.querySelector('.form-error'); if (error) error.textContent = '';
    try { await handler(Object.fromEntries(new FormData(form))); }
    catch (err) { if (error) error.textContent = err.message; else toast(err.message); }
    finally { button.disabled = false; }
  });
}
export const dateFormat = (date, options = {}) => !Number.isFinite(new Date(date).getTime())?'Date to be announced':new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', ...options }).format(new Date(date));
export const timeFormat = time => !time ? 'See broadcast schedule' : new Date(`2000-01-01T${time}:00+01:00`).toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' });
export function eventDate(event) {
  let date = new Date(event.date);
  if (event.recurring) while (date.getTime() < Date.now()) date = new Date(date.getTime() + 7 * 86400000);
  return date;
}
export const wingOptions = wings => [['','Choose a wing'], ...wings.map(w => [w.id,w.name])];
export const empty = message => `<div class="empty-state"><span aria-hidden="true">✳</span><p>${e(message)}</p></div>`;
export function themeButton() { return `<button class="theme-switch" data-theme-toggle aria-label="Choose colours and fonts" title="Choose from ${palettes.length} colour palettes"><span class="theme-orb" aria-hidden="true"></span><span class="theme-name">${themeNames[document.documentElement.dataset.theme]||'Ivory'}</span></button>`; }
export function brand(name = 'The LoveChannels') { name=name.replace(/^The Love Channels$/,'The LoveChannels');return `<a href="#/" class="brand" aria-label="${e(name)} home"><span class="brand-symbol" aria-hidden="true"><img class="brand-logo logo-blue" src="/assets/logo-blue.webp" alt="" width="44" height="40"><img class="brand-logo logo-white" src="/assets/logo-white.webp" alt="" width="44" height="40"></span><span>${e(name)}<small>CHRISTIAN CENTRE</small></span></a>`; }
export function activateThemeButtons() {
 $$('[data-theme-toggle]').forEach(button=>button.addEventListener('click',()=>{
  const current=document.documentElement.dataset.theme;
  modal('Colours & type.',`<section class="lc-font-picker" aria-label="Choose a font"><h3>Choose your font</h3><p>Preview it across the website and dashboards.</p><div class="lc-font-options">${fontStyles.map(f=>`<button data-font-choice="${f.id}" aria-pressed="${document.documentElement.dataset.font===f.id}"><strong>${f.name}</strong><small>${f.description}</small></button>`).join('')}</div></section><p>Explore ${palettes.length} coordinated palettes. Your choice follows you through the website and dashboards.</p><div class="lc-palette-filters" aria-label="Filter colour palettes">${[['all','All colours'],['bright','Bright colours'],['light','Light palettes'],['dark','Dark palettes']].map(([key,label])=>`<button data-palette-filter="${key}" aria-pressed="${key==='all'}">${label}</button>`).join('')}</div><div class="lc-palette-options"><div class="lc-theme-grid">${palettes.map((p,i)=>`<button class="lc-theme-choice" data-palette="${p.id}" data-palette-mode="${p.mode}" data-palette-bright="${Boolean(p.bright)}" aria-pressed="${current===p.id}"><span class="lc-theme-swatches" aria-hidden="true"><i></i><i></i><i></i>${i>=6?'<i></i>':''}</span><strong>${p.name}</strong><small>${p.colours}</small></button>`).join('')}</div></div>`);
  $$('[data-font-choice]',$('#modal')).forEach(choice=>choice.addEventListener('click',()=>{
   const font=choice.dataset.fontChoice;applyFont(font);try{localStorage.setItem('lc-font',font);}catch{}
   const address=new URL(location.href);address.searchParams.set('font',font);history.replaceState(null,'',address);
   $$('[data-font-choice]',$('#modal')).forEach(b=>b.setAttribute('aria-pressed',String(b===choice)));
  }));
  $$('[data-palette]',$('#modal')).forEach(choice=>{const p=palettes.find(p=>p.id===choice.dataset.palette);if(p.hsbTokens){for(const [name,key] of [['canvas','canvas'],['ink','ink'],['gold','primary'],['accent','gold']])choice.style.setProperty('--preview-'+name,hsbToHex(p.hsbTokens[key]));}});
  $$('[data-palette-filter]',$('#modal')).forEach(filter=>filter.addEventListener('click',()=>{
   $$('[data-palette-filter]',$('#modal')).forEach(b=>b.setAttribute('aria-pressed',String(b===filter)));
   $$('[data-palette]',$('#modal')).forEach(choice=>choice.hidden=filter.dataset.paletteFilter==='bright'?choice.dataset.paletteBright!=='true':filter.dataset.paletteFilter!=='all'&&choice.dataset.paletteMode!==filter.dataset.paletteFilter);
   $('.lc-palette-options',$('#modal')).scrollTop=0;
  }));
  $$('[data-palette]',$('#modal')).forEach(choice=>choice.addEventListener('click',()=>{
   const theme=choice.dataset.palette;applyPalette(theme);
   try{localStorage.setItem('lc-theme',theme);}catch{}
   const address=new URL(location.href);address.searchParams.set('look',theme);history.replaceState(null,'',address);closeModal();
  }));
 }));
}
