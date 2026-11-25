import { PROVINCES } from '../addresses.js';
import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { icon } from '../icons.js';
import { busy, confirmDialog, showError, toast } from '../ui.js';
import { $, $$, formatDate, formatDateTime, formatMoney, formatNumber, html, params, PAYMENT_TYPES, render, setParams } from '../utils.js';
import { chart, fillBuckets, bucketLabel } from './charts.js';
import { enhanceForm, fieldsHtml, formModal, markApiErrors, readFields } from './forms.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const TABS = [
  { key: 'store', label: 'Loja', perm: 'settings:manage' },
  { key: 'whatsapp', label: 'WhatsApp', perm: 'whatsapp:manage' },
  { key: 'shipping', label: 'Entregas', perm: 'shipping_methods:manage' },
  { key: 'payments', label: 'Pagamentos', perm: 'payment_methods:manage' },
  { key: 'rules', label: 'Regras', perm: 'settings:manage' },
  { key: 'team', label: 'Equipa', perm: 'admins:manage' },
];
const main = await initAdmin({ title: 'Configurações', anyOf: TABS.map((t) => t.perm) });
const tabs = TABS.filter((t) => hasPermission(t.perm));

render(main, html`<div class="tabs" role="tablist">${tabs.map((t) => html`<button class="tab" role="tab" type="button" data-tab="${t.key}">${t.label}</button>`)}</div><div id="tab-body"></div>`);
const body = $('#tab-body', main);

function showTab(key) {
  $$('[data-tab]', main).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === key)));
  setParams({ tab: key }, { replace: true });
  body.replaceChildren();
  body.onclick = null;
  body.onsubmit = null;
  RENDER[key]();
}
main.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) showTab(t.dataset.tab);
});

const loading = () => render(body, html`<div class="panel"><div class="sk sk--line"></div><div class="sk sk--line"></div><div class="sk sk--line"></div></div>`);

/** Formulário embutido na página (mesmos campos/validação do formModal). */
function inlineForm(el, { title, intro, fields, values, submitLabel = 'Guardar alterações', prefix, onSubmit }) {
  const form = document.createElement('form');
  form.className = 'panel';
  form.noValidate = true;
  form.style.marginBottom = '16px';
  render(form, html`${title ? html`<h2 class="panel__title">${title}</h2>` : ''}${intro ?? ''}<div class="form-error" role="alert"></div>${fieldsHtml(fields, values, prefix)}<div style="margin-top:12px"><button class="btn btn--primary" type="submit">${submitLabel}</button></div>`);
  enhanceForm(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const { values: v, errors } = readFields(form, fields, { mode: 'edit', prefix });
    if (errors.length) return render($('.form-error', form), errors.join(' · '));
    busy(e.submitter, async () => {
      try {
        render($('.form-error', form), '');
        await onSubmit(v);
        toast('Alterações guardadas.');
      } catch (err) {
        markApiErrors(form, err, prefix);
      }
    });
  });
  el.appendChild(form);
  return form;
}

