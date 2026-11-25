import { isStaff, loadSession, logout, requireAuth } from './auth.js';
import { quickAdd, refreshCartCount } from './cart.js';
import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { notificationLink, notificationsApi, refreshUnread } from './notifications.js';
import { catalogApi, productsApi, topCategories } from './products.js';
import { store } from './store.js';
import { busy, toastError } from './ui.js';
import { $, $$, debounce, formatMoney, html, initials, installImageFallback, productUrl, render, timeAgo } from './utils.js';
import { loadWhatsAppConfig, openWhatsApp } from './whatsapp.js';
import { loadWishlistIds, syncHearts, toggleWishlist } from './wishlist.js';

/**
 * Inicializa uma página da loja: header, footer, WhatsApp, sessão e contadores.
 * initPage({ auth: true }) exige sessão (redireciona para o login).
 */
export async function initPage({ auth = false } = {}) {
  installImageFallback();
  renderShell();
  bindGlobalActions();
  bindOffline();
  const user = auth ? await requireAuth() : await loadSession();
  renderAccount(user);
  // Dados auxiliares em paralelo (não bloqueiam o conteúdo da página).
  Promise.all([loadWishlistIds().then(() => syncHearts()), refreshCartCount(), refreshUnread(), loadCategoriesMenu(), initWhatsAppFab()]);
  return user;
}

// ------------------------------------------------------------------ estrutura
function renderShell() {
  const header = $('#site-header');
  const footer = $('#site-footer');
  if (!document.querySelector('.skip-link')) {
    document.body.insertAdjacentHTML('afterbegin', '<a class="skip-link" href="#main">Saltar para o conteúdo</a>');
  }
  render(
    header,
    html`<div class="container">
        <div class="header__row">
          <button class="icon-btn header__menu" type="button" data-drawer-open aria-label="${t('nav.menu')}" aria-controls="drawer" aria-expanded="false">${icon('menu')}</button>
          <a class="logo" href="index.html" aria-label="${CONFIG.STORE_NAME} — página inicial"><span class="logo__mark" aria-hidden="true"></span>${CONFIG.STORE_NAME}</a>
          <div class="dropdown header__cats">
            <button class="btn btn--ghost" type="button" data-dd="cats" aria-expanded="false" aria-controls="dd-cats">${icon('grid', { size: 18 })}${t('nav.categories')}${icon('chevronDown', { size: 16 })}</button>
            <div class="dropdown__panel cats-panel" id="dd-cats" hidden></div>
          </div>
          <form class="search header__search-desktop" role="search" action="shop.html"></form>
          <nav class="header__icons" aria-label="Atalhos">
            <span data-slot="notifications"></span>
            <a class="icon-btn header__wish" href="wishlist.html" aria-label="${t('nav.wishlist')}">${icon('heart')}</a>
            <a class="icon-btn" href="cart.html" aria-label="${t('nav.cart')}">${icon('cart')}<span class="count" data-cart-count hidden>0</span></a>
            <div class="dropdown" data-slot="account"></div>
          </nav>
        </div>
        <form class="search header__search" role="search" action="shop.html"></form>
      </div>
      <nav class="catbar" aria-label="Categorias principais"><div class="container catbar__inner"></div></nav>`,
  );
  header.classList.add('site-header');
  $$('form.search', header).forEach((f, i) => setupSearch(f, i));

  // Drawer mobile
  if (!$('#drawer')) {
    document.body.insertAdjacentHTML('beforeend', '<div class="drawer" id="drawer" aria-hidden="true"></div>');
  }
  const drawer = $('#drawer');
  render(
    drawer,
    html`<div class="drawer__backdrop" data-drawer-close></div>
      <div class="drawer__panel" role="dialog" aria-modal="true" aria-label="${t('nav.menu')}">
        <div class="drawer__head"><a class="logo" href="index.html"><span class="logo__mark" aria-hidden="true"></span>${CONFIG.STORE_NAME}</a><button class="icon-btn" type="button" data-drawer-close aria-label="Fechar menu">${icon('close')}</button></div>
        <div class="drawer__body">
          <div data-slot="drawer-account"></div>
          <p class="drawer__group">${t('nav.categories')}</p>
          <div data-slot="drawer-cats"></div>
          <p class="drawer__group">Ajuda</p>
          <ul class="menu-list">
            <li><a href="contact.html">${icon('phone', { size: 18 })}Contactos</a></li>
            <li><button type="button" data-whatsapp="SUPPORT">${icon('whatsapp', { size: 18 })}${t('whatsapp.talk')}</button></li>
            <li><a href="help.html#entregas">${icon('truck', { size: 18 })}Entregas</a></li>
            <li><a href="help.html#devolucoes">${icon('return', { size: 18 })}Devoluções</a></li>
          </ul>
        </div>
      </div>`,
  );
  const menuBtn = $('[data-drawer-open]', header);
  const openDrawer = () => {
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    menuBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('no-scroll');
    $('[data-drawer-close].icon-btn', drawer).focus();
  };
  const closeDrawer = () => {
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  };
  menuBtn.addEventListener('click', openDrawer);
  drawer.addEventListener('click', (e) => e.target.closest('[data-drawer-close]') && closeDrawer());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && drawer.classList.contains('is-open') && (closeDrawer(), menuBtn.focus()));

  store.subscribe('cartCount', (n) => {
    const el = $('[data-cart-count]');
    if (!el) return;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = !n;
    el.parentElement.setAttribute('aria-label', `${t('nav.cart')}${n ? ` (${n} artigos)` : ''}`);
  });
  store.subscribe('wishlistIds', () => syncHearts());

  render(footer, footerHtml());
  footer.classList.add('site-footer');
}

