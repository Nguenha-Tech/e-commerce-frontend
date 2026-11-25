import { currentUser, redirectToLogin } from '../auth.js';
import { addToCart } from '../cart.js';
import { CONFIG } from '../config.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import { initPage } from '../layout.js';
import { productsApi } from '../products.js';
import { reviewsApi } from '../reviews.js';
import { store } from '../store.js';
import { busy, openModal, pagination, priceTag, productGrid, setSeo, showError, stars, toast, toastError } from '../ui.js';
import { $, formatDate, formatNumber, html, optionLabel, params, render, timeAgo } from '../utils.js';
import { syncHearts, wishlistApi } from '../wishlist.js';

await initPage();

const root = $('#product');
const p = params();
let product;
let selected; // variante selecionada
let selection = {}; // { color: 'Preto', storage: '256GB' }
let imageIndex = 0;

async function loadProduct() {
  render(root, html`<div class="pd-skeleton"><div class="sk sk--img"></div><div class="sk-stack"><div class="sk sk--line"></div><div class="sk sk--line sk--short"></div><div class="sk sk--price"></div></div></div>`);
  try {
    product = p.get('slug') ? await productsApi.bySlug(p.get('slug')) : await productsApi.byId(p.get('id'));
  } catch (err) {
    if (err.status === 404) {
      render(root, html`<div class="state"><p class="state__title">Produto não encontrado</p><p class="state__text">O produto pode ter sido removido ou o link está incorreto.</p><a class="btn btn--primary" href="shop.html">Ver produtos</a></div>`);
      setSeo({ title: 'Produto não encontrado' });
      return;
    }
    return showError(root, err, loadProduct, 'Não foi possível carregar o produto.');
  }
  store.set('selectedProduct', product);
  const wanted = p.get('variant');
  selected = product.variants.find((v) => v.id === wanted) ?? product.variants.find((v) => v.isDefault) ?? product.variants[0];
  selection = { ...(selected?.options ?? {}) };
  renderProduct();
  seo();
  loadReviews();
  loadQuestions();
  loadRelated();
}

// ------------------------------------------------------------------ SEO
function seo() {
  const img = product.images[0]?.url;
  const url = new URL(`product.html?slug=${product.slug}`, location.href).toString();
  setSeo({
    title: product.seo?.metaTitle || product.name,
    description: product.seo?.metaDescription || product.shortDescription || `${product.name} — ${CONFIG.STORE_NAME}`,
    image: img,
    url,
    type: 'product',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      sku: product.sku,
      image: product.images.map((i) => i.url),
      description: product.shortDescription ?? product.description ?? undefined,
      brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
      ...(product.rating.count ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.rating.average, reviewCount: product.rating.count } } : {}),
      offers: product.variants.map((v) => ({
        '@type': 'Offer',
        sku: v.sku,
        priceCurrency: v.price.currency,
        price: (v.price.unit / 100).toFixed(2),
        availability: v.stock.maxPurchasable > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        url,
      })),
    },
  });
}

// ------------------------------------------------------------------ galeria
function galleryImages() {
  if (!product.images.length) return [];
  // Imagens da variante selecionada primeiro, depois as gerais.
  const own = product.images.filter((i) => i.variantId === selected?.id || i.id === selected?.imageId);
  const general = product.images.filter((i) => !i.variantId);
  const others = product.images.filter((i) => i.variantId && !own.includes(i));
  return [...own, ...general, ...others];
}

