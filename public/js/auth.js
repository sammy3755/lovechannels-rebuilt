import { $, $$, e, modal, field, submit, request, handleForm, closeModal, toast } from './ui.js';

export function openAuth(data, onSuccess, admin = false) {
  let registering = false;
  function draw() {
    modal(admin ? 'Church administration.' : registering ? 'Find your place.' : 'Welcome home.', `${admin ? '<p>Sign in with your administrator account.</p>' : `<div class="auth-tabs"><button class="${!registering ? 'active' : ''}" data-auth-tab="login">Sign in</button><button class="${registering ? 'active' : ''}" data-auth-tab="register">Become a member</button></div>`}<form id="auth-form">${registering ? field('Full name','name','','text',true,'autocomplete="name" maxlength="100"') : ''}${field('Email address','email','','email',true,'autocomplete="username"')}${field('Password','password','','password',true,`autocomplete="${registering ? 'new-password' : 'current-password'}" ${registering ? 'minlength="12"' : ''} maxlength="256"`)}${registering ? '<p class="form-note">Use at least 12 characters. Your profile is visible to church administrators. Prayer requests are shared only with you and church administrators.</p>' : '<p class="form-note">Need account help? Contact the church office.</p>'}${submit(registering ? 'Create my account' : 'Sign in')}</form>${data.demoMode ? `<div class="demo-access"><p>LOCAL PREVIEW · Explore with sample records</p><button class="button small outline" data-demo="member">Member demo</button><button class="button small outline" data-demo="admin">Admin demo</button></div>` : ''}`);
    $$('[data-auth-tab]').forEach(button => button.addEventListener('click', () => { registering = button.dataset.authTab === 'register'; draw(); }));
    handleForm($('#auth-form'), async values => {
      const result = await request(registering ? '/register' : '/login', values);
      closeModal(); onSuccess(result.user);
    });
    $$('[data-demo]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { const result = await request('/demo', { role: button.dataset.demo }); closeModal(); onSuccess(result.user); }
      catch (err) { toast(err.message); button.disabled = false; }
    }));
  }
  draw();
}
