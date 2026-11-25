import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { busy, openModal, showError, toast } from '../ui.js';
import { $, $$, badge, formatDate, formatDateTime, formatMoney, html, parseMoneyInput, params, RETURN_STATUS, render } from '../utils.js';
import { initAdmin } from './layout.js';
import { act, dataTable } from './table.js';

const main = await initAdmin({ title: 'Devoluções e reembolsos', permission: 'orders:read' });

/** Ações disponíveis por estado (espelho do backend, só para mostrar os botões certos). */
const ACTIONS = {
  REQUESTED: ['review', 'approve', 'reject', 'cancel'],
  UNDER_REVIEW: ['approve', 'reject', 'cancel'],
  APPROVED: ['receive', 'cancel'],
  RECEIVED: ['refund'],
};
const REFUND_STATUS = {
  PENDING: { label: 'Pendente', tone: 'warn' },
  PROCESSING: { label: 'Em processamento', tone: 'info' },
  COMPLETED: { label: 'Concluído', tone: 'ok' },
  FAILED: { label: 'Falhou', tone: 'bad' },
};

const canManage = hasPermission('orders:manage');
const canRefund = hasPermission('refunds:manage');

render(
  main,
  html`<div class="tabs" role="tablist">
      <button class="tab" role="tab" type="button" data-tab="returns" aria-selected="true">Devoluções</button>
      ${canRefund ? html`<button class="tab" role="tab" type="button" data-tab="refunds" aria-selected="false">Reembolsos</button>` : ''}
    </div>
    <div id="tab-body"></div>`,
);

let current;
function showTab(name) {
  $$('[data-tab]', main).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  const el = $('#tab-body', main);
  el.replaceChildren();
  current = name === 'refunds' ? refundsTable(el) : returnsTable(el);
}
main.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) showTab(t.dataset.tab);
});

function returnsTable(el) {
  return dataTable(el, {
    fetch: (query) => api.page('/admin/returns', { query }),
    initial: { status: params().get('status') ?? undefined },
    filters: [
      { name: 'search', label: 'Nº do pedido ou cliente…' },
      { name: 'status', label: 'Todos os estados', type: 'select', options: Object.entries(RETURN_STATUS).map(([k, v]) => [k, v.label]) },
    ],
    columns: [
      { label: 'Pedido', render: (r) => html`<a href="orders.html?id=${r.order.id}"><strong>#${r.order.orderNumber}</strong></a><br><small class="muted">${formatDate(r.createdAt)}</small>` },
      { label: 'Cliente', render: (r) => html`${r.user.name}<br><small class="muted">${r.user.email}</small>` },
      { label: 'Motivo', render: (r) => html`${r.reason}<br><small class="muted">${r.items.reduce((s, i) => s + i.quantity, 0)} artigo(s)</small>` },
      { label: 'Reembolso', className: 'num', render: (r) => (r.refundAmount ? formatMoney(r.refundAmount, r.order.currency) : '—') },
      { label: 'Estado', render: (r) => badge(RETURN_STATUS, r.status) },
    ],
    rowActions: () => act('view', 'Ver', { iconName: 'eye' }),
    onAction: (a, r) => a === 'view' && openReturn(r.id),
    empty: 'Nenhuma devolução encontrada.',
  });
}

