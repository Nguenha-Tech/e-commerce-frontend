import { api } from '../api.js';
import { openModal, showError } from '../ui.js';
import { formatDateTime, html, render } from '../utils.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Auditoria', permission: 'audit:read' });

const actions = await api.get('/admin/audit-logs/actions').catch(() => []);

const fmt = (v) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Tabela antes/depois só com os campos que mudaram. */
function diffTable(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (!keys.length) return html`<p class="muted">Sem detalhe de alterações.</p>`;
  return html`<div class="table-wrap"><table class="table"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${keys.map(
    (k) => html`<tr><td><strong>${k}</strong></td><td><code class="audit-val">${fmt(before?.[k])}</code></td><td><code class="audit-val">${fmt(after?.[k])}</code></td></tr>`,
  )}</tbody></table></div>`;
}

dataTable(main, {
  fetch: (query) => api.page('/admin/audit-logs', { query }),
  filters: [
    { name: 'action', label: 'Todas as ações', type: 'select', options: actions.map((a) => [a.action, `${a.action} (${a.count})`]) },
    { name: 'resourceType', label: 'Tipo de recurso (ex.: Product)' },
    { name: 'from', label: 'De', type: 'date' },
    { name: 'to', label: 'Até', type: 'date', end: true },
  ],
  columns: [
    { label: 'Data', render: (l) => formatDateTime(l.createdAt) },
    { label: 'Quem', render: (l) => html`${l.actor?.name ?? 'Sistema'}<br><small class="muted">${l.actorEmail ?? ''}</small>` },
    { label: 'Ação', render: (l) => html`<strong>${l.action}</strong>` },
    { label: 'Recurso', render: (l) => html`${l.resourceType ?? '—'}<br><small class="muted">${l.resourceId ?? ''}</small>` },
    { label: 'IP', render: (l) => l.ip ?? '—' },
  ],
  rowActions: () => act('view', 'Detalhe', { iconName: 'eye' }),
  empty: 'Sem registos para estes filtros.',
  onAction: async (a, l) => {
    if (a !== 'view') return;
    const body = document.createElement('div');
    openModal({ title: l.action, body, size: 'lg' });
    try {
      const d = await api.get(`/admin/audit-logs/${l.id}`);
      render(
        body,
        html`<dl class="kv" style="margin-bottom:16px">
          <div><dt>Data</dt><dd>${formatDateTime(d.createdAt)}</dd></div>
          <div><dt>Quem</dt><dd>${d.actor?.name ?? 'Sistema'} ${d.actorEmail ? `(${d.actorEmail})` : ''}</dd></div>
          <div><dt>Recurso</dt><dd>${d.resourceType ?? '—'} ${d.resourceId ?? ''}</dd></div>
          <div><dt>IP</dt><dd>${d.ip ?? '—'}</dd></div>
          <div><dt>Pedido HTTP</dt><dd><code>${d.requestId ?? '—'}</code></dd></div>
        </dl>${diffTable(d.before, d.after)}`,
      );
    } catch (err) {
      showError(body, err);
    }
  },
});
