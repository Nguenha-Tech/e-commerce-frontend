import { addressLines } from '../addresses.js';
import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { busy, openModal, showError, toast } from '../ui.js';
import { $, badge, formatDate, formatDateTime, formatMoney, formatNumber, html, ORDER_STATUS, params, PAYMENT_STATUS, productUrl, render } from '../utils.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Clientes', permission: 'customers:read' });

const USER_STATUS = {
  ACTIVE: { label: 'Ativo', tone: 'ok' },
  BLOCKED: { label: 'Bloqueado', tone: 'bad' },
  DISABLED: { label: 'Desativado', tone: 'neutral' },
};
const canBlock = hasPermission('customers:block');

const table = dataTable(main, {
  fetch: (query) => api.page('/admin/customers', { query }),
  filters: [
    { name: 'search', label: 'Nome, email ou telefone…' },
    { name: 'status', label: 'Todos os estados', type: 'select', options: Object.entries(USER_STATUS).map(([k, v]) => [k, v.label]) },
  ],
  columns: [
    { label: 'Cliente', render: (c) => html`<strong>${c.name}</strong><br><small class="muted">${c.email}</small>` },
    { label: 'Telefone', render: (c) => c.phone ?? '—' },
    { label: 'Registo', render: (c) => formatDate(c.createdAt) },
    { label: 'Último acesso', render: (c) => (c.lastLoginAt ? formatDateTime(c.lastLoginAt) : 'Nunca') },
    { label: 'Email', render: (c) => (c.emailVerifiedAt ? html`<span class="badge badge--ok">Verificado</span>` : html`<span class="badge badge--neutral">Por verificar</span>`) },
    { label: 'Estado', render: (c) => badge(USER_STATUS, c.status) },
  ],
  rowActions: () => act('view', 'Ver perfil', { iconName: 'eye' }),
  onAction: (a, c) => a === 'view' && openCustomer(c.id),
  empty: 'Nenhum cliente encontrado.',
});