async function openReturn(id) {
  const body = document.createElement('div');
  const m = openModal({ title: 'Devolução', body, size: 'lg' });
  const load = async () => {
    render(body, html`<div class="sk sk--line"></div><div class="sk sk--line"></div>`);
    try {
      const r = await api.get(`/admin/returns/${id}`);
      const cur = r.order.currency;
      $('.modal__title', m.el).textContent = `Devolução — pedido #${r.order.orderNumber}`;
      const allowed = (ACTIONS[r.status] ?? []).filter((a) => (a === 'refund' ? canRefund : canManage));
      render(
        body,
        html`<div class="chips" style="margin-bottom:12px">${badge(RETURN_STATUS, r.status)}</div>
        <div class="grid-2">
          <section><h3>Cliente</h3><p>${r.user.name}<br><a href="mailto:${r.user.email}">${r.user.email}</a>${r.user.phone ? html`<br><a href="tel:${r.user.phone}">${r.user.phone}</a>` : ''}</p></section>
          <section><h3>Pedido</h3><p><a href="orders.html?id=${r.order.id}">#${r.order.orderNumber}</a><br>Entregue a ${formatDate(r.order.deliveredAt)}<br>Total ${formatMoney(r.order.grandTotal, cur)}</p></section>
        </div>
        <h3>Motivo</h3><p><strong>${r.reason}</strong>${r.description ? html`<br>${r.description}` : ''}</p>
        ${r.rejectionReason ? html`<p class="notice notice--warn">Rejeitada: ${r.rejectionReason}</p>` : ''}
        ${r.pickupAt ? html`<p>Recolha agendada: <strong>${formatDateTime(r.pickupAt)}</strong></p>` : ''}
        ${r.evidenceUrls?.length ? html`<h3>Evidências</h3><div class="chips">${r.evidenceUrls.map((u) => html`<a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="Evidência enviada pelo cliente" width="88" height="88" style="object-fit:cover;border-radius:8px"></a>`)}</div>` : ''}
        <h3>Artigos</h3>
        <div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th class="num">Qtd. devolvida</th><th class="num">Preço unit.</th><th>Estado na receção</th></tr></thead><tbody>${r.items.map(
          (i) => html`<tr><td>${i.orderItem.productName}${i.orderItem.variantName ? html`<br><small class="muted">${i.orderItem.variantName} · ${i.orderItem.sku}</small>` : ''}</td><td class="num">${i.quantity} de ${i.orderItem.quantity}</td><td class="num">${formatMoney(i.orderItem.unitPrice, cur)}</td><td>${i.condition ?? '—'}</td></tr>`,
        )}</tbody></table></div>
        ${r.refunds?.length ? html`<h3>Reembolsos</h3><ul class="track-events">${r.refunds.map((f) => html`<li><strong>${formatMoney(f.amount, cur)}</strong> ${badge(REFUND_STATUS, f.status)}<span class="muted">${formatDateTime(f.createdAt)}</span></li>`)}</ul>` : ''}
        ${allowed.length ? html`<div class="form-actions" style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px">
          ${allowed.includes('review') ? html`<button class="btn" type="button" data-ra="review">Colocar em análise</button>` : ''}
          ${allowed.includes('approve') ? html`<button class="btn btn--primary" type="button" data-ra="approve">Aprovar</button>` : ''}
          ${allowed.includes('receive') ? html`<button class="btn btn--primary" type="button" data-ra="receive">Registar receção</button>` : ''}
          ${allowed.includes('refund') ? html`<button class="btn btn--primary" type="button" data-ra="refund">Reembolsar</button>` : ''}
          ${allowed.includes('reject') ? html`<button class="btn btn--ghost dt__danger" type="button" data-ra="reject">Rejeitar</button>` : ''}
          ${allowed.includes('cancel') ? html`<button class="btn btn--ghost dt__danger" type="button" data-ra="cancel">Cancelar devolução</button>` : ''}
        </div>` : ''}`,
      );
      body.onclick = (e) => {
        const b = e.target.closest('[data-ra]');
        if (b) runAction(b.dataset.ra, r, async () => (current.reload(), load()));
      };
    } catch (err) {
      showError(body, err, load);
    }
  };
  load();
}

/** Pequeno formulário modal: devolve um FormData-like via onSubmit. */
function actionModal({ title, content, submitLabel, danger = false, onSubmit }) {
  const form = document.createElement('form');
  form.id = `ra-${Math.random().toString(36).slice(2)}`;
  form.noValidate = true;
  render(form, html`${content}<div class="form-error" role="alert"></div>`);
  const m = openModal({ title, body: form, size: 'md', actions: [{ label: 'Voltar', onClick: ({ close }) => close() }, { label: submitLabel, variant: danger ? 'danger' : 'primary', type: 'submit', form: form.id }] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    busy(m.el.querySelector(`[form="${form.id}"]`), async () => {
      try {
        await onSubmit(form);
        m.close();
      } catch (err) {
        render($('.form-error', form), err.friendly);
      }
    });
  });
}

