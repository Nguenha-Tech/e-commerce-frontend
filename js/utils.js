import { CONFIG } from './config.js';

// ------------------------------------------------------------------ HTML seguro
/** Marca uma string como HTML já seguro (não é escapada pelo `html`). */
export class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}
export const raw = (s) => new SafeHtml(String(s ?? ''));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function renderValue(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}

/** Template literal que escapa todos os valores interpolados (proteção XSS). */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => (out += renderValue(v) + strings[i + 1]));
  return new SafeHtml(out);
}

/** Substitui o conteúdo de um elemento por HTML seguro. */
export function render(el, content) {
  if (!el) return;
  el.innerHTML = content instanceof SafeHtml ? content.value : escapeHtml(content);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ------------------------------------------------------------------ dinheiro e números
/** Valores da API em centavos → "65.000 MZN" (ou "65.000,50 MZN"). */
export function formatMoney(cents, currency = CONFIG.STORE_CURRENCY) {
  if (cents === null || cents === undefined || Number.isNaN(Number(cents))) return '—';
  const negative = cents < 0;
  const abs = Math.abs(Math.round(Number(cents)));
  const units = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '−' : ''}${grouped}${rest ? ',' + String(rest).padStart(2, '0') : ''} ${currency}`;
}

/** "65000" ou "65.000,50" (MZN, digitado no admin) → centavos. */
export function parseMoneyInput(value) {
  if (value === '' || value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

/** centavos → valor para um input (ex.: 6500050 → "65000.5"). */
export const centsToInput = (cents) => (cents === null || cents === undefined ? '' : String(cents / 100));

export const formatNumber = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ------------------------------------------------------------------ datas
const dateFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const formatDate = (d) => (d ? dateFmt.format(new Date(d)) : '—');
export const formatDateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : '—');
/** Valor para <input type="datetime-local"> no fuso local. */
export function toDateTimeLocal(d) {
  if (!d) return '';
  const date = new Date(d);
  const off = date.getTimezoneOffset();
  return new Date(date.getTime() - off * 60000).toISOString().slice(0, 16);
}
export function timeAgo(d) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'agora mesmo';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `há ${Math.floor(s / 86400)} dias`;
  return formatDate(d);
}

// ------------------------------------------------------------------ estados (rótulos amigáveis)
export const ORDER_STATUS = {
  PENDING: { label: 'Pendente', tone: 'warn' },
  CONFIRMED: { label: 'Confirmado', tone: 'info' },
  PROCESSING: { label: 'Em processamento', tone: 'info' },
  PACKED: { label: 'Embalado', tone: 'info' },
  SHIPPED: { label: 'Enviado', tone: 'info' },
  OUT_FOR_DELIVERY: { label: 'Em entrega', tone: 'info' },
  DELIVERED: { label: 'Entregue', tone: 'ok' },
  CANCELLED: { label: 'Cancelado', tone: 'bad' },
  RETURN_REQUESTED: { label: 'Devolução pedida', tone: 'warn' },
  RETURNED: { label: 'Devolvido', tone: 'neutral' },
  REFUNDED: { label: 'Reembolsado', tone: 'neutral' },
};
export const PAYMENT_STATUS = {
  PENDING: { label: 'A aguardar pagamento', tone: 'warn' },
  PROCESSING: { label: 'Pagamento em processamento', tone: 'info' },
  PAID: { label: 'Pago', tone: 'ok' },
  FAILED: { label: 'Pagamento falhou', tone: 'bad' },
  CANCELLED: { label: 'Pagamento cancelado', tone: 'neutral' },
  REFUNDED: { label: 'Reembolsado', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'Parcialmente reembolsado', tone: 'neutral' },
};
export const RETURN_STATUS = {
  REQUESTED: { label: 'Pedida', tone: 'warn' },
  UNDER_REVIEW: { label: 'Em análise', tone: 'info' },
  APPROVED: { label: 'Aprovada', tone: 'info' },
  REJECTED: { label: 'Rejeitada', tone: 'bad' },
  RECEIVED: { label: 'Recebida', tone: 'info' },
  REFUNDED: { label: 'Reembolsada', tone: 'ok' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
};
export const PRODUCT_STATUS = {
  DRAFT: { label: 'Rascunho', tone: 'neutral' },
  ACTIVE: { label: 'Ativo', tone: 'ok' },
  OUT_OF_STOCK: { label: 'Esgotado', tone: 'warn' },
  INACTIVE: { label: 'Inativo', tone: 'neutral' },
  DISCONTINUED: { label: 'Descontinuado', tone: 'bad' },
};
export const PAYMENT_TYPES = { CARD: 'Cartão', MOBILE_MONEY: 'Mobile Money', BANK_TRANSFER: 'Transferência bancária', CASH_ON_DELIVERY: 'Pagamento na entrega', OTHER: 'Outro' };
export const OPTION_LABELS = { color: 'Cor', storage: 'Armazenamento', size: 'Tamanho', ram: 'RAM', capacity: 'Capacidade', model: 'Modelo' };
export const optionLabel = (k) => OPTION_LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1);

export function badge(map, value) {
  const s = map[value] ?? { label: value, tone: 'neutral' };
  return html`<span class="badge badge--${s.tone}">${s.label}</span>`;
}

// ------------------------------------------------------------------ diversos
export function debounce(fn, ms) {
  let id;
  return (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), ms);
  };
}

export const params = () => new URLSearchParams(location.search);

/** Atualiza a query string sem recarregar (para filtros/paginação partilháveis). */
export function setParams(obj, { replace = false } = {}) {
  const p = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(obj)) {
    p.delete(k);
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, v);
  }
  const url = `${location.pathname}${p.toString() ? '?' + p : ''}`;
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

export const productUrl = (p) => `product.html?slug=${encodeURIComponent(p.slug ?? p.productSlug ?? '')}`;

/** Caminho relativo à raiz do frontend (páginas em /admin usam "../"). */
export const root = () => (location.pathname.includes('/admin/') ? '../' : '');

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

export function plural(n, one, many) {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** Lê um <form> para objeto (strings aparadas; checkboxes como boolean). */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value.trim();
  }
  return out;
}

/** Remove chaves com '' (campos opcionais não preenchidos). */
export const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined));

/**
 * Destino de um banner: produto/categoria associados, ou o link definido no admin.
 * "/promocoes/<slug>" abre a página da promoção; outros caminhos "/x" são relativos à loja.
 */
export function bannerHref(b) {
  if (b.product) return `product.html?slug=${encodeURIComponent(b.product.slug)}`;
  const link = b.linkUrl ?? '';
  const promo = link.match(/^\/(?:promocoes|promotions)\/([a-z0-9-]+)/);
  if (promo) return `shop.html?promotion=${promo[1]}`;
  if (link.startsWith('https://')) return link;
  if (link.startsWith('/')) return link.slice(1) || 'index.html';
  if (b.category) return `shop.html?category=${encodeURIComponent(b.category.slug)}`;
  return 'shop.html';
}

const IMG_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#eef1f6"/><g fill="none" stroke="#c7cfdb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="34" y="38" width="52" height="44" rx="5"/><circle cx="50" cy="54" r="5"/><path d="m86 72-14-14-26 24"/></g></svg>');

/** Imagens que falham (CDN em baixo, URL inválido) mostram um marcador neutro em vez do ícone partido. */
export function installImageFallback() {
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.fallback) return;
      img.dataset.fallback = '1';
      img.closest('picture')?.querySelectorAll('source').forEach((s) => s.remove());
      img.src = IMG_FALLBACK;
    },
    true,
  );
}
