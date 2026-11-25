/**
 * Configuração central do frontend. É o ÚNICO sítio com URLs e dados da loja.
 * Em produção, altere API_BASE_URL (ou defina window.__ELECTRO_CONFIG__ antes de carregar os scripts).
 */
const overrides = (typeof window !== 'undefined' && window.__ELECTRO_CONFIG__) || {};

export const CONFIG = Object.freeze({
  // Backend publicado na Vercel. Para usar o backend local: 'http://localhost:3333/api/v1'
  API_BASE_URL: 'https://shopping-khaki-chi.vercel.app/api/v1',
  STORE_NAME: 'Electro Shop',
  STORE_CURRENCY: 'MZN',
  STORE_LOCALE: 'pt-MZ',
  /**
   * O número oficial vem do backend (GET /whatsapp/config). Este valor só é usado
   * se o backend não responder e estiver preenchido (ex.: '258841234567').
   */
  WHATSAPP_NUMBER: null,
  PAGE_SIZE: 12,
  SEARCH_DEBOUNCE_MS: 250,
  REQUEST_TIMEOUT_MS: 15000,
  ...overrides,
});
