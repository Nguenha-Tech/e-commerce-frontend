import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { busy, confirmDialog, openModal, stars, toast } from '../ui.js';
import { $, $$, formatDateTime, html, params, productUrl, render } from '../utils.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Avaliações e perguntas', anyOf: ['reviews:moderate', 'questions:moderate'] });

const REVIEW_STATUS = {
  PENDING: { label: 'Pendente', tone: 'warn' },
  APPROVED: { label: 'Publicada', tone: 'ok' },
  HIDDEN: { label: 'Oculta', tone: 'neutral' },
  REJECTED: { label: 'Rejeitada', tone: 'bad' },
};
const QUESTION_STATUS = {
  PENDING: { label: 'Por responder', tone: 'warn' },
  PUBLISHED: { label: 'Publicada', tone: 'ok' },
  HIDDEN: { label: 'Oculta', tone: 'neutral' },
};
const tag = (map, v) => html`<span class="badge badge--${map[v]?.tone ?? 'neutral'}">${map[v]?.label ?? v}</span>`;

const canReviews = hasPermission('reviews:moderate');
const canQuestions = hasPermission('questions:moderate');

render(
  main,
  html`<div class="tabs" role="tablist">
      ${canReviews ? html`<button class="tab" role="tab" type="button" data-tab="reviews">Avaliações</button>` : ''}
      ${canQuestions ? html`<button class="tab" role="tab" type="button" data-tab="questions">Perguntas</button>` : ''}
    </div><div id="tab-body"></div>`,
);

let current;
function showTab(name) {
  $$('[data-tab]', main).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  const el = $('#tab-body', main);
  el.replaceChildren();
  current = name === 'questions' ? questionsTable(el) : reviewsTable(el);
}
main.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) showTab(t.dataset.tab);
});

/** Modal com uma caixa de texto (resposta, resposta a pergunta). */
function textModal({ title, label, value = '', submitLabel, extra = '', minLength = 2, onSubmit }) {
  const form = document.createElement('form');
  form.id = `tm-${Math.random().toString(36).slice(2)}`;
  render(form, html`<div class="field"><label for="tm-text">${label}</label><textarea class="textarea" id="tm-text" name="text" rows="5" required minlength="${minLength}" maxlength="2000">${value}</textarea></div>${extra}<div class="form-error" role="alert"></div>`);
  const m = openModal({ title, body: form, actions: [{ label: 'Cancelar', onClick: ({ close }) => close() }, { label: submitLabel, variant: 'primary', type: 'submit', form: form.id }] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    busy(m.el.querySelector(`[form="${form.id}"]`), async () => {
      try {
        await onSubmit(form);
        m.close();
        current.reload();
      } catch (err) {
        render($('.form-error', form), err.friendly);
      }
    });
  });
}

const run = (button, fn, msg) =>
  busy(button, async () => {
    try {
      await fn();
      toast(msg);
      current.reload();
    } catch (err) {
      toast(err.friendly, { type: 'error' });
    }
  });

