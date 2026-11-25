import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { initPage } from '../layout.js';
import { catalogApi, productsApi, topCategories } from '../products.js';
import { pagination, productGrid, setSeo, showEmpty, showError, showLoading } from '../ui.js';
import { $, $$, centsToInput, debounce, formatMoney, html, optionLabel, parseMoneyInput, render, setParams } from '../utils.js';

await initPage();

const SORTS = [
  ['relevance', 'Relevância'],
  ['newest', 'Mais recentes'],
  ['best_selling', 'Mais vendidos'],
  ['price_asc', 'Preço: menor → maior'],
  ['price_desc', 'Preço: maior → menor'],
  ['rating', 'Melhor avaliação'],
  ['discount', 'Maior desconto'],
];
const MULTI = ['brand', 'color'];
const REPEATED = ['spec', 'option'];
const SINGLE = ['search', 'category', 'minPrice', 'maxPrice', 'minRating', 'inStock', 'onSale', 'isNew', 'sort', 'page', 'promotion'];

/** Estado dos filtros = query string (URLs partilháveis, botão "voltar" funciona). */
function readState() {
  const p = new URLSearchParams(location.search);
  const s = {};
  SINGLE.forEach((k) => p.get(k) && (s[k] = p.get(k)));
  MULTI.forEach((k) => (s[k] = (p.get(k) ?? '').split(',').filter(Boolean)));
  REPEATED.forEach((k) => (s[k] = p.getAll(k)));
  s.page = Number(s.page ?? 1);
  return s;
}

function writeState(s, { resetPage = true } = {}) {
  setParams({
    ...Object.fromEntries(SINGLE.map((k) => [k, s[k]])),
    brand: s.brand.join(','),
    color: s.color.join(','),
    spec: s.spec,
    option: s.option,
    page: resetPage ? undefined : s.page > 1 ? s.page : undefined,
  });
  refresh();
}

function apiQuery(s) {
  return {
    search: s.search,
    category: s.category,
    brand: s.brand.length ? s.brand.join(',') : undefined,
    color: s.color.length ? s.color.join(',') : undefined,
    minPrice: s.minPrice,
    maxPrice: s.maxPrice,
    minRating: s.minRating,
    inStock: s.inStock,
    onSale: s.onSale,
    isNew: s.isNew,
    spec: s.spec,
    option: s.option,
    sort: s.sort,
    page: s.page,
    limit: CONFIG.PAGE_SIZE,
  };
}

// ------------------------------------------------------------------ cabeçalho / título
let categoryInfo = null;
async function renderHead(s) {
  const titleEl = $('#shop-title');
  const crumbs = $('#crumbs');
  let title = 'Todos os produtos';
  let crumbItems = [];
  if (s.category) {
    try {
      categoryInfo = categoryInfo?.slug === s.category ? categoryInfo : await catalogApi.category(s.category);
      title = categoryInfo.name;
      crumbItems = categoryInfo.breadcrumb.filter((c, i) => i > 0 || categoryInfo.breadcrumb.length === 1);
    } catch {
      title = 'Categoria';
    }
  }
  if (s.search) title = `Resultados para “${s.search}”`;
  else if (s.onSale === 'true' && !s.category) title = 'Ofertas';
  render(titleEl, title);
  render(
    crumbs,
    html`<ol><li><a href="index.html">Início</a></li><li><a href="shop.html">Produtos</a></li>${crumbItems.map((c, i) => (i === crumbItems.length - 1 ? html`<li aria-current="page">${c.name}</li>` : html`<li><a href="shop.html?category=${c.slug}">${c.name}</a></li>`))}</ol>`,
  );
  setSeo({ title, description: `${title} — compre online com entrega em todo o país. ${CONFIG.STORE_NAME}.`, url: location.href });
}