function footerHtml() {
  const year = new Date().getFullYear();
  return html`<div class="container">
      <div class="footer__grid">
        <section class="footer__brand">
          <a class="logo" href="index.html"><span class="logo__mark" aria-hidden="true"></span>${CONFIG.STORE_NAME}</a>
          <p>Smartphones, computadores, áudio e acessórios com garantia, entrega em todo o país e apoio próximo.</p>
          <button class="btn btn--whatsapp btn--sm" type="button" data-whatsapp="SUPPORT">${icon('whatsapp', { size: 18 })}${t('whatsapp.talk')}</button>
        </section>
        <section>
          <h2>Loja</h2>
          <ul>
            <li><a href="help.html#sobre">Sobre nós</a></li>
            <li><a href="shop.html">Todos os produtos</a></li>
            <li><a href="shop.html?onSale=true">Ofertas</a></li>
            <li><a href="contact.html">Contactos</a></li>
          </ul>
        </section>
        <section>
          <h2>Ajuda</h2>
          <ul>
            <li><a href="help.html#ajuda">Perguntas frequentes</a></li>
            <li><a href="help.html#entregas">Entregas</a></li>
            <li><a href="help.html#devolucoes">Política de devolução</a></li>
            <li><a href="orders.html">Acompanhar pedido</a></li>
          </ul>
        </section>
        <section>
          <h2>Legal</h2>
          <ul>
            <li><a href="help.html#privacidade">Política de privacidade</a></li>
            <li><a href="help.html#termos">Termos e condições</a></li>
          </ul>
          <h2 style="margin-top:18px">Redes sociais</h2>
          <ul class="social">
            <li><a href="https://facebook.com" rel="noopener" target="_blank">Facebook</a></li>
            <li><a href="https://instagram.com" rel="noopener" target="_blank">Instagram</a></li>
          </ul>
        </section>
      </div>
      <div class="footer__bottom">
        <span>© ${year} ${CONFIG.STORE_NAME}. Preços em ${CONFIG.STORE_CURRENCY}, IVA incluído.</span>
        <span class="footer__pay" aria-label="Métodos de pagamento"><span>M-Pesa</span><span>e-Mola</span><span>Cartão</span><span>Transferência</span><span>Na entrega</span></span>
      </div>
    </div>`;
}

