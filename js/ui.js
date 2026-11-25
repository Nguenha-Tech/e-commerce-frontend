import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { store } from './store.js';
import { $, formatMoney, formatNumber, html, productUrl, raw, render } from './utils.js';

// =================================================================== Toast
let toastRoot;
/** toast('Produto adicionado', { type: 'success' | 'error' | 'info' }) */
export function toast(message, { type = 'success', timeout = 3500 } = {}) {
  toastRoot ??= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'toasts' });
  toastRoot.setAttribute('role', 'status');
  toastRoot.setAttribute('aria-live', 'polite');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  render(el, html`${icon(type === 'error' ? 'close' : type === 'info' ? 'bell' : 'check', { size: 18 })}<span>${message}</span>`);
  toastRoot.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 250);
  }, timeout);
}

/** Mostra o erro da API de forma amigável. */
export function toastError(err) {
  toast(err?.friendly ?? t('error.500'), { type: 'error', timeout: 5000 });
}

// =================================================================== Modal
/**
 * openModal({ title, body, actions:[{label, variant, onClick}], size }) → { el, close }
 * Acessível: role=dialog, foco preso no modal, ESC fecha, foco devolvido ao gatilho.
 */
export function openModal({ title, body, actions = [], size = 'md', onClose } = {}) {
  const previous = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  const titleId = `m-${Math.random().toString(36).slice(2)}`;
  render(
    wrap,
    html`<div class="modal__backdrop" data-close></div>
      <div class="modal__panel modal__panel--${size}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <header class="modal__head">
          <h2 id="${titleId}" class="modal__title">${title}</h2>
          <button class="icon-btn" type="button" data-close aria-label="Fechar">${icon('close')}</button>
        </header>
        <div class="modal__body"></div>
        ${actions.length ? raw('<footer class="modal__foot"></footer>') : ''}
      </div>`,
  );
  const bodyEl = $('.modal__body', wrap);
  if (body instanceof Node) bodyEl.appendChild(body);
  else render(bodyEl, body ?? '');
  const foot = $('.modal__foot', wrap);
  actions.forEach((a) => {
    const b = document.createElement('button');
    b.type = a.type ?? 'button';
    b.className = `btn btn--${a.variant ?? 'ghost'}`;
    b.textContent = a.label;
    if (a.form) b.setAttribute('form', a.form);
    if (a.onClick) b.addEventListener('click', () => a.onClick({ close, button: b }));
    foot.appendChild(b);
  });

  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = [...wrap.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
        e.preventDefault();
        f[0].focus();
      }
    }
  }
  function close() {
    document.removeEventListener('keydown', onKey);
    wrap.classList.remove('is-open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 180);
    previous?.focus?.();
    onClose?.();
  }
  wrap.addEventListener('click', (e) => e.target.closest('[data-close]') && close());
  document.addEventListener('keydown', onKey);
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => {
    wrap.classList.add('is-open');
    (wrap.querySelector('[autofocus], .modal__body input, .modal__body select, .modal__body textarea') ?? $('.modal__head .icon-btn', wrap)).focus();
  });
  return { el: wrap, body: bodyEl, close };
}

/** Confirmação em modal (substitui window.confirm). */
export function confirmDialog(message, { title = 'Confirmar', confirmLabel = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title,
      body: html`<p>${message}</p>`,
      size: 'sm',
      onClose: () => !done && resolve(false),
      actions: [
        { label: 'Cancelar', onClick: ({ close }) => close() },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', onClick: ({ close }) => ((done = true), resolve(true), close()) },
      ],
    });
    return m;
  });
}

/** Desativa o botão e mostra "a carregar" enquanto a promessa corre. */
export async function busy(button, fn) {
  if (!button) return fn();
  if (button.dataset.busy) return;
  button.dataset.busy = '1';
  button.disabled = true;
  button.classList.add('is-busy');
  try {
    return await fn();
  } finally {
    delete button.dataset.busy;
    button.disabled = false;
    button.classList.remove('is-busy');
  }
}

// =================================================================== Estados (loading / empty / error / offline)
export function skeletonCards(n = 8) {
  return html`<div class="product-grid" aria-busy="true" aria-label="A carregar">${Array.from({ length: n }, () => raw('<div class="card-skeleton"><div class="sk sk--img"></div><div class="sk sk--line"></div><div class="sk sk--line sk--short"></div><div class="sk sk--price"></div></div>'))}</div>`;
}

