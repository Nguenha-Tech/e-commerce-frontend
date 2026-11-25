import { initPage } from '../layout.js';
import { catalogApi } from '../products.js';
import { setSeo } from '../ui.js';
import { $, html, render } from '../utils.js';

await initPage();
setSeo({ title: 'Ajuda e políticas', description: 'Entregas, devoluções, pagamentos, privacidade e termos.' });

// Dados reais da loja (prazo e motivos de devolução) vindos do backend.
try {
  const s = await catalogApi.settings();
  render($('#returns-window'), html`${s.returns.windowDays} dias`);
  render($('#returns-reasons'), html`${s.returns.reasons.map((r) => html`<li>${r}</li>`)}`);
  if (s.store.name) document.querySelectorAll('[data-store-name]').forEach((el) => (el.textContent = s.store.name));
} catch {
  /* mantém o texto genérico */
}