function renderGallery() {
  const imgs = galleryImages();
  const g = $('#gallery');
  if (!imgs.length) return render(g, html`<div class="gallery__main gallery__main--empty">${icon('image', { size: 48 })}</div>`);
  imageIndex = Math.min(imageIndex, imgs.length - 1);
  const img = imgs[imageIndex];
  render(
    g,
    html`<div class="gallery__main" id="zoom-area">
        <img src="${img.url}" alt="${img.altText || product.name}" id="main-img" width="${img.width ?? 800}" height="${img.height ?? 800}">
        <button class="gallery__zoom icon-btn" type="button" data-zoom aria-label="Ampliar imagem">${icon('zoom')}</button>
        ${imgs.length > 1
          ? html`<button class="gallery__arrow gallery__arrow--prev icon-btn" type="button" data-step="-1" aria-label="Imagem anterior">${icon('chevronLeft')}</button>
                 <button class="gallery__arrow gallery__arrow--next icon-btn" type="button" data-step="1" aria-label="Imagem seguinte">${icon('chevronRight')}</button>`
          : ''}
      </div>
      ${imgs.length > 1
        ? html`<ul class="gallery__thumbs" aria-label="Miniaturas">${imgs.map(
            (im, i) => html`<li><button type="button" class="gallery__thumb ${i === imageIndex ? 'is-active' : ''}" data-thumb="${i}" aria-label="Ver imagem ${i + 1}" aria-current="${i === imageIndex}"><img src="${im.thumbnailUrl ?? im.url}" alt="" loading="lazy"></button></li>`,
          )}</ul>`
        : ''}`,
  );
  // Zoom no desktop: a imagem segue o cursor.
  const area = $('#zoom-area');
  const main = $('#main-img');
  area.addEventListener('mousemove', (e) => {
    if (!matchMedia('(hover: hover) and (min-width: 1024px)').matches) return;
    const r = area.getBoundingClientRect();
    main.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    main.style.transform = 'scale(1.9)';
  });
  area.addEventListener('mouseleave', () => (main.style.transform = ''));
}

function openLightbox() {
  const imgs = galleryImages();
  let i = imageIndex;
  const body = document.createElement('div');
  body.className = 'lightbox';
  const draw = () =>
    render(
      body,
      html`<img src="${imgs[i].url}" alt="${imgs[i].altText || product.name}">
        ${imgs.length > 1 ? html`<div class="lightbox__nav"><button class="btn" type="button" data-lb="-1">${icon('chevronLeft')}Anterior</button><span>${i + 1} / ${imgs.length}</span><button class="btn" type="button" data-lb="1">Seguinte${icon('chevronRight')}</button></div>` : ''}`,
    );
  draw();
  body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]');
    if (b) ((i = (i + Number(b.dataset.lb) + imgs.length) % imgs.length), draw());
  });
  openModal({ title: product.name, body, size: 'lg' });
}

// ------------------------------------------------------------------ variantes
/** Variante que corresponde à seleção (todas as opções iguais). */
function matchVariant(sel) {
  return product.variants.find((v) => Object.entries(sel).every(([k, val]) => v.options[k] === val));
}

/** Existe alguma variante com esta opção, mantendo as restantes escolhas? */
function optionState(axis, value) {
  const candidate = product.variants.find((v) => v.options[axis] === value && Object.entries(selection).every(([k, val]) => k === axis || v.options[k] === val));
  if (!candidate) return 'none';
  return candidate.stock.maxPurchasable > 0 ? 'ok' : 'soldout';
}

function renderVariants() {
  const axes = Object.entries(product.optionAxes ?? {}).filter(([, values]) => values.length > 1 || product.variants.length > 1);
  if (product.variants.length <= 1 || !axes.length) return '';
  return html`${axes.map(
    ([axis, values]) => html`<fieldset class="variant-axis">
      <legend>${optionLabel(axis)}: <strong>${selection[axis] ?? '—'}</strong></legend>
      <div class="chips">${values.map((val) => {
        const st = optionState(axis, val);
        return html`<button type="button" class="chip variant-chip ${st !== 'ok' ? 'is-muted' : ''}" data-axis="${axis}" data-value="${val}" aria-pressed="${selection[axis] === val}" ${st === 'none' ? html`disabled` : ''} title="${st === 'soldout' ? 'Esgotado' : ''}">${val}${st === 'soldout' ? html`<span class="sr-only"> (esgotado)</span>` : ''}</button>`;
      })}</div>
    </fieldset>`,
  )}`;
}

function stockText(v) {
  if (!product.purchasable) return html`<p class="pd-stock is-out">${product.status === 'DISCONTINUED' ? 'Produto descontinuado' : 'Indisponível'}</p>`;
  if (!v || v.stock.maxPurchasable <= 0) return html`<p class="pd-stock is-out">${icon('close', { size: 16 })}${t('product.outOfStock')}</p>`;
  if (v.stock.level === 'LOW_STOCK') return html`<p class="pd-stock is-low">${icon('clock', { size: 16 })}Últimas ${v.stock.maxPurchasable} unidades</p>`;
  return html`<p class="pd-stock is-in">${icon('check', { size: 16 })}${t('product.inStock')}</p>`;
}