function reviewsTable(el) {
  return dataTable(el, {
    fetch: (query) => api.page('/admin/reviews', { query }),
    initial: { status: params().get('status') ?? undefined },
    filters: [
      { name: 'status', label: 'Todos os estados', type: 'select', options: Object.entries(REVIEW_STATUS).map(([k, v]) => [k, v.label]) },
      { name: 'rating', label: 'Todas as notas', type: 'select', options: [5, 4, 3, 2, 1].map((n) => [String(n), `${n} estrela${n > 1 ? 's' : ''}`]) },
      { name: 'reported', label: 'Denunciadas', type: 'checkbox' },
      { name: 'unanswered', label: 'Sem resposta', type: 'checkbox' },
    ],
    columns: [
      { label: 'Produto', render: (r) => html`<a href="../${productUrl(r.product)}" target="_blank" rel="noopener">${r.product.name}</a><br><small class="muted">${r.user.name} · ${formatDateTime(r.createdAt)}</small>` },
      {
        label: 'Avaliação',
        render: (r) => html`<div class="review-cell">${stars(r.rating, undefined, { size: 13 })}${r.title ? html`<strong>${r.title}</strong>` : ''}${r.comment ? html`<p>${r.comment}</p>` : ''}
          ${r.images?.length ? html`<div class="chips">${r.images.map((i) => html`<a href="${i.url}" target="_blank" rel="noopener"><img src="${i.url}" alt="Foto do cliente" width="44" height="44" style="object-fit:cover;border-radius:6px"></a>`)}</div>` : ''}
          ${r.adminReply ? html`<p class="review-cell__reply"><strong>Resposta da loja:</strong> ${r.adminReply}</p>` : ''}
          ${r.reportCount ? html`<p class="review-cell__report">Denunciada ${r.reportCount}×${r.reports?.length ? `: ${r.reports.map((x) => x.reason).join(' · ')}` : ''}</p>` : ''}</div>`,
      },
      { label: 'Estado', render: (r) => tag(REVIEW_STATUS, r.status) },
    ],
    rowActions: (r) => html`${r.status !== 'APPROVED' ? act('approve', 'Publicar') : ''}${r.status === 'APPROVED' ? act('hide', 'Ocultar') : ''}${r.status === 'PENDING' ? act('reject', 'Rejeitar') : ''}${act('reply', r.adminReply ? 'Editar resposta' : 'Responder')}${act('delete', 'Apagar', { danger: true })}`,
    empty: 'Nenhuma avaliação encontrada.',
    onAction: async (a, r, b) => {
      const status = { approve: 'APPROVED', hide: 'HIDDEN', reject: 'REJECTED' }[a];
      if (status) return run(b, () => api.patch(`/admin/reviews/${r.id}/status`, { status }), `Avaliação: ${REVIEW_STATUS[status].label.toLowerCase()}.`);
      if (a === 'reply')
        return textModal({
          title: 'Responder à avaliação',
          label: 'Resposta pública da loja',
          value: r.adminReply ?? '',
          submitLabel: 'Publicar resposta',
          onSubmit: async (f) => (await api.post(`/admin/reviews/${r.id}/reply`, { reply: f.text.value.trim() }), toast('Resposta publicada.')),
        });
      if (a === 'delete' && (await confirmDialog('Apagar esta avaliação definitivamente? Use apenas para spam ou abuso; para esconder, prefira “Ocultar”.', { title: 'Apagar avaliação', confirmLabel: 'Apagar', danger: true })))
        run(b, () => api.delete(`/admin/reviews/${r.id}`), 'Avaliação apagada.');
    },
  });
}

function questionsTable(el) {
  return dataTable(el, {
    fetch: (query) => api.page('/admin/questions', { query }),
    initial: { unanswered: 'true' },
    filters: [
      { name: 'status', label: 'Todos os estados', type: 'select', options: Object.entries(QUESTION_STATUS).map(([k, v]) => [k, v.label]) },
      { name: 'unanswered', label: 'Sem resposta', type: 'checkbox' },
    ],
    columns: [
      { label: 'Produto', render: (q) => html`<a href="../${productUrl(q.product)}" target="_blank" rel="noopener">${q.product.name}</a><br><small class="muted">${q.user.name} · ${formatDateTime(q.createdAt)}</small>` },
      { label: 'Pergunta', render: (q) => html`<div class="review-cell"><p><strong>${q.question}</strong></p>${q.answer ? html`<p class="review-cell__reply">${q.answer}</p>` : ''}</div>` },
      { label: 'Estado', render: (q) => tag(QUESTION_STATUS, q.status) },
    ],
    rowActions: (q) => html`${act('answer', q.answer ? 'Editar resposta' : 'Responder')}${q.status === 'PUBLISHED' ? act('hide', 'Ocultar') : q.answer ? act('publish', 'Publicar') : ''}${act('delete', 'Apagar', { danger: true })}`,
    empty: 'Não há perguntas por responder.',
    onAction: async (a, q, b) => {
      if (a === 'answer')
        return textModal({
          title: 'Responder à pergunta',
          label: `“${q.question}”`,
          value: q.answer ?? '',
          minLength: 1,
          submitLabel: 'Guardar resposta',
          extra: html`<label class="check"><input type="checkbox" name="publish" checked>Publicar na página do produto</label>`,
          onSubmit: async (f) => (await api.post(`/admin/questions/${q.id}/answer`, { answer: f.text.value.trim(), publish: f.publish.checked }), toast('Resposta guardada. O cliente é notificado.')),
        });
      if (a === 'hide') return run(b, () => api.patch(`/admin/questions/${q.id}/status`, { status: 'HIDDEN' }), 'Pergunta ocultada.');
      if (a === 'publish') return run(b, () => api.patch(`/admin/questions/${q.id}/status`, { status: 'PUBLISHED' }), 'Pergunta publicada.');
      if (a === 'delete' && (await confirmDialog('Apagar esta pergunta definitivamente?', { title: 'Apagar pergunta', confirmLabel: 'Apagar', danger: true })))
        run(b, () => api.delete(`/admin/questions/${q.id}`), 'Pergunta apagada.');
    },
  });
}

showTab(params().get('tab') === 'questions' || !canReviews ? 'questions' : 'reviews');
