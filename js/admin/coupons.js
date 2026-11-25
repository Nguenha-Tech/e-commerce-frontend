import { api } from '../api.js';
import { icon } from '../icons.js';
import { busy, confirmDialog, openModal, pagination, showError, toast } from '../ui.js';
import { $, formatDate, formatDateTime, formatMoney, formatNumber, html, render } from '../utils.js';
import { categoryOptions, productOptions } from './common.js';
import { formModal } from './forms.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Cupões', permission: 'coupons:manage' });

const TYPES = { PERCENTAGE: 'Percentagem', FIXED_AMOUNT: 'Valor fixo', FREE_SHIPPING: 'Portes grátis' };
const STATES = [['valid', 'Válidos'], ['scheduled', 'Agendados'], ['expired', 'Expirados'], ['exhausted', 'Esgotados']];

/** Estado apresentado; o backend continua a validar tudo no checkout. */
function couponState(c) {
  const now = Date.now();
  if (c.status === 'INACTIVE') return html`<span class="badge badge--neutral">Inativo</span>`;
  if (c.expiresAt && new Date(c.expiresAt) < now) return html`<span class="badge badge--neutral">Expirado</span>`;
  if (c.startsAt && new Date(c.startsAt) > now) return html`<span class="badge badge--info">Agendado</span>`;
  if (c.usageLimit && c.usedCount >= c.usageLimit) return html`<span class="badge badge--warn">Esgotado</span>`;
  return html`<span class="badge badge--ok">Válido</span>`;
}

const describe = (c) => (c.discountType === 'PERCENTAGE' ? `${c.value}%` : c.discountType === 'FIXED_AMOUNT' ? formatMoney(c.value) : 'Portes grátis');

const fields = [
  { name: 'code', label: 'Código', required: true, maxLength: 40, hint: 'Letras, números, - ou _. Guardado em maiúsculas.' },
  { name: 'status', label: 'Estado', type: 'select', options: [['ACTIVE', 'Ativo'], ['INACTIVE', 'Inativo']], placeholder: false },
  { name: 'discountType', label: 'Tipo de desconto', type: 'select', options: Object.entries(TYPES), placeholder: false },
  { name: 'percent', label: 'Desconto (%)', type: 'number', min: 1, max: 100, showIf: { field: 'discountType', in: ['PERCENTAGE'] } },
  { name: 'amount', label: 'Valor do desconto', type: 'money', showIf: { field: 'discountType', in: ['FIXED_AMOUNT'] } },
  { name: 'maxDiscountAmount', label: 'Desconto máximo', type: 'money', nullable: true, hint: 'Opcional. Limita o desconto percentual.', showIf: { field: 'discountType', in: ['PERCENTAGE'] } },
  { name: 'minOrderAmount', label: 'Compra mínima', type: 'money', nullable: true },
  { name: 'usageLimit', label: 'Limite total de usos', type: 'number', min: 1, nullable: true },
  { name: 'usageLimitPerUser', label: 'Usos por cliente', type: 'number', min: 1, nullable: true },
  { name: 'startsAt', label: 'Início', type: 'datetime', nullable: true },
  { name: 'expiresAt', label: 'Expira em', type: 'datetime', nullable: true },
  { name: 'description', label: 'Descrição interna', type: 'textarea', rows: 2, nullable: true },
  { name: 'applicableCategoryIds', label: 'Só nestas categorias (vazio = todas)', type: 'multiselect', options: categoryOptions },
  { name: 'applicableProductIds', label: 'Só nestes produtos (vazio = todos)', type: 'multiselect', options: productOptions },
];

/** Converte os campos do formulário para o formato da API (value único). */
function toBody(v) {
  const { percent, amount, ...rest } = v;
  if (rest.discountType === 'PERCENTAGE') rest.value = percent;
  else if (rest.discountType === 'FIXED_AMOUNT') rest.value = amount;
  else if (rest.discountType === 'FREE_SHIPPING') rest.value = 0;
  if (rest.discountType && rest.discountType !== 'PERCENTAGE') rest.maxDiscountAmount = null;
  return rest;
}

