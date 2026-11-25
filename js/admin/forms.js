import { api } from '../api.js';
import { icon } from '../icons.js';
import { busy, openModal } from '../ui.js';
import { $, $$, centsToInput, html, parseMoneyInput, render, toDateTimeLocal } from '../utils.js';

/**
 * Construtor de formulários do painel.
 * field: { name, label, type, required, options, hint, nullable, full, folder, min, max, step, placeholder }
 * type: text | email | url | textarea | number | money | select | checkbox | date | datetime | image | multiselect | tags | password
 * - money: o utilizador escreve MZN; a API recebe centavos.
 * - nullable: em edição, um campo esvaziado é enviado como null (limpa o valor).
 */
export function fieldsHtml(fields, values = {}, prefix = 'fm') {
  return html`<div class="form-grid form-grid--2">${fields.map((f) => fieldHtml(f, values[f.name], prefix))}</div>`;
}

function fieldHtml(f, value, prefix) {
  const id = `${prefix}-${f.name}`;
  const req = f.required ? html`required` : '';
  const hint = f.hint ? html`<span class="field__hint">${f.hint}</span>` : '';
  const cls = `field ${f.full || ['textarea', 'multiselect', 'image'].includes(f.type) ? 'field--full' : ''}`;
  const label = html`<label for="${id}">${f.label}${f.required ? html`<span aria-hidden="true"> *</span>` : ''}</label>`;
  const attrs = (extra = '') => html`id="${id}" name="${f.name}" ${req} ${f.placeholder ? html`placeholder="${f.placeholder}"` : ''} ${f.maxLength ? html`maxlength="${f.maxLength}"` : ''} ${extra}`;

  switch (f.type) {
    case 'textarea':
      return html`<div class="${cls}">${label}<textarea class="textarea" ${attrs()} rows="${f.rows ?? 4}">${value ?? ''}</textarea>${hint}</div>`;
    case 'select': {
      const opts = typeof f.options === 'function' ? [] : f.options ?? [];
      return html`<div class="${cls}">${label}<select class="select" ${attrs()} data-value="${value ?? ''}">${f.placeholder !== false ? html`<option value="">${f.emptyLabel ?? '—'}</option>` : ''}${opts.map(([v, l]) => html`<option value="${v}" ${String(value ?? '') === String(v) ? html`selected` : ''}>${l}</option>`)}</select>${hint}</div>`;
    }
    case 'checkbox':
      return html`<div class="${cls} field--check"><label class="check"><input type="checkbox" id="${id}" name="${f.name}" ${value ? html`checked` : ''}>${f.label}</label>${hint}</div>`;
    case 'money':
      return html`<div class="${cls}">${label}<div class="input-affix"><input class="input" ${attrs('inputmode="decimal"')} value="${centsToInput(value)}"><span>MZN</span></div>${hint}</div>`;
    case 'number':
      return html`<div class="${cls}">${label}<input class="input" type="number" ${attrs()} value="${value ?? ''}" ${f.min !== undefined ? html`min="${f.min}"` : ''} ${f.max !== undefined ? html`max="${f.max}"` : ''} step="${f.step ?? 1}">${hint}</div>`;
    case 'date':
      return html`<div class="${cls}">${label}<input class="input" type="date" ${attrs()} value="${value ? String(value).slice(0, 10) : ''}">${hint}</div>`;
    case 'datetime':
      return html`<div class="${cls}">${label}<input class="input" type="datetime-local" ${attrs()} value="${toDateTimeLocal(value)}">${hint}</div>`;
    case 'image':
      return html`<div class="${cls}">${label}<div class="img-field" data-folder="${f.folder ?? 'misc'}">
          <div class="img-field__preview">${value ? html`<img src="${value}" alt="">` : icon('image', { size: 28 })}</div>
          <div class="img-field__ctl"><input class="input" type="url" ${attrs()} value="${value ?? ''}" placeholder="https://… ou carregue um ficheiro">
          <label class="btn btn--sm">${icon('upload', { size: 16 })}Carregar imagem<input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" data-upload-for="${id}"></label></div>
        </div>${hint}</div>`;
    case 'multiselect': {
      const sel = new Set(value ?? []);
      const opts = typeof f.options === 'function' ? [] : f.options ?? [];
      return html`<fieldset class="${cls} ms" id="${id}" data-name="${f.name}"><legend class="field__label">${f.label}</legend>
        ${opts.length > 8 ? html`<input class="input ms__search" type="search" placeholder="Filtrar…" aria-label="Filtrar ${f.label}">` : ''}
        <div class="ms__list">${opts.map(([v, l]) => html`<label class="check"><input type="checkbox" value="${v}" ${sel.has(v) ? html`checked` : ''}>${l}</label>`)}</div>${hint}</fieldset>`;
    }
    case 'tags':
      return html`<div class="${cls}">${label}<input class="input" ${attrs()} value="${(value ?? []).join(', ')}">${hint ?? ''}<span class="field__hint">Separe por vírgulas.</span></div>`;
    default:
      return html`<div class="${cls}">${label}<input class="input" type="${f.type ?? 'text'}" ${attrs()} value="${value ?? ''}" ${f.type === 'password' ? html`autocomplete="new-password"` : ''}>${hint}</div>`;
  }
}

