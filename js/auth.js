import { api, onUnauthorized } from './api.js';
import { store } from './store.js';
import { root } from './utils.js';

/**
 * Sessão baseada em cookies HTTP-only definidos pelo backend.
 * O frontend NUNCA guarda tokens. Guarda apenas uma marca não sensível ("houve login")
 * para evitar pedir /users/me em todas as páginas a quem nunca entrou.
 */
const HINT = 'es_has_session';
const hint = {
  get: () => {
    try {
      return localStorage.getItem(HINT) === '1';
    } catch {
      return true;
    }
  },
  set: (v) => {
    try {
      v ? localStorage.setItem(HINT, '1') : localStorage.removeItem(HINT);
    } catch {
      /* armazenamento indisponível */
    }
  },
};

function setUser(user) {
  if (user) user.permissions = new Set(user.permissions ?? []);
  store.set('currentUser', user);
  hint.set(Boolean(user));
}

onUnauthorized(() => {
  if (store.get('currentUser')) setUser(null);
  else hint.set(false);
});

let sessionPromise = null;

/** Carrega o utilizador atual (uma vez por página). */
export function loadSession() {
  sessionPromise ??= (async () => {
    if (!hint.get()) {
      store.set('sessionChecked', true);
      return null;
    }
    try {
      setUser(await api.get('/users/me'));
    } catch (err) {
      // Só um 401 significa "sem sessão". Rede/abort/5xx não terminam a sessão:
      // a página continua como visitante e a próxima tenta de novo.
      if (err?.status === 401) setUser(null);
      else store.set('currentUser', null);
    }
    store.set('sessionChecked', true);
    return store.get('currentUser');
  })();
  return sessionPromise;
}

export async function refreshUser() {
  setUser(await api.get('/users/me'));
  return store.get('currentUser');
}

export async function login(email, password) {
  await api.post('/auth/login', { email, password });
  hint.set(true);
  return refreshUser();
}

export async function register({ name, email, phone, password }) {
  await api.post('/auth/register', { name, email, password, ...(phone ? { phone } : {}) });
  hint.set(true);
  return refreshUser();
}

export async function logout({ everywhere = false } = {}) {
  try {
    await api.post(everywhere ? '/auth/logout-all' : '/auth/logout');
  } finally {
    setUser(null);
    location.href = `${root()}index.html`;
  }
}

export const currentUser = () => store.get('currentUser');
export const hasPermission = (p) => Boolean(store.get('currentUser')?.permissions?.has(p));
/** Tem acesso ao painel (qualquer permissão administrativa). */
export const isStaff = () => (store.get('currentUser')?.permissions?.size ?? 0) > 0;

/** Redireciona para o login guardando a página de regresso. */
export function redirectToLogin() {
  const file = location.pathname.split('/').pop() || 'index.html';
  const next = encodeURIComponent((location.pathname.includes('/admin/') ? 'admin/' : '') + file + location.search);
  location.href = `${root()}login.html?next=${next}`;
}

export async function requireAuth() {
  const user = await loadSession();
  if (!user) {
    redirectToLogin();
    return new Promise(() => {}); // a página não continua
  }
  return user;
}

/** Só permite caminhos internos no "next" (evita open redirect). */
export function safeNext(next, fallback = 'index.html') {
  if (!next || /^([a-z]+:)?\/\//i.test(next) || next.startsWith('/') || next.includes('..')) return fallback;
  return next;
}
