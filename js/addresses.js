import { api } from './api.js';
import { busy, openModal } from './ui.js';
import { html, render } from './utils.js';

export const addressesApi = {
  list: () => api.get('/users/me/addresses'),
  create: (body) => api.post('/users/me/addresses', body),
  update: (id, body) => api.patch(`/users/me/addresses/${id}`, body),
  remove: (id) => api.delete(`/users/me/addresses/${id}`),
  setDefault: (id) => api.post(`/users/me/addresses/${id}/default`),
};

export const PROVINCES = ['Maputo Cidade', 'Maputo Província', 'Gaza', 'Inhambane', 'Sofala', 'Manica', 'Tete', 'Zambézia', 'Nampula', 'Cabo Delgado', 'Niassa'];
const TYPES = { HOME: 'Casa', WORK: 'Trabalho', OTHER: 'Outro' };

export function addressLines(a) {
  return [
    a.recipientName,
    [a.street, a.number].filter(Boolean).join(', '),
    [a.neighborhood, a.city].filter(Boolean).join(', '),
    [a.province, a.country].filter(Boolean).join(', '),
    a.reference ? `Ref.: ${a.reference}` : null,
    a.phone,
  ].filter(Boolean);
}

export function addressCard(a) {
  return html`<div class="addr">
    <p class="addr__head"><strong>${a.label || TYPES[a.type] || 'Endereço'}</strong>${a.isDefault ? html`<span class="badge badge--info">Principal</span>` : ''}</p>
    ${addressLines(a).map((l) => html`<span>${l}</span>`)}
  </div>`;
}

const normalizePhone = (p) => {
  const v = p.replace(/[\s-]/g, '');
  return v.startsWith('+') ? v : `+258${v.replace(/^0+/, '')}`;
};

/** Modal com formulário de endereço (criar/editar). Resolve com o endereço guardado ou null. */
export function editAddress(existing = null) {
  return new Promise((resolve) => {
    let saved = null;
    const form = document.createElement('form');
    form.id = 'address-form';
    form.noValidate = false;
    const a = existing ?? { country: 'Moçambique', type: 'HOME' };
    const v = (k) => a[k] ?? '';
    render(
      form,
      html`<div class="form-error" role="alert"></div>
      <div class="form-grid form-grid--2">
        <div class="field"><label for="a-name">Nome do destinatário</label><input class="input" id="a-name" name="recipientName" required minlength="2" maxlength="120" value="${v('recipientName')}" autocomplete="name"></div>
        <div class="field"><label for="a-phone">Telefone</label><input class="input" id="a-phone" name="phone" type="tel" required value="${v('phone')}" autocomplete="tel" placeholder="84 123 4567"></div>
        <div class="field"><label for="a-country">País</label><input class="input" id="a-country" name="country" required value="${v('country')}" autocomplete="country-name"></div>
        <div class="field"><label for="a-province">Província</label><input class="input" id="a-province" name="province" required list="provinces" value="${v('province')}" autocomplete="address-level1"><datalist id="provinces">${PROVINCES.map((p) => html`<option value="${p}">`)}</datalist></div>
        <div class="field"><label for="a-city">Cidade</label><input class="input" id="a-city" name="city" required value="${v('city')}" autocomplete="address-level2"></div>
        <div class="field"><label for="a-nb">Bairro</label><input class="input" id="a-nb" name="neighborhood" value="${v('neighborhood')}" autocomplete="address-level3"></div>
        <div class="field"><label for="a-street">Rua / Avenida</label><input class="input" id="a-street" name="street" required minlength="2" value="${v('street')}" autocomplete="address-line1"></div>
        <div class="field"><label for="a-number">Número</label><input class="input" id="a-number" name="number" value="${v('number')}" autocomplete="address-line2"></div>
        <div class="field"><label for="a-ref">Referência</label><input class="input" id="a-ref" name="reference" value="${v('reference')}" placeholder="Ex.: perto do mercado"></div>
        <div class="field"><label for="a-postal">Código postal</label><input class="input" id="a-postal" name="postalCode" value="${v('postalCode')}" autocomplete="postal-code"></div>
        <div class="field"><label for="a-type">Tipo</label><select class="select" id="a-type" name="type">${Object.entries(TYPES).map(([k, l]) => html`<option value="${k}" ${a.type === k ? html`selected` : ''}>${l}</option>`)}</select></div>
        <div class="field"><label for="a-label">Nome do endereço (opcional)</label><input class="input" id="a-label" name="label" maxlength="60" value="${v('label')}" placeholder="Ex.: Casa da mãe"></div>
      </div>
      <label class="check"><input type="checkbox" name="isDefault" ${a.isDefault ? html`checked` : ''}>Usar como endereço principal</label>`,
    );
    const m = openModal({
      title: existing ? 'Editar endereço' : 'Novo endereço',
      body: form,
      size: 'lg',
      onClose: () => resolve(saved),
      actions: [
        { label: 'Cancelar', onClick: ({ close }) => close() },
        { label: 'Guardar endereço', variant: 'primary', type: 'submit', form: 'address-form' },
      ],
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = {};
      for (const [k, val] of fd.entries()) if (String(val).trim()) body[k] = String(val).trim();
      body.isDefault = fd.get('isDefault') === 'on';
      body.phone = normalizePhone(body.phone ?? '');
      if (existing) for (const k of ['neighborhood', 'number', 'reference', 'postalCode', 'label']) if (!body[k] && existing[k]) body[k] = undefined;
      busy(m.el.querySelector('[form="address-form"]'), async () => {
        try {
          saved = existing ? await addressesApi.update(existing.id, body) : await addressesApi.create(body);
          m.close();
        } catch (err) {
          render(form.querySelector('.form-error'), err.friendly);
        }
      });
    });
  });
}