// ------------------------------------------------------------------ página
function topHtml() {
  const v = selected;
  const fav = store.get('wishlistIds').has(product.id);
  const canBuy = product.purchasable && v && v.stock.maxPurchasable > 0;
  return html`      <section class="pd__gallery" id="gallery" aria-label="Imagens do produto"></section>
      <section class="pd__info">
        ${product.brand ? html`<a class="pd__brand" href="shop.html?brand=${product.brand.slug}">${product.brand.name}</a>` : ''}
        <h1 class="pd__title">${product.name}</h1>
        <div class="pd__meta">
          <a href="#reviews" class="pd__rating">${stars(product.rating.average, undefined, { size: 16 })}<span>${product.rating.count ? `${product.rating.average.toFixed(1)} · ${formatNumber(product.rating.count)} avaliações` : 'Sem avaliações'}</span></a>
          <span class="muted">SKU: <span id="pd-sku">${v?.sku ?? product.sku}</span></span>
          ${product.soldCount ? html`<span class="muted">${formatNumber(product.soldCount)} vendidos</span>` : ''}
        </div>
        <div id="pd-price">${v ? priceTag({ amount: v.price.unit, compareAt: v.price.compareAt, discountPercent: v.price.discountPercent, currency: v.price.currency, size: 'lg' }) : ''}</div>
        ${v?.promotion ? html`<p class="pd-promo">${icon('percent', { size: 16 })}${v.promotion.name} · termina ${formatDate(v.promotion.endsAt)}</p>` : ''}
        <p class="muted pd__tax">IVA incluído. O total final é confirmado no checkout.</p>
        ${product.shortDescription ? html`<p class="pd__short">${product.shortDescription}</p>` : ''}

        <div class="pd__variants">${renderVariants()}</div>
        <div id="pd-stock">${stockText(v)}</div>

        <form class="pd__buy" id="buy-form">
          ${canBuy
            ? html`<div class="qty" role="group" aria-label="Quantidade">
                <button type="button" data-qty="-1" aria-label="Diminuir">${icon('minus', { size: 16 })}</button>
                <input type="number" id="qty" name="qty" value="1" min="1" max="${v.stock.maxPurchasable}" aria-label="Quantidade" inputmode="numeric">
                <button type="button" data-qty="1" aria-label="Aumentar">${icon('plus', { size: 16 })}</button>
              </div>
              <button class="btn btn--primary btn--lg" type="submit" data-intent="cart">${icon('cart', { size: 18 })}${t('product.addToCart')}</button>
              <button class="btn btn--dark btn--lg" type="submit" data-intent="buy">${t('product.buyNow')}</button>`
            : html`<button class="btn btn--lg" type="button" id="notify-me" ${!product.purchasable ? html`disabled` : ''}>${icon('bell', { size: 18 })}Avisar-me quando voltar ao stock</button>`}
        </form>
        <div class="pd__secondary">
          <button class="btn btn--ghost" type="button" data-action="toggle-wishlist" data-product="${product.id}" data-variant="${v?.id ?? ''}" aria-pressed="${fav}">${icon('heart', { size: 18 })}<span>${t('wishlist.add')}</span></button>
          <button class="btn btn--whatsapp" type="button" data-whatsapp="PRODUCT" data-product="${product.id}" data-variant="${v?.id ?? ''}">${icon('whatsapp', { size: 18 })}${t('product.askWhatsapp')}</button>
        </div>
        <ul class="pd__perks">
          <li>${icon('truck', { size: 18 })}Entrega em todo o país; preço e prazo calculados no checkout.</li>
          ${product.warranty?.months ? html`<li>${icon('shield', { size: 18 })}Garantia de ${product.warranty.months} meses.</li>` : ''}
          <li>${icon('return', { size: 18 })}Devolução a partir da sua conta. <a href="help.html#devolucoes">Saber mais</a></li>
        </ul>
      </section>
`;
}

/** Só a parte de cima (galeria, preço, variantes, compra) muda ao trocar de variante. */
function renderTop() {
  render($('#pd-top'), topHtml());
  renderGallery();
  renderSpecs();
  syncHearts(root);
  bindBuyForm();
}