// ------------------------------------------------------------------ conta
function renderAccount(user) {
  const slot = $('[data-slot="account"]');
  const drawerSlot = $('[data-slot="drawer-account"]');
  if (!user) {
    render(slot, html`<a class="icon-btn" href="login.html" aria-label="${t('nav.login')}">${icon('user')}</a>`);
    render(
      drawerSlot,
      html`<ul class="menu-list"><li><a href="login.html">${icon('user', { size: 18 })}${t('nav.login')}</a></li><li><a href="register.html">${icon('plus', { size: 18 })}${t('nav.register')}</a></li></ul>`,
    );
    return;
  }
  const links = html`
    <li><a href="profile.html">${icon('user', { size: 18 })}${t('nav.profile')}</a></li>
    <li><a href="orders.html">${icon('orders', { size: 18 })}${t('nav.orders')}</a></li>
    <li><a href="wishlist.html">${icon('heart', { size: 18 })}${t('nav.wishlist')}</a></li>
    ${isStaff() ? html`<li><a href="admin/index.html">${icon('settings', { size: 18 })}${t('nav.admin')}</a></li>` : ''}
    <li><button type="button" data-logout>${icon('logout', { size: 18 })}${t('nav.logout')}</button></li>`;
  render(
    slot,
    html`<button class="icon-btn" type="button" data-dd="account" aria-expanded="false" aria-controls="dd-account" aria-label="${t('nav.account')}: ${user.name}"><span class="avatar">${initials(user.name)}</span></button>
      <div class="dropdown__panel" id="dd-account" hidden>
        <div class="menu-head"><strong>${user.name}</strong><span>${user.email}</span></div>
        <ul class="menu-list">${links}</ul>
      </div>`,
  );
  render(drawerSlot, html`<div class="menu-head"><strong>${user.name}</strong><span>${user.email}</span></div><ul class="menu-list">${links}</ul>`);

  // Notificações
  const nslot = $('[data-slot="notifications"]');
  render(
    nslot,
    html`<span class="dropdown">
      <button class="icon-btn" type="button" data-dd="notifs" aria-expanded="false" aria-controls="dd-notifs" aria-label="${t('nav.notifications')}">${icon('bell')}<span class="count count--alert" data-unread hidden>0</span></button>
      <div class="dropdown__panel notif-panel" id="dd-notifs" hidden></div>
    </span>`,
  );
  store.subscribe('unreadNotifications', (n) => {
    const el = $('[data-unread]');
    if (!el) return;
    el.textContent = n > 9 ? '9+' : String(n);
    el.hidden = !n;
  });
}

async function renderNotifications(panel) {
  render(panel, html`<div class="notif-panel__head"><strong>${t('nav.notifications')}</strong></div><div class="sk-stack" style="padding:14px"><div class="sk sk--line"></div><div class="sk sk--line sk--short"></div></div>`);
  try {
    const { items, meta } = await notificationsApi.list({ limit: 8 });
    store.set('unreadNotifications', meta.unread ?? 0);
    render(
      panel,
      html`<div class="notif-panel__head"><strong>${t('nav.notifications')}</strong>${meta.unread ? html`<button class="link-btn" type="button" data-read-all>Marcar todas como lidas</button>` : ''}</div>
        ${items.length
          ? html`<ul class="notif-list">${items.map((n) => {
              const link = notificationLink(n);
              return html`<li><a class="notif ${n.readAt ? '' : 'is-unread'}" href="${link ?? '#'}" data-notif="${n.id}"><strong>${n.title}</strong><span>${n.body}</span><time datetime="${n.createdAt}">${timeAgo(n.createdAt)}</time></a></li>`;
            })}</ul>`
          : html`<p class="state__text" style="padding:18px 14px;margin:0">Sem notificações por agora.</p>`}`,
    );
  } catch (err) {
    render(panel, html`<p style="padding:14px">${err.friendly}</p>`);
  }
}

