import { addressCard, addressesApi, editAddress } from '../addresses.js';
import { newIdempotencyKey } from '../api.js';
import { cartApi, setCartFrom } from '../cart.js';
import { icon } from '../icons.js';
import { initPage } from '../layout.js';
import { ordersApi } from '../orders.js';
import { busy, emptyState, setSeo, showError, toast, toastError } from '../ui.js';
import { $, formatMoney, html, PAYMENT_TYPES, render } from '../utils.js';

/**
 * Checkout em 5 passos: Endereço → Entrega → Pagamento → Revisão → Confirmar.
 * Todos os valores mostrados vêm do servidor (POST /checkout/quote). A criação do pedido
 * usa uma Idempotency-Key estável: duplo clique ou recarregar nunca cria dois pedidos.
 */
await initPage({ auth: true });
setSeo({ title: 'Checkout' });

const STEPS = ['Endereço', 'Entrega', 'Pagamento', 'Revisão', 'Confirmar'];
const KEY_STORE = 'es_checkout_key';
const state = { step: 0, addressId: null, shipping: null, payment: null, note: '', quote: null, cart: null, addresses: [], shippingOptions: [], paymentOptions: [] };

function idempotencyKey() {
  let k = sessionStorage.getItem(KEY_STORE);
  if (!k) sessionStorage.setItem(KEY_STORE, (k = newIdempotencyKey()));
  return k;
}

const main = $('#checkout');

