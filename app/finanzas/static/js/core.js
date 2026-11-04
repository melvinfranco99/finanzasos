/* FinanzasOS — núcleo: API, formato, router, utilidades SVG */
'use strict';
const App = {
  views: {}, timers: [], state: { symbol: '^GSPC', tf: '1d' }, cleanup: [],
  start() {
    this.loadState();
    window.addEventListener('hashchange', () => this.route());
    symPicker(document.getElementById('q'), s => { this.go(location.hash.startsWith('#/analisis') ? 'analisis' : 'grafico', s); document.getElementById('q').value = ''; }, { persistent: true });
    api('/api/watchlists').then(w => { this.watch = w; });
    this.clock(); setInterval(() => this.clock(), 1000);
    this.tape(); setInterval(() => this.tape(), 20000);
    this.route();
  },
  loadState() { try { Object.assign(this.state, JSON.parse(localStorage.getItem('fos.state') || '{}')); } catch (e) {} },
  saveState() { try { localStorage.setItem('fos.state', JSON.stringify(this.state)); } catch (e) {} },
  go(view, symbol) { if (symbol) { this.state.symbol = symbol; this.saveState(); } location.hash = '#/' + view + (symbol ? '/' + encodeURIComponent(symbol) : ''); },
  route() {
    const [, view = 'panel', sym] = location.hash.split('/');
    if (sym) { this.state.symbol = decodeURIComponent(sym); this.saveState(); }
    this.timers.forEach(clearInterval); this.timers = [];
    this.cleanup.forEach(f => { try { f(); } catch (e) {} }); this.cleanup = [];
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.v === view));
    const nav = document.querySelector(`#nav a[data-v="${view}"]`);
    document.title = 'FinanzasOS · ' + (nav ? nav.textContent.trim() : 'Panel de control');
    const main = document.getElementById('main');
    main.innerHTML = ''; main.scrollTop = 0;
    (this.views[view] || this.views.panel)(main);
  },
  every(ms, fn) { this.timers.push(setInterval(fn, ms)); },
  onLeave(fn) { this.cleanup.push(fn); },
  clock() {
    const d = new Date();
    document.getElementById('clock').textContent = d.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES');
    if (d.getSeconds() % 30 === 0 || !this._sess) { this._sess = 1; document.getElementById('sessions').innerHTML = sessions().map(s => `<span class="sess ${s.open ? 'open' : 'closed'}" title="${s.name}: ${s.hours} (hora local del mercado)">${s.code}</span>`).join(''); }
  },
  async tape() {
    try {
      const r = await api('/api/ticker');
      const live = r.quotes.some(q => q.source !== 'demo');
      const st = document.getElementById('status'); st.className = live ? 'live' : 'demo'; st.title = live ? 'Datos en tiempo real' : 'Sin conexión: datos de demostración';
      const html = r.quotes.map(q => `<span class="tq"><b>${esc(q.name)}</b>${fmtP(q.price)}<span class="${cls(q.pct)}">${arrow(q.pct)} ${fmtPct(q.pct)}</span></span>`).join('');
      document.getElementById('tapetrack').innerHTML = html + html;
    } catch (e) {}
  },
};

/* ---------- API ---------- */
async function api(url, body) {
  const opt = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
  const r = await fetch(url, opt);
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || r.statusText);
  return j;
}

/* ---------- Formato ---------- */
const NF = {};
function nf(d) { return NF[d] || (NF[d] = new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })); }
function fmtP(x) { if (x == null || isNaN(x)) return '—'; const a = Math.abs(x); return nf(a >= 1000 ? 2 : a >= 10 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8).format(x); }
function fmtN(x, d = 2) { return x == null || isNaN(x) ? '—' : nf(d).format(x); }
function fmtPct(x, d = 2) { return x == null || isNaN(x) ? '—' : (x > 0 ? '+' : '') + nf(d).format(x) + ' %'; }
function fmtR(x, d = 2) { return x == null || isNaN(x) ? '—' : fmtPct(x * 100, d); }
function fmtBig(x) { if (x == null || isNaN(x)) return '—'; const a = Math.abs(x); return a >= 1e12 ? fmtN(x / 1e12) + ' B' : a >= 1e9 ? fmtN(x / 1e9) + ' mM' : a >= 1e6 ? fmtN(x / 1e6) + ' M' : a >= 1e3 ? fmtN(x / 1e3, 1) + ' k' : fmtN(x, 0); }
function fmtEur(x) { return x == null || isNaN(x) ? '—' : nf(2).format(x) + ' €'; }
function fmtDate(t, time) { const d = new Date(t * 1000); return time ? d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('es-ES'); }
function isIntraday(tf) { return ['1m', '5m', '15m', '30m', '1h', '4h'].includes(tf); }
function cls(x) { return x > 0 ? 'up' : x < 0 ? 'down' : 'muted'; }
function arrow(x) { return x > 0 ? '▲' : x < 0 ? '▼' : '■'; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }
function loading(msg = 'Cargando datos…') { return `<div class="loading">${msg}</div>`; }

