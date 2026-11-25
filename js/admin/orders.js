import { addressLines } from '../addresses.js';
import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { busy, openModal, showError, toast, toastError } from '../ui.js';
import { $, badge, formatDateTime, formatMoney, html, ORDER_STATUS, params, PAYMENT_STATUS, PAYMENT_TYPES, render } from '../utils.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Pedidos', permission: 'orders:read' });

/**
 * Próximos estados possíveis — apenas para mostrar as opções certas no seletor.
 * Quem valida é o backend (transições inválidas devolvem INVALID_STATUS_TRANSITION).
 * Devoluções/reembolsos têm fluxo próprio (página Devoluções).
 */
const NEXT = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
};

const p = params();
const table = dataTable(main, {
  fetch: (query) => api.page('/admin/orders', { query }),
  initial: { status: p.get('status') ?? undefined, requiresAttention: p.get('requiresAttention') ?? undefined },
  filters: [
    { name: 'search', label: 'Nº do pedido, cliente ou email…' },
    { name: 'status', label: 'Todos os estados', type: 'select', options: Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label]) },
    { name: 'paymentStatus', label: 'Todos os pagamentos', type: 'select', options: Object.entries(PAYMENT_STATUS).map(([k, v]) => [k, v.label]) },
    { name: 'from', label: 'De', type: 'date' },
    { name: 'to', label: 'Até', type: 'date', end: true },
    { name: 'requiresAttention', label: 'Requer atenção', type: 'checkbox' },
  ],
  rowClass: (o) => (o.requiresAttention ? 'is-low' : ''),
  columns: [
    { label: 'Pedido', render: (o) => html`<strong>#${o.orderNumber}</strong>${o.requiresAttention ? html`<br><span class="badge badge--warn">Requer atenção</span>` : ''}` },
    { label: 'Data', render: (o) => formatDateTime(o.placedAt) },
    { label: 'Cliente', render: (o) => html`${o.user.name}<br><small class="muted">${o.user.email}</small>` },
    { label: 'Artigos', className: 'num', render: (o) => o._count.items },
    { label: 'Total', className: 'num', render: (o) => formatMoney(o.grandTotal, o.currency) },
    { label: 'Pagamento', render: (o) => html`${badge(PAYMENT_STATUS, o.paymentStatus)}<br><small class="muted">${o.paymentMethodCode}</small>` },
    { label: 'Estado', render: (o) => badge(ORDER_STATUS, o.status) },
  ],
  rowActions: () => act('view', 'Ver detalhes', { iconName: 'eye' }),
  empty: 'Nenhum pedido encontrado.',
  onAction: (a, o) => a === 'view' && openOrder(o.id),
});