const table = dataTable(main, {
  fetch: (query) => api.page('/admin/coupons', { query }),
  filters: [
    { name: 'search', label: 'Código…' },
    { name: 'state', label: 'Todos', type: 'select', options: STATES },
  ],
  actions: html`<button class="btn btn--primary" type="button" data-act="create">${icon('plus', { size: 18 })}Novo cupão</button>`,
  columns: [
    { label: 'Código', render: (c) => html`<strong class="code">${c.code}</strong>${c.description ? html`<br><small class="muted">${c.description}</small>` : ''}` },
    { label: 'Desconto', render: (c) => html`${describe(c)}${c.minOrderAmount ? html`<br><small class="muted">mín. ${formatMoney(c.minOrderAmount)}</small>` : ''}` },
    { label: 'Usos', className: 'num', render: (c) => `${formatNumber(c.usedCount)}${c.usageLimit ? ` / ${formatNumber(c.usageLimit)}` : ''}` },
    { label: 'Validade', render: (c) => (c.startsAt || c.expiresAt ? html`${c.startsAt ? formatDate(c.startsAt) : '…'} – ${c.expiresAt ? formatDate(c.expiresAt) : '…'}` : 'Sem prazo') },
    { label: 'Estado', render: couponState },
  ],
  rowActions: () => html`${act('usages', 'Usos')}${act('edit', 'Editar', { iconName: 'edit' })}${act('delete', 'Remover', { danger: true })}`,
  empty: 'Nenhum cupão encontrado.',
  onAction: async (a, c, button) => {
    if (a === 'create') {
      const ok = await formModal({
        title: 'Novo cupão',
        fields,
        values: { status: 'ACTIVE', discountType: 'PERCENTAGE', usageLimitPerUser: 1 },
        submitLabel: 'Criar cupão',
        onSubmit: (v) => api.post('/admin/coupons', toBody(v)),
      });
      if (ok) (toast('Cupão criado.'), table.reload());
    }
    if (a === 'edit') {
      const values = { ...c, percent: c.discountType === 'PERCENTAGE' ? c.value : undefined, amount: c.discountType === 'FIXED_AMOUNT' ? c.value : undefined };
      const ok = await formModal({ title: `Editar ${c.code}`, fields, values, mode: 'edit', onSubmit: (v) => api.patch(`/admin/coupons/${c.id}`, toBody(v)) });
      if (ok) (toast('Cupão atualizado.'), table.reload());
    }
    if (a === 'usages') usagesModal(c);
    if (a === 'delete') {
      if (!(await confirmDialog(`Remover o cupão ${c.code}? Deixa de poder ser usado; o histórico de pedidos mantém-se.`, { title: 'Remover cupão', confirmLabel: 'Remover', danger: true }))) return;
      busy(button, async () => {
        try {
          await api.delete(`/admin/coupons/${c.id}`);
          toast('Cupão removido.');
          table.reload();
        } catch (err) {
          toast(err.friendly, { type: 'error' });
        }
      });
    }
  },
});

function usagesModal(c) {
  const body = document.createElement('div');
  openModal({ title: `Usos de ${c.code}`, body, size: 'lg' });
  const load = async (page = 1) => {
    render(body, html`<div class="sk sk--line"></div><div class="sk sk--line"></div>`);
    try {
      const [detail, { items, meta }] = await Promise.all([api.get(`/admin/coupons/${c.id}`), api.page(`/admin/coupons/${c.id}/usages`, { query: { page, limit: 20 } })]);
      render(
        body,
        html`<div class="kpis" style="margin-bottom:16px">
          <div class="kpi"><span class="kpi__label">Utilizações</span><span class="kpi__value">${formatNumber(detail.stats.uses)}</span></div>
          <div class="kpi"><span class="kpi__label">Desconto concedido</span><span class="kpi__value">${formatMoney(detail.stats.totalDiscount)}</span></div>
        </div>
        ${items.length
          ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Cliente</th><th>Pedido</th><th class="num">Desconto</th></tr></thead><tbody>${items.map(
              (u) => html`<tr><td>${formatDateTime(u.createdAt)}</td><td>${u.user?.name ?? '—'}<br><small class="muted">${u.user?.email ?? ''}</small></td><td>${u.order ? html`<a href="orders.html?id=${u.order.id}">#${u.order.orderNumber}</a>` : '—'}</td><td class="num">${formatMoney(u.discountAmount)}</td></tr>`,
            )}</tbody></table></div><div class="dt__foot"><span></span><div class="pg"></div></div>`
          : html`<div class="state"><p class="state__title">Ainda ninguém usou este cupão.</p></div>`}`,
      );
      if (items.length) pagination($('.pg', body), meta, load);
    } catch (err) {
      showError(body, err, () => load(page));
    }
  };
  load();
}
