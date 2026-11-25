import { icon } from '../icons.js';
import { initPage } from '../layout.js';
import { catalogApi, productsApi, topCategories } from '../products.js';
import { load, productGrid, setSeo, showError } from '../ui.js';
import { $, bannerHref, html, render } from '../utils.js';
import { CONFIG } from '../config.js';

const CATEGORY_GLYPHS = [
  [/phone|smart|android|iphone|telem/, '📱'],
  [/tablet|ipad/, '📲'],
  [/comput|laptop|portat|desktop|pc/, '💻'],
  [/head|fone|audio|ear|auscult/, '🎧'],
  [/carreg|charger/, '🔌'],
  [/cabo|cable/, '🧵'],
  [/watch|relog/, '⌚'],
  [/power|bateria/, '🔋'],
  [/acess/, '🧩'],
];
const glyph = (slug) => CATEGORY_GLYPHS.find(([re]) => re.test(slug))?.[1] ?? '✨';

await initPage();
setSeo({
  title: 'Eletrónica com garantia e entrega em todo o país',
  description: `${CONFIG.STORE_NAME}: smartphones, computadores, headphones, smartwatches, carregadores e acessórios. Preços em ${CONFIG.STORE_CURRENCY}.`,
  url: location.href,
});

// ------------------------------------------------------------------ hero (banners do admin)
async function hero() {
  const el = $('#hero');
  try {
    const banners = await catalogApi.banners('HOMEPAGE');
    if (!banners.length) {
      render(
        el,
        html`<div class="hero hero--plain"><div class="hero__copy">
          <h1>Tecnologia que chega a sua casa</h1>
          <p>Smartphones, computadores, áudio e acessórios com garantia e apoio por WhatsApp.</p>
          <div class="hero__ctas"><a class="btn btn--primary btn--lg" href="shop.html">Ver produtos</a><a class="btn btn--lg" href="shop.html?onSale=true">Ver ofertas</a></div>
        </div></div>`,
      );
      return;
    }
    render(
      el,
      html`<div class="hero" aria-roledescription="carrossel" aria-label="Destaques">
        <div class="hero__track">
          ${banners.map(
            (b, i) => html`<article class="hero__slide ${i === 0 ? 'is-active' : ''}" aria-roledescription="slide" aria-label="${i + 1} de ${banners.length}" ${i ? html`hidden` : ''}>
              <picture>
                ${b.mobileImageUrl ? html`<source media="(max-width: 767px)" srcset="${b.mobileImageUrl}">` : ''}
                <img src="${b.imageUrl}" alt="" ${i === 0 ? html`fetchpriority="high"` : html`loading="lazy"`}>
              </picture>
              <div class="hero__copy">
                <h${i === 0 ? '1' : '2'} class="hero__title">${b.title}</h${i === 0 ? '1' : '2'}>
                ${b.subtitle ? html`<p>${b.subtitle}</p>` : ''}
                <a class="btn btn--primary btn--lg" href="${bannerHref(b)}">${b.product ? 'Ver produto' : b.category ? `Ver ${b.category.name}` : 'Ver ofertas'}</a>
              </div>
            </article>`,
          )}
        </div>
        ${banners.length > 1
          ? html`<div class="hero__nav">
              <button class="icon-btn" type="button" data-hero="-1" aria-label="Destaque anterior">${icon('chevronLeft')}</button>
              <div class="hero__dots">${banners.map((_, i) => html`<button type="button" class="hero__dot ${i === 0 ? 'is-active' : ''}" data-hero-go="${i}" aria-label="Ir para destaque ${i + 1}"></button>`)}</div>
              <button class="icon-btn" type="button" data-hero="1" aria-label="Destaque seguinte">${icon('chevronRight')}</button>
            </div>`
          : ''}
      </div>`,
    );
    let current = 0;
    const slides = el.querySelectorAll('.hero__slide');
    const dots = el.querySelectorAll('.hero__dot');
    const go = (i) => {
      current = (i + slides.length) % slides.length;
      slides.forEach((s, j) => ((s.hidden = j !== current), s.classList.toggle('is-active', j === current)));
      dots.forEach((d, j) => d.classList.toggle('is-active', j === current));
    };
    el.addEventListener('click', (e) => {
      const step = e.target.closest('[data-hero]');
      const to = e.target.closest('[data-hero-go]');
      if (step) go(current + Number(step.dataset.hero));
      if (to) go(Number(to.dataset.heroGo));
    });
  } catch (err) {
    showError(el, err, hero);
  }
}