function renderProduct() {
  const crumbs = $('#crumbs');
  render(
    crumbs,
    html`<ol><li><a href="index.html">Início</a></li><li><a href="shop.html?category=${product.category.slug}">${product.category.name}</a></li><li aria-current="page">${product.name}</li></ol>`,
  );

  render(
    root,
    html`<div class="pd" id="pd-top">${topHtml()}    </div>

    <nav class="tabs pd__tabs" aria-label="Secções do produto">
      <a class="tab" href="#descricao">Descrição</a>
      <a class="tab" href="#especificacoes">Especificações</a>
      <a class="tab" href="#reviews">Avaliações</a>
      <a class="tab" href="#perguntas">Perguntas</a>
    </nav>

    <div class="pd__details">
      <section id="descricao" class="panel">
        <h2 class="panel__title">Descrição</h2>
        <div class="prose">${product.description ? product.description.split(/\n{2,}/).map((para) => html`<p>${para}</p>`) : html`<p class="muted">Sem descrição.</p>`}</div>
        ${product.warranty?.months
          ? html`<h3>Garantia</h3><p>${product.warranty.months} meses${product.warranty.terms ? html`. ${product.warranty.terms}` : '.'}</p>`
          : ''}
      </section>
      <section id="especificacoes" class="panel">
        <h2 class="panel__title">Especificações</h2>
        <div id="specs"></div>
      </section>
    </div>

    <section id="reviews" class="panel pd__section" aria-labelledby="h-reviews"><h2 class="panel__title" id="h-reviews">Avaliações</h2><div id="reviews-body"></div></section>
    <section id="perguntas" class="panel pd__section" aria-labelledby="h-qa"><h2 class="panel__title" id="h-qa">Perguntas e respostas</h2><div id="qa-body"></div></section>
    <div id="related"></div>`,
  );
  renderGallery();
  renderSpecs();
  syncHearts(root);
  bindProduct();
  bindBuyForm();
}

function renderSpecs() {
  const v = selected;
  const physical = v?.physical ?? {};
  const dims = [physical.lengthMm, physical.widthMm, physical.heightMm].every((x) => x) ? `${physical.lengthMm} × ${physical.widthMm} × ${physical.heightMm} mm` : null;
  const extra = [
    physical.weightGrams ? { key: 'Peso', value: physical.weightGrams >= 1000 ? `${(physical.weightGrams / 1000).toFixed(2).replace('.', ',')} kg` : `${physical.weightGrams} g` } : null,
    dims ? { key: 'Dimensões', value: dims } : null,
    product.warranty?.months ? { key: 'Garantia', value: `${product.warranty.months} meses` } : null,
  ].filter(Boolean);
  const groups = [...product.specifications, ...(extra.length ? [{ group: 'Físico e garantia', items: extra.map((e) => ({ ...e, unit: null })) }] : [])];
  render(
    $('#specs'),
    groups.length
      ? html`${groups.map(
          (g) => html`<table class="spec-table"><caption>${g.group ?? 'Geral'}</caption><tbody>${g.items.map((s) => html`<tr><th scope="row">${s.key}</th><td>${s.value}${s.unit ? ` ${s.unit}` : ''}</td></tr>`)}</tbody></table>`,
        )}`
      : html`<p class="muted">Sem especificações registadas.</p>`,
  );
}

function selectVariant(v) {
  selected = v;
  imageIndex = 0;
  const url = new URL(location.href);
  if (v) url.searchParams.set('variant', v.id);
  history.replaceState(null, '', url);
  renderTop();
}

