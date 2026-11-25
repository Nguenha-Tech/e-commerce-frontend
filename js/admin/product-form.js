import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { icon } from '../icons.js';
import { busy, confirmDialog, openModal, setSeo, showError, toast, toastError } from '../ui.js';
import { $, $$, badge, centsToInput, html, optionLabel, params, parseMoneyInput, PRODUCT_STATUS, render } from '../utils.js';
import { brandOptions, categoryOptions } from './common.js';
import { enhanceForm, fieldsHtml, markApiErrors, readFields } from './forms.js';
import { initAdmin } from './layout.js';

const editId = params().get('id');
const dupId = params().get('duplicate');
const main = await initAdmin({ title: editId ? 'Editar produto' : 'Novo produto', permission: editId ? 'products:update' : 'products:create' });

let product = null; // produto em edição (detalhe admin)
let cats = [];
let brands = [];
let kind = 'simple'; // criação: 'simple' | 'variants'
let axes = [{ key: 'color', values: '' }];
let generated = []; // variantes geradas (criação)
let specs = [];

const AXIS_PRESETS = [
  ['color', 'Cor'],
  ['storage', 'Armazenamento'],
  ['size', 'Tamanho'],
  ['ram', 'RAM'],
  ['capacity', 'Capacidade'],
];

// ------------------------------------------------------------------ definição dos campos
const infoFields = () => [
  { name: 'name', label: 'Nome', required: true, maxLength: 200, full: true },
  { name: 'sku', label: 'SKU', required: true, maxLength: 64, hint: 'Letras, números, "-", "_" ou ".". Ex.: SAM-S25-256' },
  { name: 'internalCode', label: 'Código interno', maxLength: 64, nullable: true },
  { name: 'categoryId', label: 'Categoria', type: 'select', required: true, options: cats, emptyLabel: 'Escolha a categoria' },
  { name: 'brandId', label: 'Marca', type: 'select', options: brands, emptyLabel: 'Sem marca', nullable: true },
  { name: 'shortDescription', label: 'Descrição curta', maxLength: 500, full: true, nullable: true, hint: 'Aparece no cartão e no topo da página do produto.' },
  { name: 'description', label: 'Descrição completa', type: 'textarea', rows: 6, nullable: true, hint: 'Parágrafos separados por uma linha em branco.' },
  { name: 'tags', label: 'Tags', type: 'tags', full: true, hint: 'Ajudam na pesquisa. Ex.: 5g, dual sim, carregamento rápido' },
  { name: 'isFeatured', label: 'Produto em destaque', type: 'checkbox' },
  { name: 'isNew', label: 'Marcar como novo', type: 'checkbox' },
  { name: 'isRecommended', label: 'Recomendado', type: 'checkbox' },
];
const pricingFields = [
  { name: 'originalPrice', label: 'Preço original', type: 'money', required: true, hint: 'Preço de referência (aparece riscado se houver desconto).' },
  { name: 'price', label: 'Preço de venda', type: 'money', required: true },
  { name: 'promoPrice', label: 'Preço promocional', type: 'money', nullable: true, hint: 'Opcional, tem de ser inferior ao preço de venda.' },
  { name: 'costPrice', label: 'Custo do produto', type: 'money', nullable: true, hint: 'Só visível na gestão; usado para margens.' },
  { name: 'promoStartsAt', label: 'Promoção desde', type: 'datetime', nullable: true },
  { name: 'promoEndsAt', label: 'Promoção até', type: 'datetime', nullable: true },
];
const stockFields = [
  { name: 'quantity', label: 'Quantidade em stock', type: 'number', min: 0, required: true },
  { name: 'minStock', label: 'Stock mínimo (alerta)', type: 'number', min: 0 },
  { name: 'maxStock', label: 'Stock máximo', type: 'number', min: 0 },
  { name: 'location', label: 'Localização no armazém', maxLength: 80 },
];
const physicalFields = [
  { name: 'weightGrams', label: 'Peso (g)', type: 'number', min: 0, nullable: true },
  { name: 'heightMm', label: 'Altura (mm)', type: 'number', min: 0, nullable: true },
  { name: 'widthMm', label: 'Largura (mm)', type: 'number', min: 0, nullable: true },
  { name: 'lengthMm', label: 'Comprimento (mm)', type: 'number', min: 0, nullable: true },
  { name: 'packageWeightGrams', label: 'Peso da embalagem (g)', type: 'number', min: 0, nullable: true },
  { name: 'packageHeightMm', label: 'Altura da embalagem (mm)', type: 'number', min: 0, nullable: true },
  { name: 'packageWidthMm', label: 'Largura da embalagem (mm)', type: 'number', min: 0, nullable: true },
  { name: 'packageLengthMm', label: 'Comprimento da embalagem (mm)', type: 'number', min: 0, nullable: true },
];
const warrantyFields = [
  { name: 'hasWarranty', label: 'Tem garantia', type: 'checkbox' },
  { name: 'warrantyMonths', label: 'Período de garantia (meses)', type: 'number', min: 1, max: 120, nullable: true },
  { name: 'warrantyTerms', label: 'Termos da garantia', type: 'textarea', rows: 3, nullable: true },
];
const seoFields = () => [
  ...(editId ? [{ name: 'slug', label: 'Slug (URL)', maxLength: 220, hint: 'Ex.: samsung-galaxy-s25-ultra' }] : [{ name: 'slug', label: 'Slug (URL)', maxLength: 220, hint: 'Opcional: gerado a partir do nome.' }]),
  { name: 'metaTitle', label: 'Meta title', maxLength: 70, nullable: true, hint: 'Até 70 caracteres.' },
  { name: 'metaDescription', label: 'Meta description', type: 'textarea', rows: 2, maxLength: 170, nullable: true, hint: 'Até 170 caracteres.' },
  { name: 'canonicalUrl', label: 'URL canónico', type: 'url', nullable: true },
];