function runAction(action, r, done) {
  const base = `/admin/returns/${r.id}`;
  const cur = r.order.currency;
  const after = (msg) => (toast(msg), done());
  switch (action) {
    case 'review':
      return busy(document.querySelector('[data-ra="review"]'), async () => {
        try {
          await api.post(`${base}/review`, {});
          after('Devolução em análise.');
        } catch (err) {
          toast(err.friendly, { type: 'error' });
        }
      });
    case 'approve':
      return actionModal({
        title: 'Aprovar devolução',
        submitLabel: 'Aprovar',
        content: html`<p>O cliente é notificado. Pode indicar já a data de recolha.</p>
          <div class="field"><label for="ra-pickup">Data de recolha (opcional)</label><input class="input" type="datetime-local" id="ra-pickup" name="pickupAt"></div>
          <div class="field"><label for="ra-note">Nota para o cliente (opcional)</label><input class="input" id="ra-note" name="note" maxlength="300"></div>`,
        onSubmit: async (f) => {
          const body = {};
          if (f.pickupAt.value) body.pickupAt = new Date(f.pickupAt.value).toISOString();
          if (f.note.value.trim()) body.note = f.note.value.trim();
          await api.post(`${base}/approve`, body);
          after('Devolução aprovada.');
        },
      });
    case 'reject':
      return actionModal({
        title: 'Rejeitar devolução',
        submitLabel: 'Rejeitar',
        danger: true,
        content: html`<div class="field"><label for="ra-reason">Motivo (enviado ao cliente)</label><textarea class="textarea" id="ra-reason" name="reason" required minlength="3" maxlength="300" rows="3"></textarea></div>`,
        onSubmit: async (f) => {
          await api.post(`${base}/reject`, { reason: f.reason.value.trim() });
          after('Devolução rejeitada.');
        },
      });
    case 'cancel':
      return actionModal({
        title: 'Cancelar devolução',
        submitLabel: 'Cancelar devolução',
        danger: true,
        content: html`<p>O pedido volta ao estado “Entregue”. Esta ação não pode ser desfeita.</p>`,
        onSubmit: async () => {
          await api.post(`${base}/cancel`, {});
          after('Devolução cancelada.');
        },
      });
    case 'receive':
      return actionModal({
        title: 'Registar receção',
        submitLabel: 'Registar receção',
        content: html`<p>Indique o estado de cada artigo. Só os marcados como “repor no stock” voltam a ficar à venda; os restantes ficam registados como danificados.</p>
          ${r.items.map(
            (i, n) => html`<fieldset class="panel" style="margin:0 0 10px"><legend><strong>${i.orderItem.productName}</strong> ${i.orderItem.variantName ? `· ${i.orderItem.variantName}` : ''} × ${i.quantity}</legend>
              <div class="field"><label for="rc-${n}">Estado do artigo</label><input class="input" id="rc-${n}" name="condition-${n}" required minlength="2" maxlength="80" placeholder="Ex.: Selado, Como novo, Ecrã partido"></div>
              <label class="check"><input type="checkbox" name="restock-${n}" checked>Repor no stock</label></fieldset>`,
          )}`,
        onSubmit: async (f) => {
          const items = r.items.map((i, n) => ({ returnItemId: i.id, condition: f[`condition-${n}`].value.trim(), restock: f[`restock-${n}`].checked }));
          await api.post(`${base}/receive`, { items });
          after('Receção registada.');
        },
      });
    case 'refund': {
      const itemsTotal = r.items.reduce((s, i) => s + Math.round((i.orderItem.lineTotal / i.orderItem.quantity) * i.quantity), 0);
      return actionModal({
        title: 'Reembolsar devolução',
        submitLabel: 'Reembolsar',
        content: html`<p>Por omissão é reembolsado o valor pago pelos artigos devolvidos (cerca de <strong>${formatMoney(itemsTotal, cur)}</strong>, calculado pelo servidor). O valor nunca pode exceder o que foi pago.</p>
          <div class="field"><label for="rf-amount">Outro valor (opcional)</label><div class="input-affix"><input class="input" id="rf-amount" name="amount" inputmode="decimal"><span>${cur}</span></div></div>
          <label class="check"><input type="checkbox" name="includeShipping">Incluir portes (${formatMoney(r.order.shippingTotal, cur)})</label>
          <div class="field"><label for="rf-ref">Referência da transferência (pagamentos manuais)</label><input class="input" id="rf-ref" name="providerReference" maxlength="120"></div>`,
        onSubmit: async (f) => {
          const body = { includeShipping: f.includeShipping.checked };
          if (f.amount.value.trim()) {
            const v = parseMoneyInput(f.amount.value);
            if (!Number.isFinite(v) || v <= 0) throw { friendly: 'Indique um valor válido.' };
            body.amount = v;
          }
          if (f.providerReference.value.trim()) body.providerReference = f.providerReference.value.trim();
          await api.post(`${base}/refund`, body);
          after('Reembolso registado.');
        },
      });
    }
  }
}

