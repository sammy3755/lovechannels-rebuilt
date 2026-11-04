import {applyPalette} from './palettes.js';
import {initFont} from './fonts.js';
import {publicPages,initAnalytics} from './information.js';
import { $, e, request, toast, activateThemeButtons, closeModal, themeNames } from './ui.js';
import { renderSite, initSite } from './site.js';
import { openAuth } from './auth.js';
import { initPortal, memberNav, adminNav } from './portal.js';
import { renderMember, initMember } from './member.js';
import { renderAdmin, initAdmin } from './admin.js';
import { disposeRotations } from './rotation.js';

let user = null, renderId = 0;
try { const saved=localStorage.getItem('lc-theme');document.documentElement.dataset.theme = Object.keys(themeNames).includes(saved) ? saved : 'blue-white'; } catch {}
if(new URLSearchParams(location.search).get('look')==='couture')document.documentElement.dataset.theme='dark';
if(new URLSearchParams(location.search).get('look')==='ivory')document.documentElement.dataset.theme='light';
const requestedTheme=new URLSearchParams(location.search).get('look');if(Object.hasOwn(themeNames,requestedTheme))document.documentElement.dataset.theme=requestedTheme;
applyPalette(document.documentElement.dataset.theme);
initFont();
const authError=new URLSearchParams(location.hash.split('?')[1]||'').get('authError');
if(authError){setTimeout(()=>toast(authError==='link-required'?'Sign in with your password, then connect Google in your member profile.':'Google sign-in could not be completed. Please try again.'),1200);history.replaceState(null,'',location.pathname+location.search+'#/');}
document.addEventListener('click', event => { const eye=event.target.closest('[data-password-toggle]');if(eye){const input=eye.closest('.password-wrap').querySelector('input');const show=input.type==='password';input.type=show?'text':'password';eye.setAttribute('aria-pressed',String(show));eye.setAttribute('aria-label',show?'Hide password':'Show password');} if (event.target.closest('[data-close]')) closeModal(); });
$('#modal').addEventListener('click', event => { if (event.target === $('#modal')) { const rect = $('#modal').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal(); } });

async function render(resetScroll = false) {
  disposeRotations();
  const id = ++renderId;
  try {
    const [data, session] = await Promise.all([request('/public'),request('/session')]);
    if (id !== renderId) return;
    user = session.user;
    const parts = location.hash.startsWith('#/') ? location.hash.slice(2).split('?')[0].split('/') : [];
    const page = parts[0] || (['/member','/admin'].includes(location.pathname) && !location.hash ? location.pathname.slice(1) : 'home');

    if (!['home','member','admin','communities','community',...publicPages].includes(page)) { location.hash = '#/'; return; }
    const portalStyles=(page==='member'||page==='admin')&&user;
    await Promise.all([...document.querySelectorAll('[data-portal-style]')].map(link=>{
      if(!portalStyles){link.media='not all';return;}
      if(link.sheet){link.media='all';return;}
      return new Promise(resolve=>{link.addEventListener('load',resolve,{once:true});link.addEventListener('error',resolve,{once:true});link.media='all';});
    }));
    if(id!==renderId)return;
    if (['home','communities','community',...publicPages].includes(page)) {
      $('#app').innerHTML = renderSite(data,user); initSite(data,openAuth); activateThemeButtons();initAnalytics();
      document.title = 'The Love Channels — A place to belong';
      if(resetScroll)window.scrollTo(0,0);
      if (location.hash && !location.hash.startsWith('#/')) document.getElementById(location.hash.slice(1))?.scrollIntoView();
      return;
    }
    if (!user) {
      $('#app').innerHTML = renderSite(data,null); initSite(data,openAuth); activateThemeButtons();
      openAuth(data, authenticated => { user = authenticated; const target=`#/${authenticated.role === 'admin' ? 'admin' : 'member'}/${parts[1] || 'overview'}${location.hash.includes('?')?'?'+location.hash.split('?')[1]:''}`;if(location.hash===target)render(true);else location.hash=target; }, page === 'admin');
      return;
    }
    if (page === 'admin' && user.role !== 'admin') { toast('Administrator access is required.'); location.hash = '#/member'; return; }
    const nav = page === 'admin' ? adminNav : memberNav;
    const tab = nav.some(item => item[0] === parts[1]) ? parts[1] : 'overview';
    const portal = await request(page === 'admin' ? '/admin' : '/member');
    if (id !== renderId) return;
    if(page==='admin'){data.events=portal.events;data.editorial=portal.editorial;}
    $('#app').innerHTML = page === 'admin' ? renderAdmin(data,portal,user,tab) : renderMember(data,portal,tab);
    Object.assign(document.querySelector('.portal').dataset,{portalRole:page,portalTab:tab});
    initPortal(() => { user = null; location.hash = '#/'; });
    if (page === 'admin') initAdmin(data,portal,render); else initMember(data,portal,render);
    activateThemeButtons();initAnalytics();
    document.title = `${nav.find(n => n[0] === tab)[2]} — The Love Channels`;
    if(resetScroll){window.scrollTo(0,0);const heading=$('.portal-title h1');heading.tabIndex=-1;heading.focus({preventScroll:true});}
  } catch (error) {
    if (id !== renderId) return;
    $('#app').innerHTML = `<main class="loading" id="main"><p>${e(error.message)}</p><p><a class="button" href="#/">Return home ↗</a></p><p class="form-note">The app needs its Node.js server. Open http://127.0.0.1:4173 after starting it.</p></main>`;
  }
  finally {if(id===renderId)document.body.classList.remove('app-is-loading');}
}
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#/')) { closeModal(); render(true); } else if(!document.querySelector('.ac-hero')){closeModal();render();} });
render();