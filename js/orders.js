import { api } from './api.js';

export const ordersApi = {
  shippingMethods: (addressId) => api.get('/shipping/methods', { query: { addressId } }),
  paymentMethods: () => api.get('/payments/methods'),
  quote: (body) => api.post('/checkout/quote', body),
  place: (body, idempotencyKey) => api.post('/orders', body, { headers: { 'Idempotency-Key': idempotencyKey } }),
  list: (query) => api.page('/orders', { query }),
  get: (id) => api.get(`/orders/${id}`),
  cancel: (id, reason) => api.post(`/orders/${id}/cancel`, { reason }),
  retryPayment: (id, paymentMethodCode, idempotencyKey) => api.post(`/orders/${id}/payments`, paymentMethodCode ? { paymentMethodCode } : {}, { headers: { 'Idempotency-Key': idempotencyKey } }),
  requestReturn: (id, body) => api.post(`/orders/${id}/returns`, body),
  returns: (query) => api.page('/returns', { query }),
  cancelReturn: (id) => api.post(`/returns/${id}/cancel`),
  uploadEvidence: (files) => api.upload('/returns/evidence', files),
};

/** Etapas mostradas na timeline do pedido (ordem do fluxo normal). */
export const ORDER_FLOW = ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