// ------------------------------------------------------------------ carregar
async function start() {
  render(main, html`<div class="sk-stack"><div class="sk sk--line"></div><div class="sk sk--line"></div></div>`);
  try {
    [cats, brands] = await Promise.all([categoryOptions(), brandOptions()]);
    if (editId || dupId) product = await api.get(`/admin/products/${editId ?? dupId}`);
    if (dupId) product = duplicateFrom(product);
    specs = (product?.specifications ?? []).map((s) => ({ group: s.group ?? '', key: s.key, value: s.value, unit: s.unit ?? '' }));
    if (product && dupId) {
      kind = product.variants.length > 1 || Object.keys(product.variants[0]?.options ?? {}).length ? 'variants' : 'simple';
      generated = kind === 'variants' ? product.variants : [];
    }
    draw();
  } catch (err) {
    showError(main, err, start);
  }
}

/** Cópia para "Duplicar": novo nome/SKU, sem stock e sem imagens (as imagens são próprias de cada produto). */
function duplicateFrom(p) {
  return {
    ...p,
    id: undefined,
    name: `${p.name} (cópia)`,
    sku: `${p.sku}-COPIA`.slice(0, 64),
    slug: undefined,
    images: [],
    status: 'DRAFT',
    variants: p.variants.map((v) => ({ ...v, sku: `${v.sku}-C`.slice(0, 64), inventory: { quantity: 0, minStock: v.inventory?.minStock ?? 0 } })),
  };
}

const values = () => {
  const p = product ?? {};
  const v0 = p.variants?.find((v) => v.isDefault) ?? p.variants?.[0] ?? {};
  return {
    ...p,
    tags: (p.tags ?? []).map((t) => t.name ?? t),
    ...v0,
    ...(v0.inventory ?? {}),
    id: p.id,
    sku: p.sku,
    name: p.name,
    hasWarranty: p.hasWarranty,
  };
};

// ------------------------------------------------------------------ desenho
function section(title, desc, body, id) {
  return html`<section class="panel form-section" ${id ? html`id="${id}"` : ''}><h2>${title}</h2>${desc ? html`<p>${desc}</p>` : ''}${body}</section>`;
}

function draw() {
  const v = values();
  const isEdit = Boolean(editId);
  setSeo({ title: isEdit ? `Editar ${product.name}` : 'Novo produto' });
  render(
    main,
    html`<form id="product-form" novalidate>
      <div class="adm-head">
        <p><a href="products.html">← Produtos</a>${isEdit ? html` · ${badge(PRODUCT_STATUS, product.status)} · <a href="../product.html?slug=${product.slug}" target="_blank" rel="noopener">Ver na loja</a>` : ''}</p>
      </div>
      <div class="form-error" role="alert" tabindex="-1"></div>
      ${section('Informações', null, fieldsHtml(infoFields(), v, 'pi'))}
      ${isEdit ? section('Variantes, preços e stock', 'Cada variante tem SKU, preço e stock próprios. O stock altera-se pelos movimentos de inventário (auditados).', html`<div id="variants-edit"></div>`) : creationPricing(v)}
      ${isEdit ? section('Imagens', 'A primeira (principal) aparece nos cartões. Pode associar imagens a uma variante (ex.: cor).', html`<div id="images"></div>`, 'images-section') : section('Imagens', null, html`<p class="notice">${icon('image', { size: 18 })}Guarde o rascunho para começar a carregar imagens.</p>`)}
      ${section('Especificações', 'Características técnicas livres por produto (ex.: Bluetooth 5.3, Bateria 40 h). As marcadas como filtráveis aparecem nos filtros da loja.', html`<div id="specs"></div>`)}
      ${section('Garantia', null, fieldsHtml(warrantyFields, v, 'pw'))}
      ${section('SEO', 'Como o produto aparece no Google e nas redes sociais.', fieldsHtml(seoFields(), v, 'ps'))}
      <div class="sticky-actions">
        ${isEdit ? '' : html`<a class="btn" href="products.html">Cancelar</a>`}
        <button class="btn" type="submit" data-intent="draft">${isEdit ? 'Guardar alterações' : 'Salvar rascunho'}</button>
        ${!isEdit || product.status !== 'ACTIVE' ? html`<button class="btn btn--primary" type="submit" data-intent="publish">Publicar</button>` : ''}
      </div>
    </form>`,
  );
  enhanceForm($('#product-form'));
  drawSpecs();
  if (isEdit) {
    drawVariantsEdit();
    drawImages();
  } else drawCreation();
}

