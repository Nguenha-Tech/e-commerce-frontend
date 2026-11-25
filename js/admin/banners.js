import { api } from '../api.js';
import { icon } from '../icons.js';
import { busy, confirmDialog, toast } from '../ui.js';
import { formatDate, html } from '../utils.js';
import { categoryOptions, productOptions } from './common.js';
import { formModal } from './forms.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Banners', permission: 'banners:manage' });

const PLACEMENTS = { HOMEPAGE: 'Página inicial', CATEGORY: 'Página de categoria', PROMOTION: 'Promoções', FLASH_SALE: 'Flash Sale' };

const fields = [
  { name: 'title', label: 'Título', required: true, maxLength: 120 },
  { name: 'subtitle', label: 'Subtítulo', maxLength: 200, nullable: true },
  { name: 'imageUrl', label: 'Imagem (desktop, ex.: 1200×400)', type: 'image', folder: 'banners', required: true },
  { name: 'mobileImageUrl', label: 'Imagem para telemóvel (opcional)', type: 'image', folder: 'banners', nullable: true },
  { name: 'placement', label: 'Local', type: 'select', options: Object.entries(PLACEMENTS), placeholder: false },
  { name: 'sortOrder', label: 'Ordem', type: 'number', min: 0, max: 10000, hint: 'Menor aparece primeiro.' },
  { name: 'linkUrl', label: 'Link', maxLength: 500, nullable: true, placeholder: '/promocoes/black-friday ou https://…', hint: 'Caminho relativo ou https. Deixe vazio se escolher produto/categoria.' },
  { name: 'productId', label: 'Produto', type: 'select', options: productOptions, emptyLabel: 'Nenhum', nullable: true },
  { name: 'categoryId', label: 'Categoria', type: 'select', options: categoryOptions, emptyLabel: 'Nenhuma', nullable: true },
  { name: 'isActive', label: 'Ativo', type: 'checkbox' },
  { name: 'startsAt', label: 'Mostrar a partir de', type: 'datetime', nullable: true },
  { name: 'endsAt', label: 'Mostrar até', type: 'datetime', nullable: true },
];

function bannerState(b) {
  const now = Date.now();
  if (!b.isActive) return html`<span class="badge badge--neutral">Inativo</span>`;
  if (b.endsAt && new Date(b.endsAt) < now) return html`<span class="badge badge--neutral">Terminado</span>`;
  if (b.startsAt && new Date(b.startsAt) > now) return html`<span class="badge badge--info">Agendado</span>`;
  return html`<span class="badge badge--ok">Visível</span>`;
}

const table = dataTable(main, {
  fetch: (query) => api.page('/admin/banners', { query }),
  filters: [
    { name: 'placement', label: 'Todos os locais', type: 'select', options: Object.entries(PLACEMENTS) },
    { name: 'active', label: 'Ativos e inativos', type: 'select', options: [['true', 'Só ativos'], ['false', 'Só inativos']] },
  ],
  actions: html`<button class="btn btn--primary" type="button" data-act="create">${icon('plus', { size: 18 })}Novo banner</button>`,
  columns: [
    { label: 'Banner', render: (b) => html`<div class="cell-banner"><img src="${b.imageUrl}" alt="" loading="lazy"><div><strong>${b.title}</strong>${b.subtitle ? html`<small>${b.subtitle}</small>` : ''}</div></div>` },
    { label: 'Local', render: (b) => html`${PLACEMENTS[b.placement]}<br><small class="muted">ordem ${b.sortOrder}</small>` },
    { label: 'Destino', render: (b) => b.product?.name ?? b.category?.name ?? b.linkUrl ?? '—' },
    { label: 'Período', render: (b) => (b.startsAt || b.endsAt ? `${b.startsAt ? formatDate(b.startsAt) : '…'} – ${b.endsAt ? formatDate(b.endsAt) : '…'}` : 'Sempre') },
    { label: 'Estado', render: bannerState },
  ],
  rowActions: () => html`${act('edit', 'Editar', { iconName: 'edit' })}${act('delete', 'Remover', { danger: true })}`,
  empty: 'Nenhum banner. Crie um para destacar promoções na página inicial.',
  onAction: async (a, b, button) => {
    if (a === 'create') {
      const ok = await formModal({ title: 'Novo banner', fields, values: { placement: 'HOMEPAGE', isActive: true, sortOrder: 0 }, submitLabel: 'Criar banner', onSubmit: (v) => api.post('/admin/banners', v) });
      if (ok) (toast('Banner criado.'), table.reload());
    }
    if (a === 'edit') {
      const ok = await formModal({ title: `Editar “${b.title}”`, fields, values: b, mode: 'edit', onSubmit: (v) => api.patch(`/admin/banners/${b.id}`, v) });
      if (ok) (toast('Banner atualizado.'), table.reload());
    }
    if (a === 'delete') {
      if (!(await confirmDialog(`Remover o banner “${b.title}”?`, { title: 'Remover banner', confirmLabel: 'Remover', danger: true }))) return;
      busy(button, async () => {
        try {
          await api.delete(`/admin/banners/${b.id}`);
          toast('Banner removido.');
          table.reload();
        } catch (err) {
          toast(err.friendly, { type: 'error' });
        }
      });
    }
  },
});
