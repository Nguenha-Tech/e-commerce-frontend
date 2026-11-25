import { currentUser } from '../auth.js';
import { addToCart, cartApi, savedForLater, setCartFrom } from '../cart.js';
import { ERROR_MESSAGES, t } from '../i18n.js';
import { icon } from '../icons.js';
import { initPage } from '../layout.js';
import { busy, confirmDialog, emptyState, setSeo, showError, toast, toastError } from '../ui.js';
import { $, formatMoney, html, productUrl, render } from '../utils.js';

await initPage();
setSeo({ title: 'Carrinho' });

const main = $('#cart');
let cart;

const ISSUE_TEXT = {
  UNAVAILABLE: () => 'Este produto já não está disponível. Remova-o para continuar.',
  INSUFFICIENT_STOCK: (i) => `Só ${i.available ?? 0} unidade(s) disponível(eis). Ajuste a quantidade.`,
  QUANTITY_LIMIT: () => 'Quantidade acima do máximo permitido por produto.',
};
const COUPON_REASON = {
  MIN_ORDER_NOT_MET: 'O valor da compra ainda não atinge o mínimo deste cupão.',
  NO_ELIGIBLE_ITEMS: 'Nenhum produto do carrinho é abrangido por este cupão.',
};

async function load() {
  render(main, html`<div class="sk-stack"><div class="sk sk--line"></div><div class="sk sk--line"></div><div class="sk sk--line sk--short"></div></div>`);
  try {
    cart = setCartFrom(await cartApi.get());
    draw();
  } catch (err) {
    showError(main, err, load, 'Não foi possível carregar o carrinho.');
  }
}

function couponMessage(cs) {
  if (!cs) return '';
  if (cs.applied) return html`<p class="coupon__ok">${icon('check', { size: 16 })}Cupão <strong>${cs.code}</strong> aplicado${cs.freeShipping ? ' — entrega grátis' : ''}.</p>`;
  const msg = COUPON_REASON[cs.reason] ?? ERROR_MESSAGES[cs.code] ?? 'Este cupão não pode ser aplicado.';
  return html`<p class="coupon__bad">${msg}</p>`;
}

function summary(c) {
  const tt = c.totals;
  return html`<aside class="summary panel" aria-labelledby="sum-title">
    <h2 class="panel__title" id="sum-title">Resumo</h2>
    <form class="coupon" id="coupon-form">
      <label class="field__label" for="coupon">Cupão de desconto</label>
      <div class="coupon__row">
        <input class="input" id="coupon" name="code" value="${c.couponCode ?? ''}" placeholder="Ex.: TECH10" autocomplete="off" maxlength="40">
        ${c.couponCode ? html`<button class="btn" type="button" id="remove-coupon">Remover</button>` : html`<button class="btn btn--dark" type="submit">Aplicar</button>`}
      </div>
      ${couponMessage(c.couponStatus)}
    </form>
    <dl class="sum">
      <div><dt>Subtotal (${tt.itemsCount} ${tt.itemsCount === 1 ? 'artigo' : 'artigos'})</dt><dd>${formatMoney(tt.subtotal, c.currency)}</dd></div>
      ${tt.productDiscount ? html`<div class="sum__save"><dt>Poupança em promoções</dt><dd>${formatMoney(tt.productDiscount, c.currency)}</dd></div>` : ''}
      ${tt.couponDiscount ? html`<div class="sum__save"><dt>Desconto do cupão</dt><dd>−${formatMoney(tt.couponDiscount, c.currency)}</dd></div>` : ''}
      <div><dt>Entrega</dt><dd>${tt.shipping === null || tt.shipping === undefined ? html`<span class="muted">Calculada no checkout</span>` : tt.shipping === 0 ? 'Grátis' : formatMoney(tt.shipping, c.currency)}</dd></div>
      <div class="sum__total"><dt>Total</dt><dd>${formatMoney(tt.total, c.currency)}</dd></div>
    </dl>
    <p class="field__hint">${tt.taxIncluded ? `IVA incluído (${formatMoney(tt.tax, c.currency)}).` : `Inclui IVA de ${formatMoney(tt.tax, c.currency)}.`}</p>
    ${c.hasIssues ? html`<p class="notice notice--warn">${icon('bell', { size: 16 })}Resolva os avisos dos produtos para continuar.</p>` : ''}
    <a class="btn btn--primary btn--lg btn--block ${c.hasIssues ? 'is-disabled' : ''}" href="${currentUser() ? 'checkout.html' : 'login.html?next=checkout.html'}" ${c.hasIssues ? html`aria-disabled="true" tabindex="-1"` : ''} id="go-checkout">${t('cart.checkout')}</a>
    ${!currentUser() ? html`<p class="field__hint" style="text-align:center">Vai entrar ou criar conta; o carrinho é mantido.</p>` : ''}
    <div class="help-box">
      <span>Precisa de ajuda?</span>
      <button class="btn btn--whatsapp btn--sm" type="button" data-whatsapp="CART">${icon('whatsapp', { size: 16 })}${t('whatsapp.talk')}</button>
    </div>
  </aside>`;
}