// ------------------------------------------------------------------ filtros
async function renderFilters(s, facets) {
  const tree = topCategories(await catalogApi.categories().catch(() => []));
  const focusedName = document.activeElement?.closest('.filters') ? document.activeElement.id : null;
  const colors = facets?.options?.find((o) => o.key === 'color');
  const otherOptions = (facets?.options ?? []).filter((o) => o.key !== 'color' && o.values.length > 1).slice(0, 3);
  const specs = (facets?.specifications ?? []).filter((x) => x.values.length > 0).slice(0, 6);
  const checked = (cond) => (cond ? html`checked` : '');

  const catList = (cats, depth = 0) =>
    html`<ul class="filter-cats ${depth ? 'is-sub' : ''}">${cats.map(
      (c) => html`<li><a href="#" data-cat="${c.slug}" class="${s.category === c.slug ? 'is-active' : ''}" ${s.category === c.slug ? html`aria-current="true"` : ''}>${c.name}</a>${c.children?.length && (depth === 0 || s.category === c.slug) ? catList(c.children, depth + 1) : ''}</li>`,
    )}</ul>`;

  const group = (title, body, open = true) => html`<details class="filter" ${open ? html`open` : ''}><summary>${title}${icon('chevronDown', { size: 16 })}</summary><div class="filter__body">${body}</div></details>`;

  const content = html`
    ${group('Categoria', html`<a href="#" data-cat="" class="filter-all ${!s.category ? 'is-active' : ''}">Todas</a>${catList(tree)}`)}
    ${group(
      'Preço (MZN)',
      html`<form class="price-range" data-price>
        <label class="sr-only" for="f-min">Preço mínimo</label><input class="input" id="f-min" name="min" inputmode="decimal" placeholder="${facets ? formatMoney(facets.price.min).replace(` ${CONFIG.STORE_CURRENCY}`, '') : 'Mín.'}" value="${centsToInput(s.minPrice ? Number(s.minPrice) : null)}">
        <span aria-hidden="true">–</span>
        <label class="sr-only" for="f-max">Preço máximo</label><input class="input" id="f-max" name="max" inputmode="decimal" placeholder="${facets ? formatMoney(facets.price.max).replace(` ${CONFIG.STORE_CURRENCY}`, '') : 'Máx.'}" value="${centsToInput(s.maxPrice ? Number(s.maxPrice) : null)}">
        <button class="btn btn--sm btn--dark" type="submit">Aplicar</button>
      </form>`,
    )}
    ${facets?.brands?.length
      ? group(
          'Marca',
          html`${facets.brands.map((b) => html`<label class="check"><input type="checkbox" id="f-brand-${b.slug}" data-multi="brand" value="${b.slug}" ${checked(s.brand.includes(b.slug))}>${b.name}<span class="filter__count">${b.count}</span></label>`)}`,
        )
      : ''}
    ${group(
      'Avaliação',
      html`${[4, 3, 2].map((r) => html`<label class="check"><input type="radio" name="minRating" id="f-rating-${r}" data-single="minRating" value="${r}" ${checked(s.minRating === String(r))}>${r}+ estrelas</label>`)}
        <label class="check"><input type="radio" name="minRating" id="f-rating-0" data-single="minRating" value="" ${checked(!s.minRating)}>Qualquer</label>`,
    )}
    ${group(
      'Disponibilidade',
      html`<label class="check"><input type="checkbox" id="f-instock" data-flag="inStock" ${checked(s.inStock === 'true')}>Só com stock</label>
        <label class="check"><input type="checkbox" id="f-onsale" data-flag="onSale" ${checked(s.onSale === 'true')}>Em promoção</label>
        <label class="check"><input type="checkbox" id="f-new" data-flag="isNew" ${checked(s.isNew === 'true')}>Novidades</label>`,
    )}
    ${colors?.values.length
      ? group(
          'Cor',
          html`<div class="chips">${colors.values.map((c) => html`<button type="button" class="chip" id="f-color-${c.value}" data-multi-chip="color" data-value="${c.value}" aria-pressed="${s.color.includes(c.value)}">${c.value}</button>`)}</div>`,
        )
      : ''}
    ${otherOptions.map((o) =>
      group(
        optionLabel(o.key),
        html`<div class="chips">${o.values.map((v) => {
          const token = `${o.key}:${v.value}`;
          return html`<button type="button" class="chip" data-repeat="option" data-value="${token}" aria-pressed="${s.option.includes(token)}">${v.value}</button>`;
        })}</div>`,
        false,
      ),
    )}
    ${specs.length
      ? group(
          'Características',
          html`${specs.map(
            (sp) => html`<fieldset class="spec-filter"><legend>${sp.key}</legend>${sp.values.slice(0, 8).map((v) => {
              const token = `${sp.key}:${v.value}`;
              return html`<label class="check"><input type="checkbox" data-repeat-check="spec" value="${token}" ${checked(s.spec.includes(token))}>${v.value}<span class="filter__count">${v.count}</span></label>`;
            })}</fieldset>`,
          )}`,
          false,
        )
      : ''}`;

  $$('[data-filters]').forEach((el) => render(el, content));
  if (focusedName) document.getElementById(focusedName)?.focus();
}