export function skeletonLines(n = 4) {
  return html`<div class="sk-stack" aria-busy="true">${Array.from({ length: n }, (_, i) => raw(`<div class="sk sk--line${i % 3 === 2 ? ' sk--short' : ''}"></div>`))}</div>`;
}

export function showLoading(el, kind = 'lines', n) {
  render(el, kind === 'cards' ? skeletonCards(n) : skeletonLines(n));
}

export function emptyState({ iconName = 'search', title, text, actionLabel, actionHref }) {
  return html`<div class="state">
    <div class="state__icon">${icon(iconName, { size: 32 })}</div>
    <p class="state__title">${title}</p>
    ${text ? html`<p class="state__text">${text}</p>` : ''}
    ${actionLabel ? html`<a class="btn btn--primary" href="${actionHref}">${actionLabel}</a>` : ''}
  </div>`;
}

export function showEmpty(el, opts) {
  render(el, emptyState(opts));
}

/** Estado de erro com "Tentar novamente". Mostra mensagem de offline quando aplicável. */
export function showError(el, err, onRetry, title = t('state.loadError')) {
  const offline = err?.code === 'OFFLINE' || err?.code === 'NETWORK' || navigator.onLine === false;
  render(
    el,
    html`<div class="state state--error" role="alert">
      <div class="state__icon">${icon(offline ? 'wifiOff' : 'refresh', { size: 32 })}</div>
      <p class="state__title">${offline ? t('state.offline') : title}</p>
      ${!offline && err?.friendly ? html`<p class="state__text">${err.friendly}</p>` : ''}
      ${onRetry ? html`<button class="btn btn--ghost" type="button" data-retry>${t('state.retry')}</button>` : ''}
    </div>`,
  );
  el.querySelector('[data-retry]')?.addEventListener('click', onRetry, { once: true });
}

/** Carrega dados para um contentor com loading/empty/error automáticos. */
export async function load(el, fetcher, renderFn, { kind = 'lines', count, empty } = {}) {
  showLoading(el, kind, count);
  try {
    const data = await fetcher();
    const isEmpty = Array.isArray(data) ? data.length === 0 : Array.isArray(data?.items) && data.items.length === 0;
    if (isEmpty && empty) showEmpty(el, empty);
    else renderFn(data);
    return data;
  } catch (err) {
    showError(el, err, () => load(el, fetcher, renderFn, { kind, count, empty }));
    return null;
  }
}

// =================================================================== Paginação
/** Renderiza "← 1 2 3 … 9 →" e chama onPage(n). */
export function pagination(el, meta, onPage) {
  if (!meta || (meta.totalPages ?? 1) <= 1) return render(el, '');
  const { page, totalPages } = meta;
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];
  sorted.forEach((p, i) => {
    if (i && p - sorted[i - 1] > 1) items.push(html`<span class="pager__gap" aria-hidden="true">…</span>`);
    items.push(html`<button type="button" class="pager__btn ${p === page ? 'is-current' : ''}" data-page="${p}" ${raw(p === page ? 'aria-current="page"' : '')}>${p}</button>`);
  });
  render(
    el,
    html`<nav class="pager" aria-label="Paginação">
      <button type="button" class="pager__btn" data-page="${page - 1}" ${raw(page <= 1 ? 'disabled' : '')} aria-label="Página anterior">${icon('chevronLeft', { size: 18 })}</button>
      ${items}
      <button type="button" class="pager__btn" data-page="${page + 1}" ${raw(page >= totalPages ? 'disabled' : '')} aria-label="Página seguinte">${icon('chevronRight', { size: 18 })}</button>
    </nav>`,
  );
  el.onclick = (e) => {
    const b = e.target.closest('[data-page]');
    if (b && !b.disabled) onPage(Number(b.dataset.page));
  };
}

// =================================================================== Componentes de produto
export function stars(average = 0, count, { size = 14 } = {}) {
  const pct = Math.max(0, Math.min(100, (Number(average) / 5) * 100));
  return html`<span class="rating" title="${Number(average).toFixed(1)} de 5">
    <span class="rating__stars" aria-hidden="true"><span class="rating__base">${Array.from({ length: 5 }, () => icon('star', { size }))}</span><span class="rating__fill" style="width:${pct}%">${Array.from({ length: 5 }, () => icon('star', { size }))}</span></span>
    <span class="sr-only">${Number(average).toFixed(1)} de 5 estrelas</span>
    ${count !== undefined ? html`<span class="rating__count">${Number(average) > 0 ? Number(average).toFixed(1) : ''} ${count ? `(${formatNumber(count)})` : ''}</span>` : ''}
  </span>`;
}

