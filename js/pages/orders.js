import { addressLines } from '../addresses.js';
import { newIdempotencyKey } from '../api.js';
import { icon } from '../icons.js';
import { initPage } from '../layout.js';
import { ORDER_FLOW, ordersApi } from '../orders.js';
import { catalogApi } from '../products.js';
import { reviewsApi } from '../reviews.js';
import { busy, confirmDialog, emptyState, openModal, pagination, setSeo, showError, showLoading, toast, toastError } from '../ui.js';
import { $, badge, formatDate, formatDateTime, formatMoney, html, ORDER_STATUS, PAYMENT_STATUS, PAYMENT_TYPES, params, render, RETURN_STATUS, setParams } from '../utils.js';

await initPage({ auth: true });
const main = $('#orders');

const FILTERS = [
  ['', 'Todos'],
  ['PENDING', 'Pendentes'],
  ['PROCESSING', 'Processando'],
  ['SHIPPED', 'Enviados'],
  ['DELIVERED', 'Entregues'],
  ['CANCELLED', 'Cancelados'],
];

// =================================================================== lista
async function list() {
  setSeo({ title: 'Os meus pedidos' });
  render($('#page-title'), 'Os meus pedidos');
  const status = params().get('status') ?? '';
  const page = Number(params().get('page') ?? 1);
  render(
    main,
    html`<nav class="tabs" aria-label="Filtrar pedidos">${FILTERS.map(([v, l]) => html`<a class="tab ${status === v ? 'is-active' : ''}" href="orders.html${v ? `?status=${v}` : ''}" ${status === v ? html`aria-current="page"` : ''}>${l}</a>`)}</nav><div id="order-list"></div><div id="pager"></div>`,
  );
  const el = $('#order-list');
  showLoading(el);
  try {
    const { items, meta } = await ordersApi.list({ status: status || undefined, page, limit: 10 });
    if (!items.length) {
      return render(el, emptyState({ iconName: 'orders', title: status ? 'Sem pedidos neste estado.' : 'Ainda não fez nenhum pedido.', actionLabel: 'Começar a comprar', actionHref: 'shop.html' }));
    }
    render(
      el,
      html`<ul class="order-cards">${items.map(
        (o) => html`<li class="order-card panel">
          <div class="order-card__head">
            <div><h2 class="order-card__num">Pedido #${o.orderNumber}</h2><p class="muted">${formatDate(o.placedAt)}</p></div>
            ${badge(ORDER_STATUS, o.status)}
          </div>
          <div class="order-card__body">
            <ul class="order-card__thumbs" aria-label="Produtos">${o.items.slice(0, 4).map((i) => html`<li title="${i.productName}">${i.imageUrl ? html`<img src="${i.imageUrl}" alt="${i.productName}" loading="lazy">` : html`<span>${i.productName}</span>`}</li>`)}</ul>
            <p><span>${o._count.items} ${o._count.items === 1 ? 'produto' : 'produtos'}</span><strong class="num">${formatMoney(o.grandTotal, o.currency)}</strong></p>
          </div>
          <div class="order-card__foot">
            <span>${o.trackingCode ? html`Rastreamento: <strong>${o.trackingCode}</strong>` : badge(PAYMENT_STATUS, o.paymentStatus)}</span>
            <a class="btn btn--sm" href="orders.html?id=${o.id}">Ver detalhes</a>
          </div>
        </li>`,
      )}</ul>`,
    );
    pagination($('#pager'), meta, (p) => {
      setParams({ page: p });
      list();
    });
  } catch (err) {
    showError(el, err, list);
  }
}