function bindFilters() {
  const handler = (e) => {
    const s = readState();
    const cat = e.target.closest('[data-cat]');
    if (cat && e.type === 'click') {
      e.preventDefault();
      s.category = cat.dataset.cat || undefined;
      categoryInfo = null;
      closeFilterDrawer();
      return writeState(s);
    }
    const t = e.target;
    if (e.type === 'change' && t.dataset.multi) {
      s[t.dataset.multi] = t.checked ? [...s[t.dataset.multi], t.value] : s[t.dataset.multi].filter((x) => x !== t.value);
      return writeState(s);
    }
    if (e.type === 'change' && t.dataset.single) {
      s[t.dataset.single] = t.value || undefined;
      return writeState(s);
    }
    if (e.type === 'change' && t.dataset.flag) {
      s[t.dataset.flag] = t.checked ? 'true' : undefined;
      return writeState(s);
    }
    if (e.type === 'change' && t.dataset.repeatCheck) {
      const k = t.dataset.repeatCheck;
      s[k] = t.checked ? [...s[k], t.value] : s[k].filter((x) => x !== t.value);
      return writeState(s);
    }
    const chip = e.target.closest('[data-multi-chip], [data-repeat]');
    if (chip && e.type === 'click') {
      const k = chip.dataset.multiChip ?? chip.dataset.repeat;
      const v = chip.dataset.value;
      s[k] = s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v];
      return writeState(s);
    }
  };
  $$('[data-filters]').forEach((el) => {
    el.addEventListener('click', handler);
    el.addEventListener('change', handler);
    el.addEventListener('submit', (e) => {
      if (!e.target.matches('[data-price]')) return;
      e.preventDefault();
      const s = readState();
      const min = parseMoneyInput(e.target.min.value);
      const max = parseMoneyInput(e.target.max.value);
      s.minPrice = Number.isFinite(min) && min !== null ? String(min) : undefined;
      s.maxPrice = Number.isFinite(max) && max !== null ? String(max) : undefined;
      closeFilterDrawer();
      writeState(s);
    });
  });
}

// ------------------------------------------------------------------ chips de filtros ativos
function renderActive(s) {
  const chips = [];
  const remove = (label, patch) => chips.push({ label, patch });
  if (s.search) remove(`“${s.search}”`, { search: undefined });
  if (s.category) remove(categoryInfo?.name ?? s.category, { category: undefined });
  s.brand.forEach((b) => remove(`Marca: ${b}`, { brand: s.brand.filter((x) => x !== b) }));
  s.color.forEach((c) => remove(`Cor: ${c}`, { color: s.color.filter((x) => x !== c) }));
  s.option.forEach((o) => remove(o.replace(':', ': '), { option: s.option.filter((x) => x !== o) }));
  s.spec.forEach((o) => remove(o.replace(':', ': '), { spec: s.spec.filter((x) => x !== o) }));
  if (s.minPrice) remove(`Desde ${formatMoney(Number(s.minPrice))}`, { minPrice: undefined });
  if (s.maxPrice) remove(`Até ${formatMoney(Number(s.maxPrice))}`, { maxPrice: undefined });
  if (s.minRating) remove(`${s.minRating}+ estrelas`, { minRating: undefined });
  if (s.inStock) remove('Com stock', { inStock: undefined });
  if (s.onSale) remove('Em promoção', { onSale: undefined });
  if (s.isNew) remove('Novidades', { isNew: undefined });

  const el = $('#active-filters');
  render(
    el,
    chips.length
      ? html`${chips.map((c, i) => html`<button type="button" class="chip" data-remove="${i}" aria-label="Remover filtro ${c.label}">${c.label}${icon('close', { size: 14 })}</button>`)}<button type="button" class="link-btn" data-clear>Limpar filtros</button>`
      : '',
  );
  el.onclick = (e) => {
    const r = e.target.closest('[data-remove]');
    if (r) writeState({ ...s, ...chips[Number(r.dataset.remove)].patch });
    if (e.target.closest('[data-clear]')) writeState({ brand: [], color: [], spec: [], option: [], sort: s.sort, page: 1 });
  };
  $('#filter-count').textContent = chips.length ? String(chips.length) : '';
}

