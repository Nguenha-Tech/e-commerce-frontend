import { addressCard, addressesApi, editAddress } from '../addresses.js';
import { api } from '../api.js';
import { logout, refreshUser } from '../auth.js';
import { icon } from '../icons.js';
import { initPage } from '../layout.js';
import { notificationLink, notificationsApi, refreshUnread } from '../notifications.js';
import { reviewsApi } from '../reviews.js';
import { busy, confirmDialog, emptyState, pagination, setSeo, showError, showLoading, stars, toast, toastError } from '../ui.js';
import { $, formatDate, formatDateTime, html, initials, params, render, setParams, timeAgo } from '../utils.js';

const user = await initPage({ auth: true });
setSeo({ title: 'A minha conta' });

const TABS = [
  ['dados', 'Dados pessoais'],
  ['enderecos', 'Endereços'],
  ['seguranca', 'Password e sessões'],
  ['notificacoes', 'Notificações'],
  ['avaliacoes', 'Avaliações'],
];
const panel = $('#profile-panel');

function tabs(active) {
  render(
    $('#profile-tabs'),
    html`${TABS.map(([k, l]) => html`<a class="tab ${k === active ? 'is-active' : ''}" href="?tab=${k}" data-tab="${k}" ${k === active ? html`aria-current="page"` : ''}>${l}</a>`)}`,
  );
}

function show(tab) {
  tabs(tab);
  ({ dados, enderecos, seguranca, notificacoes, avaliacoes })[tab]?.();
}

$('#profile-tabs').addEventListener('click', (e) => {
  const a = e.target.closest('[data-tab]');
  if (!a) return;
  e.preventDefault();
  setParams({ tab: a.dataset.tab });
  show(a.dataset.tab);
});

// ------------------------------------------------------------------ dados
async function dados() {
  const u = await refreshUser();
  render(
    panel,
    html`<form class="panel" id="profile-form">
      <div class="profile-head">
        <span class="avatar avatar--lg">${u.avatarUrl ? html`<img src="${u.avatarUrl}" alt="">` : initials(u.name)}</span>
        <div><strong>${u.name}</strong><p class="muted">Cliente desde ${formatDate(u.createdAt)}</p></div>
      </div>
      ${!u.emailVerified ? html`<div class="notice notice--warn" style="margin-bottom:14px">${icon('mail', { size: 18 })}<span>Confirme o seu email para receber atualizações dos pedidos. <button class="link-btn" type="button" id="resend">Reenviar email</button></span></div>` : ''}
      <div class="form-error" role="alert"></div>
      <div class="form-grid form-grid--2">
        <div class="field"><label for="p-name">Nome</label><input class="input" id="p-name" name="name" required minlength="2" value="${u.name}" autocomplete="name"></div>
        <div class="field"><label for="p-email">Email</label><input class="input" id="p-email" value="${u.email}" disabled><span class="field__hint">Para alterar o email, contacte o suporte.</span></div>
        <div class="field"><label for="p-phone">Telefone</label><input class="input" id="p-phone" name="phone" type="tel" value="${u.phone ?? ''}" placeholder="+258841234567" autocomplete="tel"></div>
        <div class="field"><label for="p-birth">Data de nascimento</label><input class="input" id="p-birth" name="birthDate" type="date" value="${u.birthDate ? u.birthDate.slice(0, 10) : ''}"></div>
        <div class="field"><label for="p-city">Cidade</label><input class="input" id="p-city" name="city" value="${u.city ?? ''}" autocomplete="address-level2"></div>
        <div class="field"><label for="p-province">Província</label><input class="input" id="p-province" name="province" value="${u.province ?? ''}" autocomplete="address-level1"></div>
        <div class="field"><label for="p-avatar">Foto de perfil (URL da imagem)</label><input class="input" id="p-avatar" name="avatarUrl" type="url" value="${u.avatarUrl ?? ''}" placeholder="https://…"></div>
      </div>
      <button class="btn btn--primary" type="submit">Guardar alterações</button>
    </form>`,
  );
  $('#resend')?.addEventListener('click', async (e) => {
    try {
      await api.post('/auth/resend-verification');
      toast('Email de confirmação enviado.');
      e.target.disabled = true;
    } catch (err) {
      toastError(err);
    }
  });
  $('#profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const body = {
      name: f.name.trim(),
      phone: f.phone.trim() ? f.phone.replace(/[\s-]/g, '') : null,
      city: f.city.trim() || null,
      province: f.province.trim() || null,
      avatarUrl: f.avatarUrl.trim() || null,
      birthDate: f.birthDate || null,
    };
    busy(e.submitter, async () => {
      try {
        await api.patch('/users/me', body);
        toast('Dados atualizados.');
        dados();
      } catch (err) {
        render($('.form-error', e.target), err.friendly);
      }
    });
  });
}

