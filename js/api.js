import { CONFIG } from './config.js';
import { ERROR_MESSAGES, t } from './i18n.js';

/**
 * Cliente HTTP único da aplicação. Nenhum outro módulo chama fetch() diretamente.
 *
 * Sessão: o backend usa cookies HTTP-only (access_token + refresh_token). O frontend
 * nunca vê nem guarda tokens — apenas envia `credentials: 'include'`. Quando o access
 * token expira (401), o cliente tenta UMA renovação (POST /auth/refresh) e repete o pedido.
 */

export class ApiError extends Error {
  constructor({ status, code, message, details, requestId, friendly }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    /** Mensagem segura para mostrar ao utilizador. */
    this.friendly = friendly;
  }
}

/** Nomes amigáveis para campos de validação (details[].path = "body.email"). */
const FIELD_LABELS = {
  name: 'Nome', email: 'Email', phone: 'Telefone', password: 'Password', newPassword: 'Nova password',
  recipientName: 'Destinatário', province: 'Província', city: 'Cidade', street: 'Rua', code: 'Código',
  quantity: 'Quantidade', rating: 'Avaliação', comment: 'Comentário', question: 'Pergunta', sku: 'SKU', price: 'Preço',
};

function friendlyMessage(status, code, details) {
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (status === 400 && Array.isArray(details) && details.length) {
    const fields = [...new Set(details.map((d) => String(d.path || '').split('.').pop()).filter(Boolean))];
    const names = fields.map((f) => FIELD_LABELS[f] || f);
    return names.length ? `Verifique: ${names.join(', ')}.` : t('error.400');
  }
  if (status >= 500) return t('error.500');
  return t(`error.${status}`) !== `error.${status}` ? t(`error.${status}`) : t('error.500');
}

function buildUrl(path, query) {
  // Base relativa ('/api/v1', via proxy da Vercel) resolve contra a origem da página.
  const url = new URL(CONFIG.API_BASE_URL.replace(/\/$/, '') + path, location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
      else url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

let refreshing = null;
const listeners = { unauthorized: new Set() };

/** Notificado quando a sessão deixa de ser válida (para limpar o estado do utilizador). */
export function onUnauthorized(fn) {
  listeners.unauthorized.add(fn);
  return () => listeners.unauthorized.delete(fn);
}

async function refreshSession() {
  // Single-flight: vários pedidos a falhar ao mesmo tempo partilham a mesma renovação.
  refreshing ??= fetch(buildUrl('/auth/refresh'), { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

async function request(method, path, { query, body, headers = {}, retry = true, signal, raw = false } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError({ status: 0, code: 'OFFLINE', message: 'offline', friendly: t('state.offline') });
  }
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), CONFIG.REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort(signal.reason));

  let res;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (signal?.aborted) throw err;
    const timeout = controller.signal.reason === 'timeout';
    throw new ApiError({ status: 0, code: timeout ? 'TIMEOUT' : 'NETWORK', message: String(err), friendly: t(timeout ? 'error.timeout' : 'error.network') });
  }
  clearTimeout(timer);

  let payload = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await refreshSession()) return request(method, path, { query, body, headers, retry: false, signal, raw });
    listeners.unauthorized.forEach((fn) => fn());
  }

  if (!res.ok || payload?.success === false) {
    const code = payload?.errorCode;
    const details = payload?.details;
    throw new ApiError({
      status: res.status,
      code,
      details,
      requestId: payload?.requestId ?? res.headers.get('x-request-id'),
      message: payload?.message ?? res.statusText,
      friendly: friendlyMessage(res.status, code, details),
    });
  }
  return raw ? payload : payload?.data ?? payload;
}

/**
 * api.get('/products', { query }) devolve `data`.
 * api.page('/products', { query }) devolve `{ items, meta }` para listagens paginadas.
 */
export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body: body ?? {} }),
  put: (path, body, opts) => request('PUT', path, { ...opts, body: body ?? {} }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body: body ?? {} }),
  delete: (path, opts) => request('DELETE', path, opts),
  async page(path, opts) {
    const payload = await request('GET', path, { ...opts, raw: true });
    return { items: payload.data ?? [], meta: payload.meta ?? {} };
  },
  /** Envia ficheiros (multipart). files: File[]; fields: extra. */
  upload(path, files, { field = 'file', fields = {}, query } = {}) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v != null) fd.append(k, v);
    for (const f of files) fd.append(field, f);
    return request('POST', path, { body: fd, query });
  },
};

/** Gera uma Idempotency-Key estável para uma operação (ex.: abrir o checkout). */
export function newIdempotencyKey() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, '');
}
