import { api } from '../api.js';
import { icon } from '../icons.js';
import { busy, confirmDialog, toast } from '../ui.js';
import { html } from '../utils.js';
import { resetOptionCache } from './common.js';
import { formModal } from './forms.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Marcas', permission: 'brands:manage' });

const fields = [
  { name: 'name', label: 'Nome', required: true, maxLength: 80 },
  { name: 'slug', label: 'Slug (URL)', hint: 'Gerado a partir do nome se ficar vazio.', maxLength: 140 },
  { name: 'website', label: 'Website', type: 'url', placeholder: 'https://', nullable: true },
  { name: 'status', label: 'Estado', type: 'select', options: [['ACTIVE', 'Ativa'], ['INACTIVE', 'Inativa']], placeholder: false },
  { name: 'description', label: 'Descrição', type: 'textarea', rows: 3, nullable: true },
  { name: 'logoUrl', label: 'Logótipo', type: 'image', folder: 'brands', nullable: true },
];

/** A API devolve todas as marcas de uma vez; pesquisa e filtro são feitos aqui. */
let all = null;
async function fetchBrands(q) {
  all ??= await api.get('/admin/brands');
  const s = (q.search ?? '').toLowerCase();
  const items = all.filter((b) => (!s || b.name.toLowerCase().includes(s)) && (!q.status || b.status === q.status));
  return { items, meta: { total: items.length, page: 1, totalPages: 1 } };
}
const refresh = () => ((all = null), resetOptionCache(), table.reload());

const table = dataTable(main, {
  fetch: fetchBrands,
  filters: [
    { name: 'search', label: 'Pesquisar marca…' },
    { name: 'status', label: 'Todos os estados', type: 'select', options: [['ACTIVE', 'Ativa'], ['INACTIVE', 'Inativa']] },
  ],
  actions: html`<button class="btn btn--primary" type="button" data-act="create">${icon('plus', { size: 18 })}Nova marca</button>`,
  columns: [
    { label: 'Marca', render: (b) => html`<div class="cell-prod">${b.logoUrl ? html`<img src="${b.logoUrl}" alt="">` : html`<span class="cell-prod__ph" aria-hidden="true">${icon('tag', { size: 18 })}</span>`}<div><strong>${b.name}</strong><small>${b.slug}</small></div></div>` },
    { label: 'Website', render: (b) => (b.website ? html`<a href="${b.website}" target="_blank" rel="noopener">${b.website.replace(/^https?:\/\//, '')}</a>` : '—') },
    { label: 'Produtos', className: 'num', render: (b) => b.productsCount },
    { label: 'Estado', render: (b) => (b.status === 'ACTIVE' ? html`<span class="badge badge--ok">Ativa</span>` : html`<span class="badge badge--neutral">Inativa</span>`) },
  ],
  rowActions: () => html`${act('edit', 'Editar', { iconName: 'edit' })}${act('delete', 'Remover', { danger: true })}`,
  empty: 'Nenhuma marca encontrada.',
  onAction: async (a, b, button) => {
    if (a === 'create') {
      const ok = await formModal({ title: 'Nova marca', fields, values: { status: 'ACTIVE' }, submitLabel: 'Criar marca', onSubmit: (v) => api.post('/admin/brands', v) });
      if (ok) (toast('Marca criada.'), refresh());
    }
    if (a === 'edit') {
      const ok = await formModal({ title: `Editar “${b.name}”`, fields, values: b, mode: 'edit', onSubmit: (v) => api.patch(`/admin/brands/${b.id}`, v) });
      if (ok) (toast('Marca atualizada.'), refresh());
    }
    if (a === 'delete') {
      const msg = b.productsCount ? `“${b.name}” tem ${b.productsCount} produto(s). Se a loja recusar, desative a marca em vez de a remover.` : `Remover “${b.name}”?`;
      if (!(await confirmDialog(msg, { title: 'Remover marca', confirmLabel: 'Remover', danger: true }))) return;
      busy(button, async () => {
        try {
          await api.delete(`/admin/brands/${b.id}`);
          toast('Marca removida.');
          refresh();
        } catch (err) {
          toast(err.friendly, { type: 'error' });
        }
      });
    }
  },
});
