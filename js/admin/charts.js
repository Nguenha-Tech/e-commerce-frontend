import { html, render } from '../utils.js';

/**
 * Gráficos SVG sem dependências — uma série por gráfico (o título identifica-a, sem legenda),
 * eixos discretos, barras ≤ 24px com topo arredondado, linha de 2px com área a 10%,
 * tooltip ao passar o rato/foco e tabela de dados acessível.
 */
const COLOR = 'var(--cobalt)';

function niceStep(v) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

/** Ticks "redondos"; séries de inteiros (pedidos, unidades) nunca têm ticks fracionários. */
function scale(values) {
  const dataMax = Math.max(0, ...values);
  const integer = values.every((v) => Number.isInteger(v));
  let step = niceStep(dataMax / 4 || 1);
  if (integer) step = Math.max(1, Math.ceil(step));
  const max = Math.max(step, Math.ceil(dataMax / step) * step);
  const ticks = [];
  for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
  return { max, ticks };
}

function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1).replace('.0', '')} mM`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1).replace('.0', '')} M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1).replace('.0', '')} mil`;
  return String(Math.round(n));
}

/**
 * chart(el, { type: 'bar'|'line', data: [{ label, value }], format: (v) => string, axisFormat, height })
 */
export function chart(el, opts) {
  draw(el, opts);
  if (el._chartObserver) return;
  let lastW = el.clientWidth;
  let timer;
  el._chartObserver = new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - lastW) < 24) return;
    lastW = el.clientWidth;
    clearTimeout(timer);
    timer = setTimeout(() => draw(el, el._chartOpts), 120);
  });
  el._chartObserver.observe(el);
}