// ------------------------------------------------------------------ endereços
async function enderecos() {
  showLoading(panel);
  try {
    const list = await addressesApi.list();
    render(
      panel,
      html`<div class="panel">
        <div class="section__head"><h2 class="panel__title" style="margin:0">Endereços</h2><button class="btn btn--sm btn--primary" type="button" id="new-addr">${icon('plus', { size: 16 })}Adicionar endereço</button></div>
        ${list.length
          ? html`<ul class="addr-grid">${list.map(
              (a) => html`<li class="addr-card">${addressCard(a)}<div class="addr-card__actions">
                <button class="link-btn" type="button" data-edit="${a.id}">Editar</button>
                ${!a.isDefault ? html`<button class="link-btn" type="button" data-default="${a.id}">Definir como principal</button>` : ''}
                <button class="link-btn link-btn--danger" type="button" data-del="${a.id}">Remover</button></div></li>`,
            )}</ul>`
          : emptyState({ iconName: 'pin', title: 'Sem endereços guardados.', text: 'Adicione um endereço para comprar mais depressa.' })}
      </div>`,
    );
    panel.onclick = async (e) => {
      if (e.target.closest('#new-addr')) return (await editAddress()) && enderecos();
      const ed = e.target.closest('[data-edit]');
      if (ed) return (await editAddress(list.find((a) => a.id === ed.dataset.edit))) && enderecos();
      const df = e.target.closest('[data-default]');
      if (df) return addressesApi.setDefault(df.dataset.default).then(enderecos).catch(toastError);
      const del = e.target.closest('[data-del]');
      if (del && (await confirmDialog('Remover este endereço?', { confirmLabel: 'Remover', danger: true }))) {
        addressesApi.remove(del.dataset.del).then(() => (toast('Endereço removido.'), enderecos())).catch(toastError);
      }
    };
  } catch (err) {
    showError(panel, err, enderecos);
  }
}

// ------------------------------------------------------------------ segurança
async function seguranca() {
  render(
    panel,
    html`<form class="panel" id="pw-form">
        <h2 class="panel__title">Alterar password</h2>
        <div class="form-error" role="alert"></div>
        <div class="form-grid form-grid--2">
          <div class="field"><label for="cur">Password atual</label><input class="input" id="cur" name="currentPassword" type="password" required autocomplete="current-password"></div>
          <div class="field"><label for="new">Nova password</label><input class="input" id="new" name="newPassword" type="password" required minlength="8" autocomplete="new-password"><span class="field__hint">Mínimo 8 caracteres, com letras e números.</span></div>
        </div>
        <button class="btn btn--primary" type="submit">Alterar password</button>
      </form>
      <section class="panel"><h2 class="panel__title">Sessões ativas</h2><div id="sessions"></div>
        <button class="btn btn--sm" type="button" id="logout-all">Terminar sessão em todos os dispositivos</button></section>`,
  );
  $('#pw-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    busy(e.submitter, async () => {
      try {
        await api.post('/auth/change-password', f);
        e.target.reset();
        toast('Password alterada.');
      } catch (err) {
        render($('.form-error', e.target), err.friendly);
      }
    });
  });
  $('#logout-all').addEventListener('click', async () => {
    if (await confirmDialog('Terminar a sessão em todos os dispositivos, incluindo este?', { confirmLabel: 'Terminar todas' })) logout({ everywhere: true });
  });
  const el = $('#sessions');
  showLoading(el, 'lines', 2);
  try {
    const sessions = await api.get('/auth/sessions');
    render(
      el,
      html`<ul class="session-list">${sessions.map(
        (s) => html`<li><div><strong>${(s.userAgent ?? 'Dispositivo').slice(0, 70)}</strong><span class="muted">${s.ip ?? ''} · último uso ${timeAgo(s.lastUsedAt ?? s.createdAt)}</span></div>
          ${s.current ? html`<span class="badge badge--ok">Esta sessão</span>` : html`<button class="link-btn link-btn--danger" type="button" data-revoke="${s.id}">Terminar</button>`}</li>`,
      )}</ul>`,
    );
    el.onclick = (e) => {
      const r = e.target.closest('[data-revoke]');
      if (r) api.delete(`/auth/sessions/${r.dataset.revoke}`).then(() => (toast('Sessão terminada.'), seguranca())).catch(toastError);
    };
  } catch (err) {
    showError(el, err, seguranca);
  }
}