function savedList() {
  const list = savedForLater.list();
  if (!list.length) return '';
  return html`<section class="saved panel" aria-labelledby="saved-title">
    <h2 class="panel__title" id="saved-title">Guardados para depois</h2>
    <ul class="cart-list">${list.map(
      (s) => html`<li class="cart-item cart-item--saved">
        <a class="cart-item__img" href="${productUrl(s)}">${s.image ? html`<img src="${s.image}" alt="" loading="lazy">` : ''}</a>
        <div class="cart-item__info"><a class="cart-item__name" href="${productUrl(s)}">${s.name}</a>${s.variantName ? html`<p class="cart-item__variant">${s.variantName}</p>` : ''}</div>
        <div class="cart-item__actions">
          <button class="btn btn--sm" type="button" data-move="${s.variantId}">Mover para o carrinho</button>
          <button class="link-btn link-btn--danger" type="button" data-unsave="${s.variantId}">Remover</button>
        </div>
      </li>`,
    )}</ul>
  </section>`;
}

function draw() {
  if (!cart.items.length) {
    render(
      main,
      html`${emptyState({ iconName: 'cart', title: t('cart.empty'), text: 'Explore as categorias ou veja as ofertas desta semana.', actionLabel: t('cart.continue'), actionHref: 'shop.html' })}${savedList()}`,
    );
    return;
  }
  render(
    main,
    html`<div class="cart-layout">
      <div>
        <section class="panel" aria-label="Produtos no carrinho">
          <ul class="cart-list">${cart.items.map(
            (i) => html`<li class="cart-item ${i.issue ? 'has-issue' : ''}">
              <a class="cart-item__img" href="${productUrl(i)}">${i.image ? html`<img src="${i.image}" alt="" loading="lazy">` : ''}</a>
              <div class="cart-item__info">
                <a class="cart-item__name" href="${productUrl(i)}">${i.name}</a>
                ${i.variantName ? html`<p class="cart-item__variant">${i.variantName}</p>` : ''}
                <p class="cart-item__unit">${formatMoney(i.unitPrice, cart.currency)}${i.compareAtPrice > i.unitPrice ? html` <s>${formatMoney(i.compareAtPrice, cart.currency)}</s>` : ''}</p>
                ${i.issue ? html`<p class="cart-item__issue" role="alert">${(ISSUE_TEXT[i.issue.code] ?? (() => i.issue.message))(i.issue)}</p>` : ''}
              </div>
              <div class="cart-item__qty">
                <div class="qty" role="group" aria-label="Quantidade de ${i.name}">
                  <button type="button" data-dec="${i.id}" aria-label="Diminuir" ${i.quantity <= 1 ? html`disabled` : ''}>${icon('minus', { size: 16 })}</button>
                  <input type="number" value="${i.quantity}" min="1" max="${Math.max(1, i.maxPurchasable)}" data-qty="${i.id}" aria-label="Quantidade" inputmode="numeric">
                  <button type="button" data-inc="${i.id}" aria-label="Aumentar" ${i.quantity >= i.maxPurchasable ? html`disabled` : ''}>${icon('plus', { size: 16 })}</button>
                </div>
              </div>
              <p class="cart-item__total"><span class="sr-only">Subtotal: </span>${formatMoney(i.lineTotal, cart.currency)}</p>
              <div class="cart-item__actions">
                <button class="link-btn" type="button" data-save="${i.id}">Guardar para depois</button>
                <button class="link-btn link-btn--danger" type="button" data-remove="${i.id}">${icon('trash', { size: 16 })}Remover</button>
              </div>
            </li>`,
          )}</ul>
          <div class="cart-foot"><a href="shop.html">← ${t('cart.continue')}</a><button class="link-btn link-btn--danger" type="button" id="clear-cart">Esvaziar carrinho</button></div>
        </section>
        ${savedList()}
      </div>
      ${summary(cart)}
    </div>`,
  );
}