async function openOrder(id) {
  const body = document.createElement('div');
  const m = openModal({ title: 'Pedido', body, size: 'lg' });
  const load = async () => {
    render(body, html`<div class="sk-stack"><div class="sk sk--line"></div><div class="sk sk--line"></div></div>`);
    try {
      const o = await api.get(`/admin/orders/${id}`);
      m.el.querySelector('.modal__title').textContent = `Pedido #${o.orderNumber}`;
      const next = NEXT[o.status] ?? [];
      const canManage = hasPermission('orders:manage');
      render(
        body,
        html`<div class="chips" style="margin-bottom:12px">${badge(ORDER_STATUS, o.status)}${badge(PAYMENT_STATUS, o.paymentStatus)}${o.requiresAttention ? html`<span class="badge badge--warn">Requer atenção</span>` : ''}</div>
        ${o.adminNote ? html`<p class="notice notice--warn">${o.adminNote}</p>` : ''}
        <div class="grid-2">
          <section><h3>Cliente</h3><p>${o.user.name}<br><a href="mailto:${o.user.email}">${o.user.email}</a>${o.user.phone ? html`<br><a href="tel:${o.user.phone}">${o.user.phone}</a>` : ''}</p>
            <h3>Entrega</h3><p><strong>${o.shippingMethodName}</strong>${o.trackingCode ? html`<br>Tracking: <strong>${o.trackingCode}</strong>` : ''}</p>
            ${o.shippingAddress ? html`<address class="addr">${addressLines(o.shippingAddress).map((l) => html`<span>${l}</span>`)}</address>` : ''}
            ${o.customerNote ? html`<p class="muted">Nota do cliente: ${o.customerNote}</p>` : ''}</section>
          <section><h3>Totais</h3><dl class="sum">
            <div><dt>Subtotal</dt><dd>${formatMoney(o.subtotal, o.currency)}</dd></div>
            ${o.productDiscount ? html`<div><dt>Desconto de produtos</dt><dd>${formatMoney(o.productDiscount, o.currency)}</dd></div>` : ''}
            ${o.couponDiscount ? html`<div class="sum__save"><dt>Cupão ${o.couponCode}</dt><dd>−${formatMoney(o.couponDiscount, o.currency)}</dd></div>` : ''}
            <div><dt>Entrega</dt><dd>${formatMoney(o.shippingTotal, o.currency)}</dd></div>
            <div><dt>IVA ${o.taxIncluded ? '(incluído)' : ''}</dt><dd>${formatMoney(o.taxTotal, o.currency)}</dd></div>
            <div class="sum__total"><dt>Total</dt><dd>${formatMoney(o.grandTotal, o.currency)}</dd></div></dl></section>
        </div>
        <h3>Artigos</h3>
        <div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th>SKU</th><th class="num">Qtd.</th><th class="num">Preço unit.</th><th class="num">Total</th></tr></thead><tbody>${o.items.map(
          (i) => html`<tr><td>${i.productName}${i.variantName ? html`<br><small class="muted">${i.variantName}</small>` : ''}</td><td>${i.sku}</td><td class="num">${i.quantity}</td><td class="num">${formatMoney(i.unitPrice, o.currency)}${i.originalUnitPrice > i.unitPrice ? html`<br><s class="muted">${formatMoney(i.originalUnitPrice, o.currency)}</s>` : ''}</td><td class="num">${formatMoney(i.lineTotal, o.currency)}</td></tr>`,
        )}</tbody></table></div>

        <h3 style="margin-top:16px">Pagamentos</h3>
        <div class="table-wrap"><table class="table"><thead><tr><th>Método</th><th>Estado</th><th class="num">Valor</th><th>Data</th><th></th></tr></thead><tbody>${o.payments.map(
          (pm) => html`<tr><td>${pm.methodCode}<br><small class="muted">${PAYMENT_TYPES[o.paymentMethodType] ?? ''} · ${pm.provider}</small></td><td>${badge(PAYMENT_STATUS, pm.status)}</td><td class="num">${formatMoney(pm.amount, pm.currency)}${pm.refundedAmount ? html`<br><small class="muted">reembolsado ${formatMoney(pm.refundedAmount, pm.currency)}</small>` : ''}</td><td>${formatDateTime(pm.paidAt ?? pm.createdAt)}</td>
          <td>${['manual', 'cod'].includes(pm.provider) && ['PENDING', 'PROCESSING', 'FAILED'].includes(pm.status) && hasPermission('payments:manage') ? html`<button class="btn btn--sm btn--primary" type="button" data-confirm-pay="${pm.id}">Confirmar pagamento</button>` : ''}</td></tr>`,
        )}</tbody></table></div>

        ${canManage && next.length
          ? html`<form class="panel" id="status-form" style="margin-top:16px"><h3>Atualizar estado</h3>
              <div class="form-grid form-grid--2">
                <div class="field"><label for="st-status">Novo estado</label><select class="select" id="st-status" name="status" required>${next.map((s) => (s === 'CONFIRMED' && o.paymentStatus !== 'PAID' ? html`<option value="${s}" disabled>${ORDER_STATUS[s].label} (confirme o pagamento primeiro)</option>` : html`<option value="${s}">${ORDER_STATUS[s].label}</option>`))}</select></div>
                <div class="field"><label for="st-note">Nota (opcional)</label><input class="input" id="st-note" name="note" maxlength="500"></div>
                <div class="field" data-ship><label for="st-track">Código de rastreamento</label><input class="input" id="st-track" name="trackingCode" maxlength="80"></div>
                <div class="field" data-ship><label for="st-carrier">Transportadora</label><input class="input" id="st-carrier" name="carrier" maxlength="80"></div>
                <div class="field" data-ship><label for="st-url">Link de rastreamento</label><input class="input" id="st-url" name="trackingUrl" type="url"></div>
                <div class="field"><label for="st-loc">Localização (opcional)</label><input class="input" id="st-loc" name="location" maxlength="120"></div>
              </div>
              <div class="form-error" role="alert"></div>
              <button class="btn btn--primary" type="submit">Atualizar estado</button></form>`
          : ''}

        <h3 style="margin-top:16px">Histórico</h3>
        <ul class="track-events">${o.statusHistory.map((h) => html`<li><strong>${h.fromStatus ? `${ORDER_STATUS[h.fromStatus]?.label ?? h.fromStatus} → ` : ''}${ORDER_STATUS[h.toStatus]?.label ?? h.toStatus}</strong><span class="muted">${formatDateTime(h.createdAt)}${h.note ? ` · ${h.note}` : ''}</span></li>`)}</ul>`,
      );
      const form = $('#status-form', body);
      const syncShip = () => body.querySelectorAll('[data-ship]').forEach((f) => (f.hidden = form.status.value !== 'SHIPPED'));
      if (form) {
        syncShip();
        form.status.addEventListener('change', syncShip);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = Object.fromEntries([...new FormData(form)].filter(([, x]) => String(x).trim()).map(([k, x]) => [k, String(x).trim()]));
          busy(e.submitter, async () => {
            try {
              await api.patch(`/admin/orders/${o.id}/status`, v);
              toast(`Estado atualizado para “${ORDER_STATUS[v.status].label}”.`);
              table.reload();
              load();
            } catch (err) {
              render($('.form-error', form), err.friendly);
            }
          });
        });
      }
      body.onclick = (e) => {
        const b = e.target.closest('[data-confirm-pay]');
        if (!b) return;
        confirmPayment(o, b.dataset.confirmPay, load);
      };
    } catch (err) {
      showError(body, err, load);
    }
  };
  load();
}

function confirmPayment(o, paymentId, reload) {
  const form = document.createElement('form');
  form.id = 'pay-form';
  render(form, html`<p>Confirme apenas depois de verificar o dinheiro (extrato bancário ou recibo da entrega).</p><div class="field"><label for="pay-note">Referência / nota</label><input class="input" id="pay-note" name="note" required minlength="3" maxlength="300" placeholder="Ex.: Transferência BIM ref. 123456"></div><div class="form-error" role="alert"></div>`);
  const m = openModal({ title: `Confirmar pagamento — #${o.orderNumber}`, body: form, size: 'sm', actions: [{ label: 'Cancelar', onClick: ({ close }) => close() }, { label: 'Confirmar pagamento', variant: 'primary', type: 'submit', form: 'pay-form' }] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(m.el.querySelector('[form="pay-form"]'), async () => {
      try {
        await api.post(`/admin/orders/${o.id}/payments/${paymentId}/confirm`, { note: form.note.value.trim() });
        m.close();
        toast('Pagamento confirmado.');
        table.reload();
        reload();
      } catch (err) {
        render($('.form-error', form), err.friendly);
      }
    });
  });
}

if (p.get('id')) openOrder(p.get('id'));