/** Liga uploads, filtros de multiselect e pré-visualização de imagens. */
export function enhanceForm(root) {
  root.addEventListener('change', async (e) => {
    const file = e.target.closest('[data-upload-for]');
    if (!file?.files?.length) return;
    const box = file.closest('.img-field');
    const input = document.getElementById(file.dataset.uploadFor);
    const label = file.closest('label');
    await busy(label, async () => {
      try {
        const [up] = await api.upload('/admin/uploads/images', [file.files[0]], { query: { folder: box.dataset.folder } });
        input.value = up.url;
        render($('.img-field__preview', box), html`<img src="${up.url}" alt="">`);
      } catch (err) {
        input.setCustomValidity('');
        root.querySelector('.form-error') && render(root.querySelector('.form-error'), err.friendly);
      }
    });
  });
  root.addEventListener('input', (e) => {
    if (e.target.matches('.img-field input[type=url]')) {
      const prev = $('.img-field__preview', e.target.closest('.img-field'));
      render(prev, e.target.value ? html`<img src="${e.target.value}" alt="">` : icon('image', { size: 28 }));
    }
    if (e.target.matches('.ms__search')) {
      const q = e.target.value.toLowerCase();
      $$('.ms__list .check', e.target.closest('.ms')).forEach((l) => (l.hidden = !l.textContent.toLowerCase().includes(q)));
    }
  });
}

/** Lê os valores do formulário convertendo tipos. Devolve { values, errors }. */
export function readFields(root, fields, { mode = 'create', prefix = 'fm' } = {}) {
  const values = {};
  const errors = [];
  for (const f of fields) {
    if (f.readOnly) continue;
    // Campos escondidos por showIf não são enviados.
    if (f.showIf && root.querySelector(`#${prefix}-${f.name}`)?.closest('[hidden]')) continue;
    if (f.type === 'multiselect') {
      values[f.name] = $$(`#${prefix}-${f.name} .ms__list input:checked`, root).map((i) => i.value);
      continue;
    }
    const el = root.querySelector(`#${prefix}-${f.name}`);
    if (!el) continue;
    if (f.type === 'checkbox') {
      values[f.name] = el.checked;
      continue;
    }
    const rawV = el.value.trim();
    let v;
    if (rawV === '') v = mode === 'edit' && f.nullable ? null : undefined;
    else if (f.type === 'money') {
      v = parseMoneyInput(rawV);
      if (!Number.isFinite(v)) errors.push(`${f.label}: valor inválido`);
    } else if (f.type === 'number') v = Number(rawV);
    else if (f.type === 'datetime') v = new Date(rawV).toISOString();
    else if (f.type === 'date') v = new Date(`${rawV}T00:00:00`).toISOString();
    else if (f.type === 'tags') v = rawV.split(',').map((s) => s.trim()).filter(Boolean);
    else v = rawV;
    if (v !== undefined) values[f.name] = v;
    if (f.required && (v === undefined || v === null)) errors.push(`${f.label} é obrigatório`);
  }
  return { values, errors };
}