function bindProduct() {
  root.onclick = async (e) => {
    const chip = e.target.closest('[data-axis]');
    if (chip) {
      selection = { ...selection, [chip.dataset.axis]: chip.dataset.value };
      // Se a combinação não existe, escolhe a primeira variante com esta opção.
      const v = matchVariant(selection) ?? product.variants.find((x) => x.options[chip.dataset.axis] === chip.dataset.value);
      selection = { ...(v?.options ?? selection) };
      selectVariant(v);
      root.querySelector(`[data-axis="${chip.dataset.axis}"][data-value="${CSS.escape(chip.dataset.value)}"]`)?.focus();
      return;
    }
    const thumb = e.target.closest('[data-thumb]');
    if (thumb) return ((imageIndex = Number(thumb.dataset.thumb)), renderGallery());
    const step = e.target.closest('[data-step]');
    if (step) {
      const n = galleryImages().length;
      imageIndex = (imageIndex + Number(step.dataset.step) + n) % n;
      return renderGallery();
    }
    if (e.target.closest('[data-zoom]') || (e.target.id === 'main-img' && !matchMedia('(min-width: 1024px)').matches)) return openLightbox();
    const qtyBtn = e.target.closest('[data-qty]');
    if (qtyBtn) {
      const input = $('#qty');
      input.value = Math.min(Number(input.max), Math.max(1, Number(input.value || 1) + Number(qtyBtn.dataset.qty)));
      return;
    }
    if (e.target.closest('#notify-me')) {
      if (!currentUser()) return redirectToLogin();
      const b = e.target.closest('#notify-me');
      return busy(b, async () => {
        try {
          await wishlistApi.subscribeAlert(selected.id);
          toast('Vamos avisá-lo quando voltar ao stock.');
        } catch (err) {
          toastError(err);
        }
      });
    }
  };
}

function bindBuyForm() {
  $('#buy-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const intent = e.submitter?.dataset.intent ?? 'cart';
    const qty = Math.max(1, Math.min(Number($('#qty').max), Number($('#qty').value) || 1));
    busy(e.submitter, async () => {
      try {
        await addToCart(selected.id, qty, { silent: intent === 'buy' });
        if (intent === 'buy') location.href = 'checkout.html';
      } catch {
        /* toast já mostrado */
      }
    });
  });
}

// ------------------------------------------------------------------ avaliações
let reviewQuery = { page: 1, limit: 5, sort: 'newest' };
async function loadReviews() {
  const el = $('#reviews-body');
  if (!el) return;
  try {
    const [{ items, meta }, eligible] = await Promise.all([reviewsApi.list(product.id, reviewQuery), currentUser() ? reviewsApi.eligible().catch(() => []) : Promise.resolve([])]);
    const sum = meta.summary;
    const canReview = eligible.some((x) => x.productId === product.id);
    render(
      el,
      html`<div class="reviews">
        <div class="reviews__summary">
          <p class="reviews__avg">${sum.count ? sum.average.toFixed(1) : '—'}</p>
          ${stars(sum.average, undefined, { size: 18 })}
          <p class="muted">${sum.count ? `${formatNumber(sum.count)} avaliações` : 'Ainda sem avaliações'}</p>
          <ul class="dist">${[5, 4, 3, 2, 1].map((r) => {
            const n = sum.distribution[r] ?? 0;
            const pct = sum.count ? Math.round((n / sum.count) * 100) : 0;
            return html`<li><button type="button" class="dist__row ${reviewQuery.rating === r ? 'is-active' : ''}" data-rating="${r}" aria-label="Filtrar ${r} estrelas (${n})"><span>${r}★</span><span class="dist__bar"><span style="width:${pct}%"></span></span><span>${n}</span></button></li>`;
          })}</ul>
          ${canReview ? html`<button class="btn btn--primary btn--block" type="button" id="write-review">Avaliar este produto</button>` : currentUser() ? html`<p class="field__hint">Pode avaliar depois de receber este produto.</p>` : html`<p class="field__hint"><a href="login.html">Entre</a> para avaliar produtos que comprou.</p>`}
        </div>
        <div class="reviews__list">
          <div class="reviews__tools">
            <label class="sr-only" for="rv-sort">Ordenar avaliações</label>
            <select class="select" id="rv-sort"><option value="newest">Mais recentes</option><option value="rating_desc">Melhor nota</option><option value="rating_asc">Pior nota</option></select>
            <label class="check"><input type="checkbox" id="rv-photos" ${reviewQuery.withPhotos ? html`checked` : ''}>Com fotos</label>
            ${reviewQuery.rating ? html`<button type="button" class="chip" data-rating="">${reviewQuery.rating}★ ${icon('close', { size: 14 })}</button>` : ''}
          </div>
          ${items.length
            ? html`<ul class="review-list">${items.map(
                (r) => html`<li class="review">
                  <div class="review__head">${stars(r.rating)}<strong>${r.title ?? ''}</strong></div>
                  <p class="review__by">${r.author}${r.verifiedPurchase ? html` · <span class="badge badge--ok">Compra verificada</span>` : ''}${r.variant ? ` · ${r.variant}` : ''} · <time datetime="${r.createdAt}">${timeAgo(r.createdAt)}</time></p>
                  ${r.comment ? html`<p>${r.comment}</p>` : ''}
                  ${r.images?.length ? html`<div class="review__imgs">${r.images.map((im) => html`<a href="${im.url}" target="_blank" rel="noopener"><img src="${im.url}" alt="Foto da avaliação" loading="lazy"></a>`)}</div>` : ''}
                  ${r.adminReply ? html`<div class="review__reply"><strong>Resposta da loja</strong><p>${r.adminReply}</p></div>` : ''}
                  ${currentUser() ? html`<button class="link-btn review__report" type="button" data-report="${r.id}">Denunciar</button>` : ''}
                </li>`,
              )}</ul><div id="rv-pager"></div>`
            : html`<p class="muted">${sum.count ? 'Nenhuma avaliação com estes filtros.' : 'Seja o primeiro a avaliar depois de receber o produto.'}</p>`}
        </div>
      </div>`,
    );
    $('#rv-sort').value = reviewQuery.sort;
    $('#rv-sort').onchange = (e) => ((reviewQuery = { ...reviewQuery, sort: e.target.value, page: 1 }), loadReviews());
    $('#rv-photos').onchange = (e) => ((reviewQuery = { ...reviewQuery, withPhotos: e.target.checked || undefined, page: 1 }), loadReviews());
    el.onclick = async (e) => {
      const r = e.target.closest('[data-rating]');
      if (r) {
        const val = Number(r.dataset.rating) || undefined;
        reviewQuery = { ...reviewQuery, rating: reviewQuery.rating === val ? undefined : val, page: 1 };
        return loadReviews();
      }
      if (e.target.closest('#write-review')) return reviewForm();
      const rep = e.target.closest('[data-report]');
      if (rep) reportReview(rep.dataset.report);
    };
    if ($('#rv-pager')) pagination($('#rv-pager'), meta, (page) => ((reviewQuery = { ...reviewQuery, page }), loadReviews()));
  } catch (err) {
    showError(el, err, loadReviews);
  }
}

