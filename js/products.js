import { api } from './api.js';
import { store } from './store.js';

export const productsApi = {
  list: (query) => api.page('/products', { query }),
  facets: (query) => api.get('/products/filters', { query }),
  featured: (limit = 8) => api.get('/products/featured', { query: { limit } }),
  bestSellers: (limit = 8) => api.page('/products/best-sellers', { query: { limit } }),
  onSale: (limit = 8) => api.page('/products/on-sale', { query: { limit } }),
  byId: (id) => api.get(`/products/${id}`),
  bySlug: (slug) => api.get(`/products/slug/${encodeURIComponent(slug)}`),
  related: (id, type = 'SIMILAR', limit = 8) => api.get(`/products/${id}/related`, { query: { type, limit } }),
  suggestions: (search) => api.page('/products', { query: { search, limit: 6 } }),
};

export const catalogApi = {
  /** Árvore de categorias (cache por página). */
  async categories() {
    if (store.get('categories')) return store.get('categories');
    const tree = await api.get('/categories');
    store.set('categories', tree);
    return tree;
  },
  category: (slug) => api.get(`/categories/${encodeURIComponent(slug)}`),
  brands: () => api.get('/brands'),
  promotions: (kind) => api.get('/promotions', { query: { kind } }),
  promotion: (slug, query) => api.page(`/promotions/${encodeURIComponent(slug)}`, { query }),
  banners: (placement = 'HOMEPAGE', categoryId) => api.get('/banners', { query: { placement, categoryId } }),
  settings: () => api.get('/store/settings'),
};

/** Achata a árvore: as categorias "de navegação" são os filhos da raiz única (ex.: Eletrónicos). */
export function topCategories(tree) {
  if (tree.length === 1 && tree[0].children?.length) return tree[0].children;
  return tree;
}

export function flattenCategories(tree, depth = 0, out = []) {
  for (const c of tree) {
    out.push({ ...c, depth });
    if (c.children?.length) flattenCategories(c.children, depth + 1, out);
  }
  return out;
}
