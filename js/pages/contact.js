import { icon } from '../icons.js';
import { initPage } from '../layout.js';
import { catalogApi } from '../products.js';
import { setSeo, toast } from '../ui.js';
import { $, html, render } from '../utils.js';
import { loadWhatsAppConfig } from '../whatsapp.js';

await initPage();
setSeo({ title: 'Contactos', description: 'Fale connosco por WhatsApp, telefone ou email.' });

const DAYS = { mon: 'Segunda', tue: 'Terça', wed: 'Quarta', thu: 'Quinta', fri: 'Sexta', sat: 'Sábado', sun: 'Domingo' };

async function info() {
  const [settings, wa] = await Promise.all([catalogApi.settings().catch(() => null), loadWhatsAppConfig()]);
  const store = settings?.store ?? {};
  const hours = wa?.businessHours?.days ?? {};
  render(
    $('#contact-info'),
    html`<ul class="contact-list">
      ${wa?.enabled ? html`<li>${icon('whatsapp', { size: 22 })}<div><strong>WhatsApp</strong><span>${wa.isOpen === false ? 'Fora do horário — respondemos assim que possível.' : 'Resposta rápida durante o horário de atendimento.'}</span><button class="btn btn--whatsapp btn--sm" type="button" data-whatsapp="CONTACT">${icon('whatsapp', { size: 16 })}Falar pelo WhatsApp</button></div></li>` : ''}
      ${store.phone ? html`<li>${icon('phone', { size: 22 })}<div><strong>Telefone</strong><a href="tel:${store.phone}">${store.phone}</a></div></li>` : ''}
      ${store.email ? html`<li>${icon('mail', { size: 22 })}<div><strong>Email</strong><a href="mailto:${store.email}">${store.email}</a></div></li>` : ''}
      ${store.address ? html`<li>${icon('pin', { size: 22 })}<div><strong>Endereço</strong><span>${store.address}</span></div></li>` : ''}
      ${Object.keys(hours).length
        ? html`<li>${icon('clock', { size: 22 })}<div><strong>Horário</strong><dl class="kv kv--hours">${Object.entries(DAYS).map(([k, l]) => html`<dt>${l}</dt><dd>${hours[k] ? `${hours[k][0]} – ${hours[k][1]}` : 'Fechado'}</dd>`)}</dl></div></li>`
        : ''}
    </ul>`,
  );
}

$('#contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const wa = await loadWhatsAppConfig();
  const text = `Olá! Sou ${f.name.trim()}.${f.subject ? ` Assunto: ${f.subject}.` : ''}\n\n${f.message.trim()}`;
  if (wa?.enabled && wa.link) {
    // O número oficial vem do backend; só o texto escrito pelo cliente é acrescentado.
    const win = window.open(`${wa.link.split('?')[0]}?text=${encodeURIComponent(text)}`, '_blank');
    if (win) win.opener = null;
    toast('Abrimos o WhatsApp com a sua mensagem. Basta enviar.', { type: 'info' });
    e.target.reset();
    return;
  }
  const settings = await catalogApi.settings().catch(() => null);
  if (settings?.store?.email) {
    location.href = `mailto:${settings.store.email}?subject=${encodeURIComponent(f.subject || 'Contacto pelo site')}&body=${encodeURIComponent(text)}`;
    return;
  }
  toast('De momento não há canal de contacto disponível. Tente mais tarde.', { type: 'error' });
});

info();
