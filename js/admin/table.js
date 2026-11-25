import { icon } from '../icons.js';
import { pagination, showError } from '../ui.js';
import { $, debounce, html, render } from '../utils.js';

/**
 * Tabela de dados com pesquisa, filtros, paginação e estados (loading/empty/error).
 *
 * dataTable(el, {
 *   columns: [{ label, render: (row) => html, className }],
 *   fetch: (query) => api.page(...),          // { items, meta }
 *   filters: [{ name, label, type: 'search'|'select'|'date'|'checkbox', options }],
 *   actions: html,                            // botões no topo (ex.: "+ Adicionar")
 *   rowActions: (row) => html,
 *   onAction: (action, row, button) => {},    // [data-act="edit"] etc.
 *   empty: 'Sem resultados.'
 * }) → { reload(), query }
 */
export function dataTable(el, cfg) {
  const query = { page: 1, limit: cfg.limit ?? 20, ...(cfg.initial ?? {}) };
  let rows = [];

  render(
    el,
    html`<div class="dt">
      <div class="dt__bar">
        <form class="dt__filters" role="search">${(cfg.filters ?? []).map((f) => filterHtml(f, query))}</form>
        <div class="dt__actions">${cfg.actions ?? ''}</div>
      </div>
      <div class="dt__table table-wrap"><table class="table"><thead><tr>${cfg.columns.map((c) => html`<th scope="col" class="${c.className ?? ''}">${c.label}</th>`)}${cfg.rowActions ? html`<th scope="col" class="dt__act-col"><span class="sr-only">Ações</span></th>` : ''}</tr></thead><tbody></tbody></table></div>
      <div class="dt__state"></div>
      <div class="dt__foot"><span class="dt__count muted"></span><div class="dt__pager"></div></div>
    </div>`,
  );
  const tbody = $('tbody', el);
  const state = $('.dt__state', el);
  const cols = cfg.columns.length + (cfg.rowActions ? 1 : 0);

  async function reload() {
    render(tbody, html`${Array.from({ length: 5 }, () => html`<tr class="dt__sk">${Array.from({ length: cols }, () => html`<td><span class="sk sk--line" style="margin:0"></span></td>`)}</tr>`)}`);
    render(state, '');
    try {
      const { items, meta } = await cfg.fetch({ ...query });
      rows = items;
      if (!items.length) {
        render(tbody, '');
        render(state, html`<div class="state">${icon('search', { size: 28 })}<p class="state__title">${cfg.empty ?? 'Sem resultados.'}</p></div>`);
      } else {
        render(tbody, html`${items.map((r, i) => html`<tr data-row="${i}" class="${cfg.rowClass?.(r) ?? ''}">${cfg.columns.map((c) => html`<td class="${c.className ?? ''}" data-label="${c.label}">${c.render(r)}</td>`)}${cfg.rowActions ? html`<td class="dt__act-col"><div class="dt__row-actions">${cfg.rowActions(r)}</div></td>` : ''}</tr>`)}`);
      }
      render($('.dt__count', el), meta?.total !== undefined ? `${meta.total} ${meta.total === 1 ? 'registo' : 'registos'}` : '');
      pagination($('.dt__pager', el), meta, (p) => {
        query.page = p;
        reload();
      });
    } catch (err) {
      if (!err.status) console.error(err);
      render(tbody, '');
      showError(state, err, reload);
    }
  }

  const form = $('.dt__filters', el);
  const apply = () => {
    for (const f of cfg.filters ?? []) {
      const input = form.elements[f.name];
      if (!input) continue;
      const v = f.type === 'checkbox' ? (input.checked ? 'true' : undefined) : input.value.trim() || undefined;
      query[f.name] = f.type === 'date' && v ? new Date(v + (f.end ? 'T23:59:59' : 'T00:00:00')).toISOString() : v;
    }
    query.page = 1;
    reload();
  };
  form.addEventListener('input', debounce((e) => e.target.type === 'search' && apply(), 300));
  form.addEventListener('change', (e) => e.target.type !== 'search' && apply());
  form.addEventListener('submit', (e) => (e.preventDefault(), apply()));

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !cfg.onAction) return;
    const tr = b.closest('[data-row]');
    cfg.onAction(b.dataset.act, tr ? rows[Number(tr.dataset.row)] : null, b);
  });

  reload();
  return { reload, query, rows: () => rows };
}

function filterHtml(f, query) {
  const id = `f-${f.name}`;
  if (f.type === 'select') {
    return html`<label class="dt__f"><span class="sr-only">${f.label}</span><select class="select" id="${id}" name="${f.name}"><option value="">${f.label}</option>${f.options.map(([v, l]) => html`<option value="${v}" ${query[f.name] === v ? html`selected` : ''}>${l}</option>`)}</select></label>`;
  }
  if (f.type === 'checkbox') return html`<label class="check dt__f"><input type="checkbox" id="${id}" name="${f.name}" ${query[f.name] ? html`checked` : ''}>${f.label}</label>`;
  if (f.type === 'date') return html`<label class="dt__f dt__f--date"><span>${f.label}</span><input class="input" type="date" id="${id}" name="${f.name}"></label>`;
  return html`<label class="dt__f dt__f--search"><span class="sr-only">${f.label}</span>${icon('search', { size: 18 })}<input class="input" type="search" id="${id}" name="${f.name}" placeholder="${f.label}" value="${query[f.name] ?? ''}"></label>`;
}

/** Botão de ação de linha. */
export const act = (name, label, { danger = false, iconName } = {}) =>
  html`<button type="button" class="btn btn--sm ${danger ? 'btn--ghost dt__danger' : 'btn--ghost'}" data-act="${name}">${iconName ? icon(iconName, { size: 16 }) : ''}${label}</button>`;
