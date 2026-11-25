import { api } from './api.js';
import { currentUser, redirectToLogin } from './auth.js';
import { t } from './i18n.js';
import { store } from './store.js';
import { toast, toastError } from './ui.js';

export const wishlistApi = {
  list: () => api.get('/wishlist'),
  ids: () => api.get('/wishlist/ids'),
  add: (productId, variantId, notifyWhenAvailable = false) => api.post('/wishlist/items', { productId, ...(variantId ? { variantId } : {}), notifyWhenAvailable }),
  remove: (productId) => api.delete(`/wishlist/items/${productId}`),
  alerts: () => api.get('/wishlist/stock-alerts'),
  subscribeAlert: (variantId) => api.post('/wishlist/stock-alerts', { variantId }),
  unsubscribeAlert: (variantId) => api.delete(`/wishlist/stock-alerts/${variantId}`),
};

export async function loadWishlistIds() {
  if (!currentUser()) return store.set('wishlistIds', new Set());
  try {
    store.set('wishlistIds', new Set(await wishlistApi.ids()));
  } catch {
    store.set('wishlistIds', new Set());
  }
}

/** Alterna favorito e atualiza todos os corações visíveis do mesmo produto. */
export async function toggleWishlist(productId, variantId) {
  if (!currentUser()) {
    toast('Entre na sua conta para guardar favoritos.', { type: 'info' });
    setTimeout(redirectToLogin, 900);
    return;
  }
  const ids = new Set(store.get('wishlistIds'));
  const adding = !ids.has(productId);
  try {
    if (adding) await wishlistApi.add(productId, variantId);
    else await wishlistApi.remove(productId);
    adding ? ids.add(productId) : ids.delete(productId);
    store.set('wishlistIds', ids);
    toast(adding ? t('wishlist.added') : t('wishlist.removed'));
  } catch (err) {
    toastError(err);
  }
  return adding;
}

/** Sincroniza o estado visual dos botões de favorito. */
export function syncHearts(rootEl = document) {
  const ids = store.get('wishlistIds');
  rootEl.querySelectorAll('[data-action="toggle-wishlist"]').forEach((b) => {
    const on = ids.has(b.dataset.product);
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}