function reviewForm() {
  const form = document.createElement('form');
  form.id = 'review-form';
  render(
    form,
    html`<fieldset class="star-input"><legend class="field__label">A sua nota</legend>
        ${[5, 4, 3, 2, 1].map((n) => html`<input type="radio" name="rating" id="star-${n}" value="${n}" ${n === 5 ? html`checked` : ''} class="sr-only"><label for="star-${n}" title="${n} estrelas">${icon('star', { size: 30 })}<span class="sr-only">${n} estrelas</span></label>`)}
      </fieldset>
      <div class="field"><label for="rv-title">Título (opcional)</label><input class="input" id="rv-title" name="title" maxlength="120"></div>
      <div class="field"><label for="rv-comment">A sua avaliação</label><textarea class="textarea" id="rv-comment" name="comment" maxlength="3000" placeholder="Escreva a sua avaliação…"></textarea></div>
      <div class="field"><label for="rv-files">Adicionar fotos (opcional)</label><input class="input" id="rv-files" type="file" accept="image/jpeg,image/png,image/webp" multiple><span class="field__hint">Até 5 fotografias JPG, PNG ou WebP.</span></div>
      <div class="form-error" role="alert"></div>`,
  );
  const m = openModal({
    title: 'Avaliar produto',
    body: form,
    actions: [
      { label: 'Cancelar', onClick: ({ close }) => close() },
      { label: 'Enviar avaliação', variant: 'primary', type: 'submit', form: 'review-form' },
    ],
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const submit = m.el.querySelector('[form="review-form"]');
    busy(submit, async () => {
      try {
        const files = [...$('#rv-files', form).files].slice(0, 5);
        const images = files.length ? (await reviewsApi.uploadImages(files)).map((f) => ({ storageKey: f.storageKey })) : [];
        const fd = new FormData(form);
        const body = { rating: Number(fd.get('rating')), images };
        if (fd.get('title')?.trim()) body.title = fd.get('title').trim();
        if (fd.get('comment')?.trim()) body.comment = fd.get('comment').trim();
        const review = await reviewsApi.create(product.id, body);
        m.close();
        toast(review.status === 'PENDING' ? 'Avaliação enviada — será publicada após moderação.' : 'Avaliação publicada. Obrigado!');
        loadReviews();
      } catch (err) {
        render($('.form-error', form), err.friendly);
      }
    });
  });
}