// ------------------------------------------------------------------ criação: simples vs variantes
function creationPricing(v) {
  return section(
    'Preço, stock e variantes',
    null,
    html`<div class="chips" role="radiogroup" aria-label="Tipo de produto" style="margin-bottom:14px">
        <button type="button" class="chip" role="radio" data-kind="simple" aria-checked="${kind === 'simple'}" aria-pressed="${kind === 'simple'}">Produto simples</button>
        <button type="button" class="chip" role="radio" data-kind="variants" aria-checked="${kind === 'variants'}" aria-pressed="${kind === 'variants'}">Com variantes (cor, armazenamento…)</button>
      </div>
      <div id="kind-simple" ${kind !== 'simple' ? html`hidden` : ''}>
        <h3>Preço</h3>${fieldsHtml(pricingFields, v, 'pp')}
        <h3>Stock</h3>${fieldsHtml(stockFields, { quantity: v.quantity ?? 0, minStock: v.minStock ?? 0, maxStock: v.maxStock, location: v.location }, 'pk')}
        <h3>Peso e dimensões</h3>${fieldsHtml(physicalFields, v, 'pf')}
      </div>
      <div id="kind-variants" ${kind !== 'variants' ? html`hidden` : ''}></div>`,
  );
}

function drawCreation() {
  const box = $('#kind-variants');
  render(
    box,
    html`<p class="field__hint">1. Defina os eixos e os valores. 2. Gere as combinações. 3. Preencha SKU, preços e stock de cada uma.</p>
      <div class="rows-editor" id="axes">${axes.map(
        (a, i) => html`<div class="rows-editor__row" style="grid-template-columns: 200px 1fr auto">
          <select class="select" data-axis-key="${i}" aria-label="Eixo ${i + 1}">${AXIS_PRESETS.map(([k, l]) => html`<option value="${k}" ${a.key === k ? html`selected` : ''}>${l}</option>`)}</select>
          <input class="input" data-axis-values="${i}" value="${a.values}" placeholder="Valores separados por vírgula, ex.: Preto, Branco, Azul" aria-label="Valores de ${optionLabel(a.key)}">
          <button type="button" class="btn btn--sm btn--ghost" data-axis-del="${i}" aria-label="Remover eixo">${icon('trash', { size: 16 })}</button>
        </div>`,
      )}</div>
      <div style="display:flex;gap:8px;margin:10px 0 16px"><button type="button" class="btn btn--sm" id="axis-add" ${axes.length >= 3 ? html`disabled` : ''}>+ Eixo</button><button type="button" class="btn btn--sm btn--dark" id="gen">Gerar combinações</button></div>
      ${generated.length
        ? html`<div class="table-wrap"><table class="table variant-table"><thead><tr><th>Variante</th><th>SKU</th><th>Preço original</th><th>Preço de venda</th><th>Custo</th><th>Stock</th><th>Peso (g)</th><th>Padrão</th><th></th></tr></thead><tbody>${generated.map(
            (g, i) => html`<tr data-gen="${i}">
              <td><strong>${Object.values(g.options).join(' / ')}</strong></td>
              <td><input class="input" data-f="sku" value="${g.sku ?? ''}" aria-label="SKU"></td>
              <td><input class="input" data-f="originalPrice" inputmode="decimal" value="${centsToInput(g.originalPrice)}" aria-label="Preço original (MZN)"></td>
              <td><input class="input" data-f="price" inputmode="decimal" value="${centsToInput(g.price)}" aria-label="Preço de venda (MZN)"></td>
              <td><input class="input" data-f="costPrice" inputmode="decimal" value="${centsToInput(g.costPrice)}" aria-label="Custo (MZN)"></td>
              <td><input class="input" data-f="quantity" type="number" min="0" value="${g.inventory?.quantity ?? g.quantity ?? 0}" aria-label="Stock"></td>
              <td><input class="input" data-f="weightGrams" type="number" min="0" value="${g.weightGrams ?? ''}" aria-label="Peso"></td>
              <td><input type="radio" name="gen-default" value="${i}" ${g.isDefault || (i === 0 && !generated.some((x) => x.isDefault)) ? html`checked` : ''} aria-label="Variante padrão"></td>
              <td><button type="button" class="btn btn--sm btn--ghost" data-gen-del="${i}" aria-label="Remover">${icon('trash', { size: 16 })}</button></td>
            </tr>`,
          )}</tbody></table></div>
          <p class="field__hint">Preços em MZN. Dica: preencha a primeira linha e use “Copiar preços para todas”. <button type="button" class="link-btn" id="copy-prices">Copiar preços para todas</button></p>`
        : ''}`,
  );
}