const RENDER = {
  // ------------------------------------------------------------------ loja
  async store() {
    loading();
    try {
      const s = await api.get('/admin/settings/store');
      body.replaceChildren();
      inlineForm(body, {
        title: 'Dados da loja',
        intro: html`<p class="muted">Aparecem no rodapé, nos emails e nas faturas.</p>`,
        prefix: 'st',
        values: s,
        fields: [
          { name: 'name', label: 'Nome da loja', required: true, maxLength: 80 },
          { name: 'legalName', label: 'Nome legal', maxLength: 120, nullable: true },
          { name: 'taxId', label: 'NUIT', maxLength: 30, nullable: true },
          { name: 'email', label: 'Email de contacto', type: 'email', nullable: true },
          { name: 'phone', label: 'Telefone', maxLength: 20, nullable: true },
          { name: 'address', label: 'Morada', type: 'textarea', rows: 2, nullable: true },
          { name: 'logoUrl', label: 'Logótipo', type: 'image', folder: 'store', nullable: true },
        ],
        onSubmit: (v) => api.patch('/admin/settings/store', v),
      });
    } catch (err) {
      showError(body, err, RENDER.store);
    }
  },

  // ------------------------------------------------------------------ regras
  async rules() {
    loading();
    try {
      const s = await api.get('/admin/settings');
      body.replaceChildren();
      inlineForm(body, {
        title: 'Devoluções',
        prefix: 'rt',
        values: { ...s.returns, reasons: s.returns.reasons.join('\n') },
        fields: [
          { name: 'enabled', label: 'Aceitar pedidos de devolução', type: 'checkbox' },
          { name: 'windowDays', label: 'Prazo (dias após a entrega)', type: 'number', min: 0, max: 365, required: true },
          { name: 'reasons', label: 'Motivos disponíveis (um por linha)', type: 'textarea', rows: 5, required: true },
        ],
        onSubmit: (v) => api.patch('/admin/settings/returns', { ...v, reasons: v.reasons.split('\n').map((x) => x.trim()).filter(Boolean) }),
      });
      inlineForm(body, {
        title: 'Avaliações',
        prefix: 'rv',
        values: s.reviews,
        fields: [
          { name: 'requireApproval', label: 'Aprovar avaliações antes de publicar', type: 'checkbox' },
          { name: 'allowPhotos', label: 'Permitir fotografias', type: 'checkbox' },
          { name: 'maxPhotos', label: 'Máximo de fotografias', type: 'number', min: 0, max: 10, required: true },
        ],
        onSubmit: (v) => api.patch('/admin/settings/reviews', v),
      });
      inlineForm(body, {
        title: 'Perguntas sobre produtos',
        prefix: 'qs',
        values: s.questions,
        fields: [{ name: 'requireApproval', label: 'Só publicar perguntas depois de respondidas', type: 'checkbox' }],
        onSubmit: (v) => api.patch('/admin/settings/questions', v),
      });
    } catch (err) {
      showError(body, err, RENDER.rules);
    }
  },

  // ------------------------------------------------------------------ WhatsApp
  async whatsapp() {
    loading();
    try {
      const w = await api.get('/admin/whatsapp');
      drawWhatsApp(w);
    } catch (err) {
      // Sem configuração ainda: formulário vazio para criar.
      if (err.status === 404) drawWhatsApp(null);
      else showError(body, err, RENDER.whatsapp);
    }
  },

  // ------------------------------------------------------------------ entregas
  async shipping() {
    loading();
    try {
      const methods = await api.get('/admin/shipping-methods');
      drawShipping(methods);
    } catch (err) {
      showError(body, err, RENDER.shipping);
    }
  },

  // ------------------------------------------------------------------ pagamentos
  async payments() {
    loading();
    try {
      const data = await api.get('/admin/payment-methods');
      drawPayments(data);
    } catch (err) {
      showError(body, err, RENDER.payments);
    }
  },

  // ------------------------------------------------------------------ equipa
  async team() {
    drawTeam();
  },
};

// =================================================================== WhatsApp
const SOURCES = { HOMEPAGE: 'Página inicial', PRODUCT: 'Página de produto', CART: 'Carrinho', CHECKOUT: 'Checkout', SUPPORT: 'Ajuda / suporte', CONTACT: 'Contactos' };
const DAYS = [['mon', 'Segunda'], ['tue', 'Terça'], ['wed', 'Quarta'], ['thu', 'Quinta'], ['fri', 'Sexta'], ['sat', 'Sábado'], ['sun', 'Domingo']];
const POSITIONS = [['bottom-right', 'Canto inferior direito'], ['bottom-left', 'Canto inferior esquerdo'], ['inline', 'Só nos botões das páginas']];

function altRow(a = {}, i = Date.now()) {
  return html`<div class="alt-row" data-alt>
    <div class="field"><label for="alt-l-${i}">Nome</label><input class="input" id="alt-l-${i}" data-k="label" value="${a.label ?? ''}" placeholder="Ex.: Vendas Beira" maxlength="40"></div>
    <div class="field"><label for="alt-c-${i}">Indicativo</label><input class="input" id="alt-c-${i}" data-k="countryCode" value="${a.countryCode ?? '258'}" inputmode="numeric" maxlength="4"></div>
    <div class="field"><label for="alt-p-${i}">Número</label><input class="input" id="alt-p-${i}" data-k="phoneNumber" value="${a.phoneNumber ?? ''}" inputmode="numeric" maxlength="12"></div>
    <button class="icon-btn" type="button" data-alt-remove aria-label="Remover número">${icon('trash', { size: 18 })}</button>
  </div>`;
}