async function openCustomer(id) {
  const body = document.createElement('div');
  const m = openModal({ title: 'Cliente', body, size: 'lg' });
  const load = async () => {
    render(body, html`<div class="sk sk--line"></div><div class="sk sk--line"></div>`);
    try {
      const [c, wishlist] = await Promise.all([api.get(`/admin/customers/${id}`), api.get(`/admin/customers/${id}/wishlist`).catch(() => [])]);
      $('.modal__title', m.el).textContent = c.name;
      const s = c.stats;
      render(
        body,
        html`<div class="chips" style="margin-bottom:12px">${badge(USER_STATUS, c.status)}${c.emailVerifiedAt ? html`<span class="badge badge--ok">Email verificado</span>` : html`<span class="badge badge--neutral">Email por verificar</span>`}${c.lockedUntil && new Date(c.lockedUntil) > new Date() ? html`<span class="badge badge--warn">Bloqueio temporário até ${formatDateTime(c.lockedUntil)}</span>` : ''}</div>
        ${c.blockedReason ? html`<p class="notice notice--warn">Motivo do bloqueio: ${c.blockedReason}</p>` : ''}
        <div class="kpis kpis--4" style="margin-bottom:16px">
          <div class="kpi"><span class="kpi__label">Total gasto</span><span class="kpi__value">${formatMoney(s.totalSpent)}</span></div>
          <div class="kpi"><span class="kpi__label">Pedidos</span><span class="kpi__value">${formatNumber(s.ordersCount)}</span></div>
          <div class="kpi"><span class="kpi__label">Avaliações</span><span class="kpi__value">${formatNumber(s.reviewsCount)}</span></div>
          <div class="kpi"><span class="kpi__label">Favoritos</span><span class="kpi__value">${formatNumber(s.wishlistCount)}</span></div>
        </div>
        <div class="grid-2">
          <section><h3>Contacto</h3><dl class="kv">
            <div><dt>Email</dt><dd><a href="mailto:${c.email}">${c.email}</a></dd></div>
            <div><dt>Telefone</dt><dd>${c.phone ? html`<a href="tel:${c.phone}">${c.phone}</a>` : '—'}</dd></div>
            <div><dt>Localização</dt><dd>${[c.city, c.province, c.country].filter(Boolean).join(', ') || '—'}</dd></div>
            <div><dt>Cliente desde</dt><dd>${formatDate(c.createdAt)}</dd></div>
            <div><dt>Último acesso</dt><dd>${c.lastLoginAt ? formatDateTime(c.lastLoginAt) : 'Nunca'}</dd></div>
            <div><dt>Sessões ativas</dt><dd>${s.activeSessions}</dd></div>
          </dl></section>
          <section><h3>Endereços</h3>${c.addresses.length ? c.addresses.map((a) => html`<address class="addr" style="margin-bottom:10px">${a.isDefault ? html`<span class="badge badge--info">Predefinido</span>` : ''}${addressLines(a).map((l) => html`<span>${l}</span>`)}</address>`) : html`<p class="muted">Sem endereços guardados.</p>`}</section>
        </div>
        <h3>Pedidos recentes</h3>
        ${c.recentOrders.length
          ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Pedido</th><th>Data</th><th>Pagamento</th><th>Estado</th><th class="num">Total</th></tr></thead><tbody>${c.recentOrders.map(
              (o) => html`<tr><td><a href="orders.html?id=${o.id}"><strong>#${o.orderNumber}</strong></a></td><td>${formatDate(o.createdAt)}</td><td>${badge(PAYMENT_STATUS, o.paymentStatus)}</td><td>${badge(ORDER_STATUS, o.status)}</td><td class="num">${formatMoney(o.grandTotal, o.currency)}</td></tr>`,
            )}</tbody></table></div>`
          : html`<p class="muted">Ainda não fez pedidos.</p>`}
        <h3 style="margin-top:16px">Favoritos</h3>
        ${wishlist.length
          ? html`<ul class="rank">${wishlist.map((w) => html`<li><span><a href="../${productUrl(w.product)}" target="_blank" rel="noopener">${w.product.name}</a><small>${w.inStock ? 'Em stock' : 'Sem stock'}${w.stockAlertActive ? ' · quer ser avisado quando voltar' : ''} · adicionado ${formatDate(w.addedAt)}</small></span><span>${formatMoney(w.product.price.from, w.product.price.currency)}</span></li>`)}</ul>`
          : html`<p class="muted">Sem favoritos.</p>`}
        ${canBlock && c.status !== 'DISABLED'
          ? html`<div style="margin-top:20px">${c.status === 'BLOCKED' ? html`<button class="btn" type="button" data-unblock>Desbloquear cliente</button>` : html`<button class="btn btn--ghost dt__danger" type="button" data-block>Bloquear cliente</button>`}</div>`
          : ''}`,
      );
      body.onclick = (e) => {
        if (e.target.closest('[data-unblock]'))
          busy(e.target.closest('[data-unblock]'), async () => {
            try {
              await api.post(`/admin/customers/${id}/unblock`, {});
              toast('Cliente desbloqueado.');
              table.reload();
              load();
            } catch (err) {
              toast(err.friendly, { type: 'error' });
            }
          });
        if (e.target.closest('[data-block]')) blockCustomer(c, () => (table.reload(), load()));
      };
    } catch (err) {
      showError(body, err, load);
    }
  };
  load();
}

function blockCustomer(c, done) {
  const form = document.createElement('form');
  form.id = 'block-form';
  render(form, html`<p>${c.name} deixa de conseguir entrar na loja e as sessões ativas terminam. Os pedidos existentes mantêm-se.</p>
    <div class="field"><label for="bk-reason">Motivo (fica no registo de auditoria)</label><textarea class="textarea" id="bk-reason" name="reason" required minlength="3" maxlength="300" rows="3"></textarea></div><div class="form-error" role="alert"></div>`);
  const m = openModal({ title: 'Bloquear cliente', body: form, size: 'sm', actions: [{ label: 'Voltar', onClick: ({ close }) => close() }, { label: 'Bloquear', variant: 'danger', type: 'submit', form: 'block-form' }] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    busy(m.el.querySelector('[form="block-form"]'), async () => {
      try {
        await api.post(`/admin/customers/${c.id}/block`, { reason: form.reason.value.trim() });
        m.close();
        toast('Cliente bloqueado.');
        done();
      } catch (err) {
        render($('.form-error', form), err.friendly);
      }
    });
  });
}

if (params().get('id')) openCustomer(params().get('id'));