/** Lê a tabela gerada. Preços ficam SEMPRE em centavos no estado (o input mostra MZN). */
const MONEY_FIELDS = new Set(['originalPrice', 'price', 'costPrice']);
function collectGenerated() {
  $$('[data-gen]').forEach((tr) => {
    const g = generated[Number(tr.dataset.gen)];
    for (const input of $$('[data-f]', tr)) {
      const f = input.dataset.f;
      if (MONEY_FIELDS.has(f)) g[f] = input.value.trim() === '' ? null : parseMoneyInput(input.value);
      else if (f === 'quantity' || f === 'weightGrams') g[f] = input.value === '' ? null : Number(input.value);
      else g[f] = input.value.trim();
    }
  });
  const def = $('input[name="gen-default"]:checked')?.value;
  generated.forEach((g, i) => (g.isDefault = String(i) === def));
}

function combinations() {
  const clean = axes.map((a) => ({ key: a.key, values: [...new Set(a.values.split(',').map((x) => x.trim()).filter(Boolean))] })).filter((a) => a.values.length);
  if (!clean.length) return [];
  return clean.reduce((acc, a) => acc.flatMap((o) => a.values.map((val) => ({ ...o, [a.key]: val }))), [{}]);
}

const skuPart = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6);

// ------------------------------------------------------------------ edição de variantes
function drawVariantsEdit() {
  const box = $('#variants-edit');
  const vs = product.variants;
  render(
    box,
    html`<div class="table-wrap"><table class="table variant-table"><thead><tr><th>Variante</th><th>SKU</th><th>Preço original</th><th>Preço</th><th>Promo</th><th>Custo</th><th>Peso (g)</th><th class="num">Stock</th><th>Ativa</th><th></th></tr></thead><tbody>${vs.map(
      (v) => html`<tr data-variant="${v.id}">
        <td><strong>${v.name || Object.values(v.options).join(' / ') || 'Padrão'}</strong>${v.isDefault ? html`<br><span class="badge badge--info">Padrão</span>` : ''}</td>
        <td><input class="input" data-f="sku" value="${v.sku}" aria-label="SKU"></td>
        <td><input class="input" data-f="originalPrice" inputmode="decimal" value="${centsToInput(v.originalPrice)}" aria-label="Preço original (MZN)"></td>
        <td><input class="input" data-f="price" inputmode="decimal" value="${centsToInput(v.price)}" aria-label="Preço (MZN)"></td>
        <td><input class="input" data-f="promoPrice" inputmode="decimal" value="${centsToInput(v.promoPrice)}" aria-label="Preço promocional (MZN)"></td>
        <td><input class="input" data-f="costPrice" inputmode="decimal" value="${centsToInput(v.costPrice)}" aria-label="Custo (MZN)"></td>
        <td><input class="input" data-f="weightGrams" type="number" min="0" value="${v.weightGrams ?? ''}" aria-label="Peso"></td>
        <td class="num"><strong>${v.inventory?.available ?? 0}</strong><br><small class="muted">${v.inventory?.quantity ?? 0} total · ${v.inventory?.reserved ?? 0} reserv.</small><br>${hasPermission('inventory:manage') ? html`<button type="button" class="link-btn" data-stock="${v.id}">Ajustar</button>` : ''}</td>
        <td><input type="checkbox" data-f="isActive" ${v.isActive ? html`checked` : ''} aria-label="Ativa"></td>
        <td><div class="dt__row-actions"><button type="button" class="btn btn--sm" data-save-variant="${v.id}">Guardar</button>${vs.length > 1 ? html`<button type="button" class="btn btn--sm btn--ghost dt__danger" data-del-variant="${v.id}" aria-label="Remover variante">${icon('trash', { size: 16 })}</button>` : ''}</div></td>
      </tr>`,
    )}</tbody></table></div>
    <p class="field__hint">Preços em MZN. Cada linha guarda-se de forma independente.</p>
    <button type="button" class="btn btn--sm" id="variant-add">+ Adicionar variante</button>
    <h3 style="margin-top:18px">Peso e dimensões (variante padrão)</h3>
    <p class="field__hint">Usados no cálculo da entrega e mostrados na página do produto.</p>
    ${fieldsHtml(physicalFields, product.variants.find((x) => x.isDefault) ?? product.variants[0], 'pf')}
    <button type="button" class="btn btn--sm" id="save-physical">Guardar peso e dimensões</button>`,
  );
}

function variantPatch(tr, v) {
  const body = {};
  for (const input of $$('[data-f]', tr)) {
    const f = input.dataset.f;
    if (f === 'isActive') {
      if (input.checked !== v.isActive) body.isActive = input.checked;
      continue;
    }
    if (f === 'sku') {
      if (input.value.trim().toUpperCase() !== v.sku) body.sku = input.value.trim().toUpperCase();
      continue;
    }
    if (f === 'weightGrams') {
      const n = input.value === '' ? null : Number(input.value);
      if (n !== v.weightGrams) body.weightGrams = n;
      continue;
    }
    const cents = input.value.trim() === '' ? null : parseMoneyInput(input.value);
    if (cents !== null && !Number.isFinite(cents)) throw Object.assign(new Error('bad'), { friendly: `Valor inválido em ${f}` });
    if (cents !== v[f]) body[f] = cents;
  }
  return body;
}