function reportReview(id) {
  const form = document.createElement('form');
  form.id = 'report-form';
  render(form, html`<div class="field"><label for="rep-reason">Motivo</label><textarea class="textarea" id="rep-reason" name="reason" required minlength="3" maxlength="300"></textarea></div>`);
  const m = openModal({ title: 'Denunciar avaliação', body: form, size: 'sm', actions: [{ label: 'Cancelar', onClick: ({ close }) => close() }, { label: 'Denunciar', variant: 'danger', type: 'submit', form: 'report-form' }] });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await reviewsApi.report(id, form.reason.value.trim());
      m.close();
      toast('Obrigado. A equipa vai analisar.');
    } catch (err) {
      toastError(err);
    }
  });
}

// ------------------------------------------------------------------ perguntas
let qaPage = 1;
async function loadQuestions() {
  const el = $('#qa-body');
  if (!el) return;
  try {
    const { items, meta } = await reviewsApi.questions(product.id, { page: qaPage, limit: 5 });
    render(
      el,
      html`${currentUser()
          ? html`<form class="qa-form" id="qa-form"><label class="sr-only" for="qa-input">A sua pergunta</label><input class="input" id="qa-input" name="question" minlength="5" maxlength="1000" required placeholder="Tem alguma dúvida sobre este produto?"><button class="btn btn--dark" type="submit">Perguntar</button></form>`
          : html`<p class="muted"><a href="login.html">Entre</a> para fazer uma pergunta. Para uma resposta imediata, <button class="link-btn" type="button" data-whatsapp="PRODUCT" data-product="${product.id}">fale connosco pelo WhatsApp</button>.</p>`}
        ${items.length
          ? html`<ul class="qa-list">${items.map(
              (q) => html`<li class="qa"><p class="qa__q"><strong>P:</strong> ${q.question}</p>${q.answer ? html`<p class="qa__a"><strong>Resposta da loja:</strong> ${q.answer}</p>` : html`<p class="qa__a muted">A aguardar resposta.</p>`}<p class="qa__by">${q.author} · ${timeAgo(q.createdAt)}</p></li>`,
            )}</ul><div id="qa-pager"></div>`
          : html`<p class="muted">Ainda não há perguntas sobre este produto.</p>`}`,
    );
    if ($('#qa-pager')) pagination($('#qa-pager'), meta, (pg) => ((qaPage = pg), loadQuestions()));
    $('#qa-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = e.submitter;
      busy(btn, async () => {
        try {
          const q = await reviewsApi.ask(product.id, e.target.question.value.trim());
          toast(q.status === 'PENDING' ? 'Pergunta enviada. A resposta aparece aqui quando for publicada.' : 'Pergunta publicada.');
          e.target.reset();
          loadQuestions();
        } catch (err) {
          toastError(err);
        }
      });
    });
  } catch (err) {
    showError(el, err, loadQuestions);
  }
}

// ------------------------------------------------------------------ relacionados
async function loadRelated() {
  const el = $('#related');
  const types = [
    ['FREQUENTLY_BOUGHT_TOGETHER', 'Comprados frequentemente juntos'],
    ['ACCESSORY', 'Acessórios compatíveis'],
    ['SIMILAR', 'Produtos semelhantes'],
    ['ALSO_BOUGHT', 'Clientes também compraram'],
  ];
  const results = await Promise.all(types.map(([type]) => productsApi.related(product.id, type, 8).catch(() => [])));
  render(
    el,
    html`${types.map(([, title], i) =>
      results[i].length
        ? html`<section class="section" aria-label="${title}"><div class="section__head"><h2>${title}</h2></div>${productGrid(results[i])}</section>`
        : '',
    )}`,
  );
  syncHearts(el);
}

loadProduct();