async function start() {
  render(main, html`<div class="sk-stack"><div class="sk sk--line"></div><div class="sk sk--line"></div></div>`);
  try {
    const [cart, addresses, payments] = await Promise.all([cartApi.get(), addressesApi.list(), ordersApi.paymentMethods()]);
    state.cart = setCartFrom(cart);
    state.addresses = addresses;
    state.paymentOptions = payments;
    if (!cart.items.length) {
      return render(main, emptyState({ iconName: 'cart', title: 'O seu carrinho está vazio.', text: 'Adicione produtos antes de finalizar a compra.', actionLabel: 'Continuar a comprar', actionHref: 'shop.html' }));
    }
    if (cart.hasIssues) {
      return render(main, html`<div class="notice notice--warn">${icon('bell', { size: 18 })}<span>Há produtos no carrinho com stock insuficiente ou indisponíveis. <a href="cart.html">Rever carrinho</a></span></div>`);
    }
    state.addressId = (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? null;
    draw();
  } catch (err) {
    showError(main, err, start);
  }
}

function stepper() {
  return html`<ol class="steps" aria-label="Passos do checkout">${STEPS.map(
    (s, i) => html`<li class="steps__item ${i < state.step ? 'is-done' : ''} ${i === state.step ? 'is-current' : ''}" ${i === state.step ? html`aria-current="step"` : ''}>
      ${i < state.step ? html`<button type="button" class="steps__btn" data-goto="${i}"><span class="steps__n">${icon('check', { size: 14 })}</span>${s}</button>` : html`<span class="steps__btn"><span class="steps__n">${i + 1}</span>${s}</span>`}
    </li>`,
  )}</ol>`;
}

function summaryHtml() {
  const q = state.quote;
  const c = state.cart;
  const items = q?.items ?? c.items.map((i) => ({ name: i.name, variantName: i.variantName, image: i.image, quantity: i.quantity, lineTotal: i.lineTotal }));
  const tt = q?.totals ?? c.totals;
  const cur = q?.currency ?? c.currency;
  const body = html`<ul class="mini-items">${items.map(
      (i) => html`<li><span class="mini-items__img">${i.image ? html`<img src="${i.image}" alt="" loading="lazy">` : ''}<span class="mini-items__q">${i.quantity}</span></span><span class="mini-items__name">${i.name}${i.variantName ? html`<small>${i.variantName}</small>` : ''}</span><span class="num">${formatMoney(i.lineTotal, cur)}</span></li>`,
    )}</ul>
    <dl class="sum">
      <div><dt>Subtotal</dt><dd>${formatMoney(tt.subtotal, cur)}</dd></div>
      ${tt.couponDiscount ? html`<div class="sum__save"><dt>Cupão ${q?.coupon?.code ?? c.couponCode ?? ''}</dt><dd>−${formatMoney(tt.couponDiscount, cur)}</dd></div>` : ''}
      <div><dt>Entrega</dt><dd>${tt.shipping === null || tt.shipping === undefined ? html`<span class="muted">Escolha o método</span>` : tt.shipping === 0 ? 'Grátis' : formatMoney(tt.shipping, cur)}</dd></div>
      <div class="sum__total"><dt>Total</dt><dd>${formatMoney(tt.total, cur)}</dd></div>
    </dl>
    <p class="field__hint">IVA incluído (${formatMoney(tt.tax, cur)}). Valores confirmados pelo servidor.</p>`;
  return html`<aside class="summary panel checkout__summary">
    <details class="summary__toggle" open><summary><span>Resumo do pedido</span><strong>${formatMoney(tt.total, cur)}</strong>${icon('chevronDown', { size: 16 })}</summary>${body}</details>
    <div class="help-box"><span>Dúvidas?</span><button class="btn btn--whatsapp btn--sm" type="button" data-whatsapp="CHECKOUT">${icon('whatsapp', { size: 16 })}Contactar suporte</button></div>
  </aside>`;
}

function stepBody() {
  switch (state.step) {
    case 0:
      return html`<h2>Endereço de entrega</h2>
        ${state.addresses.length
          ? html`<div class="options">${state.addresses.map(
              (a) => html`<label class="option ${state.addressId === a.id ? 'is-selected' : ''}"><input type="radio" name="address" value="${a.id}" ${state.addressId === a.id ? html`checked` : ''}>${addressCard(a)}<button class="link-btn option__edit" type="button" data-edit-address="${a.id}">Editar</button></label>`,
            )}</div>`
          : html`<p class="muted">Ainda não tem endereços guardados.</p>`}
        <button class="btn" type="button" id="add-address">${icon('plus', { size: 18 })}Adicionar endereço</button>
        <div class="checkout__nav"><a href="cart.html">← Voltar ao carrinho</a><button class="btn btn--primary btn--lg" type="button" data-next ${!state.addressId ? html`disabled` : ''}>Continuar para entrega</button></div>`;
    case 1:
      return html`<h2>Método de entrega</h2>
        ${state.shippingOptions.length
          ? html`<div class="options">${state.shippingOptions.map(
              (s) => html`<label class="option ${state.shipping === s.code ? 'is-selected' : ''}"><input type="radio" name="shipping" value="${s.code}" ${state.shipping === s.code ? html`checked` : ''}>
                <span class="option__main"><strong>${s.name}</strong><span class="muted">${s.estimatedDays.max === 0 ? 'Hoje' : `${s.estimatedDays.min}–${s.estimatedDays.max} dias úteis`}${s.carrier ? ` · ${s.carrier}` : ''}</span>${s.description ? html`<span class="muted">${s.description}</span>` : ''}</span>
                <span class="option__price">${s.price === 0 ? html`<span class="badge badge--ok">Grátis</span>` : formatMoney(s.price)}</span></label>`,
            )}</div>`
          : html`<div class="notice notice--warn">Não há métodos de entrega para este endereço. Escolha outro endereço ou contacte-nos.</div>`}
        <div class="field" style="margin-top:16px"><label for="note">Nota para a entrega (opcional)</label><textarea class="textarea" id="note" maxlength="500" placeholder="Ex.: ligar antes de entregar">${state.note}</textarea></div>
        <div class="checkout__nav"><button class="btn" type="button" data-back>Voltar</button><button class="btn btn--primary btn--lg" type="button" data-next ${!state.shipping ? html`disabled` : ''}>Continuar para pagamento</button></div>`;
    case 2:
      return html`<h2>Método de pagamento</h2>
        <div class="options">${state.paymentOptions.map(
          (p) => html`<label class="option ${state.payment === p.code ? 'is-selected' : ''}"><input type="radio" name="payment" value="${p.code}" ${state.payment === p.code ? html`checked` : ''}>
            <span class="option__main"><strong>${p.name}</strong><span class="muted">${PAYMENT_TYPES[p.type] ?? p.type}</span>${p.instructions && state.payment === p.code ? html`<span class="option__note">${p.instructions}</span>` : ''}</span></label>`,
        )}</div>
        <div class="checkout__nav"><button class="btn" type="button" data-back>Voltar</button><button class="btn btn--primary btn--lg" type="button" data-next ${!state.payment ? html`disabled` : ''}>Rever pedido</button></div>`;
    case 3: {
      const addr = state.addresses.find((a) => a.id === state.addressId);
      const ship = state.shippingOptions.find((s) => s.code === state.shipping);
      const pay = state.paymentOptions.find((p) => p.code === state.payment);
      return html`<h2>Revisão</h2>
        <div class="review-grid">
          <section class="review-block"><h3>Entregar em</h3>${addr ? addressCard(addr) : ''}<button class="link-btn" type="button" data-goto="0">Alterar</button></section>
          <section class="review-block"><h3>Entrega</h3><p>${ship?.name}<br><span class="muted">${ship?.estimatedDays.min}–${ship?.estimatedDays.max} dias úteis</span></p>${state.note ? html`<p class="muted">Nota: ${state.note}</p>` : ''}<button class="link-btn" type="button" data-goto="1">Alterar</button></section>
          <section class="review-block"><h3>Pagamento</h3><p>${pay?.name}</p><button class="link-btn" type="button" data-goto="2">Alterar</button></section>
        </div>
        ${state.quote?.coupon && !state.quote.coupon.applied ? html`<p class="notice notice--warn">O cupão ${state.quote.coupon.code} não se aplica a este pedido.</p>` : ''}
        <div class="checkout__nav"><button class="btn" type="button" data-back>Voltar</button><button class="btn btn--primary btn--lg" type="button" id="place-order">Confirmar pedido · ${formatMoney(state.quote?.totals.total)}</button></div>
        <p class="field__hint" style="text-align:right">Ao confirmar aceita os <a href="help.html#termos">termos e condições</a>.</p>`;
    }
    default:
      return '';
  }
}

function draw() {
  render(
    main,
    html`${stepper()}<div class="checkout"><section class="panel checkout__step" aria-live="polite">${stepBody()}</section>${summaryHtml()}</div>`,
  );
  // No mobile o resumo começa fechado.
  if (matchMedia('(max-width: 1023px)').matches) $('.summary__toggle').open = false;
  $('.checkout__step h2')?.setAttribute('tabindex', '-1');
}

async function goTo(step) {
  try {
    if (step === 1) {
      state.shippingOptions = await ordersApi.shippingMethods(state.addressId);
      if (!state.shippingOptions.some((s) => s.code === state.shipping)) state.shipping = state.shippingOptions[0]?.code ?? null;
      state.quote = null;
    }
    if (step >= 3) {
      state.quote = await ordersApi.quote(body());
    }
    state.step = step;
    draw();
    $('.checkout__step h2')?.focus();
  } catch (err) {
    toastError(err);
  }
}

function body() {
  return {
    addressId: state.addressId,
    shippingMethodCode: state.shipping,
    paymentMethodCode: state.payment,
    ...(state.cart.couponCode ? { couponCode: state.cart.couponCode } : {}),
    ...(state.note ? { customerNote: state.note } : {}),
  };
}

async function placeOrder(btn) {
  await busy(btn, async () => {
    try {
      const res = await ordersApi.place({ ...body(), expectedTotal: state.quote.totals.total }, idempotencyKey());
      sessionStorage.removeItem(KEY_STORE);
      setCartFrom({ items: [] });
      confirmation(res);
    } catch (err) {
      if (err.code === 'PRICE_CHANGED' || err.code === 'INSUFFICIENT_STOCK') {
        sessionStorage.removeItem(KEY_STORE);
        toastError(err);
        state.cart = setCartFrom(await cartApi.get());
        if (err.code === 'PRICE_CHANGED') return goTo(3);
        location.href = 'cart.html';
        return;
      }
      toastError(err);
    }
  });
}

function nextAction(payment) {
  const a = payment?.nextAction;
  if (!a || a.type === 'NONE') return '';
  if (a.type === 'REDIRECT') {
    setTimeout(() => (location.href = a.url), 1500);
    return html`<div class="notice">A redirecioná-lo para o pagamento… <a href="${a.url}">Continuar</a></div>`;
  }
  if (a.type === 'MOBILE_PROMPT') return html`<div class="notice">${icon('phone', { size: 18 })}<span>${a.message}</span></div>`;
  const d = a.data ?? {};
  return html`<div class="notice notice--warn"><div><p style="margin:0 0 8px">${a.message}</p>
    ${Object.keys(d).length ? html`<dl class="kv">${d.bank ? html`<dt>Banco</dt><dd>${d.bank}</dd>` : ''}${d.accountName ? html`<dt>Titular</dt><dd>${d.accountName}</dd>` : ''}${d.nib ? html`<dt>NIB</dt><dd class="num">${d.nib}</dd>` : ''}${d.reference ? html`<dt>Referência</dt><dd><strong>${d.reference}</strong></dd>` : ''}${d.amount ? html`<dt>Valor</dt><dd>${formatMoney(d.amount, d.currency)}</dd>` : ''}</dl>` : ''}</div></div>`;
}

function confirmation({ order, payment }) {
  state.step = 4;
  render(
    main,
    html`${stepper()}<section class="panel confirm" aria-labelledby="ok-title">
      <div class="confirm__icon">${icon('check', { size: 34 })}</div>
      <h2 id="ok-title" tabindex="-1">Pedido realizado!</h2>
      <p class="muted">Número do pedido</p>
      <p class="confirm__number">#${order.orderNumber}</p>
      <p class="muted">Total</p>
      <p class="confirm__total">${formatMoney(order.totals.total, order.currency)}</p>
      ${nextAction(payment)}
      <div class="confirm__ctas"><a class="btn btn--primary btn--lg" href="orders.html?id=${order.id}">Ver pedido</a><a class="btn btn--lg" href="shop.html">Continuar a comprar</a></div>
    </section>`,
  );
  $('#ok-title').focus();
  toast('Pedido criado.');
}

main.addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'address') state.addressId = t.value;
  if (t.name === 'shipping') state.shipping = t.value;
  if (t.name === 'payment') state.payment = t.value;
  if (['address', 'shipping', 'payment'].includes(t.name)) {
    draw();
    $(`input[name="${t.name}"][value="${CSS.escape(t.value)}"]`)?.focus();
  }
});
main.addEventListener('input', (e) => e.target.id === 'note' && (state.note = e.target.value.trim()));
main.addEventListener('click', async (e) => {
  if (e.target.closest('[data-next]')) return goTo(state.step + 1);
  if (e.target.closest('[data-back]')) return goTo(state.step - 1);
  const g = e.target.closest('[data-goto]');
  if (g) return goTo(Number(g.dataset.goto));
  if (e.target.closest('#place-order')) return placeOrder(e.target.closest('#place-order'));
  const edit = e.target.closest('[data-edit-address]');
  if (e.target.closest('#add-address') || edit) {
    e.preventDefault();
    const saved = await editAddress(edit ? state.addresses.find((a) => a.id === edit.dataset.editAddress) : null);
    if (saved) {
      state.addresses = await addressesApi.list();
      state.addressId = saved.id;
      draw();
    }
  }
});

start();
