import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { confirmDialog, toast, toastError } from '../ui.js';
import { badge, formatMoney, html, params, PRODUCT_STATUS } from '../utils.js';
import { brandOptions, categoryOptions } from './common.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Produtos', permission: 'products:read' });
const [cats, brands] = await Promise.all([categoryOptions().catch(() => []), brandOptions().catch(() => [])]);

const table = dataTable(main, {
  fetch: (query) => api.page('/admin/products', { query }),
  initial: { status: params().get('status') ?? undefined },
  filters: [
    { name: 'search', label: 'Pesquisar nome ou SKU…' },
    { name: 'status', label: 'Todos os estados', type: 'select', options: Object.entries(PRODUCT_STATUS).map(([k, v]) => [k, v.label]) },
    { name: 'category', label: 'Todas as categorias', type: 'select', options: cats },
    { name: 'brand', label: 'Todas as marcas', type: 'select', options: brands },
  ],
  actions: hasPermission('products:create') ? html`<a class="btn btn--primary" href="product-form.html">+ Adicionar produto</a>` : '',
  columns: [
    {
      label: 'Produto',
      render: (p) => html`<div class="cell-prod">${p.images[0] ? html`<img src="${p.images[0].thumbnailUrl}" alt="" loading="lazy">` : html`<img alt="">`}<div><strong>${p.name}</strong><small>${p.brand?.name ?? 'Sem marca'} · ${p.category?.name ?? ''}${p._count.variants > 1 ? ` · ${p._count.variants} variantes` : ''}</small></div></div>`,
    },
    { label: 'SKU', render: (p) => p.sku },
    { label: 'Preço', className: 'num', render: (p) => (p.minPrice === p.maxPrice ? formatMoney(p.minPrice, p.currency) : html`${formatMoney(p.minPrice, p.currency)}<br><small class="muted">até ${formatMoney(p.maxPrice, p.currency)}</small>`) },
    { label: 'Stock', className: 'num', render: (p) => (p.availableStock <= 0 ? html`<span class="badge badge--bad">0</span>` : p.availableStock) },
    { label: 'Vendidos', className: 'num', render: (p) => p.soldCount },
    { label: 'Estado', render: (p) => html`${badge(PRODUCT_STATUS, p.status)}${p.isFeatured ? html` <span class="badge badge--info">Destaque</span>` : ''}` },
  ],
  rowActions: (p) => html`
    ${act('edit', 'Editar', { iconName: 'edit' })}
    ${hasPermission('products:create') ? act('duplicate', 'Duplicar', { iconName: 'copy' }) : ''}
    ${p.status === 'ACTIVE' || p.status === 'OUT_OF_STOCK' ? act('deactivate', 'Desativar') : p.status === 'INACTIVE' || p.status === 'DRAFT' ? act('activate', 'Publicar') : ''}
    ${p.status === 'ACTIVE' || p.status === 'OUT_OF_STOCK' ? html`<a class="btn btn--sm btn--ghost" href="../product.html?slug=${p.slug}" target="_blank" rel="noopener">Ver</a>` : ''}
    ${hasPermission('products:delete') ? act('delete', 'Excluir', { danger: true, iconName: 'trash' }) : ''}`,
  empty: 'Nenhum produto encontrado.',
  onAction: async (action, p, btn) => {
    try {
      if (action === 'edit') location.href = `product-form.html?id=${p.id}`;
      if (action === 'duplicate') location.href = `product-form.html?duplicate=${p.id}`;
      if (action === 'activate') {
        await api.post(`/admin/products/${p.id}/publish`);
        toast('Produto publicado.');
        table.reload();
      }
      if (action === 'deactivate') {
        await api.patch(`/admin/products/${p.id}/status`, { status: 'INACTIVE' });
        toast('Produto desativado (deixa de aparecer na loja).');
        table.reload();
      }
      if (action === 'delete' && (await confirmDialog(`Excluir “${p.name}”? O produto deixa de existir no catálogo, mas os pedidos antigos mantêm o histórico.`, { confirmLabel: 'Excluir', danger: true }))) {
        await api.delete(`/admin/products/${p.id}`);
        toast('Produto excluído.');
        table.reload();
      }
    } catch (err) {
      toastError(err);
    }
    void btn;
  },
});