// ------------------------------------------------------------------ categorias
async function loadCategoriesMenu() {
  try {
    const cats = topCategories(await catalogApi.categories());
    render(
      $('#dd-cats'),
      html`${cats.map(
        (c) => html`<div><h3><a href="shop.html?category=${c.slug}">${c.name}</a></h3>${c.children?.length ? html`<ul>${c.children.map((s) => html`<li><a href="shop.html?category=${s.slug}">${s.name}</a></li>`)}</ul>` : ''}</div>`,
      )}<div><h3><a href="shop.html">Ver tudo</a></h3><ul><li><a href="shop.html?onSale=true">Ofertas</a></li><li><a href="shop.html?sort=newest">Novidades</a></li></ul></div>`,
    );
    render($('.catbar__inner'), html`${cats.slice(0, 9).map((c) => html`<a href="shop.html?category=${c.slug}">${c.name}</a>`)}<a href="shop.html?onSale=true" class="catbar__deal">Ofertas</a>`);
    render(
      $('[data-slot="drawer-cats"]'),
      html`${cats.map((c) =>
        c.children?.length
          ? html`<details><summary>${c.name}${icon('chevronDown', { size: 16 })}</summary><ul class="menu-list"><li><a href="shop.html?category=${c.slug}">Tudo em ${c.name}</a></li>${c.children.map((s) => html`<li><a href="shop.html?category=${s.slug}">${s.name}</a></li>`)}</ul></details>`
          : html`<ul class="menu-list"><li><a href="shop.html?category=${c.slug}">${c.name}</a></li></ul>`,
      )}`,
    );
  } catch {
    render($('#dd-cats'), html`<p>Não foi possível carregar as categorias.</p>`);
  }
}

// ------------------------------------------------------------------ pesquisa com sugestões
function setupSearch(form, index) {
  const id = `search-${index}`;
  const current = new URLSearchParams(location.search).get('search') ?? '';
  render(
    form,
    html`<label class="sr-only" for="${id}">${t('nav.search')}</label>
      <input class="search__input" id="${id}" name="search" type="search" placeholder="${t('nav.search')}" autocomplete="off" value="${current}"
        role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" maxlength="100">
      <button class="search__submit" type="submit" aria-label="Pesquisar">${icon('search')}</button>
      <ul class="search__list" id="${id}-list" role="listbox" hidden></ul>`,
  );
  const input = $('input', form);
  const list = $('ul', form);
  let active = -1;
  let controller;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };
  const options = () => $$('[role="option"]', list);
  const highlight = (i) => {
    const opts = options();
    opts.forEach((o, j) => o.setAttribute('aria-selected', String(i === j)));
    active = i;
    if (opts[i]) input.setAttribute('aria-activedescendant', opts[i].id);
  };

  const suggest = debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) return close();
    controller?.abort();
    controller = new AbortController();
    try {
      const { items } = await productsApi.suggestions(q);
      if (input.value.trim() !== q) return;
      render(
        list,
        html`${items.map(
          (p, i) => html`<li><a class="search__opt" role="option" id="${id}-o${i}" aria-selected="false" href="${productUrl(p)}">
            ${p.image ? html`<img src="${p.image.thumbnailUrl ?? p.image.url}" alt="" loading="lazy">` : ''}
            <span>${p.name}<small>${p.brand?.name ?? ''} ${formatMoney(p.price.from, p.price.currency)}</small></span></a></li>`,
        )}<li><a class="search__opt search__all" role="option" id="${id}-all" aria-selected="false" href="shop.html?search=${encodeURIComponent(q)}">${icon('search', { size: 18 })}Ver todos os resultados para “${q}”</a></li>`,
      );
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
    } catch {
      close();
    }
  }, CONFIG.SEARCH_DEBOUNCE_MS);

  input.addEventListener('input', suggest);
  input.addEventListener('keydown', (e) => {
    const opts = options();
    if (list.hidden || !opts.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlight((active + 1) % opts.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlight((active - 1 + opts.length) % opts.length);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      opts[active].click();
    } else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    location.href = q ? `shop.html?search=${encodeURIComponent(q)}` : 'shop.html';
  });
}

