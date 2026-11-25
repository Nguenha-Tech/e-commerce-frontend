import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { busy, openModal, pagination, showError, toast } from '../ui.js';
import { $, formatDateTime, formatNumber, html, params, render } from '../utils.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Stock', permission: 'inventory:read' });
const canManage = hasPermission('inventory:manage');

const MOVEMENT = {
  INITIAL: 'Stock inicial',
  PURCHASE: 'Compra ao fornecedor',
  SALE: 'Venda',
  ADJUSTMENT_IN: 'Ajuste (+)',
  ADJUSTMENT_OUT: 'Ajuste (−)',
  DAMAGED: 'Danificado',
  RETURN: 'Devolução',
  CANCELLATION_RESTOCK: 'Pedido cancelado',
};
/** Movimentos que o painel pode registar à mão (os restantes vêm de vendas/cancelamentos). */
const MANUAL = ['PURCHASE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGED', 'RETURN'];

const table = dataTable(main, {
  fetch: (query) => api.page('/admin/inventory', { query }),
  initial: { lowStock: params().get('lowStock') === 'true' ? 'true' : undefined },
  filters: [
    { name: 'search', label: 'Produto ou SKU…' },
    { name: 'lowStock', label: 'Só stock baixo', type: 'checkbox' },
  ],
  rowClass: (r) => (r.lowStock ? 'is-low' : ''),
  columns: [
    { label: 'Produto', render: (r) => html`<strong>${r.productName}</strong>${r.variantName ? html`<br><small class="muted">${r.variantName}</small>` : ''}` },
    { label: 'SKU', render: (r) => r.sku },
    { label: 'Total', className: 'num', render: (r) => formatNumber(r.quantity) },
    { label: 'Reservado', className: 'num', render: (r) => formatNumber(r.reserved) },
    { label: 'Disponível', className: 'num', render: (r) => html`<strong>${formatNumber(r.available)}</strong>${r.lowStock ? html`<br><span class="badge ${r.available === 0 ? 'badge--bad' : 'badge--warn'}">${r.available === 0 ? 'Esgotado' : 'Stock baixo'}</span>` : ''}` },
    { label: 'Mín. / Máx.', className: 'num', render: (r) => `${r.minStock} / ${r.maxStock ?? '—'}` },
    { label: 'Localização', render: (r) => r.location ?? '—' },
  ],
  rowActions: () => html`${canManage ? act('move', 'Movimento') : ''}${canManage ? act('settings', 'Limites') : ''}${act('history', 'Histórico')}`,
  onAction: (a, r) => (a === 'move' ? movementModal(r) : a === 'settings' ? settingsModal(r) : a === 'history' ? historyModal(r) : null),
  empty: 'Nenhuma variante encontrada.',
});

function formModal(title, content, submitLabel, onSubmit) {
  const form = document.createElement('form');
  form.id = `inv-${Math.random().toString(36).slice(2)}`;
  render(form, html`${content}<div class="form-error" role="alert"></div>`);
  const m = openModal({ title, body: form, actions: [{ label: 'Cancelar', onClick: ({ close }) => close() }, { label: submitLabel, variant: 'primary', type: 'submit', form: form.id }] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    busy(m.el.querySelector(`[form="${form.id}"]`), async () => {
      try {
        await onSubmit(form);
        m.close();
        table.reload();
      } catch (err) {
        render($('.form-error', form), err.friendly);
      }
    });
  });
}

function movementModal(r) {
  formModal(
    `Movimento — ${r.sku}`,
    html`<p>Disponível agora: <strong>${r.available}</strong> (total ${r.quantity}, reservado ${r.reserved}).</p>
      <div class="form-grid form-grid--2">
        <div class="field"><label for="mv-type">Tipo</label><select class="select" id="mv-type" name="type">${MANUAL.map((t) => html`<option value="${t}">${MOVEMENT[t]}</option>`)}</select></div>
        <div class="field"><label for="mv-qty">Quantidade</label><input class="input" id="mv-qty" name="quantity" type="number" min="1" max="1000000" required></div>
        <div class="field field--full"><label for="mv-reason">Motivo</label><input class="input" id="mv-reason" name="reason" required minlength="3" maxlength="300" placeholder="Ex.: Fatura 1234 do fornecedor"></div>
      </div>`,
    'Registar movimento',
    async (f) => {
      await api.post(`/admin/inventory/${r.variantId}/movements`, { type: f.type.value, quantity: Number(f.quantity.value), reason: f.reason.value.trim() });
      toast('Movimento registado.');
    },
  );
}

function settingsModal(r) {
  formModal(
    `Limites — ${r.sku}`,
    html`<p>Abaixo do stock mínimo a variante aparece como “stock baixo” no painel.</p>
      <div class="form-grid form-grid--2">
        <div class="field"><label for="st-min">Stock mínimo</label><input class="input" id="st-min" name="minStock" type="number" min="0" value="${r.minStock}" required></div>
        <div class="field"><label for="st-max">Stock máximo (opcional)</label><input class="input" id="st-max" name="maxStock" type="number" min="0" value="${r.maxStock ?? ''}"></div>
        <div class="field field--full"><label for="st-loc">Localização no armazém</label><input class="input" id="st-loc" name="location" maxlength="80" value="${r.location ?? ''}" placeholder="Ex.: Prateleira B3"></div>
      </div>`,
    'Guardar',
    async (f) => {
      await api.patch(`/admin/inventory/${r.variantId}`, {
        minStock: Number(f.minStock.value),
        maxStock: f.maxStock.value === '' ? null : Number(f.maxStock.value),
        location: f.location.value.trim() || null,
      });
      toast('Limites atualizados.');
    },
  );
}

function historyModal(r) {
  const body = document.createElement('div');
  openModal({ title: `Histórico — ${r.sku}`, body, size: 'lg' });
  const load = async (page = 1) => {
    render(body, html`<div class="sk sk--line"></div><div class="sk sk--line"></div>`);
    try {
      const { items, meta } = await api.page(`/admin/inventory/${r.variantId}/movements`, { query: { page, limit: 20 } });
      if (!items.length) return render(body, html`<div class="state"><p class="state__title">Sem movimentos registados.</p></div>`);
      render(
        body,
        html`<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Tipo</th><th class="num">Qtd.</th><th class="num">Antes → depois</th><th>Motivo</th></tr></thead><tbody>${items.map(
          (mv) => html`<tr><td>${formatDateTime(mv.createdAt)}</td><td>${MOVEMENT[mv.type] ?? mv.type}</td><td class="num" style="color:${mv.quantity < 0 ? 'var(--red)' : 'var(--green)'}">${mv.quantity > 0 ? '+' : ''}${mv.quantity}</td><td class="num">${mv.quantityBefore} → ${mv.quantityAfter}</td><td>${mv.reason ?? (mv.referenceType ? `${mv.referenceType}` : '—')}</td></tr>`,
        )}</tbody></table></div><div class="dt__foot"><span></span><div class="pg"></div></div>`,
      );
      pagination($('.pg', body), meta, load);
    } catch (err) {
      showError(body, err, () => load(page));
    }
  };
  load();
}
