import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { showError } from '../ui.js';
import { $, $$, formatDate, formatMoney, formatNumber, html, ORDER_STATUS, plural, params, PAYMENT_STATUS, RETURN_STATUS, render, setParams } from '../utils.js';
import { bucketLabel, chart, downloadCsv, fillBuckets } from './charts.js';
import { initAdmin } from './layout.js';

const main = await initAdmin({ title: 'Relatórios', permission: 'reports:read' });

const PERIODS = [['day', 'Por dia'], ['week', 'Por semana'], ['month', 'Por mês'], ['year', 'Por ano']];
const MOVEMENT = { INITIAL: 'Stock inicial', PURCHASE: 'Compras', SALE: 'Vendas', ADJUSTMENT_IN: 'Ajustes (+)', ADJUSTMENT_OUT: 'Ajustes (−)', DAMAGED: 'Danificados', RETURN: 'Devoluções', CANCELLATION_RESTOCK: 'Cancelamentos' };
const label = (map, k) => map[k]?.label ?? k;

const TABS = [
  { key: 'sales', label: 'Vendas' },
  { key: 'products', label: 'Produtos' },
  { key: 'orders', label: 'Pedidos' },
  { key: 'customers', label: 'Clientes', perm: 'customers:read' },
  { key: 'stock', label: 'Stock', perm: 'inventory:read' },
  { key: 'discounts', label: 'Descontos' },
  { key: 'returns', label: 'Devoluções' },
  { key: 'revenue', label: 'Receita', perm: 'reports:financial' },
  { key: 'payments', label: 'Pagamentos', perm: 'reports:financial' },
].filter((t) => !t.perm || hasPermission(t.perm));

const p = params();
const state = { tab: TABS.some((t) => t.key === p.get('tab')) ? p.get('tab') : 'sales', period: p.get('period') ?? 'day', from: p.get('from') ?? '', to: p.get('to') ?? '' };

render(
  main,
  html`<div class="tabs" role="tablist">${TABS.map((t) => html`<button class="tab" role="tab" type="button" data-tab="${t.key}">${t.label}</button>`)}</div>
    <form class="toolbar-inline" id="rep-filters">
      <div class="field"><label for="r-period">Agrupar</label><select class="select" id="r-period" name="period">${PERIODS.map(([v, l]) => html`<option value="${v}" ${state.period === v ? html`selected` : ''}>${l}</option>`)}</select></div>
      <div class="field"><label for="r-from">De</label><input class="input" type="date" id="r-from" name="from" value="${state.from}"></div>
      <div class="field"><label for="r-to">Até</label><input class="input" type="date" id="r-to" name="to" value="${state.to}"></div>
      <button class="btn" type="button" id="r-csv">Exportar CSV</button>
    </form>
    <p class="muted" id="rep-range"></p>
    <div id="rep-body"></div>`,
);

const body = $('#rep-body', main);
let csvRows = [];

const kpi = (l, v, sub) => html`<div class="kpi"><span class="kpi__label">${l}</span><span class="kpi__value">${v}</span>${sub ? html`<span class="kpi__sub">${sub}</span>` : ''}</div>`;
const panel = (title, content) => html`<section class="panel" style="margin-bottom:16px"><h2 class="panel__title">${title}</h2>${content}</section>`;
const table = (cols, rows) =>
  rows.length
    ? html`<div class="table-wrap"><table class="table"><thead><tr>${cols.map((c) => html`<th class="${c.num ? 'num' : ''}">${c.label}</th>`)}</tr></thead><tbody>${rows.map((r) => html`<tr>${cols.map((c) => html`<td class="${c.num ? 'num' : ''}">${c.render(r)}</td>`)}</tr>`)}</tbody></table></div>`
    : html`<p class="muted">Sem dados no período.</p>`;
const pct = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')}%`);

function query() {
  const q = { period: state.period };
  if (state.from) q.from = new Date(`${state.from}T00:00:00`).toISOString();
  if (state.to) q.to = new Date(`${state.to}T23:59:59`).toISOString();
  return q;
}

/** Série temporal → gráfico (valores monetários convertidos para MZN no eixo). */
function series(el, rows, range, key, { money = false, title, unit = '' } = {}) {
  const filled = fillBuckets(rows, range, [key]);
  chart(el, {
    type: 'bar',
    title,
    data: filled.map((s) => ({ label: bucketLabel(s.bucket, range.period), value: money ? s[key] / 100 : s[key] })),
    format: (v) => (money ? formatMoney(v * 100) : `${formatNumber(v)}${unit}`),
  });
}