// ------------------------------------------------------------------ categorias
async function categories() {
  await load(
    $('#categories'),
    async () => topCategories(await catalogApi.categories()),
    (cats) =>
      render(
        $('#categories'),
        html`<ul class="cat-tiles">${cats.map(
          (c) => html`<li><a class="cat-tile" href="shop.html?category=${c.slug}">
            ${c.imageUrl ? html`<img src="${c.imageUrl}" alt="" loading="lazy">` : html`<span class="cat-tile__glyph" aria-hidden="true">${glyph(c.slug)}</span>`}
            <span>${c.name}</span></a></li>`,
        )}</ul>`,
      ),
    { empty: { title: 'Ainda não há categorias.' } },
  );
}

// ------------------------------------------------------------------ ofertas com contador
function countdown(endsAt) {
  return html`<span class="countdown" data-ends="${endsAt}" aria-label="Termina em"></span>`;
}

function tickCountdowns() {
  document.querySelectorAll('[data-ends]').forEach((el) => {
    const ms = new Date(el.dataset.ends).getTime() - Date.now();
    if (ms <= 0) return render(el, 'Terminou');
    const h = Math.floor(ms / 3.6e6);
    const m = Math.floor((ms % 3.6e6) / 6e4);
    const s = Math.floor((ms % 6e4) / 1000);
    const pad = (n) => String(n).padStart(2, '0');
    render(el, h >= 48 ? html`<b>${Math.floor(h / 24)}</b> dias` : html`<b>${pad(h)}</b>:<b>${pad(m)}</b>:<b>${pad(s)}</b>`);
  });
}

async function deals() {
  const head = $('#deals-head');
  try {
    const promos = await catalogApi.promotions();
    const flash = promos.find((p) => p.kind === 'FLASH_SALE') ?? promos[0];
    if (flash) {
      render(
        head,
        html`<div class="deal-strip">
          <div><strong>${flash.name}</strong>${flash.description ? html`<span>${flash.description}</span>` : ''}</div>
          <div class="deal-strip__time">Termina em ${countdown(flash.endsAt)}</div>
        </div>`,
      );
      tickCountdowns();
      setInterval(tickCountdowns, 1000);
    }
  } catch {
    /* faixa opcional */
  }
  await load($('#deals'), () => productsApi.onSale(8), ({ items }) => render($('#deals'), productGrid(items)), { kind: 'cards', count: 4, empty: { iconName: 'percent', title: 'Sem ofertas ativas neste momento.', actionLabel: 'Ver todos os produtos', actionHref: 'shop.html' } });
}

// ------------------------------------------------------------------ secções de produtos
const section = (id, fetcher, empty) => load($(id), fetcher, (items) => render($(id), productGrid(items.items ?? items)), { kind: 'cards', count: 4, empty });

async function promoBanner() {
  const el = $('#promo-banner');
  try {
    const [b] = await catalogApi.banners('PROMOTION');
    if (!b) return el.remove();
    render(
      el,
      html`<a class="promo-banner" href="${bannerHref(b)}">
        <img src="${b.imageUrl}" alt="" loading="lazy">
        <span class="promo-banner__copy"><strong>${b.title}</strong>${b.subtitle ? html`<span>${b.subtitle}</span>` : ''}</span>
      </a>`,
    );
  } catch {
    el.remove();
  }
}

hero();
categories();
deals();
section('#featured', () => productsApi.featured(8), { title: 'Sem produtos em destaque.' });
section('#bestsellers', () => productsApi.bestSellers(8), { title: 'Ainda sem vendas registadas.' });
section('#newest', () => productsApi.list({ sort: 'newest', limit: 8 }), { title: 'Sem novidades.' });
promoBanner();