function refundsTable(el) {
  return dataTable(el, {
    fetch: (query) => api.page('/admin/refunds', { query }),
    filters: [{ name: 'status', label: 'Todos os estados', type: 'select', options: Object.entries(REFUND_STATUS).map(([k, v]) => [k, v.label]) }],
    columns: [
      { label: 'Pedido', render: (f) => html`<a href="orders.html?id=${f.payment.order.id}"><strong>#${f.payment.order.orderNumber}</strong></a><br><small class="muted">${formatDateTime(f.createdAt)}</small>` },
      { label: 'Cliente', render: (f) => html`${f.payment.order.user.name}<br><small class="muted">${f.payment.order.user.email}</small>` },
      { label: 'Método', render: (f) => html`${f.payment.methodCode}<br><small class="muted">${f.payment.provider}</small>` },
      { label: 'Motivo', render: (f) => f.reason ?? '—' },
      { label: 'Valor', className: 'num', render: (f) => formatMoney(f.amount, f.payment.currency) },
      { label: 'Estado', render: (f) => html`${badge(REFUND_STATUS, f.status)}${f.providerReference ? html`<br><small class="muted">${f.providerReference}</small>` : ''}` },
    ],
    rowActions: (f) => (['PENDING', 'PROCESSING', 'FAILED'].includes(f.status) ? html`${act('process', 'Processar')}${f.status !== 'FAILED' ? act('fail', 'Marcar falhado', { danger: true }) : ''}` : ''),
    onAction: (a, f) => {
      const done = (msg) => (toast(msg), current.reload());
      if (a === 'process')
        actionModal({
          title: `Processar reembolso — ${formatMoney(f.amount, f.payment.currency)}`,
          submitLabel: 'Processar',
          content: html`<p>${['manual', 'cod'].includes(f.payment.provider) ? 'Pagamento manual: faça a transferência ao cliente e registe a referência.' : 'O reembolso é pedido ao gateway de pagamento.'}</p>
            <div class="field"><label for="pr-ref">Referência</label><input class="input" id="pr-ref" name="providerReference" maxlength="120"></div>
            <div class="field"><label for="pr-note">Nota (opcional)</label><input class="input" id="pr-note" name="note" maxlength="300"></div>`,
          onSubmit: async (form) => {
            const body = {};
            if (form.providerReference.value.trim()) body.providerReference = form.providerReference.value.trim();
            if (form.note.value.trim()) body.note = form.note.value.trim();
            await api.post(`/admin/refunds/${f.id}/process`, body);
            done('Reembolso processado.');
          },
        });
      if (a === 'fail')
        actionModal({
          title: 'Marcar reembolso como falhado',
          submitLabel: 'Marcar falhado',
          danger: true,
          content: html`<div class="field"><label for="pf-reason">Motivo</label><input class="input" id="pf-reason" name="reason" required minlength="3" maxlength="200"></div>`,
          onSubmit: async (form) => {
            await api.post(`/admin/refunds/${f.id}/fail`, { reason: form.reason.value.trim() });
            done('Reembolso marcado como falhado.');
          },
        });
    },
    empty: 'Nenhum reembolso encontrado.',
  });
}

showTab(params().get('tab') === 'refunds' && canRefund ? 'refunds' : 'returns');
if (params().get('id')) openReturn(params().get('id'));