function draw(el, { type = 'bar', data, format = String, axisFormat = compact, height = 240, title = 'Dados' }) {
  el._chartOpts = { type, data, format, axisFormat, height, title };
  if (!data.length) {
    render(el, html`<p class="muted chart-empty">Sem dados neste período.</p>`);
    return;
  }
  // Largura real do contentor: o texto mantém 11px em qualquer largura de painel.
  const W = Math.max(300, Math.round(el.clientWidth || 640));
  const H = height;
  const pad = { t: 12, r: 12, b: 28, l: 56 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const { max, ticks } = scale(data.map((d) => d.value));
  const x = (i) => pad.l + (data.length === 1 ? iw / 2 : type === 'bar' ? (iw / data.length) * (i + 0.5) : (iw / (data.length - 1)) * i);
  const y = (v) => pad.t + ih - (v / max) * ih;
  const band = iw / data.length;
  const bw = Math.min(24, Math.max(4, band - 6));
  const every = Math.ceil(data.length / Math.max(3, Math.floor(iw / 70)));

  let marks = '';
  if (type === 'bar') {
    marks = data
      .map((d, i) => {
        const h = Math.max(0, pad.t + ih - y(d.value));
        const r = Math.min(4, h);
        const x0 = x(i) - bw / 2;
        const y0 = pad.t + ih - h;
        // topo arredondado (4px), base reta
        return `<path class="chart__mark" d="M${x0},${pad.t + ih} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${pad.t + ih} Z" fill="${COLOR}"/>`;
      })
      .join('');
  } else {
    const pts = data.map((d, i) => `${x(i)},${y(d.value)}`);
    marks = `<path d="M${pts[0]} L${pts.join(' L')} L${x(data.length - 1)},${pad.t + ih} L${x(0)},${pad.t + ih} Z" fill="${COLOR}" opacity="0.1"/>
      <polyline points="${pts.join(' ')}" fill="none" stroke="${COLOR}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle class="chart__end" cx="${x(data.length - 1)}" cy="${y(data.at(-1).value)}" r="4.5" fill="${COLOR}" stroke="var(--surface)" stroke-width="2"/>`;
  }

  const grid = ticks
    .map((tv) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(tv)}" y2="${y(tv)}" class="chart__grid"/><text x="${pad.l - 8}" y="${y(tv) + 4}" text-anchor="end" class="chart__tick">${axisFormat(tv)}</text>`)
    .join('');
  const labels = data
    .map((d, i) => (i % every === 0 || i === data.length - 1 ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="chart__tick">${String(d.label).replace(/</g, '&lt;')}</text>` : ''))
    .join('');
  // Alvos de hover maiores do que as marcas (toda a coluna).
  const hits = data
    .map((d, i) => `<rect class="chart__hit" x="${type === 'bar' ? x(i) - band / 2 : x(i) - (iw / Math.max(1, data.length - 1)) / 2}" y="${pad.t}" width="${type === 'bar' ? band : iw / Math.max(1, data.length - 1)}" height="${ih}" data-i="${i}" tabindex="0" aria-label="${String(d.label).replace(/"/g, '')}: ${format(d.value).replace(/"/g, '')}"/>`)
    .join('');

  el.innerHTML = `<figure class="chart">
    <div class="chart__plot"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${title.replace(/"/g, '')}">${grid}${marks}<line class="chart__cross" x1="0" x2="0" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>${labels}${hits}</svg>
    <div class="chart__tip" hidden></div></div>
    <details class="chart__table"><summary>Ver dados em tabela</summary><table class="table"><thead><tr><th scope="col">Período</th><th scope="col" class="num">Valor</th></tr></thead><tbody>${data.map((d) => `<tr><td>${String(d.label).replace(/</g, '&lt;')}</td><td class="num">${format(d.value)}</td></tr>`).join('')}</tbody></table></details>
  </figure>`;

  const plot = el.querySelector('.chart__plot');
  const tip = el.querySelector('.chart__tip');
  const cross = el.querySelector('.chart__cross');
  const showTip = (target) => {
    const i = Number(target.dataset.i);
    const d = data[i];
    tip.hidden = false;
    tip.innerHTML = `<strong>${format(d.value)}</strong><span>${String(d.label).replace(/</g, '&lt;')}</span>`;
    const rect = plot.getBoundingClientRect();
    const px = (x(i) / W) * rect.width;
    tip.style.left = `${Math.min(rect.width - 150, Math.max(0, px - 70))}px`;
    tip.style.top = `${Math.max(0, (y(d.value) / H) * rect.height - 56)}px`;
    if (type === 'line') {
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
    }
    el.querySelectorAll('.chart__mark').forEach((m, j) => m.classList.toggle('is-dim', j !== i));
  };
  const hide = () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
    el.querySelectorAll('.chart__mark').forEach((m) => m.classList.remove('is-dim'));
  };
  el.querySelectorAll('.chart__hit').forEach((h) => {
    h.addEventListener('mouseenter', () => showTip(h));
    h.addEventListener('focus', () => showTip(h));
    h.addEventListener('mouseleave', hide);
    h.addEventListener('blur', hide);
  });
}

/** Etiqueta de período (bucket ISO) para o eixo. */
export function bucketLabel(iso, period) {
  const d = new Date(iso);
  if (period === 'year') return String(d.getUTCFullYear());
  if (period === 'month') return d.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

/** Exporta linhas para CSV (download no browser). */
export function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.map(esc).join(';'), ...rows.map((r) => cols.map((c) => esc(typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])).join(';'))].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })), download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/**
 * Preenche períodos sem dados com zero (a API só devolve períodos com movimento),
 * para o eixo temporal não "saltar" dias/meses.
 */
export function fillBuckets(series, { period, from, to }, keys) {
  if (!['day', 'month'].includes(period)) return series;
  const byKey = new Map(series.map((s) => [new Date(s.bucket).toISOString().slice(0, period === 'day' ? 10 : 7), s]));
  const out = [];
  const cur = new Date(from);
  const end = new Date(to);
  cur.setUTCHours(0, 0, 0, 0);
  if (period === 'month') cur.setUTCDate(1);
  let guard = 0;
  while (cur <= end && guard++ < 400) {
    const k = cur.toISOString().slice(0, period === 'day' ? 10 : 7);
    out.push(byKey.get(k) ?? { bucket: cur.toISOString(), ...Object.fromEntries(keys.map((x) => [x, 0])) });
    if (period === 'day') cur.setUTCDate(cur.getUTCDate() + 1);
    else cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}
