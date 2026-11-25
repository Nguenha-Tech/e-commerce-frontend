/**
 * Estado global mínimo e observável: utilizador, contadores do carrinho, favoritos e notificações.
 * Os dados de negócio (preços, stock) vêm sempre da API — aqui só fica o que a interface partilha.
 */
const state = {
  currentUser: null,
  sessionChecked: false,
  cartCount: 0,
  wishlistIds: new Set(),
  unreadNotifications: 0,
  whatsapp: null,
  categories: null,
};

const subscribers = new Map();

export const store = {
  get(key) {
    return state[key];
  },
  set(key, value) {
    state[key] = value;
    (subscribers.get(key) ?? []).forEach((fn) => fn(value));
  },
  /** Chama fn imediatamente e sempre que `key` muda. Devolve função para cancelar. */
  subscribe(key, fn) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key).add(fn);
    fn(state[key]);
    return () => subscribers.get(key).delete(fn);
  },
};