// ------------------------------------------------------------------ notificações
async function notificacoes(page = 1) {
  showLoading(panel);
  try {
    const { items, meta } = await notificationsApi.list({ page, limit: 15 });
    render(
      panel,
      html`<section class="panel">
        <div class="section__head"><h2 class="panel__title" style="margin:0">Notificações</h2>${meta.unread ? html`<button class="btn btn--sm" type="button" id="read-all">Marcar todas como lidas</button>` : ''}</div>
        ${items.length
          ? html`<ul class="notif-list notif-list--page">${items.map((n) => {
              const link = notificationLink(n);
              return html`<li class="notif ${n.readAt ? '' : 'is-unread'}"><strong>${n.title}</strong><span>${n.body}</span><time datetime="${n.createdAt}">${formatDateTime(n.createdAt)}</time>
                <span class="notif__actions">${link ? html`<a href="${link}" data-read="${n.id}">Abrir</a>` : ''}${!n.readAt ? html`<button class="link-btn" type="button" data-read="${n.id}">Marcar como lida</button>` : ''}<button class="link-btn link-btn--danger" type="button" data-del="${n.id}">Apagar</button></span></li>`;
            })}</ul><div id="n-pager"></div>`
          : emptyState({ iconName: 'bell', title: 'Sem notificações.' })}
      </section>`,
    );
    if ($('#n-pager')) pagination($('#n-pager'), meta, notificacoes);
    panel.onclick = async (e) => {
      if (e.target.closest('#read-all')) return notificationsApi.readAll().then(() => (refreshUnread(), notificacoes(page)));
      const r = e.target.closest('[data-read]');
      if (r) {
        await notificationsApi.read(r.dataset.read).catch(() => {});
        refreshUnread();
        if (r.tagName === 'BUTTON') notificacoes(page);
      }
      const d = e.target.closest('[data-del]');
      if (d) notificationsApi.remove(d.dataset.del).then(() => (refreshUnread(), notificacoes(page))).catch(toastError);
    };
  } catch (err) {
    showError(panel, err, () => notificacoes(page));
  }
}

// ------------------------------------------------------------------ avaliações
async function avaliacoes() {
  showLoading(panel);
  try {
    const [eligible, { items }] = await Promise.all([reviewsApi.eligible(), reviewsApi.mine({ limit: 50 })]);
    const STATUS = { PENDING: 'Em moderação', APPROVED: 'Publicada', HIDDEN: 'Oculta', REJECTED: 'Rejeitada' };
    render(
      panel,
      html`${eligible.length
          ? html`<section class="panel"><h2 class="panel__title">Por avaliar</h2><ul class="mini-items">${eligible.map((i) => html`<li><span class="mini-items__img">${i.imageUrl ? html`<img src="${i.imageUrl}" alt="">` : ''}</span><span class="mini-items__name">${i.productName}<small>Pedido ${i.order.orderNumber}</small></span><a class="btn btn--sm btn--primary" href="product.html?slug=${i.productSlug}#reviews">Avaliar</a></li>`)}</ul></section>`
          : ''}
        <section class="panel"><h2 class="panel__title">As minhas avaliações</h2>
          ${items.length
            ? html`<ul class="review-list">${items.map((r) => html`<li class="review"><div class="review__head">${stars(r.rating)}<a href="product.html?slug=${r.product.slug}">${r.product.name}</a><span class="badge">${STATUS[r.status] ?? r.status}</span></div>${r.comment ? html`<p>${r.comment}</p>` : ''}${r.adminReply ? html`<div class="review__reply"><strong>Resposta da loja</strong><p>${r.adminReply}</p></div>` : ''}<button class="link-btn link-btn--danger" type="button" data-del-review="${r.id}">Apagar avaliação</button></li>`)}</ul>`
            : html`<p class="muted">Ainda não avaliou nenhum produto.</p>`}
        </section>`,
    );
    panel.onclick = async (e) => {
      const d = e.target.closest('[data-del-review]');
      if (d && (await confirmDialog('Apagar esta avaliação?', { confirmLabel: 'Apagar', danger: true }))) reviewsApi.remove(d.dataset.delReview).then(avaliacoes).catch(toastError);
    };
  } catch (err) {
    showError(panel, err, avaliacoes);
  }
}

render($('#profile-hello'), html`Olá, ${user.name.split(' ')[0]}`);
show(TABS.some(([k]) => k === params().get('tab')) ? params().get('tab') : 'dados');