async function stockModal(variant) {
  const form = document.createElement('form');
  form.id = 'stock-form';
  render(
    form,
    html`<p>Disponível: <strong>${variant.inventory?.available ?? 0}</strong> (total ${variant.inventory?.quantity ?? 0}, reservado ${variant.inventory?.reserved ?? 0})</p>
      <div class="form-error" role="alert"></div>
      <div class="form-grid form-grid--2">
        <div class="field"><label for="mv-type">Tipo de movimento</label><select class="select" id="mv-type" name="type"><option value="PURCHASE">Entrada — compra ao fornecedor</option><option value="ADJUSTMENT_IN">Ajuste (+)</option><option value="ADJUSTMENT_OUT">Ajuste (−)</option><option value="DAMAGED">Produto danificado (−)</option><option value="RETURN">Devolução (+)</option></select></div>
        <div class="field"><label for="mv-qty">Quantidade</label><input class="input" id="mv-qty" name="quantity" type="number" min="1" required></div>
        <div class="field field--full"><label for="mv-reason">Motivo</label><input class="input" id="mv-reason" name="reason" required minlength="3" placeholder="Ex.: Fatura 1234 do fornecedor"></div>
      </div>`,
  );
  const m = openModal({ title: `Stock — ${variant.sku}`, body: form, actions: [{ label: 'Cancelar', onClick: ({ close }) => close() }, { label: 'Registar movimento', variant: 'primary', type: 'submit', form: 'stock-form' }] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(m.el.querySelector('[form="stock-form"]'), async () => {
      try {
        await api.post(`/admin/inventory/${variant.id}/movements`, { type: form.type.value, quantity: Number(form.quantity.value), reason: form.reason.value.trim() });
        m.close();
        toast('Movimento registado.');
        await reload();
      } catch (err) {
        render($('.form-error', form), err.friendly);
      }
    });
  });
}

async function addVariantModal() {
  const axesKeys = Object.keys(product.variants[0]?.options ?? {});
  const keys = axesKeys.length ? axesKeys : ['color'];
  const form = document.createElement('form');
  form.id = 'variant-form';
  render(
    form,
    html`<div class="form-error" role="alert"></div>
      <div class="form-grid form-grid--2">
        ${keys.map((k) => html`<div class="field"><label for="vo-${k}">${optionLabel(k)}</label><input class="input" id="vo-${k}" data-option="${k}" required></div>`)}
        <div class="field"><label for="vf-sku">SKU</label><input class="input" id="vf-sku" name="sku" required></div>
        <div class="field"><label for="vf-op">Preço original (MZN)</label><input class="input" id="vf-op" name="originalPrice" inputmode="decimal" required></div>
        <div class="field"><label for="vf-p">Preço de venda (MZN)</label><input class="input" id="vf-p" name="price" inputmode="decimal" required></div>
        <div class="field"><label for="vf-c">Custo (MZN)</label><input class="input" id="vf-c" name="costPrice" inputmode="decimal"></div>
        <div class="field"><label for="vf-q">Stock inicial</label><input class="input" id="vf-q" name="quantity" type="number" min="0" value="0"></div>
        <div class="field"><label for="vf-w">Peso (g)</label><input class="input" id="vf-w" name="weightGrams" type="number" min="0"></div>
      </div>`,
  );
  const m = openModal({ title: 'Nova variante', body: form, actions: [{ label: 'Cancelar', onClick: ({ close }) => close() }, { label: 'Adicionar variante', variant: 'primary', type: 'submit', form: 'variant-form' }] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const options = Object.fromEntries($$('[data-option]', form).map((i) => [i.dataset.option, i.value.trim()]));
    const body = {
      sku: form.sku.value.trim().toUpperCase(),
      name: Object.values(options).join(' / '),
      options,
      originalPrice: parseMoneyInput(form.originalPrice.value),
      price: parseMoneyInput(form.price.value),
      ...(form.costPrice.value ? { costPrice: parseMoneyInput(form.costPrice.value) } : {}),
      ...(form.weightGrams.value ? { weightGrams: Number(form.weightGrams.value) } : {}),
      stock: { quantity: Number(form.quantity.value || 0) },
    };
    busy(m.el.querySelector('[form="variant-form"]'), async () => {
      try {
        await api.post(`/admin/products/${product.id}/variants`, body);
        m.close();
        toast('Variante adicionada.');
        await reload();
      } catch (err) {
        render($('.form-error', form), err.friendly);
      }
    });
  });
}