function drawWhatsApp(w) {
  const v = w ?? { isEnabled: false, countryCode: '258', phoneNumber: '', alternativeNumbers: [], defaultMessage: '', contextMessages: {}, businessHours: { timezone: 'Africa/Maputo', days: {} }, buttonText: 'Falar pelo WhatsApp', buttonPosition: 'bottom-right' };
  const hours = v.businessHours?.days ?? {};
  render(
    body,
    html`<form id="wa-form" class="panel" novalidate style="margin-bottom:16px">
      <h2 class="panel__title">Número oficial</h2>
      <p class="muted">Este é o único número usado em toda a loja (botão flutuante, produto, carrinho, checkout e contactos). O link é gerado pelo servidor.</p>
      <div class="form-error" role="alert"></div>
      <div class="form-grid form-grid--2">
        <div class="field field--check field--full"><label class="check"><input type="checkbox" name="isEnabled" ${v.isEnabled ? html`checked` : ''}>Mostrar o WhatsApp na loja</label></div>
        <div class="field"><label for="wa-cc">Indicativo do país</label><div class="input-affix input-affix--pre"><span>+</span><input class="input" id="wa-cc" name="countryCode" value="${v.countryCode}" inputmode="numeric" required maxlength="4"></div></div>
        <div class="field"><label for="wa-phone">Número (sem indicativo)</label><input class="input" id="wa-phone" name="phoneNumber" value="${v.phoneNumber}" inputmode="numeric" required maxlength="12" placeholder="841234567"></div>
        <div class="field"><label for="wa-btn">Texto do botão</label><input class="input" id="wa-btn" name="buttonText" value="${v.buttonText}" required maxlength="60"></div>
        <div class="field"><label for="wa-pos">Posição do botão</label><select class="select" id="wa-pos" name="buttonPosition">${POSITIONS.map(([k, l]) => html`<option value="${k}" ${v.buttonPosition === k ? html`selected` : ''}>${l}</option>`)}</select></div>
      </div>
      ${w?.preview ? html`<p style="margin-top:8px"><a class="btn btn--whatsapp btn--sm" href="${w.preview}" target="_blank" rel="noopener">${icon('whatsapp', { size: 16 })}Testar link</a></p>` : ''}

      <h2 class="panel__title" style="margin-top:20px">Mensagens</h2>
      <p class="muted">Pode usar os marcadores {productName}, {sku}, {variant}, {price}, {url} e {orderNumber}. Sem marcadores, os dados do produto são acrescentados automaticamente.</p>
      <div class="form-grid form-grid--2">
        <div class="field field--full"><label for="wa-def">Mensagem por omissão</label><textarea class="textarea" id="wa-def" name="defaultMessage" rows="2" required minlength="5" maxlength="500">${v.defaultMessage}</textarea></div>
        ${Object.entries(SOURCES).map(([k, l]) => html`<div class="field"><label for="wa-ctx-${k}">${l}</label><textarea class="textarea" id="wa-ctx-${k}" data-ctx="${k}" rows="3" maxlength="500" placeholder="Usa a mensagem por omissão">${v.contextMessages?.[k] ?? ''}</textarea></div>`)}
        <div class="field"><label for="wa-wel">Mensagem de boas-vindas (opcional)</label><textarea class="textarea" id="wa-wel" name="welcomeMessage" rows="2" maxlength="500">${v.welcomeMessage ?? ''}</textarea></div>
        <div class="field"><label for="wa-away">Mensagem fora de horas (opcional)</label><textarea class="textarea" id="wa-away" name="awayMessage" rows="2" maxlength="500">${v.awayMessage ?? ''}</textarea></div>
      </div>

      <h2 class="panel__title" style="margin-top:20px">Horário de atendimento</h2>
      <div class="field" style="max-width:280px"><label for="wa-tz">Fuso horário</label><input class="input" id="wa-tz" name="timezone" value="${v.businessHours?.timezone ?? 'Africa/Maputo'}"></div>
      <div class="hours-grid">${DAYS.map(([k, l]) => {
        const slot = hours[k];
        return html`<div class="hours-row" data-day="${k}"><span class="hours-row__day">${l}</span>
          <label class="check"><input type="checkbox" data-open ${slot ? html`checked` : ''}>Aberto</label>
          <input class="input" type="time" data-from aria-label="${l}: abre às" value="${slot?.[0] ?? '08:00'}" ${slot ? '' : html`disabled`}>
          <input class="input" type="time" data-to aria-label="${l}: fecha às" value="${slot?.[1] ?? '18:00'}" ${slot ? '' : html`disabled`}></div>`;
      })}</div>

      <h2 class="panel__title" style="margin-top:20px">Números alternativos</h2>
      <p class="muted">Opcional, até 5 (ex.: outras lojas). O número oficial continua a ser o principal.</p>
      <div id="alt-list">${(v.alternativeNumbers ?? []).map((a, i) => altRow(a, i))}</div>
      <button class="btn btn--sm" type="button" data-alt-add>${icon('plus', { size: 16 })}Adicionar número</button>

      <div class="sticky-actions"><button class="btn btn--primary" type="submit">Guardar WhatsApp</button></div>
    </form>
    <section class="panel" id="wa-analytics"></section>`,
  );
  const form = $('#wa-form', body);
  form.addEventListener('change', (e) => {
    if (e.target.matches('[data-open]')) $$('input[type=time]', e.target.closest('.hours-row')).forEach((i) => (i.disabled = !e.target.checked));
  });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-alt-add]') && $$('[data-alt]', form).length < 5) $('#alt-list', form).insertAdjacentHTML('beforeend', String(altRow()));
    if (e.target.closest('[data-alt-remove]')) e.target.closest('[data-alt]').remove();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const f = form.elements;
    const contextMessages = {};
    $$('[data-ctx]', form).forEach((t) => t.value.trim() && (contextMessages[t.dataset.ctx] = t.value.trim()));
    const days = {};
    $$('.hours-row', form).forEach((r) => {
      if ($('[data-open]', r).checked) days[r.dataset.day] = [$('[data-from]', r).value, $('[data-to]', r).value];
    });
    const alternativeNumbers = $$('[data-alt]', form)
      .map((r) => Object.fromEntries($$('[data-k]', r).map((i) => [i.dataset.k, i.value.trim()])))
      .filter((a) => a.phoneNumber);
    const payload = {
      isEnabled: f.isEnabled.checked,
      countryCode: f.countryCode.value.trim().replace(/^\+/, ''),
      phoneNumber: f.phoneNumber.value.replace(/\D/g, ''),
      buttonText: f.buttonText.value.trim(),
      buttonPosition: f.buttonPosition.value,
      defaultMessage: f.defaultMessage.value.trim(),
      welcomeMessage: f.welcomeMessage.value.trim() || null,
      awayMessage: f.awayMessage.value.trim() || null,
      contextMessages,
      businessHours: { timezone: f.timezone.value.trim() || 'Africa/Maputo', days },
      alternativeNumbers,
    };
    busy(e.submitter, async () => {
      try {
        const saved = await api.patch('/admin/whatsapp', payload);
        toast('WhatsApp atualizado. A loja usa o novo número em menos de um minuto.');
        drawWhatsApp({ ...saved, preview: saved.preview ?? w?.preview });
      } catch (err) {
        markApiErrors(form, err);
        form.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
  drawWhatsAppAnalytics($('#wa-analytics', body));
}

async function drawWhatsAppAnalytics(el, days = 30) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  render(el, html`<h2 class="panel__title">Contactos pelo WhatsApp</h2><div class="sk sk--line"></div><div class="sk sk--line"></div>`);
  try {
    const a = await api.get('/admin/whatsapp/analytics', { query: { from: from.toISOString(), to: to.toISOString() } });
    render(
      el,
      html`<div class="adm-head"><h2 class="panel__title" style="margin:0">Contactos pelo WhatsApp</h2>
        <select class="select" id="wa-range" aria-label="Período" style="width:auto">${[7, 30, 90].map((d) => html`<option value="${d}" ${d === days ? html`selected` : ''}>Últimos ${d} dias</option>`)}</select></div>
      <div class="kpis"><div class="kpi"><span class="kpi__label">Cliques</span><span class="kpi__value">${formatNumber(a.totalClicks)}</span></div><div class="kpi"><span class="kpi__label">Visitantes únicos</span><span class="kpi__value">${formatNumber(a.uniqueVisitors)}</span></div></div>
      <div id="wa-chart" style="margin-bottom:16px"></div>
      <div class="grid-2">
        <div><h3>Por origem</h3>${a.bySource.length ? html`<ul class="rank">${a.bySource.map((s) => html`<li><span>${SOURCES[s.source] ?? s.source}</span><span>${formatNumber(s.clicks)}</span></li>`)}</ul>` : html`<p class="muted">Sem cliques no período.</p>`}</div>
        <div><h3>Produtos que geram mais contactos</h3>${a.topProducts.length ? html`<ul class="rank">${a.topProducts.map((p) => html`<li><span><a href="../product.html?slug=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">${p.name}</a></span><span>${formatNumber(p.clicks)}</span></li>`)}</ul>` : html`<p class="muted">Sem cliques em produtos.</p>`}</div>
      </div>`,
    );
    const range = { period: 'day', from: a.range.from, to: a.range.to };
    const series = fillBuckets(a.daily.map((d) => ({ bucket: d.day, clicks: d.clicks })), range, ['clicks']);
    chart($('#wa-chart', el), { type: 'bar', title: 'Cliques por dia', data: series.map((s) => ({ label: bucketLabel(s.bucket, 'day'), value: s.clicks })), format: (x) => `${formatNumber(x)} cliques` });
    $('#wa-range', el).addEventListener('change', (e) => drawWhatsAppAnalytics(el, Number(e.target.value)));
  } catch (err) {
    showError(el, err, () => drawWhatsAppAnalytics(el, days));
  }
}

// =================================================================== Entregas
const SHIP_TYPES = [['STANDARD', 'Normal'], ['EXPRESS', 'Expresso'], ['PICKUP', 'Levantamento na loja']];
const methodFields = [
  { name: 'name', label: 'Nome', required: true, maxLength: 120 },
  { name: 'code', label: 'Código', required: true, maxLength: 40, hint: 'Maiúsculas, números e _. Ex.: EXPRESS_MAPUTO' },
  { name: 'type', label: 'Tipo', type: 'select', options: SHIP_TYPES, placeholder: false },
  { name: 'carrier', label: 'Transportadora', maxLength: 80, nullable: true },
  { name: 'basePrice', label: 'Preço base', type: 'money', required: true, hint: 'Usado quando não há tarifa para a região.' },
  { name: 'pricePerKg', label: 'Preço por kg adicional', type: 'money' },
  { name: 'freeShippingThreshold', label: 'Grátis a partir de', type: 'money', nullable: true, hint: 'Vazio = nunca grátis.' },
  { name: 'sortOrder', label: 'Ordem', type: 'number', min: 0, max: 1000 },
  { name: 'estimatedDaysMin', label: 'Prazo mínimo (dias)', type: 'number', min: 0, max: 90 },
  { name: 'estimatedDaysMax', label: 'Prazo máximo (dias)', type: 'number', min: 0, max: 90 },
  { name: 'isActive', label: 'Ativo no checkout', type: 'checkbox' },
  { name: 'description', label: 'Descrição', type: 'textarea', rows: 2, nullable: true },
];
const rateFields = [
  { name: 'country', label: 'País', required: true, maxLength: 80 },
  { name: 'province', label: 'Província', type: 'select', options: PROVINCES.map((p) => [p, p]), emptyLabel: 'Todas as províncias', nullable: true },
  { name: 'city', label: 'Cidade', maxLength: 80, nullable: true, hint: 'Vazio = toda a província.' },
  { name: 'price', label: 'Preço', type: 'money', required: true },
  { name: 'estimatedDaysMin', label: 'Prazo mínimo (dias)', type: 'number', min: 0, max: 90, nullable: true },
  { name: 'estimatedDaysMax', label: 'Prazo máximo (dias)', type: 'number', min: 0, max: 90, nullable: true },
  { name: 'isActive', label: 'Ativa', type: 'checkbox' },
];
const days = (a, b) => (a === null || a === undefined ? '—' : a === b ? `${a} dias` : `${a}–${b} dias`);

function drawShipping(methods) {
  render(
    body,
    html`<div class="adm-head"><p>A tarifa mais específica (cidade → província → país) ganha. O valor final é sempre calculado pelo servidor.</p>
      <button class="btn btn--primary" type="button" data-new-method>${icon('plus', { size: 18 })}Novo método</button></div>
    ${methods.length
      ? methods.map(
          (m) => html`<section class="panel" style="margin-bottom:16px">
          <div class="adm-head" style="margin-bottom:8px"><div><h2 class="panel__title" style="margin:0">${m.name} ${m.isActive ? '' : html`<span class="badge badge--neutral">Inativo</span>`}</h2>
            <small class="muted">${m.code} · ${SHIP_TYPES.find(([k]) => k === m.type)?.[1]}${m.carrier ? ` · ${m.carrier}` : ''} · base ${formatMoney(m.basePrice)} · ${days(m.estimatedDaysMin, m.estimatedDaysMax)}${m.freeShippingThreshold !== null ? ` · grátis acima de ${formatMoney(m.freeShippingThreshold)}` : ''}</small></div>
            <div class="dt__row-actions"><button class="btn btn--sm" type="button" data-add-rate="${m.id}">${icon('plus', { size: 16 })}Tarifa</button><button class="btn btn--sm btn--ghost" type="button" data-edit-method="${m.id}">Editar</button></div></div>
          ${m.rates.length
            ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Região</th><th class="num">Preço</th><th>Prazo</th><th>Estado</th><th></th></tr></thead><tbody>${m.rates.map(
                (r) => html`<tr><td>${[r.city, r.province, r.country].filter(Boolean).join(', ')}</td><td class="num">${formatMoney(r.price)}</td><td>${days(r.estimatedDaysMin ?? m.estimatedDaysMin, r.estimatedDaysMax ?? m.estimatedDaysMax)}</td><td>${r.isActive ? html`<span class="badge badge--ok">Ativa</span>` : html`<span class="badge badge--neutral">Inativa</span>`}</td>
                <td><div class="dt__row-actions"><button class="btn btn--sm btn--ghost" type="button" data-edit-rate="${r.id}" data-method="${m.id}">Editar</button><button class="btn btn--sm btn--ghost dt__danger" type="button" data-del-rate="${r.id}">Remover</button></div></td></tr>`,
              )}</tbody></table></div>`
            : html`<p class="muted">Sem tarifas regionais: aplica-se o preço base em todo o país.</p>`}
        </section>`,
        )
      : html`<div class="panel"><p class="state__title">Ainda não há métodos de entrega.</p><p class="muted">Sem métodos ativos, os clientes não conseguem finalizar compras.</p></div>`}`,
  );
  const byId = (id) => methods.find((m) => m.id === id);
  body.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    let ok;
    if (b.dataset.newMethod !== undefined) ok = await formModal({ title: 'Novo método de entrega', fields: methodFields, values: { type: 'STANDARD', isActive: true, pricePerKg: 0, sortOrder: methods.length, estimatedDaysMin: 1, estimatedDaysMax: 3 }, submitLabel: 'Criar método', onSubmit: (v) => api.post('/admin/shipping-methods', v) });
    if (b.dataset.editMethod) {
      const m = byId(b.dataset.editMethod);
      ok = await formModal({ title: `Editar ${m.name}`, fields: methodFields, values: m, mode: 'edit', onSubmit: (v) => api.patch(`/admin/shipping-methods/${m.id}`, v) });
    }
    if (b.dataset.addRate) ok = await formModal({ title: `Nova tarifa — ${byId(b.dataset.addRate).name}`, fields: rateFields, values: { country: 'Moçambique', isActive: true }, submitLabel: 'Adicionar tarifa', onSubmit: (v) => api.post(`/admin/shipping-methods/${b.dataset.addRate}/rates`, v) });
    if (b.dataset.editRate) {
      const r = byId(b.dataset.method).rates.find((x) => x.id === b.dataset.editRate);
      ok = await formModal({ title: 'Editar tarifa', fields: rateFields, values: r, mode: 'edit', onSubmit: (v) => api.patch(`/admin/shipping-rates/${r.id}`, v) });
    }
    if (b.dataset.delRate && (await confirmDialog('Remover esta tarifa? A região passa a usar a tarifa mais geral (ou o preço base).', { title: 'Remover tarifa', confirmLabel: 'Remover', danger: true }))) {
      try {
        await api.delete(`/admin/shipping-rates/${b.dataset.delRate}`);
        ok = true;
      } catch (err) {
        toast(err.friendly, { type: 'error' });
      }
    }
    if (ok) (toast('Entregas atualizadas.'), RENDER.shipping());
  };
}

// =================================================================== Pagamentos
/** Configuração pública (ex.: NIB). Segredos nunca: o backend recusa chaves como secret/token/apiKey. */
const configToText = (c) => Object.entries(c ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
function textToConfig(t) {
  const lines = String(t ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  return Object.fromEntries(lines.map((l) => {
    const i = l.indexOf(':');
    if (i < 1) throw Object.assign(new Error('config'), { friendly: `Linha inválida na configuração: “${l}”. Use chave: valor.` });
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
}

function drawPayments({ methods, providers }) {
  const fields = [
    { name: 'name', label: 'Nome mostrado ao cliente', required: true, maxLength: 80 },
    { name: 'code', label: 'Código', required: true, maxLength: 40, hint: 'Ex.: MPESA, BANK_TRANSFER' },
    { name: 'type', label: 'Tipo', type: 'select', options: Object.entries(PAYMENT_TYPES), placeholder: false },
    { name: 'provider', label: 'Processador', type: 'select', options: providers.map((p) => [p.code, `${p.code}${p.supportsWebhooks ? ' (automático)' : ' (confirmação manual)'}`]), placeholder: false },
    { name: 'sortOrder', label: 'Ordem', type: 'number', min: 0, max: 1000 },
    { name: 'isActive', label: 'Ativo no checkout', type: 'checkbox' },
    { name: 'instructions', label: 'Instruções para o cliente', type: 'textarea', rows: 3, nullable: true },
    { name: 'configText', label: 'Dados públicos (um por linha, chave: valor)', type: 'textarea', rows: 3, full: true, hint: 'Ex.: bank: BCI / nib: 0008 0000 ... Nunca coloque chaves secretas ou tokens: ficam nas variáveis de ambiente do servidor.' },
  ];
  const submit = (fn) => async (v) => {
    const { configText, ...rest } = v;
    return fn({ ...rest, config: textToConfig(configText) });
  };
  render(
    body,
    html`<div class="adm-head"><p>Pagamentos “manual” e “cod” são confirmados pela equipa em Pedidos. Credenciais de gateways ficam no servidor, nunca aqui.</p>
      <button class="btn btn--primary" type="button" data-new-pay>${icon('plus', { size: 18 })}Novo método</button></div>
    <div class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Método</th><th>Tipo</th><th>Processador</th><th>Ordem</th><th>Estado</th><th></th></tr></thead><tbody>${methods.map(
      (m) => html`<tr><td><strong>${m.name}</strong><br><small class="muted">${m.code}</small></td><td>${PAYMENT_TYPES[m.type] ?? m.type}</td><td>${m.provider}</td><td>${m.sortOrder}</td><td>${m.isActive ? html`<span class="badge badge--ok">Ativo</span>` : html`<span class="badge badge--neutral">Inativo</span>`}</td><td><button class="btn btn--sm btn--ghost" type="button" data-edit-pay="${m.id}">Editar</button></td></tr>`,
    )}</tbody></table></div></div>`,
  );
  body.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    let ok;
    if (b.dataset.newPay !== undefined) ok = await formModal({ title: 'Novo método de pagamento', fields, values: { type: 'MOBILE_MONEY', provider: providers[0]?.code, isActive: true, sortOrder: methods.length }, submitLabel: 'Criar método', onSubmit: submit((v) => api.post('/admin/payment-methods', v)) });
    if (b.dataset.editPay) {
      const m = methods.find((x) => x.id === b.dataset.editPay);
      ok = await formModal({ title: `Editar ${m.name}`, fields, values: { ...m, configText: configToText(m.config) }, mode: 'edit', onSubmit: submit((v) => api.patch(`/admin/payment-methods/${m.id}`, v)) });
    }
    if (ok) (toast('Métodos de pagamento atualizados.'), RENDER.payments());
  };
}

// =================================================================== Equipa
const PERM_GROUPS = { admins: 'Administradores', audit: 'Auditoria', banners: 'Banners', brands: 'Marcas', categories: 'Categorias', content: 'Conteúdo', coupons: 'Cupões', customers: 'Clientes', dashboard: 'Dashboard', inventory: 'Stock', orders: 'Pedidos', payment_methods: 'Métodos de pagamento', payments: 'Pagamentos', products: 'Produtos', promotions: 'Promoções', questions: 'Perguntas', refunds: 'Reembolsos', reports: 'Relatórios', reviews: 'Avaliações', roles: 'Perfis', settings: 'Configurações', shipping_methods: 'Entregas', uploads: 'Uploads', whatsapp: 'WhatsApp' };
const permLabel = (k) => {
  const [g, a] = k.split(':');
  return `${PERM_GROUPS[g] ?? g} · ${a.replace(/_/g, ' ')}`;
};

async function drawTeam() {
  render(body, html`<section id="staff"></section><section id="roles" style="margin-top:24px"></section>`);
  let roles = [];
  const roleOptions = async () => {
    roles = await api.get('/admin/roles');
    return roles.filter((r) => r.name !== 'CUSTOMER').map((r) => [r.name, `${r.name}${r.description ? ` — ${r.description}` : ''}`]);
  };
  const staff = dataTable($('#staff', body), {
    fetch: (query) => api.page('/admin/staff', { query }),
    filters: [{ name: 'search', label: 'Nome ou email…' }],
    actions: html`<button class="btn btn--primary" type="button" data-act="create">${icon('plus', { size: 18 })}Adicionar membro</button>`,
    columns: [
      { label: 'Membro', render: (u) => html`<strong>${u.name}</strong><br><small class="muted">${u.email}</small>` },
      { label: 'Perfis', render: (u) => html`<div class="chips">${u.roles.filter((r) => r !== 'CUSTOMER').map((r) => html`<span class="badge badge--info">${r}</span>`)}</div>` },
      { label: 'Último acesso', render: (u) => (u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nunca') },
      { label: 'Desde', render: (u) => formatDate(u.createdAt) },
    ],
    rowActions: () => html`${act('roles', 'Perfis')}${act('remove', 'Remover acesso', { danger: true })}`,
    empty: 'Sem membros da equipa.',
    onAction: async (a, u, b) => {
      if (a === 'create') {
        const ok = await formModal({
          title: 'Adicionar membro da equipa',
          intro: html`<p class="muted">A pessoa entra com este email e a password temporária; deve trocá-la no primeiro acesso. A password não fica guardada no navegador.</p>`,
          fields: [
            { name: 'name', label: 'Nome', required: true, maxLength: 120 },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'phone', label: 'Telefone (opcional)', placeholder: '+258 84 000 0000' },
            { name: 'password', label: 'Password temporária', type: 'password', required: true, hint: 'Mínimo 8 caracteres, com letras e números.' },
            { name: 'roles', label: 'Perfis', type: 'multiselect', options: roleOptions },
          ],
          submitLabel: 'Adicionar',
          onSubmit: (v) => api.post('/admin/staff', v),
        });
        if (ok) (toast('Membro adicionado.'), staff.reload());
      }
      if (a === 'roles') {
        const ok = await formModal({
          title: `Perfis de ${u.name}`,
          fields: [{ name: 'roles', label: 'Perfis', type: 'multiselect', options: roleOptions }],
          values: { roles: u.roles.filter((r) => r !== 'CUSTOMER') },
          size: 'md',
          intro: html`<p class="muted">Não pode alterar os seus próprios perfis nem atribuir perfis acima do seu nível.</p>`,
          onSubmit: (v) => api.put(`/admin/users/${u.id}/roles`, { roles: v.roles }),
        });
        if (ok) (toast('Perfis atualizados.'), staff.reload());
      }
      if (a === 'remove' && (await confirmDialog(`Remover o acesso de ${u.name} ao painel? A conta continua a existir como cliente.`, { title: 'Remover acesso', confirmLabel: 'Remover acesso', danger: true })))
        busy(b, async () => {
          try {
            await api.delete(`/admin/staff/${u.id}`);
            toast('Acesso removido.');
            staff.reload();
          } catch (err) {
            toast(err.friendly, { type: 'error' });
          }
        });
    },
  });
  if (hasPermission('roles:manage')) drawRoles($('#roles', body));
}

async function drawRoles(el) {
  render(el, html`<div class="panel"><div class="sk sk--line"></div></div>`);
  try {
    const [roles, perms] = await Promise.all([api.get('/admin/roles'), api.get('/admin/permissions')]);
    const permOptions = perms.map((p) => [p.key, permLabel(p.key)]);
    const fields = (isNew) => [
      ...(isNew ? [{ name: 'name', label: 'Nome do perfil', required: true, maxLength: 50, hint: 'Maiúsculas, números e _. Ex.: GESTOR_STOCK' }] : []),
      { name: 'level', label: 'Nível (1–99)', type: 'number', min: 1, max: 99, required: true, hint: 'Só quem tem nível superior pode gerir este perfil.' },
      { name: 'description', label: 'Descrição', maxLength: 300, nullable: true },
      { name: 'permissions', label: 'Permissões', type: 'multiselect', options: permOptions },
    ];
    render(
      el,
      html`<div class="adm-head"><h2 class="panel__title" style="margin:0">Perfis e permissões</h2><button class="btn" type="button" data-new-role>${icon('plus', { size: 18 })}Novo perfil</button></div>
      <div class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Perfil</th><th class="num">Nível</th><th class="num">Permissões</th><th class="num">Membros</th><th></th></tr></thead><tbody>${roles.map(
        (r) => html`<tr><td><strong>${r.name}</strong>${r.isSystem ? html` <span class="badge badge--neutral">Sistema</span>` : ''}${r.description ? html`<br><small class="muted">${r.description}</small>` : ''}</td><td class="num">${r.level}</td><td class="num">${r.permissions.length}</td><td class="num">${r.usersCount}</td>
          <td><div class="dt__row-actions"><button class="btn btn--sm btn--ghost" type="button" data-edit-role="${r.id}">${r.isSystem ? 'Ver' : 'Editar'}</button>${r.isSystem ? '' : html`<button class="btn btn--sm btn--ghost dt__danger" type="button" data-del-role="${r.id}">Apagar</button>`}</div></td></tr>`,
      )}</tbody></table></div></div>`,
    );
    el.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      let ok;
      if (b.dataset.newRole !== undefined) ok = await formModal({ title: 'Novo perfil', fields: fields(true), values: { level: 10, permissions: [] }, submitLabel: 'Criar perfil', onSubmit: (v) => api.post('/admin/roles', v) });
      if (b.dataset.editRole) {
        const r = roles.find((x) => x.id === b.dataset.editRole);
        ok = await formModal({ title: `Perfil ${r.name}`, fields: fields(false), values: r, mode: 'edit', intro: r.isSystem ? html`<p class="notice">Perfil de sistema: a loja pode recusar alterações.</p>` : '', onSubmit: (v) => api.patch(`/admin/roles/${r.id}`, v) });
      }
      if (b.dataset.delRole) {
        const r = roles.find((x) => x.id === b.dataset.delRole);
        if (await confirmDialog(`Apagar o perfil ${r.name}?${r.usersCount ? ` ${r.usersCount} membro(s) perdem estas permissões.` : ''}`, { title: 'Apagar perfil', confirmLabel: 'Apagar', danger: true })) {
          try {
            await api.delete(`/admin/roles/${r.id}`);
            ok = true;
          } catch (err) {
            toast(err.friendly, { type: 'error' });
          }
        }
      }
      if (ok) (toast('Perfis atualizados.'), drawRoles(el));
    };
  } catch (err) {
    showError(el, err, () => drawRoles(el));
  }
}

const initial = params().get('tab');
showTab(tabs.some((t) => t.key === initial) ? initial : tabs[0].key);