const RENDER = {
  async sales(q) {
    const d = await api.get('/admin/reports/sales', { query: q });
    const t = d.totals;
    render(
      body,
      html`<div class="kpis">${kpi('Vendas', formatMoney(t.total), plural(t.orders, 'pedido', 'pedidos'))}${kpi('Ticket médio', formatMoney(t.averageOrderValue))}${kpi('Unidades', formatNumber(t.units))}${kpi('Descontos', formatMoney(t.discounts))}</div>
      ${panel('Vendas no período', html`<div id="c1"></div>`)}
      ${panel('Detalhe', table([{ label: 'Período', render: (r) => bucketLabel(r.bucket, d.range.period) }, { label: 'Pedidos', num: 1, render: (r) => formatNumber(r.orders) }, { label: 'Unidades', num: 1, render: (r) => formatNumber(r.units) }, { label: 'Descontos', num: 1, render: (r) => formatMoney(r.discounts) }, { label: 'Portes', num: 1, render: (r) => formatMoney(r.shipping) }, { label: 'IVA', num: 1, render: (r) => formatMoney(r.tax) }, { label: 'Total', num: 1, render: (r) => formatMoney(r.total) }], d.series))}`,
    );
    series($('#c1'), d.series, d.range, 'total', { money: true, title: 'Vendas' });
    csvRows = d.series.map((r) => ({ periodo: r.bucket.slice(0, 10), pedidos: r.orders, unidades: r.units, subtotal_mzn: r.subtotal / 100, descontos_mzn: r.discounts / 100, portes_mzn: r.shipping / 100, iva_mzn: r.tax / 100, total_mzn: r.total / 100 }));
    return d.range;
  },
  async products(q) {
    const d = await api.get('/admin/reports/products', { query: { ...q, limit: 50, sort: 'revenue' } });
    const fin = d.items.some((i) => i.cost !== null);
    render(
      body,
      html`${panel('Produtos mais vendidos', table([{ label: 'Produto', render: (r) => r.name }, { label: 'Pedidos', num: 1, render: (r) => formatNumber(r.orders) }, { label: 'Unidades', num: 1, render: (r) => formatNumber(r.units) }, { label: 'Descontos', num: 1, render: (r) => formatMoney(r.discounts) }, { label: 'Receita', num: 1, render: (r) => formatMoney(r.revenue) }, ...(fin ? [{ label: 'Lucro bruto', num: 1, render: (r) => (r.grossProfit === null ? '—' : formatMoney(r.grossProfit)) }] : [])], d.items))}
      ${panel('Categorias', html`<div id="c1"></div>`)}`,
    );
    if (d.categories.length) chart($('#c1'), { type: 'bar', title: 'Receita por categoria', data: d.categories.slice(0, 12).map((c) => ({ label: c.name, value: c.revenue / 100 })), format: (v) => formatMoney(v * 100) });
    else render($('#c1'), html`<p class="muted">Sem vendas no período.</p>`);
    csvRows = d.items.map((r) => ({ produto: r.name, pedidos: r.orders, unidades: r.units, descontos_mzn: r.discounts / 100, receita_mzn: r.revenue / 100, ...(fin ? { lucro_mzn: r.grossProfit === null ? '' : r.grossProfit / 100 } : {}) }));
    return d.range;
  },
  async orders(q) {
    const d = await api.get('/admin/reports/orders', { query: q });
    render(
      body,
      html`<div class="kpis">${kpi('Pedidos feitos', formatNumber(d.placed))}${kpi('Taxa de cancelamento', pct(d.cancellationRatePercent))}</div>
      ${panel('Pedidos confirmados', html`<div id="c1"></div>`)}
      <div class="grid-2">
        ${panel('Por estado', table([{ label: 'Estado', render: (r) => label(ORDER_STATUS, r.status) }, { label: 'Pedidos', num: 1, render: (r) => formatNumber(r.orders) }, { label: 'Valor', num: 1, render: (r) => formatMoney(r.amount) }], d.byStatus))}
        ${panel('Por pagamento', table([{ label: 'Pagamento', render: (r) => label(PAYMENT_STATUS, r.paymentStatus) }, { label: 'Pedidos', num: 1, render: (r) => formatNumber(r.orders) }], d.byPaymentStatus))}
      </div>
      ${panel('Por método de entrega', table([{ label: 'Método', render: (r) => r.method }, { label: 'Pedidos', num: 1, render: (r) => formatNumber(r.orders) }], d.byShipping))}`,
    );
    series($('#c1'), d.series, d.range, 'confirmed', { title: 'Pedidos confirmados', unit: ' pedidos' });
    csvRows = d.series.map((r) => ({ periodo: r.bucket.slice(0, 10), feitos: r.placed, confirmados: r.confirmed, cancelados: r.cancelled }));
    return d.range;
  },
  async customers(q) {
    const d = await api.get('/admin/reports/customers', { query: q });
    render(
      body,
      html`<div class="kpis">${kpi('Compradores', formatNumber(d.buyers))}${kpi('Voltaram a comprar', formatNumber(d.returningBuyers), d.buyers ? `${Math.round((d.returningBuyers / d.buyers) * 100)}% dos compradores` : '')}</div>
      ${panel('Novos registos', html`<div id="c1"></div>`)}
      ${panel('Melhores clientes', table([{ label: 'Cliente', render: (r) => html`<a href="customers.html?id=${r.userId}">${r.name}</a><br><small class="muted">${r.email}</small>` }, { label: 'Pedidos', num: 1, render: (r) => formatNumber(r.orders) }, { label: 'Última compra', render: (r) => formatDate(r.lastOrderAt) }, { label: 'Gasto', num: 1, render: (r) => formatMoney(r.spent) }], d.topCustomers))}`,
    );
    series($('#c1'), d.newCustomers, d.range, 'newCustomers', { title: 'Novos clientes', unit: ' clientes' });
    csvRows = d.topCustomers.map((r) => ({ cliente: r.name, email: r.email, pedidos: r.orders, gasto_mzn: r.spent / 100, ultima_compra: r.lastOrderAt }));
    return d.range;
  },
  async stock(q) {
    const d = await api.get('/admin/reports/stock', { query: q });
    const s = d.summary;
    render(
      body,
      html`<div class="kpis">${kpi('Unidades em stock', formatNumber(s.units), `${formatNumber(s.variants)} variantes · ${formatNumber(s.reserved)} reservadas`)}${kpi('Valor de venda', formatMoney(s.retailValue))}${s.costValue !== undefined && s.costValue !== null ? kpi('Valor de custo', formatMoney(s.costValue)) : ''}${kpi('Esgotados / baixos', `${formatNumber(s.outOfStock)} / ${formatNumber(s.lowStock)}`, html`<a href="inventory.html?lowStock=true">Ver stock baixo</a>`)}</div>
      ${panel('Movimentos no período', table([{ label: 'Tipo', render: (r) => MOVEMENT[r.type] ?? r.type }, { label: 'Movimentos', num: 1, render: (r) => formatNumber(r.movements) }, { label: 'Unidades', num: 1, render: (r) => `${r.units > 0 ? '+' : ''}${formatNumber(r.units)}` }], d.movements))}`,
    );
    csvRows = d.movements.map((r) => ({ tipo: MOVEMENT[r.type] ?? r.type, movimentos: r.movements, unidades: r.units }));
    return d.range;
  },
  async discounts(q) {
    const d = await api.get('/admin/reports/discounts', { query: q });
    render(
      body,
      html`<div class="kpis">${kpi('Descontos totais', formatMoney(d.totals.total))}${kpi('Promoções', formatMoney(d.totals.productDiscount))}${kpi('Cupões', formatMoney(d.totals.couponDiscount))}</div>
      ${panel('Descontos concedidos', html`<div id="c1"></div>`)}
      ${panel('Cupões usados', table([{ label: 'Cupão', render: (r) => html`<strong class="code">${r.code}</strong>` }, { label: 'Usos', num: 1, render: (r) => formatNumber(r.uses) }, { label: 'Vendas com o cupão', num: 1, render: (r) => formatMoney(r.ordersTotal) }, { label: 'Desconto', num: 1, render: (r) => formatMoney(r.discount) }], d.coupons))}`,
    );
    const rows = d.series.map((r) => ({ ...r, total: r.productDiscount + r.couponDiscount }));
    series($('#c1'), rows, d.range, 'total', { money: true, title: 'Descontos' });
    csvRows = d.series.map((r) => ({ periodo: r.bucket.slice(0, 10), pedidos: r.orders, pedidos_com_cupao: r.ordersWithCoupon, desconto_promocoes_mzn: r.productDiscount / 100, desconto_cupoes_mzn: r.couponDiscount / 100 }));
    return d.range;
  },
  async returns(q) {
    const d = await api.get('/admin/reports/returns', { query: q });
    render(
      body,
      html`<div class="kpis">${kpi('Taxa de devolução', pct(d.returnRatePercent), 'Devoluções ÷ pedidos entregues')}${kpi('Reembolsado', formatMoney(d.refunds.refunded), plural(d.refunds.refunds, 'reembolso', 'reembolsos'))}</div>
      <div class="grid-2">
        ${panel('Por motivo', table([{ label: 'Motivo', render: (r) => r.reason }, { label: 'Devoluções', num: 1, render: (r) => formatNumber(r.returns) }], d.byReason))}
        ${panel('Por estado', table([{ label: 'Estado', render: (r) => label(RETURN_STATUS, r.status) }, { label: 'Devoluções', num: 1, render: (r) => formatNumber(r.returns) }], d.byStatus))}
      </div>
      ${panel('Produtos mais devolvidos', table([{ label: 'Produto', render: (r) => r.name }, { label: 'Unidades', num: 1, render: (r) => formatNumber(r.units) }], d.topProducts))}`,
    );
    csvRows = d.byReason.map((r) => ({ motivo: r.reason, devolucoes: r.returns }));
    return d.range;
  },
  async revenue(q) {
    const d = await api.get('/admin/reports/revenue', { query: q });
    const s = d.summary;
    render(
      body,
      html`<div class="kpis">${kpi('Receita bruta', formatMoney(s.grossRevenue))}${kpi('Reembolsado', formatMoney(s.refunded), s.pendingRefunds ? `${formatMoney(s.pendingRefunds)} pendente` : '')}${kpi('Receita líquida', formatMoney(s.netRevenue))}${kpi('Margem bruta', pct(s.grossMarginPercent), s.grossMarginPercent === null ? 'Sem custos registados' : `Lucro ${formatMoney(s.grossProfit)}`)}</div>
      ${s.revenueWithoutCostData ? html`<p class="notice notice--warn" style="margin-bottom:16px">${formatMoney(s.revenueWithoutCostData)} de vendas são de produtos sem preço de custo; o lucro desses artigos não entra na margem.</p>` : ''}
      ${panel('Receita líquida', html`<div id="c1"></div>`)}
      ${panel('Detalhe', table([{ label: 'Período', render: (r) => bucketLabel(r.bucket, d.range.period) }, { label: 'Bruta', num: 1, render: (r) => formatMoney(r.gross) }, { label: 'Reembolsos', num: 1, render: (r) => formatMoney(r.refunded) }, { label: 'IVA', num: 1, render: (r) => formatMoney(r.tax) }, { label: 'Portes', num: 1, render: (r) => formatMoney(r.shipping) }, { label: 'Líquida', num: 1, render: (r) => formatMoney(r.net) }], d.series))}`,
    );
    series($('#c1'), d.series, d.range, 'net', { money: true, title: 'Receita líquida' });
    csvRows = d.series.map((r) => ({ periodo: r.bucket.slice(0, 10), bruta_mzn: r.gross / 100, reembolsos_mzn: r.refunded / 100, iva_mzn: r.tax / 100, portes_mzn: r.shipping / 100, custo_mzn: r.costOfGoods / 100, liquida_mzn: r.net / 100 }));
    return d.range;
  },
  async payments(q) {
    const d = await api.get('/admin/reports/payments', { query: q });
    render(
      body,
      html`<div class="kpis">${kpi('Taxa de sucesso', pct(d.successRatePercent), `${formatNumber(d.succeeded)} de ${formatNumber(d.total)} pagamentos`)}${kpi('Falhados', formatNumber(d.failed))}</div>
      ${panel('Valor recebido', html`<div id="c1"></div>`)}
      ${panel('Por método e estado', table([{ label: 'Método', render: (r) => html`${r.methodCode}<br><small class="muted">${r.provider}</small>` }, { label: 'Estado', render: (r) => label(PAYMENT_STATUS, r.status) }, { label: 'Pagamentos', num: 1, render: (r) => formatNumber(r.payments) }, { label: 'Valor', num: 1, render: (r) => formatMoney(r.amount) }, { label: 'Reembolsado', num: 1, render: (r) => formatMoney(r.refunded) }], d.byMethod))}`,
    );
    series($('#c1'), d.series, d.range, 'collected', { money: true, title: 'Valor recebido' });
    csvRows = d.byMethod.map((r) => ({ metodo: r.methodCode, provider: r.provider, estado: r.status, pagamentos: r.payments, valor_mzn: r.amount / 100, reembolsado_mzn: r.refunded / 100 }));
    return d.range;
  },
};

async function load() {
  $$('[data-tab]', main).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === state.tab)));
  setParams({ tab: state.tab, period: state.period, from: state.from || undefined, to: state.to || undefined }, { replace: true });
  csvRows = [];
  render(body, html`<div class="kpis">${Array.from({ length: 4 }, () => html`<div class="kpi"><span class="sk sk--line" style="margin:0 0 8px"></span><span class="sk sk--price" style="margin:0"></span></div>`)}</div>`);
  try {
    const range = await RENDER[state.tab](query());
    render($('#rep-range', main), range ? `De ${formatDate(range.from)} a ${formatDate(range.to)}. Vendas contam apenas pedidos confirmados.` : '');
  } catch (err) {
    showError(body, err, load);
  }
}

main.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) {
    state.tab = t.dataset.tab;
    load();
  }
  if (e.target.closest('#r-csv')) {
    if (!csvRows.length) return;
    downloadCsv(`relatorio-${state.tab}-${new Date().toISOString().slice(0, 10)}.csv`, csvRows);
  }
});
$('#rep-filters', main).addEventListener('change', (e) => {
  state[e.target.name] = e.target.value;
  load();
});

load();