// =================================================================== detalhe
function timeline(o) {
  const reached = new Map(o.statusHistory.map((h) => [h.toStatus, h.createdAt]));
  if (o.status === 'CANCELLED') {
    return html`<ol class="timeline"><li class="is-done"><span class="timeline__dot">${icon('check', { size: 14 })}</span><span>Pedido realizado<small>${formatDateTime(o.placedAt)}</small></span></li>
      <li class="is-bad"><span class="timeline__dot">${icon('close', { size: 14 })}</span><span>Pedido cancelado<small>${formatDateTime(reached.get('CANCELLED'))}${o.cancelReason ? ` · ${o.cancelReason}` : ''}</small></span></li></ol>`;
  }
  const currentIdx = ORDER_FLOW.indexOf(o.status);
  const after = ['RETURN_REQUESTED', 'RETURNED', 'REFUNDED'].filter((s) => reached.has(s));
  const labels = { PENDING: 'Pedido realizado', CONFIRMED: 'Pedido confirmado', PROCESSING: 'Processando', PACKED: 'Embalado', SHIPPED: 'Enviado', OUT_FOR_DELIVERY: 'Em entrega', DELIVERED: 'Entregue', RETURN_REQUESTED: 'Devolução pedida', RETURNED: 'Devolvido', REFUNDED: 'Reembolsado' };
  return html`<ol class="timeline">${[...ORDER_FLOW, ...after].map((s, i) => {
    const done = reached.has(s) || (currentIdx >= 0 && i < currentIdx) || after.length > 0;
    const current = s === o.status;
    return html`<li class="${done ? 'is-done' : ''} ${current ? 'is-current' : ''}" ${current ? html`aria-current="step"` : ''}>
      <span class="timeline__dot">${done && !current ? icon('check', { size: 14 }) : ''}</span>
      <span>${labels[s]}${reached.get(s) ? html`<small>${formatDateTime(reached.get(s))}</small>` : ''}</span></li>`;
  })}</ol>`;
}