// ------------------------------------------------------------------ imagens
function drawImages() {
  const box = $('#images');
  const imgs = [...product.images].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.sortOrder - b.sortOrder);
  const variantName = (id) => product.variants.find((v) => v.id === id)?.name ?? 'Variante';
  render(
    box,
    html`${imgs.length
        ? html`<ul class="gallery-admin">${imgs.map(
            (im, i) => html`<li class="${im.isMain ? 'is-main' : ''}" data-image="${im.id}">
              <img src="${im.thumbnailUrl ?? im.url}" alt="${im.altText ?? ''}">
              <span>${im.isMain ? html`<strong>Principal</strong>` : `#${i + 1}`}${im.variantId ? ` · ${variantName(im.variantId)}` : ''}</span>
              <div class="btns">
                <button type="button" class="btn btn--sm" data-img-move="-1" ${i === 0 ? html`disabled` : ''} aria-label="Mover para a esquerda">←</button>
                <button type="button" class="btn btn--sm" data-img-move="1" ${i === imgs.length - 1 ? html`disabled` : ''} aria-label="Mover para a direita">→</button>
                ${!im.isMain ? html`<button type="button" class="btn btn--sm" data-img-main>Principal</button>` : ''}
                <button type="button" class="btn btn--sm" data-img-edit>Editar</button>
                <button type="button" class="btn btn--sm dt__danger" data-img-del aria-label="Remover imagem">${icon('trash', { size: 14 })}</button>
              </div>
            </li>`,
          )}</ul>`
        : html`<p class="muted">Ainda sem imagens. É obrigatória pelo menos uma para publicar.</p>`}
      <label class="dropzone" id="dropzone">${icon('upload', { size: 22 })}<span>Arraste imagens para aqui ou <u>escolha ficheiros</u> (JPG, PNG, WebP).</span>
        <input type="file" id="img-input" class="sr-only" accept="image/jpeg,image/png,image/webp" multiple></label>
      ${product.variants.length > 1 ? html`<div class="field" style="margin-top:10px"><label for="img-variant">Associar as novas imagens à variante (opcional)</label><select class="select" id="img-variant"><option value="">Todas as variantes</option>${product.variants.map((v) => html`<option value="${v.id}">${v.name ?? v.sku}</option>`)}</select></div>` : ''}`,
  );
  const dz = $('#dropzone');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => (e.preventDefault(), dz.classList.add('is-over'))));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('is-over')));
  dz.addEventListener('drop', (e) => (e.preventDefault(), upload([...e.dataTransfer.files])));
  $('#img-input').addEventListener('change', (e) => upload([...e.target.files]));
}

async function upload(files) {
  const imgs = files.filter((f) => /image\/(jpeg|png|webp)/.test(f.type));
  if (!imgs.length) return toast('Escolha imagens JPG, PNG ou WebP.', { type: 'error' });
  const dz = $('#dropzone');
  dz.setAttribute('aria-busy', 'true');
  render($('span', dz), `A carregar ${imgs.length} imagem(ns)…`);
  try {
    await api.upload(`/admin/products/${product.id}/images`, imgs, { fields: { variantId: $('#img-variant')?.value || null, altText: product.name } });
    toast('Imagens carregadas.');
    await reload();
  } catch (err) {
    toastError(err);
    drawImages();
  }
}

async function imageAction(e) {
  const li = e.target.closest('[data-image]');
  if (!li) return false;
  const id = li.dataset.image;
  const im = product.images.find((x) => x.id === id);
  try {
    if (e.target.closest('[data-img-main]')) await api.patch(`/admin/products/${product.id}/images/${id}`, { isMain: true });
    else if (e.target.closest('[data-img-del]')) {
      if (!(await confirmDialog('Remover esta imagem?', { confirmLabel: 'Remover', danger: true }))) return true;
      await api.delete(`/admin/products/${product.id}/images/${id}`);
    } else if (e.target.closest('[data-img-move]')) {
      const order = [...product.images].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.sortOrder - b.sortOrder).map((x) => x.id);
      const i = order.indexOf(id);
      const j = i + Number(e.target.closest('[data-img-move]').dataset.imgMove);
      [order[i], order[j]] = [order[j], order[i]];
      await api.put(`/admin/products/${product.id}/images/order`, { imageIds: order });
    } else if (e.target.closest('[data-img-edit]')) {
      const form = document.createElement('form');
      form.id = 'img-form';
      render(form, html`<div class="field"><label for="im-alt">Texto alternativo (acessibilidade e SEO)</label><input class="input" id="im-alt" value="${im.altText ?? ''}" maxlength="200"></div>
        ${product.variants.length > 1 ? html`<div class="field"><label for="im-var">Variante</label><select class="select" id="im-var"><option value="">Todas</option>${product.variants.map((v) => html`<option value="${v.id}" ${im.variantId === v.id ? html`selected` : ''}>${v.name ?? v.sku}</option>`)}</select></div>` : ''}`);
      const m = openModal({ title: 'Editar imagem', body: form, size: 'sm', actions: [{ label: 'Cancelar', onClick: ({ close }) => close() }, { label: 'Guardar', variant: 'primary', type: 'submit', form: 'img-form' }] });
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        try {
          await api.patch(`/admin/products/${product.id}/images/${id}`, { altText: $('#im-alt', form).value.trim() || null, ...(product.variants.length > 1 ? { variantId: $('#im-var', form).value || null } : {}) });
          m.close();
          await reload();
        } catch (err) {
          toastError(err);
        }
      });
      return true;
    } else return true;
    await reload();
  } catch (err) {
    toastError(err);
  }
  return true;
}

// ------------------------------------------------------------------ especificações
function drawSpecs() {
  render(
    $('#specs'),
    html`<div class="rows-editor">${specs.map(
        (s, i) => html`<div class="rows-editor__row" data-spec="${i}" style="grid-template-columns: 1fr 1fr 1.2fr 90px auto">
          <input class="input" data-s="group" value="${s.group}" placeholder="Grupo (opcional)" aria-label="Grupo">
          <input class="input" data-s="key" value="${s.key}" placeholder="Nome, ex.: Bluetooth" aria-label="Nome da especificação">
          <input class="input" data-s="value" value="${s.value}" placeholder="Valor, ex.: 5.3" aria-label="Valor">
          <input class="input" data-s="unit" value="${s.unit}" placeholder="Unid." aria-label="Unidade">
          <button type="button" class="btn btn--sm btn--ghost" data-spec-del="${i}" aria-label="Remover especificação">${icon('trash', { size: 16 })}</button>
        </div>`,
      )}</div>
      <button type="button" class="btn btn--sm" id="spec-add" style="margin-top:10px">+ Adicionar especificação</button>`,
  );
}

function collectSpecs() {
  $$('[data-spec]').forEach((row) => {
    const s = specs[Number(row.dataset.spec)];
    for (const input of $$('[data-s]', row)) s[input.dataset.s] = input.value.trim();
  });
  return specs
    .filter((s) => s.key && s.value)
    .map((s, i) => {
      const n = Number(String(s.value).replace(',', '.'));
      return { ...(s.group ? { group: s.group } : {}), key: s.key, value: s.value, ...(s.unit ? { unit: s.unit } : {}), ...(Number.isFinite(n) ? { numericValue: n } : {}), sortOrder: i };
    });
}

// ------------------------------------------------------------------ guardar
async function reload() {
  product = await api.get(`/admin/products/${product.id}`);
  draw();
}

function buildCreateBody(form) {
  const info = readFields(form, infoFields(), { prefix: 'pi' });
  const warranty = readFields(form, warrantyFields, { prefix: 'pw' });
  const seo = readFields(form, seoFields(), { prefix: 'ps' });
  const errors = [...info.errors, ...warranty.errors, ...seo.errors];
  const body = { ...info.values, ...warranty.values, ...seo.values, sku: (info.values.sku ?? '').toUpperCase(), specifications: collectSpecs(), status: 'DRAFT' };
  if (kind === 'simple') {
    const pr = readFields(form, pricingFields, { prefix: 'pp' });
    const st = readFields(form, stockFields, { prefix: 'pk' });
    const ph = readFields(form, physicalFields, { prefix: 'pf' });
    errors.push(...pr.errors, ...st.errors, ...ph.errors);
    body.pricing = pr.values;
    body.stock = st.values;
    body.physical = ph.values;
  } else {
    collectGenerated();
    if (!generated.length) errors.push('Gere pelo menos uma variante');
    body.variants = generated.map((g) => ({
      sku: String(g.sku ?? '').trim().toUpperCase(),
      name: Object.values(g.options).join(' / '),
      options: g.options,
      originalPrice: g.originalPrice ?? null,
      price: g.price ?? null,
      ...(g.costPrice != null ? { costPrice: g.costPrice } : {}),
      ...(g.weightGrams ? { weightGrams: Number(g.weightGrams) } : {}),
      isDefault: Boolean(g.isDefault),
      stock: { quantity: Number(g.quantity ?? g.inventory?.quantity ?? 0) },
    }));
    if (body.variants.some((v) => !Number.isFinite(v.originalPrice) || !Number.isFinite(v.price))) errors.push('Preencha preços válidos em todas as variantes');
  }
  if (body.hasWarranty === false) delete body.warrantyMonths;
  if (!body.slug) delete body.slug;
  return { body, errors };
}

function buildUpdateBody(form) {
  const info = readFields(form, infoFields(), { prefix: 'pi', mode: 'edit' });
  const warranty = readFields(form, warrantyFields, { prefix: 'pw', mode: 'edit' });
  const seo = readFields(form, seoFields(), { prefix: 'ps', mode: 'edit' });
  const body = { ...info.values, ...warranty.values, ...seo.values, specifications: collectSpecs() };
  body.sku = String(body.sku ?? '').toUpperCase();
  if (!body.slug) delete body.slug;
  if (body.hasWarranty === false) body.warrantyMonths = null;
  return { body, errors: [...info.errors, ...warranty.errors, ...seo.errors] };
}

main.addEventListener('submit', (e) => {
  if (e.target.id !== 'product-form') return;
  e.preventDefault();
  const form = e.target;
  const intent = e.submitter?.dataset.intent ?? 'draft';
  const errBox = $('.form-error', form);
  busy(e.submitter, async () => {
    render(errBox, '');
    try {
      if (!editId) {
        const { body, errors } = buildCreateBody(form);
        if (errors.length) {
          render(errBox, errors.join(' · '));
          return errBox.focus();
        }
        const created = await api.post('/admin/products', body);
        toast('Rascunho guardado.');
        if (intent === 'publish') {
          try {
            await api.post(`/admin/products/${created.id}/publish`);
            toast('Produto publicado.');
          } catch (err) {
            toast(`${err.friendly} Adicione as imagens e publique.`, { type: 'info', timeout: 6000 });
          }
        }
        location.href = `product-form.html?id=${created.id}#images-section`;
        return;
      }
      const { body, errors } = buildUpdateBody(form);
      if (errors.length) {
        render(errBox, errors.join(' · '));
        return errBox.focus();
      }
      await api.patch(`/admin/products/${product.id}`, body);
      if (intent === 'publish') await api.post(`/admin/products/${product.id}/publish`);
      toast(intent === 'publish' ? 'Produto publicado.' : 'Alterações guardadas.');
      await reload();
    } catch (err) {
      markApiErrors(form, err, 'pi');
      errBox.focus();
    }
  });
});

