import { api } from '../api.js';
import { icon } from '../icons.js';
import { busy, confirmDialog, toast } from '../ui.js';
import { formatDateTime, formatMoney, html } from '../utils.js';
import { brandOptions, categoryOptions, productOptions } from './common.js';
import { formModal } from './forms.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Promoções', permission: 'promotions:manage' });

const KINDS = { REGULAR: 'Normal', FLASH_SALE: 'Flash Sale', SEASONAL: 'Sazonal (ex.: Black Friday)' };
const SCOPES = { STOREWIDE: 'Toda a loja', PRODUCT: 'Produtos', CATEGORY: 'Categorias', BRAND: 'Marcas' };
const STATES = [['active', 'Ativas'], ['scheduled', 'Agendadas'], ['ended', 'Terminadas'], ['disabled', 'Desativadas']];

function promoState(p) {
  const now = Date.now();
  if (!p.isActive) return html`<span class="badge badge--neutral">Desativada</span>`;
  if (new Date(p.endsAt) < now) return html`<span class="badge badge--neutral">Terminada</span>`;
  if (new Date(p.startsAt) > now) return html`<span class="badge badge--info">Agendada</span>`;
  return html`<span class="badge badge--ok">Ativa</span>`;
}

const fields = [
  { name: 'name', label: 'Nome', required: true, maxLength: 120 },
  { name: 'slug', label: 'Slug (página da promoção)', maxLength: 140, hint: 'Gerado a partir do nome se ficar vazio.' },
  { name: 'kind', label: 'Tipo', type: 'select', options: Object.entries(KINDS), placeholder: false },
  { name: 'isActive', label: 'Ativa', type: 'checkbox' },
  { name: 'discountType', label: 'Desconto', type: 'select', options: [['PERCENTAGE', 'Percentagem'], ['FIXED_AMOUNT', 'Valor fixo por produto']], placeholder: false },
  { name: 'percent', label: 'Desconto (%)', type: 'number', min: 1, max: 95, showIf: { field: 'discountType', in: ['PERCENTAGE'] } },
  { name: 'amount', label: 'Desconto por produto', type: 'money', showIf: { field: 'discountType', in: ['FIXED_AMOUNT'] } },
  { name: 'priority', label: 'Prioridade', type: 'number', min: 0, max: 1000, hint: 'Se duas promoções se aplicam ao mesmo produto, ganha a maior prioridade.' },
  { name: 'startsAt', label: 'Início', type: 'datetime', required: true },
  { name: 'endsAt', label: 'Fim', type: 'datetime', required: true },
  { name: 'scope', label: 'Aplica-se a', type: 'select', options: Object.entries(SCOPES), placeholder: false, full: true },
  { name: 'productIds', label: 'Produtos', type: 'multiselect', options: productOptions, showIf: { field: 'scope', in: ['PRODUCT'] } },
  { name: 'categoryIds', label: 'Categorias (inclui subcategorias)', type: 'multiselect', options: categoryOptions, showIf: { field: 'scope', in: ['CATEGORY'] } },
  { name: 'brandIds', label: 'Marcas', type: 'multiselect', options: brandOptions, showIf: { field: 'scope', in: ['BRAND'] } },
  { name: 'description', label: 'Descrição', type: 'textarea', rows: 2, nullable: true },
  { name: 'imageUrl', label: 'Imagem da promoção', type: 'image', folder: 'promotions', nullable: true },
];

function toBody(v) {
  const { percent, amount, ...rest } = v;
  if (rest.discountType === 'PERCENTAGE') rest.value = percent;
  if (rest.discountType === 'FIXED_AMOUNT') rest.value = amount;
  // Só o alvo do âmbito escolhido é enviado com conteúdo; os outros ficam vazios.
  for (const [scope, key] of [['PRODUCT', 'productIds'], ['CATEGORY', 'categoryIds'], ['BRAND', 'brandIds']]) if (rest.scope !== scope) rest[key] = [];
  return rest;
}

const target = (p) =>
  p.scope === 'STOREWIDE' ? 'Toda a loja' : `${SCOPES[p.scope]}: ${(p.scope === 'PRODUCT' ? p.productIds : p.scope === 'CATEGORY' ? p.categoryIds : p.brandIds).length}`;

const table = dataTable(main, {
  fetch: (query) => api.page('/admin/promotions', { query }),
  filters: [
    { name: 'search', label: 'Nome…' },
    { name: 'kind', label: 'Todos os tipos', type: 'select', options: Object.entries(KINDS) },
    { name: 'state', label: 'Todos os estados', type: 'select', options: STATES },
  ],
  actions: html`<button class="btn btn--primary" type="button" data-act="create">${icon('plus', { size: 18 })}Nova promoção</button>`,
  columns: [
    { label: 'Promoção', render: (p) => html`<strong>${p.name}</strong><br><small class="muted">${KINDS[p.kind]}</small>` },
    { label: 'Desconto', render: (p) => (p.discountType === 'PERCENTAGE' ? `${p.value}%` : formatMoney(p.value)) },
    { label: 'Alvo', render: target },
    { label: 'Período', render: (p) => html`${formatDateTime(p.startsAt)}<br><small class="muted">até ${formatDateTime(p.endsAt)}</small>` },
    { label: 'Estado', render: promoState },
  ],
  rowActions: (p) => html`<a class="btn btn--sm btn--ghost" href="../shop.html?promotion=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">Ver na loja</a>${act('edit', 'Editar', { iconName: 'edit' })}${act('delete', 'Remover', { danger: true })}`,
  empty: 'Nenhuma promoção encontrada.',
  onAction: async (a, p, button) => {
    if (a === 'create') {
      const start = new Date();
      const ok = await formModal({
        title: 'Nova promoção',
        fields,
        values: { kind: 'REGULAR', isActive: true, discountType: 'PERCENTAGE', scope: 'PRODUCT', priority: 0, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 7 * 86_400_000).toISOString() },
        submitLabel: 'Criar promoção',
        intro: html`<p class="muted">Os preços com desconto são calculados pelo servidor e aparecem na loja em poucos segundos.</p>`,
        onSubmit: (v) => api.post('/admin/promotions', toBody(v)),
      });
      if (ok) (toast('Promoção criada.'), table.reload());
    }
    if (a === 'edit') {
      const values = { ...p, percent: p.discountType === 'PERCENTAGE' ? p.value : undefined, amount: p.discountType === 'FIXED_AMOUNT' ? p.value : undefined };
      const ok = await formModal({ title: `Editar “${p.name}”`, fields, values, mode: 'edit', onSubmit: (v) => api.patch(`/admin/promotions/${p.id}`, toBody(v)) });
      if (ok) (toast('Promoção atualizada.'), table.reload());
    }
    if (a === 'delete') {
      if (!(await confirmDialog(`Remover “${p.name}”? Os preços voltam ao normal.`, { title: 'Remover promoção', confirmLabel: 'Remover', danger: true }))) return;
      busy(button, async () => {
        try {
          await api.delete(`/admin/promotions/${p.id}`);
          toast('Promoção removida.');
          table.reload();
        } catch (err) {
          toast(err.friendly, { type: 'error' });
        }
      });
    }
  },
});
