import { api } from './api.js';
import { t } from './i18n.js';
import { store } from './store.js';
import { toast, toastError } from './ui.js';

/**
 * Carrinho — funciona para visitantes (cookie de carrinho do backend) e clientes.
 * Os totais vêm SEMPRE do backend; o frontend nunca calcula preços.
 */
export const cartApi = {
  get: (query) => api.get('/cart', { query }),
  add: (variantId, quantity = 1) => api.post('/cart/items', { variantId, quantity }),
  update: (itemId, quantity) => api.patch(`/cart/items/${itemId}`, { quantity }),
  remove: (itemId) => api.delete(`/cart/items/${itemId}`),
  clear: () => api.delete('/cart'),
  applyCoupon: (code) => api.post('/cart/coupon', { code }),
  removeCoupon: () => api.delete('/cart/coupon'),
};

export function setCartFrom(cart) {
  store.set('cartCount', cart?.totals?.itemsCount ?? cart?.items?.reduce((s, i) => s + i.quantity, 0) ?? 0);
  return cart;
}

export async function refreshCartCount() {
  try {
    setCartFrom(await cartApi.get());
  } catch {
    /* contador não é crítico */
  }
}

export async function addToCart(variantId, quantity = 1, { silent = false } = {}) {
  try {
    const cart = setCartFrom(await cartApi.add(variantId, quantity));
    if (!silent) toast(t('product.addedToCart'));
    return cart;
  } catch (err) {
    toastError(err);
    throw err;
  }
}

/** Adição rápida a partir de um cartão: usa a variante por omissão devolvida pela API. */
export async function quickAdd(productId) {
  const product = await api.get(`/products/${productId}`);
  const variant = product.variants.find((v) => v.isDefault && v.stock.maxPurchasable > 0) ?? product.variants.find((v) => v.stock.maxPurchasable > 0);
  if (!variant) {
    toast(t('product.outOfStock'), { type: 'error' });
    return null;
  }
  return addToCart(variant.id, 1);
}

// "Guardar para depois": lista local de variantes (só preferência do visitante, não dados de negócio).
const SAVED = 'es_saved_for_later';
export const savedForLater = {
  list() {
    try {
      return JSON.parse(localStorage.getItem(SAVED) || '[]');
    } catch {
      return [];
    }
  },
  save(item) {
    const list = this.list().filter((x) => x.variantId !== item.variantId);
    list.unshift({ variantId: item.variantId, productId: item.productId, name: item.name, slug: item.slug, image: item.image, variantName: item.variantName });
    try {
      localStorage.setItem(SAVED, JSON.stringify(list.slice(0, 30)));
    } catch {
      /* ignore */
    }
  },
  remove(variantId) {
    try {
      localStorage.setItem(SAVED, JSON.stringify(this.list().filter((x) => x.variantId !== variantId)));
    } catch {
      /* ignore */
    }
  },
};