/** Marca campos inválidos a partir de details[] da API. */
export function markApiErrors(root, err, prefix = 'fm') {
  $$('[aria-invalid]', root).forEach((x) => x.removeAttribute('aria-invalid'));
  (err.details ?? []).forEach((d) => {
    const name = String(d.path ?? '').replace(/^body\./, '').split('.')[0];
    root.querySelector(`#${prefix}-${name}`)?.setAttribute('aria-invalid', 'true');
  });
  const detail = (err.details ?? []).map((d) => `${String(d.path).replace(/^body\./, '')}: ${d.message}`).slice(0, 4).join(' · ');
  render($('.form-error', root), detail && err.status === 400 ? `${err.friendly} (${detail})` : err.friendly);
}

/**
 * Modal de formulário: formModal({ title, fields, values, mode, submitLabel, onSubmit(values) }).
 * Resolve com o resultado de onSubmit, ou null se cancelado.
 */
export function formModal({ title, fields, values = {}, mode = 'create', submitLabel = 'Guardar', size = 'lg', intro, onSubmit }) {
  return new Promise((resolve) => {
    let result = null;
    const form = document.createElement('form');
    form.id = `form-${Math.random().toString(36).slice(2)}`;
    form.noValidate = true;
    render(form, html`${intro ?? ''}<div class="form-error" role="alert"></div>${fieldsHtml(fields, values)}`);
    enhanceForm(form);
    // Campos condicionais: { showIf: { field: 'discountType', in: ['PERCENTAGE'] } }.
    const conditional = fields.filter((f) => f.showIf);
    const syncVisibility = () =>
      conditional.forEach((f) => {
        const ctl = form.elements[f.showIf.field];
        const wrap = $(`#fm-${f.name}`, form)?.closest('.field, fieldset');
        if (ctl && wrap) wrap.hidden = !f.showIf.in.includes(ctl.type === 'checkbox' ? ctl.checked : ctl.value);
      });
    if (conditional.length) {
      form.addEventListener('change', syncVisibility);
      syncVisibility();
    }
    // Opções carregadas da API (ex.: categorias, marcas).
    fields.filter((f) => typeof f.options === 'function').forEach(async (f) => {
      const opts = await f.options();
      if (f.type === 'multiselect') {
        const sel = new Set(values[f.name] ?? []);
        render($(`#fm-${f.name} .ms__list`, form), html`${opts.map(([v, l]) => html`<label class="check"><input type="checkbox" value="${v}" ${sel.has(v) ? html`checked` : ''}>${l}</label>`)}`);
        if (opts.length > 8 && !$(`#fm-${f.name} .ms__search`, form)) $(`#fm-${f.name} .ms__list`, form).insertAdjacentHTML('beforebegin', '<input class="input ms__search" type="search" placeholder="Filtrar…">');
      } else {
        const select = $(`#fm-${f.name}`, form);
        const cur = select.dataset.value;
        select.insertAdjacentHTML('beforeend', opts.map(([v, l]) => `<option value="${String(v).replace(/"/g, '&quot;')}" ${String(v) === cur ? 'selected' : ''}>${String(l).replace(/</g, '&lt;')}</option>`).join(''));
      }
    });
    const m = openModal({
      title,
      body: form,
      size,
      onClose: () => resolve(result),
      actions: [
        { label: 'Cancelar', onClick: ({ close }) => close() },
        { label: submitLabel, variant: 'primary', type: 'submit', form: form.id },
      ],
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const { values: v, errors } = readFields(form, fields, { mode });
      if (errors.length) return render($('.form-error', form), errors.join(' · '));
      busy(m.el.querySelector(`[form="${form.id}"]`), async () => {
        try {
          result = (await onSubmit(v)) ?? true;
          m.close();
        } catch (err) {
          markApiErrors(form, err);
        }
      });
    });
  });
}
