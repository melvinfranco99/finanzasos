/* Panel de control, mercados, sentimiento y noticias */
'use strict';

const DASH_TILES = ['^GSPC', '^NDX', '^DJI', '^IBEX', '^GDAXI', '^STOXX50E', '^N225', 'EURUSD=X', 'DX-Y.NYB', 'GC=F', 'BZ=F', '^TNX', '^VIX', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const HEAT_SYMS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK-B', 'JPM', 'V', 'AVGO', 'LLY', 'XOM', 'WMT', 'SAN.MC', 'BBVA.MC', 'ITX.MC', 'IBE.MC', 'TEF.MC', 'REP.MC', 'ASML.AS', 'SAP.DE', 'MC.PA', 'NESN.SW'];

function tileHTML(q) {
  return `<div class="tile" data-s="${esc(q.symbol)}"><div class="n">${esc(q.name)}</div><div class="p">${fmtP(q.price)}</div>
    <div class="c ${cls(q.pct)}">${arrow(q.pct)} ${fmtP(q.change)} (${fmtPct(q.pct)})</div>${sparkline(q.spark)}</div>`;
}
function bindTiles(root) { $$('.tile, .heat div, tr.click', root).forEach(t => t.onclick = () => t.dataset.s && App.go('grafico', t.dataset.s)); }

function fgCard(title, d, extra = '') {
  if (!d) return `<div class="card"><h3>${title}</h3><div class="muted">No disponible</div></div>`;
  const hist = (k, l) => d[k] != null ? `<div class="kpi"><div class="k">${l}</div><div class="v" style="color:${fgColor(d[k])}">${Math.round(d[k])}</div></div>` : '';
  return `<div class="card"><h3>${title}${extra}</h3>${gauge(d.score, { label: d.rating })}
    <div class="kpis" style="grid-template-columns:repeat(4,1fr);margin-top:10px">${hist('prev_close', 'Cierre ant.')}${hist('week', 'Hace 1 sem')}${hist('month', 'Hace 1 mes')}${hist('year', 'Hace 1 año')}</div>
    ${d.components ? `<div class="bars" style="margin-top:10px">${d.components.map(c => `<div class="row"><span>${esc(c.name)}${c.value ? ` <span class="muted mono">${esc(c.value)}</span>` : ''}</span><div class="bar"><i style="width:${c.score}%;background:${fgColor(c.score)}"></i></div><b class="mono" style="color:${fgColor(c.score)};text-align:right">${Math.round(c.score)}</b></div>`).join('')}</div>` : ''}</div>`;
}

/* ================= PANEL ================= */
App.views.panel = async (main) => {
  main.innerHTML = `<div class="view-title"><h1>Panel de control</h1><span class="sub">Visión global de los mercados en tiempo real</span></div>
  <div class="tiles" id="tiles">${loading()}</div>
  <div class="grid g3" style="margin-top:12px">
    <div id="fg1">${loading()}</div><div id="fg2">${loading()}</div>
    <div class="card"><h3>Sesiones de mercado mundiales</h3><div id="sessbox"></div></div>
  </div>
  <div class="grid g2" style="margin-top:12px">
    <div class="card"><h3>Mapa de calor — grandes valores <span class="badge">variación diaria</span></h3><div class="heat" id="heat">${loading()}</div></div>
    <div class="card"><h3>Mayores movimientos</h3><div id="movers">${loading()}</div></div>
  </div>
  <div class="grid g2" style="margin-top:12px">
    <div class="card"><h3>Matriz de correlaciones (1 año, diaria)</h3><div id="corr">${loading()}</div></div>
    <div class="card"><h3>Titulares financieros</h3><div class="news scroll" id="news">${loading()}</div></div>
  </div>`;
  const loadTiles = async () => {
    const q = await api('/api/quotes?symbols=' + encodeURIComponent(DASH_TILES.join(',')));
    $('#tiles').innerHTML = q.map(tileHTML).join(''); bindTiles($('#tiles'));
  };
  const loadHeat = async () => {
    const q = await api('/api/quotes?symbols=' + encodeURIComponent(HEAT_SYMS.join(',')));
    $('#heat').innerHTML = q.map(x => `<div data-s="${esc(x.symbol)}" style="background:${heatColor(x.pct)}"><b>${esc(x.name)}</b><span>${fmtPct(x.pct)}</span><small class="mono" style="opacity:.75">${fmtP(x.price)} ${esc(x.currency || '')}</small></div>`).join('');
    const s = [...q].sort((a, b) => b.pct - a.pct);
    const rows = arr => arr.map(x => `<tr class="click" data-s="${esc(x.symbol)}"><td>${esc(x.name)}</td><td class="num">${fmtP(x.price)}</td><td class="num ${cls(x.pct)}">${fmtPct(x.pct)}</td><td>${sparkline(x.spark, 90, 24)}</td></tr>`).join('');
    $('#movers').innerHTML = `<div class="grid g2"><div><div class="badge up" style="margin-bottom:6px">▲ Más alcistas</div><table>${rows(s.slice(0, 7))}</table></div><div><div class="badge down" style="margin-bottom:6px">▼ Más bajistas</div><table>${rows(s.slice(-7).reverse())}</table></div></div>`;
    bindTiles($('#heat')); bindTiles($('#movers'));
  };
  const loadSess = () => { $('#sessbox').innerHTML = `<table>${sessions().map(s => `<tr><td><b>${s.code}</b></td><td>${s.name}</td><td class="mono muted">${s.hours}</td><td><span class="badge ${s.open ? 'up' : 'down'}">${s.open ? 'ABIERTO' : 'CERRADO'}</span></td></tr>`).join('')}</table><div class="note">Horario local de cada bolsa. No contempla festivos.</div>`; };
  loadSess(); loadTiles().catch(e => $('#tiles').innerHTML = `<div class="err">${esc(e.message)}</div>`); loadHeat().catch(() => {});
  api('/api/feargreed').then(fg => {
    $('#fg1').innerHTML = fgCard('Miedo y euforia — Bolsa USA', fg.cnn || fg.own, `<span class="badge">${fg.cnn ? 'CNN' : 'Cálculo propio'}</span>`);
    $('#fg2').innerHTML = fgCard('Miedo y euforia — Cripto', fg.crypto, '<span class="badge">alternative.me</span>');
  });
  api('/api/correlations').then(c => {
    const names = { '^GSPC': 'S&P', '^NDX': 'NDX', '^IBEX': 'IBEX', 'GC=F': 'Oro', 'CL=F': 'WTI', 'EURUSD=X': 'EURUSD', '^TNX': 'US10Y', 'BTC-USD': 'BTC' };
    $('#corr').innerHTML = `<table class="hm"><tr><th></th>${c.names.map(n => `<th style="text-align:center">${names[n] || n}</th>`).join('')}</tr>${c.matrix.map((r, i) => `<tr><th>${names[c.names[i]] || c.names[i]}</th>${r.map(v => `<td style="background:${heatColor(v * 3)}">${fmtN(v, 2)}</td>`).join('')}</tr>`).join('')}</table><div class="note">+1 = se mueven igual · 0 = sin relación · −1 = se mueven al contrario.</div>`;
  });
  api('/api/news').then(n => $('#news').innerHTML = n.slice(0, 40).map(x => `<a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}<br><small>${esc(x.source)} · ${esc(x.date.replace(/ \+0000| GMT/, ''))}</small></a>`).join('') || '<div class="muted">Sin conexión</div>');
  App.every(15000, () => { loadTiles().catch(() => {}); loadHeat().catch(() => {}); });
  App.every(30000, loadSess);
};

/* ================= MERCADOS ================= */
App.views.mercados = async (main) => {
  const lists = (App.watch || await api('/api/watchlists')).lists;
  let cur = App.state.market || Object.keys(lists)[0];
  main.innerHTML = `<div class="view-title"><h1>Mercados en vivo</h1><span class="sub">Todas las clases de activos a precio de mercado · actualización cada 10 s</span></div>
    <div class="tabs" id="mtabs">${Object.keys(lists).map(k => `<button data-k="${esc(k)}" class="${k === cur ? 'on' : ''}">${esc(k)}</button>`).join('')}</div>
    <div class="card"><div class="scroll" style="max-height:none" id="mtable">${loading()}</div></div>`;
  const prev = {};
  const load = async () => {
    const q = await api('/api/quotes?group=' + encodeURIComponent(cur));
    $('#mtable').innerHTML = `<table><tr><th>Símbolo</th><th>Nombre</th><th class="num">Precio</th><th class="num">Var.</th><th class="num">Var. %</th><th class="num">Máx. día</th><th class="num">Mín. día</th><th class="num">Volumen</th><th>Intradía</th><th>Fuente</th><th></th></tr>
    ${q.map(x => { const f = prev[x.symbol] != null && prev[x.symbol] !== x.price ? (x.price > prev[x.symbol] ? 'flash-up' : 'flash-down') : ''; prev[x.symbol] = x.price;
      return `<tr class="click ${f}" data-s="${esc(x.symbol)}"><td class="mono"><b>${esc(x.symbol)}</b></td><td>${esc(x.name)}</td><td class="num"><b>${fmtP(x.price)}</b> <span class="muted">${esc(x.currency || '')}</span></td><td class="num ${cls(x.change)}">${fmtP(x.change)}</td><td class="num"><span class="badge ${x.pct >= 0 ? 'up' : 'down'}">${arrow(x.pct)} ${fmtPct(x.pct)}</span></td><td class="num">${fmtP(x.high)}</td><td class="num">${fmtP(x.low)}</td><td class="num">${fmtBig(x.volume)}</td><td>${sparkline(x.spark, 110, 26)}</td><td><span class="badge">${x.source}</span></td><td><button class="btn" data-a="${esc(x.symbol)}">Analizar</button></td></tr>`; }).join('')}</table>`;
    bindTiles($('#mtable'));
    $$('button[data-a]', $('#mtable')).forEach(b => b.onclick = e => { e.stopPropagation(); App.go('analisis', b.dataset.a); });
  };
  $$('#mtabs button').forEach(b => b.onclick = () => { cur = App.state.market = b.dataset.k; App.saveState(); $$('#mtabs button').forEach(x => x.classList.toggle('on', x === b)); $('#mtable').innerHTML = loading(); load(); });
  load(); App.every(10000, () => load().catch(() => {}));
};

/* ================= SENTIMIENTO ================= */
App.views.sentimiento = async (main) => {
  main.innerHTML = `<div class="view-title"><h1>Medidores de miedo y euforia</h1><span class="sub">Psicología del mercado: cuando hay miedo extremo suele haber oportunidades; con euforia extrema, riesgo</span></div>
    <div class="grid g3" id="fgs">${loading()}</div>
    <div class="grid g2" style="margin-top:12px"><div class="card"><h3>Histórico — Bolsa USA (CNN, 1 año)</h3><div id="h1" style="height:260px"></div></div><div class="card"><h3>Histórico — Cripto (1 año)</h3><div id="h2" style="height:260px"></div></div></div>
    <div class="card" style="margin-top:12px"><h3>Sentimiento técnico por activo</h3><div class="grid g4" id="assets">${loading()}</div></div>
    <div class="card" style="margin-top:12px"><h3>Cómo se calcula</h3><div class="desc">El índice combina siete señales escaladas de 0 a 100 mediante su <b>percentil</b> respecto al último año y promedia el resultado:</div>
    <div class="formula"><i>FG</i> <span class="op">=</span> <span class="frac"><span>1</span><span>N</span></span><span class="big-op">Σ</span><sub><i>i</i>=1</sub><sup>N</sup> <i>Percentil</i><sub>252</sub>(<i>x<sub>i</sub></i>)</div>
    <div class="desc">Componentes: momento (precio vs media 125d), fuerza (máximos/mínimos de 52 semanas), amplitud, ratio put/call, volatilidad (VIX vs media 50d), demanda de refugio (acciones vs bonos) y demanda de bonos basura. 0–25 miedo extremo · 25–45 miedo · 45–55 neutral · 55–75 euforia · 75–100 euforia extrema.</div></div>`;
  const fg = await api('/api/feargreed');
  $('#fgs').innerHTML = fgCard('Bolsa USA (CNN)', fg.cnn) + fgCard('Cálculo propio FinanzasOS', fg.own, '<span class="badge gold">Yahoo</span>') + fgCard('Criptomonedas', fg.crypto);
  const hist = (id, data) => {
    if (!data) return;
    const ch = LightweightCharts.createChart($(id), chartTheme({ height: 260 }));
    const s = ch.addSeries(LightweightCharts.BaselineSeries, { baseValue: { type: 'price', price: 50 }, topLineColor: '#16c784', bottomLineColor: '#ea3943', topFillColor1: '#16c78455', topFillColor2: '#16c78405', bottomFillColor1: '#ea394305', bottomFillColor2: '#ea394355', priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    const seen = new Set(); s.setData(data.map(([t, v]) => ({ time: Math.floor(t / 86400) * 86400, value: v })).filter(p => !seen.has(p.time) && seen.add(p.time)));
    [25, 75].forEach(p => s.createPriceLine({ price: p, color: '#475569', lineStyle: 2, lineWidth: 1 }));
    ch.timeScale().fitContent(); App.onLeave(() => ch.remove());
  };
  hist('#h1', fg.cnn?.history); hist('#h2', fg.crypto?.history);
  const syms = ['^GSPC', '^NDX', '^IBEX', '^GDAXI', 'GC=F', 'CL=F', 'EURUSD=X', 'BTCUSDT'];
  $('#assets').innerHTML = syms.map(s => `<div id="as-${btoa(s).replace(/=/g, '')}">${loading()}</div>`).join('');
  syms.forEach(s => api(`/api/summary?symbol=${encodeURIComponent(s)}&tf=1d`).then(r => {
    $('#as-' + btoa(s).replace(/=/g, '')).innerHTML = `<div style="text-align:center;cursor:pointer" onclick="App.go('analisis','${s}')"><b>${esc(App.watch ? (Object.values(App.watch.lists).flat().find(x => x[0] === s) || [s, s])[1] : s)}</b>${gauge(r.sentiment.score, { label: r.sentiment.rating })}</div>`;
  }).catch(() => {}));
};

/* ================= NOTICIAS ================= */
App.views.noticias = async (main) => {
  main.innerHTML = `<div class="view-title"><h1>Noticias financieras</h1><span class="sub">Titulares en tiempo real de varias fuentes</span></div><div class="card"><div class="news" id="nn">${loading()}</div></div>`;
  const load = async () => {
    const n = await api('/api/news');
    $('#nn').innerHTML = n.map(x => `<a href="${esc(x.link)}" target="_blank" rel="noopener"><span class="badge gold">${esc(x.source)}</span> ${esc(x.title)}<br><small>${esc(x.date)}</small></a>`).join('') || '<div class="muted">Sin conexión a Internet</div>';
  };
  load(); App.every(120000, load);
};

/* Fechas del eje temporal: siempre día + mes (+ año u hora según el zoom), en hora local */
const _MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const _DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
function _tdate(t) { return typeof t === 'number' ? new Date(t * 1000) : typeof t === 'string' ? new Date(t + 'T00:00:00') : new Date(t.year, t.month - 1, t.day); }
const _p2 = n => String(n).padStart(2, '0');
function tickFmt(t, type) {
  const d = _tdate(t), dm = `${d.getDate()} ${_MES[d.getMonth()]}`, hm = `${_p2(d.getHours())}:${_p2(d.getMinutes())}`;
  if (type === 0) return String(d.getFullYear());                          // año
  if (type === 1) return `${_MES[d.getMonth()]} ${d.getFullYear()}`;       // mes
  if (type === 2) return dm;                                               // día
  return `${dm} ${hm}`;                                                    // hora
}
function crossFmt(t, withTime = false) {
  const d = _tdate(t), base = `${_DIA[d.getDay()]} ${d.getDate()} ${_MES[d.getMonth()]} ${d.getFullYear()}`;
  return withTime ? `${base}  ${_p2(d.getHours())}:${_p2(d.getMinutes())}` : base;
}

function chartTheme(extra = {}) {
  return Object.assign({
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#9fb0c6', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, panes: { separatorColor: '#1d2a3d', separatorHoverColor: '#f5b70044', enableResize: true }, attributionLogo: false },
    grid: { vertLines: { color: '#111b2a' }, horzLines: { color: '#111b2a' } },
    rightPriceScale: { borderColor: '#1d2a3d' }, timeScale: { borderColor: '#1d2a3d', timeVisible: true, secondsVisible: false, tickMarkFormatter: tickFmt, tickMarkMaxCharacterLength: 12, minimumHeight: 26 },
    crosshair: { mode: 0, vertLine: { color: '#f5b70088', labelBackgroundColor: '#5a4507' }, horzLine: { color: '#f5b70088', labelBackgroundColor: '#5a4507' } },
    localization: { locale: 'es-ES', timeFormatter: t => crossFmt(t) },
    autoSize: true,
  }, extra);
}
