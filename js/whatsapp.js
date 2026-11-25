import { api } from './api.js';
import { CONFIG } from './config.js';
import { store } from './store.js';
import { toast } from './ui.js';

/**
 * WhatsApp: número, mensagens e horário vêm do backend (GET /whatsapp/config).
 * O link contextual (produto/carrinho/checkout) é gerado pelo backend em POST /whatsapp/link,
 * que também regista o clique para as estatísticas.
 */
export async function loadWhatsAppConfig() {
  if (store.get('whatsapp')) return store.get('whatsapp');
  let cfg;
  try {
    cfg = await api.get('/whatsapp/config');
  } catch {
    cfg = CONFIG.WHATSAPP_NUMBER ? { enabled: true, buttonText: 'Falar pelo WhatsApp', link: `https://wa.me/${CONFIG.WHATSAPP_NUMBER}`, fallback: true } : { enabled: false };
  }
  store.set('whatsapp', cfg);
  return cfg;
}

/**
 * Abre a conversa. A janela é aberta de imediato (gesto do utilizador) para não ser bloqueada
 * como popup; o URL contextual é preenchido quando a API responde.
 * source: HOMEPAGE | PRODUCT | CART | CHECKOUT | SUPPORT | CONTACT
 */
export async function openWhatsApp(source, { productId, variantId, orderNumber } = {}) {
  const cfg = await loadWhatsAppConfig();
  if (!cfg.enabled) {
    toast('O atendimento por WhatsApp não está disponível de momento.', { type: 'info' });
    return;
  }
  // Sem 'noopener' aqui (devolveria null); o opener é cortado manualmente a seguir.
  const win = window.open('', '_blank');
  if (win) win.opener = null;
  let url = cfg.link;
  if (!cfg.fallback) {
    try {
      url = (await api.post('/whatsapp/link', { source, ...(productId ? { productId } : {}), ...(variantId ? { variantId } : {}), ...(orderNumber ? { orderNumber } : {}) })).url;
    } catch {
      url = cfg.link;
    }
  }
  if (win) win.location.href = url;
  else location.href = url;
}
