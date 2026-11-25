import { api } from '../api.js';
import { hasPermission } from '../auth.js';
import { showError } from '../ui.js';
import { $, formatMoney, formatNumber, html, render } from '../utils.js';
import { bucketLabel, chart, fillBuckets } from './charts.js';
import { initAdmin } from './layout.js';

const main = await initAdmin({ title: 'Dashboard', permission: 'dashboard:read' });

const kpi = (label, value, sub, href, tone = '') =>
  href
    ? html`<a class="kpi ${tone}" href="${href}"><span class="kpi__label">${label}</span><span class="kpi__value">${value}</span>${sub ? html`<span class="kpi__sub">${sub}</span>` : ''}</a>`
    : html`<div class="kpi ${tone}"><span class="kpi__label">${label}</span><span class="kpi__value">${value}</span>${sub ? html`<span class="kpi__sub">${sub}</span>` : ''}</div>`;

async function load() {
  render(main, html`<div class="kpis">${Array.from({ length: 8 }, () => html`<div class="kpi"><span class="sk sk--line" style="margin:0 0 8px"></span><span class="sk sk--price" style="margin:0"></span></div>`)}</div>`);
  try {
    const canReports = hasPermission('reports:read');
    const [d, sales, ordersRep, customersRep] = await Promise.all([
      api.get('/admin/dashboard'),
      canReports ? api.get('/admin/reports/sales', { query: { period: 'day' } }) : null,
      canReports ? api.get('/admin/reports/orders', { query: { period: 'month' } }) : null,
      canReports && hasPermission('customers:read') ? api.get('/admin/reports/customers', { query: { period: 'month' } }) : null,
    ]);
    const c = d.currency;
    const f = d.financial;
    render(
      main,
      html`<div class="adm-head"><p>Valores em ${c}, fuso ${d.timezone}. Vendas = pedidos confirmados (exclui pendentes e cancelados).</p></div>
      <div class="kpis">
        ${kpi('Vendas totais', formatMoney(d.sales.total, c), `${formatNumber(d.orders.total)} pedidos`)}
        ${kpi('Vendas de hoje', formatMoney(d.sales.today, c), `${formatNumber(d.orders.today)} pedidos`)}
        ${kpi('Vendas do mês', formatMoney(d.sales.month, c), `Descontos: ${formatMoney(d.sales.discountsMonth, c)}`)}
        ${kpi('Clientes', formatNumber(d.customers.total), `+${formatNumber(d.customers.newThisMonth)} este mês`, hasPermission('customers:read') ? 'customers.html' : null)}
        ${kpi('Pedidos pendentes', formatNumber(d.orders.pending), 'A aguardar pagamento', 'orders.html?status=PENDING', d.orders.pending ? 'kpi--warn' : '')}
        ${kpi('Por preparar', formatNumber(d.orders.toFulfill), 'Confirmados / em preparação', 'orders.html?status=CONFIRMED')}
        ${kpi('Enviados', formatNumber(d.orders.shipped), `${formatNumber(d.orders.deliveredMonth)} entregues este mês`, 'orders.html?status=SHIPPED')}
        ${kpi('Produtos vendidos', formatNumber(d.productsSold.unitsTotal), `${formatNumber(d.productsSold.unitsMonth)} este mês`)}
      </div>
      ${d.orders.requiresAttention || d.orders.returnRequested
        ? html`<div class="notice notice--warn" style="margin-bottom:16px"><span>${d.orders.requiresAttention ? html`<a href="orders.html?requiresAttention=true">${d.orders.requiresAttention} pedido(s) precisam de atenção</a>. ` : ''}${d.orders.returnRequested ? html`<a href="returns.html">${d.orders.returnRequested} devolução(ões) por analisar</a>.` : ''}</span></div>`
        : ''}
      ${f
        ? html`<section class="panel" style="margin-bottom:16px"><h2 class="panel__title">Financeiro (últimos 31 dias)</h2><div class="kpis" style="margin:0">
            ${kpi('Receita bruta', formatMoney(f.grossRevenue, c))}
            ${kpi('Reembolsado', formatMoney(f.refunded, c), f.pendingRefunds ? `${formatMoney(f.pendingRefunds, c)} pendente` : '')}
            ${kpi('Receita líquida', formatMoney(f.netRevenue, c))}
            ${kpi('Margem bruta', f.grossMarginPercent === null ? '—' : `${f.grossMarginPercent}%`, f.grossMarginPercent === null ? 'Sem custos registados nos produtos' : `Lucro ${formatMoney(f.grossProfit, c)}`)}
          </div></section>`
        : ''}
      <div class="grid-2 grid-2--wide">
        <section class="panel"><h2 class="panel__title">Vendas por dia (${c}, últimos 30 dias)</h2><div id="ch-sales"></div></section>
        <section class="panel"><h2 class="panel__title">Stock baixo</h2>
          ${d.lowStock.items.length
            ? html`<ul class="rank">${d.lowStock.items.map((i) => html`<li><span>${i.name}<small>${i.sku} · mínimo ${i.minStock}</small></span><span class="${i.available <= 0 ? 'badge badge--bad' : 'badge badge--warn'}">${i.available} disp.</span></li>`)}</ul>
              <p style="margin-top:12px"><a href="inventory.html?lowStock=true">Ver todos (${d.lowStock.count})</a></p>`
            : html`<p class="muted">Sem produtos abaixo do stock mínimo.</p>`}
        </section>
      </div>
      <div class="grid-2" style="margin-top:16px">
        <section class="panel"><h2 class="panel__title">Pedidos por mês</h2><div id="ch-orders"></div></section>
        <section class="panel"><h2 class="panel__title">Produtos vendidos por dia (unidades)</h2><div id="ch-units"></div></section>
      </div>
      <div class="grid-2" style="margin-top:16px">
        <section class="panel"><h2 class="panel__title">Mais vendidos (31 dias)</h2>${d.topProducts.length ? html`<ul class="rank">${d.topProducts.map((p) => html`<li><span>${p.name}<small>${p.units} unidades</small></span><span>${formatMoney(p.revenue, c)}</span></li>`)}</ul>` : html`<p class="muted">Sem vendas no período.</p>`}</section>
        <section class="panel"><h2 class="panel__title">Categorias mais vendidas</h2>${d.topCategories.length ? html`<ul class="rank">${d.topCategories.map((p) => html`<li><span>${p.name}<small>${p.units} unidades</small></span><span>${formatMoney(p.revenue, c)}</span></li>`)}</ul>` : html`<p class="muted">Sem vendas no período.</p>`}</section>
      </div>
      ${customersRep ? html`<section class="panel" style="margin-top:16px"><h2 class="panel__title">Novos clientes por mês</h2><div id="ch-customers"></div></section>` : ''}`,
    );
    if (sales) {
      sales.series = fillBuckets(sales.series, sales.range, ['total', 'units']);
      chart($('#ch-sales'), { type: 'bar', title: 'Vendas por dia', data: sales.series.map((s) => ({ label: bucketLabel(s.bucket, 'day'), value: s.total / 100 })), format: (v) => formatMoney(v * 100, c) });
      chart($('#ch-units'), { type: 'line', title: 'Unidades vendidas por dia', data: sales.series.map((s) => ({ label: bucketLabel(s.bucket, 'day'), value: s.units })), format: (v) => `${formatNumber(v)} un.` });
    } else ['#ch-sales', '#ch-units'].forEach((s) => render($(s), html`<p class="muted">Requer permissão de relatórios.</p>`));
    if (ordersRep) ordersRep.series = fillBuckets(ordersRep.series, ordersRep.range, ['placed', 'cancelled', 'confirmed']).slice(-12);
    if (customersRep) customersRep.newCustomers = fillBuckets(customersRep.newCustomers, customersRep.range, ['newCustomers']).slice(-12);
    if (ordersRep) chart($('#ch-orders'), { type: 'bar', title: 'Pedidos por mês', data: ordersRep.series.map((s) => ({ label: bucketLabel(s.bucket, 'month'), value: s.confirmed })), format: (v) => `${formatNumber(v)} pedidos confirmados` });
    else render($('#ch-orders'), html`<p class="muted">Requer permissão de relatórios.</p>`);
    if (customersRep) chart($('#ch-customers'), { type: 'line', title: 'Novos clientes', data: customersRep.newCustomers.map((s) => ({ label: bucketLabel(s.bucket, 'month'), value: s.newCustomers })), format: (v) => `${formatNumber(v)} clientes` });
  } catch (err) {
    showError(main, err, load);
  }
}
load();