async function mutate(fn, btn) {
  return busy(btn, async () => {
    try {
      cart = setCartFrom(await fn());
      draw();
    } catch (err) {
      toastError(err);
      load();
    }
  });
}

main.addEventListener('click', async (e) => {
  const item = (attr) => cart?.items.find((x) => x.id === e.target.closest(`[${attr}]`)?.getAttribute(attr));
  let it;
  if ((it = item('data-inc'))) return mutate(() => cartApi.update(it.id, it.quantity + 1), e.target.closest('button'));
  if ((it = item('data-dec'))) return mutate(() => cartApi.update(it.id, it.quantity - 1), e.target.closest('button'));
  if ((it = item('data-remove'))) {
    await mutate(() => cartApi.remove(it.id), e.target.closest('button'));
    return toast('Produto removido do carrinho.');
  }
  if ((it = item('data-save'))) {
    savedForLater.save(it);
    await mutate(() => cartApi.remove(it.id), e.target.closest('button'));
    return toast('Guardado para depois.');
  }
  const move = e.target.closest('[data-move]');
  if (move) {
    return busy(move, async () => {
      try {
        cart = await addToCart(move.dataset.move, 1);
        savedForLater.remove(move.dataset.move);
        draw();
      } catch {
        /* toast mostrado */
      }
    });
  }
  const unsave = e.target.closest('[data-unsave]');
  if (unsave) return (savedForLater.remove(unsave.dataset.unsave), draw());
  if (e.target.closest('#remove-coupon')) return mutate(() => cartApi.removeCoupon(), e.target.closest('button'));
  if (e.target.closest('#clear-cart') && (await confirmDialog('Remover todos os produtos do carrinho?', { confirmLabel: 'Esvaziar', danger: true }))) {
    return mutate(() => cartApi.clear());
  }
  if (e.target.closest('#go-checkout.is-disabled')) e.preventDefault();
});

main.addEventListener('change', (e) => {
  const id = e.target.dataset.qty;
  if (!id) return;
  const max = Number(e.target.max);
  const q = Math.max(1, Math.min(max, Math.round(Number(e.target.value) || 1)));
  mutate(() => cartApi.update(id, q));
});

main.addEventListener('submit', (e) => {
  if (e.target.id !== 'coupon-form') return;
  e.preventDefault();
  const code = e.target.code.value.trim().toUpperCase();
  if (!code) return;
  busy(e.submitter, async () => {
    try {
      cart = setCartFrom(await cartApi.applyCoupon(code));
      draw();
      if (cart.couponStatus?.applied) toast('Cupão aplicado.');
    } catch (err) {
      toastError(err);
    }
  });
});

load();
