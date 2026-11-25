import { api } from '../api.js';
import { flattenCategories } from '../products.js';

/** Opções partilhadas pelos formulários do painel (carregadas uma vez). */
let catCache;
let brandCache;

export async function categoryOptions() {
  catCache ??= api.get('/admin/categories/tree').then((tree) => flattenCategories(tree).map((c) => [c.id, `${'— '.repeat(c.depth)}${c.name}${c.status === 'INACTIVE' ? ' (inativa)' : ''}`]));
  return catCache;
}

export async function brandOptions() {
  brandCache ??= api.get('/admin/brands').then((b) => b.map((x) => [x.id, x.name]));
  return brandCache;
}

export function resetOptionCache() {
  catCache = undefined;
  brandCache = undefined;
}

/** Pesquisa de produtos para seletores (promoções, cupões, banners). */
export async function productOptions() {
  const { items } = await api.page('/admin/products', { query: { limit: 100 } });
  return items.map((p) => [p.id, `${p.name} (${p.sku})`]);
}
