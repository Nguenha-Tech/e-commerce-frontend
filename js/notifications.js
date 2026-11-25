import { api } from './api.js';
import { currentUser } from './auth.js';
import { store } from './store.js';

export const notificationsApi = {
  list: (query) => api.page('/notifications', { query }),
  unread: () => api.get('/notifications/unread-count'),
  read: (id) => api.post(`/notifications/${id}/read`),
  readAll: () => api.post('/notifications/read-all'),
  remove: (id) => api.delete(`/notifications/${id}`),
};

export async function refreshUnread() {
  if (!currentUser()) return;
  try {
    store.set('unreadNotifications', (await notificationsApi.unread()).unread);
  } catch {
    /* não crítico */
  }
}

/** Link interno a partir dos dados da notificação. */
export function notificationLink(n) {
  if (n.data?.orderId) return `orders.html?id=${n.data.orderId}`;
  if (n.data?.slug) return `product.html?slug=${n.data.slug}`;
  return null;
}
