import { hasPermission, isStaff, logout, requireAuth } from '../auth.js';
import { CONFIG } from '../config.js';
import { icon } from '../icons.js';
import { $, html, initials, installImageFallback, render } from '../utils.js';

/**
 * Área administrativa. O frontend esconde o que o utilizador não pode usar, mas quem decide
 * é sempre o backend (todas as rotas /admin exigem a permissão respetiva).
 */
const NAV = [
  { href: 'index.html', label: 'Dashboard', icon: 'chart', perm: 'dashboard:read' },
  { href: 'orders.html', label: 'Pedidos', icon: 'orders', perm: 'orders:read' },
  { href: 'returns.html', label: 'Devoluções', icon: 'return', perm: 'orders:read' },
  { href: 'products.html', label: 'Produtos', icon: 'box', perm: 'products:read' },
  { href: 'inventory.html', label: 'Stock', icon: 'layers', perm: 'inventory:read' },
  { href: 'categories.html', label: 'Categorias', icon: 'grid', perm: 'categories:manage' },
  { href: 'brands.html', label: 'Marcas', icon: 'tag', perm: 'brands:manage' },
  { href: 'customers.html', label: 'Clientes', icon: 'users', perm: 'customers:read' },
  { href: 'coupons.html', label: 'Cupões', icon: 'percent', perm: 'coupons:manage' },
  { href: 'promotions.html', label: 'Promoções', icon: 'percent', perm: 'promotions:manage' },
  { href: 'banners.html', label: 'Banners', icon: 'image', perm: 'banners:manage' },
  { href: 'reviews.html', label: 'Avaliações', icon: 'star', perm: null, anyOf: ['reviews:moderate', 'questions:moderate'] },
  { href: 'reports.html', label: 'Relatórios', icon: 'chart', perm: 'reports:read' },
  { href: 'settings.html', label: 'Configurações', icon: 'settings', perm: null, anyOf: ['settings:manage', 'whatsapp:manage', 'shipping_methods:manage', 'payment_methods:manage', 'admins:manage'] },
  { href: 'audit.html', label: 'Auditoria', icon: 'shield', perm: 'audit:read' },
];

const allowed = (item) => (item.perm ? hasPermission(item.perm) : item.anyOf.some(hasPermission));

/**
 * initAdmin({ title, permission }) — exige sessão de staff e a permissão da página.
 * Devolve o elemento onde a página desenha o conteúdo.
 */
export async function initAdmin({ title, permission, anyOf } = {}) {
  installImageFallback();
  document.title = `${title} · Gestão · ${CONFIG.STORE_NAME}`;
  const user = await requireAuth();
  const app = $('#admin');

  if (!isStaff()) return forbidden(app, 'A sua conta não tem acesso ao painel de gestão.');
  const page = location.pathname.split('/').pop() || 'index.html';
  const nav = NAV.filter(allowed);

  render(
    app,
    html`<a class="skip-link" href="#admin-main">Saltar para o conteúdo</a>
    <div class="adm">
      <aside class="adm__side" id="adm-side" aria-label="Navegação de gestão">
        <div class="adm__brand"><a class="logo" href="index.html"><span class="logo__mark" aria-hidden="true"></span>Gestão</a><button class="icon-btn adm__close" type="button" data-side-close aria-label="Fechar menu">${icon('close')}</button></div>
        <nav><ul class="adm__nav">${nav.map((n) => html`<li><a href="${n.href}" class="${page === n.href ? 'is-active' : ''}" ${page === n.href ? html`aria-current="page"` : ''}>${icon(n.icon, { size: 18 })}${n.label}</a></li>`)}</ul></nav>
        <a class="adm__store" href="../index.html">${icon('store', { size: 18 })}Ver loja</a>
      </aside>
      <div class="adm__backdrop" data-side-close></div>
      <div class="adm__body">
        <header class="adm__top">
          <button class="icon-btn adm__menu" type="button" data-side-open aria-label="Abrir menu" aria-controls="adm-side">${icon('menu')}</button>
          <h1 class="adm__title">${title}</h1>
          <div class="adm__user"><span class="avatar">${initials(user.name)}</span><span class="adm__name">${user.name}<small>${[...user.roles].filter((r) => r !== 'CUSTOMER').join(', ')}</small></span>
            <button class="icon-btn" type="button" data-logout aria-label="Terminar sessão">${icon('logout')}</button></div>
        </header>
        <main id="admin-main" class="adm__main" tabindex="-1"></main>
      </div>
    </div>`,
  );

  const side = $('#adm-side');
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-side-open]')) document.body.classList.add('side-open');
    if (e.target.closest('[data-side-close]')) document.body.classList.remove('side-open');
    if (e.target.closest('[data-logout]')) logout();
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && document.body.classList.remove('side-open'));
  void side;

  const main = $('#admin-main');
  const ok = permission ? hasPermission(permission) : anyOf ? anyOf.some(hasPermission) : true;
  if (!ok) {
    forbidden(main, 'Não tem permissão para aceder a esta secção. Peça acesso ao dono da loja.', true);
    return new Promise(() => {});
  }
  return main;
}

function forbidden(el, text, inside = false) {
  render(
    el,
    html`<div class="forbidden ${inside ? '' : 'forbidden--full'}" role="alert">
      <p class="forbidden__code">403</p>
      <h1>Acesso não autorizado</h1>
      <p>${text}</p>
      <a class="btn btn--primary" href="${inside ? 'index.html' : '../index.html'}">${inside ? 'Voltar ao painel' : 'Voltar à loja'}</a>
    </div>`,
  );
  if (!inside) return new Promise(() => {});
}

export { hasPermission };
