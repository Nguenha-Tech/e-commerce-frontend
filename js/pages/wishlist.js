import { addToCart, quickAdd } from '../cart.js';
import { icon } from '../icons.js';
import { initPage } from '../layout.js';
import { store } from '../store.js';
import { busy, emptyState, priceTag, setSeo, showError, stars, toast, toastError } from '../ui.js';
import { $, formatDate, html, productUrl, render } from '../utils.js';
import { wishlistApi } from '../wishlist.js';

await initPage({ auth: true });
setSeo({ title: 'Favoritos' });
const main = $('#wishlist');
let items = [];

async function load() {
  render(main, html`<div class="sk-stack"><div class="sk sk--line"></div><div class="sk sk--line"></div></div>`);
  try {
    items = await wishlistApi.list();
    draw();
  } catch (err) {
    showError(main, err, load);
  }
}

function draw() {
  store.set('wishlistIds', new Set(items.map((i) => i.product.id)));
  if (!items.length) return render(main, emptyState({ iconName: 'heart', title: 'Ainda não tem favoritos.', text: 'Toque no coração de um produto para o guardar aqui.', actionLabel: 'Explorar produtos', actionHref: 'shop.html' }));
  render(
    main,
    html`<ul class="wish-list">${items.map((w) => {
      const p = w.product;
      return html`<li class="wish panel ${w.available ? '' : 'is-unavailable'}">
        <a class="wish__img" href="${productUrl(p)}">${p.image ? html`<img src="${p.image.thumbnailUrl ?? p.image.url}" alt="" loading="lazy">` : ''}</a>
        <div class="wish__info">
          ${p.brand ? html`<span class="pcard__brand">${p.brand.name}</span>` : ''}
          <a class="cart-item__name" href="${productUrl(p)}">${p.name}</a>
          ${p.rating.count ? stars(p.rating.average, p.rating.count) : ''}
          ${priceTag({ amount: p.price.from, compareAt: p.price.compareAt, currency: p.price.currency, discountPercent: p.price.discountPercent })}
          <p class="pcard__stock ${w.inStock ? 'is-in' : 'is-out'}">${!w.available ? 'Indisponível' : w.inStock ? 'Em stock' : 'Esgotado'}${w.stockAlertActive ? ' · vamos avisá-lo quando voltar' : ''}</p>
          <p class="field__hint">Adicionado a ${formatDate(w.addedAt)}</p>
        </div>
        <div class="wish__actions">
          ${w.inStock
            ? p.hasVariants && !w.variantId
              ? html`<a class="btn btn--primary btn--sm" href="${productUrl(p)}">Escolher opções</a>`
              : html`<button class="btn btn--primary btn--sm" type="button" data-add="${p.id}" data-variant="${w.variantId ?? ''}">${icon('cart', { size: 16 })}Adicionar ao carrinho</button>`
            : w.variantId && !w.stockAlertActive && w.available
              ? html`<button class="btn btn--sm" type="button" data-alert="${w.variantId}">${icon('bell', { size: 16 })}Avisar-me</button>`
              : ''}
          <button class="link-btn link-btn--danger" type="button" data-remove="${p.id}">${icon('trash', { size: 16 })}Remover dos favoritos</button>
        </div>
      </li>`;
    })}</ul>`,
  );
}

main.addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  if (add) return busy(add, () => (add.dataset.variant ? addToCart(add.dataset.variant, 1) : quickAdd(add.dataset.add)).catch(() => {}));
  const rm = e.target.closest('[data-remove]');
  if (rm)
    return busy(rm, async () => {
      try {
        await wishlistApi.remove(rm.dataset.remove);
        items = items.filter((i) => i.product.id !== rm.dataset.remove);
        draw();
        toast('Removido dos favoritos');
      } catch (err) {
        toastError(err);
      }
    });
  const al = e.target.closest('[data-alert]');
  if (al)
    return busy(al, async () => {
      try {
        await wishlistApi.subscribeAlert(al.dataset.alert);
        toast('Vamos avisá-lo quando voltar ao stock.');
        load();
      } catch (err) {
        toastError(err);
      }
    });
});

load();