async function detail(id) {
  render(main, html`<div class="sk-stack"><div class="sk sk--line"></div><div class="sk sk--line"></div><div class="sk sk--line sk--short"></div></div>`);
  try {
    const [o, returns, eligible] = await Promise.all([ordersApi.get(id), ordersApi.returns({ limit: 50 }).then((r) => r.items).catch(() => []), reviewsApi.eligible().catch(() => [])]);
    setSeo({ title: `Pedido #${o.orderNumber}` });
    render($('#page-title'), html`Pedido #${o.orderNumber}`);
    const myReturns = returns.filter((r) => r.order?.id === o.id);
    const canReview = new Set(eligible.map((e) => e.productId));
    const lastPayment = o.payments[0];
    const addr = o.shipping.address;

    render(
      main,
      html`<p><a href="orders.html">← Todos os pedidos</a></p>
      <div class="order-detail">
        <div class="order-detail__main">
          <section class="panel">
            <div class="order-card__head"><div><p class="muted">Feito a ${formatDateTime(o.placedAt)}</p></div><div class="chips">${badge(ORDER_STATUS, o.status)}${badge(PAYMENT_STATUS, o.paymentStatus)}</div></div>
            ${timeline(o)}
          </section>

          ${o.shipments.length
            ? html`<section class="panel"><h2 class="panel__title">Rastreamento</h2>${o.shipments.map(
                (s) => html`<p>${s.carrier ?? 'Transportadora'} · <strong>${s.trackingCode ?? '—'}</strong> ${s.trackingUrl ? html`· <a href="${s.trackingUrl}" target="_blank" rel="noopener">Seguir envio</a>` : ''}</p>
                  <ul class="track-events">${s.events.map((ev) => html`<li><strong>${ev.description}</strong><span class="muted">${formatDateTime(ev.occurredAt)}${ev.location ? ` · ${ev.location}` : ''}</span></li>`)}</ul>`,
              )}</section>`
            : ''}

          <section class="panel">
            <h2 class="panel__title">Produtos</h2>
            <ul class="cart-list">${o.items.map(
              (i) => html`<li class="cart-item cart-item--order">
                <a class="cart-item__img" href="product.html?slug=${i.productSlug}">${i.imageUrl ? html`<img src="${i.imageUrl}" alt="" loading="lazy">` : ''}</a>
                <div class="cart-item__info"><a class="cart-item__name" href="product.html?slug=${i.productSlug}">${i.productName}</a>${i.variantName ? html`<p class="cart-item__variant">${i.variantName}</p>` : ''}<p class="cart-item__variant">SKU ${i.sku} · ${i.quantity} × ${formatMoney(i.unitPrice, o.currency)}</p>
                ${i.productId && canReview.has(i.productId) ? html`<a class="btn btn--sm" href="product.html?slug=${i.productSlug}#reviews">Avaliar este produto</a>` : ''}</div>
                <p class="cart-item__total">${formatMoney(i.lineTotal, o.currency)}</p>
              </li>`,
            )}</ul>
          </section>

          ${myReturns.length
            ? html`<section class="panel"><h2 class="panel__title">Devoluções</h2>${myReturns.map(
                (r) => html`<div class="return-row"><div><strong>${r.reason}</strong><p class="muted">${formatDate(r.createdAt)} · ${r.items.map((it) => `${it.quantity}× ${it.orderItem.productName}`).join(', ')}</p>${r.rejectionReason ? html`<p class="muted">Motivo da recusa: ${r.rejectionReason}</p>` : ''}${r.refunds?.length ? html`<p class="muted">Reembolso: ${formatMoney(r.refunds[0].amount, o.currency)}</p>` : ''}</div>
                  <div class="chips">${badge(RETURN_STATUS, r.status)}${['REQUESTED', 'UNDER_REVIEW'].includes(r.status) ? html`<button class="link-btn link-btn--danger" type="button" data-cancel-return="${r.id}">Cancelar devolução</button>` : ''}</div></div>`,
              )}</section>`
            : ''}
        </div>

        <aside class="order-detail__side">
          <section class="panel">
            <h2 class="panel__title">Resumo</h2>
            <dl class="sum">
              <div><dt>Subtotal</dt><dd>${formatMoney(o.totals.subtotal, o.currency)}</dd></div>
              ${o.totals.couponDiscount ? html`<div class="sum__save"><dt>Cupão ${o.couponCode ?? ''}</dt><dd>−${formatMoney(o.totals.couponDiscount, o.currency)}</dd></div>` : ''}
              <div><dt>Entrega</dt><dd>${o.totals.shipping ? formatMoney(o.totals.shipping, o.currency) : 'Grátis'}</dd></div>
              <div class="sum__total"><dt>Total</dt><dd>${formatMoney(o.totals.total, o.currency)}</dd></div>
            </dl>
            <p class="field__hint">IVA incluído: ${formatMoney(o.totals.tax, o.currency)}</p>
          </section>
          <section class="panel">
            <h2 class="panel__title">Entrega</h2>
            <p><strong>${o.shipping.method}</strong></p>
            ${addr ? html`<address class="addr">${addressLines(addr).map((l) => html`<span>${l}</span>`)}</address>` : ''}
            ${o.customerNote ? html`<p class="muted">Nota: ${o.customerNote}</p>` : ''}
          </section>
          <section class="panel">
            <h2 class="panel__title">Pagamento</h2>
            <p>${PAYMENT_TYPES[o.paymentMethod.type] ?? o.paymentMethod.code}</p>
            ${lastPayment ? html`<p>${badge(PAYMENT_STATUS, lastPayment.status)} ${lastPayment.paidAt ? html`<span class="muted">em ${formatDateTime(lastPayment.paidAt)}</span>` : ''}</p>` : ''}
            ${o.status === 'PENDING' && ['FAILED', 'CANCELLED'].includes(o.paymentStatus) ? html`<button class="btn btn--primary btn--block" type="button" id="retry-pay">Tentar pagar novamente</button>` : ''}
          </section>
          <section class="panel order-actions">
            ${o.canCancel ? html`<button class="btn btn--block" type="button" id="cancel-order">Cancelar pedido</button>` : ''}
            ${o.status === 'DELIVERED' && !myReturns.some((r) => ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'RECEIVED'].includes(r.status)) ? html`<button class="btn btn--block" type="button" id="request-return">${icon('return', { size: 18 })}Pedir devolução</button>` : ''}
            <button class="btn btn--whatsapp btn--block" type="button" data-whatsapp="SUPPORT" data-order="${o.orderNumber}">${icon('whatsapp', { size: 18 })}Ajuda com este pedido</button>
          </section>
        </aside>
      </div>`,
    );

    $('#cancel-order')?.addEventListener('click', (e) => cancelOrder(o, e.currentTarget));
    $('#retry-pay')?.addEventListener('click', (e) =>
      busy(e.currentTarget, async () => {
        try {
          const res = await ordersApi.retryPayment(o.id, undefined, newIdempotencyKey());
          if (res.nextAction?.type === 'REDIRECT') location.href = res.nextAction.url;
          else toast(res.nextAction?.message ?? 'Pagamento iniciado.', { type: 'info', timeout: 6000 });
          detail(o.id);
        } catch (err) {
          toastError(err);
        }
      }),
    );
    $('#request-return')?.addEventListener('click', () => requestReturn(o));
    main.onclick = async (e) => {
      const cr = e.target.closest('[data-cancel-return]');
      if (cr && (await confirmDialog('Cancelar este pedido de devolução?', { confirmLabel: 'Cancelar devolução', danger: true }))) {
        try {
          await ordersApi.cancelReturn(cr.dataset.cancelReturn);
          toast('Devolução cancelada.');
          detail(o.id);
        } catch (err) {
          toastError(err);
        }
      }
    };
  } catch (err) {
    showError(main, err, () => detail(id), err.status === 404 ? 'Pedido não encontrado.' : undefined);
  }
}