/** Bloco de preço: preço atual grande + preço anterior riscado + desconto. */
export function priceTag({ amount, compareAt, discountPercent, currency = CONFIG.STORE_CURRENCY, from = false, size = 'md' }) {
  return html`<div class="price price--${size}">
    <span class="price__now">${from ? html`<small>${t('product.from')}</small> ` : ''}${formatMoney(amount, currency)}</span>
    ${compareAt && compareAt > amount ? html`<span class="price__was"><span class="sr-only">Preço anterior: </span><s>${formatMoney(compareAt, currency)}</s></span>` : ''}
    ${discountPercent > 0 ? html`<span class="price__off">−${discountPercent}%</span>` : ''}
  </div>`;
}

/** Cartão de produto (catálogo, homepage, relacionados, favoritos). */
export function productCard(p, { compact = false } = {}) {
  const fav = store.get('wishlistIds').has(p.id);
  const url = productUrl(p);
  const img = p.image?.thumbnailUrl ?? p.image?.url;
  const action = !p.inStock
    ? html`<button class="btn btn--block btn--ghost" type="button" disabled>${t('product.outOfStock')}</button>`
    : p.hasVariants
      ? html`<a class="btn btn--block btn--ghost" href="${url}">${t('product.chooseOptions')}</a>`
      : html`<button class="btn btn--block btn--primary" type="button" data-action="quick-add" data-product="${p.id}">${icon('cart', { size: 18 })}<span>${t('product.addToCart')}</span></button>`;

  return html`<article class="pcard ${compact ? 'pcard--compact' : ''} ${p.inStock ? '' : 'is-soldout'}">
    <a class="pcard__media" href="${url}" tabindex="-1" aria-hidden="true">
      ${img ? html`<img src="${img}" alt="" loading="lazy" decoding="async" width="400" height="400">` : html`<span class="pcard__noimg">${icon('image', { size: 32 })}</span>`}
      ${p.price?.discountPercent > 0 ? html`<span class="pcard__off">−${p.price.discountPercent}%</span>` : ''}
      ${!p.price?.discountPercent && p.flags?.new ? html`<span class="pcard__new">Novo</span>` : ''}
    </a>
    <button class="pcard__fav ${fav ? 'is-active' : ''}" type="button" data-action="toggle-wishlist" data-product="${p.id}" aria-pressed="${fav}" aria-label="${fav ? t('wishlist.remove') : t('wishlist.add')}: ${p.name}">${icon('heart', { size: 18 })}</button>
    <div class="pcard__body">
      ${p.brand ? html`<span class="pcard__brand">${p.brand.name}</span>` : ''}
      <h3 class="pcard__title"><a href="${url}">${p.name}</a></h3>
      ${p.rating?.count ? stars(p.rating.average, p.rating.count) : html`<span class="pcard__norating">Sem avaliações</span>`}
      ${priceTag({ amount: p.price?.from, compareAt: p.price?.compareAt, currency: p.price?.currency, from: p.price && p.price.to > p.price.from })}
      <p class="pcard__stock ${p.inStock ? 'is-in' : 'is-out'}">${p.inStock ? t('product.inStock') : t('product.outOfStock')}</p>
      ${compact ? '' : action}
    </div>
  </article>`;
}

export function productGrid(items, opts) {
  return html`<div class="product-grid">${items.map((p) => productCard(p, opts))}</div>`;
}

// =================================================================== SEO
function meta(attr, key, content) {
  if (!content) return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Título, description, Open Graph, canonical e JSON-LD da página. */
export function setSeo({ title, description, image, url, type = 'website', jsonLd } = {}) {
  if (title) document.title = `${title} · ${CONFIG.STORE_NAME}`;
  meta('name', 'description', description);
  meta('property', 'og:title', title);
  meta('property', 'og:description', description);
  meta('property', 'og:image', image);
  meta('property', 'og:type', type);
  meta('property', 'og:url', url ?? location.href);
  meta('property', 'og:site_name', CONFIG.STORE_NAME);
  meta('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  if (url) {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) document.head.appendChild((link = Object.assign(document.createElement('link'), { rel: 'canonical' })));
    link.href = url;
  }
  if (jsonLd) {
    let s = document.getElementById('jsonld');
    if (!s) document.head.appendChild((s = Object.assign(document.createElement('script'), { id: 'jsonld', type: 'application/ld+json' })));
    s.textContent = JSON.stringify(jsonLd);
  }
}
