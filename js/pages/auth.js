import { api } from '../api.js';
import { loadSession, login, register, safeNext } from '../auth.js';
import { initPage } from '../layout.js';
import { busy, toast } from '../ui.js';
import { $, html, params, render } from '../utils.js';

/**
 * Páginas de autenticação: login, registo, recuperar/definir password e verificar email.
 * A página é escolhida por <body data-auth="login|register|forgot|reset|verify">.
 */
await initPage();
const mode = document.body.dataset.auth;
const next = safeNext(params().get('next'), 'index.html');
const form = $('#auth-form');
const errorBox = $('.form-error');

function showError(err) {
  render(errorBox, err.friendly ?? String(err));
  // Marca os campos inválidos devolvidos pela API (details[].path = "body.email").
  form?.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  (err.details ?? []).forEach((d) => form?.querySelector(`[name="${String(d.path).split('.').pop()}"]`)?.setAttribute('aria-invalid', 'true'));
  errorBox.focus?.();
}

function passwordProblems(pw) {
  const out = [];
  if (pw.length < 8) out.push('pelo menos 8 caracteres');
  if (!/[A-Za-z]/.test(pw)) out.push('uma letra');
  if (!/\d/.test(pw)) out.push('um número');
  return out;
}

if (['login', 'register'].includes(mode)) {
  const user = await loadSession();
  if (user) location.replace(next);
}

// Os botões só ficam ativos quando o script está pronto (evita submissão nativa com a password no URL).
document.querySelectorAll('[data-needs-js]').forEach((b) => (b.disabled = false));

form?.addEventListener('submit', (e) => {
  e.preventDefault();
  render(errorBox, '');
  const f = Object.fromEntries(new FormData(form));
  const submit = form.querySelector('[type="submit"]');

  busy(submit, async () => {
    try {
      if (mode === 'login') {
        await login(f.email.trim(), f.password);
        location.href = next;
      } else if (mode === 'register') {
        const problems = passwordProblems(f.password);
        if (problems.length) return showError({ friendly: `A password precisa de ${problems.join(', ')}.` });
        if (f.password !== f.confirm) return showError({ friendly: 'As passwords não coincidem.' });
        const phone = f.phone.replace(/[\s-]/g, '');
        await register({ name: f.name.trim(), email: f.email.trim(), phone: phone ? (phone.startsWith('+') ? phone : `+258${phone.replace(/^0+/, '')}`) : undefined, password: f.password });
        toast('Conta criada. Enviámos um email para confirmar o seu endereço.');
        location.href = next;
      } else if (mode === 'forgot') {
        await api.post('/auth/forgot-password', { email: f.email.trim() });
        render($('#auth-card'), html`<div class="notice notice--ok">Se existir uma conta com esse email, enviámos um link para definir uma nova password. Verifique a caixa de entrada (e o spam).</div><p style="margin-top:16px"><a href="login.html">Voltar ao login</a></p>`);
      } else if (mode === 'reset') {
        const problems = passwordProblems(f.password);
        if (problems.length) return showError({ friendly: `A password precisa de ${problems.join(', ')}.` });
        if (f.password !== f.confirm) return showError({ friendly: 'As passwords não coincidem.' });
        await api.post('/auth/reset-password', { token: params().get('token'), password: f.password });
        toast('Password alterada. Entre com a nova password.');
        location.href = 'login.html';
      }
    } catch (err) {
      showError(err);
    }
  });
});

if (mode === 'reset' && !params().get('token')) {
  render($('#auth-card'), html`<div class="notice notice--bad">Link inválido. Peça um novo link de recuperação.</div><p style="margin-top:16px"><a href="forgot-password.html">Recuperar password</a></p>`);
}

if (mode === 'verify') {
  const card = $('#auth-card');
  const token = params().get('token');
  if (!token) render(card, html`<div class="notice notice--bad">Link de confirmação inválido.</div>`);
  else {
    try {
      await api.post('/auth/verify-email', { token });
      render(card, html`<div class="notice notice--ok">Email confirmado. Obrigado!</div><p style="margin-top:16px"><a class="btn btn--primary" href="index.html">Continuar a comprar</a></p>`);
    } catch (err) {
      render(card, html`<div class="notice notice--bad">${err.friendly}</div><p style="margin-top:16px"><a href="profile.html">Pedir novo email de confirmação</a></p>`);
    }
  }
}

// Mostrar/ocultar password (acessível).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-toggle-pw]');
  if (!b) return;
  const input = document.getElementById(b.dataset.togglePw);
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  b.textContent = show ? 'Ocultar' : 'Mostrar';
  b.setAttribute('aria-pressed', String(show));
});