// ------------------------------------------------------------------ ações globais (delegação)
let bound = false;
function bindGlobalActions() {
  if (bound) return;
  bound = true;
  document.addEventListener('click', async (e) => {
    const quick = e.target.closest('[data-action="quick-add"]');
    if (quick) {
      e.preventDefault();
      return busy(quick, () => quickAdd(quick.dataset.product).catch(() => {}));
    }
    const fav = e.target.closest('[data-action="toggle-wishlist"]');
    if (fav) {
      e.preventDefault();
      return busy(fav, () => toggleWishlist(fav.dataset.product, fav.dataset.variant));
    }
    const wa = e.target.closest('[data-whatsapp]');
    if (wa) {
      e.preventDefault();
      return openWhatsApp(wa.dataset.whatsapp, { productId: wa.dataset.product, variantId: wa.dataset.variant, orderNumber: wa.dataset.order });
    }
    if (e.target.closest('[data-logout]')) return logout();

    // Dropdowns (categorias, conta, notificações)
    const toggle = e.target.closest('[data-dd]');
    const openPanels = $$('.dropdown__panel:not([hidden])');
    if (toggle) {
      const panel = document.getElementById(toggle.getAttribute('aria-controls'));
      const willOpen = panel.hidden;
      openPanels.forEach((p) => closePanel(p));
      if (willOpen) {
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        if (toggle.dataset.dd === 'notifs') renderNotifications(panel);
      }
      return;
    }
    const notif = e.target.closest('[data-notif]');
    if (notif) {
      notificationsApi.read(notif.dataset.notif).catch(() => {});
      if (notif.getAttribute('href') === '#') e.preventDefault();
      refreshUnread();
    }
    const readAll = e.target.closest('[data-read-all]');
    if (readAll) {
      try {
        await notificationsApi.readAll();
        store.set('unreadNotifications', 0);
        renderNotifications(readAll.closest('.dropdown__panel'));
      } catch (err) {
        toastError(err);
      }
      return;
    }
    openPanels.forEach((p) => !p.contains(e.target) && closePanel(p));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    $$('.dropdown__panel:not([hidden])').forEach((p) => {
      closePanel(p);
      document.querySelector(`[aria-controls="${p.id}"]`)?.focus();
    });
  });
}

function closePanel(p) {
  p.hidden = true;
  document.querySelector(`[aria-controls="${p.id}"]`)?.setAttribute('aria-expanded', 'false');
}

function bindOffline() {
  if ($('.offline-bar')) return;
  document.body.insertAdjacentHTML('beforeend', `<div class="offline-bar" role="status" hidden>${icon('wifiOff', { size: 18 })}<span>${t('state.offline')}</span></div>`);
  const bar = $('.offline-bar');
  const update = () => (bar.hidden = navigator.onLine);
  addEventListener('online', update);
  addEventListener('offline', update);
  update();
}

// ------------------------------------------------------------------ WhatsApp flutuante
async function initWhatsAppFab() {
  const cfg = await loadWhatsAppConfig();
  if (!cfg.enabled || $('.wa-fab')) return;
  const source = document.body.dataset.waSource ?? 'HOMEPAGE';
  const away = cfg.isOpen === false;
  document.body.insertAdjacentHTML(
    'beforeend',
    html`<button class="wa-fab ${cfg.buttonPosition === 'bottom-left' ? 'wa-fab--bottom-left' : ''}" type="button" data-whatsapp="${source}"
      title="${away && cfg.awayMessage ? cfg.awayMessage : cfg.buttonText}" aria-label="${cfg.buttonText}">
      ${icon('whatsapp', { size: 24 })}<span class="wa-fab__text">${cfg.buttonText}</span><span class="wa-fab__status ${away ? 'is-away' : ''}" aria-hidden="true"></span>
    </button>`.toString(),
  );
}

