import { api } from '../api.js';
import { icon } from '../icons.js';
import { flattenCategories } from '../products.js';
import { busy, confirmDialog, showError, toast } from '../ui.js';
import { html, plural, render } from '../utils.js';
import { resetOptionCache } from './common.js';
import { formModal } from './forms.js';
import { initAdmin } from './layout.js';

const main = await initAdmin({ title: 'Categorias', permission: 'categories:manage' });

let tree = [];
let counts = new Map();

const fields = (parentOptions) => [
  { name: 'name', label: 'Nome', required: true, maxLength: 120 },
  { name: 'slug', label: 'Slug (URL)', hint: 'Gerado a partir do nome se ficar vazio.', maxLength: 140 },
  { name: 'parentId', label: 'Categoria-mãe', type: 'select', options: parentOptions, emptyLabel: 'Nenhuma (categoria principal)', nullable: true },
  { name: 'status', label: 'Estado', type: 'select', options: [['ACTIVE', 'Ativa'], ['INACTIVE', 'Inativa']], placeholder: false },
  { name: 'sortOrder', label: 'Ordem', type: 'number', min: 0, max: 10000, hint: 'Menor aparece primeiro.' },
  { name: 'description', label: 'Descrição', type: 'textarea', nullable: true, rows: 3 },
  { name: 'imageUrl', label: 'Imagem', type: 'image', folder: 'categories', nullable: true },
  { name: 'metaTitle', label: 'Título SEO', maxLength: 70, nullable: true },
  { name: 'metaDescription', label: 'Descrição SEO', maxLength: 170, nullable: true },
];

/** Uma categoria não pode ser mãe de si própria nem de um descendente. */
function parentOptions(exclude) {
  const banned = new Set();
  if (exclude) {
    const walk = (n) => (banned.add(n.id), n.children.forEach(walk));
    const find = (nodes) => nodes.forEach((n) => (n.id === exclude ? walk(n) : find(n.children)));
    find(tree);
  }
  return flattenCategories(tree)
    .filter((c) => !banned.has(c.id))
    .map((c) => [c.id, `${'— '.repeat(c.depth)}${c.name}`]);
}

async function load() {
  render(main, html`<div class="panel"><div class="sk sk--line"></div><div class="sk sk--line"></div><div class="sk sk--line"></div></div>`);
  try {
    const [t, list] = await Promise.all([api.get('/admin/categories/tree'), api.get('/admin/categories')]);
    tree = t;
    counts = new Map(list.map((c) => [c.id, c.productsCount]));
    draw();
  } catch (err) {
    showError(main, err, load);
  }
}

function node(c, siblings, i) {
  return html`<li>
    <div class="tree__row">
      ${c.imageUrl ? html`<img src="${c.imageUrl}" alt="">` : html`<span class="muted" aria-hidden="true">${icon('grid', { size: 18 })}</span>`}
      <strong>${c.name}</strong>
      ${c.status === 'INACTIVE' ? html`<span class="badge badge--neutral">Inativa</span>` : ''}
      <span class="muted">${plural(counts.get(c.id) ?? 0, 'produto', 'produtos')}</span>
      <span class="dt__row-actions">
        <button class="icon-btn" type="button" data-move="up" data-id="${c.id}" aria-label="Subir ${c.name}" ${i === 0 ? html`disabled` : ''}>${icon('chevronUp', { size: 16 })}</button>
        <button class="icon-btn" type="button" data-move="down" data-id="${c.id}" aria-label="Descer ${c.name}" ${i === siblings.length - 1 ? html`disabled` : ''}>${icon('chevronDown', { size: 16 })}</button>
        <button class="btn btn--sm btn--ghost" type="button" data-add-child="${c.id}">${icon('plus', { size: 16 })}Subcategoria</button>
        <button class="btn btn--sm btn--ghost" type="button" data-edit="${c.id}">Editar</button>
        <button class="btn btn--sm btn--ghost dt__danger" type="button" data-del="${c.id}">Remover</button>
      </span>
    </div>
    ${c.children.length ? html`<ul class="tree">${c.children.map((ch, j) => node(ch, c.children, j))}</ul>` : ''}
  </li>`;
}

function draw() {
  render(
    main,
    html`<div class="adm-head"><p>Use as setas para mudar a ordem. Categorias inativas e os seus produtos deixam de aparecer na loja.</p>
      <button class="btn btn--primary" type="button" data-add>${icon('plus', { size: 18 })}Nova categoria</button></div>
    <div class="panel">${tree.length ? html`<ul class="tree">${tree.map((c, i) => node(c, tree, i))}</ul>` : html`<div class="state"><p class="state__title">Ainda não há categorias.</p><p>Crie a primeira para organizar o catálogo.</p></div>`}</div>`,
  );
}

const byId = (id) => flattenCategories(tree).find((c) => c.id === id);
const siblingsOf = (c) => (c.parentId ? byId(c.parentId).children : tree);
const changed = () => (resetOptionCache(), load());

main.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.matches('[data-add], [data-add-child]')) {
    const ok = await formModal({
      title: 'Nova categoria',
      fields: fields(parentOptions()),
      values: { parentId: b.dataset.addChild ?? '', status: 'ACTIVE', sortOrder: b.dataset.addChild ? byId(b.dataset.addChild).children.length : tree.length },
      submitLabel: 'Criar categoria',
      onSubmit: (v) => api.post('/admin/categories', v),
    });
    if (ok) (toast('Categoria criada.'), changed());
  }
  if (b.dataset.edit) {
    const c = byId(b.dataset.edit);
    const ok = await formModal({
      title: `Editar “${c.name}”`,
      fields: fields(parentOptions(c.id)),
      values: c,
      mode: 'edit',
      onSubmit: (v) => api.patch(`/admin/categories/${c.id}`, v),
    });
    if (ok) (toast('Categoria atualizada.'), changed());
  }
  if (b.dataset.del) {
    const c = byId(b.dataset.del);
    const n = counts.get(c.id) ?? 0;
    const yes = await confirmDialog(n || c.children.length ? `“${c.name}” tem ${n} produto(s) e ${c.children.length} subcategoria(s). A loja pode recusar a remoção; nesse caso, mova-os primeiro ou desative a categoria.` : `Remover “${c.name}”?`, { title: 'Remover categoria', confirmLabel: 'Remover', danger: true });
    if (!yes) return;
    busy(b, async () => {
      try {
        await api.delete(`/admin/categories/${c.id}`);
        toast('Categoria removida.');
        changed();
      } catch (err) {
        toast(err.friendly, { type: 'error' });
      }
    });
  }
  if (b.dataset.move) {
    const c = byId(b.dataset.id);
    const sibs = siblingsOf(c);
    const i = sibs.findIndex((x) => x.id === c.id);
    const j = b.dataset.move === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= sibs.length) return;
    const order = sibs.map((x) => x.id);
    [order[i], order[j]] = [order[j], order[i]];
    busy(b, async () => {
      try {
        // Reescreve a ordem dos irmãos (0..n) para evitar empates.
        await Promise.all(order.map((id, k) => (byId(id).sortOrder !== k ? api.patch(`/admin/categories/${id}`, { sortOrder: k }) : null)));
        changed();
      } catch (err) {
        toast(err.friendly, { type: 'error' });
      }
    });
  }
});

load();