main.addEventListener('click', async (e) => {
  const k = e.target.closest('[data-kind]');
  if (k) {
    kind = k.dataset.kind;
    $$('[data-kind]').forEach((b) => (b.setAttribute('aria-pressed', String(b === k)), b.setAttribute('aria-checked', String(b === k))));
    $('#kind-simple').hidden = kind !== 'simple';
    $('#kind-variants').hidden = kind !== 'variants';
    return;
  }
  if (e.target.closest('#axis-add')) {
    collectAxes();
    axes.push({ key: AXIS_PRESETS.find(([key]) => !axes.some((a) => a.key === key))?.[0] ?? 'size', values: '' });
    return drawCreation();
  }
  const ad = e.target.closest('[data-axis-del]');
  if (ad) {
    collectAxes();
    axes.splice(Number(ad.dataset.axisDel), 1);
    if (!axes.length) axes.push({ key: 'color', values: '' });
    return drawCreation();
  }
  if (e.target.closest('#gen')) {
    collectAxes();
    if (generated.length) collectGenerated();
    const base = ($('#pi-sku')?.value || 'SKU').toUpperCase();
    const previous = new Map(generated.map((g) => [JSON.stringify(g.options), g]));
    generated = combinations().map((options, i) => previous.get(JSON.stringify(options)) ?? { options, sku: `${base}-${Object.values(options).map(skuPart).join('-')}`, isDefault: i === 0, quantity: 0 });
    if (!generated.length) toast('Indique pelo menos um valor.', { type: 'error' });
    return drawCreation();
  }
  const gd = e.target.closest('[data-gen-del]');
  if (gd) {
    collectGenerated();
    generated.splice(Number(gd.dataset.genDel), 1);
    return drawCreation();
  }
  if (e.target.closest('#copy-prices')) {
    collectGenerated();
    const [first] = generated;
    generated.forEach((g) => ((g.originalPrice = first.originalPrice), (g.price = first.price), (g.costPrice = first.costPrice)));
    return drawCreation();
  }
  if (e.target.closest('#spec-add')) {
    collectSpecs();
    specs.push({ group: '', key: '', value: '', unit: '' });
    drawSpecs();
    $$('[data-spec]').at(-1)?.querySelector('[data-s="key"]').focus();
    return;
  }
  const sd = e.target.closest('[data-spec-del]');
  if (sd) {
    collectSpecs();
    specs.splice(Number(sd.dataset.specDel), 1);
    return drawSpecs();
  }
  const sv = e.target.closest('[data-save-variant]');
  if (sv) {
    const v = product.variants.find((x) => x.id === sv.dataset.saveVariant);
    return busy(sv, async () => {
      try {
        const body = variantPatch(sv.closest('tr'), v);
        if (!Object.keys(body).length) return toast('Sem alterações nesta variante.', { type: 'info' });
        await api.patch(`/admin/variants/${v.id}`, body);
        toast('Variante guardada.');
        await reload();
      } catch (err) {
        toastError(err);
      }
    });
  }
  const dv = e.target.closest('[data-del-variant]');
  if (dv && (await confirmDialog('Remover esta variante? Os pedidos antigos mantêm o histórico.', { confirmLabel: 'Remover', danger: true }))) {
    try {
      await api.delete(`/admin/variants/${dv.dataset.delVariant}`);
      toast('Variante removida.');
      return reload();
    } catch (err) {
      return toastError(err);
    }
  }
  const st = e.target.closest('[data-stock]');
  if (st) return stockModal(product.variants.find((x) => x.id === st.dataset.stock));
  if (e.target.closest('#variant-add')) return addVariantModal();
  if (e.target.closest('#save-physical')) {
    const v = product.variants.find((x) => x.isDefault) ?? product.variants[0];
    const { values: ph } = readFields(main, physicalFields, { prefix: 'pf', mode: 'edit' });
    return busy(e.target.closest('#save-physical'), async () => {
      try {
        await api.patch(`/admin/variants/${v.id}`, ph);
        toast('Peso e dimensões guardados.');
        await reload();
      } catch (err) {
        toastError(err);
      }
    });
  }
  if (await imageAction(e)) return;
});

function collectAxes() {
  axes = axes.map((a, i) => ({ key: $(`[data-axis-key="${i}"]`)?.value ?? a.key, values: $(`[data-axis-values="${i}"]`)?.value ?? a.values }));
}

start();