// ------------------------------------------------------------------ resultados
let requestId = 0;
async function refresh() {
  const s = readState();
  const myId = ++requestId;
  const grid = $('#results');
  showLoading(grid, 'cards', 8);
  renderActive(s);
  $('#sort').value = s.sort ?? 'relevance';

  if (s.promotion) return refreshPromotion(s, myId);
  renderHead(s).then(() => myId === requestId && renderActive(s));
  const query = apiQuery(s);
  try {
    const [{ items, meta }, facets] = await Promise.all([productsApi.list(query), productsApi.facets(query).catch(() => null)]);
    if (myId !== requestId) return;
    renderFilters(s, facets);
    render($('#result-count'), `${meta.total ?? items.length} ${meta.total === 1 ? 'produto' : 'produtos'}`);
    if (!items.length) {
      showEmpty(grid, { title: t('state.noProducts'), text: s.search ? 'Experimente outras palavras ou remova alguns filtros.' : 'Remova alguns filtros para ver mais produtos.', actionLabel: 'Ver todos os produtos', actionHref: 'shop.html' });
    } else render(grid, productGrid(items));
    pagination($('#pager'), meta, (page) => {
      writeState({ ...s, page }, { resetPage: false });
      $('#main').scrollIntoView({ behavior: 'smooth' });
    });
  } catch (err) {
    if (myId === requestId) showError(grid, err, refresh, 'Não foi possível carregar os produtos.');
  }
}

async function refreshPromotion(s, myId) {
  const grid = $('#results');
  try {
    // Aqui `data` = { promotion, products } (a lista vem dentro do objeto da promoção).
    const { items: data, meta } = await catalogApi.promotion(s.promotion, { page: s.page, limit: CONFIG.PAGE_SIZE });
    if (myId !== requestId) return;
    render($('#shop-title'), data.promotion.name);
    setSeo({ title: data.promotion.name, description: data.promotion.description ?? `Promoção ${data.promotion.name}`, url: location.href });
    render($('#crumbs'), html`<ol><li><a href="index.html">Início</a></li><li><a href="shop.html?onSale=true">Ofertas</a></li><li aria-current="page">${data.promotion.name}</li></ol>`);
    render($('#result-count'), `${meta.total} produtos · termina a ${new Date(data.promotion.endsAt).toLocaleDateString('pt-PT')}`);
    $$('[data-filters]').forEach((el) => render(el, html`<p class="muted">Promoção “${data.promotion.name}”. <a href="shop.html">Ver todos os produtos</a></p>`));
    data.products.length ? render(grid, productGrid(data.products)) : showEmpty(grid, { title: 'Esta promoção já não tem produtos disponíveis.' });
    pagination($('#pager'), meta, (page) => writeState({ ...s, page }, { resetPage: false }));
  } catch (err) {
    showError(grid, err, refresh, err.status === 404 ? 'Esta promoção terminou ou não existe.' : undefined);
  }
}

// ------------------------------------------------------------------ gaveta de filtros (mobile)
const drawer = $('#filter-drawer');
function openFilterDrawer() {
  drawer.classList.add('is-open');
  document.body.classList.add('no-scroll');
  $('[data-filter-close]', drawer).focus();
}
function closeFilterDrawer() {
  if (!drawer.classList.contains('is-open')) return;
  drawer.classList.remove('is-open');
  document.body.classList.remove('no-scroll');
  $('#open-filters').focus();
}
$('#open-filters').addEventListener('click', openFilterDrawer);
drawer.addEventListener('click', (e) => e.target.closest('[data-filter-close]') && closeFilterDrawer());
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeFilterDrawer());

render($('#sort'), html`${SORTS.map(([v, l]) => html`<option value="${v}">${l}</option>`)}`);
$('#sort').addEventListener('change', (e) => writeState({ ...readState(), sort: e.target.value === 'relevance' ? undefined : e.target.value }));
addEventListener('popstate', debounce(refresh, 50));
bindFilters();
refresh();