/* ---------- Colores ---------- */
function heatColor(p, scale = 3) {
  const v = Math.max(-1, Math.min(1, (p || 0) / scale));
  if (v >= 0) return `rgb(${Math.round(20 - 8 * v)},${Math.round(40 + 120 * v)},${Math.round(36 + 70 * v)})`;
  return `rgb(${Math.round(40 + 160 * -v)},${Math.round(30 - 6 * -v)},${Math.round(40 - 6 * -v)})`;
}
function fgColor(s) { return s < 25 ? '#ea3943' : s < 45 ? '#f97316' : s <= 55 ? '#eab308' : s <= 75 ? '#84cc16' : '#16c784'; }

/* ---------- SVG ---------- */
function sparkline(vals, w = 74, h = 30, color) {
  vals = (vals || []).filter(v => v != null);
  if (vals.length < 2) return '';
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`);
  const c = color || (vals[vals.length - 1] >= vals[0] ? '#16c784' : '#ea3943');
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs><polygon points="0,${h} ${pts.join(' ')} ${w},${h}" fill="url(#${id})"/><polyline points="${pts.join(' ')}" fill="none" stroke="${c}" stroke-width="1.5"/></svg>`;
}

/* Medidor semicircular: value 0..100 (o -1..1 con mode='signal') */
function gauge(value, opts = {}) {
  const { label = '', sub = '', mode = 'fg' } = opts;
  const v = mode === 'signal' ? (value + 1) * 50 : value;
  const W = 260, H = 160, cx = 130, cy = 135, R = 105;
  const segs = mode === 'signal'
    ? [['#ea3943', 'Venta fuerte'], ['#f97316', 'Venta'], ['#64748b', 'Neutral'], ['#84cc16', 'Compra'], ['#16c784', 'Compra fuerte']]
    : [['#ea3943', 'Miedo ext.'], ['#f97316', 'Miedo'], ['#eab308', 'Neutral'], ['#84cc16', 'Euforia'], ['#16c784', 'Euforia ext.']];
  const bounds = mode === 'signal' ? [0, 20, 45, 55, 80, 100] : [0, 25, 45, 55, 75, 100];
  const pt = (pct, r) => { const a = Math.PI * (1 - pct / 100); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  let arcs = '';
  segs.forEach(([c], i) => {
    const [x1, y1] = pt(bounds[i] + 0.6, R), [x2, y2] = pt(bounds[i + 1] - 0.6, R);
    arcs += `<path d="M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}" stroke="${c}" stroke-width="18" fill="none" opacity=".9"/>`;
  });
  let ticks = '';
  for (let p = 0; p <= 100; p += 10) { const [a, b] = pt(p, R - 14), [c2, d] = pt(p, R - 20); ticks += `<line x1="${a}" y1="${b}" x2="${c2}" y2="${d}" stroke="#334155" stroke-width="1.5"/>`; }
  const [nx, ny] = pt(Math.max(0, Math.min(100, v)), R - 22);
  const col = mode === 'signal' ? segs[Math.max(0, bounds.slice(1).findIndex(b => v <= b))][0] : fgColor(v);
  const txt = mode === 'signal' ? '' : `<text x="${cx}" y="${cy - 30}" text-anchor="middle" font-size="34" font-weight="800" fill="${col}" font-family="var(--mono)">${Math.round(v)}</text>`;
  return `<div class="gauge"><svg viewBox="0 0 ${W} ${H}">${arcs}${ticks}
    <text x="18" y="${H - 4}" fill="#64748b" font-size="10">${segs[0][1]}</text><text x="${W - 18}" y="${H - 4}" fill="#64748b" font-size="10" text-anchor="end">${segs[4][1]}</text>
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#e6edf6" stroke-width="3.5" stroke-linecap="round" style="filter:drop-shadow(0 0 4px ${col})"/>
    <circle cx="${cx}" cy="${cy}" r="8" fill="#0f1622" stroke="#e6edf6" stroke-width="3"/>${txt}</svg>
    <div class="lbl" style="color:${col}">${esc(label)}</div>${sub ? `<div class="muted" style="font-size:11.5px">${sub}</div>` : ''}</div>`;
}

/* Gráfico XY genérico en SVG: series=[{data:[[x,y]], color, type:'line'|'area'|'bar', name}] */
function svgChart(series, opts = {}) {
  const W = opts.w || 640, H = opts.h || 240, P = { l: 58, r: 14, t: 12, b: 26 };
  const all = series.flatMap(s => s.data.filter(p => p[1] != null));
  if (!all.length) return '<div class="muted">Sin datos</div>';
  let xmin = Math.min(...all.map(p => p[0])), xmax = Math.max(...all.map(p => p[0]));
  let ymin = Math.min(opts.y0 ?? Infinity, ...all.map(p => p[1])), ymax = Math.max(...all.map(p => p[1]));
  if (ymin === ymax) { ymin -= 1; ymax += 1; }
  const pad = (ymax - ymin) * 0.06; ymax += pad; if (!(opts.y0 === 0 && ymin >= 0)) ymin -= pad;
  const bars = series.some(s => s.type === 'bar');
  if (bars) { const n = Math.max(...series.map(s => s.data.length)); const st = (xmax - xmin) / Math.max(1, n - 1); xmin -= st / 2; xmax += st / 2; }
  const X = x => P.l + (x - xmin) / ((xmax - xmin) || 1) * (W - P.l - P.r), Y = y => H - P.b - (y - ymin) / (ymax - ymin) * (H - P.t - P.b);
  let g = '<g class="grid">';
  for (let i = 0; i <= 4; i++) { const y = ymin + (ymax - ymin) * i / 4; g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(y)}" y2="${Y(y)}"/><text x="${P.l - 6}" y="${Y(y) + 3}" text-anchor="end">${(opts.yfmt || fmtBig)(y)}</text>`; }
  const xs = opts.xticks || 6;
  for (let i = 0; i <= xs; i++) { const x = xmin + (xmax - xmin) * i / xs; g += `<text x="${X(x)}" y="${H - 8}" text-anchor="middle">${(opts.xfmt || (v => fmtN(v, 0)))(x)}</text>`; }
  g += '</g>';
  if (ymin < 0 && ymax > 0) g += `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(0)}" y2="${Y(0)}" stroke="#475569" stroke-dasharray="3 3"/>`;
  let body = '';
  series.forEach((s, si) => {
    const d = s.data.filter(p => p[1] != null);
    if (s.type === 'bar') {
      const n = series.filter(z => z.type === 'bar').length, k = series.filter(z => z.type === 'bar').indexOf(s);
      const bw = Math.max(1, (W - P.l - P.r) / (s.data.length + 1) * 0.8 / n);
      d.forEach(([x, y]) => { const c = typeof s.color === 'function' ? s.color(y, x) : s.color; body += `<rect x="${X(x) - bw * n / 2 + k * bw}" y="${Math.min(Y(y), Y(Math.max(0, ymin)))}" width="${bw}" height="${Math.abs(Y(y) - Y(Math.max(0, ymin)))}" fill="${c}" rx="1.5"/>`; });
    } else {
      const pts = d.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
      if (s.type === 'area') { const id = 'a' + si + Math.random().toString(36).slice(2, 6); body += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".35"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient></defs><polygon points="${X(d[0][0])},${Y(Math.max(ymin, 0))} ${pts} ${X(d[d.length - 1][0])},${Y(Math.max(ymin, 0))}" fill="url(#${id})"/>`; }
      body += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" ${s.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    }
  });
  const leg = series.filter(s => s.name).map(s => `<span class="chip"><i style="background:${typeof s.color === 'string' ? s.color : '#94a3b8'}"></i>${esc(s.name)}</span>`).join('');
  return `<svg class="svgchart" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${g}${body}</svg>${leg ? `<div class="chips" style="margin-top:4px">${leg}</div>` : ''}`;
}

/* ---------- Sesiones de mercado ---------- */
function sessions() {
  const now = new Date();
  const M = [
    ['NYSE', 'Nueva York', 'America/New_York', 930, 1600], ['LSE', 'Londres', 'Europe/London', 800, 1630],
    ['BME', 'Madrid', 'Europe/Madrid', 900, 1730], ['XETRA', 'Fráncfort', 'Europe/Berlin', 900, 1730],
    ['TSE', 'Tokio', 'Asia/Tokyo', 900, 1530], ['HKEX', 'Hong Kong', 'Asia/Hong_Kong', 930, 1600],
  ];
  const out = M.map(([code, name, tz, o, c]) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
    const hm = (+p.hour % 24) * 100 + +p.minute, wd = p.weekday;
    return { code, name, open: !['Sat', 'Sun'].includes(wd) && hm >= o && hm < c, hours: `${String(o).padStart(4, '0').replace(/(..)$/, ':$1')}–${String(c).replace(/(..)$/, ':$1')}` };
  });
  const ny = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, weekday: 'short', hour: '2-digit' }).formatToParts(now).map(x => [x.type, x.value]));
  const fxOpen = !(ny.weekday === 'Sat' || (ny.weekday === 'Sun' && +ny.hour < 17) || (ny.weekday === 'Fri' && +ny.hour >= 17));
  out.push({ code: 'FOREX', name: 'Forex', open: fxOpen, hours: 'Dom 17:00 – Vie 17:00 NY' });
  out.push({ code: 'CRYPTO', name: 'Cripto', open: true, hours: '24/7' });
  return out;
}

/* ---------- Formulario de símbolo reutilizable ---------- */
function symbolBar(onChange, opts = {}) {
  const tfs = opts.tfs || ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1wk', '1mo'];
  const lab = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1D', '1wk': '1S', '1mo': '1M' };
  const bar = el(`<div class="toolbar"><input class="sym" value="${esc(App.state.symbol)}" placeholder="Buscar activo…" style="width:200px;font-weight:700">
    <div class="seg tf">${tfs.map(t => `<button data-tf="${t}" class="${t === App.state.tf ? 'on' : ''}">${lab[t]}</button>`).join('')}</div></div>`);
  symPicker($('.sym', bar), sym => { App.state.symbol = sym; $('.sym', bar).value = sym; App.saveState(); onChange(); });
  $$('.tf button', bar).forEach(b => b.onclick = () => { App.state.tf = b.dataset.tf; App.saveState(); $$('.tf button', bar).forEach(x => x.classList.toggle('on', x === b)); onChange(); });
  return bar;
}

/* ---------- Buscador universal de activos (Yahoo Finance + todos los pares de Binance) ---------- */
function symPicker(input, onPick, opts = {}) {
  input.setAttribute('autocomplete', 'off'); input.removeAttribute('list');
  const box = document.createElement('div'); box.className = 'picker'; box.hidden = true; document.body.appendChild(box);
  let items = [], sel = -1, timer = null, seq = 0;
  const place = () => { const r = input.getBoundingClientRect(); box.style.left = Math.min(r.left, innerWidth - 470) + 'px'; box.style.top = (r.bottom + 4) + 'px'; box.style.minWidth = Math.max(r.width, 380) + 'px'; };
  const close = () => { box.hidden = true; sel = -1; };
  const pick = sym => { close(); sym = String(sym || '').trim().toUpperCase(); if (sym) onPick(sym); };
  const paint = () => {
    box.innerHTML = items.length ? items.map((x, i) => `<div class="pi ${i === sel ? 'on' : ''}" data-i="${i}"><b>${esc(x.symbol)}</b><span class="pn">${esc(x.name)}</span><span class="pt ${x.source === 'binance' ? 'bn' : ''}">${esc(x.type)}</span><span class="pe">${esc(x.exch)}</span></div>`).join('')
      : `<div class="pempty">Sin resultados. Pulsa Enter para usar «${esc(input.value.trim().toUpperCase())}» tal cual.</div>`;
    place(); box.hidden = false;
  };
  const search = async () => {
    const q = input.value.trim(); if (q.length < 1) { close(); return; }
    const my = ++seq; box.innerHTML = '<div class="pempty">Buscando en Yahoo Finance y Binance…</div>'; place(); box.hidden = false;
    try { const r = await api('/api/search?q=' + encodeURIComponent(q)); if (my !== seq) return; items = r.results; sel = items.length ? 0 : -1; paint(); } catch (e) { items = []; paint(); }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 200); });
  input.addEventListener('focus', () => { if (opts.selectOnFocus !== false) input.select(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (box.hidden || !items.length) return; e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); pick(!box.hidden && sel >= 0 && items[sel] ? items[sel].symbol : input.value); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 180));
  box.addEventListener('mousedown', e => { const d = e.target.closest('.pi'); if (d) { e.preventDefault(); pick(items[+d.dataset.i].symbol); } });
  window.addEventListener('resize', () => !box.hidden && place());
  if (!opts.persistent) App.cleanup.push(() => box.remove());
  return { close };
}
