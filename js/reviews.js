import { api } from './api.js';

export const reviewsApi = {
  list: (productId, query) => api.page(`/products/${productId}/reviews`, { query }),
  create: (productId, body) => api.post(`/products/${productId}/reviews`, body),
  eligible: () => api.get('/reviews/eligible'),
  mine: (query) => api.page('/reviews/me', { query }),
  update: (id, body) => api.patch(`/reviews/${id}`, body),
  remove: (id) => api.delete(`/reviews/${id}`),
  report: (id, reason) => api.post(`/reviews/${id}/report`, { reason }),
  uploadImages: (files) => api.upload('/reviews/images', files),
  questions: (productId, query) => api.page(`/products/${productId}/questions`, { query }),
  ask: (productId, question) => api.post(`/products/${productId}/questions`, { question }),
};