function cancelOrder(o, btn) {
  const form = document.createElement('form');
  form.id = 'cancel-form';
  render(form, html`<p>O stock é libertado e, se já pagou, o reembolso é processado pela loja.</p><div class="field"><label for="c-reason">Motivo</label><select class="select" id="c-reason" name="reason" required><option>Mudei de ideias</option><option>Encontrei um preço melhor</option><option>Demora na entrega</option><option>Escolhi o produto errado</option><option>Outro</option></select></div>`);
  const m = openModal({ title: `Cancelar pedido #${o.orderNumber}`, body: form, size: 'sm', actions: [{ label: 'Voltar', onClick: ({ close }) => close() }, { label: 'Cancelar pedido', variant: 'danger', type: 'submit', form: 'cancel-form' }] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(e.submitter ?? btn, async () => {
      try {
        await ordersApi.cancel(o.id, form.reason.value);
        m.close();
        toast('Pedido cancelado.');
        detail(o.id);
      } catch (err) {
        toastError(err);
      }
    });
  });
}

async function requestReturn(o) {
  let reasons = ['Produto com defeito', 'Outro'];
  let windowDays = 14;
  try {
    const s = await catalogApi.settings();
    reasons = s.returns.reasons;
    windowDays = s.returns.windowDays;
  } catch {
    /* usa valores por omissão */
  }
  const form = document.createElement('form');
  form.id = 'return-form';
  render(
    form,
    html`<p class="muted">Pode pedir a devolução até ${windowDays} dias após a entrega.</p>
      <fieldset class="field" style="border:0;padding:0"><legend class="field__label">Produtos a devolver</legend>
        ${o.items.map((i) => html`<div class="return-item"><span>${i.productName}${i.variantName ? ` (${i.variantName})` : ''}</span><label class="sr-only" for="rq-${i.id}">Quantidade</label><select class="select" id="rq-${i.id}" data-item="${i.id}">${Array.from({ length: i.quantity + 1 }, (_, n) => html`<option value="${n}">${n}</option>`)}</select></div>`)}
      </fieldset>
      <div class="field"><label for="r-reason">Motivo</label><select class="select" id="r-reason" name="reason">${reasons.map((r) => html`<option>${r}</option>`)}</select></div>
      <div class="field"><label for="r-desc">Descrição</label><textarea class="textarea" id="r-desc" name="description" maxlength="2000" placeholder="Descreva o problema"></textarea></div>
      <div class="field"><label for="r-files">Fotografias (opcional)</label><input class="input" id="r-files" type="file" accept="image/jpeg,image/png,image/webp" multiple></div>
      <div class="form-error" role="alert"></div>`,
  );
  const m = openModal({ title: 'Pedir devolução', body: form, actions: [{ label: 'Cancelar', onClick: ({ close }) => close() }, { label: 'Enviar pedido', variant: 'primary', type: 'submit', form: 'return-form' }] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const items = [...form.querySelectorAll('[data-item]')].map((s) => ({ orderItemId: s.dataset.item, quantity: Number(s.value) })).filter((x) => x.quantity > 0);
    if (!items.length) return render(form.querySelector('.form-error'), 'Escolha pelo menos um produto.');
    busy(m.el.querySelector('[form="return-form"]'), async () => {
      try {
        const files = [...form.querySelector('#r-files').files].slice(0, 8);
        const evidence = files.length ? (await ordersApi.uploadEvidence(files)).map((f) => ({ storageKey: f.storageKey })) : [];
        await ordersApi.requestReturn(o.id, { reason: form.reason.value, ...(form.description.value.trim() ? { description: form.description.value.trim() } : {}), items, evidence });
        m.close();
        toast('Pedido de devolução enviado.');
        detail(o.id);
      } catch (err) {
        render(form.querySelector('.form-error'), err.friendly);
      }
    });
  });
}

const id = params().get('id');
id ? detail(id) : list();
